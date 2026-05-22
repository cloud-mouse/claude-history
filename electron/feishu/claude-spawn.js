'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawn } = require('child_process');

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

function generateHookSettings(hookPort) {
  const hookScriptPath = path.join(__dirname, '..', 'feishu-hook-script.js');
  const settings = {
    hooks: {
      PreToolUse: [{
        matcher: 'Bash|Write|Edit|MultiEdit',
        hooks: [{ type: 'command', command: `FEISHU_HOOK_PORT=${hookPort} node ${hookScriptPath}`, timeout: 60 }]
      }]
    }
  };
  const tmpDir = os.tmpdir();
  const settingsPath = path.join(tmpDir, `feishu-hook-settings-${Date.now()}.json`);
  fs.writeFileSync(settingsPath, JSON.stringify(settings), 'utf-8');
  return settingsPath;
}

/**
 * Spawn Claude Code CLI with streaming output and hook configuration.
 */
function spawnClaude({ sessionId, jsonlPath, message, model, hookPort, onToolUse }) {
  return new Promise((resolve, reject) => {
    const args = ['-p', message, '--output-format', 'stream-json', '--verbose', '--permission-mode', 'bypassPermissions'];
    if (model) args.push('--model', model);

    let settingsPath = null;
    if (hookPort) {
      settingsPath = generateHookSettings(hookPort);
      args.push('--settings', settingsPath);
    }

    const { resolveCwd } = require('./binding');
    const cwd = resolveCwd(jsonlPath);
    if (cwd) {
      const slug = cwd.replace(/\//g, '-');
      const sessionFile = path.join(os.homedir(), '.claude', 'projects', slug, `${sessionId}.jsonl`);
      if (fs.existsSync(sessionFile)) args.push('--resume', sessionId);
    }

    const claudeBin = resolveClaudeBinary();
    console.log(`[feishu:spawn] ${claudeBin} ${args.join(' ')} in ${cwd || 'default cwd'}`);

    const child = spawn(claudeBin, args, {
      cwd: cwd || undefined,
      env: { ...process.env, PATH: resolveShellPath() },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    child.stdin.end();

    let stderr = '';
    let jsonBuf = '';
    let resultText = '';
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
          if (obj.type === 'result' && obj.result) resultText = obj.result;
          const content = obj.message?.content;
          if (Array.isArray(content) && onToolUse) {
            for (const block of content) {
              if (block.type === 'tool_use') onToolUse(block.name, block.input);
            }
          }
          // Early resolve: send result as soon as we get it, don't wait for process exit
          if (obj.type === 'result' && !resolved) {
            resolved = true;
            clearTimeout(timer);
            resolve(resultText || '(空响应)');
          }
        } catch {}
      }
    });

    child.stderr.on('data', (data) => { stderr += data.toString(); });

    const timer = setTimeout(() => {
      try { child.kill('SIGTERM'); } catch {}
      const killTimer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 10000);
      killTimer.unref();
      reject(new Error('Claude Code 超时（5分钟）'));
    }, 300000);

    child.on('close', (code) => {
      clearTimeout(timer);
      if (settingsPath) try { fs.unlinkSync(settingsPath); } catch {}
      if (resolved) return; // Already resolved via early result
      if (code === 0) resolve(resultText || '(空响应)');
      else reject(new Error(`Claude Code 错误: ${(stderr.trim() || 'exit code ' + code).slice(0, 200)}`));
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      if (settingsPath) try { fs.unlinkSync(settingsPath); } catch {}
      reject(new Error(`无法启动 Claude Code: ${err.message}`));
    });
  });
}

module.exports = { spawnClaude, resolveClaudeBinary, resolveShellPath, generateHookSettings };
