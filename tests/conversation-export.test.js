'use strict';

const {
  conversationToMarkdown,
  sanitizeFilename,
  extractText,
} = require('../electron/conversation-export');

describe('conversation-export', () => {
  describe('sanitizeFilename', () => {
    test('strips OS-illegal chars', () => {
      expect(sanitizeFilename('a/b:c?d*e')).toBe('a_b_c_d_e');
    });

    test('collapses whitespace', () => {
      expect(sanitizeFilename('foo   bar')).toBe('foo bar');
    });

    test('falls back to default for empty / null', () => {
      expect(sanitizeFilename('')).toBe('未命名对话');
      expect(sanitizeFilename(null)).toBe('未命名对话');
      expect(sanitizeFilename(undefined)).toBe('未命名对话');
    });

    test('truncates overly long names', () => {
      const long = 'x'.repeat(500);
      expect(sanitizeFilename(long).length).toBe(120);
    });
  });

  describe('extractText', () => {
    test('passes strings through unchanged', () => {
      expect(extractText('hello')).toBe('hello');
    });

    test('joins an array of text blocks', () => {
      expect(
        extractText([{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }])
      ).toBe('a\nb');
    });

    test('returns empty string for null / undefined', () => {
      expect(extractText(null)).toBe('');
      expect(extractText(undefined)).toBe('');
    });
  });

  describe('conversationToMarkdown', () => {
    test('renders header, role sections, tool call and result', () => {
      const md = conversationToMarkdown({
        title: '测试对话',
        projectDir: '/tmp/proj',
        updatedAt: 1700000000000,
        messages: [
          { role: 'user', type: 'user', blocks: [{ type: 'text', text: '你好' }] },
          {
            role: 'assistant',
            type: 'assistant',
            blocks: [
              { type: 'text', text: '我来执行' },
              { type: 'tool_use', name: 'Bash', input: { command: 'ls -la' } },
            ],
          },
          {
            role: 'assistant',
            type: 'tool_result',
            blocks: [{ type: 'tool_result', content: 'file1\nfile2' }],
          },
        ],
      });

      expect(md).toContain('# 测试对话');
      expect(md).toContain('项目：`/tmp/proj`');
      expect(md).toContain('消息数：3');
      expect(md).toContain('## 👤 用户');
      expect(md).toContain('你好');
      expect(md).toContain('## 🤖 Claude');
      expect(md).toContain('我来执行');
      expect(md).toContain('🔧 Bash');
      expect(md).toContain('ls -la');
      expect(md).toContain('↩ 结果');
      expect(md).toContain('file1');
    });

    test('does not repeat the role heading for consecutive assistant turns', () => {
      const md = conversationToMarkdown({
        messages: [
          {
            role: 'assistant',
            type: 'assistant',
            blocks: [{ type: 'text', text: 'first' }],
          },
          {
            role: 'assistant',
            type: 'tool_result',
            blocks: [{ type: 'tool_result', content: 'res' }],
          },
          {
            role: 'assistant',
            type: 'assistant',
            blocks: [{ type: 'text', text: 'second' }],
          },
        ],
      });
      expect(md.match(/## 🤖 Claude/g).length).toBe(1);
    });

    test('uses the Codex assistant label without changing the app export note', () => {
      const md = conversationToMarkdown({
        source: 'codex',
        messages: [
          {
            role: 'assistant',
            type: 'assistant',
            blocks: [{ type: 'text', text: 'Codex answer' }],
          },
        ],
      });

      expect(md).toContain('## 🤖 Codex');
      expect(md).toContain('由 Claude History 导出');
      expect(md).not.toContain('## 🤖 Claude');
    });

    test('omits thinking blocks entirely', () => {
      const md = conversationToMarkdown({
        messages: [
          {
            role: 'assistant',
            type: 'assistant',
            blocks: [
              { type: 'thinking', thinking: 'secret reasoning' },
              { type: 'text', text: 'answer' },
            ],
          },
        ],
      });
      expect(md).not.toContain('secret');
      expect(md).toContain('answer');
    });

    test('marks errored tool results', () => {
      const md = conversationToMarkdown({
        messages: [
          {
            role: 'assistant',
            type: 'tool_result',
            blocks: [{ type: 'tool_result', content: 'boom', is_error: true }],
          },
        ],
      });
      expect(md).toContain('❌');
    });

    test('renders Edit as a diff', () => {
      const md = conversationToMarkdown({
        messages: [
          {
            role: 'assistant',
            type: 'assistant',
            blocks: [
              {
                type: 'tool_use',
                name: 'Edit',
                input: { file_path: '/a.txt', old_string: 'x', new_string: 'y' },
              },
            ],
          },
        ],
      });
      expect(md).toContain('`/a.txt`');
      expect(md).toContain('- x');
      expect(md).toContain('+ y');
    });

    test('empty conversation still yields a header', () => {
      const md = conversationToMarkdown({ messages: [] });
      expect(md).toContain('# 未命名对话');
    });

    test('missing messages is treated as empty', () => {
      const md = conversationToMarkdown({});
      expect(typeof md).toBe('string');
      expect(md).toContain('# 未命名对话');
    });
  });
});
