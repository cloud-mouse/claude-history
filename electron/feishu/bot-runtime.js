'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { WSClient, EventDispatcher, Client } = require('@larksuiteoapi/node-sdk');

const { PermissionManager } = require('./permissions');
const { handleCommand } = require('./commands');
const { spawnClaude } = require('./claude-spawn');
const { resolveCwd, watchBinding } = require('./binding');
const { buildResponseCard, buildProgressCard, buildErrorCard, buildWarningCard, buildConfirmResultCard, buildSwitchConfirmCard, extractCardText } = require('./cards');

// Per-bot attachment download root. Keyed by bot+chat so one bot/chat's Claude
// can't Read another's attachments (privacy isolation, design §7).
const ATTACHMENTS_DIR = () => path.join(os.homedir(), '.claude-history', 'attachments');

function attachmentDirForBotChat(botId, chatId) {
  const safe = `${botId}_${String(chatId || 'shared')}`.replace(/[^\w.-]/g, '_');
  return path.join(ATTACHMENTS_DIR(), safe);
}

// Sniff a real image extension from file magic bytes. Feishu image messages carry
// no mime type, so we detect png/jpg/webp/gif from the downloaded bytes instead.
function detectImageExt(filePath) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const sig = Buffer.alloc(12);
    fs.readSync(fd, sig, 0, 12, 0);
    if (sig[0] === 0x89 && sig[1] === 0x50 && sig[2] === 0x4e && sig[3] === 0x47) return '.png';
    if (sig[0] === 0xff && sig[1] === 0xd8 && sig[2] === 0xff) return '.jpg';
    if (sig.slice(0, 4).toString('latin1') === 'RIFF' && sig.slice(8, 12).toString('latin1') === 'WEBP') return '.webp';
    const head6 = sig.slice(0, 6).toString('latin1');
    if (head6 === 'GIF87a' || head6 === 'GIF89a') return '.gif';
  } catch {} finally { if (fd != null) try { fs.closeSync(fd); } catch {} }
  return '';
}

/**
 * One bot's runtime: an independent Feishu app connection plus all per-bot
 * state (spawn, progress card, permissions, file watch). Produced by splitting
 * the old FeishuBridge singleton (design §5.2). The BotManager owns the shared
 * HooksHandler; a BotRuntime must never start/stop that HTTP server.
 */
class BotRuntime {
  /**
   * @param {object} bot - feishu_bots row (app_secret is ENC: ciphertext)
   * @param {import('../store').Store} store
   * @param {Electron.BrowserWindow} mainWindow
   * @param {import('./hooks-handler').HooksHandler} hooksHandler - shared singleton
   * @param {import('./bot-manager').BotManager} botManager - for aggregated status broadcast
   */
  constructor(bot, store, mainWindow, hooksHandler, botManager) {
    this.bot = bot;
    this.botId = bot.id;
    this.store = store;
    this.mainWindow = mainWindow;
    this.hooksHandler = hooksHandler;
    this.botManager = botManager;

    // Per-bot Feishu app connection.
    this.wsClient = null;
    this.eventDispatcher = null;
    this.client = null;

    // Per-bot runtime state (was global on FeishuBridge).
    this.permissions = new PermissionManager();
    this._seenMsgIds = new Set();
    this._processing = false;
    this._claudeProcess = null;
    this._model = null;
    this._lastMessage = null;
    this._confirmMode = false;
    this._terminatedByUser = false;
    this._unwatchCleanup = null;
    this._legacyConfirmations = new Map();
    this._switchPending = new Map(); // requestId → { sessionId, jsonlPath, timeout }

    // Streaming progress card state.
    this._progressCardId = null;
    this._progressState = null;
    this._progressFlushTimer = null;

    // Lifecycle guard (design §6.4): dispatcher callbacks captured a generation;
    // stop() bumps it so stale events from a not-yet-closed socket are dropped.
    this.active = false;
    this.generation = 0;
    this.online = false;
  }

  /** Refresh the bot record in place (after updateBot). */
  setBot(bot) { this.bot = bot; }

