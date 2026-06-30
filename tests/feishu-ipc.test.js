'use strict';

const path = require('path');
const os = require('os');
const { registerFeishuIpc } = require('../electron/feishu-ipc');

function registerHandlers(botManager = {}, store = {}) {
  const handlers = new Map();
  const ipcMain = {
    handle: jest.fn((name, handler) => handlers.set(name, handler))
  };
  registerFeishuIpc(ipcMain, botManager, store);
  return handlers;
}

describe('feishu IPC validation', () => {
  test('toggleBot returns a structured failure for malformed payloads', async () => {
    const botManager = { toggleBot: jest.fn() };
    const handlers = registerHandlers(botManager, { getBot: jest.fn() });

    const result = await handlers.get('feishu:toggleBot')(null, null);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/payload/i);
    expect(botManager.toggleBot).not.toHaveBeenCalled();
  });

  test('bindSessionToBot rejects paths outside Claude projects before delegating', async () => {
    const botManager = { bindSessionToBot: jest.fn() };
    const store = { getBot: jest.fn(() => ({ id: 1, project_dir: '/tmp/project' })) };
    const handlers = registerHandlers(botManager, store);

    const result = await handlers.get('feishu:bindSessionToBot')(null, {
      botId: 1,
      jsonlPath: path.join(os.tmpdir(), 'session.jsonl')
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/jsonlPath|projects|路径/);
    expect(botManager.bindSessionToBot).not.toHaveBeenCalled();
  });

  test('rebindSessionToBot rejects non-jsonl paths before delegating', async () => {
    const botManager = { bindSessionToBot: jest.fn() };
    const handlers = registerHandlers(botManager, {});

    const result = await handlers.get('feishu:rebindSessionToBot')(null, {
      botId: 1,
      jsonlPath: path.join(os.homedir(), '.claude', 'projects', '-tmp-project', 'session.txt')
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/jsonl/i);
    expect(botManager.bindSessionToBot).not.toHaveBeenCalled();
  });
});
