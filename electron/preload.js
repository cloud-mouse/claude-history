const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  scanProjects: () => ipcRenderer.invoke('scan-projects'),
  clearCache: () => ipcRenderer.invoke('clear-cache'),
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

  // Event listeners (main → renderer)
  onFeishuStatusChanged: (callback) => {
    ipcRenderer.on('feishu:statusChanged', (_, data) => callback(data));
  },
  onFeishuJsonlChanged: (callback) => {
    ipcRenderer.on('feishu:jsonlChanged', (_, data) => callback(data));
  },
  removeFeishuListeners: () => {
    ipcRenderer.removeAllListeners('feishu:statusChanged');
    ipcRenderer.removeAllListeners('feishu:jsonlChanged');
  }
});