  getStatus() {
    const binding = this.store.getActiveBindingByBot(this.botId);
    return {
      id: this.botId,
      name: this.bot.name,
      appId: this.bot.app_id,
      projectDir: this.bot.project_dir,
      enabled: !!this.bot.enabled,
      hasSecret: !!(this.bot.app_secret && this.bot.app_secret !== ''),
      online: this.online,
      processing: this._processing,
      binding: binding ? { jsonlPath: binding.jsonl_path, sessionId: binding.session_id } : null
    };
  }

  _botAllowedUsers() {
    const raw = this.bot.allowed_users || '';
    if (!raw) return [];
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }

  async start() {
    if (this.online && this.wsClient) return { success: true, message: 'already connected' };

    const appSecret = this.store.decryptSecret(this.bot.app_secret);
    if (!this.bot.app_id || !appSecret) throw new Error('飞书凭证未配置');

    // Bump generation and capture it so callbacks created below reject stale
    // events after a later stop()/restart (design §6.4).
    this.generation += 1;
    const gen = this.generation;
    this.active = true;

    this.client = new Client({ appId: this.bot.app_id, appSecret });

    this.eventDispatcher = new EventDispatcher({}).register({
      'im.message.receive_v1': async (data) => {
        if (!this.active || gen !== this.generation || !this.client) return;
        try {
          const msg = this._normalizeMessage(data);
          if (!msg) return;
          if (this._seenMsgIds.has(msg.messageId)) return;
          this._seenMsgIds.add(msg.messageId);
          if (this._seenMsgIds.size > 200) this._seenMsgIds = new Set([...this._seenMsgIds].slice(-100));
          await this._handleMessage(msg);
        } catch (err) {
          console.error(`[feishu:bot${this.botId}] Error handling message:`, err.message);
          try {
            const chatId = data?.message?.chat_id;
            if (chatId) await this._sendCard(chatId, buildErrorCard(`内部错误: ${err.message}`));
          } catch (_) {}
        }
      },
      'card.action.trigger': async (data) => {
        if (!this.active || gen !== this.generation || !this.client) return { toast: { type: 'error', content: '连接已失效' } };
        let ok = false;
        try { ok = await this._handleCardAction(data); }
        catch (err) { console.error(`[feishu:bot${this.botId}][cardAction] ERROR:`, err.message); }
        return { toast: { type: ok ? 'success' : 'error', content: ok ? '已处理' : '操作未生效（请求已过期或无效）' } };
      },
      'im.message.reaction.created_v1': async () => {},
      'im.message.reaction.deleted_v1': async () => {},
      'im.chat.member.bot.added_v1': async () => {},
      'drive.notice.comment_add_v1': async () => {}
    });

    this.wsClient = new WSClient({
      appId: this.bot.app_id, appSecret,
      onReconnecting: () => { this.online = false; this.botManager.broadcastStatus(); },
      onReconnected: () => { this.online = true; this.botManager.broadcastStatus(); }
    });

    try {
      await this.wsClient.start({ eventDispatcher: this.eventDispatcher });
      this.online = true;
      const binding = this.store.getActiveBindingByBot(this.botId);
      if (binding) this._watchBinding(binding);
      this.botManager.broadcastStatus();
      return { success: true };
    } catch (err) {
      this.online = false;
      this.botManager.broadcastStatus();
      throw new Error(`飞书连接失败: ${err.message}`);
    }
  }

  async stop() {
    // Full teardown (design §6.4): do NOT only null the three handles — clear
    // every piece of runtime state so a restart is clean and a stopped bot can't
    // keep processing. The shared hooksHandler is NOT touched here.
    this.active = false;
    this.generation += 1;
    this._unwatch();
    this._killClaudeProcess('SIGTERM');
    if (this._progressFlushTimer) { clearTimeout(this._progressFlushTimer); this._progressFlushTimer = null; }
    for (const [, entry] of this._switchPending) { clearTimeout(entry.timeout); }
    this._switchPending.clear();
    this.permissions.clearAll();
    // Best-effort physical disconnect; the SDK exposes no public stop(), and
    // autoReconnect defaults on. The real safety boundary is active/generation.
    try { this.wsClient?.wsConfig?.getWSInstance?.()?.terminate?.(); } catch {}
    this.wsClient = null;
    this.eventDispatcher = null;
    this.client = null;
    this.online = false;
    this.botManager.broadcastStatus();
    return { success: true };
  }

