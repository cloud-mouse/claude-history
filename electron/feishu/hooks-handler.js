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

/**
 * Shared singleton HTTP server that receives PreToolUse hooks from every bot's
 * spawned Claude. The BotManager owns exactly one instance; each request is
 * routed to the originating bot's runtime by the botId the spawn injected into
 * the hook script env (design §8).
 */
class HooksHandler {
  /** @param {import('./bot-manager').BotManager} botManager */
  constructor(botManager) {
    this._botManager = botManager;
    this._server = null;
    this._port = null;
    this._startPromise = null;
    // Per-instance random token shared with the hook script via env var.
    // Defends against local processes / DNS-rebinding forging allow decisions.
    this._authToken = crypto.randomBytes(32).toString('hex');
  }

  /** Port the hook server is listening on, or null if not started. */
  get port() { return this._port; }

  /** Shared-secret token the hook script must present on every request. */
  get authToken() { return this._authToken; }

  /**
   * Start the HTTP server. Idempotent + concurrency-safe: an already-listening
   * server returns its port, and concurrent callers share the same boot promise
   * so N bots never spawn N servers on N ports (design §5.1).
   */
  async start() {
    if (this._server && this._port) return this._port;
    if (this._startPromise) return this._startPromise;
    this._startPromise = this._startServer();
    try {
      return await this._startPromise;
    } finally {
      this._startPromise = null;
    }
  }

  _startServer() {
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

  /**
   * Stop the HTTP server. Does NOT clear pending confirmations — each
   * BotRuntime clears its own permissions on stop (design §8.3).
   */
  stop() {
    if (this._server) {
      this._server.close();
      this._server = null;
    }
    this._port = null;
  }

  /**
   * Handle an incoming HTTP request from feishu-hook-script.js.
   * POST /hook — tool permission check.
   *
   * Security: non-sensitive tools are auto-allowed (they cannot mutate). Every
   * unrecoverable path for SENSITIVE tools denies (fail-closed, design §8.4).
   * botId/chatId are injected by the spawn and carried in the body; if they are
   * missing we cannot route a confirmation card, so sensitive tools deny while
   * harmless reads still proceed.
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
      respond(res, denyResponse('unauthorized'), 401);
      return;
    }

    const body = await this._readBody(req);
    let hookData;
    try {
      hookData = JSON.parse(body);
    } catch {
      respond(res, denyResponse('malformed hook payload'));
      return;
    }

    const { tool_name, tool_input, tool_use_id, cwd, botId, chatId } = hookData;
    const isSensitive = SENSITIVE_TOOLS.includes(tool_name);

    // Non-sensitive tools (Read/Glob/Grep/…) cannot mutate — allow unconditionally
    // and do NOT require a reachable bot (design §8.4).
    if (!isSensitive) {
      respond(res, allowResponse());
      return;
    }

    // ── Sensitive tool: MUST route a confirmation card to the originating bot ──
    const runtime = (botId != null && botId !== '') ? this._botManager.getRuntime(botId) : null;
    if (!runtime || !runtime.online || !chatId) {
      respond(res, denyResponse('no reachable bot to confirm sensitive tool'));
      return;
    }

    if (runtime.permissions.isAutoApproved(tool_name)) {
      respond(res, allowResponse());
      return;
    }

    const requestId = tool_use_id || crypto.randomUUID();
    const pendingPromise = runtime.permissions.addPending(requestId, chatId);

    const card = buildPermissionCard(requestId, tool_name, tool_input || {}, cwd || '', botId);
    const cardMessageId = await runtime._sendCard(chatId, card).catch(() => null);

    if (!cardMessageId) {
      runtime.permissions.resolvePending(requestId, 'deny');
      respond(res, denyResponse('failed to send confirmation card'));
      return;
    }

    const pending = runtime.permissions.getPending(requestId);
    if (pending) pending.cardMessageId = cardMessageId;

    const result = await pendingPromise;

    if (cardMessageId) {
      const detail = buildToolDetail(tool_name, tool_input || {}, cwd || '');
      const updateCard = result.decision === 'allow'
        ? buildConfirmResultCard('✅ 已允许', 'green', detail)
        : result.reason === 'timeout'
          ? buildConfirmResultCard('⏰ 已超时 (60s)', 'grey', detail)
          : buildConfirmResultCard('❌ 已拒绝', 'red', detail);
      await runtime._updateCard(cardMessageId, updateCard).catch(() => {});
    }

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
      const MAX_BODY = 1024 * 1024;
      req.on('data', (chunk) => {
        data += chunk;
        if (data.length > MAX_BODY) { req.destroy(); reject(new Error('Body too large')); }
      });
      req.on('end', () => resolve(data));
      req.on('error', reject);
    });
  }

  /**
   * Resolve a pending hook confirmation from a Feishu card action. The card's
   * callback value carries botId (design §8.3) so the correct runtime is found
   * even if Feishu does not route card events per-app.
   */
  handleCardAction(value) {
    if (!value || !value.requestId) return false;
    const runtime = (value.botId != null && value.botId !== '') ? this._botManager.getRuntime(value.botId) : null;
    if (!runtime) return false;

    const { requestId, action, toolName } = value;

    if (action === 'hook_allow') {
      return runtime.permissions.resolvePending(requestId, 'allow');
    }
    if (action === 'hook_deny') {
      return runtime.permissions.resolvePending(requestId, 'deny');
    }
    if (action === 'hook_always_allow') {
      if (toolName && SENSITIVE_TOOLS.includes(toolName)) {
        runtime.permissions.sessionAllow(toolName);
      }
      return runtime.permissions.resolvePending(requestId, 'allow');
    }
    return false;
  }
}

module.exports = { HooksHandler, BASE_PORT };
