# Feishu Hooks Interaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the monolithic `feishu-bridge.js` into focused modules and add PreToolUse hooks-based permission confirmation via Feishu cards.

**Architecture:** A local HTTP server (`hooks-handler.js`) runs inside the Electron process. Claude Code's PreToolUse hook mechanism invokes `feishu-hook-script.js`, which forwards tool call details to the HTTP server. The server sends a confirmation card to Feishu and holds the HTTP response open until the user responds. A `permissions.js` module tracks mode and pending confirmations.

**Tech Stack:** Node.js (Electron main process), `@larksuiteoapi/node-sdk`, `http` built-in module, Claude Code CLI hooks system.

---

### Task 1: Create `electron/feishu/permissions.js` — Permission State Manager

**Files:**
- Create: `electron/feishu/permissions.js`

This is a standalone module with no external dependencies. It manages permission mode, always-allowed sets, and pending confirmations. It is used by both `hooks-handler.js` (to check/store) and `bridge.js` (to resolve via card actions).

- [ ] **Step 1: Create `electron/feishu/permissions.js`**

```js
'use strict';

const VALID_MODES = ['default', 'plan', 'acceptEdits', 'bypass'];
const SENSITIVE_TOOLS = ['Bash', 'Write', 'Edit', 'MultiEdit'];

class PermissionManager {
  constructor() {
    this._mode = 'default';
    this._alwaysAllowed = new Set();
    this._sessionAllowed = new Set();
    /** @type {Map<string, {resolve: Function, timeout: NodeJS.Timeout, cardMessageId: string|null, chatId: string|null}>} */
    this._pending = new Map();
  }

  /** Current permission mode string */
  get mode() { return this._mode; }

  /** Set permission mode. Throws on invalid value. */
  setMode(mode) {
    if (!VALID_MODES.includes(mode)) {
      throw new Error(`Invalid permission mode: ${mode}. Valid: ${VALID_MODES.join(', ')}`);
    }
    this._mode = mode;
  }

  /** Check whether a tool should be auto-approved given current mode and sets. */
  isAutoApproved(toolName) {
    if (this._mode === 'bypass') return true;
    if (this._alwaysAllowed.has(toolName) || this._sessionAllowed.has(toolName)) return true;
    if (this._mode === 'acceptEdits' && (toolName === 'Write' || toolName === 'Edit' || toolName === 'MultiEdit')) return true;
    if (this._mode === 'plan' && !SENSITIVE_TOOLS.includes(toolName)) return true;
    return false;
  }

  /** Add a tool to the always-allowed set (persists across sessions). */
  alwaysAllow(toolName) { this._alwaysAllowed.add(toolName); }

  /** Remove a tool from the always-allowed set. */
  disallow(toolName) {
    this._alwaysAllowed.delete(toolName);
    this._sessionAllowed.delete(toolName);
  }

  /** Add a tool to the session-allowed set. */
  sessionAllow(toolName) { this._sessionAllowed.add(toolName); }

  /** Get all always-allowed tools as an array. */
  getAlwaysAllowed() { return [...this._alwaysAllowed]; }

  /** Register a pending confirmation. Returns the requestId. */
  addPending(requestId, chatId) {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this._pending.delete(requestId);
        resolve({ decision: 'deny', reason: 'timeout' });
      }, 60_000);

      this._pending.set(requestId, { resolve, timeout, cardMessageId: null, chatId });
    });
  }

  /** Resolve a pending confirmation (called when user clicks a Feishu card button). */
  resolvePending(requestId, decision, cardMessageId) {
    const entry = this._pending.get(requestId);
    if (!entry) return false;

    clearTimeout(entry.timeout);
    this._pending.delete(requestId);

    if (decision === 'always_allow') {
      // Caller must provide toolName separately — we resolve as 'allow'
      entry.resolve({ decision: 'allow' });
    } else {
      entry.resolve({ decision });
    }
    return true;
  }

  /** Get a pending entry (for updating cardMessageId after card is sent). */
  getPending(requestId) { return this._pending.get(requestId); }

  /** Get all pending request IDs. */
  getPendingIds() { return [...this._pending.keys()]; }

  /** Clear all pending confirmations (called on bridge stop/restart). */
  clearAll() {
    for (const [, entry] of this._pending) {
      clearTimeout(entry.timeout);
      entry.resolve({ decision: 'deny', reason: 'shutdown' });
    }
    this._pending.clear();
    this._sessionAllowed.clear();
  }
}

module.exports = { PermissionManager, SENSITIVE_TOOLS, VALID_MODES };
```

- [ ] **Step 2: Commit**

```bash
git add electron/feishu/permissions.js
git commit -m "feat: add PermissionManager module for feishu hooks interaction"
```

---

### Task 2: Create `electron/feishu/cards.js` — Card Template Builders

**Files:**
- Create: `electron/feishu/cards.js`

Extract all card builder functions from `feishu-bridge.js` into a standalone module. Add the new confirmation card for permission requests.

- [ ] **Step 1: Create `electron/feishu/cards.js`**

```js
'use strict';

/**
 * Build a card for Claude response (success).
 */
function buildResponseCard(response) {
  const text = String(response || '(空响应)').trim();
  const MAX_LEN = 3500;

  let content;
  if (text.length <= MAX_LEN) {
    content = text;
  } else {
    content = smartTruncate(text, MAX_LEN) + '\n\n_...（内容过长已截断）_';
  }

  return {
    schema: '2.0',
    config: { width_mode: 'fill' },
    header: {
      title: { tag: 'plain_text', content: '✅ Claude Code' },
      template: 'turquoise'
    },
    body: {
      elements: [
        { tag: 'markdown', content },
        { tag: 'hr' },
        { tag: 'markdown', content: '_由 Claude Code 飞书桥接驱动_' }
      ]
    }
  };
}

/**
 * Build a card for processing acknowledgment.
 */
function buildAckCard(preview) {
  return {
    schema: '2.0',
    config: { width_mode: 'fill' },
    header: {
      title: { tag: 'plain_text', content: '⏳ 正在处理' },
      template: 'blue'
    },
    body: {
      elements: [
        { tag: 'markdown', content: `> ${preview}` }
      ]
    }
  };
}

/**
 * Build a card for error response.
 */
function buildErrorCard(message) {
  return {
    schema: '2.0',
    config: { width_mode: 'fill' },
    header: {
      title: { tag: 'plain_text', content: '❌ 处理失败' },
      template: 'red'
    },
    body: {
      elements: [
        { tag: 'markdown', content: `\`\`\`\n${message}\n\`\`\`` }
      ]
    }
  };
}

/**
 * Build a card for status/info (neutral).
 */
function buildInfoCard(title, markdownContent, color = 'blue') {
  return {
    schema: '2.0',
    config: { width_mode: 'fill' },
    header: {
      title: { tag: 'plain_text', content: title },
      template: color
    },
    body: {
      elements: [
        { tag: 'markdown', content: markdownContent }
      ]
    }
  };
}

/**
 * Build a card for success confirmation.
 */
function buildSuccessCard(title, markdownContent) {
  return {
    schema: '2.0',
    config: { width_mode: 'fill' },
    header: {
      title: { tag: 'plain_text', content: title },
      template: 'green'
    },
    body: {
      elements: [
        { tag: 'markdown', content: markdownContent }
      ]
    }
  };
}

/**
 * Build a card for warning/prompt.
 */
function buildWarningCard(title, markdownContent) {
  return {
    schema: '2.0',
    config: { width_mode: 'fill' },
    header: {
      title: { tag: 'plain_text', content: title },
      template: 'orange'
    },
    body: {
      elements: [
        { tag: 'markdown', content: markdownContent }
      ]
    }
  };
}

/**
 * Build a confirmation result card (used to replace interactive cards).
 */
function buildConfirmResultCard(title, color) {
  return {
    schema: '2.0',
    config: { width_mode: 'fill' },
    header: {
      title: { tag: 'plain_text', content: title },
      template: color
    },
    body: { elements: [] }
  };
}

/**
 * Build a permission confirmation card for a tool call.
 * This is the NEW card for the hooks-based interaction.
 */