  // ── Bindings (bot-level, design §10) ──

  watchActiveBinding() {
    const binding = this.store.getActiveBindingByBot(this.botId);
    this._watchBinding(binding);
    return binding;
  }

  // ── Message Handling (design §7) ──

  async _handleMessage(msg) {
    const chatId = msg.chatId;
    const messageText = this._extractText(msg);

    // Allowlist comes from the bot record (empty = allow everyone).
    const allowed = this._botAllowedUsers();
    if (allowed.length > 0 && !allowed.includes(msg.senderOpenId)) {
      await this._sendCard(chatId, buildWarningCard('🚫 无权限', '你没有权限使用此机器人。请联系所有者在桌面端配置白名单。')).catch(() => {});
      return;
    }

    if (messageText.startsWith('/')) {
      const binding = this.store.getActiveBindingByBot(this.botId);
      await handleCommand({
        botId: this.botId, runtime: this, chatId, text: messageText, binding,
        sendCard: (id, card) => this._sendCard(id, card),
        killClaude: () => this._killClaudeProcess('SIGTERM'),
        getProcessing: () => this._processing,
        withProcessing: (fn) => this._withProcessing(chatId, fn),
        getModel: () => this._model,
        setModel: (v) => { this._model = v; },
        getLastMessage: () => this._lastMessage,
        setLastMessage: (v) => { this._lastMessage = v; },
        getConfirmMode: () => this._confirmMode,
        setConfirmMode: (v) => { this._confirmMode = v; },
        permissions: this.permissions,
        notifyRenderer: (ch, d) => this._notifyRenderer(ch, d),
        spawnClaude: (opts) => this._doSpawnClaude(opts),
        store: this.store,
        args: messageText.split(' ').slice(1).join(' ')
      });
      return;
    }

    const binding = this.store.getActiveBindingByBot(this.botId);
    if (!binding) {
      await this._sendCard(chatId, buildWarningCard('😔 未绑定会话', '此机器人未绑定到 Claude Code 会话\n\n请在 **claude-history** 桌面应用中绑定会话')).catch(() => {});
      return;
    }

    await this._withProcessing(chatId, async () => {
      const preview = messageText.length > 30 ? messageText.slice(0, 30) + '...' : messageText;
      let reactionId = null;
      try {
        if (this._confirmMode) {
          const approved = await this._requestConfirmation(chatId, preview);
          if (!approved) return;
        } else {
          reactionId = await this._addReaction(msg.messageId, 'Typing');
        }

        let fullMessage = messageText;
        const attachments = msg.attachments || [];
        let attachmentDirs = null;
        if (attachments.length > 0) {
          const refLines = [];
          for (const att of attachments) {
            try {
              const localPath = await this._downloadAttachment(chatId, msg.messageId, att);
              refLines.push(att.type === 'image'
                ? `[图片附件: ${localPath}]\n请使用 Read 工具查看这张图片。`
                : `[文件附件: ${localPath}（${att.fileName}）]\n如需查看内容请用 Read 工具读取。`);
            } catch (err) {
              refLines.push(`[附件下载失败: ${att.fileName || att.type} — ${err.message}]`);
            }
          }
          fullMessage = (messageText ? messageText + '\n\n' : '') + refLines.join('\n\n');
          if (!fullMessage.trim()) fullMessage = '请查看附件。';
          attachmentDirs = [attachmentDirForBotChat(this.botId, chatId)];
        }

        await this._doSpawnClaude({ sessionId: binding.session_id, jsonlPath: binding.jsonl_path, message: fullMessage, chatId, addDirs: attachmentDirs });
        this._touchConversation(binding.jsonl_path);

        if (reactionId) this._deleteReaction(msg.messageId, reactionId).catch(() => {});

        this._lastMessage = messageText;
        this._notifyRenderer('feishu:jsonlChanged', { jsonlPath: binding.jsonl_path, sessionId: binding.session_id, botId: this.botId });
      } catch (err) {
        if (reactionId) this._deleteReaction(msg.messageId, reactionId).catch(() => {});
        if (!err._cardHandled) await this._sendCard(chatId, buildErrorCard(err.message)).catch(() => {});
      }
    });
  }

