/**
 * Resolve the real working directory for a conversation.
 *
 * Preferred source: conversation.projectDir — the `cwd` extracted from the first
 * user message in the JSONL (see load-conversation in ipc-handlers.js). This is the
 * exact directory Claude was invoked from.
 *
 * Last-resort fallback: decode the encoded projects-folder name. Claude Code encodes
 * the cwd by replacing '/' with '-' (e.g. /Users/edy/foo -> -Users-edy-foo). This is
 * inherently ambiguous — a real '-' inside a folder name collides with a separator —
 * so the main process still validates the result exists before opening anything.
 */

/**
 * Decode an encoded projects-folder name back to a filesystem path.
 * @param {string} encoded e.g. "-Users-edy-my-space-claude-history"
 * @returns {string|null} e.g. "/Users/edy/my/space/claude/history" (best-effort)
 */
export function decodeProjectDirName(encoded) {
  if (!encoded) return null;
  // The leading '-' came from the root '/'; drop it, then treat every '-' as '/'.
  const name = encoded.startsWith('-') ? encoded.slice(1) : encoded;
  return '/' + name.split('-').join('/');
}

/**
 * Resolve the real working directory for a conversation object.
 * @param {{ projectDir?: string|null, filePath?: string }} conversation
 * @returns {string|null}
 */
export function resolveProjectDir(conversation) {
  if (conversation?.projectDir) return conversation.projectDir;
  // Codex session folders are date-based, not encoded working directories.
  if (conversation?.source === 'codex') return null;
  const filePath = conversation?.filePath;
  if (!filePath) return null;
  // Parent folder of <sessionId>.jsonl is the encoded cwd.
  const parts = filePath.split('/');
  const encoded = parts[parts.length - 2];
  return decodeProjectDirName(encoded);
}
