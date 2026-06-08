const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  scanProjects: () => ipcRenderer.invoke('scan-projects'),
  clearCache: () => ipcRenderer.invoke('clear-cache'),
  invalidateConversationCache: (filePath) => ipcRenderer.invoke('invalidate-conversation-cache', filePath),
  getConversations: (projectId) => ipcRenderer.invoke('get-conversations', projectId),
  loadConversation: (filePath) => ipcRenderer.invoke('load-conversation', filePath),
  searchConversations: (projectId, query) => ipcRenderer.invoke('search-conversations', projectId, query),
  updateTitle: (filePath, title) => ipcRenderer.invoke('update-title', filePath, title),
  openExternal: (filePath) => ipcRenderer.invoke('open-external', filePath),
  deleteConversation: (filePath) => ipcRenderer.invoke('delete-conversation', filePath),
  deleteProject: (projectId) => ipcRenderer.invoke('delete-project', projectId),
  resumeConversation: (filePath, projectDir) => ipcRenderer.invoke('resume-conversation', filePath, projectDir),

  // Feishu bridge API
  feishuGetStatus: () => ipcRenderer.invoke('feishu:getStatus'),
  feishuGetConfig: () => ipcRenderer.invoke('feishu:getConfig'),
  feishuSaveConfig: (config) => ipcRenderer.invoke('feishu:saveConfig', config),
  feishuStart: () => ipcRenderer.invoke('feishu:start'),
  feishuStop: () => ipcRenderer.invoke('feishu:stop'),
  feishuBindSession: (opts) => ipcRenderer.invoke('feishu:bindSession', opts),
  feishuUnbindSession: () => ipcRenderer.invoke('feishu:unbindSession'),
  feishuGetBinding: (jsonlPath) => ipcRenderer.invoke('feishu:getBinding', jsonlPath),

  // Updater API
  updaterCheck: () => ipcRenderer.invoke('updater:check'),
  updaterDownload: () => ipcRenderer.invoke('updater:download'),
  updaterInstall: () => ipcRenderer.invoke('updater:install'),

  // Event listeners (main → renderer) — returns unsubscribe function
  onUpdaterChecking: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('updater:checking', handler);
    return () => ipcRenderer.removeListener('updater:checking', handler);
  },
  onUpdaterAvailable: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on('updater:available', handler);
    return () => ipcRenderer.removeListener('updater:available', handler);
  },
  onUpdaterNotAvailable: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('updater:not-available', handler);
    return () => ipcRenderer.removeListener('updater:not-available', handler);
  },
  onUpdaterProgress: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on('updater:progress', handler);
    return () => ipcRenderer.removeListener('updater:progress', handler);
  },
  onUpdaterDownloaded: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on('updater:downloaded', handler);
    return () => ipcRenderer.removeListener('updater:downloaded', handler);
  },
  onUpdaterError: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on('updater:error', handler);
    return () => ipcRenderer.removeListener('updater:error', handler);
  },

  onFeishuStatusChanged: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on('feishu:statusChanged', handler);
    return () => ipcRenderer.removeListener('feishu:statusChanged', handler);
  },
  onFeishuJsonlChanged: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on('feishu:jsonlChanged', handler);
    return () => ipcRenderer.removeListener('feishu:jsonlChanged', handler);
  }
});
