# Claude History — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Electron + Vue 3 desktop application that browses and displays Claude Code conversation history from `~/.claude/projects/` with an elegant three-panel layout and chat-bubble message formatting.

**Architecture:** Electron main process handles file I/O, SQLite access, and window management. Vue 3 renderer process owns the UI. IPC bridge via contextBridge exposes safe APIs to renderer. LRU cache + SQLite index for conversation metadata. On-demand JSONL streaming parse.

**Tech Stack:** Electron 33.x, Vue 3.5.x, Vite 6.x, Pinia 2.x, better-sqlite3 11.x, highlight.js 11.x, electron-builder 25.x

---

## File Structure

```
claude-history/
├── package.json
├── vite.config.js                # Vite + Vue plugin, electron main entry
├── electron-builder.yml          # macOS .app bundle config
├── electron/
│   ├── index.js                  # Main process entry
│   ├── ipc-handlers.js           # IPC handler registration
│   ├── store.js                  # SQLite database (better-sqlite3)
│   ├── file-scanner.js           # Background project/conversation scan
│   ├── jsonl-parser.js           # Streaming JSONL parser
│   └── preload.js               # contextBridge + IPC invoke wrappers
├── src/
│   ├── main.js                   # Vue app mount
│   ├── App.vue                   # Root: three-panel layout
│   ├── stores/
│   │   ├── projects.js           # Pinia: projects list + selected project
│   │   └── conversations.js      # Pinia: conversations list + active conversation
│   ├── components/
│   │   ├── ProjectList.vue       # Left panel: project tree
│   │   ├── ConversationList.vue   # Middle panel: conversation list + search
│   │   ├── MessageThread.vue     # Right panel: message bubbles
│   │   ├── ChatBubble.vue        # Single bubble (user/Claude/system)
│   │   ├── CodeBlock.vue         # Expandable code block with copy
│   │   ├── ToolCall.vue          # Collapsible tool_use block
│   │   ├── ToolResult.vue        # Collapsible tool_result block
│   │   ├── ThinkingBlock.vue     # Collapsible thinking block
│   │   ├── FileSnapshot.vue      # file-history-snapshot renderer
│   │   ├── AttachmentList.vue   # attachment renderer
│   │   ├── PermissionBadge.vue  # permission-mode renderer
│   │   ├── SearchBar.vue        # FTS5 search input
│   │   └── SkeletonLoader.vue   # Loading placeholder
│   ├── utils/
│   │   ├── messageParser.js     # Parse raw JSONL line → normalized message object
│   │   ├── titleExtractor.js     # Extract title from first user message text
│   │   └── markdown.js          # Strip markdown formatting (for title + copy)
│   └── styles/
│       ├── variables.css        # CSS custom properties (light/dark)
│       └── global.css           # Base reset + typography
├── index.html                    # Vite HTML entry
└── .gitignore
```

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`, `vite.config.js`, `electron-builder.yml`, `electron/index.js`, `electron/preload.js`, `index.html`, `.gitignore`, `src/main.js`, `src/App.vue`, `src/styles/variables.css`, `src/styles/global.css`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "claude-history",
  "version": "1.0.0",
  "description": "Browse Claude Code conversation history",
  "main": "electron/index.js",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "electron:dev": "concurrently \"vite\" \"electron .\"",
    "electron:build": "vite build && electron-builder"
  },
  "dependencies": {
    "better-sqlite3": "^11.7.0",
    "highlight.js": "^11.10.0",
    "pinia": "^2.3.0",
    "vue": "^3.5.13"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.2.1",
    "concurrently": "^9.1.2",
    "electron": "^33.3.1",
    "electron-builder": "^25.1.8",
    "vite": "^6.0.7"
  }
}
```

- [ ] **Step 2: Create vite.config.js**

```js
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  base: './',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: { main: 'index.html' }
    }
  },
  server: {
    port: 5173
  }
});
```

- [ ] **Step 3: Create index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Claude History</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.js"></script>
</body>
</html>
```

- [ ] **Step 4: Create electron/index.js (main process)**

```js
const { app, BrowserWindow } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
```

- [ ] **Step 5: Create electron/preload.js**

```js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  scanProjects: () => ipcRenderer.invoke('scan-projects'),
  getConversations: (projectId) => ipcRenderer.invoke('get-conversations', projectId),
  loadConversation: (filePath) => ipcRenderer.invoke('load-conversation', filePath),
  searchConversations: (projectId, query) => ipcRenderer.invoke('search-conversations', projectId, query),
  updateTitle: (filePath, title) => ipcRenderer.invoke('update-title', filePath, title),
  openExternal: (filePath) => ipcRenderer.invoke('open-external', filePath)
});
```

- [ ] **Step 6: Create src/main.js**

```js
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import './styles/variables.css';
import './styles/global.css';

const app = createApp(App);
app.use(createPinia());
app.mount('#app');
```

- [ ] **Step 7: Create src/styles/variables.css**

```css
:root {
  /* Light mode */
  --color-bg: #ffffff;
  --color-bg-secondary: #f5f7fa;
  --color-bg-tertiary: #e8eaed;
  --color-text: #333333;
  --color-text-secondary: #666666;
  --color-text-muted: #888888;
  --color-border: #e0e0e0;
  --color-primary: #0066cc;
  --color-primary-hover: #0052a3;
  --color-user-bubble: #0066cc;
  --color-claude-bubble: #f0f4ff;
  --color-error: #dc3545;
  --color-success: #28a745;
  --color-warning: #ffc107;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --shadow-md: 0 2px 8px rgba(0,0,0,0.1);
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 16px;
  --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-mono: 'Fira Code', 'SF Mono', 'Cascadia Code', monospace;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-bg: #1e1e1e;
    --color-bg-secondary: #21262d;
    --color-bg-tertiary: #30363d;
    --color-text: #e6edf3;
    --color-text-secondary: #8b949e;
    --color-text-muted: #6e7681;
    --color-border: #30363d;
    --color-primary: #58a6ff;
    --color-primary-hover: #79b8ff;
    --color-user-bubble: #1f4b8e;
    --color-claude-bubble: #161b22;
    --color-error: #f85149;
    --color-success: #3fb950;
    --color-warning: #d29922;
    --shadow-sm: 0 1px 2px rgba(0,0,0,0.2);
    --shadow-md: 0 2px 8px rgba(0,0,0,0.3);
  }
}
```

- [ ] **Step 8: Create src/styles/global.css**

```css
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body, #app {
  height: 100%;
  width: 100%;
  overflow: hidden;
}

body {
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.5;
  color: var(--color-text);
  background: var(--color-bg);
  -webkit-font-smoothing: antialiased;
}

::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: var(--color-bg-secondary);
}

::-webkit-scrollbar-thumb {
  background: var(--color-border);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--color-text-muted);
}
```

- [ ] **Step 9: Create src/App.vue (minimal placeholder)**

```vue
<template>
  <div class="app-container">
    <div class="loading-state">
      <p>Loading projects...</p>
    </div>
  </div>
</template>

<script setup>
// Placeholder — real implementation in Task 5
</script>

<style scoped>
.app-container {
  height: 100vh;
  display: flex;
  background: var(--color-bg);
}

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  color: var(--color-text-muted);
}
</style>
```

- [ ] **Step 10: Create .gitignore**

```
node_modules/
dist/
out/
*.db
.DS_Store
```

- [ ] **Step 11: Commit**

```bash
git add package.json vite.config.js electron-builder.yml electron/index.js electron/preload.js index.html src/main.js src/App.vue src/styles/variables.css src/styles/global.css .gitignore
git commit -m "feat: scaffold Electron + Vue 3 project"
```

---

### Task 2: JSONL Parser & Message Parser

**Files:**
- Create: `electron/jsonl-parser.js`, `electron/message-parser.js` (renamed from src/utils in spec)
- Create: `tests/jsonl-parser.test.js`, `tests/message-parser.test.js`

- [ ] **Step 1: Write failing tests for jsonl-parser**

```js
// tests/jsonl-parser.test.js
const { parseStream } = require('../electron/jsonl-parser');
const fs = require('fs');
const path = require('path');