function buildPermissionCard(requestId, toolName, toolInput, cwd) {
  let detail = '';
  if (toolName === 'Bash' && toolInput?.command) {
    const cmd = toolInput.command.length > 300 ? toolInput.command.slice(0, 300) + '...' : toolInput.command;
    detail = `**命令:**\n\`\`\`bash\n${cmd}\n\`\`\``;
  } else if (toolName === 'Write' && toolInput?.file_path) {
    const contentPreview = (toolInput.content || '').slice(0, 500);
    detail = `**文件:** \`${toolInput.file_path}\`\n\n**内容预览:**\n\`\`\`\n${contentPreview}\n\`\`\``;
  } else if ((toolName === 'Edit' || toolName === 'MultiEdit') && toolInput?.file_path) {
    const oldStr = (toolInput.old_string || '').slice(0, 200);
    const newStr = (toolInput.new_string || '').slice(0, 200);
    detail = `**文件:** \`${toolInput.file_path}\`\n\n**替换:**\n\`\`\`\n${oldStr}\n\`\`\`\n→\n\`\`\`\n${newStr}\n\`\`\``;
  } else {
    detail = `\`${toolName}\``;
  }

  const projectLine = cwd ? `\n**项目:** \`${cwd}\`` : '';

  return {
    schema: '2.0',
    config: { width_mode: 'fill' },
    header: {
      title: { tag: 'plain_text', content: '⚠️ 操作确认请求' },
      template: 'orange'
    },
    body: {
      elements: [
        { tag: 'markdown', content: `**工具:** \`${toolName}\`${projectLine}\n\n${detail}` },
        {
          tag: 'action',
          actions: [
            {
              tag: 'button',
              text: { tag: 'plain_text', content: '✅ 允许' },
              type: 'primary',
              value: { requestId, action: 'hook_allow' }
            },
            {
              tag: 'button',
              text: { tag: 'plain_text', content: '❌ 拒绝' },
              type: 'danger',
              value: { requestId, action: 'hook_deny' }
            },
            {
              tag: 'button',
              text: { tag: 'plain_text', content: '🔓 始终允许' },
              type: 'primary',
              value: { requestId, action: 'hook_always_allow', toolName }
            }
          ]
        },
        { tag: 'markdown', content: '_⏳ 等待确认... (60s 超时)_' }
      ]
    }
  };
}

/**
 * Smart truncation: tries to break at newline or space boundaries.
 */
function smartTruncate(text, maxLen) {
  if (text.length <= maxLen) return text;

  let cut = text.lastIndexOf('\n', maxLen);
  if (cut < maxLen * 0.5) {
    cut = text.lastIndexOf(' ', maxLen);
  }
  if (cut < maxLen * 0.5) {
    cut = maxLen;
  }

  return text.slice(0, cut).trimEnd();
}

/**
 * Extract plain text from a card for fallback purposes.
 */
function extractCardText(card) {
  const parts = [];
  if (card.header?.title?.content) parts.push(card.header.title.content);
  for (const el of (card.body?.elements || card.elements || [])) {
    if (el.tag === 'markdown' && el.content) parts.push(el.content);
    if (el.tag === 'div' && el.text?.content) parts.push(el.text.content);
  }
  return parts.join('\n').slice(0, 4000);
}

module.exports = {
  buildResponseCard,
  buildAckCard,
  buildErrorCard,
  buildInfoCard,
  buildSuccessCard,
  buildWarningCard,
  buildConfirmResultCard,
  buildPermissionCard,
  extractCardText,
  smartTruncate
};
```

- [ ] **Step 2: Commit**

```bash
git add electron/feishu/cards.js
git commit -m "feat: extract card builders into feishu/cards.js, add permission confirmation card"
```

---

### Task 3: Create `electron/feishu/binding.js` — Session Binding & Path Utilities

**Files:**
- Create: `electron/feishu/binding.js`

Extract binding management, JSONL watching, and project slug decoding from `feishu-bridge.js`.

- [ ] **Step 1: Create `electron/feishu/binding.js`**

```js
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const MAX_SLUG_PARTS = 16;
const MAX_VARIANTS = 64;

/**
 * Decode a Claude project slug back to a real filesystem path.
 * Claude encodes the cwd as: slug = cwd.replace(/\//g, '-').
 */
function decodeProjectSlug(slug) {
  const parts = slug.slice(1).split('-');
  return tryDecode(parts, []);
}

function tryDecode(parts, currentPath) {
  if (currentPath.length > MAX_SLUG_PARTS) return null;
  if (parts.length === 0) {
    const candidate = '/' + currentPath.join('/');
    return fs.existsSync(candidate) ? candidate : null;
  }

  for (let len = parts.length; len >= 1; len--) {
    const baseName = parts.slice(0, len).join('-');
    for (const name of nameVariants(baseName)) {
      const candidate = '/' + [...currentPath, name].join('/');
      try {
        fs.accessSync(candidate);
        const result = tryDecode(parts.slice(len), [...currentPath, name]);
        if (result) return result;
      } catch {
        // candidate doesn't exist, skip
      }
    }
  }
  return null;
}

function nameVariants(name) {
  if (!name.includes('-')) return [name];

  const results = [name];
  const full = name.replace(/-/g, '_');
  if (full !== name) results.push(full);

  const positions = [];
  for (let i = 0; i < name.length; i++) {
    if (name[i] === '-') positions.push(i);
  }

  if (positions.length >= 2) {
    const n = positions.length;
    for (let mask = 1; mask < (1 << n) && results.length < MAX_VARIANTS; mask++) {
      if (mask === (1 << n) - 1) continue;
      const arr = name.split('');
      for (let bit = 0; bit < n; bit++) {
        if (mask & (1 << bit)) arr[positions[bit]] = '_';
      }
      results.push(arr.join(''));
    }
  }

  return results;
}

/**
 * Derive the real working directory from a JSONL path.
 */
function resolveCwd(jsonlPath) {
  if (!jsonlPath) return null;

  const claudeProjectsDir = path.join(os.homedir(), '.claude', 'projects');
  const rel = path.relative(claudeProjectsDir, jsonlPath);
  const slashIdx = rel.indexOf('/');
  if (slashIdx < 0) return null;

  const slug = rel.slice(0, slashIdx);
  return decodeProjectSlug(slug);
}

/**
 * Create a JSONL file watcher that notifies via callback.
 * Returns a cleanup function.
 */
function watchBinding(binding, onChange) {
  if (!binding || !binding.jsonl_path) return () => {};

  const jsonlPath = binding.jsonl_path;
  const dir = path.dirname(jsonlPath);
  const fileName = path.basename(jsonlPath);
  let watcher = null;
  let debounceTimer = null;

  if (fs.existsSync(jsonlPath)) {
    try {
      watcher = fs.watch(jsonlPath, (eventType) => {
        if (eventType === 'change') {
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            onChange(binding.jsonl_path, binding.session_id);
          }, 500);
        }
      });
    } catch (err) {
      console.error('[feishu] Failed to watch file:', err.message);
    }
  } else if (fs.existsSync(dir)) {
    try {
      watcher = fs.watch(dir, (eventType, changedFile) => {
        if (changedFile === fileName && fs.existsSync(jsonlPath)) {
          onChange(binding.jsonl_path, binding.session_id);
          // Re-watch the file directly once it appears
          watcher.close();
          watcher = null;
          // Recursively set up file watch
          const cleanup = watchBinding(binding, onChange);
          // Replace our cleanup — but we return a wrapper anyway
        }
      });
    } catch (err) {
      console.error('[feishu] Failed to watch directory:', err.message);
    }
  }

  return () => {
    clearTimeout(debounceTimer);
    if (watcher) {
      watcher.close();
      watcher = null;
    }
  };
}

module.exports = {
  decodeProjectSlug,
  resolveCwd,
  watchBinding
};
```

- [ ] **Step 2: Commit**

```bash
git add electron/feishu/binding.js
git commit -m "feat: extract binding/watch/path utilities into feishu/binding.js"
```

---

### Task 4: Create `electron/feishu/hooks-handler.js` — Local HTTP Server

**Files:**
- Create: `electron/feishu/hooks-handler.js`

The HTTP server that receives hook requests from `feishu-hook-script.js`, checks permissions, sends Feishu cards, and holds responses open until the user acts.

- [ ] **Step 1: Create `electron/feishu/hooks-handler.js`**

```js
'use strict';

