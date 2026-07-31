'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

let loader = {};
try {
  loader = require('../electron/conversation-loader');
} catch {
  // The first TDD run intentionally exercises the not-yet-created module.
}

function writeJsonl(filePath, records) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, records.map((item) => JSON.stringify(item)).join('\n') + '\n');
}

describe('conversation-loader', () => {
  let tempHome;

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'conversation-loader-'));
  });

  afterEach(() => {
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  test('exports the shared loader API', () => {
    expect(typeof loader.loadConversationFile).toBe('function');
  });

  test('loads and normalizes a Claude conversation by default', async () => {
    const filePath = path.join(
      tempHome,
      '.claude',
      'projects',
      'app',
      'session.jsonl'
    );
    writeJsonl(filePath, [{
      uuid: 'claude-user',
      type: 'user',
      cwd: '/workspace/claude-app',
      timestamp: '2026-07-31T10:00:00.000Z',
      message: { content: 'Claude prompt' }
    }]);

    const result = await loader.loadConversationFile(filePath, undefined, {
      homeDir: tempHome,
      env: {}
    });

    expect(result.projectDir).toBe('/workspace/claude-app');
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toMatchObject({
      id: 'claude-user',
      role: 'user',
      blocks: [{ type: 'text', text: 'Claude prompt' }]
    });
  });

  test('loads Codex messages with the source-specific parser', async () => {
    const codexHome = path.join(tempHome, 'custom-codex');
    const filePath = path.join(
      codexHome,
      'sessions',
      '2026',
      '07',
      '31',
      'session.jsonl'
    );
    writeJsonl(filePath, [
      {
        type: 'session_meta',
        timestamp: '2026-07-31T10:00:00.000Z',
        payload: { id: 'codex-session', cwd: '/workspace/codex-app', source: 'cli' }
      },
      {
        type: 'response_item',
        timestamp: '2026-07-31T10:01:00.000Z',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'Codex prompt' }]
        }
      },
      {
        type: 'event_msg',
        payload: { type: 'agent_message', message: 'duplicate' }
      }
    ]);

    const result = await loader.loadConversationFile(filePath, 'codex', {
      homeDir: tempHome,
      env: { CODEX_HOME: codexHome }
    });

    expect(result.projectDir).toBe('/workspace/codex-app');
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toMatchObject({
      role: 'user',
      blocks: [{ type: 'text', text: 'Codex prompt' }]
    });
  });

  test('uses only the first Codex session metadata record for cwd', async () => {
    const codexHome = path.join(tempHome, 'custom-codex');
    const filePath = path.join(codexHome, 'sessions', '2026', '07', '31', 'no-cwd.jsonl');
    writeJsonl(filePath, [
      {
        type: 'session_meta',
        payload: { id: 'top-level', cwd: null, source: 'cli' }
      },
      {
        type: 'session_meta',
        payload: { id: 'nested', cwd: '/wrong/nested-cwd', source: 'subagent' }
      }
    ]);

    const result = await loader.loadConversationFile(filePath, 'codex', {
      homeDir: tempHome,
      env: { CODEX_HOME: codexHome }
    });

    expect(result.projectDir).toBeNull();
  });

  test('rejects a file outside the selected source roots', async () => {
    const filePath = path.join(tempHome, 'outside.jsonl');
    writeJsonl(filePath, []);

    await expect(loader.loadConversationFile(filePath, 'codex', {
      homeDir: tempHome,
      env: {}
    })).rejects.toThrow('允许的目录');
  });
});
