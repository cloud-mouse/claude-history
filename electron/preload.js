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
  resumeConversation: (filePath) => ipcRenderer.invoke('resume-conversation', filePath)
});
