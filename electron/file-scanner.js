'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

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

module.exports = { scanProjects, scanConversations, PROJECTS_DIR };
