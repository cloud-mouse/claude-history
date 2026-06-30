'use strict';

const os = require('os');
const path = require('path');

function getClaudeProjectsDir() {
  return path.join(os.homedir(), '.claude', 'projects');
}

function isWithinClaudeProjects(targetPath) {
  const root = path.resolve(getClaudeProjectsDir());
  const resolved = path.resolve(targetPath);
  return resolved === root || resolved.startsWith(root + path.sep);
}

function requireObject(value, label = 'payload') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} 必须是对象`);
  }
  return value;
}

function parseBotId(value) {
  const id = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Error('botId 必须是正整数');
  return id;
}

function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} 不能为空`);
  return value.trim();
}

function requireProjectDir(value) {
  return requireString(value, 'projectDir');
}

function requireClaudeJsonlPath(value) {
  const jsonlPath = requireString(value, 'jsonlPath');
  const resolved = path.resolve(jsonlPath);
  if (path.extname(resolved) !== '.jsonl') throw new Error('jsonlPath 必须指向 .jsonl 文件');
  if (!isWithinClaudeProjects(resolved)) throw new Error('jsonlPath 必须位于 ~/.claude/projects 内');
  return resolved;
}

/**
 * Multi-bot IPC handlers (design §11). The renderer never sees an app_secret in
 * cleartext — create/update return a sanitized bot (hasSecret only), and the
 * hook confirmation channel is routed per-bot by the spawn-injected botId.
 */
function registerFeishuIpc(ipcMain, botManager, store) {
  // Aggregated status: { bots: [{ id, name, appId, projectDir, enabled, hasSecret, needsProjectDir, online, processing, binding }] }
  ipcMain.handle('feishu:getStatus', async () => {
    try { return { success: true, ...botManager.getStatus() }; }
    catch (err) { return { success: false, error: err.message }; }
  });

  ipcMain.handle('feishu:createBot', async (_, data) => {
    try {
      const payload = requireObject(data);
      const bot = botManager.createBot({
        name: requireString(payload.name, 'name'),
        appId: requireString(payload.appId, 'appId'),
        appSecret: requireString(payload.appSecret, 'appSecret'),
        projectDir: requireProjectDir(payload.projectDir),
        allowedUsers: Array.isArray(payload.allowedUsers) ? payload.allowedUsers : []
      });
      return { success: true, bot };
    } catch (err) { return { success: false, error: err.message }; }
  });

  ipcMain.handle('feishu:updateBot', async (_, data) => {
    try {
      const payload = requireObject(data);
      const fields = {};
      const botId = parseBotId(payload.botId);
      if (payload.name != null) fields.name = requireString(payload.name, 'name');
      if (payload.appSecret != null) fields.appSecret = requireString(payload.appSecret, 'appSecret');
      if (payload.allowedUsers != null) {
        if (!Array.isArray(payload.allowedUsers)) throw new Error('allowedUsers 必须是数组');
        fields.allowedUsers = payload.allowedUsers;
      }
      if (payload.enabled != null) fields.enabled = !!payload.enabled;
      if (payload.projectDir != null) fields.projectDir = requireProjectDir(payload.projectDir);
      const bot = botManager.updateBot(botId, fields);
      return { success: true, bot };
    } catch (err) {
      // Preserve a typed code (e.g. BOT_PROCESSING) so the renderer can render a
      // targeted message instead of a generic error.
      return { success: false, error: err.message, code: err.code };
    }
  });

  // Block deletion of an online or bound bot — caller must stop/unbind first.
  ipcMain.handle('feishu:deleteBot', async (_, botId) => {
    try {
      const id = parseBotId(botId);
      const status = botManager.getStatus().bots.find((b) => b.id === id);
      if (!status) return { success: false, error: '机器人不存在' };
      if (status.online) return { success: false, error: '请先停用机器人再删除', code: 'BOT_ONLINE' };
      if (status.processing) return { success: false, error: '机器人正在处理消息，请等待完成或 /cancel 后再删除', code: 'BOT_PROCESSING' };
      if (status.binding) return { success: false, error: '请先解绑机器人再删除', code: 'BOT_BOUND' };
      await botManager.deleteBot(id);
      return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
  });

  ipcMain.handle('feishu:toggleBot', async (_, data) => {
    try {
      const payload = requireObject(data);
      const botId = parseBotId(payload.botId);
      const enabled = !!payload.enabled;
      if (enabled) {
        const bot = store.getBot(botId);
        if (bot && !bot.project_dir) {
          return { success: false, error: '请先补全服务目录再启用', code: 'NEEDS_PROJECT_DIR' };
        }
      }
      await botManager.toggleBot(botId, enabled);
      return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
  });

  // Bots whose project_dir matches AND are online; others marked disabled (greyed out in UI).
  ipcMain.handle('feishu:listBindableBots', async (_, data) => {
    try {
      const payload = requireObject(data);
      return { success: true, bots: botManager.listBindableBots(requireProjectDir(payload.projectDir)) };
    }
    catch (err) { return { success: false, error: err.message }; }
  });

  // Bind a session to a bot. If the bot is already bound to a different session,
  // return needsRebind so the UI can show the rebind confirmation first.
  ipcMain.handle('feishu:bindSessionToBot', async (_, data) => {
    try {
      const payload = requireObject(data);
      const botId = parseBotId(payload.botId);
      const jsonlPath = requireClaudeJsonlPath(payload.jsonlPath);
      const bot = store.getBot(botId);
      if (!bot) return { success: false, error: '机器人不存在' };
      const existing = store.getActiveBindingByBot(botId);
      if (existing && existing.jsonl_path !== jsonlPath) {
        return { success: true, needsRebind: true, currentBinding: { sessionId: existing.session_id, jsonlPath: existing.jsonl_path } };
      }
      botManager.bindSessionToBot(botId, jsonlPath);
      return { success: true, needsRebind: false };
    } catch (err) { return { success: false, error: err.message }; }
  });

  // Confirmed rebind — overwrite the bot's single binding row.
  ipcMain.handle('feishu:rebindSessionToBot', async (_, data) => {
    try {
      const payload = requireObject(data);
      botManager.bindSessionToBot(parseBotId(payload.botId), requireClaudeJsonlPath(payload.jsonlPath));
      return { success: true };
    }
    catch (err) { return { success: false, error: err.message }; }
  });

  ipcMain.handle('feishu:unbindBot', async (_, data) => {
    try {
      const payload = requireObject(data);
      botManager.unbindBot(parseBotId(payload.botId));
      return { success: true };
    }
    catch (err) { return { success: false, error: err.message }; }
  });

  // Given a jsonl, return the bot that has it bound (for UI badges).
  ipcMain.handle('feishu:getBinding', async (_, jsonlPath) => {
    try {
      const binding = store.getBindingByJsonlPath(requireClaudeJsonlPath(jsonlPath));
      return { success: true, binding };
    } catch (err) { return { success: false, error: err.message }; }
  });

  console.log('[feishu-ipc] Multi-bot handlers registered');
}

module.exports = { registerFeishuIpc, requireClaudeJsonlPath, parseBotId };
