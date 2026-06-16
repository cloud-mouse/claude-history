'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { WSClient, EventDispatcher, Client } = require('@larksuiteoapi/node-sdk');

const { PermissionManager } = require('./permissions');
const { HooksHandler } = require('./hooks-handler');
const { handleCommand } = require('./commands');
const { spawnClaude } = require('./claude-spawn');
const { resolveCwd, watchBinding } = require('./binding');
const { buildResponseCard, buildErrorCard, buildWarningCard, buildConfirmResultCard, extractCardText } = require('./cards');

const CC_DIR = () => path.join(os.homedir(), '.cc-connect');

class FeishuBridge {
  constructor(store, mainWindow) {
    this.store = store;
    this.mainWindow = mainWindow;
    this.wsClient = null;
    this.eventDispatcher = null;
    this.client = null;
    this._seenMsgIds = new Set();
    this._connected = false;
    this._processing = false;
    this._claudeProcess = null;
    this._model = null;
    this._lastMessage = null;
    this._confirmMode = false;
    this._terminatedByUser = false;
    this._unwatchCleanup = null;
    this._legacyConfirmations = new Map();

    this._permissions = new PermissionManager();
    this._hooksHandler = new HooksHandler(
      this._permissions,
      (chatId, card) => this._sendCard(chatId, card),
      (msgId, card) => this._updateCard(msgId, card),
      () => this._getActiveChatId()
    );
  }

  get isConnected() { return this._connected; }

  getStatus() {
    const config = this.store.getFeishuConfig();
    const binding = this.store.getActiveBinding();
    return {
      connected: this._connected,
      enabled: !!(config && config.app_id && config.enabled),
      hasConfig: !!(config && config.app_id),
      binding: binding ? { chatId: binding.chat_id, jsonlPath: binding.jsonl_path, sessionId: binding.session_id } : null,
      processing: this._processing
    };
  }

  async start() {
    const config = this.store.getFeishuConfig();
    if (!config || !config.app_id || !config.app_secret) throw new Error('飞书凭证未配置');
    if (this._connected && this.wsClient) return { success: true, message: 'already connected' };

    await this._hooksHandler.start();

    this.client = new Client({ appId: config.app_id, appSecret: config.app_secret });

    this.eventDispatcher = new EventDispatcher({}).register({
      'im.message.receive_v1': async (data) => {
        try {
          const msg = this._normalizeMessage(data);
          if (!msg) return;
          if (this._seenMsgIds.has(msg.messageId)) return;
          this._seenMsgIds.add(msg.messageId);
          if (this._seenMsgIds.size > 200) this._seenMsgIds = new Set([...this._seenMsgIds].slice(-100));
          await this._handleMessage(msg);
        } catch (err) {
          console.error('[feishu] Error handling message:', err.message);
          try {
            const chatId = data?.message?.chat_id;
            if (chatId) await this._sendCard(chatId, buildErrorCard(`内部错误: ${err.message}`));
          } catch (_) {}
        }
      },
      'card.action.trigger': async (data) => {
        let ok = false;
        try { ok = await this._handleCardAction(data); }
        catch (err) { console.error('[feishu][cardAction] ERROR:', err.message); }
        // H9: report the real outcome instead of always claiming success.
        return { toast: { type: ok ? 'success' : 'error', content: ok ? '已处理' : '操作未生效（请求已过期或无效）' } };
      },
      // No-op handlers to suppress "no handle" warnings for common events
      'im.message.reaction.created_v1': async () => {},
      'im.message.reaction.deleted_v1': async () => {},
      'im.chat.member.bot.added_v1': async () => {},
      'drive.notice.comment_add_v1': async () => {},
    });

    this.wsClient = new WSClient({
      appId: config.app_id, appSecret: config.app_secret,
      onReconnecting: () => { this._connected = false; this._notifyRenderer('feishu:statusChanged', { connected: false }); },
      onReconnected: () => { this._connected = true; this._notifyRenderer('feishu:statusChanged', { connected: true }); }
    });

    try {
      await this.wsClient.start({ eventDispatcher: this.eventDispatcher });
      this._connected = true;
      this.store.setFeishuEnabled(true);
      const binding = this.store.getActiveBinding();
      if (binding) this._watchBinding(binding);
      return { success: true };
    } catch (err) {
      this._connected = false;
      throw new Error(`飞书连接失败: ${err.message}`);
    }
  }

  async stop() {
    this._unwatch();
    this._killClaudeProcess('SIGTERM');
    this._hooksHandler.stop();
    this._processing = false;
    this.wsClient = null;
    this.eventDispatcher = null;
    this.client = null;
    this._connected = false;
    this.store.setFeishuEnabled(false);
    return { success: true };
  }