  _doSpawnClaude({ sessionId, jsonlPath, message, chatId, addDirs }) {
    const hookPort = this.hooksHandler.port;
    const hookToken = this.hooksHandler.authToken;
    const self = this;
    const preview = String(message || '').slice(0, 40);

    this._startProgressCard(chatId, preview);

    return spawnClaude({
      sessionId, jsonlPath, message,
      model: self._model,
      hookPort, hookToken,
      botId: self.botId, chatId,
      botProjectDir: self.bot.project_dir || undefined,
      permissionMode: self.permissions.mode,
      addDirs,
      onSpawn: (child) => {
        self._claudeProcess = child;
        child.on('close', () => { if (self._claudeProcess === child) self._claudeProcess = null; });
      },
      onToolUse: () => {},
      onProgress: (patch) => self._onClaudeProgress(patch)
    }).then(({ text, meta }) => {
      if (meta && (meta.costUsd != null || meta.durationMs != null)) {
        try {
          const conv = self.store.getConversationByFilePath(jsonlPath);
          if (conv) self.store.updateRuntime(conv.id, { costUsd: meta.costUsd, durationMs: meta.durationMs, runAt: Date.now() });
        } catch (err) { console.warn('[feishu] updateRuntime failed:', err.message); }
      }
      return self._finishProgressCard(chatId, text).then(() => text);
    }).catch((err) => {
      self._abortProgressCard(chatId, err.message);
      if (!err._cardHandled) {
        const wrapped = new Error(err.message);
        wrapped._cardHandled = true;
        throw wrapped;
      }
      throw err;
    });
  }

  // ── Streaming progress card ──

  async _startProgressCard(chatId, preview) {
    if (this._progressFlushTimer) { clearTimeout(this._progressFlushTimer); this._progressFlushTimer = null; }
    this._progressState = { preview, thinking: '', text: '', tools: [] };
    this._progressCardId = null;
    try {
      this._progressCardId = await this._sendCard(chatId, buildProgressCard(this._progressState));
    } catch (err) { console.warn('[feishu] progress card send failed:', err.message); }
  }

  _onClaudeProgress(patch) {
    if (!this._progressState) return;
    if (patch.type === 'thinking') {
      this._progressState.thinking = patch.text || '';
    } else if (patch.type === 'text') {
      const t = patch.text || '';
      this._progressState.text = t.length > 2000 ? t.slice(-2000) : t;
    } else if (patch.type === 'tool') {
      this._progressState.tools.push({ name: patch.name, input: patch.input });
      if (this._progressState.tools.length > 6) this._progressState.tools = this._progressState.tools.slice(-6);
    }
    this._scheduleProgressFlush();
  }

  _scheduleProgressFlush() {
    if (this._progressFlushTimer || !this._progressCardId) return;
    this._progressFlushTimer = setTimeout(() => {
      this._progressFlushTimer = null;
      const cardId = this._progressCardId;
      const state = this._progressState;
      if (!cardId || !state) return;
      this._updateCard(cardId, buildProgressCard(state)).catch(() => {});
    }, 1200);
  }

  async _finishProgressCard(chatId, finalText) {
    if (this._progressFlushTimer) { clearTimeout(this._progressFlushTimer); this._progressFlushTimer = null; }
    const cardId = this._progressCardId;
    this._progressCardId = null;
    this._progressState = null;
    const card = buildResponseCard(finalText);
    if (cardId) {
      await this._updateCard(cardId, card).catch(() => {});
    } else {
      await this._sendCard(chatId, card).catch(() => {});
    }
  }

  _abortProgressCard(chatId, errMsg) {
    if (this._progressFlushTimer) { clearTimeout(this._progressFlushTimer); this._progressFlushTimer = null; }
    const cardId = this._progressCardId;
    this._progressCardId = null;
    this._progressState = null;
    if (cardId) this._updateCard(cardId, buildErrorCard(errMsg)).catch(() => {});
  }

