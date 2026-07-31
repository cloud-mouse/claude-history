'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { extractTitle } = require('./title-extractor');
const {
  parseCodexSessionMeta,
  extractCodexUserText,
} = require('./codex-parser');
const { getCodexHomeDir } = require('./conversation-source');

function getHomeDir() {
  return process.env.HOME || process.env.USERPROFILE || os.homedir();
}

const PROJECTS_DIR = path.join(getHomeDir(), '.claude', 'projects');

const readline = require('readline');

/**
 * Read the first `cwd` recorded in a transcript JSONL.
 *
 * Claude Code stamps every user/assistant frame with the real working directory,
 * so the earliest one (usually within the first few lines) is the exact dir the
 * session was started from. We stream only until the first hit, so the cost is
 * tiny even for huge transcripts. This is the reliable source of truth — unlike
 * the encoded projects-folder name, which is lossy whenever a real path segment
 * contains '-' (e.g. `claude-history`, `my-space`).
 *
 * @param {string} filePath
 * @returns {Promise<string|null>}
 */
async function readFirstCwd(filePath) {
  return new Promise((resolve) => {
    let cwd = null;
    const stream = fs.createReadStream(filePath, { encoding: 'utf8', highWaterMark: 64 * 1024 });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    rl.on('line', (line) => {
      if (cwd) return; // Already found — just waiting for the stream to close.
      if (!line.trim()) return;
      try {
        const obj = JSON.parse(line);
        if (obj && typeof obj.cwd === 'string' && obj.cwd) {
          cwd = obj.cwd;
          rl.close(); // Stop reading; the 'close' handler resolves.
        }
      } catch {
        // Skip malformed lines — keep scanning for a cwd.
      }
    });
    rl.on('close', () => resolve(cwd));
    rl.on('error', () => resolve(cwd));
  });
}

/**
 * Scan a projects directory for subdirectories (projects) and .jsonl files (conversations)
 * @param {string} projectsDir - Path to the projects directory (defaults to ~/.claude/projects)
 * @returns {Array} Array of project objects with conversations
 */
async function scanProjects(projectsDir = PROJECTS_DIR) {
  const projects = [];

  if (!fs.existsSync(projectsDir)) {
    return projects;
  }

  const entries = fs.readdirSync(projectsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const projectPath = path.join(projectsDir, entry.name);
      const conversations = await scanConversations(projectPath);

      projects.push({
        id: entry.name,  // Use name as unique identifier
        name: entry.name,
        path: projectPath,
        conversations: conversations,
      });
    }
  }

  return projects;
}

/**
 * Scan a project directory for .jsonl files (conversations)
 * @param {string} projectPath - Path to the project directory
 * @returns {Array} Array of conversation objects
 */
async function scanConversations(projectPath) {
  const conversations = [];

  if (!fs.existsSync(projectPath)) {
    return conversations;
  }

  const entries = fs.readdirSync(projectPath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      const filePath = path.join(projectPath, entry.name);

      try {
        const stats = fs.statSync(filePath);
        const projectDir = await readFirstCwd(filePath);
        conversations.push({
          id: filePath,  // Use filePath as unique identifier
          filePath: filePath,
          projectDir,  // Real cwd from the transcript — used for `claude --resume`
          fileSize: stats.size,
          updatedAt: stats.mtimeMs,
        });
      } catch (err) {
        // Skip files that cannot be accessed
        console.warn(`Failed to stat file ${filePath}: ${err.message}`);
      }
    }
  }

  conversations.sort((a, b) => b.updatedAt - a.updatedAt);

  return conversations;
}

function collectJsonlFiles(rootDir) {
  const files = [];
  if (!fs.existsSync(rootDir)) return files;
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const entryPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectJsonlFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      files.push(entryPath);
    }
  }
  return files;
}

function readCodexConversationMetadata(filePath) {
  return new Promise((resolve) => {
    let metadata = null;
    let firstUserText = null;
    const stream = fs.createReadStream(filePath, { encoding: 'utf8', highWaterMark: 64 * 1024 });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    rl.on('line', (line) => {
      if (!line.trim()) return;
      try {
        const raw = JSON.parse(line);
        if (!metadata) metadata = parseCodexSessionMeta(raw);
        if (!firstUserText) firstUserText = extractCodexUserText(raw);
        if (metadata && firstUserText) rl.close();
      } catch (err) {
        console.warn(`[file-scanner] Skipped malformed Codex line in ${filePath}: ${err.message}`);
      }
    });
    rl.on('close', () => resolve(metadata ? { ...metadata, firstUserText } : null));
    rl.on('error', () => resolve(metadata ? { ...metadata, firstUserText } : null));
  });
}

function codexProjectName(projectDir) {
  if (!projectDir) return '未归类';
  const normalized = projectDir.replace(/[\\/]+$/, '');
  return path.basename(normalized) || projectDir;
}

/**
 * Scan Codex active and archived sessions without persisting them to SQLite.
 * @param {string} [codexHome]
 * @returns {Promise<Array>}
 */
async function scanCodexProjects(codexHome = getCodexHomeDir()) {
  const activeRoot = path.join(codexHome, 'sessions');
  const archivedRoot = path.join(codexHome, 'archived_sessions');
  const candidates = [
    ...collectJsonlFiles(activeRoot).map((filePath) => ({ filePath, archived: false })),
    ...collectJsonlFiles(archivedRoot).map((filePath) => ({ filePath, archived: true })),
  ];
  const seenSessionIds = new Set();
  const projectsByDir = new Map();

  for (const candidate of candidates) {
    try {
      const metadata = await readCodexConversationMetadata(candidate.filePath);
      if (!metadata) {
        console.warn(`[file-scanner] Missing Codex session metadata: ${candidate.filePath}`);
        continue;
      }
      if (metadata.internal) continue;

      const fallbackId = path.basename(candidate.filePath, '.jsonl');
      const sessionId = metadata.sessionId || fallbackId;
      if (seenSessionIds.has(sessionId)) continue;
      seenSessionIds.add(sessionId);

      const stats = fs.statSync(candidate.filePath);
      const projectDir = metadata.projectDir || null;
      const projectKey = projectDir || 'uncategorized';
      if (!projectsByDir.has(projectKey)) {
        projectsByDir.set(projectKey, {
          id: projectDir ? `codex:${projectDir}` : 'codex:uncategorized',
          source: 'codex',
          name: codexProjectName(projectDir),
          path: projectDir || '',
          conversations: [],
        });
      }
      projectsByDir.get(projectKey).conversations.push({
        id: `codex:${sessionId}`,
        source: 'codex',
        sessionId,
        filePath: candidate.filePath,
        fileSize: stats.size,
        updatedAt: stats.mtimeMs,
        title: extractTitle(metadata.firstUserText),
        projectDir,
        archived: candidate.archived,
      });
    } catch (err) {
      console.warn(`[file-scanner] Failed to scan Codex session ${candidate.filePath}: ${err.message}`);
    }
  }

  const projects = Array.from(projectsByDir.values());
  for (const project of projects) {
    project.conversations.sort((a, b) => b.updatedAt - a.updatedAt);
  }
  return projects;
}

module.exports = { scanProjects, scanConversations, scanCodexProjects, PROJECTS_DIR };
