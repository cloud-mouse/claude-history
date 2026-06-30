'use strict';

const fs = require('fs');
const { generateHookSettings } = require('../electron/feishu/claude-spawn');

describe('generateHookSettings', () => {
  test('shell-quotes hook command values', () => {
    const settingsPath = generateHookSettings(19876, 'token with spaces', 7, 'chat id');
    try {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      const command = settings.hooks.PreToolUse[0].hooks[0].command;

      expect(command).toContain("FEISHU_HOOK_TOKEN='token with spaces'");
      expect(command).toContain("FEISHU_CHAT_ID='chat id'");
      expect(command).toMatch(/node '.*feishu-hook-script\.js'/);
    } finally {
      fs.unlinkSync(settingsPath);
    }
  });
});