  // Instance-level serialization: one message at a time per bot, bots run in
  // parallel (design §5.3). chatId is only used for the "busy" notice.
  async _withProcessing(chatId, fn) {
    if (this._processing) {
      await this._sendCard(chatId, buildWarningCard('⏳ 请稍候', '正在处理上一条消息，请等待完成后再发送新消息')).catch(() => {});
      return null;
    }
    this._processing = true;
    this.botManager.broadcastStatus();
    try {
      return await fn();
    } finally {
      this._processing = false;
      this.botManager.broadcastStatus();
    }
  }

  // ── Card Action Handling ──

  async _handleCardAction(data) {
    const value = data?.action?.value;
    const messageId = data?.context?.open_message_id || data?.open_message_id;
    if (!value || !value.requestId) return false;

    // Hooks-based permission confirmation — route via the shared handler, which
    // resolves the target runtime by value.botId (design §8.2/§8.3).
    if (value.action?.startsWith('hook_')) {
      return this.hooksHandler.handleCardAction(value);
    }

    // Legacy confirm mode
    if (value.action === 'approve' || value.action === 'deny') {
      const entry = this._legacyConfirmations.get(value.requestId);
      if (entry) {
        entry.resolve(value.action === 'approve');
        const card = value.action === 'approve'
          ? buildConfirmResultCard('✅ 已批准，正在处理...', 'green', entry.detail)
          : buildConfirmResultCard('❌ 已拒绝', 'red', entry.detail);
        this._updateCard(messageId, card).catch(() => {});
        return true;
      }
      return false;
    }

    // /switch confirmation (design §9, decision 1)
    if (value.action === 'switch_confirm' || value.action === 'switch_cancel') {
      return this._resolveSwitch(value, messageId);
    }

    if (value.action === 'terminate') {
      this._terminatedByUser = true;
      this._killClaudeProcess('SIGTERM');
      await this._updateCard(messageId, buildConfirmResultCard('🛑 已终止执行', 'red'));
      return true;
    }
    if (value.action === 'always_allow') {
      const { SENSITIVE_TOOLS } = require('./permissions');
      if (value.toolName && SENSITIVE_TOOLS.includes(value.toolName)) {
        this.permissions.alwaysAllow(value.toolName);
        await this._updateCard(messageId, buildConfirmResultCard(`🔓 已始终允许 ${value.toolName}`, 'green'));
        return true;
      }
      return false;
    }
    return false;
  }

  // ── /switch confirmation (design §9) ──

  /**
   * Ask the user to confirm switching this bot's binding to a new session.
   * The target is held in this runtime's _switchPending map (NOT in the card
   * payload) so a forged button cannot redirect the bot. Returns true if a
   * confirmation card was sent.
   */
  async requestSwitchConfirmation(chatId, { sessionId, jsonlPath, label }) {
    const requestId = `switch_${crypto.randomUUID()}`;
    const detail = `**目标会话:** ${label || sessionId.slice(0, 8)}`;
    const timeout = setTimeout(async () => {
      const entry = this._switchPending.get(requestId);
      if (entry && entry.cardMessageId) {
        await this._updateCard(entry.cardMessageId, buildConfirmResultCard('⏰ 切换已超时', 'grey', detail)).catch(() => {});
      }
      this._switchPending.delete(requestId);
    }, 60_000);

    this._switchPending.set(requestId, { sessionId, jsonlPath, timeout, cardMessageId: null });
    const card = buildSwitchConfirmCard(requestId, this.botId, detail);
    const msgId = await this._sendCard(chatId, card).catch(() => null);
    const entry = this._switchPending.get(requestId);
    if (entry) entry.cardMessageId = msgId;
    return true;
  }

  _resolveSwitch(value, messageId) {
    const entry = this._switchPending.get(value.requestId);
    if (!entry) return false;
    clearTimeout(entry.timeout);
    this._switchPending.delete(value.requestId);
    if (value.action === 'switch_cancel') {
      this._updateCard(messageId, buildConfirmResultCard('❌ 已取消切换', 'grey')).catch(() => {});
      return true;
    }
    this.store.updateBindingByBot(this.botId, { sessionId: entry.sessionId, jsonlPath: entry.jsonlPath });
    const binding = this.store.getActiveBindingByBot(this.botId);
    this._watchBinding(binding);
    this._updateCard(messageId, buildConfirmResultCard('✅ 已切换会话', 'green', `会话: \`${entry.sessionId.slice(0, 8)}...\``)).catch(() => {});
    this._notifyRenderer('feishu:jsonlChanged', { jsonlPath: entry.jsonlPath, sessionId: entry.sessionId, botId: this.botId });
    return true;
  }

