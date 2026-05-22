'use strict';

/**
 * Build a card for Claude response (success).
 */
function buildResponseCard(response) {
  const text = String(response || '(空响应)').trim();
  const MAX_LEN = 3500;

  let content;
  if (text.length <= MAX_LEN) {
    content = text;
  } else {
    content = smartTruncate(text, MAX_LEN) + '\n\n_...（内容过长已截断）_';
  }

  return {
    schema: '2.0',
    config: { width_mode: 'fill' },
    header: {
      title: { tag: 'plain_text', content: '✅ Claude Code' },
      template: 'turquoise'
    },
    body: {
      elements: [
        { tag: 'markdown', content },
        { tag: 'hr' },
        { tag: 'markdown', content: '_由 Claude Code 飞书桥接驱动_' }
      ]
    }
  };
}

/**
 * Build a card for processing acknowledgment.
 */
function buildAckCard(preview) {
  return {
    schema: '2.0',
    config: { width_mode: 'fill' },
    header: {
      title: { tag: 'plain_text', content: '⏳ 正在处理' },
      template: 'blue'
    },
    body: {
      elements: [
        { tag: 'markdown', content: `> ${preview}` }
      ]
    }
  };
}

/**
 * Build a card for error response.
 */
function buildErrorCard(message) {
  return {
    schema: '2.0',
    config: { width_mode: 'fill' },
    header: {
      title: { tag: 'plain_text', content: '❌ 处理失败' },
      template: 'red'
    },
    body: {
      elements: [
        { tag: 'markdown', content: `\`\`\`\n${message}\n\`\`\`` }
      ]
    }
  };
}

/**
 * Build a card for status/info (neutral).
 */
function buildInfoCard(title, markdownContent, color = 'blue') {
  return {
    schema: '2.0',
    config: { width_mode: 'fill' },
    header: {
      title: { tag: 'plain_text', content: title },
      template: color
    },
    body: {
      elements: [
        { tag: 'markdown', content: markdownContent }
      ]
    }
  };
}

/**
 * Build a card for success confirmation.
 */
function buildSuccessCard(title, markdownContent) {
  return {
    schema: '2.0',
    config: { width_mode: 'fill' },
    header: {
      title: { tag: 'plain_text', content: title },
      template: 'green'
    },
    body: {
      elements: [
        { tag: 'markdown', content: markdownContent }
      ]
    }
  };
}

/**
 * Build a card for warning/prompt.
 */
function buildWarningCard(title, markdownContent) {
  return {
    schema: '2.0',
    config: { width_mode: 'fill' },
    header: {
      title: { tag: 'plain_text', content: title },
      template: 'orange'
    },
    body: {
      elements: [
        { tag: 'markdown', content: markdownContent }
      ]
    }
  };
}

/**
 * Build a confirmation result card (used to replace interactive cards).
 * @param {string} title - Result title (e.g. "✅ 已允许")
 * @param {string} color - Header color
 * @param {string} [detail] - Original operation detail to preserve in history
 */
function buildConfirmResultCard(title, color, detail) {
  const elements = [];
  if (detail) {
    elements.push({ tag: 'markdown', content: detail });
  }
  return {
    schema: '2.0',
    config: { width_mode: 'fill' },
    header: {
      title: { tag: 'plain_text', content: title },
      template: color
    },
    body: { elements }
  };
}

/**
 * Build a markdown detail string for a tool call (reused by permission card and result card).
 */
