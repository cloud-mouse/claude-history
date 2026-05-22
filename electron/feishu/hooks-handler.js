'use strict';

const http = require('http');
const crypto = require('crypto');
const { buildPermissionCard, buildConfirmResultCard, buildToolDetail } = require('./cards');

const BASE_PORT = 19876;
const MAX_PORT_ATTEMPTS = 10;

class HooksHandler {
  /**
   * @param {import('./permissions').PermissionManager} permissions
   * @param {Function} sendCardFn - async (chatId, card) => messageId
   * @param {Function} updateCardFn - async (messageId, card) => void
   * @param {Function} getActiveChatIdFn - () => chatId|null
   */
  constructor(permissions, sendCardFn, updateCardFn, getActiveChatIdFn) {
    this._permissions = permissions;
    this._sendCard = sendCardFn;
    this._updateCard = updateCardFn;
    this._getActiveChatId = getActiveChatIdFn;
    this._server = null;
    this._port = null;
  }

  /** Port the hook server is listening on, or null if not started. */
  get port() { return this._port; }

  /**
   * Start the HTTP server. Tries ports BASE_PORT through BASE_PORT + MAX_PORT_ATTEMPTS - 1.
   * Returns the actual port used.
   */
  start() {
    return new Promise((resolve, reject) => {
      let attempts = 0;

      const tryListen = (port) => {
        const server = http.createServer(async (req, res) => {
          await this._handleRequest(req, res);
        });

        server.on('error', (err) => {
          if (err.code === 'EADDRINUSE') {
            attempts++;
            if (attempts >= MAX_PORT_ATTEMPTS) {
              reject(new Error(`All ports ${BASE_PORT}-${BASE_PORT + MAX_PORT_ATTEMPTS - 1} are in use`));
              return;
            }
            tryListen(BASE_PORT + attempts);
          } else {
            reject(err);
          }
        });

        server.listen(port, '127.0.0.1', () => {
          this._server = server;
          this._port = port;
          console.log(`[feishu:hooks] HTTP server listening on 127.0.0.1:${port}`);
          resolve(port);
        });
      };

      tryListen(BASE_PORT);
    });
  }

  /** Stop the HTTP server and clear all pending confirmations. */
  stop() {
    if (this._server) {
      this._server.close();
      this._server = null;
    }
    this._port = null;
    this._permissions.clearAll();
  }

  /**
   * Handle an incoming HTTP request from feishu-hook-script.js.
   * POST /hook — tool permission check
   */
  async _handleRequest(req, res) {
    if (req.method !== 'POST' || !req.url?.startsWith('/hook')) {
      res.writeHead(404);
      res.end('not found');
      return;
    }

    // Read request body
    const body = await this._readBody(req);
    let hookData;
    try {
      hookData = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' }
      }));
      return;
    }

    const { tool_name, tool_input, tool_use_id, cwd } = hookData;

    // Check if auto-approved
    if (this._permissions.isAutoApproved(tool_name)) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' }
      }));
      return;
    }

    // Need confirmation — get active chatId
    const chatId = this._getActiveChatId();
    if (!chatId) {
      // No active chat, fail-open
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' }
      }));
      return;
    }

    // Create pending confirmation
    const requestId = tool_use_id || crypto.randomUUID();
    const pendingPromise = this._permissions.addPending(requestId, chatId);

    // Send confirmation card to Feishu
    const card = buildPermissionCard(requestId, tool_name, tool_input || {}, cwd || '');
    const cardMessageId = await this._sendCard(chatId, card).catch(() => null);

    // Store cardMessageId for later updates
    const pending = this._permissions.getPending(requestId);
    if (pending && cardMessageId) {
      pending.cardMessageId = cardMessageId;
    }

    // Wait for user response (max 60s — timeout handled in permissions)
    const result = await pendingPromise;

    // Update Feishu card — preserve tool detail for chat history
    if (cardMessageId) {
      const detail = buildToolDetail(tool_name, tool_input || {}, cwd || '');
      const updateCard = result.decision === 'allow'
        ? buildConfirmResultCard('✅ 已允许', 'green', detail)
        : result.reason === 'timeout'
          ? buildConfirmResultCard('⏰ 已超时 (60s)', 'grey', detail)
          : buildConfirmResultCard('❌ 已拒绝', 'red', detail);
      await this._updateCard(cardMessageId, updateCard).catch(() => {});
    }

    // Respond to hook script
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: result.decision === 'allow' ? 'allow' : 'deny',
        permissionDecisionReason: result.reason || ''
      }
    }));
  }

  /** Read the full body of an HTTP request. */
  _readBody(req) {
    return new Promise((resolve, reject) => {
      let data = '';
      const MAX_BODY = 1024 * 1024; // 1MB
      req.on('data', (chunk) => {
        data += chunk;
        if (data.length > MAX_BODY) { req.destroy(); reject(new Error('Body too large')); }
      });
      req.on('end', () => resolve(data));
      req.on('error', reject);
    });
  }

  /**
   * Resolve a pending hook confirmation from a Feishu card action.
   * Called by bridge.js when user clicks a button.
   */
  handleCardAction(value) {
    if (!value || !value.requestId) return false;

    const { requestId, action, toolName } = value;

    if (action === 'hook_allow') {
      return this._permissions.resolvePending(requestId, 'allow');
    }
    if (action === 'hook_deny') {
      return this._permissions.resolvePending(requestId, 'deny');
    }
    if (action === 'hook_always_allow') {
      if (toolName) this._permissions.sessionAllow(toolName);
      return this._permissions.resolvePending(requestId, 'allow');
    }

    return false;
  }
}

module.exports = { HooksHandler, BASE_PORT };
