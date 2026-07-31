'use strict';

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseJsonValue(value) {
  if (typeof value !== 'string') return value == null ? {} : value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function safeImageBlock(imageUrl) {
  const safeUrl = typeof imageUrl === 'string'
    && /^data:image\/[a-z0-9.+-]+;base64,/i.test(imageUrl)
    ? imageUrl
    : null;
  return {
    type: 'image',
    source: safeUrl ? { url: safeUrl } : {},
  };
}

const INJECTED_USER_CONTEXT_PREFIXES = [
  '<recommended_plugins>',
  '# AGENTS.md instructions',
  '<environment_context>',
  '<skill>',
  '<codex_internal_context',
  '<turn_aborted>',
  '<in-app-browser-context',
  '<task-notification>',
  '# Files mentioned by the user:',
  '# In app browser:',
  '# Browser comments:',
  '# Selected text:',
  '<image name=',
  '</image>',
];

function isInjectedUserContext(text) {
  if (typeof text !== 'string') return false;
  const normalized = text.trimStart();
  return INJECTED_USER_CONTEXT_PREFIXES.some(
    (prefix) => normalized.startsWith(prefix)
  );
}

function normalizeContentBlocks(content, role = null) {
  if (!Array.isArray(content)) return [];
  const blocks = [];
  for (const item of content) {
    if (!isObject(item)) continue;
    if ((item.type === 'input_text' || item.type === 'output_text')
      && typeof item.text === 'string'
      && item.text
      && !(role === 'user' && isInjectedUserContext(item.text))) {
      blocks.push({ type: 'text', text: item.text });
    } else if (item.type === 'input_image') {
      blocks.push(safeImageBlock(item.image_url));
    }
  }
  return blocks;
}

/**
 * Project the first session_meta record into scanner-owned metadata.
 * @param {Object} raw
 * @returns {{sessionId:string|null, projectDir:string|null, timestamp:string|number|null, internal:boolean}|null}
 */
function parseCodexSessionMeta(raw) {
  if (!isObject(raw) || raw.type !== 'session_meta' || !isObject(raw.payload)) {
    return null;
  }
  const payload = raw.payload;
  const source = payload.source;
  const sourceIsSubagent = source === 'subagent'
    || (isObject(source) && Object.prototype.hasOwnProperty.call(source, 'subagent'));
  return {
    sessionId: typeof payload.id === 'string' && payload.id
      ? payload.id
      : (typeof payload.session_id === 'string' && payload.session_id ? payload.session_id : null),
    projectDir: typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : null,
    timestamp: payload.timestamp || raw.timestamp || null,
    internal: Boolean(
      payload.parent_thread_id
      || payload.forked_from_id
      || sourceIsSubagent
      || payload.agent_role
    ),
  };
}

/**
 * Extract the user-authored text used for a Codex conversation title.
 * @param {Object} raw
 * @returns {string|null}
 */
function extractCodexUserText(raw) {
  if (!isObject(raw) || raw.type !== 'response_item' || !isObject(raw.payload)) {
    return null;
  }
  const payload = raw.payload;
  if (payload.type !== 'message' || payload.role !== 'user' || !Array.isArray(payload.content)) {
    return null;
  }
  const texts = payload.content
    .filter((item) => isObject(item) && item.type === 'input_text')
    .map((item) => typeof item.text === 'string' ? item.text.trim() : '')
    .filter((text) => text && !isInjectedUserContext(text));
  return texts.length > 0 ? texts[texts.length - 1] : null;
}

function normalizedMessage(raw, role, type, blocks, id = null) {
  if (!blocks.length) return [];
  return [{
    id,
    role,
    type,
    timestamp: raw.timestamp || null,
    blocks,
  }];
}

function toolUseMessage(raw, payload, name, input) {
  const callId = payload.call_id || payload.id || null;
  const block = {
    type: 'tool_use',
    id: callId,
    name,
    toolName: name,
    input: parseJsonValue(input),
  };
  return normalizedMessage(raw, 'assistant', 'assistant', [block], callId);
}

function normalizeOutput(output) {
  if (typeof output === 'string') {
    return { text: output, images: [] };
  }
  if (Array.isArray(output)) {
    const textParts = [];
    const images = [];
    for (const item of output) {
      if (isObject(item) && (item.type === 'input_text' || item.type === 'output_text')) {
        if (typeof item.text === 'string' && item.text) textParts.push(item.text);
      } else if (isObject(item) && item.type === 'input_image') {
        images.push(safeImageBlock(item.image_url));
      } else if (item != null) {
        textParts.push(
          typeof item === 'object' ? JSON.stringify(item, null, 2) : String(item)
        );
      }
    }
    return { text: textParts.join('\n'), images };
  }
  if (output == null) {
    return { text: '', images: [] };
  }
  return {
    text: typeof output === 'object' ? JSON.stringify(output, null, 2) : String(output),
    images: [],
  };
}

function toolResultMessage(raw, payload, output) {
  const callId = payload.call_id || payload.id || null;
  const normalized = normalizeOutput(output);
  const blocks = [{
    type: 'tool_result',
    toolUseId: callId,
    content: normalized.text,
    isError: payload.status === 'failed' || payload.success === false,
  }, ...normalized.images];
  return normalizedMessage(raw, 'assistant', 'tool_result', blocks, callId);
}

function imageGenerationMessage(raw, payload) {
  const input = {
    prompt: payload.revised_prompt || '',
    status: payload.status || null,
  };
  const messages = toolUseMessage(raw, payload, 'image_generation', input);
  if (typeof payload.result === 'string' && payload.result) {
    const imageUrl = /^data:image\//i.test(payload.result)
      ? payload.result
      : `data:image/png;base64,${payload.result}`;
    messages[0].blocks.push(safeImageBlock(imageUrl));
  }
  return messages;
}

/**
 * Convert one Codex JSONL record to zero or more renderer messages.
 * @param {Object} raw
 * @returns {Object[]}
 */
function parseCodexRecord(raw) {
  if (!isObject(raw) || raw.type !== 'response_item' || !isObject(raw.payload)) {
    return [];
  }
  const payload = raw.payload;

  switch (payload.type) {
    case 'message': {
      if (payload.role !== 'user' && payload.role !== 'assistant') return [];
      return normalizedMessage(
        raw,
        payload.role,
        payload.role,
        normalizeContentBlocks(payload.content, payload.role),
        payload.id || null
      );
    }
    case 'function_call':
      return toolUseMessage(raw, payload, payload.name || 'function', payload.arguments);
    case 'custom_tool_call':
      return toolUseMessage(raw, payload, payload.name || 'custom_tool', payload.input);
    case 'tool_search_call':
      return toolUseMessage(raw, payload, 'tool_search', payload.arguments);
    case 'web_search_call':
      return toolUseMessage(raw, payload, 'web_search', payload.action);
    case 'function_call_output':
    case 'custom_tool_call_output':
      return toolResultMessage(raw, payload, payload.output);
    case 'tool_search_output':
      return toolResultMessage(raw, payload, payload.output || payload.tools);
    case 'image_generation_call':
      return imageGenerationMessage(raw, payload);
    default:
      return [];
  }
}

module.exports = {
  parseCodexSessionMeta,
  extractCodexUserText,
  parseCodexRecord,
};