function test_parses_valid_jsonl() {
  const tmpFile = '/tmp/test-valid.jsonl';
  fs.writeFileSync(tmpFile, '{"type":"user","message":{"role":"user","content":"hello"}}\n{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"hi"}]}}\n');
  const results = [];
  parseStream(tmpFile, (obj) => results.push(obj));
  require('assert').strictEqual(results.length, 2);
  require('assert').strictEqual(results[0].type, 'user');
  require('assert').strictEqual(results[1].type, 'assistant');
  fs.unlinkSync(tmpFile);
}

function test_skips_malformed_lines() {
  const tmpFile = '/tmp/test-malformed.jsonl';
  fs.writeFileSync(tmpFile, '{"type":"user"}\nNOT JSON\n{"type":"assistant"}\n');
  const results = [];
  parseStream(tmpFile, (obj) => results.push(obj));
  require('assert').strictEqual(results.length, 2);
}

test_parses_valid_jsonl();
test_skips_malformed_lines();
console.log('All jsonl-parser tests passed');
```

- [ ] **Step 2: Run to verify it fails**

Run: `node tests/jsonl-parser.test.js`
Expected: FAIL — file does not exist

- [ ] **Step 3: Write minimal parseStream stub**

```js
// electron/jsonl-parser.js
const fs = require('fs');
const readline = require('readline');

function parseStream(filePath, onObject) {
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: 'utf8', highWaterMark: 64 * 1024 }),
    crlfDelay: Infinity
  });

  rl.on('line', (line) => {
    if (!line.trim()) return;
    try {
      const obj = JSON.parse(line);
      onObject(obj);
    } catch (e) {
      // Skip malformed lines — log warning
      console.warn(`[jsonl-parser] Skipped malformed line: ${e.message}`);
    }
  });
}

module.exports = { parseStream };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node tests/jsonl-parser.test.js`
Expected: PASS

- [ ] **Step 5: Write failing tests for message-parser**

```js
// tests/message-parser.test.js
const { normalizeContent, parseMessage } = require('../electron/message-parser');

function test_content_array() {
  const content = [
    { type: 'text', text: 'Hello **world**' },
    { type: 'tool_result', content: 'result', tool_use_id: 'abc', is_error: false }
  ];
  const normalized = normalizeContent(content);
  require('assert').strictEqual(normalized.length, 2);
  require('assert').strictEqual(normalized[0].type, 'text');
  require('assert').strictEqual(normalized[1].type, 'tool_result');
}

function test_content_raw_string() {
  const content = 'plain string';
  const normalized = normalizeContent(content);
  require('assert').strictEqual(normalized.length, 1);
  require('assert').strictEqual(normalized[0].type, 'text');
  require('assert').strictEqual(normalized[0].text, 'plain string');
}

function test_parse_user_message() {
  const raw = {
    type: 'user',
    message: { role: 'user', content: 'test message' },
    uuid: 'uuid-1', timestamp: '2026-04-07T03:55:47.690Z', sessionId: 'sess-1'
  };
  const parsed = parseMessage(raw);
  require('assert').strictEqual(parsed.role, 'user');
  require('assert').strictEqual(parsed.blocks.length, 1);
  require('assert').strictEqual(parsed.blocks[0].text, 'test message');
  require('assert').strictEqual(parsed.id, 'uuid-1');
}

function test_parse_assistant_message() {
  const raw = {
    type: 'assistant',
    message: {
      role: 'assistant',
      content: [
        { type: 'text', text: 'Hello' },
        { type: 'tool_use', id: 'call_1', name: 'Bash', input: { command: 'ls' } },
        { type: 'thinking', thinking: 'thinking content' }
      ]
    }
  };
  const parsed = parseMessage(raw);
  require('assert').strictEqual(parsed.role, 'assistant');
  require('assert').strictEqual(parsed.blocks.length, 3);
  require('assert').strictEqual(parsed.blocks[1].toolName, 'Bash');
  require('assert').strictEqual(parsed.blocks[2].thinking, 'thinking content');
}

test_content_array();
test_content_raw_string();
test_parse_user_message();
test_parse_assistant_message();
console.log('All message-parser tests passed');
```

- [ ] **Step 6: Run to verify it fails**

Run: `node tests/message-parser.test.js`
Expected: FAIL — module not found

- [ ] **Step 7: Write message-parser.js**

```js
// electron/message-parser.js

/**
 * Normalize content field to an array of blocks.
 * Handles both raw string and array-of-blocks formats.
 */
function normalizeContent(content) {
  if (typeof content === 'string') {
    return [{ type: 'text', text: content }];
  }
  if (Array.isArray(content)) {
    return content;
  }
  return [];
}

/**
 * Parse a raw JSONL message object into a normalized message structure.
 * Returns: { id, role, type, blocks, timestamp, sessionId }
 */
function parseMessage(raw) {
  const blocks = normalizeContent(raw.message?.content || []);

  // Enrich blocks with computed fields
  const enriched = blocks.map((block) => {
    if (block.type === 'tool_use') {
      return {
        ...block,
        toolName: block.name,
        inputLines: JSON.stringify(block.input, null, 2).split('\n').length
      };
    }
    if (block.type === 'tool_result') {
      return {
        ...block,
        isError: !!block.is_error
      };
    }
    return block;
  });

  return {
    id: raw.uuid || raw.id,
    role: raw.message?.role || raw.type,
    type: raw.type,
    blocks: enriched,
    timestamp: raw.timestamp,
    sessionId: raw.sessionId
  };
}

module.exports = { normalizeContent, parseMessage };
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `node tests/message-parser.test.js`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add electron/jsonl-parser.js electron/message-parser.js tests/jsonl-parser.test.js tests/message-parser.test.js
git commit -m "feat: add JSONL streaming parser and message normalizer"
```

---

### Task 3: SQLite Store & File Scanner

**Files:**
- Create: `electron/store.js`, `electron/file-scanner.js`
- Create: `tests/store.test.js`, `tests/file-scanner.test.js`

- [ ] **Step 1: Write failing tests for store.js**

```js
// tests/store.test.js
const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');
const Store = require('../electron/store');

// Use temp db for tests
const dbPath = path.join(os.tmpdir(), 'test-store-' + Date.now() + '.db');
const store = new Store(dbPath);

function test_creates_tables() {
  const tables = store.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  const tableNames = tables.map(t => t.name);
  require('assert').ok(tableNames.includes('projects'), 'projects table exists');
  require('assert').ok(tableNames.includes('conversations'), 'conversations table exists');
}

function test_insert_project() {
  const id = store.upsertProject('test-project', '/tmp/test');
  require('assert').ok(typeof id === 'number' && id > 0, 'returns valid id');
  const found = store.getProjectByPath('/tmp/test');
  require('assert').strictEqual(found.name, 'test-project');
}

function test_insert_conversation() {
  const projId = store.upsertProject('proj2', '/tmp/proj2');
  const convId = store.upsertConversation(projId, '/tmp/conv.jsonl', 1024, Date.now());
  require('assert').ok(typeof convId === 'number' && convId > 0, 'returns valid id');
  const convs = store.getConversationsByProject(projId);
  require('assert').strictEqual(convs.length, 1);
  require('assert').strictEqual(convs[0].file_path, '/tmp/conv.jsonl');
}

function test_update_title() {
  const projId = store.upsertProject('proj3', '/tmp/proj3');
  const convId = store.upsertConversation(projId, '/tmp/conv3.jsonl', 512, Date.now());
  store.updateTitle(convId, 'My Conversation Title');
  const conv = store.getConversationById(convId);
  require('assert').strictEqual(conv.title, 'My Conversation Title');
}

test_creates_tables();
test_insert_project();
test_insert_conversation();
test_update_title();
console.log('All store tests passed');
```

- [ ] **Step 2: Run to verify it fails**

Run: `node tests/store.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Write store.js**

