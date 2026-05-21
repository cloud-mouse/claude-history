'use strict';

const { ipcMain, shell } = require('electron');
const { exec } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { Store } = require('./store');
const { scanProjects } = require('./file-scanner');
const { parseStream } = require('./jsonl-parser');
const { parseMessage } = require('./message-parser');
const { extractTitleFromJsonl } = require('./title-extractor');

// Lazy-initialize store to allow data directory creation
let _store = null;
function getHomeDir() {
  return process.env.HOME || process.env.USERPROFILE || os.homedir();
}

function getStore() {
  if (!_store) {
    const dbPath = path.join(getHomeDir(), '.claude', 'history-viewer.db');
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    _store = new Store(dbPath);
  }
  return _store;
}

// LRU cache for loaded conversations (max 20 entries)
const conversationCache = new Map();
const MAX_CACHE_SIZE = 20;

// Track in-flight requests to prevent duplicate parsing
const pendingRequests = new Map();

function addToCache(filePath, messages) {
  // Evict oldest entry if at capacity
  if (conversationCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = conversationCache.keys().next().value;
    conversationCache.delete(oldestKey);
  }
  conversationCache.set(filePath, messages);
}

function getFromCache(filePath) {
  return conversationCache.get(filePath) || null;
}

/**
 * Register all IPC handlers
 */
