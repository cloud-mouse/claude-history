'use strict';

/**
 * Background index/stats backfill engine (functions 1 & 3).
 *
 * The on-disk Claude Code transcript (.jsonl) stores no `result` summary frame,
 * but every `assistant` frame carries `message.usage` (token counts) + `message.model`.
 * So we re-aggregate token stats from assistant frames and build the FTS index
 * from message text + tool calls in a single streaming pass per file.
 */

const fs = require('fs');
const { parseStream } = require('./jsonl-parser');

// tool_use.input fields worth indexing as searchable text.
const INDEXED_TOOL_INPUT_KEYS = ['file_path', 'command', 'pattern', 'path', 'notebook_path', 'url', 'query'];

/**
 * Extract searchable text from a raw JSONL row: message text blocks, thinking,
 * tool_use names + key inputs, and tool_result text. Truncated to keep FTS rows sane.
 */
function extractSearchableText(raw) {
  const parts = [];
  const content = raw.message && raw.message.content;
  const blocks = Array.isArray(content)
    ? content
    : (typeof content === 'string' ? [{ type: 'text', text: content }] : []);
  for (const b of blocks) {
    if (!b || typeof b !== 'object') continue;
    if (b.type === 'text' && b.text) parts.push(b.text);
    if (b.type === 'thinking' && b.thinking) parts.push(b.thinking);
    if (b.type === 'tool_use') {
      if (b.name) parts.push(b.name);
      const inp = b.input || {};
      for (const k of INDEXED_TOOL_INPUT_KEYS) {
        if (inp[k] != null) parts.push(String(inp[k]));
      }
    }
    if (b.type === 'tool_result') {
      if (typeof b.content === 'string') parts.push(b.content);
      else if (Array.isArray(b.content)) {
        for (const c of b.content) {
          if (c && c.type === 'text' && c.text) parts.push(c.text);
        }
      }
    }
  }
  return parts.join('\n').slice(0, 50000);
}

function roleOf(raw) {
  if (raw.type === 'assistant') return 'assistant';
  if (raw.type === 'user') {
    const content = raw.message && raw.message.content;
    if (Array.isArray(content) && content.some(b => b && b.type === 'tool_result')) return 'assistant';
    return 'user';
  }
  return raw.type || '';
}

/**
 * Re-aggregate token stats + rebuild the FTS index for one conversation.
 * Idempotent: skips work when stats_updated_at >= file mtime.
 * @returns {Promise<boolean>} true if a re-index actually happened.
 */
async function backfillConversation(store, conv) {
  if (!conv || !conv.file_path) return false;
  let stat;
  try {
    stat = fs.statSync(conv.file_path);
  } catch {
    return false; // file no longer exists
  }
  if (conv.stats_updated_at && conv.stats_updated_at >= stat.mtimeMs) return false;

  store.clearFtsForConversation(conv.id);
  const acc = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, turns: 0, models: new Set() };

  await parseStream(conv.file_path, (raw) => {
    if (raw.type === 'assistant' && raw.message && raw.message.usage) {
      const u = raw.message.usage;
      acc.input += u.input_tokens || 0;
      acc.output += u.output_tokens || 0;
      acc.cacheRead += u.cache_read_input_tokens || 0;
      acc.cacheCreation += u.cache_creation_input_tokens || 0;
      acc.turns += 1;
      if (raw.message.model) acc.models.add(raw.message.model);
    }
    const text = extractSearchableText(raw);
    if (text && raw.uuid) store.indexMessage(conv.id, raw.uuid, roleOf(raw), text);
  });

  store.updateTokens(conv.id, {
    input: acc.input, output: acc.output,
    cacheRead: acc.cacheRead, cacheCreation: acc.cacheCreation,
    turns: acc.turns, models: [...acc.models], updatedAt: stat.mtimeMs
  });
  return true;
}

const yieldTick = () => new Promise(r => setImmediate(r));

/**
 * Backfill all conversations that need it. Serial + cooperative (yields between
 * files) so it never blocks the UI thread. Resolves with {scanned, updated}.
 */
async function backfillAllPending(store, onProgress) {
  const convs = store.getAllConversations();
  let updated = 0;
  for (let i = 0; i < convs.length; i++) {
    try {
      const did = await backfillConversation(store, convs[i]);
      if (did) updated += 1;
    } catch (err) {
      console.warn(`[backfill] ${convs[i].file_path}:`, err.message);
    }
    if (onProgress) onProgress({ scanned: i + 1, total: convs.length, updated });
    await yieldTick();
  }
  return { scanned: convs.length, updated };
}

module.exports = { backfillConversation, backfillAllPending, extractSearchableText };
