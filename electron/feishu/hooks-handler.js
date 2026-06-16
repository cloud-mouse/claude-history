'use strict';

const http = require('http');
const crypto = require('crypto');
const { buildPermissionCard, buildConfirmResultCard, buildToolDetail } = require('./cards');
const { SENSITIVE_TOOLS } = require('./permissions');

const BASE_PORT = 19876;
const MAX_PORT_ATTEMPTS = 10;

// Build a "deny" hook response so Claude blocks the tool call (fail-closed).
function denyResponse(reason) {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason || 'denied by hook safety policy'
    }
  };
}

function allowResponse() {
  return {
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' }
  };
}

function respond(res, payload, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

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
    // Per-instance random token shared with the hook script via env var.
    // Defends against local processes / DNS-rebinding forging allow decisions.
    this._authToken = crypto.randomBytes(32).toString('hex');
  }

  /** Port the hook server is listening on, or null if not started. */
  get port() { return this._port; }

  /** Shared-secret token the hook script must present on every request. */
  get authToken() { return this._authToken; }

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
   *
   * Security: every unrecoverable error path denies sensitive tools
   * (fail-closed). Non-sensitive tools may still be auto-allowed so benign
   * reads (Read/Glob/Grep) are not blocked when the confirmation channel is
   * temporarily unavailable.
   */
  async _handleRequest(req, res) {
    if (req.method !== 'POST' || !req.url?.startsWith('/hook')) {
      res.writeHead(404);
      res.end('not found');
      return;
    }

    // ── Auth: shared-secret token + Host header (DNS-rebinding defense) ──
    const host = req.headers['host'] || '';
    const isLocalHost = host.startsWith('127.0.0.1') || host.startsWith('localhost') || host.startsWith('[::1]');
    const authHeader = req.headers['authorization'] || '';
    const expectedAuth = `Bearer ${this._authToken}`;
    if (!isLocalHost || authHeader !== expectedAuth) {
      // Treat auth failure as a sensitive-tool denial: never allow on forgery.
      respond(res, denyResponse('unauthorized'), 401);
      return;
    }

    // Read request body
    const body = await this._readBody(req);
    let hookData;
    try {
      hookData = JSON.parse(body);
    } catch {
      // Malformed payload: we cannot tell which tool is being called, so
      // deny rather than risk auto-executing something sensitive.
      respond(res, denyResponse('malformed hook payload'));
      return;
    }

    const { tool_name, tool_input, tool_use_id, cwd } = hookData;
    const isSensitive = SENSITIVE_TOOLS.includes(tool_name);

    // Check if auto-approved (mode-based or explicit allow-list)
    if (this._permissions.isAutoApproved(tool_name)) {
      respond(res, allowResponse());
      return;
    }

    // Non-sensitive tools that still reach here (e.g. Read in default mode)
    // are safe to auto-allow — they cannot mutate the system.
    if (!isSensitive) {
      respond(res, allowResponse());
      return;
    }

    // ── Sensitive tool: MUST get human confirmation (fail-closed below) ──
    const chatId = this._getActiveChatId();
    if (!chatId) {
      // No active chat to surface a confirmation card to → deny.
      respond(res, denyResponse('no active chat to confirm sensitive tool'));
      return;
    }

    // Create pending confirmation
    const requestId = tool_use_id || crypto.randomUUID();
    const pendingPromise = this._permissions.addPending(requestId, chatId);

    // Send confirmation card to Feishu
    const card = buildPermissionCard(requestId, tool_name, tool_input || {}, cwd || '');
    const cardMessageId = await this._sendCard(chatId, card).catch(() => null);

    if (!cardMessageId) {
      // Could not surface the confirmation card → do NOT auto-allow.
      this._permissions.resolvePending(requestId, 'deny');
      respond(res, denyResponse('failed to send confirmation card'));
      return;
    }

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
    respond(res, {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: result.decision === 'allow' ? 'allow' : 'deny',
        permissionDecisionReason: result.reason || ''
      }
    });
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
      // H9: only allow-list real sensitive tools — reject crafted toolName.
      if (toolName && SENSITIVE_TOOLS.includes(toolName)) {
        this._permissions.sessionAllow(toolName);
      }
      return this._permissions.resolvePending(requestId, 'allow');
    }

    return false;
  }
}

module.exports = { HooksHandler, BASE_PORT };
