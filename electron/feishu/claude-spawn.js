'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execSync, spawn } = require('child_process');

// Claude permission modes mapped from our internal PermissionManager modes.
// Only an explicit "bypass" lets Claude run fully unattended; everything else
// uses "default" so Claude itself is a fail-closed backstop and the PreToolUse
// hook is the authority that returns allow decisions.
function toClaudePermissionMode(mode) {
  return mode === 'bypass' ? 'bypassPermissions' : 'default';
}

let _cachedShellPath = null;
function resolveShellPath() {
  if (_cachedShellPath) return _cachedShellPath;
  try {
    _cachedShellPath = execSync(
      `${process.env.SHELL || '/bin/zsh'} -l -c 'echo $PATH'`,
      { encoding: 'utf-8', timeout: 5000 }
    ).trim();
    return _cachedShellPath;
  } catch (_) {}
  const home = os.homedir();
  const paths = ['/usr/local/bin', '/opt/homebrew/bin', `${home}/.nvm/versions/node/default/bin`];
  try {
    const nvmDir = path.join(home, '.nvm/versions/node');
    if (fs.existsSync(nvmDir)) {
      for (const ver of fs.readdirSync(nvmDir)) paths.push(path.join(nvmDir, ver, 'bin'));
    }
  } catch (_) {}
  paths.push(process.env.PATH || '');
  _cachedShellPath = paths.filter(Boolean).join(':');
  return _cachedShellPath;
}

function resolveClaudeBinary() {
  try {
    const p = execSync(`${process.env.SHELL || '/bin/zsh'} -l -c 'which claude'`, { encoding: 'utf-8', timeout: 5000 }).trim();
    if (p && fs.existsSync(p)) return p;
  } catch (_) {}
  const home = os.homedir();
  const candidates = ['/usr/local/bin/claude', '/opt/homebrew/bin/claude', path.join(home, '.nvm/versions/node/default/bin/claude')];
  try {
    const nvmDir = path.join(home, '.nvm/versions/node');
    if (fs.existsSync(nvmDir)) for (const ver of fs.readdirSync(nvmDir)) candidates.push(path.join(nvmDir, ver, 'bin', 'claude'));
  } catch (_) {}
  for (const c of candidates) { if (fs.existsSync(c)) return c; }
  return 'claude';
}

function generateHookSettings(hookPort, hookToken) {
  const hookScriptPath = path.join(__dirname, '..', 'feishu-hook-script.js');
  const settings = {
    hooks: {
      PreToolUse: [{
        matcher: 'Bash|Write|Edit|MultiEdit',
        hooks: [{ type: 'command', command: `FEISHU_HOOK_PORT=${hookPort} FEISHU_HOOK_TOKEN=${hookToken} node ${hookScriptPath}`, timeout: 60 }]
      }]
    }
  };
  // Write into a private, 0o600 dir under the user's home (NOT the world-writable
  // system tmpdir) and use a random filename to prevent TOCTOU/symlink swaps.
  const privateDir = path.join(os.homedir(), '.claude-history');
  try { fs.mkdirSync(privateDir, { recursive: true, mode: 0o700 }); } catch {}
  const settingsPath = path.join(privateDir, `hook-settings-${crypto.randomUUID()}.json`);
  // Restrictive perms (best-effort; the dir is already 0700).
  const fd = fs.openSync(settingsPath, 'w', 0o600);
  fs.writeFileSync(fd, JSON.stringify(settings), 'utf-8');
  fs.closeSync(fd);
  return settingsPath;
}

/**
 * Spawn Claude Code CLI with streaming output and hook configuration.
 * @param {object} opts
 * @param {string} opts.permissionMode - internal PermissionManager mode (default|plan|acceptEdits|bypass)
 * @param {Function} [opts.onSpawn] - invoked with the child process so the caller can store/kill it
 */
function spawnClaude({ sessionId, jsonlPath, message, model, hookPort, hookToken, permissionMode, onSpawn, onToolUse }) {
  return new Promise((resolve, reject) => {
    const args = ['-p', message, '--output-format', 'stream-json', '--verbose', '--permission-mode', toClaudePermissionMode(permissionMode)];
    if (model) args.push('--model', model);

    let settingsPath = null;
    if (hookPort && hookToken) {
      settingsPath = generateHookSettings(hookPort, hookToken);
      args.push('--settings', settingsPath);
    }

    const { resolveCwd } = require('./binding');
    const cwd = resolveCwd(jsonlPath);
    if (fs.existsSync(jsonlPath)) args.push('--resume', sessionId);

    const claudeBin = resolveClaudeBinary();
    // Log without the user message / token to avoid leaking sensitive content.
    console.log(`[feishu:spawn] ${claudeBin} (mode=${toClaudePermissionMode(permissionMode)}, ${args.length} args) in ${cwd || 'default cwd'}`);

    const child = spawn(claudeBin, args, {
      cwd: cwd || undefined,
      env: { ...process.env, PATH: resolveShellPath() },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // C3: surface the child so the bridge can actually kill it on /cancel.
    if (typeof onSpawn === 'function') onSpawn(child);

    child.stdin.end();

    let stderr = '';
    let jsonBuf = '';
    let resultText = '';
    let resultMeta = null;
    let resolved = false;

    child.stdout.on('data', (data) => {
      jsonBuf += data.toString();
      let nlIdx;
      while ((nlIdx = jsonBuf.indexOf('\n')) >= 0) {
        const line = jsonBuf.slice(0, nlIdx).trim();
        jsonBuf = jsonBuf.slice(nlIdx + 1);
        if (!line) continue;
        try {
          const obj = JSON.parse(line);
          if (obj.type === 'result') {
            if (obj.result) resultText = obj.result;
            // Capture usage/cost/duration (only available from the live result frame).
            resultMeta = {
              usage: obj.usage || null,
              costUsd: obj.total_cost_usd ?? null,
              durationMs: obj.duration_ms ?? null,
              turns: obj.num_turns ?? null
            };
          }
          const content = obj.message?.content;
          if (Array.isArray(content) && onToolUse) {
            for (const block of content) {
              if (block.type === 'tool_use') onToolUse(block.name, block.input);
            }
          }
          // Early resolve: send result as soon as we get it, don't wait for process exit
          if (obj.type === 'result' && !resolved) {
            resolved = true;
            resolve({ text: resultText || '(空响应)', meta: resultMeta });
          }
        } catch {}
      }
    });

    child.stderr.on('data', (data) => { stderr += data.toString(); });

    // No timeout — let Claude run until it finishes or the user kills it with /kill

    child.on('close', (code) => {
      if (settingsPath) try { fs.unlinkSync(settingsPath); } catch {}
      if (resolved) return; // Already resolved via early result
      if (code === 0) resolve({ text: resultText || '(空响应)', meta: resultMeta });
      else reject(new Error(`Claude Code 错误: ${(stderr.trim() || 'exit code ' + code).slice(0, 200)}`));
    });

    child.on('error', (err) => {
      if (settingsPath) try { fs.unlinkSync(settingsPath); } catch {}
      reject(new Error(`无法启动 Claude Code: ${err.message}`));
    });
  });
}

module.exports = { spawnClaude, resolveClaudeBinary, resolveShellPath, generateHookSettings };
