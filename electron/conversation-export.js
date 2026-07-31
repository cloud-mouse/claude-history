'use strict';

/**
 * Conversation → Markdown exporter.
 *
 * Turns a parsed conversation (the `messages` array produced by
 * message-parser's `parseMessage`) into a portable Markdown document.
 * Includes user/assistant text and tool calls + their results.
 *
 * `thinking` blocks are intentionally dropped to keep exports readable,
 * matching the chosen export-content option.
 */

const EXPORT_NOTE = '由 Claude History 导出';

/**
 * Make a string safe to use as a filename: strip OS-illegal chars and
 * collapse whitespace. Falls back to a default for empty input.
 * @param {string} [name]
 * @returns {string}
 */
function sanitizeFilename(name) {
  const base = (name == null ? '' : String(name)).trim() || '未命名对话';
  return base
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

/**
 * Flatten a content value into a plain string. Content may be:
 * string | array of {type:'text', text} | plain object | other.
 * Used for both text blocks and tool_result payloads.
 * @param {*} content
 * @returns {string}
 */
function extractText(content) {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (item == null) return '';
        if (typeof item === 'string') return item;
        if (typeof item === 'object') {
          if (typeof item.text === 'string') return item.text;
          if (typeof item.content === 'string') return item.content;
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  if (typeof content === 'object') {
    if (typeof content.text === 'string') return content.text;
    return JSON.stringify(content, null, 2);
  }
  return String(content);
}

/**
 * Wrap a body in a fenced code block. Trailing blank lines are trimmed so we
 * don't emit empty trailing lines inside the fence.
 * @param {string} body
 * @param {string} lang
 * @returns {string}
 */
function fence(body, lang) {
  const txt = String(body == null ? '' : body).replace(/\s+$/, '');
  return '```' + (lang || '') + '\n' + txt + '\n```';
}

/**
 * Render a tool_use input in a tool-specific friendly form, falling back to
 * a JSON code block for unknown tools.
 * @param {string} name
 * @param {*} input
 * @returns {string}
 */
function formatToolInput(name, input) {
  if (input == null) return '';
  switch (name) {
    case 'Bash':
    case 'powershell':
      return input.command ? fence(input.command, 'bash') : JSON.stringify(input, null, 2);

    case 'Read':
      return '`' + (input.file_path || '') + '`';

    case 'Write':
      return '`' + (input.file_path || '') + '`\n\n' + fence(input.content || '', '');

    case 'Edit':
    case 'MultiEdit': {
      const head = '`' + (input.file_path || '') + '`';
      if (input.new_string != null) {
        const diff = fence(
          '- ' + (input.old_string || '') + '\n+ ' + (input.new_string || ''),
          'diff'
        );
        return head + '\n\n' + diff;
      }
      return head;
    }

    case 'Glob':
      return '`' + (input.pattern || '') + '`' + (input.path ? ' in `' + input.path + '`' : '');

    case 'Grep':
      return '`' + (input.pattern || '') + '`' + (input.path ? ' in `' + input.path + '`' : '');

    case 'Agent':
    case 'Task': {
      const desc = input.description || input.subagent_type || '';
      const prompt = input.prompt
        ? '\n\n> ' + String(input.prompt).replace(/\n/g, '\n> ')
        : '';
      return desc + prompt;
    }

    case 'TodoWrite': {
      const todos = Array.isArray(input.todos) ? input.todos : [];
      return todos
        .map((t, i) => (i + 1) + '. ' + (t.content || t.task || JSON.stringify(t)))
        .join('\n');
    }

    case 'TaskCreate':
    case 'TaskUpdate': {
      const subject = input.subject || input.description || '';
      const sub = Array.isArray(input.subTasks)
        ? input.subTasks
        : input.subtasks || [];
      const list = sub.length
        ? '\n' + sub
            .map((x) => '- ' + (typeof x === 'string' ? x : x.subject || x.description || ''))
            .join('\n')
        : '';
      return subject + list;
    }

    default:
      return fence(JSON.stringify(input, null, 2), 'json');
  }
}

function renderToolUse(block) {
  const name = block.name || block.toolName || 'Tool';
  const body = formatToolInput(name, block.input);
  return '**🔧 ' + name + '**\n\n' + (body || '');
}

function renderToolResult(block) {
  const text = extractText(block.content != null ? block.content : block.result);
  const isError = block.isError === true || block.is_error === true;
  const label = isError ? '❌ 结果（错误）' : '↩ 结果';
  const body = text && text.trim() ? fence(text, '') : '_(空结果)_';
  return '**' + label + '**\n\n' + body;
}

/**
 * Render a single content block to Markdown.
 * @param {object} block
 * @returns {string}
 */
function renderBlock(block) {
  if (!block || typeof block !== 'object') return '';
  switch (block.type) {
    case 'text': {
      const t = block.text != null ? block.text : block.content;
      return typeof t === 'string' ? t : extractText(t);
    }
    case 'tool_use':
      return renderToolUse(block);
    case 'tool_result':
      return renderToolResult(block);
    case 'image':
      return '_[图片]_';
    case 'thinking':
      return ''; // intentionally omitted from exports
    default:
      return '';
  }
}

/**
 * Convert a conversation object into a Markdown string.
 * @param {object} conversation - { title?, projectDir?, updatedAt?, messages[] }
 * @returns {string}
 */
function conversationToMarkdown(conversation) {
  const conv = conversation || {};
  const messages = Array.isArray(conv.messages) ? conv.messages : [];
  const title = (conv.title || '未命名对话').trim();
  const assistantLabel = conv.source === 'codex' ? 'Codex' : 'Claude';

  const lines = [];
  lines.push('# ' + title);
  lines.push('');

  const meta = [];
  if (conv.projectDir) meta.push('项目：`' + conv.projectDir + '`');
  if (conv.updatedAt) {
    const d = new Date(conv.updatedAt);
    if (!isNaN(d.getTime())) {
      meta.push('更新时间：' + d.toLocaleString('zh-CN'));
    }
  }
  const msgCount = messages.filter(
    (m) => m && (m.role === 'user' || m.role === 'assistant' || m.type === 'tool_result')
  ).length;
  meta.push('消息数：' + msgCount);
  lines.push('> ' + meta.join(' ｜ '));
  lines.push('');
  lines.push('> ' + EXPORT_NOTE);
  lines.push('');
  lines.push('---');
  lines.push('');

  let lastRole = null;
  for (const msg of messages) {
    if (!msg) continue;
    let role = msg.role;
    if (msg.type === 'last-prompt') role = 'user';
    if (msg.type === 'tool_result') role = 'assistant';
    if (role !== 'user' && role !== 'assistant') continue;

    if (role !== lastRole) {
      if (lines.length > 0) lines.push('');
      lines.push(role === 'user' ? '## 👤 用户' : '## 🤖 ' + assistantLabel);
      lines.push('');
      lastRole = role;
    }

    const blocks = Array.isArray(msg.blocks) ? msg.blocks : [];
    for (const block of blocks) {
      const rendered = renderBlock(block);
      if (rendered && rendered.trim()) {
        lines.push(rendered);
        lines.push('');
      }
    }
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

module.exports = { conversationToMarkdown, sanitizeFilename, extractText };
