'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { HooksHandler } = require('./hooks-handler');
const { BotRuntime } = require('./bot-runtime');

const ATTACHMENTS_DIR = () => path.join(os.homedir(), '.claude-history', 'attachments');

/**
 * Delete attachment files older than maxAgeDays. Called once at startup so the
 * attachments dir doesn't grow unbounded. Best-effort: never throws. Relocated
 * from the old bridge.js; the BotManager owns it now (design §5.1).
 */
function cleanOldAttachments(maxAgeDays = 7) {
  const root = ATTACHMENTS_DIR();
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return; }
  const cutoff = Date.now() - maxAgeDays * 86400000;
  for (const ent of entries) {
    const p = path.join(root, ent.name);
    try {
      if (ent.isDirectory()) {
        for (const f of fs.readdirSync(p, { withFileTypes: true })) {
          const fp = path.join(p, f.name);
          try { if (fs.statSync(fp).mtimeMs < cutoff) fs.unlinkSync(fp); } catch {}
        }
        try { if (fs.readdirSync(p).length === 0) fs.rmdirSync(p); } catch {}
      } else if (fs.statSync(p).mtimeMs < cutoff) {
        fs.unlinkSync(p);
      }
    } catch {}
  }
}

/**
 * Owns the bot runtime map and the single shared HooksHandler. CRUD methods
 * mutate the store then sync the in-memory runtimes; toggleBot starts/stops a
 * runtime without removing it (design §5.1). Only BotManager may start/stop the
 * shared hooksHandler.
 */
class BotManager {
  constructor(store, mainWindow) {
    this.store = store;
    this.mainWindow = mainWindow;
    /** @type {Map<number, BotRuntime>} */
    this.runtimes = new Map();
    this.hooksHandler = new HooksHandler(this);
    this._hooksStarted = false;
  }

  /** Boot all enabled bots + the shared hooks HTTP server. Idempotent. */
  async loadAll() {
    try { cleanOldAttachments(); } catch (e) { console.warn('[feishu] attachment cleanup failed:', e.message); }
    await this._ensureHooks();
    const bots = this.store.listBots();
    for (const bot of bots) {
      if (bot.enabled) {
        await this._startRuntime(bot).catch((err) => {
          console.error(`[feishu] bot ${bot.id} (${bot.name}) failed to start:`, err.message);
        });
      }
    }
    this.broadcastStatus();
  }

  async _ensureHooks() {
    if (this._hooksStarted) return;
    await this.hooksHandler.start();
    this._hooksStarted = true;
  }

  // botId arrives as different types across callers: the runtimes Map is keyed
  // by the numeric bot.id (feishu_bots.id INTEGER PK), but hook/card paths
  // receive it as a string (env var / JSON callback value). Normalize here so
  // Map.get always hits the numeric key — otherwise getRuntime("1") misses the
  // runtime and sensitive tools fail-closed with "no reachable bot".
  getRuntime(botId) {
    if (botId == null || botId === '') return null;
    const key = typeof botId === 'number' ? botId : Number(botId);
    return Number.isNaN(key) ? null : (this.runtimes.get(key) || null);
  }

  async _startRuntime(bot) {
    let rt = this.runtimes.get(bot.id);
    if (!rt) {
      rt = new BotRuntime(bot, this.store, this.mainWindow, this.hooksHandler, this);
      this.runtimes.set(bot.id, rt);
    } else {
      rt.setBot(bot);
    }
    await rt.start();
    return rt;
  }

  // ── CRUD (delegate to store, sync runtimes) ──

  createBot(data) {
    const bot = this.store.createBot(data);
    this.broadcastStatus();
    return this._sanitizeBot(bot);
  }

  updateBot(botId, fields) {
    // Switch guards when projectDir changes (design 06-29-feishu-bot-switch-dir).
    // Unbind must happen BEFORE writing project_dir so the binding row doesn't
    // keep a stale project_dir while bot.project_dir moves to the new value.
    if (Object.prototype.hasOwnProperty.call(fields, 'projectDir')) {
      const current = this.store.getBot(botId);
      const oldDir = (current && current.project_dir) || '';
      const newDir = String(fields.projectDir || '').trim();
      if (oldDir !== newDir) {
        const rt = this.getRuntime(botId);
        // C1: refuse switch while a message is being processed — in-flight spawn
        // cwd must not move underneath the running generation.
        if (rt && rt._processing) {
          const err = new Error('机器人正在处理消息，请稍后再切换服务目录');
          err.code = 'BOT_PROCESSING';
          throw err;
        }
        // C3: a switch drops the bot's active binding (no snapshot kept).
        const binding = this.store.getActiveBindingByBot(botId);
        if (binding) {
          this.store.clearBindingByBot(botId);
          if (rt) rt._unwatch();
        }
      }
    }
    const bot = this.store.updateBot(botId, fields);
    const rt = this.getRuntime(botId);
    if (rt) rt.setBot(bot);
    this.broadcastStatus();
    return this._sanitizeBot(bot);
  }

  /**
   * Delete a bot. Caller (IPC) must have blocked online/bound bots; this is a
   * defensive cleanup that stops the runtime, drops it from the map, then
   * removes bot + binding in one store transaction (design §10.3).
   */
  async deleteBot(botId) {
    const rt = this.getRuntime(botId);
    if (rt) {
      await rt.stop().catch(() => {});
      this.runtimes.delete(botId);
    }
    this.store.deleteBot(botId);
    this.broadcastStatus();
  }