function buildToolDetail(toolName, toolInput, cwd) {
  let detail = '';
  if (toolName === 'Bash' && toolInput?.command) {
    const cmd = toolInput.command.length > 300 ? toolInput.command.slice(0, 300) + '...' : toolInput.command;
    detail = `**命令:**\n\`\`\`bash\n${cmd}\n\`\`\``;
  } else if (toolName === 'Write' && toolInput?.file_path) {
    const contentPreview = (toolInput.content || '').slice(0, 500);
    detail = `**文件:** \`${toolInput.file_path}\`\n\n**内容预览:**\n\`\`\`\n${contentPreview}\n\`\`\``;
  } else if ((toolName === 'Edit' || toolName === 'MultiEdit') && toolInput?.file_path) {
    const oldStr = (toolInput.old_string || '').slice(0, 200);
    const newStr = (toolInput.new_string || '').slice(0, 200);
    detail = `**文件:** \`${toolInput.file_path}\`\n\n**替换:**\n\`\`\`\n${oldStr}\n\`\`\`\n→\n\`\`\`\n${newStr}\n\`\`\``;
  } else {
    detail = `\`${toolName}\``;
  }
  const projectLine = cwd ? `\n**项目:** \`${cwd}\`` : '';
  return `**工具:** \`${toolName}\`${projectLine}\n\n${detail}`;
}

/**
 * Build a permission confirmation card for a tool call.
 * This is the NEW card for the hooks-based interaction.
 */
function buildPermissionCard(requestId, toolName, toolInput, cwd) {
  const detail = buildToolDetail(toolName, toolInput, cwd);

  return {
    schema: '2.0',
    config: { width_mode: 'fill' },
    header: {
      title: { tag: 'plain_text', content: '⚠️ 操作确认请求' },
      template: 'orange'
    },
    body: {
      elements: [
        { tag: 'markdown', content: detail },
        {
          tag: 'column_set',
          flex_mode: 'flow',
          columns: [
            {
              tag: 'column', width: 'auto', weight: 1, vertical_align: 'top',
              elements: [{
                tag: 'button',
                text: { tag: 'plain_text', content: '✅ 允许' },
                type: 'primary',
                behaviors: [{ type: 'callback', value: { requestId, action: 'hook_allow' } }]
              }]
            },
            {
              tag: 'column', width: 'auto', weight: 1, vertical_align: 'top',
              elements: [{
                tag: 'button',
                text: { tag: 'plain_text', content: '❌ 拒绝' },
                type: 'danger',
                behaviors: [{ type: 'callback', value: { requestId, action: 'hook_deny' } }]
              }]
            },
            {
              tag: 'column', width: 'auto', weight: 1, vertical_align: 'top',
              elements: [{
                tag: 'button',
                text: { tag: 'plain_text', content: '🔓 始终允许' },
                type: 'primary',
                behaviors: [{ type: 'callback', value: { requestId, action: 'hook_always_allow', toolName } }]
              }]
            }
          ]
        },
        { tag: 'markdown', content: '_⏳ 等待确认... (60s 超时)_' }
      ]
    }
  };
}

/**
 * Smart truncation: tries to break at newline or space boundaries.
 */
function smartTruncate(text, maxLen) {
  if (text.length <= maxLen) return text;

  let cut = text.lastIndexOf('\n', maxLen);
  if (cut < maxLen * 0.5) {
    cut = text.lastIndexOf(' ', maxLen);
  }
  if (cut < maxLen * 0.5) {
    cut = maxLen;
  }

  return text.slice(0, cut).trimEnd();
}

/**
 * Extract plain text from a card for fallback purposes.
 */
function extractCardText(card) {
  const parts = [];
  if (card.header?.title?.content) parts.push(card.header.title.content);
  for (const el of (card.body?.elements || card.elements || [])) {
    if (el.tag === 'markdown' && el.content) parts.push(el.content);
    if (el.tag === 'div' && el.text?.content) parts.push(el.text.content);
  }
  return parts.join('\n').slice(0, 4000);
}

module.exports = {
  buildResponseCard,
  buildAckCard,
  buildErrorCard,
  buildInfoCard,
  buildSuccessCard,
  buildWarningCard,
  buildConfirmResultCard,
  buildPermissionCard,
  buildToolDetail,
  extractCardText,
  smartTruncate
};
