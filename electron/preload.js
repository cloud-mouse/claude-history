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

  // Event listeners (main → renderer) — returns unsubscribe function
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
