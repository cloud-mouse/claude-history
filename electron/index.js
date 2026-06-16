const { app, BrowserWindow, Menu, ipcMain, safeStorage, session, shell } = require('electron');
const path = require('path');
const { registerIpcHandlers } = require('./ipc-handlers');
const { registerFeishuIpc } = require('./feishu-ipc');
const { FeishuBridge } = require('./feishu');
const { initUpdater, registerUpdaterIpc, isForceRestart, checkForUpdates } = require('./updater');

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

  // H4: defense-in-depth against phishing/navigation hijacking. Any external
  // http(s) link opened from rendered markdown is handed to the OS browser;
  // the app window itself never navigates off-file://.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (/^https?:\/\//i.test(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // H4: inject a Content-Security-Policy in production so a future sanitize
    // bypass still cannot execute arbitrary scripts. (Skipped in dev so Vite
    // HMR / inline scripts keep working.)
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self' data:"
          ]
        }
      });
    });
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Register IPC handlers after window creation
  registerIpcHandlers();

  // Initialize auto-updater (only in production builds)
  if (!isDev) {
    initUpdater(mainWindow);
    registerUpdaterIpc();
  }

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
      label: app.name,
      submenu: [
        { label: '退出 ' + app.name, accelerator: 'CmdOrCtrl+Q', role: 'quit' }
      ]
    },
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
        { label: '重新加载', role: 'reload' },
        { label: '强制重新加载', role: 'forceReload' },
        { label: '切换开发者工具', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: '撤销', role: 'undo' },
        { label: '重做', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', role: 'cut' },
        { label: '复制', role: 'copy' },
        { label: '粘贴', role: 'paste' },
        { label: '全选', role: 'selectAll' },
        { type: 'separator' },
        { label: '放大', role: 'zoomIn' },
        { label: '缩小', role: 'zoomOut' },
        { label: '重置缩放', role: 'resetZoom' }
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

  // Inject safeStorage for credential encryption
  const store = getStore();
  store.setSafeStorage(safeStorage);

  // Auto-start Feishu bridge if credentials are configured
  try {
    const store = getStore();
    const config = store.getFeishuConfig();
    if (config && config.app_id && config.app_secret) {
      feishuBridge.start().catch(err => {
        console.error('[feishu] Auto-start failed:', err.message);
      });
    }
  } catch (e) {
    // Store might not be ready yet
  }

  // Auto-check for updates after 3 seconds (production only)
  if (app.isPackaged) {
    setTimeout(() => {
      checkForUpdates().catch(err => {
        console.error('[updater] auto-check failed:', err.message);
      });
    }, 3000);
  }

  // Background index/stats backfill (functions 1 & 3). Runs after a short delay
  // so the window paints first; serial + cooperative so it never blocks the UI.
  setTimeout(() => {
    const { backfillAllPending } = require('./backfill');
    backfillAllPending(store, ({ scanned, total, updated }) => {
      if (scanned === total) console.log(`[backfill] done: ${updated}/${total} conversations re-indexed`);
    }).catch(err => console.warn('[backfill] error:', err.message));
  }, 5000);
});

app.on('window-all-closed', () => {
  app.quit();
});

let isQuitting = false;
app.on('before-quit', (e) => {
  if (isQuitting || isForceRestart()) return;
  if (feishuBridge) {
    e.preventDefault();
    isQuitting = true;
    feishuBridge.stop().then(() => {
      app.quit();
    }).catch(() => {
      app.quit();
    });
  }
});

app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