  async bindSession(jsonlPath, projectDir) {
    if (!jsonlPath) return { success: false, error: '缺少会话路径' };
    const realProjectDir = resolveCwd(jsonlPath) || projectDir || process.cwd();
    const sessionId = path.basename(jsonlPath, '.jsonl');
    this.store.deactivateAllBindings();
    const chatId = `_pending_${sessionId.slice(0, 8)}`;
    this.store.createBinding(chatId, 'p2p', jsonlPath, sessionId, realProjectDir);
    this._watchBinding({ jsonl_path: jsonlPath, session_id: sessionId });
    return { success: true, sessionId, jsonlPath, message: '已绑定。发送任意飞书消息给机器人即可关联。' };
  }

  unbind() {
    this._unwatch();
    this.store.deactivateAllBindings();
    return { success: true };
  }

  // ── Message Handling ──

  async _handleMessage(msg) {
    const chatId = msg.chatId;
    const chatType = msg.chatType || 'p2p';
    const messageText = this._extractText(msg);

    // C2: enforce sender allowlist. Empty list = allow everyone (backward-compatible).
    const allowed = this.store.getAllowedUsers();
    if (allowed.length > 0 && !allowed.includes(msg.senderOpenId)) {
      await this._sendCard(chatId, buildWarningCard('🚫 无权限', '你没有权限使用此机器人。请联系所有者在桌面端配置白名单。')).catch(() => {});
      return;
    }

    if (messageText.startsWith('/')) {
      const binding = this.store.getBindingByChatId(chatId) || this._tryPendingBinding(chatId, chatType);
      await handleCommand({
        chatId, text: messageText, binding,
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
        permissions: this._permissions,
        notifyRenderer: (ch, d) => this._notifyRenderer(ch, d),
        spawnClaude: (opts) => this._doSpawnClaude(opts),
        store: this.store,
        args: messageText.split(' ').slice(1).join(' '),
      });
      return;
    }

    let binding = this.store.getBindingByChatId(chatId);
    if (!binding) binding = this._tryPendingBinding(chatId, chatType);
    if (!binding) {
      await this._sendCard(chatId, buildWarningCard('😔 未绑定会话', '此飞书会话未绑定到 Claude Code\n\n请在 **claude-history** 桌面应用中点击「绑定到飞书」按钮'));
      return;
    }

    // H8: serialize through _withProcessing (replaces manual _processing toggling).
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

        const response = await this._doSpawnClaude({ sessionId: binding.session_id, jsonlPath: binding.jsonl_path, message: messageText, chatId });
        this._touchConversation(binding.jsonl_path);

        if (reactionId) this._deleteReaction(msg.messageId, reactionId).catch(() => {});

        await this._sendCard(chatId, buildResponseCard(response));
        this._lastMessage = messageText;
        this._notifyRenderer('feishu:jsonlChanged', { jsonlPath: binding.jsonl_path, sessionId: binding.session_id });
      } catch (err) {
        if (reactionId) this._deleteReaction(msg.messageId, reactionId).catch(() => {});
        await this._sendCard(chatId, buildErrorCard(err.message)).catch(() => {});
      }
    });
  }

  _doSpawnClaude({ sessionId, jsonlPath, message, chatId }) {
    const hookPort = this._hooksHandler.port;
    const hookToken = this._hooksHandler.authToken;
    const self = this;
    return spawnClaude({
      sessionId, jsonlPath, message,
      model: self._model,
      hookPort, hookToken,
      permissionMode: self._permissions.mode,
      onSpawn: (child) => {
        // C3: keep the real child so /cancel & terminate actually kill it.
        self._claudeProcess = child;
        child.on('close', () => { if (self._claudeProcess === child) self._claudeProcess = null; });
      },
      onToolUse: () => {} // Real-time notification handled by hooks system
    });
  }

  // H8: single serialized entry point for any spawn path. The check+set is
  // synchronous so two messages cannot both pass the guard while awaiting IO.
  async _withProcessing(chatId, fn) {
    if (this._processing) {
      await this._sendCard(chatId, buildWarningCard('⏳ 请稍候', '正在处理上一条消息，请等待完成后再发送新消息'));
      return null;
    }
    this._processing = true;
    this._notifyRenderer('feishu:statusChanged', { processing: true });
    try {
      return await fn();
    } finally {
      this._processing = false;
      this._notifyRenderer('feishu:statusChanged', { processing: false });
    }
  }

  // ── Card Action Handling ──

  async _handleCardAction(data) {
    const value = data?.action?.value;
    const messageId = data?.context?.open_message_id || data?.open_message_id;
    if (!value || !value.requestId) return false;

    // New hooks-based permission confirmation
    if (value.action?.startsWith('hook_')) {
      return this._hooksHandler.handleCardAction(value);
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

    // Legacy tool notification actions
    if (value.action === 'terminate') {
      this._terminatedByUser = true;
      this._killClaudeProcess('SIGTERM');
      await this._updateCard(messageId, buildConfirmResultCard('🛑 已终止执行', 'red'));
      return true;
    }
    if (value.action === 'always_allow') {
      // H9: whitelist toolName — never let a forged button grant arbitrary tools.
      const { SENSITIVE_TOOLS } = require('./permissions');
      if (value.toolName && SENSITIVE_TOOLS.includes(value.toolName)) {
        this._permissions.alwaysAllow(value.toolName);
        await this._updateCard(messageId, buildConfirmResultCard(`🔓 已始终允许 ${value.toolName}`, 'green'));
        return true;
      }
      return false;
    }
    return false;
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
        .then(msgId => { const e = this._legacyConfirmations.get(requestId); if (e) e.cardMessageId = msgId; })
        .catch(err => { clearTimeout(timeout); this._legacyConfirmations.delete(requestId); reject(err); });
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
            tag: 'column_set',
            flex_mode: 'flow',
            columns: [
              {
                tag: 'column', width: 'auto', weight: 1, vertical_align: 'top',
                elements: [{
                  tag: 'button',
                  text: { tag: 'plain_text', content: '✅ 允许' },
                  type: 'primary',
                  behaviors: [{ type: 'callback', value: { requestId, action: 'approve' } }]
                }]
              },
              {
                tag: 'column', width: 'auto', weight: 1, vertical_align: 'top',
                elements: [{
                  tag: 'button',
                  text: { tag: 'plain_text', content: '❌ 拒绝' },
                  type: 'danger',
                  behaviors: [{ type: 'callback', value: { requestId, action: 'deny' } }]
                }]
              }
            ]
          },
          { tag: 'markdown', content: '_⏳ 5 分钟内未操作将自动拒绝_' }
        ]
      }
    };
  }

  // ── Helpers ──

  _getActiveChatId() {
    const binding = this.store.getActiveBinding();
    return (binding && !binding.chat_id.startsWith('_pending_')) ? binding.chat_id : null;
  }

  _tryPendingBinding(chatId, chatType) {
    const activeBinding = this.store.getActiveBinding();
    if (activeBinding && activeBinding.chat_id.startsWith('_pending_')) {
      this.store.createBinding(chatId, chatType, activeBinding.jsonl_path, activeBinding.session_id, activeBinding.project_dir);
      return this.store.getBindingByChatId(chatId);
    }
    return null;
  }

  _extractText(msg) {
    let text = typeof msg.content === 'string' ? msg.content : msg.text || String(msg.content || '');
    return text.replace(/^@\S+\s*/, '').trim();
  }

  _normalizeMessage(event) {
    const msg = event?.message;
    if (!msg) return null;
    let text = '';
    try {
      const parsed = JSON.parse(msg.content);
      text = typeof parsed === 'string' ? parsed : parsed.text || msg.content || '';
    } catch { text = msg.content || ''; }
    text = text.replace(/^@\S+\s*/, '').trim();
    // C2: capture sender identity for allowlist enforcement.
    const senderOpenId = event?.sender?.sender_id?.open_id
      || event?.event?.sender?.sender_id?.open_id
      || '';
    return { chatId: msg.chat_id, chatType: msg.chat_type || 'p2p', content: text, text, messageId: msg.message_id, senderOpenId };
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

  /** Add a reaction emoji to a message. Returns the reaction ID, or null. */
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

  /** Remove a reaction emoji from a message. */
  async _deleteReaction(messageId, reactionId) {
    if (!this.client || !messageId || !reactionId) return;
    try {
      await this.client.im.v1.messageReaction.delete({
        path: { message_id: messageId, reaction_id: reactionId }
      });
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
      this._notifyRenderer('feishu:jsonlChanged', { jsonlPath, sessionId });
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

  migrateFromCcConnect() {
    const config = this.store.getFeishuConfig();
    if (config && config.app_id) return false;
    const tomlPath = path.join(CC_DIR(), 'config.toml');
    if (!fs.existsSync(tomlPath)) return false;
    try {
      const smolTOML = require('smol-toml');
      const data = smolTOML.parse(fs.readFileSync(tomlPath, 'utf-8'));
      const projects = data.projects;
      if (!Array.isArray(projects)) return false;
      for (const project of projects) {
        const platforms = project.platforms;
        if (!Array.isArray(platforms)) continue;
        for (const platform of platforms) {
          if (platform.type === 'feishu' && platform.options) {
            const { app_id, app_secret } = platform.options;
            if (app_id && app_secret) { this.store.saveFeishuConfig(app_id, app_secret); return true; }
          }
        }
      }
    } catch (err) { console.warn('[feishu] Failed to migrate from cc-connect:', err.message); }
    return false;
  }
}

module.exports = { FeishuBridge };
