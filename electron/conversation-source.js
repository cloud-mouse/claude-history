'use strict';

const os = require('os');
const path = require('path');

const SOURCES = Object.freeze({
  CLAUDE: 'claude',
  CODEX: 'codex',
});

/**
 * Normalize and validate a conversation source.
 * @param {string|null|undefined} source
 * @returns {'claude'|'codex'}
 */
function normalizeSource(source) {
  const normalized = source == null || source === '' ? SOURCES.CLAUDE : source;
  if (normalized !== SOURCES.CLAUDE && normalized !== SOURCES.CODEX) {
    throw new Error(`不支持的会话来源: ${String(source)}`);
  }
  return normalized;
}

function resolveHomeDir(options = {}) {
  const env = options.env || process.env;
  const homeDir = options.homeDir || env.HOME || env.USERPROFILE || os.homedir();
  return path.resolve(homeDir);
}

/**
 * Resolve the Codex data directory.
 * @param {{env?: Object, homeDir?: string}} [options]
 * @returns {string}
 */
function getCodexHomeDir(options = {}) {
  const env = options.env || process.env;
  const configured = typeof env.CODEX_HOME === 'string' ? env.CODEX_HOME.trim() : '';
  return configured
    ? path.resolve(configured)
    : path.join(resolveHomeDir(options), '.codex');
}

/**
 * Return the roots a conversation source may read from.
 * @param {string} source
 * @param {{env?: Object, homeDir?: string}} [options]
 * @returns {string[]}
 */
function getSourceRoots(source, options = {}) {
  const normalized = normalizeSource(source);
  if (normalized === SOURCES.CODEX) {
    const codexHome = getCodexHomeDir(options);
    return [
      path.join(codexHome, 'sessions'),
      path.join(codexHome, 'archived_sessions'),
    ].map((item) => path.resolve(item));
  }
  return [path.resolve(path.join(resolveHomeDir(options), '.claude', 'projects'))];
}

function isWithinRoot(targetPath, rootPath) {
  return targetPath === rootPath || targetPath.startsWith(rootPath + path.sep);
}

/**
 * Validate an IPC-supplied conversation file path against its source roots.
 * @param {string} filePath
 * @param {string} source
 * @param {{env?: Object, homeDir?: string}} [options]
 * @returns {string}
 */
function assertConversationFilePath(filePath, source, options = {}) {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    throw new Error('会话文件路径不能为空');
  }
  const resolved = path.resolve(filePath);
  if (path.extname(resolved).toLowerCase() !== '.jsonl') {
    throw new Error('会话文件必须是 .jsonl');
  }
  const roots = getSourceRoots(source, options);
  if (!roots.some((root) => isWithinRoot(resolved, root))) {
    throw new Error('会话文件不在当前来源允许的目录内');
  }
  return resolved;
}

/**
 * Build an LRU key that cannot collide across sources.
 * @param {string} source
 * @param {string} filePath
 * @returns {string}
 */
function getConversationCacheKey(source, filePath) {
  return `${normalizeSource(source)}:${String(filePath || '')}`;
}

module.exports = {
  SOURCES,
  normalizeSource,
  getCodexHomeDir,
  getSourceRoots,
  assertConversationFilePath,
  getConversationCacheKey,
};
