'use strict';

let parser = {};
try {
  parser = require('../electron/codex-parser');
} catch {
  // The first TDD run intentionally exercises the not-yet-created module.
}

function record(type, payload, timestamp = '2026-07-31T10:00:00.000Z') {
  return { type, payload, timestamp };
}

describe('codex-parser', () => {
  test('exports metadata and message projection APIs', () => {
    expect(typeof parser.parseCodexSessionMeta).toBe('function');
    expect(typeof parser.extractCodexUserText).toBe('function');
    expect(typeof parser.parseCodexRecord).toBe('function');
  });

  test('projects session metadata and identifies internal sessions', () => {
    expect(parser.parseCodexSessionMeta(record('session_meta', {
      id: 'session-1',
      cwd: '/workspace/app',
      source: 'vscode',
      timestamp: '2026-07-31T09:00:00.000Z'
    }))).toEqual({
      sessionId: 'session-1',
      projectDir: '/workspace/app',
      timestamp: '2026-07-31T09:00:00.000Z',
      internal: false
    });

    expect(parser.parseCodexSessionMeta(record('session_meta', {
      id: 'session-2',
      cwd: '/workspace/app',
      source: 'subagent',
      parent_thread_id: 'parent'
    })).internal).toBe(true);

    expect(parser.parseCodexSessionMeta(record('event_msg', {}))).toBeNull();
  });

  test('extracts only user-authored text for conversation titles', () => {
    expect(parser.extractCodexUserText(record('response_item', {
      type: 'message',
      role: 'user',
      content: [
        { type: 'input_image', image_url: 'data:image/png;base64,abc' },
        { type: 'input_text', text: '实现 Codex 历史查看' }
      ]
    }))).toBe('实现 Codex 历史查看');

    expect(parser.extractCodexUserText(record('response_item', {
      type: 'message',
      role: 'developer',
      content: [{ type: 'input_text', text: 'internal' }]
    }))).toBeNull();
  });

  test('drops Codex-injected user context from titles and visible messages', () => {
    const injectedContext = record('response_item', {
      type: 'message',
      role: 'user',
      content: [
        { type: 'input_text', text: '<recommended_plugins>\n- Figma' },
        { type: 'input_text', text: '# AGENTS.md instructions\n<INSTRUCTIONS>' },
        { type: 'input_text', text: '<environment_context>\n  <cwd>/workspace/app</cwd>' },
        { type: 'input_text', text: '<skill>\n<name>internal-skill</name>' },
        { type: 'input_text', text: '# Files mentioned by the user:\n\n## screenshot.png' },
        { type: 'input_text', text: '<image name=[Image #1] path="/tmp/screenshot.png">' },
        { type: 'input_text', text: '</image>' }
      ]
    });

    expect(parser.extractCodexUserText(injectedContext)).toBeNull();
    expect(parser.parseCodexRecord(injectedContext)).toEqual([]);

    const mixedMessage = record('response_item', {
      type: 'message',
      role: 'user',
      content: [
        { type: 'input_text', text: '<environment_context>\n  <cwd>/workspace/app</cwd>' },
        { type: 'input_text', text: '实现 Codex 历史查看' }
      ]
    });
    expect(parser.extractCodexUserText(mixedMessage)).toBe('实现 Codex 历史查看');
    expect(parser.parseCodexRecord(mixedMessage)[0].blocks).toEqual([
      { type: 'text', text: '实现 Codex 历史查看' }
    ]);
  });

  test('normalizes user and assistant text while dropping developer and reasoning records', () => {
    expect(parser.parseCodexRecord(record('response_item', {
      type: 'message',
      role: 'user',
      content: [{ type: 'input_text', text: '你好' }]
    }))).toEqual([{
      id: null,
      role: 'user',
      type: 'user',
      timestamp: '2026-07-31T10:00:00.000Z',
      blocks: [{ type: 'text', text: '你好' }]
    }]);

    expect(parser.parseCodexRecord(record('response_item', {
      type: 'message',
      role: 'assistant',
      content: [{ type: 'output_text', text: '已完成' }]
    }))[0].blocks).toEqual([{ type: 'text', text: '已完成' }]);

    expect(parser.parseCodexRecord(record('response_item', {
      type: 'message',
      role: 'developer',
      content: [{ type: 'input_text', text: 'internal' }]
    }))).toEqual([]);

    expect(parser.parseCodexRecord(record('response_item', {
      type: 'reasoning',
      encrypted_content: 'secret'
    }))).toEqual([]);
  });

  test('normalizes function and custom tool calls with parsed inputs', () => {
    const functionMessage = parser.parseCodexRecord(record('response_item', {
      type: 'function_call',
      name: 'exec_command',
      arguments: '{"cmd":"pwd"}',
      call_id: 'call-1'
    }))[0];

    expect(functionMessage.blocks[0]).toMatchObject({
      type: 'tool_use',
      id: 'call-1',
      name: 'exec_command',
      toolName: 'exec_command',
      input: { cmd: 'pwd' }
    });

    const customMessage = parser.parseCodexRecord(record('response_item', {
      type: 'custom_tool_call',
      name: 'exec',
      input: 'not-json',
      call_id: 'call-2'
    }))[0];
    expect(customMessage.blocks[0].input).toBe('not-json');
  });

  test('normalizes tool outputs and preserves safe output images', () => {
    const messages = parser.parseCodexRecord(record('response_item', {
      type: 'custom_tool_call_output',
      call_id: 'call-1',
      output: [
        { type: 'input_text', text: 'done' },
        { type: 'input_image', image_url: 'data:image/png;base64,abc' }
      ]
    }));

    expect(messages).toHaveLength(1);
    expect(messages[0].type).toBe('tool_result');
    expect(messages[0].blocks[0]).toMatchObject({
      type: 'tool_result',
      toolUseId: 'call-1',
      content: 'done',
      isError: false
    });
    expect(messages[0].blocks[1]).toEqual({
      type: 'image',
      source: { url: 'data:image/png;base64,abc' }
    });
  });

  test('preserves object entries returned by tool search', () => {
    const message = parser.parseCodexRecord(record('response_item', {
      type: 'tool_search_output',
      call_id: 'search-1',
      status: 'completed',
      tools: [
        { type: 'function', name: 'query_docs', description: 'Query docs' }
      ]
    }))[0];

    expect(message.blocks[0]).toMatchObject({
      type: 'tool_result',
      toolUseId: 'search-1',
      isError: false
    });
    expect(message.blocks[0].content).toContain('"name": "query_docs"');
  });

  test('uses a placeholder block for external image URLs', () => {
    const message = parser.parseCodexRecord(record('response_item', {
      type: 'message',
      role: 'user',
      content: [{ type: 'input_image', image_url: 'https://example.com/tracker.png' }]
    }))[0];

    expect(message.blocks).toEqual([{ type: 'image', source: {} }]);
  });

  test('ignores event and agent communication records', () => {
    expect(parser.parseCodexRecord(record('event_msg', {
      type: 'agent_message',
      message: 'duplicate'
    }))).toEqual([]);
    expect(parser.parseCodexRecord(record('response_item', {
      type: 'agent_message',
      content: [{ type: 'input_text', text: 'internal agent' }]
    }))).toEqual([]);
  });
});
