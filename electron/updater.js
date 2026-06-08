'use strict';

const { ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');

let mainWindow = null;
let forceRestart = false;

function initUpdater(win) {
  mainWindow = win;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  // Forward all updater events to the renderer
  autoUpdater.on('checking-for-update', () => {
    send('updater:checking');
  });

  autoUpdater.on('update-available', (info) => {
    send('updater:available', {
      version: info.version,
      releaseNotes: info.releaseNotes || '',
      releaseName: info.releaseName || info.version
    });
  });

  autoUpdater.on('update-not-available', () => {
    send('updater:not-available');
  });

  autoUpdater.on('download-progress', (progress) => {
    send('updater:progress', {
      percent: Math.round(progress.percent),
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    send('updater:downloaded', {
      version: info.version
    });
  });

  autoUpdater.on('error', (err) => {
    console.error('[updater] error:', err.message);
    send('updater:error', { message: err.message });
  });
}

function registerUpdaterIpc() {
  ipcMain.handle('updater:check', async () => {
    try {
      await autoUpdater.checkForUpdates();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('updater:download', async () => {
    try {
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('updater:install', () => {
    // Mark force restart so before-quit handler skips FeishuBridge cleanup
    forceRestart = true;
    // quitAndInstall is synchronous — app will restart
    setImmediate(() => autoUpdater.quitAndInstall());
    return { success: true };
  });
}

function send(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

module.exports = { initUpdater, registerUpdaterIpc, isForceRestart: () => forceRestart, checkForUpdates: () => autoUpdater.checkForUpdates() };
