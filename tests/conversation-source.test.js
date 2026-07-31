'use strict';

const path = require('path');

let sourceModule = {};
try {
  sourceModule = require('../electron/conversation-source');
} catch {
  // The first TDD run intentionally exercises the not-yet-created module.
}

describe('conversation-source', () => {
  test('exports the source boundary API', () => {
    expect(typeof sourceModule.normalizeSource).toBe('function');
    expect(typeof sourceModule.getCodexHomeDir).toBe('function');
    expect(typeof sourceModule.getSourceRoots).toBe('function');
    expect(typeof sourceModule.assertConversationFilePath).toBe('function');
    expect(typeof sourceModule.getConversationCacheKey).toBe('function');
  });

  test('defaults missing sources to Claude and rejects unknown sources', () => {
    expect(sourceModule.normalizeSource()).toBe('claude');
    expect(sourceModule.normalizeSource('claude')).toBe('claude');
    expect(sourceModule.normalizeSource('codex')).toBe('codex');
    expect(() => sourceModule.normalizeSource('other')).toThrow('不支持的会话来源');
  });

  test('uses CODEX_HOME when present and falls back to ~/.codex', () => {
    expect(sourceModule.getCodexHomeDir({
      env: { CODEX_HOME: '/custom/codex' },
      homeDir: '/home/tester'
    })).toBe(path.resolve('/custom/codex'));

    expect(sourceModule.getCodexHomeDir({
      env: {},
      homeDir: '/home/tester'
    })).toBe(path.join('/home/tester', '.codex'));
  });

  test('returns both active and archived Codex roots', () => {
    expect(sourceModule.getSourceRoots('codex', {
      env: { CODEX_HOME: '/custom/codex' },
      homeDir: '/home/tester'
    })).toEqual([
      path.resolve('/custom/codex/sessions'),
      path.resolve('/custom/codex/archived_sessions')
    ]);
  });

  test('allows JSONL files only inside the selected source roots', () => {
    const options = {
      env: { CODEX_HOME: '/custom/codex' },
      homeDir: '/home/tester'
    };

    expect(sourceModule.assertConversationFilePath(
      '/custom/codex/sessions/2026/07/31/a.jsonl',
      'codex',
      options
    )).toBe(path.resolve('/custom/codex/sessions/2026/07/31/a.jsonl'));

    expect(sourceModule.assertConversationFilePath(
      '/custom/codex/archived_sessions/b.jsonl',
      'codex',
      options
    )).toBe(path.resolve('/custom/codex/archived_sessions/b.jsonl'));

    expect(() => sourceModule.assertConversationFilePath(
      '/custom/codex/sessions/../../secrets.jsonl',
      'codex',
      options
    )).toThrow('允许的目录');

    expect(() => sourceModule.assertConversationFilePath(
      '/custom/codex/sessions/a.txt',
      'codex',
      options
    )).toThrow('.jsonl');
  });

  test('includes the source in conversation cache keys', () => {
    expect(sourceModule.getConversationCacheKey('codex', '/tmp/a.jsonl'))
      .toBe('codex:/tmp/a.jsonl');
  });
});