function registerIpcHandlers() {
  // 1. scan-projects — Scan projects dir, upsert to SQLite, return enriched project list
  ipcMain.handle('scan-projects', async () => {
    try {
      const store = getStore();
      const projects = scanProjects();

      // Clean up legacy bad titles (from older versions that didn't strip XML tags)
      const cleaned = store.cleanBadTitles();
      if (cleaned > 0) {
        console.log(`[ipc-handlers] Cleaned ${cleaned} bad titles`);
      }

      for (const project of projects) {
        // Upsert project to SQLite
        store.upsertProject(project.name, project.path);

        // Get the project ID
        const dbProject = store.getProjectByPath(project.path);
        if (!dbProject) continue;

        // Upsert conversations
        for (const conv of project.conversations) {
          store.upsertConversation(
            dbProject.id,
            conv.filePath,
            conv.fileSize,
            conv.updatedAt
          );
        }

        // Fetch enriched conversations from DB and convert to camelCase
        const dbConvs = store.getConversationsByProject(dbProject.id);

        // Extract titles for conversations that don't have one
        const noTitleConvs = dbConvs.filter(c => !c.title);
        if (noTitleConvs.length > 0) {
          for (const conv of noTitleConvs) {
            // Skip files that no longer exist on disk
            if (!fs.existsSync(conv.file_path)) continue;
            try {
              const title = await extractTitleFromJsonl(conv.file_path);
              if (title && title !== 'Conversation ' + new Date().toISOString().slice(0, 10)) {
                store.updateTitle(conv.id, title);
                conv.title = title;
              }
            } catch (e) {
              console.warn(`[ipc-handlers] Failed to extract title for ${conv.file_path}: ${e.message}`);
            }
          }
        }

        project.conversations = dbConvs.map(conv => ({
          id: conv.id,
          filePath: conv.file_path,
          fileSize: conv.file_size,
          updatedAt: conv.updated_at,
          title: conv.title
        }));
      }

      return { success: true, projects };
    } catch (err) {
      console.error('[ipc-handlers] scan-projects error:', err);
      return { success: false, error: err.message };
    }
  });

  // clear-cache — Clear the in-memory conversation cache
  ipcMain.handle('clear-cache', async () => {
    conversationCache.clear();
    return { success: true };
  });

  // invalidate-conversation-cache — Clear cache for a specific file
  ipcMain.handle('invalidate-conversation-cache', async (_, filePath) => {
    conversationCache.delete(filePath);
    pendingRequests.delete(filePath);
    return { success: true };
  });

  // 2. get-conversations — Get conversations for a project from SQLite
  ipcMain.handle('get-conversations', async (_, projectId) => {
    try {
      const store = getStore();
      const dbConvs = store.getConversationsByProject(projectId);
      const conversations = dbConvs.map(conv => ({
        id: conv.id,
        filePath: conv.file_path,
        fileSize: conv.file_size,
        updatedAt: conv.updated_at,
        title: conv.title
      }));
      return { success: true, conversations };
    } catch (err) {
      console.error('[ipc-handlers] get-conversations error:', err);
      return { success: false, error: err.message };
    }
  });

  // 3. load-conversation — Stream-parse .jsonl file, LRU cache, return messages
  ipcMain.handle('load-conversation', async (_, filePath) => {
    try {
      // Check cache first
      const cached = getFromCache(filePath);
      if (cached) {
        return { success: true, messages: cached.messages, projectDir: cached.projectDir, fromCache: true };
      }

      // If there's already a pending request for this file, await it
      if (pendingRequests.has(filePath)) {
        return pendingRequests.get(filePath);
      }

      // Create the parsing promise
      const parsePromise = (async () => {
        const messages = [];
        let projectDir = null;
        await parseStream(filePath, (raw) => {
          // Extract cwd from first user message
          if (!projectDir && raw.type === 'user' && raw.cwd) {
            projectDir = raw.cwd;
          }
          const parsed = parseMessage(raw);
          messages.push(parsed);
        });
        const data = { messages, projectDir };
        addToCache(filePath, data);
        return { success: true, messages, projectDir, fromCache: false };
      })();

      pendingRequests.set(filePath, parsePromise);
      try {
        return await parsePromise;
      } finally {
        pendingRequests.delete(filePath);
      }
    } catch (err) {
      console.error('[ipc-handlers] load-conversation error:', err);
      return { success: false, error: err.message };
    }
  });

  // 4. update-title — Update conversation title in SQLite
  ipcMain.handle('update-title', async (_, convId, title) => {
    try {
      const store = getStore();
      store.updateTitle(convId, title);
      return { success: true };
    } catch (err) {
      console.error('[ipc-handlers] update-title error:', err);
      return { success: false, error: err.message };
    }
  });

  // 5. search-conversations — Basic title search
  ipcMain.handle('search-conversations', async (_, projectId, query) => {
    try {
      const store = getStore();
      const conversations = store.getConversationsByProject(projectId);

      if (!query || !query.trim()) {
        return { success: true, conversations };
      }

      const searchTerm = query.toLowerCase().trim();
      const filtered = conversations.filter((conv) => {
        const title = (conv.title || '').toLowerCase();
        return title.includes(searchTerm);
      });

      return { success: true, conversations: filtered };
    } catch (err) {
      console.error('[ipc-handlers] search-conversations error:', err);
      return { success: false, error: err.message };
    }
  });

  // 6. open-external — Open file path externally via shell
  ipcMain.handle('open-external', async (_, filePath) => {
    try {
      await shell.openPath(filePath);
      return { success: true };
    } catch (err) {
      console.error('[ipc-handlers] open-external error:', err);
      return { success: false, error: err.message };
    }
  });

  // 7. delete-conversation — Delete conversation file and SQLite record
  ipcMain.handle('delete-conversation', async (_, filePath) => {
    try {
      // Delete the actual .jsonl file from disk
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      // Remove from in-memory cache
      conversationCache.delete(filePath);
      // Remove from SQLite
      const store = getStore();
      store.deleteConversation(filePath);
      return { success: true };
    } catch (err) {
      console.error('[ipc-handlers] delete-conversation error:', err);
      return { success: false, error: err.message };
    }
  });

  // 8. delete-project — Delete project folder and SQLite records
  ipcMain.handle('delete-project', async (_, projectId) => {
    try {
      const store = getStore();
      // projectId is actually the folder name (e.g., "-Users-edy-my-space-claude-history")
      const projectsDir = path.join(getHomeDir(), '.claude', 'projects');
      const projectPath = path.join(projectsDir, projectId);

      // Delete the actual project folder from disk
      if (fs.existsSync(projectPath)) {
        fs.rmSync(projectPath, { recursive: true, force: true });
      }

      // Clear cached conversations for this project
      for (const key of conversationCache.keys()) {
        if (key.startsWith(projectPath + path.sep)) {
          conversationCache.delete(key);
        }
      }

      // Remove from SQLite
      const dbProject = store.getProjectByPath(projectPath);
      if (dbProject) {
        store.deleteProject(dbProject.id);
      }
      return { success: true };
    } catch (err) {
      console.error('[ipc-handlers] delete-project error:', err);
      return { success: false, error: err.message };
    }
  });

  // 9. resume-conversation — Open terminal with claude --resume command
  ipcMain.handle('resume-conversation', async (_, filePath, projectDir) => {
    try {
      const fileName = path.basename(filePath, '.jsonl');
      const workDir = projectDir || path.dirname(filePath);
      const command = `claude --resume ${fileName}`;

      // Detect platform and open terminal with command
      const isMac = process.platform === 'darwin';
      const isLinux = process.platform === 'linux';

      let terminalCommand;
      if (isMac) {
        terminalCommand = `osascript -e 'tell app "Terminal" to do script "cd ${workDir.replace(/'/g, "'\\''")} && ${command}"'`;
      } else if (isLinux) {
        // Try common terminal emulators
        terminalCommand = `bash -c 'cd "${workDir}" && ${command}; exec bash' &`;
      } else {
        // Windows - use cmd
        terminalCommand = `start cmd /k "cd /d ${workDir} && ${command}"`;
      }

      exec(terminalCommand, (err) => {
        if (err) {
          console.error('[ipc-handlers] Failed to open terminal:', err);
        }
      });

      return { success: true };
    } catch (err) {
      console.error('[ipc-handlers] resume-conversation error:', err);
      return { success: false, error: err.message };
    }
  });

  console.log('[ipc-handlers] All handlers registered');
}

module.exports = { registerIpcHandlers, getStore };
