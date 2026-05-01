# Claude History — Design Specification

## Overview

A desktop application for browsing and reading Claude Code conversation history. Provides a polished, human-readable view of local `.jsonl` conversation files with elegant message formatting.

## Data Source

- **Location**: All `.jsonl` files under `~/.claude/projects/`
- **Coverage**: 16 projects, ~140 conversation files across all projects
- **Format**: JSONL with message types: `user`, `assistant`, `attachment`, `permission-mode`, `file-history-snapshot`, `last-prompt`

### Message Structure

**User messages:**
```json
{
  "type": "user",
  "message": {
    "role": "user",
    "content": [  // array of blocks OR raw string
      {"type": "text", "text": "..."},
      {"type": "tool_result", "content": "...", "is_error": true, "tool_use_id": "..."}
    ]
  },
  "uuid": "...",
  "timestamp": "ISO8601",
  "sessionId": "..."
}
```

**Content field handling:** The `content` field may be either:
- An array of blocks (as shown above) — iterate and render each block in order
- A raw string — wrap as a single `{"type": "text", "text": raw_string}` block before processing

**Assistant messages:**
```json
{
  "type": "assistant",
  "message": {
    "role": "assistant",
    "content": [
      {"type": "text", "text": "..."},
      {"type": "tool_use", "id": "...", "name": "Bash|Read|Write|Agent|...", "input": {...}},
      {"type": "thinking", "thinking": "..."}  // may be present
    ]
  }
}
```

**`file-history-snapshot` messages:**
```json
{
  "type": "file-history-snapshot",
  "message": {
    "files": [
      { "path": "...", "action": "created|modified|deleted" }
    ]
  },
  "uuid": "...",
  "timestamp": "ISO8601",
  "sessionId": "..."
}
```
Render as a collapsible file list, grouped by action type (created/modified/deleted). Collapsed by default: `▼ Files: 3 created, 1 modified`. Expanded: shows each file path with action badge. No expand/collapse for fewer than 3 files.

**`last-prompt` messages:**
```json
{
  "type": "last-prompt",
  "message": {
    "content": [...]  // same structure as user content
  },
  "uuid": "...",
  "timestamp": "ISO8601",
  "sessionId": "..."
}
```
Render `last-prompt` identically to user messages (right-aligned bubble).

**`attachment` messages:**
```json
{
  "type": "attachment",
  "message": {
    "attachments": [
      { "name": "...", "mimeType": "...", "path": "...", "size": N }
    ]
  },
  "uuid": "...",
  "timestamp": "ISO8601",
  "sessionId": "..."
}
```
Render as a list of file chips with icon (based on mimeType), filename, and file size. No expand/collapse. Click to open externally via `shell.openPath()`.

**`permission-mode` messages:**
```json
{
  "type": "permission-mode",
  "message": {
    "mode": "browse|clipboard|computer|...",
    "granted": true
  },
  "uuid": "...",
  "timestamp": "ISO8601",
  "sessionId": "..."
}
```
Render as a system status bubble (left-aligned, gray background), showing the permission mode name and granted/revoked state. Compact, single-line format.

## Layout

**Three-panel layout (Option A):**

```
┌──────────────┬─────────────────┬─────────────────────────────────┐
│  Projects    │  Conversations  │  Conversation Detail             │
│  (240px)     │  (280px)        │  (flex: 1)                      │
│              │                 │                                 │
│  - Project A │  - Title 1      │  ┌─────────────────────────┐   │
│  - Project B │  - Title 2      │  │ User bubble             │   │
│  - Project C │  - Title 3      │  └─────────────────────────┘   │
│              │                 │  ┌─────────────────────────┐   │
│              │                 │  │ Claude bubble           │   │
│              │                 │  │ [code blocks]          │   │
│              │                 │  └─────────────────────────┘   │
└──────────────┴─────────────────┴─────────────────────────────────┘
```

- **Left panel** (240px, resizable, min 160px): Project list, collapsible
- **Middle panel** (280px, resizable, min 200px): Conversation list for selected project
- **Right panel** (flex, min 400px): Message thread view
- All panels have a minimum width to prevent unusable states on small screens

## Visual Design

