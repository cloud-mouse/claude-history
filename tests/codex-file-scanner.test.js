'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const scanner = require('../electron/file-scanner');

function writeSession(filePath, records) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, records.map((item) => JSON.stringify(item)).join('\n') + '\n');
}

function meta(id, cwd, extra = {}) {
  return {
    type: 'session_meta',
    timestamp: '2026-07-31T08:00:00.000Z',
    payload: { id, cwd, source: 'cli', ...extra }
  };
}

function user(text) {
  return {
    type: 'response_item',
    timestamp: '2026-07-31T08:01:00.000Z',
    payload: {
      type: 'message',
      role: 'user',
      content: [{ type: 'input_text', text }]
    }
  };
}

describe('scanCodexProjects', () => {
  let codexHome;

  beforeEach(() => {
    codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-scanner-'));
  });

  afterEach(() => {
    fs.rmSync(codexHome, { recursive: true, force: true });
  });

  test('exports the Codex scanner API', () => {
    expect(typeof scanner.scanCodexProjects).toBe('function');
  });

  test('groups active and archived sessions by cwd with titles and archive state', async () => {
    const activePath = path.join(
      codexHome,
      'sessions',
      '2026',
      '07',
      '31',
      'rollout-active.jsonl'
    );
    const archivedPath = path.join(
      codexHome,
      'archived_sessions',
      'rollout-archived.jsonl'
    );

    writeSession(activePath, [meta('active', '/workspace/app'), user('实现普通会话')]);
    writeSession(archivedPath, [meta('archived', '/workspace/app'), user('查看归档会话')]);

    const projects = await scanner.scanCodexProjects(codexHome);

    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({
      id: 'codex:/workspace/app',
      source: 'codex',
      name: 'app',
      path: '/workspace/app'
    });
    expect(projects[0].conversations).toHaveLength(2);
    expect(projects[0].conversations.map((conv) => ({
      sessionId: conv.sessionId,
      source: conv.source,
      archived: conv.archived,
      title: conv.title,
      projectDir: conv.projectDir
    }))).toEqual(expect.arrayContaining([
      {
        sessionId: 'active',
        source: 'codex',
        archived: false,
        title: '实现普通会话',
        projectDir: '/workspace/app'
      },
      {
        sessionId: 'archived',
        source: 'codex',
        archived: true,
        title: '查看归档会话',
        projectDir: '/workspace/app'
      }
    ]));
  });

  test('filters subagent and forked sessions', async () => {
    writeSession(
      path.join(codexHome, 'sessions', '2026', '07', '31', 'subagent.jsonl'),
      [meta('subagent', '/workspace/app', { source: 'subagent', parent_thread_id: 'parent' }), user('hidden')]
    );
    writeSession(
      path.join(codexHome, 'sessions', '2026', '07', '31', 'fork.jsonl'),
      [meta('fork', '/workspace/app', { forked_from_id: 'parent' }), user('hidden')]
    );

    expect(await scanner.scanCodexProjects(codexHome)).toEqual([]);
  });

  test('deduplicates sessions by id and prefers the active copy', async () => {
    writeSession(
      path.join(codexHome, 'archived_sessions', 'duplicate.jsonl'),
      [meta('same-id', '/workspace/app'), user('archived title')]
    );
    writeSession(
      path.join(codexHome, 'sessions', '2026', '07', '31', 'duplicate.jsonl'),
      [meta('same-id', '/workspace/app'), user('active title')]
    );

    const projects = await scanner.scanCodexProjects(codexHome);
    expect(projects[0].conversations).toHaveLength(1);
    expect(projects[0].conversations[0]).toMatchObject({
      archived: false,
      title: 'active title'
    });
  });

  test('places sessions without cwd in a stable fallback project and skips malformed files', async () => {
    writeSession(
      path.join(codexHome, 'sessions', '2026', '07', '31', 'uncategorized.jsonl'),
      [meta('uncategorized', null), user('无目录会话')]
    );
    const malformedPath = path.join(
      codexHome,
      'sessions',
      '2026',
      '07',
      '31',
      'malformed.jsonl'
    );
    fs.writeFileSync(malformedPath, 'not-json\n');

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const projects = await scanner.scanCodexProjects(codexHome);
    warnSpy.mockRestore();

    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({
      id: 'codex:uncategorized',
      name: '未归类',
      path: ''
    });
    expect(projects[0].conversations[0].projectDir).toBeNull();
  });

  test('skips injected user context when choosing a conversation title', async () => {
    writeSession(
      path.join(codexHome, 'sessions', '2026', '07', '31', 'context.jsonl'),
      [
        meta('context', '/workspace/app'),
        user('# AGENTS.md instructions\n<INSTRUCTIONS>'),
        user('用户真正的问题')
      ]
    );

    const projects = await scanner.scanCodexProjects(codexHome);
    expect(projects[0].conversations[0].title).toBe('用户真正的问题');
  });
});
