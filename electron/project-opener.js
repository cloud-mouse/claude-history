'use strict';

/**
 * "Open project with external tool" — opens a project's real working directory in
 * Cursor / VS Code / IntelliJ IDEA / the system terminal.
 *
 * Security model (mirrors resume-conversation in ipc-handlers.js):
 *   - Tool keys are whitelisted; app names live only here in the main process, so a
 *     compromised renderer cannot launch arbitrary applications.
 *   - The target directory is validated to exist and be a directory before launch.
 *   - Commands are launched via spawn(argv) — the directory is always a standalone
 *     argument, never concatenated into a shell string (Windows terminal path reuses
 *     the verified cmd /k pattern from resume-conversation).
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// The only tool ids the renderer is allowed to request. App identifiers are
// hardcoded per platform so the renderer never supplies the binary/app name.
const EDITOR_APPS = {
  cursor: { macOS: 'Cursor',            linux: 'cursor', win: 'cursor' },
  vscode: { macOS: 'Visual Studio Code', linux: 'code',   win: 'code' },
  idea:   { macOS: 'IntelliJ IDEA',      linux: 'idea',   win: 'idea' },
};

const VALID_TOOLS = new Set(['cursor', 'vscode', 'idea', 'terminal']);

/**
 * Open `projectDir` with the given tool.
 * @param {string} tool   one of VALID_TOOLS
 * @param {string} projectDir absolute path to the project working directory
 * @returns {{ success: boolean, error?: string }}
 */
function openProjectWith(tool, projectDir) {
  if (!VALID_TOOLS.has(tool)) {
    return { success: false, error: '不支持的工具' };
  }
  if (!projectDir || typeof projectDir !== 'string') {
    return { success: false, error: '未提供项目目录' };
  }
  const dir = path.resolve(projectDir);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    return { success: false, error: '项目目录不存在或已被移动' };
  }

  try {
    if (tool === 'terminal') {
      openTerminal(dir);
    } else {
      openEditor(tool, dir);
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message || '打开失败' };
  }
}

function openEditor(tool, dir) {
  const cfg = EDITOR_APPS[tool];
  if (process.platform === 'darwin') {
    // `open -a "<App>" <dir>` — dir is a separate argv element, no shell injection.
    spawn('open', ['-a', cfg.macOS, dir], { detached: true, stdio: 'ignore' }).unref();
  } else if (process.platform === 'win32') {
    // cmd /c <editor> "<dir>" — quotes escaped; editor resolves via PATH.
    const winDir = dir.replace(/"/g, '\\"');
    spawn('cmd', ['/d', '/s', '/c', cfg.win, `"${winDir}"`], {
      detached: true, stdio: 'ignore', windowsVerbatimArguments: true,
    }).unref();
  } else {
    // linux: spawn the editor CLI directly; dir stays a standalone argv element.
    spawn(cfg.linux, [dir], { detached: true, stdio: 'ignore' }).unref();
  }
}

function openTerminal(dir) {
  if (process.platform === 'darwin') {
    // Reuse the verified osascript pattern; AppleScript-string-escape " and \.
    const escDir = dir.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const script = `tell application "Terminal"\nactivate\ndo script "cd \\"${escDir}\\""\nend tell`;
    spawn('osascript', ['-e', script], { detached: true, stdio: 'ignore' }).unref();
  } else if (process.platform === 'win32') {
    const winDir = dir.replace(/"/g, '\\"');
    spawn('cmd', ['/d', '/s', '/c', 'start', 'cmd', '/k', `cd /d "${winDir}"`], {
      detached: true, stdio: 'ignore', windowsVerbatimArguments: true,
    }).unref();
  } else {
    // linux: best-effort — try the Debian/Ubuntu alternative, then common emulators.
    const bashSafe = dir.replace(/'/g, `'\\''`);
    spawn('sh', ['-c', `cd '${bashSafe}' && (x-terminal-emulator || gnome-terminal || konsole) &`], {
      detached: true, stdio: 'ignore',
    }).unref();
  }
}

module.exports = { openProjectWith, VALID_TOOLS };