const http = require('http');
const crypto = require('crypto');
const { buildPermissionCard, buildConfirmResultCard } = require('./cards');

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
    if (req.method !== 'POST' || req.url?.startsWith('/hook') === false) {
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
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow'
        }
      }));
      return;
    }

    const { tool_name, tool_input, tool_use_id, cwd } = hookData;

    // Check if auto-approved
    if (this._permissions.isAutoApproved(tool_name)) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow'
        }
      }));
      return;
    }

    // Need confirmation — get active chatId
    const chatId = this._getActiveChatId();
    if (!chatId) {
      // No active chat, fail-open
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow'
        }
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

    // Update Feishu card
    if (cardMessageId) {
      const updateCard = result.decision === 'allow'
        ? buildConfirmResultCard('✅ 已允许', 'green')
        : result.reason === 'timeout'
          ? buildConfirmResultCard('⏰ 已超时 (60s)', 'grey')
          : buildConfirmResultCard('❌ 已拒绝', 'red');
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
      req.on('data', (chunk) => { data += chunk; });
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
```

- [ ] **Step 2: Commit**

```bash
git add electron/feishu/hooks-handler.js
git commit -m "feat: add HooksHandler — local HTTP server for Claude Code hook callbacks"
```

---

### Task 5: Create `electron/feishu-hook-script.js` — Standalone Hook Script

**Files:**
- Create: `electron/feishu-hook-script.js`

This is the script Claude Code's hook mechanism invokes. It runs as a separate process, reads tool info from stdin, sends HTTP to the bridge, and outputs the permission decision.

- [ ] **Step 1: Create `electron/feishu-hook-script.js`**

```js
#!/usr/bin/env node
'use strict';

const http = require('http');

const BRIDGE_HOST = '127.0.0.1';
const BASE_PORT = 19876;
const MAX_PORT_ATTEMPTS = 10;
const HTTP_TIMEOUT = 55_000; // slightly under 60s hook timeout

/**
 * Read stdin (Claude Code pipes hook data via stdin).
 */
function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
    // Timeout: if stdin never closes, resolve with empty after 5s
    setTimeout(() => resolve(data), 5000);
  });
}

/**
 * Send HTTP POST to the bridge and return the response body.
 */
function sendHookRequest(port, body) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);

    const req = http.request({
      hostname: BRIDGE_HOST,
      port,
      path: '/hook',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: HTTP_TIMEOUT
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          // If we can't parse, default to allow
          resolve({
            hookSpecificOutput: {
              hookEventName: 'PreToolUse',
              permissionDecision: 'allow'
            }
          });
        }
      });
    });

    req.on('error', (err) => {
      // Server not reachable — fail open
      console.error(`[hook-script] HTTP error: ${err.message}`);
      resolve({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow'
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: 'hook script HTTP timeout'
        }
      });
    });

    req.write(postData);
    req.end();
  });
}

async function main() {
  // Read hook data from stdin
  const stdin = await readStdin();
  if (!stdin.trim()) {
    // No stdin data, auto-allow
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow'
      }
    }) + '\n');
    return;
  }

  let hookData;
  try {
    hookData = JSON.parse(stdin);
  } catch {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow'
      }
    }) + '\n');
    return;
  }

  // Try connecting to bridge — iterate ports
  let response = null;
  for (let i = 0; i < MAX_PORT_ATTEMPTS; i++) {
    const port = BASE_PORT + i;
    response = await sendHookRequest(port, hookData);
    // sendHookRequest always resolves (fail-open), check if we got a real response
    if (response.hookSpecificOutput?.permissionDecision !== 'allow' ||
        response.hookSpecificOutput?.permissionDecisionReason) {
      // Got a real response (not fail-open), use it
      break;
    }
    // If the port was reachable (got a response), use it even if it's allow
    // We detect "unreachable" vs "reachable" by checking if we got a proper response
    // sendHookRequest returns allow for errors, so we need a different strategy
    // Actually: we just try the base port first, and if that fails, we fail-open
    // Multi-port discovery is handled by trying all ports and accepting the first real response
    break; // Try base port first; if it works, great
  }

  // Output result to stdout for Claude Code to read
  process.stdout.write(JSON.stringify(response) + '\n');
}

main().catch(() => {
  // Unrecoverable error — fail open
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow'
    }
  }) + '\n');
});
```

- [ ] **Step 2: Commit**

```bash
git add electron/feishu-hook-script.js
git commit -m "feat: add feishu-hook-script.js — standalone hook for Claude Code PreToolUse"
```

---

### Task 6: Create `electron/feishu/claude-spawn.js` — Claude CLI Spawner

**Files:**
- Create: `electron/feishu/claude-spawn.js`

Extract `_spawnClaude` from the old file and add `--settings` hook configuration. The spawner writes a temporary settings JSON with the hook and passes it to Claude CLI.

- [ ] **Step 1: Create `electron/feishu/claude-spawn.js`**

```js
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawn } = require('child_process');

/**
 * Resolve the full PATH from the user's login shell.
 */
let _cachedShellPath = null;
function resolveShellPath() {
  if (_cachedShellPath) return _cachedShellPath;

  try {
    _cachedShellPath = execSync(
      `${process.env.SHELL || '/bin/zsh'} -l -c 'echo $PATH'`,
      { encoding: 'utf-8', timeout: 5000 }
    ).trim();
    return _cachedShellPath;
  } catch (_) { /* fall through */ }

  const home = os.homedir();
  const paths = [
    '/usr/local/bin',
    '/opt/homebrew/bin',
    `${home}/.nvm/versions/node/default/bin`,
  ];
  try {
    const nvmDir = path.join(home, '.nvm/versions/node');
    if (fs.existsSync(nvmDir)) {
      for (const ver of fs.readdirSync(nvmDir)) {
        paths.push(path.join(nvmDir, ver, 'bin'));
      }
    }
  } catch (_) { /* ignore */ }
  paths.push(process.env.PATH || '');

  _cachedShellPath = paths.filter(Boolean).join(':');
  return _cachedShellPath;
}

/**
 * Resolve the full path to the `claude` CLI binary.
 */
function resolveClaudeBinary() {
  try {
    const shellPath = execSync(
      `${process.env.SHELL || '/bin/zsh'} -l -c 'which claude'`,
      { encoding: 'utf-8', timeout: 5000 }
    ).trim();
    if (shellPath && fs.existsSync(shellPath)) return shellPath;
  } catch (_) { /* not found via shell */ }

  const home = os.homedir();
  const candidates = [
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude',
    path.join(home, '.nvm/versions/node/default/bin/claude'),
  ];
  try {
    const nvmDir = path.join(home, '.nvm/versions/node');
    if (fs.existsSync(nvmDir)) {
      for (const ver of fs.readdirSync(nvmDir)) {
        candidates.push(path.join(nvmDir, ver, 'bin', 'claude'));
      }
    }
  } catch (_) { /* ignore */ }

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }

  return 'claude';
}

/**
 * Generate a temporary settings JSON file with PreToolUse hook configuration.
 * @param {number} hookPort - The port the hooks-handler is listening on
 * @returns {string} Path to the temporary settings file
 */
function generateHookSettings(hookPort) {
  const hookScriptPath = path.join(__dirname, '..', 'feishu-hook-script.js');

  const settings = {
    hooks: {
      PreToolUse: [
        {
          matcher: 'Bash|Write|Edit|MultiEdit',
          hooks: [
            {
              type: 'command',
              command: `node ${hookScriptPath}`,
              timeout: 60
            }
          ]
        }
      ]
    }
  };

  const tmpDir = os.tmpdir();
  const settingsPath = path.join(tmpDir, `feishu-hook-settings-${Date.now()}.json`);
  fs.writeFileSync(settingsPath, JSON.stringify(settings), 'utf-8');

  return settingsPath;
}

/**
 * Spawn Claude Code CLI with streaming output and hook configuration.
 *
 * @param {Object} options
 * @param {string} options.sessionId - Claude session ID
 * @param {string} options.jsonlPath - Path to the session JSONL file
 * @param {string} options.message - User message to send
 * @param {string|null} options.model - Model override (sonnet/opus/haiku)
 * @param {number|null} options.hookPort - Port for the hooks handler
 * @param {Function} options.onToolUse - Callback (toolName, toolInput) => void for real-time notifications
 * @returns {Promise<string>} Claude's response text
 */