  // ── Pre-execution Confirmation (confirm mode) ──

  _requestConfirmation(chatId, preview) {
    return new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID();
      const detail = `**消息:** ${preview}`;
      const timeout = setTimeout(async () => {
        const entry = this._legacyConfirmations.get(requestId);
        if (entry?.cardMessageId) await this._updateCard(entry.cardMessageId, buildConfirmResultCard('⏰ 确认已超时', 'grey', detail)).catch(() => {});
        this._legacyConfirmations.delete(requestId);
        resolve(false);
      }, 5 * 60 * 1000);

      this._legacyConfirmations.set(requestId, {
        resolve: (approved) => { clearTimeout(timeout); this._legacyConfirmations.delete(requestId); resolve(approved); },
        timeout, cardMessageId: null, detail
      });

      this._sendCard(chatId, this._buildLegacyConfirmCard(requestId, preview))
        .then((msgId) => { const e = this._legacyConfirmations.get(requestId); if (e) e.cardMessageId = msgId; })
        .catch((err) => { clearTimeout(timeout); this._legacyConfirmations.delete(requestId); reject(err); });
    });
  }

  _buildLegacyConfirmCard(requestId, preview) {
    return {
      schema: '2.0', config: { width_mode: 'fill' },
      header: { title: { tag: 'plain_text', content: '🔐 授权确认' }, template: 'orange' },
      body: {
        elements: [
          { tag: 'markdown', content: `> ${preview}\n\nClaude 将处理此消息。是否允许？` },
          {
            tag: 'column_set', flex_mode: 'flow',
            columns: [
              { tag: 'column', width: 'auto', weight: 1, vertical_align: 'top', elements: [{ tag: 'button', text: { tag: 'plain_text', content: '✅ 允许' }, type: 'primary', behaviors: [{ type: 'callback', value: { requestId, action: 'approve' } }] }] },
              { tag: 'column', width: 'auto', weight: 1, vertical_align: 'top', elements: [{ tag: 'button', text: { tag: 'plain_text', content: '❌ 拒绝' }, type: 'danger', behaviors: [{ type: 'callback', value: { requestId, action: 'deny' } }] }] }
            ]
          },
          { tag: 'markdown', content: '_⏳ 5 分钟内未操作将自动拒绝_' }
        ]
      }
    };
  }

  // ── Helpers ──

  _extractText(msg) {
    let text = typeof msg.content === 'string' ? msg.content : msg.text || String(msg.content || '');
    return text.replace(/^@\S+\s*/, '').trim();
  }

  _normalizeMessage(event) {
    const msg = event?.message;
    if (!msg) return null;
    const messageType = msg.message_type || 'text';
    let text = '';
    const attachments = [];
    try {
      const parsed = JSON.parse(msg.content);
      if (messageType === 'image' && parsed && parsed.image_key) {
        attachments.push({ type: 'image', imageKey: parsed.image_key });
      } else if (messageType === 'file' && parsed && parsed.file_key) {
        attachments.push({ type: 'file', fileKey: parsed.file_key, fileName: msg.file_name || parsed.file_name || 'attachment' });
      } else {
        text = typeof parsed === 'string' ? parsed : (parsed.text || msg.content || '');
      }
    } catch { text = msg.content || ''; }
    text = text.replace(/^@\S+\s*/, '').trim();
    const senderOpenId = event?.sender?.sender_id?.open_id || event?.event?.sender?.sender_id?.open_id || '';
    return { chatId: msg.chat_id, chatType: msg.chat_type || 'p2p', messageType, content: text, text, attachments, messageId: msg.message_id, senderOpenId };
  }

  async _downloadAttachment(chatId, messageId, attachment) {
    if (!this.client) throw new Error('飞书未连接，无法下载附件');
    const dir = attachmentDirForBotChat(this.botId, chatId);
    try { fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); } catch {}
    const key = attachment.imageKey || attachment.fileKey;
    const isImage = attachment.type === 'image';
    const fallbackExt = isImage ? '.png' : (path.extname(attachment.fileName || '') || '.bin');
    const safeName = `${key}`.replace(/[^\w.-]/g, '_');
    const localPath = path.join(dir, safeName + fallbackExt);

    const resp = await this.client.im.v1.messageResource.get({
      params: { type: attachment.type === 'image' ? 'image' : 'file' },
      path: { message_id: messageId, file_key: key }
    });
    if (typeof resp.writeFile === 'function') {
      await resp.writeFile(localPath);
    } else if (typeof resp.getReadableStream === 'function') {
      await new Promise((resolve, reject) => {
        const ws = fs.createWriteStream(localPath, { mode: 0o600 });
        resp.getReadableStream().pipe(ws);
        ws.on('finish', resolve);
        ws.on('error', reject);
      });
    } else {
      throw new Error('无法获取附件下载流');
    }

    if (isImage) {
      const realExt = detectImageExt(localPath);
      if (realExt && realExt !== fallbackExt) {
        const finalPath = path.join(dir, safeName + realExt);
        try { fs.renameSync(localPath, finalPath); return finalPath; } catch {}
      }
    }
    return localPath;
  }

  _killClaudeProcess(signal = 'SIGTERM') {
    if (!this._claudeProcess) return;
    try { this._claudeProcess.kill(signal); } catch {}
    this._claudeProcess = null;
  }

  async _sendReply(chatId, text) {
    if (!this.client) return;
    try {
      await this.client.im.message.create({
        params: { receive_id_type: 'chat_id' },
        data: { receive_id: chatId, msg_type: 'text', content: JSON.stringify({ text: String(text).slice(0, 4000) }) }
      });
    } catch (err) { console.error('[feishu] Failed to send reply:', err.message); }
  }

  async _addReaction(messageId, emojiType) {
    if (!this.client || !messageId) return null;
    try {
      const resp = await this.client.im.v1.messageReaction.create({
        path: { message_id: messageId },
        data: { reaction_type: { emoji_type: emojiType } }
      });
      return resp?.data?.reaction_id || null;
    } catch (err) { console.error('[feishu] Failed to add reaction:', err.message); return null; }
  }

  async _deleteReaction(messageId, reactionId) {
    if (!this.client || !messageId || !reactionId) return;
    try {
      await this.client.im.v1.messageReaction.delete({ path: { message_id: messageId, reaction_id: reactionId } });
    } catch (err) { console.error('[feishu] Failed to delete reaction:', err.message); }
  }

  async _sendCard(chatId, card) {
    if (!this.client) return this._sendReply(chatId, extractCardText(card));
    try {
      const resp = await this.client.im.message.create({
        params: { receive_id_type: 'chat_id' },
        data: { receive_id: chatId, msg_type: 'interactive', content: JSON.stringify(card) }
      });
      return resp?.data?.message_id || null;
    } catch (err) {
      console.error('[feishu] Failed to send card:', err.message);
      await this._sendReply(chatId, extractCardText(card));
      return null;
    }
  }

  async _updateCard(messageId, card) {
    if (!this.client || !messageId) return;
    try {
      await this.client.im.v1.message.patch({ path: { message_id: messageId }, data: { content: JSON.stringify(card) } });
    } catch (err) { console.error('[feishu] Failed to update card:', err.message); }
  }

  _watchBinding(binding) {
    this._unwatch();
    if (!binding || !binding.jsonl_path) return;
    this._unwatchCleanup = watchBinding(binding, (jsonlPath, sessionId) => {
      this._notifyRenderer('feishu:jsonlChanged', { jsonlPath, sessionId, botId: this.botId });
    });
  }

  _unwatch() {
    if (this._unwatchCleanup) { this._unwatchCleanup(); this._unwatchCleanup = null; }
  }

  _touchConversation(jsonlPath) {
    try {
      const stat = fs.statSync(jsonlPath);
      const conv = this.store.getConversationByFilePath(jsonlPath);
      if (conv) this.store.upsertConversation(conv.project_id, jsonlPath, stat.size, Date.now());
    } catch {}
  }

  _notifyRenderer(channel, data) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) this.mainWindow.webContents.send(channel, data);
  }
}

module.exports = { BotRuntime, attachmentDirForBotChat };
