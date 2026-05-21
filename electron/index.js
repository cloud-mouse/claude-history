const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const { registerIpcHandlers } = require('./ipc-handlers');
const { registerFeishuIpc } = require('./feishu-ipc');
const { FeishuBridge } = require('./feishu-bridge');

let mainWindow;
let feishuBridge = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    icon: path.join(__dirname, '../build/icon.512x512.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Register IPC handlers after window creation
  registerIpcHandlers();

  // Initialize Feishu bridge
  const store = getStore();
  feishuBridge = new FeishuBridge(store, mainWindow);
  registerFeishuIpc(ipcMain, feishuBridge, store);

  // Migrate credentials from cc-connect if available
  feishuBridge.migrateFromCcConnect();
}

// Create application menu with keyboard shortcuts
function createMenu() {
  const template = [
    {
      label: '视图',
      submenu: [
        {
          label: '开发者工具',
          accelerator: 'CmdOrCtrl+K',
          click: () => {
            if (mainWindow) {
              if (mainWindow.webContents.isDevToolsOpened()) {
                mainWindow.webContents.closeDevTools();
              } else {
                mainWindow.webContents.openDevTools();
              }
            }
          }
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function getStore() {
  // Access the store instance from ipc-handlers
  return require('./ipc-handlers').getStore();
}

app.whenReady().then(() => {
  createWindow();
  createMenu();

  // Auto-start Feishu bridge if configured
  try {
    const store = getStore();
    const config = store.getFeishuConfig();
    if (config && config.app_id && config.enabled) {
      feishuBridge.start().catch(err => {
        console.error('[feishu] Auto-start failed:', err.message);
      });
    }
  } catch (e) {
    // Store might not be ready yet
  }
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', async () => {
  if (feishuBridge) {
    await feishuBridge.stop();
  }
});

app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
