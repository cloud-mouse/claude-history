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

  get mode() { return this._mode; }

  setMode(mode) {
    if (!VALID_MODES.includes(mode)) {
      throw new Error(`Invalid permission mode: ${mode}. Valid: ${VALID_MODES.join(', ')}`);
    }
    this._mode = mode;
  }

  isAutoApproved(toolName) {
    if (this._mode === 'bypass') return true;
    if (this._alwaysAllowed.has(toolName) || this._sessionAllowed.has(toolName)) return true;
    if (this._mode === 'acceptEdits' && (toolName === 'Write' || toolName === 'Edit' || toolName === 'MultiEdit')) return true;
    if (this._mode === 'plan' && !SENSITIVE_TOOLS.includes(toolName)) return true;
    return false;
  }

  alwaysAllow(toolName) { this._alwaysAllowed.add(toolName); }
  disallow(toolName) { this._alwaysAllowed.delete(toolName); this._sessionAllowed.delete(toolName); }
  sessionAllow(toolName) { this._sessionAllowed.add(toolName); }
  getAlwaysAllowed() { return [...this._alwaysAllowed]; }

  addPending(requestId, chatId) {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this._pending.delete(requestId);
        resolve({ decision: 'deny', reason: 'timeout' });
      }, 60_000);

      this._pending.set(requestId, { resolve, timeout, cardMessageId: null, chatId });
    });
  }

  resolvePending(requestId, decision) {
    const entry = this._pending.get(requestId);
    if (!entry) return false;
    clearTimeout(entry.timeout);
    this._pending.delete(requestId);
    entry.resolve({ decision });
    return true;
  }

  getPending(requestId) { return this._pending.get(requestId); }
  getPendingIds() { return [...this._pending.keys()]; }

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
