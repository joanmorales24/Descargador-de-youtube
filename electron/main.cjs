// Electron main process (CommonJS)
const { app, BrowserWindow, shell, globalShortcut } = require('electron');
const path = require('path');
const http = require('http');

let logFilePath = null;
let mainWindow;

async function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  return new Promise((resolve) => {
    const tryOnce = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode === 200) return resolve(true);
        if (Date.now() - start > timeoutMs) return resolve(false);
        setTimeout(tryOnce, 300);
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) return resolve(false);
        setTimeout(tryOnce, 300);
      });
    };
    tryOnce();
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false,
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    mainWindow.loadURL(devUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
  // In production, serve UI via local server to be same-origin with API
  const ok = await waitForServer('http://localhost:4000/api/health');
  const uiUrl = 'http://localhost:4000/';
    if (ok) {
      mainWindow.loadURL(uiUrl);
    } else {
      // Load fallback page with auto-retry and instructions
      const fallback = path.join(__dirname, 'fallback.html');
      mainWindow.loadFile(fallback).catch(() => {
        // As ultimate fallback, show an error box
        const { dialog } = require('electron');
        dialog.showErrorBox('Servidor no disponible', 'No se pudo contactar al servidor local en http://localhost:4000. Intenta cerrar y abrir la app.');
      });
    }
  }

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Log load errors (helps diagnose failed to fetch / bad routes)
  mainWindow.webContents.on('did-fail-load', (_e, errorCode, errorDesc, validatedURL) => {
    console.error('Renderer failed load:', { errorCode, errorDesc, validatedURL });
  });

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url === 'logs://server' && logFilePath) {
      try { shell.openPath(logFilePath); } catch {}
      return { action: 'deny' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function startLocalServer() {
  try {
    // In dev, the server runs via script; in prod, require compiled server
    if (app.isPackaged) {
  // Forzar puerto conocido
  process.env.PORT = process.env.PORT || '4000';
      // Simple log tee to file for diagnostics
      try {
        const fs = require('fs');
        const ud = app.getPath('userData');
        logFilePath = path.join(ud, 'server.log');
        const out = fs.createWriteStream(logFilePath, { flags: 'a' });
        const stamp = () => new Date().toISOString();
        const origLog = console.log.bind(console);
        const origErr = console.error.bind(console);
        console.log = (...args) => { try { out.write(`[LOG ${stamp()}] ` + args.join(' ') + '\n'); } catch {} origLog(...args); };
        console.error = (...args) => { try { out.write(`[ERR ${stamp()}] ` + args.join(' ') + '\n'); } catch {} origErr(...args); };
        console.log('[main] Server logs at', logFilePath);
      } catch {}
      const serverEntry = path.join(__dirname, '..', 'server', 'dist', 'index.js');
      // Load server with dynamic import to support ESM/CJS
      import(serverEntry).catch((e) => {
        console.error('[main] dynamic import failed, trying require:', e?.message || e);
        try { require(serverEntry); } catch (e2) { console.error('[main] require fallback failed:', e2?.message || e2); }
      });
    }
    return true;
  } catch (err) {
    console.error('Failed to start local server:', err);
    return false;
  }
}

app.whenReady().then(async () => {
  const ok = startLocalServer();
  await createWindow();

  // Allow opening DevTools in production with Cmd/Ctrl+Alt+I
  try {
    globalShortcut.register(process.platform === 'darwin' ? 'Command+Alt+I' : 'Control+Alt+I', () => {
      if (mainWindow) {
        if (mainWindow.webContents.isDevToolsOpened()) mainWindow.webContents.closeDevTools();
        else mainWindow.webContents.openDevTools({ mode: 'detach' });
      }
    });
  } catch {}

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  try { globalShortcut.unregisterAll(); } catch {}
});
