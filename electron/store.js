'use strict';

const Database = require('better-sqlite3');
const path = require('path');

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

      CREATE INDEX IF NOT EXISTS idx_conversations_project_id ON conversations(project_id);
      CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at);
      CREATE INDEX IF NOT EXISTS idx_feishu_bindings_jsonl ON feishu_bindings(jsonl_path);
    `);

    // Migration: drop stale unique index on chat_id (was causing rebind failures)
    try {
      this.db.exec('DROP INDEX IF EXISTS idx_feishu_bindings_chat');
    } catch (e) {
      // Ignore if already dropped
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

  upsertConversation(projectId, filePath, fileSize, updatedAt) {
    const stmt = this.db.prepare(`
      INSERT INTO conversations (project_id, file_path, file_size, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(file_path) DO UPDATE SET
        project_id = excluded.project_id,
        file_size = excluded.file_size,
        updated_at = excluded.updated_at
    `);
    const result = stmt.run(projectId, filePath, fileSize, updatedAt);
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
    const stmt = this.db.prepare('DELETE FROM conversations WHERE file_path = ?');
    return stmt.run(filePath);
  }

  deleteProject(projectId) {
    // Delete associated conversations first (due to foreign key)
    const deleteConvs = this.db.prepare('DELETE FROM conversations WHERE project_id = ?');
    deleteConvs.run(projectId);
    // Then delete the project
    const deleteProj = this.db.prepare('DELETE FROM projects WHERE id = ?');
    return deleteProj.run(projectId);
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

  close() {
    this.db.close();
  }

  // ── Feishu config ──────────────────────────────────────────────

  getFeishuConfig() {
    const row = this.db.prepare('SELECT * FROM feishu_config WHERE id = 1').get();
    if (!row) return { app_id: '', app_secret: '', enabled: 0 };
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

  // ── Feishu bindings ────────────────────────────────────────────

  createBinding(chatId, chatType, jsonlPath, sessionId, projectDir) {
    // Deactivate any existing binding first
    this.db.prepare('UPDATE feishu_bindings SET active = 0 WHERE active = 1').run();

    // Remove old rows with the same chat_id to avoid stale data
    this.db.prepare('DELETE FROM feishu_bindings WHERE chat_id = ? AND jsonl_path != ?').run(chatId, jsonlPath);

    const now = Date.now();
    this.db.prepare(`
      INSERT INTO feishu_bindings (chat_id, chat_type, jsonl_path, session_id, project_dir, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(jsonl_path) DO UPDATE SET
        chat_id = excluded.chat_id,
        chat_type = excluded.chat_type,
        session_id = excluded.session_id,
        project_dir = excluded.project_dir,
        active = 1,
        updated_at = excluded.updated_at
    `).run(chatId, chatType, jsonlPath, sessionId, projectDir, now, now);
  }

  getBindingByChatId(chatId) {
    return this.db.prepare('SELECT * FROM feishu_bindings WHERE chat_id = ? AND active = 1').get(chatId) || null;
  }

  getBindingByJsonlPath(jsonlPath) {
    return this.db.prepare('SELECT * FROM feishu_bindings WHERE jsonl_path = ? AND active = 1').get(jsonlPath) || null;
  }

  getActiveBinding() {
    return this.db.prepare('SELECT * FROM feishu_bindings WHERE active = 1').get() || null;
  }

  deactivateAllBindings() {
    this.db.prepare('UPDATE feishu_bindings SET active = 0').run();
  }

  /**
   * Update specific fields of an active binding identified by chatId.
   */
  updateBinding(chatId, fields) {
    const allowed = ['session_id', 'jsonl_path', 'project_dir', 'chat_type'];
    const sets = [];
    const values = [];

    for (const [key, value] of Object.entries(fields)) {
      if (allowed.includes(key)) {
        sets.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (sets.length === 0) return;

    const now = Date.now();
    sets.push('updated_at = ?');
    values.push(now);
    values.push(chatId);

    this.db.prepare(
      `UPDATE feishu_bindings SET ${sets.join(', ')} WHERE chat_id = ? AND active = 1`
    ).run(...values);
  }
}

module.exports = { Store };