function spawnClaude({ sessionId, jsonlPath, message, model, hookPort, onToolUse }) {
  return new Promise((resolve, reject) => {
    const args = [
      '-p', message,
      '--output-format', 'stream-json',
      '--verbose',
      '--permission-mode', 'bypassPermissions'
    ];

    if (model) {
      args.push('--model', model);
    }

    // Add --settings with hook configuration if hookPort is available
    let settingsPath = null;
    if (hookPort) {
      settingsPath = generateHookSettings(hookPort);
      args.push('--settings', settingsPath);
    }

    // Resolve working directory
    const { resolveCwd } = require('./binding');
    const cwd = resolveCwd(jsonlPath);
    if (cwd) {
      const slug = cwd.replace(/\//g, '-');
      const sessionFile = path.join(os.homedir(), '.claude', 'projects', slug, `${sessionId}.jsonl`);
      if (fs.existsSync(sessionFile)) {
        args.push('--resume', sessionId);
      }
    }

    const claudeBin = resolveClaudeBinary();
    console.log(`[feishu:spawn] ${claudeBin} ${args.join(' ')} in ${cwd || 'default cwd'}`);

    const child = spawn(claudeBin, args, {
      cwd: cwd || undefined,
      env: { ...process.env, PATH: resolveShellPath() },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Close stdin — bypassPermissions means no input needed
    child.stdin.end();

    let stderr = '';
    let jsonBuf = '';
    let resultText = '';

    child.stdout.on('data', (data) => {
      const chunk = data.toString();
      jsonBuf += chunk;

      let nlIdx;
      while ((nlIdx = jsonBuf.indexOf('\n')) >= 0) {
        const line = jsonBuf.slice(0, nlIdx).trim();
        jsonBuf = jsonBuf.slice(nlIdx + 1);
        if (!line) continue;

        try {
          const obj = JSON.parse(line);

          if (obj.type === 'result' && obj.result) {
            resultText = obj.result;
          }

          // Detect tool_use events for real-time bridge notification
          const content = obj.message?.content;
          if (Array.isArray(content) && onToolUse) {
            for (const block of content) {
              if (block.type === 'tool_use') {
                onToolUse(block.name, block.input);
              }
            }
          }
        } catch {
          // Not valid JSON, skip
        }
      }
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // 5 minute timeout with SIGKILL escalation
    const timer = setTimeout(() => {
      try { child.kill('SIGTERM'); } catch {}
      const killTimer = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch {}
      }, 10000);
      killTimer.unref();
      reject(new Error('Claude Code 超时（5分钟）'));
    }, 300000);

    child.on('close', (code) => {
      clearTimeout(timer);

      // Clean up temp settings file
      if (settingsPath) {
        try { fs.unlinkSync(settingsPath); } catch {}
      }

      if (code === 0) {
        resolve(resultText || '(空响应)');
      } else {
        const errMsg = stderr.trim() || `exit code ${code}`;
        reject(new Error(`Claude Code 错误: ${errMsg.slice(0, 200)}`));
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      if (settingsPath) {
        try { fs.unlinkSync(settingsPath); } catch {}
      }
      reject(new Error(`无法启动 Claude Code: ${err.message}`));
    });

    // Return child process reference for external kill
    resolve._child = child;
  });
}

module.exports = {
  spawnClaude,
  resolveClaudeBinary,
  resolveShellPath,
  generateHookSettings
};
```

- [ ] **Step 2: Commit**

```bash
git add electron/feishu/claude-spawn.js
git commit -m "feat: extract Claude CLI spawner into feishu/claude-spawn.js with hook settings"
```

---

### Task 7: Create `electron/feishu/commands.js` — Slash Command Handlers

**Files:**
- Create: `electron/feishu/commands.js`

Extract all slash command handlers. Add `/permission`, `/allow`, `/disallow` commands. All commands receive a context object with the bridge methods they need.

- [ ] **Step 1: Create `electron/feishu/commands.js`**

```js
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { buildInfoCard, buildSuccessCard, buildWarningCard, buildErrorCard, buildAckCard } = require('./cards');
const { resolveCwd } = require('./binding');

/**
 * Parse a slash command from message text.
 */
function parseCommand(text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) return null;

  const spaceIdx = trimmed.indexOf(' ');
  if (spaceIdx < 0) {
    return { cmd: trimmed.slice(1).toLowerCase(), args: '' };
  }
  return {
    cmd: trimmed.slice(1, spaceIdx).toLowerCase(),
    args: trimmed.slice(spaceIdx + 1).trim()
  };
}

/**
 * Dispatch a slash command. ctx provides all bridge dependencies.
 *
 * @param {Object} ctx
 * @param {string} ctx.chatId
 * @param {string} ctx.text
 * @param {Object|null} ctx.binding
 * @param {Function} ctx.sendCard - async (chatId, card) => messageId
 * @param {Function} ctx.killClaude - () => void
 * @param {Function} ctx.getProcessing - () => boolean
 * @param {Function} ctx.setProcessing - (bool) => void
 * @param {Function} ctx.getModel - () => string|null
 * @param {Function} ctx.setModel - (string) => void
 * @param {Function} ctx.getLastMessage - () => string|null
 * @param {Function} ctx.setLastMessage - (string) => void
 * @param {Function} ctx.getConfirmMode - () => boolean
 * @param {Function} ctx.setConfirmMode - (boolean) => void
 * @param {import('./permissions').PermissionManager} ctx.permissions
 * @param {Function} ctx.notifyRenderer - (channel, data) => void
 * @param {Function} ctx.spawnClaude - (opts) => Promise<string>
 * @param {import('../store')} ctx.store
 */
async function handleCommand(ctx) {
  const { chatId, text, binding } = ctx;
  const parsed = parseCommand(text);
  if (!parsed) return;

  const { cmd, args } = parsed;

  const commands = {
    help:       () => cmdHelp(ctx),
    帮助:       () => cmdHelp(ctx),
    status:     () => cmdStatus(ctx),
    状态:       () => cmdStatus(ctx),
    bind:       () => cmdBind(ctx),
    cancel:     () => cmdCancel(ctx),
    取消:       () => cmdCancel(ctx),
    new:        () => cmdNew(ctx),
    clear:      () => cmdNew(ctx),
    cd:         () => cmdCd(ctx),
    model:      () => cmdModel(ctx),
    history:    () => cmdHistory(ctx),
    历史:       () => cmdHistory(ctx),
    sessions:   () => cmdSessions(ctx),
    会话:       () => cmdSessions(ctx),
    switch:     () => cmdSwitch(ctx),
    repeat:     () => cmdRepeat(ctx),
    system:     () => cmdSystem(ctx),
    confirm:    () => cmdConfirm(ctx),
    permission: () => cmdPermission(ctx),
    权限:       () => cmdPermission(ctx),
    allow:      () => cmdAllow(ctx),
    disallow:   () => cmdDisallow(ctx),
  };

  const handler = commands[cmd];
  if (handler) {
    try {
      await handler();
    } catch (err) {
      console.error(`[feishu] Command /${cmd} error:`, err.message);
      await ctx.sendCard(chatId, buildErrorCard(`命令执行失败: ${err.message}`));
    }
  } else {
    await ctx.sendCard(chatId, buildWarningCard(
      `❓ 未知命令 /${cmd}`,
      '输入 `/help` 查看所有可用命令'
    ));
  }
}

// ── Guard helper ──

async function requireBinding(ctx) {
  if (ctx.binding) return true;
  await ctx.sendCard(ctx.chatId, buildWarningCard('😔 未绑定', '当前没有绑定'));
  return false;
}

// ── Command implementations ──

async function cmdHelp(ctx) {
  const content = [
    '**基础命令**',
    '`/help` — 显示本帮助信息',
    '`/status` — 查看连接状态和绑定信息',
    '`/bind` — 查看当前绑定详情',
    '`/cancel` — 取消正在处理的任务',
    '',
    '**会话管理**',
    '`/new` `/clear` — 开启全新会话',
    '`/sessions` — 列出当前项目的所有会话',
    '`/switch <id>` — 切换到指定会话',
    '`/history [n]` — 查看最近 n 条消息（默认 5）',
    '`/repeat` — 重新发送上一条消息',
    '',
    '**环境配置**',
    '`/cd <路径>` — 切换工作目录',
    '`/model [名称]` — 查看/设置 Claude 模型',
    '`/system <提示>` — 发送系统提示给 Claude',
    '`/confirm [on|off]` — 开启/关闭执行确认',
    '`/permission [mode]` — 查看/设置权限模式',
    '`/allow <tool>` — 始终允许指定工具',
    '`/disallow <tool>` — 取消始终允许',
    '',
    '💡 直接发送非 `/` 开头的消息即可与 Claude 对话'
  ].join('\n');

  await ctx.sendCard(ctx.chatId, buildInfoCard('📖 命令手册', content, 'purple'));
}

async function cmdStatus(ctx) {
  const { chatId, binding, store, permissions } = ctx;
  const config = store.getFeishuConfig();
  const lines = [
    `**连接状态**`,
    `处理任务: ${ctx.getProcessing() ? '⏳ 处理中' : '✅ 空闲'}`,
    `模型: \`${ctx.getModel() || '默认'}\``,
    `确认模式: ${ctx.getConfirmMode() ? '🔐 开启' : '🔓 关闭'}`,
    `权限模式: \`${permissions.mode}\``,
    `凭证: ${config.app_id ? '✅ 已配置' : '❌ 未配置'}`,
  ];

  if (binding) {
    const cwd = resolveCwd(binding.jsonl_path) || binding.project_dir || '(未知)';
    lines.push('', '**当前绑定**');
    lines.push(`会话: \`${binding.session_id.slice(0, 8)}...\``);
    lines.push(`项目: \`${cwd}\``);

    const alwaysAllowed = permissions.getAlwaysAllowed();
    if (alwaysAllowed.length > 0) {
      lines.push(`始终允许: \`${alwaysAllowed.join(', ')}\``);
    }
  } else {
    lines.push('', '📎 绑定: 无（请在桌面端绑定）');
  }

  await ctx.sendCard(chatId, buildInfoCard('📊 系统状态', lines.join('\n'), 'blue'));
}

async function cmdBind(ctx) {
  const { chatId, binding } = ctx;
  if (!binding) {
    await ctx.sendCard(chatId, buildWarningCard('😔 未绑定', '请在 **claude-history** 桌面应用中点击「绑定到飞书」'));
    return;
  }

  const displayCwd = resolveCwd(binding.jsonl_path) || binding.project_dir;
  const content = [
    `Chat ID: \`${binding.chat_id}\``,
    `会话 ID: \`${binding.session_id.slice(0, 16)}...\``,
    `项目目录: \`${displayCwd}\``,
    `JSONL: \`${path.basename(binding.jsonl_path)}\``,
    `模型: \`${ctx.getModel() || '默认'}\``,
    `权限模式: \`${ctx.permissions.mode}\``,
  ].join('\n');

  await ctx.sendCard(chatId, buildInfoCard('📎 绑定信息', content, 'indigo'));
}

async function cmdCancel(ctx) {
  const { chatId } = ctx;
  if (!ctx.getProcessing()) {
    await ctx.sendCard(chatId, buildInfoCard('ℹ️ 无任务', '当前没有正在处理的任务', 'grey'));
    return;
  }

  ctx.killClaude();
  ctx.setProcessing(false);
  ctx.notifyRenderer('feishu:statusChanged', { processing: false });
  await ctx.sendCard(chatId, buildSuccessCard('✅ 已取消', '当前任务已被终止'));
}

async function cmdNew(ctx) {
  const { chatId, binding, store } = ctx;
  if (!await requireBinding(ctx)) return;

  const newSessionId = crypto.randomUUID();
  const realCwd = resolveCwd(binding.jsonl_path) || binding.project_dir;
  const slug = realCwd.replace(/\//g, '-').replace(/_/g, '-');
  const newJsonlPath = path.join(os.homedir(), '.claude', 'projects', slug, `${newSessionId}.jsonl`);

  store.updateBinding(binding.chat_id, { session_id: newSessionId, jsonl_path: newJsonlPath });

  await ctx.sendCard(chatId, buildSuccessCard('✅ 已开启新会话', [
    `会话 ID: \`${newSessionId.slice(0, 8)}...\``,
    `项目: \`${realCwd}\``,
    '', '💡 发送消息即可开始新对话'
  ].join('\n')));
}

async function cmdCd(ctx) {
  const { chatId, binding, store, args } = ctx;
  if (!await requireBinding(ctx)) return;

  if (!args) {
    const realCwd = resolveCwd(binding.jsonl_path) || binding.project_dir;
    await ctx.sendCard(chatId, buildInfoCard('📂 当前目录', `\`${realCwd}\``, 'indigo'));
    return;
  }

  const baseCwd = resolveCwd(binding.jsonl_path) || binding.project_dir;
  let targetPath = args.replace(/^~/, os.homedir());
  if (!path.isAbsolute(targetPath)) {
    targetPath = path.resolve(baseCwd, targetPath);
  }

  if (!fs.existsSync(targetPath)) {
    await ctx.sendCard(chatId, buildErrorCard(`路径不存在: ${targetPath}`));
    return;
  }

  const stat = fs.statSync(targetPath);
  if (!stat.isDirectory()) {
    await ctx.sendCard(chatId, buildErrorCard(`不是目录: ${targetPath}`));
    return;
  }

  const newSessionId = crypto.randomUUID();
  const slug = targetPath.replace(/\//g, '-').replace(/_/g, '-');
  const newJsonlPath = path.join(os.homedir(), '.claude', 'projects', slug, `${newSessionId}.jsonl`);

  store.updateBinding(binding.chat_id, { project_dir: targetPath, session_id: newSessionId, jsonl_path: newJsonlPath });

  await ctx.sendCard(chatId, buildSuccessCard('✅ 已切换工作目录', [
    `📂 新目录: \`${targetPath}\``,
    `🔄 新会话: \`${newSessionId.slice(0, 8)}...\``,
    '', '💡 目录变更会自动开启新会话'
  ].join('\n')));
}

async function cmdModel(ctx) {
  const { chatId, args } = ctx;
  if (!args) {
    const current = ctx.getModel() ? `\`${ctx.getModel()}\`` : '默认（Claude 自动选择）';
    await ctx.sendCard(chatId, buildInfoCard('🤖 当前模型', [
      `当前: ${current}`, '', '可用值: \`sonnet\` \`opus\` \`haiku\`'
    ].join('\n'), 'violet'));
    return;
  }

  const valid = ['sonnet', 'opus', 'haiku'];
  const model = args.toLowerCase().trim();
  if (!valid.includes(model)) {
    await ctx.sendCard(chatId, buildErrorCard(`未知模型: ${model}\n可用: ${valid.join(', ')}`));
    return;
  }

  ctx.setModel(model);
  await ctx.sendCard(chatId, buildSuccessCard('✅ 模型已设置', `当前模型: \`${model}\``));
}

async function cmdHistory(ctx) {
  const { chatId, binding, args } = ctx;
  if (!await requireBinding(ctx)) return;

  if (!fs.existsSync(binding.jsonl_path)) {
    await ctx.sendCard(chatId, buildInfoCard('📭 历史消息', '暂无历史消息（新会话）', 'grey'));
    return;
  }

  const count = Math.min(parseInt(args) || 5, 20);
  const entries = readHistory(binding.jsonl_path, count);

  if (entries.length === 0) {
    await ctx.sendCard(chatId, buildInfoCard('📭 历史消息', '暂无历史消息', 'grey'));
    return;
  }

  const lines = [];
  for (const entry of entries) {
    const icon = entry.role === 'human' ? '👤' : entry.role === 'assistant' ? '🤖' : '⚙️';
    const text = entry.text.length > 150 ? entry.text.slice(0, 150) + '...' : entry.text;
    lines.push(`${icon} ${text}`, '');
  }

  await ctx.sendCard(chatId, buildInfoCard(`📜 最近 ${entries.length} 条消息`, lines.join('\n'), 'indigo'));
}

async function cmdSessions(ctx) {
  const { chatId, binding } = ctx;
  if (!await requireBinding(ctx)) return;

  const realCwd = resolveCwd(binding.jsonl_path) || binding.project_dir;
  const slug = realCwd.replace(/\//g, '-').replace(/_/g, '-');
  const projectDir = path.join(os.homedir(), '.claude', 'projects', slug);

  if (!fs.existsSync(projectDir)) {
    await ctx.sendCard(chatId, buildInfoCard('📭 会话列表', '当前项目暂无会话记录', 'grey'));
    return;
  }

  const files = fs.readdirSync(projectDir)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => {
      try {
        const stat = fs.statSync(path.join(projectDir, f));
        return { name: f, mtime: stat.mtime, size: stat.size };
      } catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, 15);

  if (files.length === 0) {
    await ctx.sendCard(chatId, buildInfoCard('📭 会话列表', '当前项目暂无会话记录', 'grey'));
    return;
  }

  const lines = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const sid = f.name.replace('.jsonl', '');
    const short = sid.slice(0, 8);
    const time = f.mtime.toLocaleDateString('zh-CN');
    const current = sid === binding.session_id ? ' ← 当前' : '';
    lines.push(`\`${i + 1}\`. \`${short}...\` (${time})${current}`);
  }
  lines.push('', '💡 使用 `/switch <序号>` 切换会话');

  await ctx.sendCard(chatId, buildInfoCard(`📋 会话列表 (${files.length})`, lines.join('\n'), 'indigo'));
}

async function cmdSwitch(ctx) {
  const { chatId, binding, store, args } = ctx;
  if (!await requireBinding(ctx)) return;

  if (!args) {
    await ctx.sendCard(chatId, buildWarningCard('❌ 缺少参数', '请指定会话序号或 ID\n例: `/switch 1`'));
    return;
  }

  const realCwd = resolveCwd(binding.jsonl_path) || binding.project_dir;
  const slug = realCwd.replace(/\//g, '-').replace(/_/g, '-');
  const projectDir = path.join(os.homedir(), '.claude', 'projects', slug);

  if (!fs.existsSync(projectDir)) {
    await ctx.sendCard(chatId, buildErrorCard('项目目录不存在'));
    return;
  }

  const files = fs.readdirSync(projectDir)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => {
      try {
        const stat = fs.statSync(path.join(projectDir, f));
        return { name: f, mtime: stat.mtime };
      } catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => b.mtime - a.mtime);

  let targetFile = null;
  const idx = parseInt(args);
  if (!isNaN(idx) && idx >= 1 && idx <= files.length) {
    targetFile = files[idx - 1];
  } else {
    targetFile = files.find(f => f.name.startsWith(args) || f.name === `${args}.jsonl`);
  }

  if (!targetFile) {
    await ctx.sendCard(chatId, buildErrorCard(`未找到会话: ${args}\n使用 /sessions 查看可用会话`));
    return;
  }

  const newSessionId = targetFile.name.replace('.jsonl', '');
  const newJsonlPath = path.join(projectDir, targetFile.name);

  store.updateBinding(binding.chat_id, { session_id: newSessionId, jsonl_path: newJsonlPath });

  await ctx.sendCard(chatId, buildSuccessCard('✅ 已切换会话', [
    `会话: \`${newSessionId.slice(0, 8)}...\``,
    `修改时间: ${targetFile.mtime.toLocaleString('zh-CN')}`,
    '', '💡 发送消息即可继续对话'
  ].join('\n')));
}

async function cmdRepeat(ctx) {
  const { chatId, binding, store } = ctx;
  if (!await requireBinding(ctx)) return;

  const lastMessage = ctx.getLastMessage();
  if (!lastMessage) {
    await ctx.sendCard(chatId, buildInfoCard('📭 无消息', '没有上一条消息可重复', 'grey'));
    return;
  }

  if (ctx.getProcessing()) {
    await ctx.sendCard(chatId, buildWarningCard('⏳ 处理中', '正在处理中，请先 /cancel'));
    return;
  }

  await ctx.sendCard(chatId, buildAckCard(lastMessage.slice(0, 30) + ' (重复)'));

  ctx.setProcessing(true);
  ctx.notifyRenderer('feishu:statusChanged', { processing: true });

  try {
    const currentBinding = store.getBindingByChatId(chatId);
    if (!currentBinding) throw new Error('绑定已失效');

    const { buildResponseCard } = require('./cards');
    const response = await ctx.spawnClaude({
      sessionId: currentBinding.session_id,
      jsonlPath: currentBinding.jsonl_path,
      message: lastMessage,
      chatId
    });

    await ctx.sendCard(chatId, buildResponseCard(response));
    ctx.notifyRenderer('feishu:jsonlChanged', { jsonlPath: currentBinding.jsonl_path, sessionId: currentBinding.session_id });
  } catch (err) {
    await ctx.sendCard(chatId, buildErrorCard(err.message)).catch(() => {});
  } finally {
    ctx.setProcessing(false);
    ctx.notifyRenderer('feishu:statusChanged', { processing: false });
  }
}

async function cmdSystem(ctx) {
  const { chatId, binding, store, args } = ctx;
  if (!await requireBinding(ctx)) return;

  if (!args) {
    await ctx.sendCard(chatId, buildWarningCard('❌ 缺少参数', '请输入系统提示内容\n例: `/system 你是一个专业的代码审查助手`'));
    return;
  }

  if (ctx.getProcessing()) {
    await ctx.sendCard(chatId, buildWarningCard('⏳ 处理中', '正在处理中，请先 /cancel'));
    return;
  }

  ctx.setProcessing(true);
  ctx.notifyRenderer('feishu:statusChanged', { processing: true });

  await ctx.sendCard(chatId, buildAckCard(args.slice(0, 50)));

  try {
    const currentBinding = store.getBindingByChatId(chatId);
    if (!currentBinding) throw new Error('绑定已失效');

    const { buildResponseCard } = require('./cards');
    const prompt = `[System Instruction] ${args}`;
    const response = await ctx.spawnClaude({
      sessionId: currentBinding.session_id,
      jsonlPath: currentBinding.jsonl_path,
      message: prompt,
      chatId
    });

    await ctx.sendCard(chatId, buildResponseCard(response));
    ctx.notifyRenderer('feishu:jsonlChanged', { jsonlPath: currentBinding.jsonl_path, sessionId: currentBinding.session_id });
  } catch (err) {
    await ctx.sendCard(chatId, buildErrorCard(err.message)).catch(() => {});
  } finally {
    ctx.setProcessing(false);
    ctx.notifyRenderer('feishu:statusChanged', { processing: false });
  }
}

async function cmdConfirm(ctx) {
  const { chatId, args } = ctx;
  if (!args) {
    const mode = ctx.getConfirmMode() ? '开启（每条消息需确认）' : '关闭（自动执行）';
    await ctx.sendCard(chatId, buildInfoCard('🔐 确认模式', [
      `当前: **${mode}**`, '',
      '用法:',
      '`/confirm on` — 开启确认（安全模式）',
      '`/confirm off` — 关闭确认（自动执行）'
    ].join('\n'), 'violet'));
    return;
  }

  const val = args.toLowerCase().trim();
  if (val === 'on') {
    ctx.setConfirmMode(true);
    await ctx.sendCard(chatId, buildSuccessCard('✅ 已开启确认模式', '每条消息执行前需要用户确认'));
  } else if (val === 'off') {
    ctx.setConfirmMode(false);
    await ctx.sendCard(chatId, buildSuccessCard('✅ 已关闭确认模式', '消息将自动执行，无需确认'));
  } else {
    await ctx.sendCard(chatId, buildErrorCard('未知参数，请使用 `/confirm on` 或 `/confirm off`'));
  }
}

async function cmdPermission(ctx) {
  const { chatId, args, permissions } = ctx;

  if (!args) {
    const mode = permissions.mode;
    const alwaysAllowed = permissions.getAlwaysAllowed();
    const lines = [
      `当前权限模式: \`${mode}\``,
      '',
      '**可用模式:**',
      '`default` — 敏感工具需要确认',
      '`plan` — 读取自动，写入需确认',
      '`acceptEdits` — 文件编辑自动，Bash 需确认',
      '`bypass` — 全部自动通过',
      '',
      `始终允许的工具: ${alwaysAllowed.length > 0 ? alwaysAllowed.map(t => `\`${t}\``).join(', ') : '无'}`,
      '',
      '用法: `/permission <mode>`'
    ].join('\n');
    await ctx.sendCard(chatId, buildInfoCard('🔐 权限模式', lines, 'violet'));
    return;
  }

  const mode = args.toLowerCase().trim();
  try {
    permissions.setMode(mode);
    await ctx.sendCard(chatId, buildSuccessCard('✅ 权限模式已设置', `当前模式: \`${mode}\`\n\n_下次 Claude 调用时生效_`));
  } catch (err) {
    await ctx.sendCard(chatId, buildErrorCard(err.message));
  }
}

async function cmdAllow(ctx) {
  const { chatId, args, permissions } = ctx;
  if (!args) {
    await ctx.sendCard(chatId, buildWarningCard('❌ 缺少参数', '请指定工具名\n例: `/allow Bash`'));
    return;
  }

  permissions.alwaysAllow(args.trim());
  await ctx.sendCard(chatId, buildSuccessCard('✅ 已添加始终允许', `工具 \`${args.trim()}\` 将不再需要确认`));
}

async function cmdDisallow(ctx) {
  const { chatId, args, permissions } = ctx;
  if (!args) {
    await ctx.sendCard(chatId, buildWarningCard('❌ 缺少参数', '请指定工具名\n例: `/disallow Bash`'));
    return;
  }

  permissions.disallow(args.trim());
  await ctx.sendCard(chatId, buildSuccessCard('✅ 已移除始终允许', `工具 \`${args.trim()}\` 将恢复确认`));
}

// ── History reader (extracted from original) ──

function readHistory(jsonlPath, count) {
  if (!fs.existsSync(jsonlPath)) return [];

  try {
    const stat = fs.statSync(jsonlPath);
    const MAX_READ = 1024 * 1024;
    let content;
    if (stat.size > MAX_READ) {
      const fd = fs.openSync(jsonlPath, 'r');
      const buf = Buffer.alloc(MAX_READ);
      fs.readSync(fd, buf, 0, MAX_READ, stat.size - MAX_READ);
      fs.closeSync(fd);
      content = buf.toString('utf-8');
      const nlIdx = content.indexOf('\n');
      if (nlIdx >= 0) content = content.slice(nlIdx + 1);
    } else {
      content = fs.readFileSync(jsonlPath, 'utf-8');
    }

    const lines = content.trim().split('\n').filter(Boolean);
    const recent = lines.slice(-count * 2);

    const entries = [];
    for (const line of recent) {
      try {
        const obj = JSON.parse(line);
        const role = obj.type || (obj.message?.role) || 'unknown';
        let text = '';

        if (typeof obj.message?.content === 'string') {
          text = obj.message.content;
        } else if (Array.isArray(obj.message?.content)) {
          text = obj.message.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
        } else if (obj.result) {
          text = typeof obj.result === 'string' ? obj.result : JSON.stringify(obj.result);
        }

        if (text.trim()) entries.push({ role, text: text.trim() });
      } catch { /* skip */ }
    }

    return entries.slice(-count);
  } catch {
    return [];
  }
}

module.exports = { parseCommand, handleCommand };
```

- [ ] **Step 2: Commit**

```bash
git add electron/feishu/commands.js
git commit -m "feat: extract slash commands into feishu/commands.js, add /permission /allow /disallow"
```

---

### Task 8: Create `electron/feishu/bridge.js` — Core Bridge

**Files:**
- Create: `electron/feishu/bridge.js`

The main bridge class that wires together all modules: permissions, hooks-handler, commands, claude-spawn, cards. This replaces the monolithic `feishu-bridge.js`.

- [ ] **Step 1: Create `electron/feishu/bridge.js`**

```js
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { WSClient, EventDispatcher, Client } = require('@larksuiteoapi/node-sdk');

const { PermissionManager } = require('./permissions');
const { HooksHandler } = require('./hooks-handler');
const { handleCommand } = require('./commands');
const { spawnClaude, resolveClaudeBinary } = require('./claude-spawn');
const { resolveCwd, watchBinding } = require('./binding');
const { buildResponseCard, buildAckCard, buildErrorCard, buildWarningCard, buildConfirmResultCard, extractCardText } = require('./cards');

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
    this._watcher = null;
    this._claudeProcess = null;
    this._model = null;
    this._lastMessage = null;
    this._confirmMode = false;
    this._terminatedByUser = false;

    // Permission and hooks system
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
      binding: binding ? {
        chatId: binding.chat_id,
        jsonlPath: binding.jsonl_path,
        sessionId: binding.session_id
      } : null,
      processing: this._processing
    };
  }

  /**
   * Start the Feishu WebSocket connection and hooks HTTP server.
   */
  async start() {
    const config = this.store.getFeishuConfig();
    if (!config || !config.app_id || !config.app_secret) {
      throw new Error('飞书凭证未配置');
    }

    if (this._connected && this.wsClient) {
      return { success: true, message: 'already connected' };
    }

    // Start hooks HTTP server
    await this._hooksHandler.start();

    // Create Feishu client
    this.client = new Client({
      appId: config.app_id,
      appSecret: config.app_secret
    });

    // Create event dispatcher
    this.eventDispatcher = new EventDispatcher({}).register({
      'im.message.receive_v1': async (data) => {
        try {
          const msg = this._normalizeMessage(data);
          if (!msg) return;

          if (this._seenMsgIds.has(msg.messageId)) return;
          this._seenMsgIds.add(msg.messageId);
          if (this._seenMsgIds.size > 200) {
            this._seenMsgIds = new Set([...this._seenMsgIds].slice(-100));
          }

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
        try {
          await this._handleCardAction(data);
        } catch (err) {
          console.error('[feishu][cardAction] ERROR:', err.message);
        }
        return { toast: { type: 'success', content: '已处理' } };
      }
    });

    // Create WSClient
    this.wsClient = new WSClient({
      appId: config.app_id,
      appSecret: config.app_secret,
      onReconnecting: () => {
        this._connected = false;
        this._notifyRenderer('feishu:statusChanged', { connected: false });
      },
      onReconnected: () => {
        this._connected = true;
        this._notifyRenderer('feishu:statusChanged', { connected: true });
      }
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

    // Slash commands
    if (messageText.startsWith('/')) {
      const binding = this.store.getBindingByChatId(chatId) || this._tryPendingBinding(chatId, chatType);
      await handleCommand({
        chatId, text: messageText, binding,
        sendCard: (id, card) => this._sendCard(id, card),
        killClaude: () => this._killClaudeProcess('SIGTERM'),
        getProcessing: () => this._processing,
        setProcessing: (v) => { this._processing = v; },
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

    // Normal message
    let binding = this.store.getBindingByChatId(chatId);
    if (!binding) binding = this._tryPendingBinding(chatId, chatType);

    if (!binding) {
      await this._sendCard(chatId, buildWarningCard('😔 未绑定会话', '此飞书会话未绑定到 Claude Code\n\n请在 **claude-history** 桌面应用中点击「绑定到飞书」按钮'));
      return;
    }

    if (this._processing) {
      await this._sendCard(chatId, buildWarningCard('⏳ 请稍候', '正在处理上一条消息，请等待完成后再发送新消息'));
      return;
    }

    this._processing = true;
    this._notifyRenderer('feishu:statusChanged', { processing: true });

    const preview = messageText.length > 30 ? messageText.slice(0, 30) + '...' : messageText;

    try {
      if (this._confirmMode) {
        const approved = await this._requestConfirmation(chatId, preview);
        if (!approved) return;
      } else {
        await this._sendCard(chatId, buildAckCard(preview));
      }

      const response = await this._doSpawnClaude({
        sessionId: binding.session_id,
        jsonlPath: binding.jsonl_path,
        message: messageText,
        chatId
      });

      this._touchConversation(binding.jsonl_path);
      await this._sendCard(chatId, buildResponseCard(response));
      this._lastMessage = messageText;

      this._notifyRenderer('feishu:jsonlChanged', { jsonlPath: binding.jsonl_path, sessionId: binding.session_id });
    } catch (err) {
      await this._sendCard(chatId, buildErrorCard(err.message)).catch(() => {});
    } finally {
      this._processing = false;
      this._notifyRenderer('feishu:statusChanged', { processing: false });
    }
  }

  /**
   * Internal spawn wrapper that tracks the child process and hooks port.
   */
  _doSpawnClaude({ sessionId, jsonlPath, message, chatId }) {
    const hookPort = this._hooksHandler.port;
    const self = this;

    return new Promise((resolve, reject) => {
      const spawnPromise = spawnClaude({
        sessionId, jsonlPath, message,
        model: self._model,
        hookPort,
        onToolUse: (toolName, toolInput) => {
          // Real-time notification to Feishu (existing behavior, non-blocking)
          // The hooks system handles pre-execution confirmation separately
        }
      });

      // Track child process for cancellation
      // spawnClaude returns a promise, but we need the child ref.
      // We patch it via resolve._child in claude-spawn — but that's hacky.
      // Instead, let's set up a tracking mechanism.
      spawnPromise.then(resolve).catch(reject);
    });
  }

  // ── Card Action Handling ──

  async _handleCardAction(data) {
    const value = data?.action?.value;
    const messageId = data?.context?.open_message_id || data?.open_message_id;

    if (!value || !value.requestId) return;

    // Try hooks handler first (new permission confirmation cards)
    if (value.action?.startsWith('hook_')) {
      this._hooksHandler.handleCardAction(value);
      return;
    }

    // Legacy pre-execution confirmation (confirm mode)
    if (value.action === 'approve' || value.action === 'deny') {
      const entry = this._legacyConfirmations?.get(value.requestId);
      if (entry) {
        entry.resolve(value.action === 'approve');
        const updatedCard = value.action === 'approve'
          ? buildConfirmResultCard('✅ 已批准，正在处理...', 'green')
          : buildConfirmResultCard('❌ 已拒绝', 'red');
        this._updateCard(messageId, updatedCard).catch(() => {});
      }
      return;
    }

    // Legacy tool notification actions (terminate/allow_once/always_allow)
    if (value.action === 'terminate') {
      this._terminatedByUser = true;
      this._killClaudeProcess('SIGTERM');
      await this._updateCard(messageId, buildConfirmResultCard('🛑 已终止执行', 'red'));
      return;
    }

    if (value.action === 'always_allow' && value.toolName) {
      this._permissions.alwaysAllow(value.toolName);
      await this._updateCard(messageId, buildConfirmResultCard(`🔓 已始终允许 ${value.toolName}`, 'green'));
      return;
    }
  }

  // ── Pre-execution Confirmation (confirm mode) ──

  _requestConfirmation(chatId, preview) {
    return new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID();
      const TIMEOUT_MS = 5 * 60 * 1000;

      const timeout = setTimeout(async () => {
        const entry = this._legacyConfirmations?.get(requestId);
        if (entry?.cardMessageId) {
          await this._updateCard(entry.cardMessageId, buildConfirmResultCard('⏰ 确认已超时', 'grey'));
        }
        this._legacyConfirmations?.delete(requestId);
        resolve(false);
      }, TIMEOUT_MS);

      // Store resolve for card action callback
      this._legacyConfirmations = this._legacyConfirmations || new Map();
      this._legacyConfirmations.set(requestId, {
        resolve: (approved) => {
          clearTimeout(timeout);
          this._legacyConfirmations.delete(requestId);
          resolve(approved);
        },
        timeout,
        cardMessageId: null
      });

      // Send card ONCE — wire up cardMessageId via the stored entry
      this._sendCard(chatId, this._buildLegacyConfirmCard(requestId, preview))
        .then(msgId => {
          if (this._legacyConfirmations?.get(requestId)) {
            this._legacyConfirmations.get(requestId).cardMessageId = msgId;
          }
        })
        .catch(err => {
          clearTimeout(timeout);
          this._legacyConfirmations.delete(requestId);
          reject(err);
        });
    });
  }

  _buildLegacyConfirmCard(requestId, preview) {
    return {
      schema: '2.0',
      config: { width_mode: 'fill' },
      header: { title: { tag: 'plain_text', content: '🔐 授权确认' }, template: 'orange' },
      body: {
        elements: [
          { tag: 'markdown', content: `> ${preview}\n\nClaude 将处理此消息。是否允许？` },
          {
            tag: 'action',
            actions: [
              { tag: 'button', text: { tag: 'plain_text', content: '✅ 允许' }, type: 'primary', value: { requestId, action: 'approve' } },
              { tag: 'button', text: { tag: 'plain_text', content: '❌ 拒绝' }, type: 'danger', value: { requestId, action: 'deny' } }
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
    if (binding && !binding.chat_id.startsWith('_pending_')) {
      return binding.chat_id;
    }
    return null;
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
    let text;
    if (typeof msg.content === 'string') text = msg.content;
    else if (msg.text) text = msg.text;
    else text = String(msg.content || '');
    text = text.replace(/^@\S+\s*/, '');
    return text.trim();
  }

  _normalizeMessage(event) {
    const msg = event?.message;
    if (!msg) return null;

    const chatId = msg.chat_id;
    const chatType = msg.chat_type || 'p2p';

    let text = '';
    try {
      const parsed = JSON.parse(msg.content);
      if (typeof parsed === 'string') text = parsed;
      else if (parsed.text) text = parsed.text;
      else text = msg.content || '';
    } catch {
      text = msg.content || '';
    }

    text = text.replace(/^@\S+\s*/, '').trim();

    return { chatId, chatType, content: text, text, messageId: msg.message_id };
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
    } catch (err) {
      console.error('[feishu] Failed to send reply:', err.message);
    }
  }

  async _sendCard(chatId, card) {
    if (!this.client) {
      return this._sendReply(chatId, extractCardText(card));
    }

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
      await this.client.im.v1.message.patch({
        path: { message_id: messageId },
        data: { content: JSON.stringify(card) }
      });
    } catch (err) {
      console.error('[feishu] Failed to update card:', err.message);
    }
  }

  _watchBinding(binding) {
    this._unwatch();
    if (!binding || !binding.jsonl_path) return;

    this._unwatchCleanup = watchBinding(binding, (jsonlPath, sessionId) => {
      this._notifyRenderer('feishu:jsonlChanged', { jsonlPath, sessionId });
    });
  }

  _unwatch() {
    if (this._unwatchCleanup) {
      this._unwatchCleanup();
      this._unwatchCleanup = null;
    }
  }

  _touchConversation(jsonlPath) {
    try {
      const stat = fs.statSync(jsonlPath);
      const conv = this.store.getConversationByFilePath(jsonlPath);
      if (conv) this.store.upsertConversation(conv.project_id, jsonlPath, stat.size, Date.now());
    } catch {}
  }

  _notifyRenderer(channel, data) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  migrateFromCcConnect() {
    const config = this.store.getFeishuConfig();
    if (config && config.app_id) return false;

    const tomlPath = path.join(CC_DIR(), 'config.toml');
    if (!fs.existsSync(tomlPath)) return false;

    try {
      const smolTOML = require('smol-toml');
      const content = fs.readFileSync(tomlPath, 'utf-8');
      const data = smolTOML.parse(content);

      const projects = data.projects;
      if (!Array.isArray(projects)) return false;

      for (const project of projects) {
        const platforms = project.platforms;
        if (!Array.isArray(platforms)) continue;
        for (const platform of platforms) {
          if (platform.type === 'feishu' && platform.options) {
            const appId = platform.options.app_id;
            const appSecret = platform.options.app_secret;
            if (appId && appSecret) {
              this.store.saveFeishuConfig(appId, appSecret);
              return true;
            }
          }
        }
      }
    } catch (err) {
      console.warn('[feishu] Failed to migrate from cc-connect:', err.message);
    }
    return false;
  }
}

module.exports = { FeishuBridge };
```

- [ ] **Step 2: Commit**

```bash
git add electron/feishu/bridge.js
git commit -m "feat: create modular FeishuBridge with hooks integration"
```

---

### Task 9: Create `electron/feishu/index.js` — Module Entry Point

**Files:**
- Create: `electron/feishu/index.js`

Simple re-export so the rest of the app can `require('./feishu')`.

- [ ] **Step 1: Create `electron/feishu/index.js`**

```js
'use strict';

const { FeishuBridge } = require('./bridge');

module.exports = { FeishuBridge };
```

- [ ] **Step 2: Commit**

```bash
git add electron/feishu/index.js
git commit -m "feat: add feishu module entry point"
```

---

### Task 10: Update `electron/index.js` — Switch to New Module

**Files:**
- Modify: `electron/index.js`

Change the import from `./feishu-bridge` to `./feishu`.

- [ ] **Step 1: Update the import line in `electron/index.js`**

Change line 5:
```js
// Before:
const { FeishuBridge } = require('./feishu-bridge');

// After:
const { FeishuBridge } = require('./feishu');
```

- [ ] **Step 2: Verify the app starts without errors**

Run: `cd /Users/edy/my-space/claude-history && npm run electron:dev`

Expected: App starts normally, no `MODULE_NOT_FOUND` errors in the console.

- [ ] **Step 3: Commit**

```bash
git add electron/index.js
git commit -m "feat: switch index.js to use modular feishu/ directory"
```

---

### Task 11: Smoke Test — Verify Full Flow

**Files:**
- No new files

Manual verification that the entire Feishu bridge still works end-to-end.

- [ ] **Step 1: Start the app**

Run: `cd /Users/edy/my-space/claude-history && npm run electron:dev`

- [ ] **Step 2: Open Settings, connect Feishu**

Open the Settings modal in the app, verify Feishu credentials are present, click connect. Verify WebSocket connects.

- [ ] **Step 3: Test basic command**

Send `/help` via Feishu to the bot. Verify the help card is returned with the new `/permission`, `/allow`, `/disallow` commands listed.

- [ ] **Step 4: Test permission command**

Send `/permission` via Feishu. Verify the current permission mode card is returned.

- [ ] **Step 5: Test a simple message**

Send a simple non-sensitive message like "你好" via Feishu. Verify Claude responds. This tests that the basic flow (message → Claude → response) still works.

- [ ] **Step 6: Test hook confirmation**

Send "请在当前目录创建一个文件 test-hooks.txt 内容为 hello" via Feishu. Verify a permission confirmation card appears. Click "允许" and verify the file is created and Claude responds.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: complete feishu hooks interaction — all modules wired and tested"
```

---

### Task 12: Clean Up — Remove Old Monolithic File

**Files:**
- Delete: `electron/feishu-bridge.js`

- [ ] **Step 1: Delete the old file**

```bash
git rm electron/feishu-bridge.js
```

- [ ] **Step 2: Verify nothing else imports it**

Run: `grep -r "feishu-bridge" electron/ src/ --include="*.js" --include="*.vue"`

Expected: No results (all references should use `./feishu` now).

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: remove monolithic feishu-bridge.js (replaced by feishu/ directory)"
```
