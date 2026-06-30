'use strict';

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
      const bot = botManager.createBot({
        name: data.name, appId: data.appId, appSecret: data.appSecret,
        projectDir: data.projectDir, allowedUsers: data.allowedUsers
      });
      return { success: true, bot };
    } catch (err) { return { success: false, error: err.message }; }
  });

  ipcMain.handle('feishu:updateBot', async (_, data) => {
    try {
      const fields = {};
      if (data.name != null) fields.name = data.name;
      if (data.appSecret != null) fields.appSecret = data.appSecret;
      if (data.allowedUsers != null) fields.allowedUsers = data.allowedUsers;
      if (data.enabled != null) fields.enabled = data.enabled;
      if (data.projectDir != null) fields.projectDir = data.projectDir;
      const bot = botManager.updateBot(data.botId, fields);
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
      const status = botManager.getStatus().bots.find((b) => b.id === botId);
      if (!status) return { success: false, error: '机器人不存在' };
      if (status.online) return { success: false, error: '请先停用机器人再删除', code: 'BOT_ONLINE' };
      if (status.processing) return { success: false, error: '机器人正在处理消息，请等待完成或 /cancel 后再删除', code: 'BOT_PROCESSING' };
      if (status.binding) return { success: false, error: '请先解绑机器人再删除', code: 'BOT_BOUND' };
      await botManager.deleteBot(botId);
      return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
  });

  ipcMain.handle('feishu:toggleBot', async (_, { botId, enabled }) => {
    try {
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
  ipcMain.handle('feishu:listBindableBots', async (_, { projectDir }) => {
    try { return { success: true, bots: botManager.listBindableBots(projectDir) }; }
    catch (err) { return { success: false, error: err.message }; }
  });

  // Bind a session to a bot. If the bot is already bound to a different session,
  // return needsRebind so the UI can show the rebind confirmation first.
  ipcMain.handle('feishu:bindSessionToBot', async (_, { botId, jsonlPath }) => {
    try {
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
  ipcMain.handle('feishu:rebindSessionToBot', async (_, { botId, jsonlPath }) => {
    try { botManager.bindSessionToBot(botId, jsonlPath); return { success: true }; }
    catch (err) { return { success: false, error: err.message }; }
  });

  ipcMain.handle('feishu:unbindBot', async (_, { botId }) => {
    try { botManager.unbindBot(botId); return { success: true }; }
    catch (err) { return { success: false, error: err.message }; }
  });

  // Given a jsonl, return the bot that has it bound (for UI badges).
  ipcMain.handle('feishu:getBinding', async (_, jsonlPath) => {
    try {
      const binding = store.getBindingByJsonlPath(jsonlPath);
      return { success: true, binding };
    } catch (err) { return { success: false, error: err.message }; }
  });

  console.log('[feishu-ipc] Multi-bot handlers registered');
}

module.exports = { registerFeishuIpc };
