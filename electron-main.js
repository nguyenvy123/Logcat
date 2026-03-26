/**
 * electron-main.js
 * Electron main process: wraps the existing Node.js server in a desktop app.
 * Features: BrowserWindow, System Tray, Auto-start on Windows login.
 */

const { app, BrowserWindow, Tray, Menu, nativeImage, shell, dialog, ipcMain } = require('electron');
const path = require('path');
const fs   = require('fs');

const IS_DEV = !app.isPackaged;

// ── Resolve .env path ────────────────────────────────────────────────────────
// Dev  : project root/.env
// Prod : same folder as the .exe (so user can edit it easily)
const envPath = IS_DEV
  ? path.join(__dirname, '.env')
  : path.join(path.dirname(app.getPath('exe')), '.env');

// Load env vars BEFORE requiring server.js (server.js checks _DOTENV_LOADED)
require('dotenv').config({ path: envPath });
process.env._DOTENV_LOADED = '1';

// ── State ────────────────────────────────────────────────────────────────────
let mainWindow  = null;
let tray        = null;
let serverPort  = parseInt(process.env.PORT || '3000', 10);

// ── Icon (programmatic green circle — no external PNG needed) ────────────────
function makeIcon(size) {
  const buf = Buffer.alloc(size * size * 4);
  const c = size / 2;
  const r = size / 2 - 1;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.sqrt((x - c) ** 2 + (y - c) ** 2);
      const i = (y * size + x) * 4;
      if (d <= r) {
        // Green #3FB950
        buf[i]   = 63;
        buf[i+1] = 185;
        buf[i+2] = 80;
        buf[i+3] = 255;
      } else {
        buf[i+3] = 0; // transparent
      }
    }
  }
  return nativeImage.createFromBuffer(buf, { width: size, height: size });
}

// ── BrowserWindow ────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width:  1280,
    height: 820,
    minWidth:  800,
    minHeight: 500,
    icon: makeIcon(32),
    title: 'Logcat Streamer',
    backgroundColor: '#0d1117',
    show: false, // show after page loads to avoid white flash
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Hide menu bar (no File/Edit/View menus needed)
  mainWindow.setMenuBarVisibility(false);

  // Load the local server
  mainWindow.loadURL(`http://localhost:${serverPort}`);

  // Show window after content loads
  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Minimize to tray instead of closing
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

// ── System Tray ──────────────────────────────────────────────────────────────
function createTray() {
  tray = new Tray(makeIcon(16));
  tray.setToolTip('Logcat Streamer');

  // Rebuild menu so checkbox state stays in sync
  function buildMenu() {
    const autoStart = app.getLoginItemSettings().openAtLogin;
    return Menu.buildFromTemplate([
      { label: '📡 Logcat Streamer', enabled: false },
      { type: 'separator' },
      {
        label: 'Mở ứng dụng',
        click: () => { mainWindow.show(); mainWindow.focus(); },
      },
      {
        label: 'Mở trong trình duyệt',
        click: () => shell.openExternal(`http://localhost:${serverPort}`),
      },
      { type: 'separator' },
      {
        label: 'Tự khởi động cùng Windows',
        type: 'checkbox',
        checked: autoStart,
        click: (item) => {
          app.setLoginItemSettings({ openAtLogin: item.checked });
          tray.setContextMenu(buildMenu()); // refresh menu
        },
      },
      { type: 'separator' },
      {
        label: 'Thoát',
        click: () => { app.isQuitting = true; app.quit(); },
      },
    ]);
  }

  tray.setContextMenu(buildMenu());

  // Double-click tray icon → show window
  tray.on('double-click', () => { mainWindow.show(); mainWindow.focus(); });
}

// ── IPC: Save Dialog ────────────────────────────────────────────────────────
ipcMain.handle('show-save-dialog', async (_event, defaultName) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Lưu log',
    defaultPath: defaultName,
    filters: [
      { name: 'Text Files', extensions: ['txt'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (result.canceled) return null;
  return result.filePath;
});

// ── App Init ─────────────────────────────────────────────────────────────────
async function start() {
  // Start backend server and wait for it to be ready
  const { serverReady } = require('./src/server.js');
  serverPort = await serverReady;

  createWindow();
  createTray();
}

app.whenReady().then(start).catch((err) => {
  console.error('[Electron] Failed to start:', err);
  app.quit();
});

// Keep app alive in tray when all windows are closed
app.on('window-all-closed', (e) => e.preventDefault());

// Set flag before quit so close handler skips hide
app.on('before-quit', () => { app.isQuitting = true; });