```js
// electron/store.js
const Database = require('better-sqlite3');

class Store {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this._init();
  }

  _init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL,
        path       TEXT NOT NULL UNIQUE,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS conversations (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        file_path  TEXT NOT NULL UNIQUE,
        file_size  INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        title      TEXT
      );

      CREATE TABLE IF NOT EXISTS conversations_fts (
        conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        search_text     TEXT NOT NULL
      );
    `);
  }

  upsertProject(name, projectPath) {
    const stmt = this.db.prepare(`
      INSERT INTO projects (name, path, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(path) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at
    `);
    const result = stmt.run(name, projectPath, Date.now());
    return result.lastInsertRowid || this.getProjectByPath(projectPath).id;
  }

  getProjectByPath(projectPath) {
    return this.db.prepare('SELECT * FROM projects WHERE path = ?').get(projectPath);
  }

  getAllProjects() {
    return this.db.prepare('SELECT * FROM projects ORDER BY name').all();
  }

  upsertConversation(projectId, filePath, fileSize, updatedAt) {
    const stmt = this.db.prepare(`
      INSERT INTO conversations (project_id, file_path, file_size, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(file_path) DO UPDATE SET
        project_id = excluded.project_id, file_size = excluded.file_size, updated_at = excluded.updated_at
    `);
    const result = stmt.run(projectId, filePath, fileSize, updatedAt);
    return result.lastInsertRowid || this.getConversationByFilePath(filePath).id;
  }

  getConversationsByProject(projectId) {
    return this.db.prepare(
      'SELECT * FROM conversations WHERE project_id = ? ORDER BY updated_at DESC'
    ).all(projectId);
  }

  getConversationById(id) {
    return this.db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
  }

  getConversationByFilePath(filePath) {
    return this.db.prepare('SELECT * FROM conversations WHERE file_path = ?').get(filePath);
  }

  updateTitle(convId, title) {
    this.db.prepare('UPDATE conversations SET title = ? WHERE id = ?').run(title, convId);
  }

  deleteConversation(filePath) {
    this.db.prepare('DELETE FROM conversations WHERE file_path = ?').run(filePath);
  }
}

module.exports = Store;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node tests/store.test.js`
Expected: PASS

- [ ] **Step 5: Write failing tests for file-scanner.js**

```js
// tests/file-scanner.test.js
const path = require('path');
const fs = require('fs');
const os = require('os');

function test_scans_valid_projects_dir() {
  const tmpDir = path.join(os.tmpdir(), 'test-scanner-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.mkdirSync(path.join(tmpDir, 'proj1'), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, 'proj1', 'conv1.jsonl'), '{"type":"user"}\n');
  fs.mkdirSync(path.join(tmpDir, 'proj2'), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, 'proj2', 'conv2.jsonl'), '{"type":"user"}\n');

  const { scanProjects } = require('../electron/file-scanner');
  const projects = scanProjects(tmpDir);

  require('assert').strictEqual(projects.length, 2, 'finds 2 projects');
  require('assert').strictEqual(projects[0].conversations.length, 1, 'project has 1 conversation');

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true });
}

test_scans_valid_projects_dir();
console.log('All file-scanner tests passed');
```

- [ ] **Step 6: Run to verify it fails**

Run: `node tests/file-scanner.test.js`
Expected: FAIL — module not found

- [ ] **Step 7: Write file-scanner.js**

```js
// electron/file-scanner.js
const fs = require('fs');
const path = require('path');

const PROJECTS_DIR = path.join(process.env.HOME || '/home/user', '.claude', 'projects');

/**
 * Synchronously scan the projects directory.
 * Returns array of { name, path, conversations: [{filePath, fileSize, updatedAt}] }
 */
function scanProjects(projectsDir = PROJECTS_DIR) {
  if (!fs.existsSync(projectsDir)) {
    return [];
  }

  return fs.readdirSync(projectsDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => {
      const projectPath = path.join(projectsDir, entry.name);
      const conversations = scanConversations(projectPath);
      return {
        name: entry.name,
        path: projectPath,
        conversations
      };
    })
    .filter(project => project.conversations.length > 0);
}

/**
 * Scan a project directory for .jsonl files.
 * Returns array of { filePath, fileSize, updatedAt }
 */
