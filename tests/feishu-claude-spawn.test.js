'use strict';

// Stub child_process so spawnClaude never shells out to a real `claude` binary.
// execSync returns '' so resolveClaudeBinary / resolveShellPath fall back to
// safe defaults; spawn is configured per-test via mockSpawn.
jest.mock('child_process', () => ({
  execSync: jest.fn(() => ''),
  spawn: jest.fn()
}));

const fs = require('fs');
const os = require('os');
const path = require('path');
const child_process = require('child_process');
const { generateHookSettings, spawnClaude } = require('../electron/feishu/claude-spawn');

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

describe('spawnClaude', () => {
  const mockSpawn = child_process.spawn;

  beforeEach(() => {
    mockSpawn.mockReset();
  });

  // Build a fake child process that emits the given stream-json frames then closes.
  function makeChild(frames) {
    const { EventEmitter } = require('events');
    const child = new EventEmitter();
    child.stdin = { end: () => {} };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    setImmediate(() => {
      for (const frame of frames) child.stdout.emit('data', Buffer.from(JSON.stringify(frame) + '\n'));
      child.emit('close', 0);
    });
    return child;
  }

  test('captures the real session_id Claude mints and returns it', async () => {
    // Regression guard: when the bound jsonl is missing, Claude starts a fresh
    // session with a new id. spawnClaude must surface that id so the caller can
    // reconcile the binding — otherwise every message spawns yet another session.
    mockSpawn.mockImplementation(() => makeChild([
      { type: 'assistant', session_id: 'real-uuid-xyz', message: { content: [{ type: 'text', text: 'done' }] } },
      { type: 'result', session_id: 'real-uuid-xyz', result: 'done', total_cost_usd: 0.01, duration_ms: 100, num_turns: 1 }
    ]));
    const result = await spawnClaude({
      sessionId: 'stale-id',
      jsonlPath: '/nonexistent/stale.jsonl',
      message: 'hi',
      botProjectDir: '/tmp/proj'
    });
    expect(result.sessionId).toBe('real-uuid-xyz');
    expect(result.text).toBe('done');
  });

  test('omits --resume when the bound jsonl is missing (the fresh-session trigger)', async () => {
    mockSpawn.mockImplementation(() => makeChild([
      { type: 'result', session_id: 'fresh-id', result: 'ok' }
    ]));
    await spawnClaude({
      sessionId: 'stale-id',
      jsonlPath: '/nonexistent/stale.jsonl',
      message: 'hi',
      botProjectDir: '/tmp/proj'
    });
    const args = mockSpawn.mock.calls[0][1];
    expect(args).not.toContain('--resume');
  });

  test('passes --resume <sessionId> when the bound jsonl exists', async () => {
    const tmp = path.join(os.tmpdir(), `claude-real-${Date.now()}.jsonl`);
    fs.writeFileSync(tmp, '{}');
    try {
      mockSpawn.mockImplementation(() => makeChild([
        { type: 'result', session_id: 'existing-id', result: 'ok' }
      ]));
      await spawnClaude({
        sessionId: 'existing-id',
        jsonlPath: tmp,
        message: 'hi',
        botProjectDir: '/tmp/proj'
      });
      const args = mockSpawn.mock.calls[0][1];
      const idx = args.indexOf('--resume');
      expect(idx).toBeGreaterThan(-1);
      expect(args[idx + 1]).toBe('existing-id');
    } finally {
      fs.unlinkSync(tmp);
    }
  });
});
