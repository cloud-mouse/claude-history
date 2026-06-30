const { normalizeContent, parseMessage } = require('../electron/message-parser');

describe('message-parser', () => {
  describe('normalizeContent', () => {
    test('wraps string content as text block', () => {
      const result = normalizeContent('Hello, world!');
      expect(result).toEqual([{ type: 'text', text: 'Hello, world!' }]);
    });

    test('returns array content as-is', () => {
      const blocks = [
        { type: 'text', text: 'Hello' },
        { type: 'tool_use', name: 'bash', input: { cmd: 'ls' } },
      ];
      const result = normalizeContent(blocks);
      expect(result).toBe(blocks);
    });

    test('returns empty array for invalid content', () => {
      expect(normalizeContent(null)).toEqual([]);
      expect(normalizeContent(undefined)).toEqual([]);
      expect(normalizeContent(123)).toEqual([]);
      expect(normalizeContent({})).toEqual([]);
    });
  });

  describe('parseMessage', () => {
    test('parses user message with raw string content', () => {
      const raw = {
        id: 'msg-123',
        type: 'user',
        content: 'What is the weather?',
        timestamp: 1712345678000,
        session_id: 'session-abc',
      };

      const result = parseMessage(raw);

      expect(result.id).toBe('msg-123');
      expect(result.role).toBe('user');
      expect(result.type).toBe('user');
      expect(result.blocks).toEqual([{ type: 'text', text: 'What is the weather?' }]);
      expect(result.timestamp).toBe(1712345678000);
      expect(result.sessionId).toBe('session-abc');
    });

    test('parses assistant message with array content', () => {
      const raw = {
        id: 'msg-456',
        type: 'assistant',
        content: [
          { type: 'text', text: 'Let me check that for you.' },
          { type: 'tool_use', name: 'get_weather', input: { city: 'Tokyo' } },
        ],
        timestamp: 1712345688000,
        session_id: 'session-abc',
      };

      const result = parseMessage(raw);

      expect(result.id).toBe('msg-456');
      expect(result.role).toBe('assistant');
      expect(result.type).toBe('assistant');
      expect(result.blocks.length).toBe(2);
      expect(result.blocks[0]).toEqual({ type: 'text', text: 'Let me check that for you.' });
    });

    test('enriches tool_use blocks with toolName and inputLines', () => {
      const raw = {
        id: 'msg-789',
        type: 'assistant',
        content: [
          {
            type: 'tool_use',
            name: 'bash',
            input: { command: 'echo "hello"\necho "world"' },
          },
        ],
        timestamp: 1712345698000,
      };

      const result = parseMessage(raw);
      const toolBlock = result.blocks[0];

      expect(toolBlock.type).toBe('tool_use');
      expect(toolBlock.toolName).toBe('bash');
      expect(toolBlock.inputLines).toBe(2); // Two lines in input
    });

    test('enriches tool_result blocks with isError boolean', () => {
      const raw = {
        id: 'msg-001',
        type: 'user',
        content: [
          { type: 'tool_result', content: 'File not found', is_error: true },
          { type: 'tool_result', content: 'Success', is_error: false },
        ],
        timestamp: 1712345708000,
      };

      const result = parseMessage(raw);

      expect(result.blocks[0].isError).toBe(true);
      expect(result.blocks[1].isError).toBe(false);
    });

    test('handles missing fields gracefully', () => {
      const raw = {};
      const result = parseMessage(raw);

      expect(result.id).toBeNull();
      expect(result.role).toBeNull();
      expect(result.type).toBeNull();
      expect(result.blocks).toEqual([]);
      expect(result.timestamp).toBeNull();
      expect(result.sessionId).toBeNull();
    });

    test('handles tool_result with isError camelCase variant', () => {
      const raw = {
        id: 'msg-002',
        type: 'user',
        content: [{ type: 'tool_result', content: 'Error case', isError: true }],
      };

      const result = parseMessage(raw);
      expect(result.blocks[0].isError).toBe(true);
    });

    test('parses actual JSONL message wrapper with tool_result blocks', () => {
      const raw = {
        uuid: 'msg-004',
        type: 'user',
        message: {
          content: [{ type: 'tool_result', content: 'Denied', is_error: true }]
        },
        session_id: 'session-wrapper'
      };

      const result = parseMessage(raw);
      expect(result.id).toBe('msg-004');
      expect(result.role).toBe('assistant');
      expect(result.type).toBe('tool_result');
      expect(result.sessionId).toBe('session-wrapper');
      expect(result.blocks[0].isError).toBe(true);
    });

    test('counts inputLines correctly for string input', () => {
      const raw = {
        id: 'msg-003',
        type: 'assistant',
        content: [
          { type: 'tool_use', name: 'read', input: 'line1\nline2\nline3' },
        ],
      };

      const result = parseMessage(raw);
      expect(result.blocks[0].inputLines).toBe(3);
    });
  });
});