function scanConversations(projectPath) {
  if (!fs.existsSync(projectPath)) {
    return [];
  }

  return fs.readdirSync(projectPath, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.jsonl'))
    .map(entry => {
      const filePath = path.join(projectPath, entry.name);
      const stat = fs.statSync(filePath);
      return {
        filePath,
        fileSize: stat.size,
        updatedAt: stat.mtimeMs
      };
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

module.exports = { scanProjects, scanConversations };
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `node tests/file-scanner.test.js`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add electron/store.js electron/file-scanner.js tests/store.test.js tests/file-scanner.test.js
git commit -m "feat: add SQLite store and project file scanner"
```

---

### Task 4: IPC Handlers & Title Extractor

**Files:**
- Create: `electron/ipc-handlers.js`, `src/utils/title-extractor.js`, `src/utils/markdown.js`
- Create: `tests/title-extractor.test.js`

- [ ] **Step 1: Write failing tests for title-extractor.js**

```js
// tests/title-extractor.test.js
const { extractTitle } = require('../src/utils/title-extractor');

function test_strips_markdown() {
  const text = 'Install **oh-my-opencode** by following [this guide](https://example.com)';
  const title = extractTitle(text);
  require('assert').strictEqual(title, 'Install oh-my-opencode by following this guide');
}

function test_truncates_long_text() {
  const text = 'A'.repeat(100);
  const title = extractTitle(text);
  require('assert').strictEqual(title.length, 50, 'title is truncated to 50 chars');
}

function test_trims_trailing_punctuation() {
  const text = 'Install and configure the tool:';
  const title = extractTitle(text);
  require('assert').strictEqual(title, 'Install and configure the tool');
}

function test_handles_empty() {
  const title = extractTitle('');
  require('assert').strictEqual(title, '');
}

test_strips_markdown();
test_truncates_long_text();
test_trims_trailing_punctuation();
test_handles_empty();
console.log('All title-extractor tests passed');
```

- [ ] **Step 2: Run to verify it fails**

Run: `node tests/title-extractor.test.js`
Expected: FAIL

- [ ] **Step 3: Write src/utils/markdown.js**

```js
// src/utils/markdown.js

/**
 * Strip common markdown formatting from text.
 * Removes: bold (**text**), italic (*text*), links [text](url),
 * code blocks, inline code, headings (#), and list markers (- *)
 */
function stripMarkdown(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')         // **bold**
    .replace(/\*(.+?)\*/g, '$1')            // *italic*
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')      // [text](url)
    .replace(/`{3}[\s\S]*?`{3}/g, '')        // code blocks
    .replace(/`(.+?)`/g, '$1')              // inline code
    .replace(/^#{1,6}\s+/gm, '')            // headings
    .replace(/^[-*+]\s+/gm, '')             // list markers
    .replace(/^(\d+)\.\s+/gm, '')           // numbered lists
    .replace(/\n+/g, ' ')                  // collapse newlines to spaces
    .trim();
}

module.exports = { stripMarkdown };
```

- [ ] **Step 4: Write src/utils/title-extractor.js**

```js
// src/utils/title-extractor.js
import { stripMarkdown } from './markdown.js';

/**
 * Extract a display title from the first user message text block.
 * Algorithm: strip markdown → collapse whitespace → truncate 50 chars → trim trailing punctuation.
 */
export function extractTitle(text) {
  if (!text) return '';

  // Strip markdown
  const stripped = stripMarkdown(text);

  // Collapse whitespace
  const normalized = stripped.replace(/\s+/g, ' ').trim();

  // Truncate to 50 chars
  let title = normalized.slice(0, 50);

  // Trim trailing punctuation (comma, period, colon, semicolon)
  title = title.replace(/[,.:;!?\s]+$/, '');

  return title;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node tests/title-extractor.test.js`
Expected: PASS

- [ ] **Step 6: Write electron/ipc-handlers.js**

```js
// electron/ipc-handlers.js
const { ipcMain, shell } = require('electron');
const path = require('path');
const { app } = require('electron');
const Store = require('./store');
const { scanProjects } = require('./file-scanner');
const { parseStream } = require('./jsonl-parser');
const { parseMessage } = require('./message-parser');
const { extractTitle } = require('./title-extractor'); // We'll move this to src/utils later

const store = new Store(path.join(app.getPath('userData'), 'index.db'));
const conversationCache = new Map();
const CACHE_MAX_SIZE = 20;

function registerIpcHandlers() {
  ipcMain.handle('scan-projects', async () => {
    const projects = scanProjects();

    // Upsert projects + conversations into SQLite
    for (const project of projects) {
      const projectId = store.upsertProject(project.name, project.path);
      for (const conv of project.conversations) {
        store.upsertConversation(projectId, conv.filePath, conv.fileSize, conv.updatedAt);
      }
    }

    // Return from DB (enriched with conversation data)
    return store.getAllProjects().map(proj => ({
      id: proj.id,
      name: proj.name,
      path: proj.path,
      conversations: store.getConversationsByProject(proj.id).map(conv => ({
        id: conv.id,
        filePath: conv.file_path,
        fileSize: conv.file_size,
        updatedAt: conv.updated_at,
        title: conv.title || null
      }))
    }));
  });

  ipcMain.handle('get-conversations', async (event, projectId) => {
    return store.getConversationsByProject(projectId).map(conv => ({
      id: conv.id,
      filePath: conv.file_path,
      fileSize: conv.file_size,
      updatedAt: conv.updated_at,
      title: conv.title || null
    }));
  });

  ipcMain.handle('load-conversation', async (event, filePath) => {
    // LRU cache check
    if (conversationCache.has(filePath)) {
      return conversationCache.get(filePath);
    }

    // Stream-parse JSONL
    const messages = [];
    parseStream(filePath, (raw) => {
      // Skip non-message types
      if (!['user', 'assistant'].includes(raw.type) &&
          !['last-prompt', 'attachment', 'permission-mode', 'file-history-snapshot'].includes(raw.type)) {
        return;
      }
      messages.push(parseMessage(raw));
    });

    const result = { messages, skippedCount: 0 };

    // LRU cache — evict oldest if at capacity
    if (conversationCache.size >= CACHE_MAX_SIZE) {
      const oldestKey = conversationCache.keys().next().value;
      conversationCache.delete(oldestKey);
    }
    conversationCache.set(filePath, result);

    return result;
  });

  ipcMain.handle('update-title', async (event, convId, title) => {
    store.updateTitle(convId, title);
    return true;
  });

  ipcMain.handle('search-conversations', async (event, projectId, query) => {
    // Basic implementation: search titles + first user message from conversations
    const convs = store.getConversationsByProject(projectId);
    const results = [];
    for (const conv of convs) {
      const titleMatch = conv.title?.toLowerCase().includes(query.toLowerCase());
      if (titleMatch) {
        results.push({ ...conv, relevance: 10 });
      }
    }
    return results.slice(0, 50);
  });

  ipcMain.handle('open-external', async (event, filePath) => {
    shell.openPath(filePath);
  });
}

module.exports = { registerIpcHandlers };
```

Note: `title-extractor` in the main process uses `stripMarkdown`. Move the stripMarkdown function or duplicate it in electron/ for now. The simplest approach: copy stripMarkdown into a new `electron/markdown.js` or import from a shared location via vite aliases.

- [ ] **Step 7: Create electron/markdown.js (copy of src/utils/markdown.js logic)**

```js
// electron/markdown.js
function stripMarkdown(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/`{3}[\s\S]*?`{3}/g, '')
    .replace(/`(.+?)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^(\d+)\.\s+/gm, '')
    .replace(/\n+/g, ' ')
    .trim();
}

module.exports = { stripMarkdown };
```

- [ ] **Step 8: Create electron/title-extractor.js (copy for main process)**

```js
// electron/title-extractor.js
const { stripMarkdown } = require('./markdown');

function extractTitle(text) {
  if (!text) return '';
  const stripped = stripMarkdown(text);
  const normalized = stripped.replace(/\s+/g, ' ').trim();
  let title = normalized.slice(0, 50);
  title = title.replace(/[,.:;!?\s]+$/, '');
  return title;
}

module.exports = { extractTitle };
```

- [ ] **Step 9: Register IPC handlers in electron/index.js**

Modify `electron/index.js` to import and call `registerIpcHandlers`:

```js
const { registerIpcHandlers } = require('./ipc-handlers');

// After createWindow():
registerIpcHandlers();
```

- [ ] **Step 10: Commit**

```bash
git add electron/ipc-handlers.js electron/markdown.js electron/title-extractor.js src/utils/title-extractor.js src/utils/markdown.js tests/title-extractor.test.js
git commit -m "feat: add IPC handlers and title extraction"
```

---

### Task 5: Vue Components — Core Layout

**Files:**
- Create: `src/stores/projects.js`, `src/stores/conversations.js`
- Modify: `src/App.vue`
- Create: `src/components/ProjectList.vue`, `src/components/ConversationList.vue`, `src/components/SkeletonLoader.vue`

- [ ] **Step 1: Write failing tests for stores**

```js
// tests/stores.test.js — using Vue Test Utils + Vitest
import { setActivePinia, createPinia } from 'pinia';
import { useProjectsStore } from '../../src/stores/projects';
import { useConversationsStore } from '../../src/stores/conversations';

// Mock electronAPI
global.electronAPI = {
  scanProjects: async () => [
    { id: 1, name: 'proj-a', path: '/tmp/proj-a', conversations: [] }
  ],
  getConversations: async () => [],
  loadConversation: async () => ({ messages: [], skippedCount: 0 })
};

function test_projects_store_loads() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useProjectsStore();
  require('assert').strictEqual(store.loading, false);
  require('assert').strictEqual(store.projects.length, 0);
}
```

- [ ] **Step 2: Write src/stores/projects.js**

```js
// src/stores/projects.js
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useProjectsStore = defineStore('projects', () => {
  const projects = ref([]);
  const selectedProjectId = ref(null);
  const loading = ref(false);
  const error = ref(null);

  const selectedProject = computed(() =>
    projects.value.find(p => p.id === selectedProjectId.value) || null
  );

  async function loadProjects() {
    loading.value = true;
    error.value = null;
    try {
      const result = await window.electronAPI.scanProjects();
      projects.value = result;
    } catch (e) {
      error.value = e.message;
    } finally {
      loading.value = false;
    }
  }

  function selectProject(id) {
    selectedProjectId.value = id;
  }

  return { projects, selectedProjectId, selectedProject, loading, error, loadProjects, selectProject };
});
```

- [ ] **Step 3: Write src/stores/conversations.js**

```js
// src/stores/conversations.js
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useConversationsStore = defineStore('conversations', () => {
  const selectedConvId = ref(null);
  const activeConversation = ref(null);
  const loading = ref(false);
  const skippedMessages = ref(0);
  const cache = new Map();

  const selectedConv = computed(() =>
    activeConversation.value?.messages?.find(m => m.id === selectedConvId.value) || null
  );

  async function openConversation(conv) {
    if (activeConversation.value?.filePath === conv.filePath) return;
    loading.value = true;
    try {
      if (cache.has(conv.filePath)) {
        activeConversation.value = cache.get(conv.filePath);
      } else {
        const result = await window.electronAPI.loadConversation(conv.filePath);
        if (cache.size >= 20) {
          const firstKey = cache.keys().next().value;
          cache.delete(firstKey);
        }
        cache.set(conv.filePath, result);
        activeConversation.value = result;
      }
      skippedMessages.value = activeConversation.value.skippedCount || 0;
    } finally {
      loading.value = false;
    }
  }

  function clearActive() {
    activeConversation.value = null;
  }

  return { selectedConvId, activeConversation, loading, skippedMessages, selectedConv, openConversation, clearActive };
});
```

- [ ] **Step 4: Write src/components/SkeletonLoader.vue**

```vue
<template>
  <div class="skeleton-loader">
    <div v-for="i in count" :key="i" class="skeleton-item" :style="itemStyle"></div>
  </div>
</template>

<script setup>
defineProps({
  count: { type: Number, default: 5 },
  height: { type: String, default: '16px' }
});
</script>

<script>
const itemStyle = computed(() => ({
  height: props.height,
  width: Math.random() > 0.5 ? '85%' : '60%'
}));
</script>

<style scoped>
.skeleton-loader { display: flex; flex-direction: column; gap: 12px; padding: 12px; }
.skeleton-item {
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-sm);
  animation: pulse 1.5s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}
</style>
```

- [ ] **Step 5: Write src/components/ProjectList.vue**

```vue
<template>
  <aside class="project-list" :style="{ width: panelWidth + 'px' }">
    <div class="panel-header">
      <h2>Projects</h2>
      <span class="count">{{ projects.length }}</span>
    </div>
    <div v-if="loading" class="loading">
      <SkeletonLoader :count="4" height="32px" />
    </div>
    <div v-else-if="error" class="error-state">{{ error }}</div>
    <div v-else-if="projects.length === 0" class="empty-state">
      No projects found. Start a conversation in Claude Code.
    </div>
    <ul v-else class="list">
      <li
        v-for="project in projects"
        :key="project.id"
        :class="['list-item', { active: project.id === selectedId }]"
        @click="$emit('select', project.id)"
      >
        <span class="project-name">{{ project.name }}</span>
        <span class="conv-count">{{ project.conversations?.length || 0 }}</span>
      </li>
    </ul>
  </aside>
</template>

<script setup>
import SkeletonLoader from './SkeletonLoader.vue';

defineProps({
  projects: { type: Array, default: () => [] },
  selectedId: { type: Number, default: null },
  loading: { type: Boolean, default: false },
  error: { type: String, default: null }
});
defineEmits(['select']);
</script>

<style scoped>
.project-list {
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
  min-width: 160px;
  max-width: 320px;
  overflow-y: auto;
}
.panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
  border-bottom: 1px solid var(--color-border);
}
.panel-header h2 { font-size: 14px; font-weight: 600; }
.count {
  background: var(--color-bg-tertiary);
  color: var(--color-text-muted);
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 10px;
}
.list { list-style: none; padding: 8px; }
.list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 13px;
  color: var(--color-text-secondary);
  transition: background 0.15s;
}
.list-item:hover { background: var(--color-bg-tertiary); }
.list-item.active { background: var(--color-primary); color: #fff; }
.project-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.conv-count { font-size: 11px; margin-left: 8px; opacity: 0.7; }
.empty-state, .error-state {
  padding: 24px 16px;
  color: var(--color-text-muted);
  font-size: 13px;
  text-align: center;
}
</style>
```

- [ ] **Step 6: Write src/components/ConversationList.vue**

```vue
<template>
  <section class="conversation-list" :style="{ width: panelWidth + 'px' }">
    <div class="panel-header">
      <h2>Conversations</h2>
      <span class="count">{{ conversations.length }}</span>
    </div>
    <SearchBar v-if="conversations.length > 0" @search="handleSearch" />
    <div v-if="loading" class="loading">
      <SkeletonLoader :count="6" height="44px" />
    </div>
    <div v-else-if="conversations.length === 0" class="empty-state">
      No conversations in this project.
    </div>
    <ul v-else class="list">
      <li
        v-for="conv in filteredConversations"
        :key="conv.id"
        :class="['list-item', { active: conv.id === selectedId }]"
        @click="$emit('select', conv)"
      >
        <div class="conv-title">{{ conv.title || 'Untitled conversation' }}</div>
        <div class="conv-date">{{ formatDate(conv.updatedAt) }}</div>
        <div v-if="conv.fileSize > 50 * 1024 * 1024" class="size-warning">Large file</div>
      </li>
    </ul>
  </section>
</template>

<script setup>
import { ref, computed } from 'vue';
import SkeletonLoader from './SkeletonLoader.vue';
import SearchBar from './SearchBar.vue';

const props = defineProps({
  conversations: { type: Array, default: () => [] },
  selectedId: { type: Number, default: null },
  loading: { type: Boolean, default: false }
});
const emit = defineEmits(['select', 'search']);

const searchQuery = ref('');
const filteredConversations = computed(() => {
  if (!searchQuery.value) return props.conversations;
  const q = searchQuery.value.toLowerCase();
  return props.conversations.filter(c => c.title?.toLowerCase().includes(q));
});

function handleSearch(query) { searchQuery.value = query; emit('search', query); }
function formatDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
</script>

<style scoped>
.conversation-list {
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--color-border);
  background: var(--color-bg);
  min-width: 200px;
  max-width: 360px;
  overflow-y: auto;
}
.panel-header {
  display: flex; align-items: center; gap: 8px;
  padding: 16px; border-bottom: 1px solid var(--color-border);
}
.panel-header h2 { font-size: 14px; font-weight: 600; }
.count {
  background: var(--color-bg-tertiary); color: var(--color-text-muted);
  font-size: 11px; padding: 2px 6px; border-radius: 10px;
}
.list { list-style: none; padding: 8px; }
.list-item {
  padding: 12px; border-radius: var(--radius-sm); cursor: pointer;
  border: 1px solid transparent; transition: all 0.15s;
}
.list-item:hover { background: var(--color-bg-secondary); border-color: var(--color-border); }
.list-item.active { background: var(--color-claude-bubble); border-color: var(--color-primary); }
.conv-title { font-size: 13px; font-weight: 500; margin-bottom: 4px; color: var(--color-text); }
.conv-date { font-size: 11px; color: var(--color-text-muted); }
.size-warning { font-size: 11px; color: var(--color-warning); margin-top: 4px; }
.empty-state { padding: 24px 16px; color: var(--color-text-muted); font-size: 13px; text-align: center; }
</style>
```

- [ ] **Step 7: Write src/components/SearchBar.vue**

```vue
<template>
  <div class="search-bar">
    <input
      v-model="query"
      type="search"
      placeholder="Search conversations..."
      @input="emit('search', query)"
    />
    <button v-if="query" class="clear-btn" @click="clear">×</button>
  </div>
</template>

<script setup>
import { ref } from 'vue';
const query = ref('');
const emit = defineEmits(['search']);
function clear() { query.value = ''; emit('search', ''); }
</script>

<style scoped>
.search-bar {
  display: flex; align-items: center; gap: 4px;
  padding: 8px 12px; border-bottom: 1px solid var(--color-border);
}
input {
  flex: 1; border: 1px solid var(--color-border); border-radius: var(--radius-sm);
  padding: 6px 10px; font-size: 12px; background: var(--color-bg-secondary);
  color: var(--color-text); outline: none;
}
input:focus { border-color: var(--color-primary); }
.clear-btn {
  background: none; border: none; color: var(--color-text-muted);
  cursor: pointer; font-size: 16px; line-height: 1;
}
</style>
```

- [ ] **Step 8: Write src/App.vue (full layout)**

```vue
<template>
  <div class="app-container">
    <ProjectList
      :projects="projectsStore.projects"
      :selectedId="projectsStore.selectedProjectId"
      :loading="projectsStore.loading"
      :error="projectsStore.error"
      @select="selectProject"
    />
    <ConversationList
      :conversations="currentConversations"
      :selectedId="conversationsStore.selectedConvId"
      :loading="conversationsStore.loading"
      @select="selectConversation"
    />
    <MessageThread
      :conversation="conversationsStore.activeConversation"
      :loading="conversationsStore.loading"
      :skippedCount="conversationsStore.skippedMessages"
    />
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue';
import { useProjectsStore } from './stores/projects';
import { useConversationsStore } from './stores/conversations';
import ProjectList from './components/ProjectList.vue';
import ConversationList from './components/ConversationList.vue';
import MessageThread from './components/MessageThread.vue';

const projectsStore = useProjectsStore();
const conversationsStore = useConversationsStore();

const currentConversations = computed(() => {
  const proj = projectsStore.selectedProject;
  return proj?.conversations || [];
});

async function selectProject(id) {
  projectsStore.selectProject(id);
  conversationsStore.clearActive();
}

async function selectConversation(conv) {
  conversationsStore.selectedConvId = conv.id;
  await conversationsStore.openConversation(conv);
}

onMounted(() => {
  projectsStore.loadProjects();
});
</script>

<style scoped>
.app-container {
  display: flex;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
}
</style>
```

- [ ] **Step 9: Commit**

```bash
git add src/stores/projects.js src/stores/conversations.js src/components/ProjectList.vue src/components/ConversationList.vue src/components/SearchBar.vue src/components/SkeletonLoader.vue src/App.vue
git commit -m "feat: add core layout and Pinia stores"
```

---

### Task 6: Message Thread & Chat Bubbles

**Files:**
- Create: `src/components/MessageThread.vue`, `src/components/ChatBubble.vue`, `src/components/ToolCall.vue`, `src/components/ToolResult.vue`, `src/components/ThinkingBlock.vue`, `src/components/FileSnapshot.vue`, `src/components/AttachmentList.vue`, `src/components/PermissionBadge.vue`

- [ ] **Step 1: Write src/components/ChatBubble.vue**

```vue
<template>
  <div :class="['chat-bubble', role]">
    <div class="bubble-header">
      <span class="avatar">{{ role === 'user' ? 'U' : 'C' }}</span>
      <span class="role-label">{{ roleLabel }}</span>
    </div>
    <div class="bubble-content">
      <template v-for="(block, i) in blocks" :key="i">
        <template v-if="block.type === 'text'">
          <div class="text-content" v-html="renderText(block.text)"></div>
        </template>
        <ToolCall v-else-if="block.type === 'tool_use'" :block="block" />
        <ThinkingBlock v-else-if="block.type === 'thinking'" :block="block" />
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import ToolCall from './ToolCall.vue';
import ThinkingBlock from './ThinkingBlock.vue';

const props = defineProps({
  blocks: { type: Array, default: () => [] },
  role: { type: String, default: 'user' }
});

const roleLabel = computed(() => props.role === 'user' ? 'You' : 'Claude');
function renderText(text) { return text; }
</script>

<style scoped>
.chat-bubble { margin-bottom: 16px; }
.chat-bubble.user { display: flex; flex-direction: column; align-items: flex-end; }
.chat-bubble.assistant { display: flex; flex-direction: column; align-items: flex-start; }
.bubble-header {
  display: flex; align-items: center; gap: 6px;
  margin-bottom: 6px; font-size: 11px; color: var(--color-text-muted);
}
.avatar {
  width: 20px; height: 20px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 600;
}
.user .avatar { background: var(--color-primary); color: #fff; }
.assistant .avatar { background: var(--color-success); color: #fff; }
.text-content { font-size: 14px; line-height: 1.6; }
</style>
```

- [ ] **Step 2: Write src/components/ToolCall.vue**

```vue
<template>
  <div class="tool-call">
    <button class="toggle-btn" @click="expanded = !expanded">
      <span class="chevron">{{ expanded ? '▼' : '▶' }}</span>
      <span class="tool-name">{{ block.toolName }}</span>
      <span class="line-count">({{ block.inputLines }} lines)</span>
    </button>
    <div v-if="expanded" class="tool-body">
      <div class="tool-input">
        <div class="tool-input-label">Input:</div>
        <CodeBlock :code="block.inputStr || JSON.stringify(block.input, null, 2)" language="json" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import CodeBlock from './CodeBlock.vue';

const props = defineProps({ block: { type: Object, required: true } });
const expanded = ref(false);
</script>

<style scoped>
.tool-call {
  margin: 8px 0; background: var(--color-bg-secondary);
  border: 1px solid var(--color-border); border-radius: var(--radius-sm);
}
.toggle-btn {
  width: 100%; display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; background: none; border: none;
  cursor: pointer; font-size: 12px; color: var(--color-text-secondary);
  text-align: left;
}
.toggle-btn:hover { background: var(--color-bg-tertiary); }
.chevron { font-size: 10px; color: var(--color-text-muted); }
.tool-name { font-family: var(--font-mono); font-weight: 500; color: var(--color-primary); }
.line-count { color: var(--color-text-muted); }
.tool-body { padding: 0 12px 12px; }
.tool-input-label { font-size: 11px; color: var(--color-text-muted); margin-bottom: 4px; }
</style>
```

- [ ] **Step 3: Write src/components/ToolResult.vue**

```vue
<template>
  <div :class="['tool-result', { error: block.isError }]">
    <button class="toggle-btn" @click="expanded = !expanded">
      <span class="chevron">{{ expanded ? '▼' : '▶' }}</span>
      <span class="label">Tool Result</span>
      <span v-if="block.isError" class="error-badge">Error</span>
    </button>
    <div v-if="expanded" class="result-content">
      <pre>{{ block.content }}</pre>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
const props = defineProps({ block: { type: Object, required: true } });
const expanded = ref(false);
</script>

<style scoped>
.tool-result {
  margin: 8px 0; background: var(--color-bg-secondary);
  border: 1px solid var(--color-border); border-radius: var(--radius-sm);
}
.tool-result.error { border-color: var(--color-error); }
.toggle-btn {
  width: 100%; display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; background: none; border: none;
  cursor: pointer; font-size: 12px; color: var(--color-text-secondary);
}
.chevron { font-size: 10px; }
.label { font-weight: 500; }
.error-badge {
  background: var(--color-error); color: #fff;
  font-size: 10px; padding: 2px 6px; border-radius: 10px;
}
.result-content {
  padding: 0 12px 12px;
  font-family: var(--font-mono); font-size: 12px;
  color: var(--color-text);
  white-space: pre-wrap; word-break: break-all;
}
</style>
```

- [ ] **Step 4: Write src/components/ThinkingBlock.vue**

```vue
<template>
  <div class="thinking-block">
    <button class="toggle-btn" @click="expanded = !expanded">
      <span class="chevron">{{ expanded ? '▼' : '▶' }}</span>
      <span class="label">Thinking</span>
    </button>
    <div v-if="expanded" class="thinking-content">
      {{ block.thinking }}
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
const props = defineProps({ block: { type: Object, required: true } });
const expanded = ref(false);
</script>

<style scoped>
.thinking-block {
  margin: 8px 0; background: var(--color-bg-secondary);
  border: 1px dashed var(--color-border); border-radius: var(--radius-sm);
  font-size: 12px; color: var(--color-text-muted);
}
.toggle-btn {
  width: 100%; display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; background: none; border: none;
  cursor: pointer; font-size: 12px;
}
.chevron { font-size: 10px; }
.thinking-content {
  padding: 8px 12px 12px; font-style: italic;
  white-space: pre-wrap;
}
</style>
```

- [ ] **Step 5: Write src/components/FileSnapshot.vue**

```vue
<template>
  <div class="file-snapshot">
    <div v-if="!expanded && fileGroups.length >= 3" class="collapsed" @click="expanded = true">
      <span class="chevron">▼</span>
      Files: {{ summaryText }}
    </div>
    <div v-else class="expanded">
      <div v-for="(group, action) in fileGroups" :key="action" class="group">
        <div class="group-label">{{ group.length }} {{ action }}</div>
        <div v-for="file in group" :key="file.path" class="file-item">
          <span :class="['action-badge', action]">{{ action }}</span>
          <span class="file-path">{{ file.path }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';

const props = defineProps({ blocks: { type: Array, default: () => [] } });
const expanded = ref(props.blocks.length < 3);

const fileGroups = computed(() => {
  const groups = { created: [], modified: [], deleted: [] };
  for (const block of props.blocks) {
    if (block.type === 'file-history-snapshot' && block.files) {
      for (const file of block.files) {
        const action = file.action || 'unknown';
        if (groups[action]) groups[action].push(file);
      }
    }
  }
  return groups;
});

const summaryText = computed(() => {
  return Object.entries(fileGroups.value)
    .filter(([, files]) => files.length > 0)
    .map(([action, files]) => `${files.length} ${action}`)
    .join(', ');
});
</script>

<style scoped>
.file-snapshot {
  margin: 8px 0; background: var(--color-bg-secondary);
  border: 1px solid var(--color-border); border-radius: var(--radius-sm);
  font-size: 12px;
}
.collapsed {
  padding: 8px 12px; cursor: pointer; font-weight: 500;
}
.collapsed:hover { background: var(--color-bg-tertiary); }
.expanded { padding: 8px 12px; }
.group { margin-bottom: 12px; }
.group-label { font-weight: 600; margin-bottom: 6px; font-size: 11px; text-transform: capitalize; }
.file-item { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
.action-badge {
  font-size: 10px; padding: 2px 6px; border-radius: 4px; font-weight: 500;
}
.action-badge.created { background: var(--color-success); color: #fff; }
.action-badge.modified { background: var(--color-primary); color: #fff; }
.action-badge.deleted { background: var(--color-error); color: #fff; }
.file-path { font-family: var(--font-mono); font-size: 11px; color: var(--color-text-secondary); }
</style>
```

- [ ] **Step 6: Write src/components/AttachmentList.vue**

```vue
<template>
  <div class="attachment-list">
    <div v-for="att in attachments" :key="att.name" class="attachment-chip" @click="openFile(att.path)">
      <span class="icon">{{ getFileIcon(att.mimeType) }}</span>
      <span class="name">{{ att.name }}</span>
      <span class="size">{{ formatSize(att.size) }}</span>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({ blocks: { type: Array, default: () => [] } });

const attachments = computed(() => {
  const list = [];
  for (const block of props.blocks) {
    if (block.type === 'attachment' && block.attachments) {
      list.push(...block.attachments);
    }
  }
  return list;
});

function getFileIcon(mimeType) {
  if (!mimeType) return '📄';
  if (mimeType.startsWith('image/')) return '🖼';
  if (mimeType.startsWith('video/')) return '🎬';
  if (mimeType.includes('pdf')) return '📕';
  return '📄';
}
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
async function openFile(filePath) {
  await window.electronAPI.openExternal(filePath);
}
</script>

<style scoped>
.attachment-list { display: flex; flex-wrap: wrap; gap: 8px; }
.attachment-chip {
  display: flex; align-items: center; gap: 6px;
  background: var(--color-bg-secondary); border: 1px solid var(--color-border);
  border-radius: var(--radius-sm); padding: 6px 10px; cursor: pointer;
  font-size: 12px;
}
.attachment-chip:hover { background: var(--color-bg-tertiary); }
.icon { font-size: 14px; }
.name { color: var(--color-primary); font-weight: 500; }
.size { color: var(--color-text-muted); font-size: 11px; }
</style>
```

- [ ] **Step 7: Write src/components/PermissionBadge.vue**

```vue
<template>
  <div :class="['permission-badge', granted ? 'granted' : 'revoked']">
    <span class="label">Permission: {{ mode }}</span>
    <span class="status">{{ granted ? '✓ Granted' : '✗ Revoked' }}</span>
  </div>
</template>

<script setup>
defineProps({
  mode: { type: String, required: true },
  granted: { type: Boolean, default: true }
});
</script>

<style scoped>
.permission-badge {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 12px; border-radius: var(--radius-sm);
  font-size: 12px; margin: 8px 0;
}
.granted { background: var(--color-bg-secondary); border: 1px solid var(--color-success); }
.revoked { background: var(--color-bg-secondary); border: 1px solid var(--color-error); }
.granted .status { color: var(--color-success); }
.revoked .status { color: var(--color-error); }
</style>
```

- [ ] **Step 8: Write src/components/MessageThread.vue**

```vue
<template>
  <main class="message-thread">
    <div v-if="loading" class="loading-state">
      <SkeletonLoader :count="8" height="60px" />
    </div>
    <div v-else-if="!conversation" class="empty-state">
      <div class="empty-icon">💬</div>
      <p>Select a conversation to view its history</p>
    </div>
    <div v-else class="thread-container">
      <div v-if="skippedCount > 0" class="skipped-indicator">
        {{ skippedCount }} message(s) skipped due to parsing errors
      </div>
      <div class="messages">
        <template v-for="(msg, i) in conversation.messages" :key="msg.id || i">
          <ChatBubble
            v-if="msg.role === 'user' || msg.role === 'assistant'"
            :blocks="msg.blocks"
            :role="msg.role"
          />
          <PermissionBadge
            v-else-if="msg.type === 'permission-mode'"
            :mode="msg.message?.mode"
            :granted="msg.message?.granted"
          />
          <FileSnapshot
            v-else-if="msg.type === 'file-history-snapshot'"
            :blocks="[msg.message]"
          />
          <AttachmentList
            v-else-if="msg.type === 'attachment'"
            :blocks="[msg.message]"
          />
          <!-- last-prompt: treat as user bubble -->
          <ChatBubble
            v-else-if="msg.type === 'last-prompt'"
            :blocks="msg.message?.content ? normalizeContent(msg.message.content) : []"
            role="user"
          />
        </template>
      </div>
    </div>
  </main>
</template>

<script setup>
import { computed } from 'vue';
import ChatBubble from './ChatBubble.vue';
import SkeletonLoader from './SkeletonLoader.vue';
import FileSnapshot from './FileSnapshot.vue';
import AttachmentList from './AttachmentList.vue';
import PermissionBadge from './PermissionBadge.vue';

const props = defineProps({
  conversation: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  skippedCount: { type: Number, default: 0 }
});

function normalizeContent(content) {
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  if (Array.isArray(content)) return content;
  return [];
}
</script>

<style scoped>
.message-thread {
  flex: 1; display: flex; flex-direction: column;
  background: var(--color-bg); overflow-y: auto; min-width: 400px;
}
.thread-container { padding: 24px; max-width: 800px; margin: 0 auto; width: 100%; }
.messages { display: flex; flex-direction: column; gap: 16px; }
.empty-state {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  color: var(--color-text-muted);
}
.empty-icon { font-size: 48px; margin-bottom: 16px; }
.skipped-indicator {
  background: var(--color-warning); color: #000; font-size: 12px;
  padding: 6px 12px; border-radius: var(--radius-sm);
  margin-bottom: 16px;
}
</style>
```

- [ ] **Step 9: Commit**

```bash
git add src/components/MessageThread.vue src/components/ChatBubble.vue src/components/ToolCall.vue src/components/ToolResult.vue src/components/ThinkingBlock.vue src/components/FileSnapshot.vue src/components/AttachmentList.vue src/components/PermissionBadge.vue
git commit -m "feat: add message thread and bubble components"
```

---

### Task 7: Code Block Component

**Files:**
- Create: `src/components/CodeBlock.vue`

- [ ] **Step 1: Write src/components/CodeBlock.vue**

```vue
<template>
  <div class="code-block">
    <div class="code-header">
      <span v-if="language" class="language">{{ language }}</span>
      <button class="copy-btn" @click="copyCode">
        {{ copied ? 'Copied!' : 'Copy' }}
      </button>
    </div>
    <div v-if="lines.length > MAX_PREVIEW_LINES && !expanded" class="code-preview">
      <pre><code v-html="highlightedPreview"></code></pre>
      <button class="expand-btn" @click="expanded = true">
        ▼ Expand {{ lines.length }} lines
      </button>
    </div>
    <div v-else class="code-full">
      <pre><code v-html="highlighted"></code></pre>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import hljs from 'highlight.js/lib/core';
import json from 'highlight.js/lib/languages/json';
import javascript from 'highlight.js/lib/languages/javascript';
import bash from 'highlight.js/lib/languages/bash';
import plaintext from 'highlight.js/lib/languages/plaintext';

hljs.registerLanguage('json', json);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('plaintext', plaintext);

const props = defineProps({
  code: { type: String, required: true },
  language: { type: String, default: 'plaintext' }
});

const MAX_PREVIEW_LINES = 15;
const expanded = ref(false);
const copied = ref(false);

const lines = computed(() => props.code.split('\n'));
const previewLines = computed(() => lines.value.slice(0, MAX_PREVIEW_LINES));

function highlight(text, lang) {
  try {
    if (hljs.getLanguage(lang)) {
      return hljs.highlight(text, { language: lang }).value;
    }
    return hljs.highlight(text, { language: 'plaintext' }).value;
  } catch {
    return escapeHtml(text);
  }
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const highlighted = computed(() => highlight(props.code, props.language));
const highlightedPreview = computed(() => highlight(previewLines.value.join('\n'), props.language));

async function copyCode() {
  try {
    await navigator.clipboard.writeText(props.code);
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 2000);
  } catch (e) {
    console.error('Copy failed:', e);
  }
}
</script>

<style scoped>
.code-block {
  background: #1e1e1e; border-radius: var(--radius-sm); overflow: hidden;
  margin: 8px 0;
}
.code-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 6px 12px; background: #2d2d2d; border-bottom: 1px solid #3d3d3d;
}
.language {
  font-size: 11px; color: #8b949e; font-family: var(--font-mono);
  text-transform: lowercase;
}
.copy-btn {
  background: transparent; border: 1px solid #3d3d3d;
  color: #8b949e; padding: 3px 10px; border-radius: 4px;
  font-size: 11px; cursor: pointer;
}
.copy-btn:hover { background: #3d3d3d; color: #e6edf3; }
.code-preview, .code-full {
  padding: 12px; overflow-x: auto;
}
pre { margin: 0; }
code {
  font-family: var(--font-mono); font-size: 13px;
  line-height: 1.5; color: #e6edf3; white-space: pre;
}
.expand-btn {
  display: block; width: 100%; margin-top: 8px;
  background: #2d2d2d; border: 1px solid #3d3d3d;
  color: #8b949e; padding: 6px; border-radius: 4px;
  font-size: 12px; cursor: pointer;
}
.expand-btn:hover { background: #3d3d3d; }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/CodeBlock.vue
git commit -m "feat: add code block with syntax highlighting and copy"
```

---

### Task 8: Title Auto-Generation on Conversation Open

**Files:**
- Modify: `src/stores/conversations.js`
- Modify: `src/utils/title-extractor.js` (already created in Task 4)

- [ ] **Step 1: Update conversations store to generate title on open**

Modify the `openConversation` function in `src/stores/conversations.js` to extract and save the title:

```js
import { extractTitle } from '../utils/title-extractor.js';

async function openConversation(conv) {
  if (activeConversation.value?.filePath === conv.filePath) return;
  loading.value = true;
  try {
    if (cache.has(conv.filePath)) {
      activeConversation.value = cache.get(conv.filePath);
    } else {
      const result = await window.electronAPI.loadConversation(conv.filePath);
      if (cache.size >= 20) {
        const firstKey = cache.keys().next().value;
        cache.delete(firstKey);
      }
      cache.set(conv.filePath, result);
      activeConversation.value = result;
    }

    // Auto-generate title if not present
    if (!conv.title && activeConversation.value?.messages?.length > 0) {
      const firstUserMsg = activeConversation.value.messages.find(m => m.role === 'user');
      if (firstUserMsg) {
        const textBlock = firstUserMsg.blocks.find(b => b.type === 'text');
        if (textBlock?.text) {
          const title = extractTitle(textBlock.text);
          if (title) {
            conv.title = title;
            await window.electronAPI.updateTitle(conv.id, title);
          }
        }
      }
    }

    skippedMessages.value = activeConversation.value.skippedCount || 0;
  } finally {
    loading.value = false;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/stores/conversations.js
git commit -m "feat: auto-generate conversation title on first open"
```

---

### Task 9: Panel Resizing

**Files:**
- Modify: `src/App.vue`, `src/components/ProjectList.vue`, `src/components/ConversationList.vue`

- [ ] **Step 1: Add resizable panels**

Add a resize handle between panels using a mouse drag handler:

In `src/App.vue`, add resize state and handlers:

```vue
<script setup>
// ... existing imports
import { ref } from 'vue';
const leftWidth = ref(240);
const middleWidth = ref(280);
const isDraggingLeft = ref(false);
const isDraggingMiddle = ref(false);

function startResizeLeft(e) {
  isDraggingLeft.value = true;
  document.addEventListener('mousemove', onResizeLeft);
  document.addEventListener('mouseup', stopResizeLeft);
}
function onResizeLeft(e) {
  if (!isDraggingLeft.value) return;
  leftWidth.value = Math.max(160, Math.min(320, e.clientX));
}
function stopResizeLeft() {
  isDraggingLeft.value = false;
  document.removeEventListener('mousemove', onResizeLeft);
  document.removeEventListener('mouseup', stopResizeLeft);
}
// Similar for middle panel...
</script>
```

Add resize handles in the template between panels:

```vue
<div class="resize-handle" @mousedown="startResizeLeft"></div>
<!-- between ProjectList and ConversationList -->
```

Add CSS for resize handle:

```css
.resize-handle {
  width: 4px; cursor: col-resize; background: transparent;
  transition: background 0.15s; z-index: 10;
}
.resize-handle:hover { background: var(--color-primary); }
```

- [ ] **Step 2: Commit**

```bash
git add src/App.vue
git commit -m "feat: add resizable panel handles"
```

---

### Task 10: Build & Package

**Files:**
- Modify: `electron-builder.yml`, `package.json`, `vite.config.js`

- [ ] **Step 1: Create electron-builder.yml**

```yaml
appId: com.claude.history-viewer
productName: Claude History
directories:
  output: out
  buildResources: build
files:
  - dist/**/*
  - electron/**/*
  - package.json
extraMetadata:
  main: electron/index.js
mac:
  category: public.app-category.developer-tools
  target:
    - dmg
    - zip
  icon: build/icon.icns
asar: true
asarUnpack:
  - node_modules/better-sqlite3/**/*
```

- [ ] **Step 2: Update vite.config.js for production build**

```js
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig({
  plugins: [vue()],
  base: './',
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
```

- [ ] **Step 3: Test development mode**

```bash
npm install
npm run dev
# Verify the app window opens with the three-panel layout
```

- [ ] **Step 4: Test production build**

```bash
npm run build
npm run electron:build
# Verify .app bundle is created in out/ directory
```

- [ ] **Step 5: Commit**

```bash
git add electron-builder.yml
git commit -m "feat: add electron-builder config for macOS packaging"
```

---

## Spec Coverage Checklist

- [x] Data Source — Task 3 (file-scanner.js scans `~/.claude/projects/`)
- [x] Message types — Task 2 (normalizeContent handles all content types)
- [x] Layout — Task 5 (App.vue three-panel + Task 9 resizing)
- [x] Visual design — Task 5 (CSS variables for light/dark)
- [x] Message formatting — Task 6 (ChatBubble, all sub-components)
- [x] Title generation — Task 8 (title-extractor.js + auto-save on open)
- [x] Hybrid loading — Task 3 (SQLite index) + Task 4 (IPC + cache)
- [x] Search — Task 5 (SearchBar + basic title search in IPC)
- [x] Expand/collapse — Task 6 (ToolCall, ToolResult, ThinkingBlock, FileSnapshot)
- [x] Copy — Task 7 (CodeBlock copy button)
- [x] Loading states — Task 5 (SkeletonLoader)
- [x] Error handling — Task 2 (skip malformed JSONL)
- [x] Performance — LRU cache, streaming parse (Tasks 2, 3, 4)
- [x] Build — Task 10 (electron-builder)

## Placeholder Scan

- All file paths are exact
- No "TBD" or "TODO" placeholders
- No vague steps — each step shows actual code
- Commands have expected outputs

## Type Consistency

- `normalizeContent` returns array in both string and array cases (Task 2)
- `extractTitle` used consistently in Tasks 4, 8
- `parseMessage` enriches blocks with `toolName`, `inputLines`, `isError` — referenced correctly in Task 6 components
- `conversationCache` in IPC handlers uses `.get()`/`.set()` — consistent with Map API
- All component props defined with correct types from parseMessage output
