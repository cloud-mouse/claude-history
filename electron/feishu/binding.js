'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const MAX_SLUG_PARTS = 16;
const MAX_VARIANTS = 64;

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
      } catch {}
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

function resolveCwd(jsonlPath) {
  if (!jsonlPath) return null;
  const claudeProjectsDir = path.join(os.homedir(), '.claude', 'projects');
  const rel = path.relative(claudeProjectsDir, jsonlPath);
  const slashIdx = rel.indexOf('/');
  if (slashIdx < 0) return null;
  const slug = rel.slice(0, slashIdx);
  return decodeProjectSlug(slug);
}

// Build the jsonl path Claude CLI uses for a given cwd + session id:
// ~/.claude/projects/<cwd-with-slashes-as-dashes>/<sessionId>.jsonl. Mirrors the
// slug scheme Claude itself uses for its projects dir, so the path matches the
// file Claude actually writes — used to reconcile bindings after a fresh session.
function jsonlPathForCwd(cwd, sessionId) {
  if (!cwd || !sessionId) return null;
  const slug = cwd.replace(/\//g, '-');
  return path.join(os.homedir(), '.claude', 'projects', slug, `${sessionId}.jsonl`);
}

function watchBinding(binding, onChange) {
  if (!binding || !binding.jsonl_path) return () => {};
  const jsonlPath = binding.jsonl_path;
  const dir = path.dirname(jsonlPath);
  const fileName = path.basename(jsonlPath);
  let watcher = null;
  let debounceTimer = null;

  const cleanup = () => {
    clearTimeout(debounceTimer);
    if (watcher) { watcher.close(); watcher = null; }
  };

  if (fs.existsSync(jsonlPath)) {
    try {
      watcher = fs.watch(jsonlPath, (eventType) => {
        if (eventType === 'change') {
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => onChange(binding.jsonl_path, binding.session_id), 500);
        }
      });
    } catch (err) {
      console.error('[feishu] Failed to watch file:', err.message);
    }
  } else if (fs.existsSync(dir)) {
    try {
      watcher = fs.watch(dir, (eventType, changedFile) => {
        if (changedFile === fileName && fs.existsSync(jsonlPath)) {
          cleanup();
          // Re-watch the file directly now that it exists
          try {
            watcher = fs.watch(jsonlPath, (ev) => {
              if (ev === 'change') {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => onChange(binding.jsonl_path, binding.session_id), 500);
              }
            });
          } catch (e) {
            console.error('[feishu] Failed to re-watch file:', e.message);
          }
          onChange(binding.jsonl_path, binding.session_id);
        }
      });
    } catch (err) {
      console.error('[feishu] Failed to watch directory:', err.message);
    }
  }

  return cleanup;
}

module.exports = { decodeProjectSlug, resolveCwd, watchBinding, jsonlPathForCwd };
