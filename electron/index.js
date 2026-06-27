const { app, BrowserWindow, Menu, ipcMain, safeStorage, session, shell } = require('electron');
const path = require('path');
const { registerIpcHandlers } = require('./ipc-handlers');
const { registerFeishuIpc } = require('./feishu-ipc');
const { FeishuBridge } = require('./feishu');
const { initUpdater, registerUpdaterIpc, isForceRestart, checkForUpdates } = require('./updater');

let mainWindow;
let feishuBridge = null;

/**
 * Apply (or re-apply) the native frosted-glass material to a BrowserWindow
 * based on the user's frostedGlass preference. Called once at createWindow()
 * and again on every `appearance:setFrostedGlass` IPC for live toggling.
 *
 * - macOS:     `setVibrancy('under-window' | null)`. vibrancy paints under the
 *              web content, so the renderer must keep its window base transparent
 *              (see windowOptions.backgroundColor below + variables.css).
 * - Windows:   `setBackgroundMaterial('acrylic' | 'none')` (Win11; Win10 no-op).
 * - Linux:     no-op (no native equivalent).
 *
 * Note: `visualEffectState: 'active'` is a BrowserWindow *constructor* option
 * (set once in createWindow); there is no live setter, so we don't touch it here.
 */
function applyFrostedGlass(win, enabled, platform) {
  if (!win || win.isDestroyed()) return;
  if (platform === 'darwin') {
    win.setVibrancy(enabled ? 'under-window' : null);
  } else if (platform === 'win32') {
    win.setBackgroundMaterial(enabled ? 'acrylic' : 'none');
  }
  // linux: no-op
}

function createWindow() {
  const isMac = process.platform === 'darwin';
  const platform = process.platform;
  const store = getStore();
  // Default to ON (matches ADR-0002): no row yet → true.
  const frostedEnabled = store.getAppSetting('frostedGlass', '1') !== '0';

  const windowOptions = {
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
  };
  // macOS: native vibrancy so the semi-transparent side panels show frosted glass.
  // The fully-transparent window backgroundColor is the missing root-cause fix —
  // without it the default opaque white window base occludes the vibrancy layer.
  if (isMac) {
    windowOptions.backgroundColor = '#00000000';
    windowOptions.visualEffectState = 'active';
    if (frostedEnabled) windowOptions.vibrancy = 'under-window';
  }
  mainWindow = new BrowserWindow(windowOptions);

  // Win32: apply acrylic material post-construction (constructor-level config
  // only accepts 'auto' / 'none' / 'mica' / 'acrylic' on some Electron builds,
  // but setBackgroundMaterial is the reliable live API). Initial state set here.
  if (platform === 'win32') {
    applyFrostedGlass(mainWindow, frostedEnabled, platform);
  }

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

  // Appearance IPC (frosted glass toggle). Registered here in index.js because
  // the `set` handler needs the live mainWindow reference to apply the native
  // material immediately (no restart). The shared store is reached via getStore().
  ipcMain.handle('appearance:getFrostedGlass', () => {
    const s = getStore();
    // Missing row → default ON (true).
    return s.getAppSetting('frostedGlass', '1') !== '0';
  });
  ipcMain.handle('appearance:setFrostedGlass', (_event, enabled) => {
    const s = getStore();
    const value = enabled ? '1' : '0';
    s.setAppSetting('frostedGlass', value);
    applyFrostedGlass(mainWindow, !!enabled, process.platform);
  });

  // Initialize auto-updater (only in production builds)
  if (!isDev) {
    initUpdater(mainWindow);
    registerUpdaterIpc();
  }

  // Initialize Feishu bridge
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

  // Background index/stats backfill (functions 1 & 3). Runs after a short delay.
  // Bounded to the N newest un-indexed sessions per launch (each in one
  // transaction) so a large history never freezes the UI at startup.
  setTimeout(() => {
    const { backfillAllPending, STARTUP_LIMIT } = require('./backfill');
    backfillAllPending(store, { limit: STARTUP_LIMIT, onProgress: ({ scanned, total, updated }) => {
      if (scanned === total) console.log(`[backfill] done: ${updated}/${total} conversations re-indexed`);
    } }).catch(err => console.warn('[backfill] error:', err.message));
    // Purge Feishu attachment downloads older than 7 days so the dir stays bounded.
    try { require('./feishu/bridge').cleanOldAttachments(); } catch (e) { console.warn('[feishu] attachment cleanup failed:', e.message); }
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
