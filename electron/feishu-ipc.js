'use strict';

function registerFeishuIpc(ipcMain, bridge, store) {
  // 1. feishu:getStatus — Get connection status and binding info
  ipcMain.handle('feishu:getStatus', async () => {
    try {
      return { success: true, ...bridge.getStatus() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 2. feishu:getConfig — Get Feishu credentials (masked secret)
  ipcMain.handle('feishu:getConfig', async () => {
    try {
      const config = store.getFeishuConfig();
      return {
        success: true,
        appId: config.app_id || '',
        hasSecret: !!(config.app_secret),
        enabled: !!(config.enabled)
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 3. feishu:saveConfig — Save Feishu credentials
  ipcMain.handle('feishu:saveConfig', async (_, { appId, appSecret }) => {
    try {
      store.saveFeishuConfig(appId, appSecret);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 4. feishu:start — Start WebSocket connection
  ipcMain.handle('feishu:start', async () => {
    try {
      return await bridge.start();
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 5. feishu:stop — Stop WebSocket connection
  ipcMain.handle('feishu:stop', async () => {
    try {
      return await bridge.stop();
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 6. feishu:bindSession — Bind a conversation to Feishu
  ipcMain.handle('feishu:bindSession', async (_, { jsonlPath }) => {
    try {
      // Derive projectDir from the conversation's project in the database,
      // NOT from process.cwd() (which is the Electron app's directory).
      const projectDir = store.getProjectDirForJsonl(jsonlPath) || process.cwd();
      return bridge.bindSession(jsonlPath, projectDir);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 7. feishu:unbindSession — Unbind the active session
  ipcMain.handle('feishu:unbindSession', async () => {
    try {
      return bridge.unbind();
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 8. feishu:getBinding — Get binding status for a conversation
  ipcMain.handle('feishu:getBinding', async (_, jsonlPath) => {
    try {
      const binding = store.getBindingByJsonlPath(jsonlPath);
      return { success: true, binding };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  console.log('[feishu-ipc] All handlers registered');
}

module.exports = { registerFeishuIpc };
