'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');
const fs = require('fs');

class Store {
  constructor(dbPath) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this._safeStorage = null;
    this._init();
  }

  /**
   * Set Electron safeStorage for encrypting sensitive values.
   * Must be called after app.whenReady().
   */
  setSafeStorage(safeStorage) {
    this._safeStorage = safeStorage;
  }

  _init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL,
        path       TEXT NOT NULL UNIQUE,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS conversations (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        file_path  TEXT NOT NULL UNIQUE,
        file_size  INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        title      TEXT
      );

      CREATE TABLE IF NOT EXISTS feishu_config (
        id         INTEGER PRIMARY KEY CHECK (id = 1),
        app_id     TEXT NOT NULL DEFAULT '',
        app_secret TEXT NOT NULL DEFAULT '',
        enabled    INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      );

      -- Multi-bot: each bot is one Feishu app (design §4.1). feishu_bindings is
      -- created by migrateToMultiBot() so the legacy chat_id-keyed table can be
      -- renamed aside and rebuilt as bot_id-keyed in one migration pass.
      CREATE TABLE IF NOT EXISTS feishu_bots (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        name          TEXT NOT NULL,
        app_id        TEXT NOT NULL UNIQUE,
        app_secret    TEXT NOT NULL DEFAULT '',
        project_dir   TEXT NOT NULL DEFAULT '',
        allowed_users TEXT NOT NULL DEFAULT '',
        enabled       INTEGER NOT NULL DEFAULT 0,
        created_at    INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL
      );

      -- Legacy chat-keyed bindings. migrateToMultiBot() renames this aside to
      -- feishu_bindings_legacy and rebuilds the bot_id-keyed structure (design
      -- §4.2/§12). Kept here so existing installs (and the migration regression
      -- test) already have the old table in place when the migration runs;
      -- CREATE IF NOT EXISTS is a no-op once the new structure exists.
      CREATE TABLE IF NOT EXISTS feishu_bindings (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id     TEXT NOT NULL,
        chat_type   TEXT NOT NULL DEFAULT 'p2p',
        jsonl_path  TEXT NOT NULL UNIQUE,
        session_id  TEXT NOT NULL,
        project_dir TEXT NOT NULL,
        active      INTEGER NOT NULL DEFAULT 1,
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_conversations_project_id ON conversations(project_id);
      CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at);
    `);

    // Migration: drop stale unique index on chat_id (was causing rebind failures)
    try {
      this.db.exec('DROP INDEX IF EXISTS idx_feishu_bindings_chat');
    } catch (e) {
      // Ignore if already dropped
    }

    // Migration: add allowed_users column to feishu_config (sender allowlist for C2).
    // Empty = allow everyone (backward-compatible). Non-empty = only listed open_ids.
    try {
      this.db.exec(`ALTER TABLE feishu_config ADD COLUMN allowed_users TEXT NOT NULL DEFAULT ''`);
    } catch (e) {
      // Column already exists — ignore
    }

    // Full-text search index over message text + tool calls (function 1).
    // Self-contained FTS5 table (content lives here, not in an external table);
    // trigram tokenizer gives good substring recall for CJK text and camelCase.
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
        text,
        conversation_id UNINDEXED,
        message_id UNINDEXED,
        role UNINDEXED,
        tokenize = 'trigram'
      );
    `);

    // Migration: token/cost statistics columns on conversations (functions 1 & 3).
    // Each ADD COLUMN is idempotent via try/catch (errors when the column exists).
    for (const col of [
      'stats_updated_at INTEGER NOT NULL DEFAULT 0',
      'input_tokens INTEGER NOT NULL DEFAULT 0',
      'output_tokens INTEGER NOT NULL DEFAULT 0',
      'cache_read_tokens INTEGER NOT NULL DEFAULT 0',
      'cache_creation_tokens INTEGER NOT NULL DEFAULT 0',
      'assistant_turns INTEGER NOT NULL DEFAULT 0',
      "models TEXT NOT NULL DEFAULT ''",
      'last_cost_usd REAL',
      'last_duration_ms INTEGER',
      'last_run_at INTEGER',
      'project_dir TEXT'
    ]) {
      try {
        this.db.exec(`ALTER TABLE conversations ADD COLUMN ${col}`);
      } catch (e) {
        // Column already exists — ignore
      }
    }
  }

  upsertProject(name, projectPath) {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO projects (name, path, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(path) DO UPDATE SET
        name = excluded.name,
        updated_at = excluded.updated_at
    `);
    const result = stmt.run(name, projectPath, now);
    return result.lastInsertRowid;
  }

  getProjectByPath(projectPath) {
    const stmt = this.db.prepare('SELECT * FROM projects WHERE path = ?');
    return stmt.get(projectPath) || null;
  }

  getProjectById(id) {
    const stmt = this.db.prepare('SELECT * FROM projects WHERE id = ?');
    return stmt.get(id) || null;
  }

  /**
   * Derive the real project directory for a JSONL file path.
   * Looks up the conversation → project to get the actual working directory
   * where Claude Code should be spawned.
   */
  getProjectDirForJsonl(jsonlPath) {
    const conv = this.getConversationByFilePath(jsonlPath);
    if (conv) {
      const project = this.getProjectById(conv.project_id);
      if (project) return project.path;
    }
    return null;
  }

  getAllProjects() {
    const stmt = this.db.prepare('SELECT * FROM projects ORDER BY name ASC');
    return stmt.all();
  }

  upsertConversation(projectId, filePath, fileSize, updatedAt, projectDir = null) {
    const stmt = this.db.prepare(`
      INSERT INTO conversations (project_id, file_path, file_size, updated_at, project_dir)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(file_path) DO UPDATE SET
        project_id = excluded.project_id,
        file_size = excluded.file_size,
        updated_at = excluded.updated_at,
        project_dir = COALESCE(excluded.project_dir, conversations.project_dir)
    `);
    const result = stmt.run(projectId, filePath, fileSize, updatedAt, projectDir);
    return result.lastInsertRowid;
  }

  getConversationsByProject(projectId) {
    const stmt = this.db.prepare(
      'SELECT * FROM conversations WHERE project_id = ? ORDER BY updated_at DESC'
    );
    return stmt.all(projectId);
  }

  getConversationById(id) {
    const stmt = this.db.prepare('SELECT * FROM conversations WHERE id = ?');
    return stmt.get(id) || null;
  }

  getConversationByFilePath(filePath) {
    const stmt = this.db.prepare('SELECT * FROM conversations WHERE file_path = ?');
    return stmt.get(filePath) || null;
  }

  updateTitle(convId, title) {
    const stmt = this.db.prepare('UPDATE conversations SET title = ? WHERE id = ?');
    return stmt.run(title, convId);
  }

  deleteConversation(filePath) {
    const conv = this.getConversationByFilePath(filePath);
    if (conv) this.clearFtsForConversation(conv.id);
    const stmt = this.db.prepare('DELETE FROM conversations WHERE file_path = ?');
    return stmt.run(filePath);
  }

  deleteProject(projectId) {
    // Clean FTS index for the project's conversations first.
    const convIds = this.db.prepare('SELECT id FROM conversations WHERE project_id = ?').all(projectId);
    for (const c of convIds) this.clearFtsForConversation(c.id);
    // Delete associated conversations first (due to foreign key)
    const deleteConvs = this.db.prepare('DELETE FROM conversations WHERE project_id = ?');
    deleteConvs.run(projectId);
    // Then delete the project
    const deleteProj = this.db.prepare('DELETE FROM projects WHERE id = ?');
    return deleteProj.run(projectId);
  }

  // ── Full-text search index (function 1) ────────────────────────

  /**
   * Index a single message's searchable text. FTS5 has no primary key, so we
   * delete-then-insert keyed by message_id to stay idempotent on re-indexing.
   */
  indexMessage(convId, messageId, role, text) {
    if (!messageId) return;
    this.db.prepare('DELETE FROM messages_fts WHERE message_id = ?').run(messageId);
    const t = typeof text === 'string' ? text.trim() : '';
    if (!t) return;
    this.db.prepare(
      'INSERT INTO messages_fts (text, conversation_id, message_id, role) VALUES (?, ?, ?, ?)'
    ).run(t.slice(0, 50000), convId, messageId, role || '');
  }

  /** Remove all FTS rows belonging to a conversation (used on re-index / delete). */
  clearFtsForConversation(convId) {
    this.db.prepare('DELETE FROM messages_fts WHERE conversation_id = ?').run(convId);
  }

  /**
   * Full-text search across all indexed messages.
   * @returns {Array<{conversation_id, message_id, role, preview}>}
   */
  searchMessages(query, limit = 50) {
    const q = String(query || '').trim();
    if (!q) return [];
    // The trigram tokenizer can't extract trigrams from queries shorter than 3
    // characters, so 2-char CJK terms (e.g. "飞书") would miss entirely. Fall back
    // to a LIKE scan for those — slower, but only triggered on very short queries.
    if (q.length < 3) {
      const like = '%' + q.replace(/[%_\\]/g, (m) => '\\' + m) + '%';
      try {
        return this.db.prepare(
          `SELECT conversation_id, message_id, role, '' AS preview
           FROM messages_fts WHERE text LIKE ? ESCAPE '\\' LIMIT ?`
        ).all(like, limit);
      } catch (e) {
        console.warn('[store] searchMessages (LIKE) failed:', e.message);
        return [];
      }
    }
    // Wrap as an FTS5 phrase query so user input can't inject AND/OR/NOT/* operators.
    const ftsQuery = '"' + q.replace(/"/g, '""') + '"';
    try {
      return this.db.prepare(
        `SELECT conversation_id, message_id, role,
                snippet(messages_fts, 0, '【', '】', '...', 24) AS preview
         FROM messages_fts WHERE messages_fts MATCH ?
         ORDER BY rank LIMIT ?`
      ).all(ftsQuery, limit);
    } catch (e) {
      console.warn('[store] searchMessages failed:', e.message);
      return [];
    }
  }

  // ── Token / cost statistics (functions 1 & 3) ──────────────────

  /** All conversations (used by the backfill engine to find candidates). */
  getAllConversations() {
    return this.db.prepare('SELECT * FROM conversations').all();
  }

  /** All conversations newest-first. Used by the manual "reindex all" action so
   *  already-indexed-but-stale sessions also get refreshed (backfillConversation
   *  re-indexes any whose file mtime is newer than stats_updated_at). */
  getAllConversationsOrdered() {
    return this.db.prepare('SELECT * FROM conversations ORDER BY updated_at DESC').all();
  }

  /** Conversations not yet indexed (stats_updated_at = 0), newest first. */
  getConversationsNeedingBackfill(limit = 1000) {
    return this.db.prepare(
      'SELECT * FROM conversations WHERE stats_updated_at = 0 ORDER BY updated_at DESC LIMIT ?'
    ).all(limit);
  }

  /**
   * Re-index a whole conversation in a SINGLE transaction: clear old FTS rows,
   * bulk-insert new ones, then update token stats. Turns N per-message fsyncs
   * into one — critical so backfill doesn't lock up the main process.
   */
  reindexConversation(convId, items, tokenStats) {
    const tx = this.db.transaction(() => {
      this.clearFtsForConversation(convId);
      const ins = this.db.prepare(
        'INSERT INTO messages_fts (text, conversation_id, message_id, role) VALUES (?, ?, ?, ?)'
      );
      for (const it of items) {
        if (!it.messageId) continue;
        const t = typeof it.text === 'string' ? it.text.trim() : '';
        if (!t) continue;
        ins.run(t.slice(0, 50000), convId, it.messageId, it.role || '');
      }
      this.updateTokens(convId, tokenStats);
    });
    tx();
  }

  /**
   * Overwrite a conversation's token stats. Written by the backfill engine
   * (which re-aggregates the whole file), so this is a full replace.
   */
  updateTokens(convId, stats) {
    this.db.prepare(
      `UPDATE conversations SET
         input_tokens = ?, output_tokens = ?, cache_read_tokens = ?,
         cache_creation_tokens = ?, assistant_turns = ?, models = ?, stats_updated_at = ?
       WHERE id = ?`
    ).run(
      stats.input || 0, stats.output || 0, stats.cacheRead || 0,
      stats.cacheCreation || 0, stats.turns || 0,
      Array.isArray(stats.models) ? stats.models.join(',') : (stats.models || ''),
      stats.updatedAt || 0, convId
    );
  }

  /**
   * Record the most recent live-run cost/duration. USD cost is only available
   * from the real-time result frame, so we store it per-conversation as "last run".
   */
  updateRuntime(convId, stats) {
    const sets = [];
    const values = [];
    if (stats.costUsd != null) { sets.push('last_cost_usd = ?'); values.push(stats.costUsd); }
    if (stats.durationMs != null) { sets.push('last_duration_ms = ?'); values.push(stats.durationMs); }
    sets.push('last_run_at = ?'); values.push(stats.runAt || Date.now());
    values.push(convId);
    this.db.prepare(`UPDATE conversations SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  }

  /** Aggregate stats: global totals + per-project breakdown. */
  getStatsOverview() {
    const totals = this.db.prepare(
      `SELECT
         COUNT(*) AS conversations,
         COALESCE(SUM(input_tokens), 0) AS input_tokens,
         COALESCE(SUM(output_tokens), 0) AS output_tokens,
         COALESCE(SUM(cache_read_tokens), 0) AS cache_read_tokens,
         COALESCE(SUM(cache_creation_tokens), 0) AS cache_creation_tokens,
         COALESCE(SUM(assistant_turns), 0) AS assistant_turns,
         COALESCE(SUM(last_cost_usd), 0) AS last_cost_total
       FROM conversations`
    ).get();

    const byProject = this.db.prepare(
      `SELECT p.id AS project_id, p.name AS project_name, p.path AS project_path,
              COUNT(c.id) AS conversations,
              COALESCE(SUM(c.input_tokens), 0) AS input_tokens,
              COALESCE(SUM(c.output_tokens), 0) AS output_tokens,
              COALESCE(SUM(c.cache_read_tokens), 0) AS cache_read_tokens,
              COALESCE(SUM(c.cache_creation_tokens), 0) AS cache_creation_tokens,
              COALESCE(SUM(c.assistant_turns), 0) AS assistant_turns,
              COALESCE(SUM(c.last_cost_usd), 0) AS last_cost_total
       FROM projects p
       LEFT JOIN conversations c ON c.project_id = p.id
       GROUP BY p.id
       ORDER BY (COALESCE(SUM(c.input_tokens),0) + COALESCE(SUM(c.output_tokens),0)) DESC`
    ).all();

    return { totals, byProject };
  }

  /**
   * Token usage grouped by day (based on each conversation's updated_at).
   * Note: coarse-grained — a long-running session is bucketed by its last-updated day.
   */
  getStatsByDay(days = 30) {
    return this.db.prepare(
      `SELECT date(updated_at / 1000, 'unixepoch', 'localtime') AS day,
              COUNT(*) AS conversations,
              COALESCE(SUM(input_tokens), 0) AS input_tokens,
              COALESCE(SUM(output_tokens), 0) AS output_tokens,
              COALESCE(SUM(cache_read_tokens), 0) AS cache_read_tokens
       FROM conversations
       WHERE stats_updated_at > 0
       GROUP BY day
       ORDER BY day DESC
       LIMIT ?`
    ).all(days);
  }

  /** Model usage by number of conversations that used each model. */
  getStatsByModel() {
    const rows = this.db.prepare("SELECT models FROM conversations WHERE models != ''").all();
    const map = {};
    for (const r of rows) {
      for (const m of String(r.models).split(',').map(s => s.trim()).filter(Boolean)) {
        if (!map[m]) map[m] = { model: m, conversations: 0 };
        map[m].conversations += 1;
      }
    }
    return Object.values(map).sort((a, b) => b.conversations - a.conversations);
  }

  /**
   * One-time migration: clear all titles so they are re-extracted
   * with improved logic on next access.
   * Uses a pragma flag to ensure this only runs once.
   */
  cleanBadTitles() {
    // Check if migration already done
    const done = this.db.pragma('main.user_version', { simple: true });
    if (done >= 1) return 0;

    const stmt = this.db.prepare('UPDATE conversations SET title = NULL');
    const result = stmt.run();

    // Mark migration as done
    this.db.pragma('main.user_version = 1');
    return result.changes;
  }

  // ── App settings (KV) ────────────────────────────────────────
  // Lightweight generic key/value store for app-level preferences that the main
  // process must read at startup (e.g. frostedGlass → window vibrancy/material).
  getAppSetting(key, fallback = null) {
    const row = this.db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
    if (row == null) return fallback;
    return row.value;
  }

  setAppSetting(key, value) {
    this.db.prepare(`
      INSERT INTO app_settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, String(value));
  }

  close() {
    this.db.close();
  }

  // ── Feishu config ──────────────────────────────────────────────

  getFeishuConfig() {
    const row = this.db.prepare('SELECT * FROM feishu_config WHERE id = 1').get();
    if (!row) return { app_id: '', app_secret: '', enabled: 0, allowed_users: '' };
    // Decrypt app_secret if encrypted
    if (row.app_secret && row.app_secret.startsWith('ENC:') && this._safeStorage) {
      try {
        const buf = Buffer.from(row.app_secret.slice(4), 'base64');
        row.app_secret = this._safeStorage.decryptBuffer(buf).toString('utf-8');
      } catch {
        // Decryption failed (different machine/keychain?) — treat as empty
        row.app_secret = '';
      }
    }
    return row;
  }

  saveFeishuConfig(appId, appSecret) {
    const now = Date.now();
    if (appSecret != null && appSecret !== '') {
      // Encrypt the secret if safeStorage is available
      let storedSecret = appSecret;
      if (this._safeStorage) {
        const encrypted = this._safeStorage.encryptString(appSecret);
        storedSecret = 'ENC:' + encrypted.toString('base64');
      }
      // Full save: both appId and appSecret provided
      this.db.prepare(`
        INSERT INTO feishu_config (id, app_id, app_secret, enabled, updated_at)
        VALUES (1, ?, ?, 1, ?)
        ON CONFLICT(id) DO UPDATE SET
          app_id = excluded.app_id,
          app_secret = excluded.app_secret,
          enabled = 1,
          updated_at = excluded.updated_at
      `).run(appId, storedSecret, now);
    } else {
      // Partial save: only update appId, preserve existing app_secret
      this.db.prepare(`
        INSERT INTO feishu_config (id, app_id, app_secret, enabled, updated_at)
        VALUES (1, ?, '', 1, ?)
        ON CONFLICT(id) DO UPDATE SET
          app_id = excluded.app_id,
          enabled = 1,
          updated_at = excluded.updated_at
      `).run(appId, now);
    }
  }

  setFeishuEnabled(enabled) {
    const now = Date.now();
    this.db.prepare(`
      UPDATE feishu_config SET enabled = ?, updated_at = ? WHERE id = 1
    `).run(enabled ? 1 : 0, now);
  }

  // ── Feishu sender allowlist (C2) ──────────────────────────────

  /**
   * Allowed Feishu sender open_ids. Empty array = allow everyone.
   * @returns {string[]}
   */
  getAllowedUsers() {
    const row = this.db.prepare('SELECT allowed_users FROM feishu_config WHERE id = 1').get();
    if (!row || !row.allowed_users) return [];
    return row.allowed_users.split(',').map((s) => s.trim()).filter(Boolean);
  }

  /**
   * Set the allowed Feishu sender open_ids.
   * @param {string[]} users
   */
  setAllowedUsers(users) {
    const now = Date.now();
    const value = Array.isArray(users)
      ? users.map((s) => String(s).trim()).filter(Boolean).join(',')
      : '';
    // Upsert config row so UPDATE succeeds even before credentials are saved.
    this.db.prepare(`
      INSERT INTO feishu_config (id, app_id, app_secret, enabled, allowed_users, updated_at)
      VALUES (1, '', '', 0, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        allowed_users = excluded.allowed_users,
        updated_at = excluded.updated_at
    `).run(value, now);
  }

  // ── Multi-bot migration (design §12) ──────────────────────────

  /**
   * One-time migration to the multi-bot schema. Idempotent via the
   * app_settings.feishu_multi_bot_migrated flag. Run after safeStorage is
   * injected (e.g. from BotManager.loadAll) so credentials rescued from
   * cc-connect are encrypted.
   *
   * Single transaction: schema upgrade (legacy feishu_bindings → renamed
   * backup + new bot_id-keyed table) → build bot 1 from feishu_config (with
   * cc-connect credential rescue) → move at most one legacy binding → flag.
   */
  migrateToMultiBot() {
    if (this.getAppSetting('feishu_multi_bot_migrated') === '1') return;

    const tx = this.db.transaction(() => {
      // 1. Detect legacy feishu_bindings (has chat_id column) → rename aside.
      const cols = this.db.prepare('PRAGMA table_info(feishu_bindings)').all();
      const hasLegacyBindings = cols.length > 0 && cols.some((c) => c.name === 'chat_id');
      if (hasLegacyBindings) {
        this.db.exec('ALTER TABLE feishu_bindings RENAME TO feishu_bindings_legacy');
      }

      // 2. New feishu_bindings: bot_id UNIQUE, no chat_id/chat_type (design §4.2).
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS feishu_bindings (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          bot_id      INTEGER NOT NULL UNIQUE REFERENCES feishu_bots(id) ON DELETE CASCADE,
          jsonl_path  TEXT NOT NULL,
          session_id  TEXT NOT NULL,
          project_dir TEXT NOT NULL,
          active      INTEGER NOT NULL DEFAULT 1,
          created_at  INTEGER NOT NULL,
          updated_at  INTEGER NOT NULL
        )
      `);
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_feishu_bindings_jsonl ON feishu_bindings(jsonl_path)');

      // 3. Source credentials: feishu_config first, then cc-connect rescue.
      let config = this.db.prepare('SELECT * FROM feishu_config WHERE id = 1').get();
      if (!config || !config.app_id) {
        this._rescueCcConnectCredentials();
        config = this.db.prepare('SELECT * FROM feishu_config WHERE id = 1').get();
      }

      // 4. Build bot 1 only when a valid app_id exists (design §12).
      if (config && config.app_id) {
        const legacyExists = !!this.db.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='feishu_bindings_legacy'"
        ).get();

        // project_dir priority: active legacy → latest legacy → empty (design §12).
        let projectDir = '';
        if (legacyExists) {
          const activeRow = this.db.prepare(
            "SELECT project_dir FROM feishu_bindings_legacy WHERE active = 1 AND project_dir != '' ORDER BY updated_at DESC, created_at DESC LIMIT 1"
          ).get();
          if (activeRow) {
            projectDir = activeRow.project_dir;
          } else {
            const latestRow = this.db.prepare(
              "SELECT project_dir FROM feishu_bindings_legacy WHERE project_dir != '' ORDER BY updated_at DESC, created_at DESC LIMIT 1"
            ).get();
            if (latestRow) projectDir = latestRow.project_dir;
          }
        }

        const oldEnabled = !!(config && config.enabled);
        const enabled = oldEnabled && projectDir !== '' ? 1 : 0;
        const now = Date.now();
        this.db.prepare(`
          INSERT INTO feishu_bots (id, name, app_id, app_secret, project_dir, allowed_users, enabled, created_at, updated_at)
          VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            app_id = excluded.app_id,
            app_secret = excluded.app_secret,
            project_dir = excluded.project_dir,
            allowed_users = excluded.allowed_users,
            enabled = excluded.enabled,
            updated_at = excluded.updated_at
        `).run('默认机器人', config.app_id, config.app_secret || '', projectDir, config.allowed_users || '', enabled, now, now);

        // 5. Move at most one legacy binding to bot 1 (bot_id UNIQUE is row-level).
        if (legacyExists) {
          let source = this.db.prepare(
            'SELECT * FROM feishu_bindings_legacy WHERE active = 1 ORDER BY updated_at DESC, created_at DESC LIMIT 1'
          ).get();
          if (!source) {
            source = this.db.prepare(
              'SELECT * FROM feishu_bindings_legacy ORDER BY updated_at DESC, created_at DESC LIMIT 1'
            ).get();
          }
          if (source) {
            this.db.prepare(`
              INSERT INTO feishu_bindings (bot_id, jsonl_path, session_id, project_dir, active, created_at, updated_at)
              VALUES (1, ?, ?, ?, 1, ?, ?)
              ON CONFLICT(bot_id) DO UPDATE SET
                jsonl_path = excluded.jsonl_path,
                session_id = excluded.session_id,
                project_dir = excluded.project_dir,
                active = 1,
                updated_at = excluded.updated_at
            `).run(source.jsonl_path, source.session_id, source.project_dir || projectDir, source.created_at || now, source.updated_at || now);
          }
        }
      }

      // 6. Mark migration done.
      this.setAppSetting('feishu_multi_bot_migrated', '1');
    });

    tx();
  }

  /**
   * Rescue Feishu credentials from the legacy cc-connect config (design §12).
   * Only writes when feishu_config has no app_id. Mirrors the old
   * FeishuBridge.migrateFromCcConnect (bridge.js:705), relocated into the store
   * so the migration owns credential rescue end-to-end.
   */
  _rescueCcConnectCredentials() {
    let tomlPath;
    try {
      tomlPath = path.join(os.homedir(), '.cc-connect', 'config.toml');
    } catch { return; }
    if (!fs.existsSync(tomlPath)) return;
    try {
      const smolTOML = require('smol-toml');
      const data = smolTOML.parse(fs.readFileSync(tomlPath, 'utf-8'));
      const projects = data.projects;
      if (!Array.isArray(projects)) return;
      for (const project of projects) {
        const platforms = project.platforms;
        if (!Array.isArray(platforms)) continue;
        for (const platform of platforms) {
          if (platform.type === 'feishu' && platform.options) {
            const { app_id, app_secret } = platform.options;
            if (app_id && app_secret) { this.saveFeishuConfig(app_id, app_secret); return; }
          }
        }
      }
    } catch (err) { console.warn('[store] cc-connect rescue failed:', err.message); }
  }

  // ── Feishu bots (multi-bot, design §4.1) ──────────────────────

  listBots() {
    return this.db.prepare('SELECT * FROM feishu_bots ORDER BY id ASC').all();
  }

  getBot(botId) {
    return this.db.prepare('SELECT * FROM feishu_bots WHERE id = ?').get(botId) || null;
  }

  /**
   * Create a bot. app_id must be globally unique (DB UNIQUE + app-level guard);
   * throws on duplicate. app_secret is encrypted via safeStorage when available
   * (ENC: prefix). Created bots default to enabled=0 — enable via toggleBot.
   */
  createBot({ name, appId, appSecret, projectDir, allowedUsers }) {
    const cleanAppId = String(appId || '').trim();
    if (!cleanAppId) throw new Error('app_id 不能为空');
    if (this.db.prepare('SELECT 1 FROM feishu_bots WHERE app_id = ?').get(cleanAppId)) {
      throw new Error('该 app_id 已被其他机器人使用');
    }
    const now = Date.now();
    const result = this.db.prepare(`
      INSERT INTO feishu_bots (name, app_id, app_secret, project_dir, allowed_users, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?)
    `).run(
      String(name || '').trim() || cleanAppId,
      cleanAppId,
      this._encryptSecret(appSecret),
      String(projectDir || '').trim(),
      this._normalizeAllowedUsers(allowedUsers),
      now, now
    );
    return this.getBot(result.lastInsertRowid);
  }

  /**
   * Update a bot. app_id is immutable. project_dir is locked once non-empty,
   * EXCEPT a one-time fill when currently empty (migration legacy, design
   * §11.1/§12). app_secret is re-encrypted only when a non-empty value is given.
   */
  updateBot(botId, fields) {
    const bot = this.getBot(botId);
    if (!bot) throw new Error('机器人不存在');

    const sets = [];
    const values = [];

    if (Object.prototype.hasOwnProperty.call(fields, 'name')) {
      sets.push('name = ?');
      values.push(String(fields.name || '').trim() || bot.app_id);
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'appSecret') && fields.appSecret) {
      sets.push('app_secret = ?');
      values.push(this._encryptSecret(fields.appSecret));
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'allowedUsers')) {
      sets.push('allowed_users = ?');
      values.push(this._normalizeAllowedUsers(fields.allowedUsers));
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'enabled')) {
      sets.push('enabled = ?');
      values.push(fields.enabled ? 1 : 0);
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'projectDir')) {
      // Locked once non-empty; only a one-time fill from empty is allowed.
      if (bot.project_dir && bot.project_dir !== '') {
        throw new Error('服务目录已锁定，更换目录需删除后重建机器人');
      }
      sets.push('project_dir = ?');
      values.push(String(fields.projectDir || '').trim());
    }

    if (sets.length === 0) return bot;

    sets.push('updated_at = ?');
    values.push(Date.now());
    values.push(botId);
    this.db.prepare(`UPDATE feishu_bots SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    return this.getBot(botId);
  }

  /**
   * Delete a bot. store.js does not enable PRAGMA foreign_keys, so CASCADE does
   * not fire — manually delete the bot's binding in the same transaction
   * (design §10.3). The IPC layer must have already blocked online/bound bots.
   */
  deleteBot(botId) {
    const tx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM feishu_bindings WHERE bot_id = ?').run(botId);
      this.db.prepare('DELETE FROM feishu_bots WHERE id = ?').run(botId);
    });
    tx();
  }

  /**
   * Decrypt an app_secret ciphertext (ENC: prefix + safeStorage). Returns '' if
   * undecryptable (different keychain); plaintext (no ENC: prefix) returned as-is.
   * Used by BotRuntime.start in the main process only — never sent to the
   * renderer (design §4.1).
   */
  decryptSecret(cipher) {
    const s = String(cipher || '');
    if (!s) return '';
    if (s.startsWith('ENC:') && this._safeStorage) {
      try {
        const buf = Buffer.from(s.slice(4), 'base64');
        return this._safeStorage.decryptBuffer(buf).toString('utf-8');
      } catch {
        return '';
      }
    }
    return s;
  }

  _encryptSecret(plain) {
    const s = String(plain || '');
    if (!s) return '';
    if (this._safeStorage) {
      try {
        return 'ENC:' + this._safeStorage.encryptString(s).toString('base64');
      } catch {
        return s; // fall back to plaintext if encryption unexpectedly fails
      }
    }
    return s; // safeStorage not injected — plaintext (dev/migration window only)
  }

  _normalizeAllowedUsers(users) {
    if (!users) return '';
    if (Array.isArray(users)) {
      return users.map((s) => String(s).trim()).filter(Boolean).join(',');
    }
    return String(users).split(',').map((s) => s.trim()).filter(Boolean).join(',');
  }

  // ── Feishu bindings (bot-level, design §4.2) ──────────────────

  /** The active binding for a bot (each bot has at most one row via bot_id UNIQUE). */
  getActiveBindingByBot(botId) {
    return this.db.prepare('SELECT * FROM feishu_bindings WHERE bot_id = ? AND active = 1').get(botId) || null;
  }

  /**
   * Upsert a bot's binding (active=1). The same bot row is overwritten, so the
   * previously bound session loses its entry without an explicit unbind (design §10.3).
   */
  upsertBindingByBot(botId, { jsonlPath, sessionId, projectDir }) {
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO feishu_bindings (bot_id, jsonl_path, session_id, project_dir, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(bot_id) DO UPDATE SET
        jsonl_path = excluded.jsonl_path,
        session_id = excluded.session_id,
        project_dir = excluded.project_dir,
        active = 1,
        updated_at = excluded.updated_at
    `).run(botId, jsonlPath, sessionId, projectDir, now, now);
    return this.getActiveBindingByBot(botId);
  }

  /** Patch fields on a bot's binding (kept active). Used by /switch, /new. */
  updateBindingByBot(botId, fields) {
    const colMap = { sessionId: 'session_id', jsonlPath: 'jsonl_path', projectDir: 'project_dir' };
    const sets = [];
    const values = [];
    for (const [key, value] of Object.entries(fields)) {
      const col = colMap[key];
      if (col) {
        sets.push(`${col} = ?`);
        values.push(value);
      }
    }
    if (sets.length === 0) return;
    sets.push('active = 1', 'updated_at = ?');
    values.push(Date.now());
    values.push(botId);
    this.db.prepare(
      `UPDATE feishu_bindings SET ${sets.join(', ')} WHERE bot_id = ?`
    ).run(...values);
  }

  clearBindingByBot(botId) {
    this.db.prepare('UPDATE feishu_bindings SET active = 0 WHERE bot_id = ?').run(botId);
  }

  getBindingByJsonlPath(jsonlPath) {
    return this.db.prepare('SELECT * FROM feishu_bindings WHERE jsonl_path = ? AND active = 1').get(jsonlPath) || null;
  }

}

module.exports = { Store };