**System-adaptive theme (Option C):**
- Light mode: White/light gray background, blue primary accent (#0066cc)
- Dark mode: Dark gray/black background, soft text colors, follows system preference
- Implemented via CSS custom properties + `prefers-color-scheme` media query

## Message Formatting

**Chat bubble style (Option A):**
- User messages: Right-aligned, primary accent color background
- Claude messages: Left-aligned, distinct background with subtle border
- Rounded corners with directional tails
- Avatar/initials indicator
- Timestamp on each message (optional, collapsible)

**Content types:**
- `text`: Plain text, rendered as-is
- `tool_use`: Collapsed by default, expanded on click
  - Shows tool name and truncated input preview
  - Collapsed: `▼ Tool: Bash (14 lines)` indicator
  - Expanded: Full input with syntax highlighting
- `tool_result`: Collapsed by default in mixed mode
  - Error results highlighted in red
- `thinking`: Collapsible section, shown separately from main text

## Title Generation

**Title generation:**
- First user message text (content block, type=text only) is the source of truth
- Algorithm: strip markdown formatting, collapse whitespace, truncate to 50 chars, trim trailing punctuation
- Result stored in `conversations.title` as source of truth — `titles` table is deprecated
- No external API call needed; runs synchronously on conversation open
- If first user message is empty or unreadable, fallback to file last-modified date via `"Conversation " + YYYY-MM-DD`

## Data Loading Strategy

**Hybrid approach (Option 3):**
1. **Startup scan**: Background async scan of `~/.claude/projects/` for file metadata
   - Project name, file path, modification time, file size
   - Display loading progress indicator during first scan
2. **On-demand parsing**: Parse full `.jsonl` only when conversation selected
3. **LRU cache**: Cache recently viewed conversations (configurable size, default 20)
   - Stores parsed message objects, not raw JSONL
   - Cache-first reads: check cache → hit → return; miss → parse JSONL → store in cache
4. **SQLite index**: Stores metadata and titles only — NOT full message content
   - See `## SQLite Schema` section below
   - Located in app data directory (`app.getPath('userData')/index.db`)

**SQLite schema:**

```sql
CREATE TABLE projects (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  path       TEXT NOT NULL UNIQUE,
  updated_at INTEGER NOT NULL
);

CREATE TABLE conversations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_path  TEXT NOT NULL UNIQUE,
  file_size  INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  title      TEXT
);
-- NOTE: titles table is deprecated; title is now stored in conversations.title
```

## Key Features

1. **Project list**: Expandable/collapsible, shows project name
2. **Conversation list**: Sorted by date descending, shows AI-generated title + date
3. **Search**: Full-text search within the current project
   - Searches over: `conversations.title` (exact match) + first user message text (truncated to first 500 chars before indexing)
   - Uses SQLite FTS5 for fast full-text queries within a single project at a time
   - Results ranked by relevance, limited to 50 per query
   - No cross-project search (users scope to a project first)
4. **Message thread view**: Scrollable, preserves conversation flow
5. **Expand/collapse**: Tool calls, tool results, thinking sections
6. **Copy**: One-click copy for code blocks
   - Copies raw text content (stripped of markdown formatting)
   - Tool call input/output is NOT copyable — only user/assistant text bubbles
   - Keyboard shortcut: `Cmd/Ctrl+C` when a code block is focused
7. **Loading states**: Skeleton placeholders during loading

## Technical Stack

- **Framework**: Electron + Vue 3
- **Build**: electron-builder
- **Storage**: better-sqlite3
- **Styling**: CSS custom properties + scoped styles
- **Code highlighting**: highlight.js or Prism

## Error Handling and Edge Cases

- **Corrupt JSONL lines**: Skip malformed lines and log a warning. Do not crash the app.
  Show a subtle indicator in the conversation header: `"N messages skipped due to parsing errors"`.
- **Empty project** (no `.jsonl` files found): Show an empty state with a descriptive message.
  Do not show an error — this is a valid state for a new project.
- **Large files (> 50MB)**: Stream-parse the JSONL instead of loading it into memory at once.
  Show a warning badge in the conversation list before opening.
- **Missing projects directory**: If `~/.claude/projects/` does not exist, show an empty state
  with setup instructions.
- **File permissions**: If a `.jsonl` file cannot be read, log the error, skip the file, and
  surface a non-blocking toast: `"N conversations unavailable due to permission errors"`.

## Performance Targets

- **Startup scan** (cold): < 10 seconds for 140 files across 16 projects
- **Conversation open** (warm, cached): < 100ms to display
- **Conversation open** (warm, uncached): < 2 seconds for a 5MB JSONL file
- **Search query**: < 500ms for full-text search across all conversations
- **Memory budget**: < 200MB for a session with 20 cached conversations loaded
- **Memory budget (per conversation)**: Unbounded — large conversations use what they need,
  but LRU eviction clears them from the in-memory cache

## File Structure

High-level structure (detailed breakdown in implementation plan):

```
claude-history/
├── package.json
├── electron/              # Main process
├── src/                   # Vue app
├── preload.js
└── electron-builder.yml
```