  async toggleBot(botId, enabled) {
    if (enabled) {
      const bot = this.store.getBot(botId);
      if (!bot) throw new Error('机器人不存在');
      try {
        await this._ensureHooks();
        await this._startRuntime(bot);
        this.store.updateBot(botId, { enabled: true });
      } catch (err) {
        this.store.updateBot(botId, { enabled: false });
        const rt = this.getRuntime(botId);
        if (rt) await rt.stop().catch(() => {});
        throw err;
      }
    } else {
      this.store.updateBot(botId, { enabled: false });
      // Stop but keep the runtime in the map: a residual spawn's hook can still
      // resolve via getRuntime and hit fail-closed (design §5.1).
      const rt = this.getRuntime(botId);
      if (rt) await rt.stop().catch(() => {});
    }
    this.broadcastStatus();
  }

  // ── Bindings (design §10) ──

  bindSessionToBot(botId, jsonlPath) {
    const bot = this.store.getBot(botId);
    if (!bot) throw new Error('机器人不存在');
    if (!bot.project_dir) throw new Error('机器人未设置服务目录，请先补全');
    // Defense-in-depth: the frontend only lists same-dir sessions, but the IPC
    // layer must not trust the renderer. Reject cross-dir bindings — a session's
    // resolved cwd must match the bot's project_dir (design §10.1 / prd §3).
    const { resolveCwd } = require('./binding');
    const sessionCwd = resolveCwd(jsonlPath);
    if (sessionCwd && path.resolve(sessionCwd) !== path.resolve(bot.project_dir)) {
      throw new Error('会话不属于该机器人的服务目录（跨目录绑定已被禁止）');
    }
    const sessionId = path.basename(jsonlPath, '.jsonl');
    const binding = this.store.upsertBindingByBot(botId, { jsonlPath, sessionId, projectDir: bot.project_dir });
    const rt = this.getRuntime(botId);
    if (rt) rt.watchActiveBinding();
    this.broadcastStatus();
    return binding;
  }

  unbindBot(botId) {
    this.store.clearBindingByBot(botId);
    const rt = this.getRuntime(botId);
    if (rt) rt._unwatch();
    this.broadcastStatus();
  }

  /** Bots whose project_dir matches AND are online; offline/other-dir marked disabled. */
  listBindableBots(projectDir) {
    const bots = this.store.listBots();
    return bots.map((bot) => {
      const rt = this.runtimes.get(bot.id);
      const online = !!(rt && rt.online);
      return {
        id: bot.id,
        name: bot.name,
        appId: bot.app_id,
        projectDir: bot.project_dir,
        online,
        disabled: bot.project_dir !== projectDir || !online
      };
    });
  }

  // ── Status (aggregated, design §11.2) ──

  getStatus() {
    const bots = this.store.listBots();
    return {
      bots: bots.map((bot) => {
        const rt = this.runtimes.get(bot.id);
        const online = !!(rt && rt.online);
        const processing = !!(rt && rt._processing);
        const binding = this.store.getActiveBindingByBot(bot.id);
        return {
          id: bot.id,
          name: bot.name,
          appId: bot.app_id,
          projectDir: bot.project_dir,
          // Parsed allowlist (array of open_id; empty = allow everyone). Exposed so
          // the edit form can prefill the current whitelist — otherwise saving any
          // edit would silently wipe it. Not secret (App ID isn't either).
          allowedUsers: (bot.allowed_users || '').split(',').map((s) => s.trim()).filter(Boolean),
          enabled: !!bot.enabled,
          hasSecret: !!(bot.app_secret && bot.app_secret !== ''),
          needsProjectDir: !bot.project_dir,
          online,
          processing,
          binding: binding ? { jsonlPath: binding.jsonl_path, sessionId: binding.session_id } : null
        };
      })
    };
  }

  broadcastStatus() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('feishu:statusChanged', this.getStatus());
    }
  }

  /** Stop every runtime + the shared hooks HTTP server (app shutdown). */
  async stopAll() {
    for (const rt of this.runtimes.values()) {
      await rt.stop().catch(() => {});
    }
    this.runtimes.clear();
    if (this._hooksStarted) {
      this.hooksHandler.stop();
      this._hooksStarted = false;
    }
  }

  /** Strip the ciphertext secret + normalize field names to the status shape. */
  _sanitizeBot(bot) {
    if (!bot) return bot;
    const { app_secret, allowed_users, project_dir, app_id, enabled, ...rest } = bot;
    // Runtime fields default to "offline/idle" — the next broadcastStatus() will
    // refresh them with live values once the runtime actually (dis)connects.
    return {
      ...rest,
      appId: app_id,
      projectDir: project_dir,
      allowedUsers: (allowed_users || '').split(',').map((s) => s.trim()).filter(Boolean),
      enabled: !!enabled,
      hasSecret: !!(app_secret && app_secret !== ''),
      needsProjectDir: !project_dir,
      online: false,
      processing: false,
      binding: null
    };
  }
}

module.exports = { BotManager, cleanOldAttachments };
