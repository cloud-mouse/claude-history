/**
 * Normalize message content to array format.
 * - If content is a string, wrap as {type: 'text', text: content}
 * - If content is already an array, return as-is
 * - Otherwise, return empty array
 * @param {string|Array} content - Raw content from message
 * @returns {Array} Array of content blocks
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
 * Enrich a content block with additional computed properties.
 * @param {Object} block - Content block
 * @returns {Object} Enriched block
 */
function enrichBlock(block) {
  const enriched = { ...block };

  if (block.type === 'tool_use') {
    if (block.name) {
      enriched.toolName = block.name;
    }
    if (block.input) {
      if (typeof block.input === 'string') {
        enriched.inputLines = block.input.split('\n').length;
      } else {
        let count = 0;
        const countNewlines = (obj) => {
          for (const key in obj) {
            if (typeof obj[key] === 'string') {
              count += (obj[key].match(/\n/g) || []).length;
            } else if (typeof obj[key] === 'object' && obj[key] !== null) {
              countNewlines(obj[key]);
            }
          }
        };
        countNewlines(block.input);
        enriched.inputLines = count > 0 ? count + 1 : 1;
      }
    }
  }

  if (block.type === 'tool_result') {
    enriched.isError = Boolean(block.is_error || block.isError);
  }

  return enriched;
}

/**
 * Parse and normalize a raw message object from JSONL.
 * The actual JSONL format has:
 * - type at root level ("user", "assistant", "permission-mode", etc.)
 * - message.content for user/assistant content
 * - No message wrapper for permission-mode
 * @param {Object} raw - Raw message object from JSONL
 * @returns {Object} Normalized message with enriched blocks
 */
function parseMessage(raw) {
  let type = raw.type || null;
  const message = raw.message || {};
  const content = Object.prototype.hasOwnProperty.call(message, 'content')
    ? message.content
    : raw.content;

  // Determine the actual role based on message type and content
  let role = type;

  // Check if this is a tool result message (stored as type="user" but contains tool_result blocks)
  // These are actually Claude's tool execution results, not user messages
  if (type === 'user' && content) {
    const contentBlocks = Array.isArray(content) ? content : [];
    const hasToolResult = contentBlocks.some(block =>
      block && typeof block === 'object' && block.type === 'tool_result'
    );
    if (hasToolResult) {
      role = 'assistant'; // Tool results are from Claude
      type = 'tool_result'; // Mark as tool_result type for clarity
    }
  }

  // Extract content based on message type
  let blocks = [];
  if (type === 'user' || type === 'assistant' || type === 'last-prompt' || type === 'tool_result') {
    blocks = normalizeContent(content || []);
  } else if (type === 'attachment') {
    // Attachments have a different structure
    blocks = normalizeContent(raw.attachment ? [raw.attachment] : []);
  }

  // Enrich blocks
  const enrichedBlocks = blocks.map(enrichBlock);

  const result = {
    id: raw.uuid || raw.id || null,
    role: role,
    type: type,
    blocks: enrichedBlocks,
    timestamp: raw.timestamp || null,
    sessionId: raw.sessionId || raw.session_id || null,
  };

  // Add type-specific fields
  if (type === 'permission-mode') {
    result.permissionMode = raw.permissionMode || null;
    result.granted = raw.granted !== false; // default to true
  }

  if (type === 'file-history-snapshot') {
    // Extract files from the snapshot structure
    const snapshot = raw.snapshot || {};
    result.files = snapshot.files || [];
    result.trackedFileBackups = snapshot.trackedFileBackups || {};
  }

  if (type === 'attachment') {
    // Store the attachment data directly
    result.attachments = raw.attachment ? [raw.attachment] : [];
    result.message = raw.message || {};
  }

  return result;
}

module.exports = { normalizeContent, parseMessage };
