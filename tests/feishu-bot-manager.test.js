'use strict';

const { BotManager } = require('../electron/feishu/bot-manager');

describe('BotManager', () => {
  test('toggleBot leaves bot disabled and rejects when runtime startup fails', async () => {
    const store = {
      updateBot: jest.fn(),
      getBot: jest.fn(() => ({ id: 1, name: 'bot', enabled: 0, project_dir: '/tmp/project' }))
    };
    const manager = new BotManager(store, null);
    manager._ensureHooks = jest.fn(async () => {});
    manager._startRuntime = jest.fn(async () => {
      throw new Error('bad credentials');
    });
    manager.broadcastStatus = jest.fn();

    await expect(manager.toggleBot(1, true)).rejects.toThrow('bad credentials');

    expect(store.updateBot).toHaveBeenCalledWith(1, { enabled: false });
    expect(store.updateBot).not.toHaveBeenCalledWith(1, { enabled: true });
  });
});
