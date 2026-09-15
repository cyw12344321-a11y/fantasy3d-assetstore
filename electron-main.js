const { app, BrowserWindow, dialog } = require('electron');
const fs = require('fs');
const path = require('path');

// Optional local launch paths let packaged smoke tests leave real user data alone.
// Electron requires setPath to run before ready; only existing absolute folders qualify.
for (const [switchName, pathName] of [['user-data-dir', 'userData'], ['demo-download-dir', 'downloads']]) {
  if (!app.commandLine.hasSwitch(switchName)) continue;
  const directory = app.commandLine.getSwitchValue(switchName);
  try {
    if (path.isAbsolute(directory) && fs.statSync(directory).isDirectory()) app.setPath(pathName, directory);
  } catch { /* Invalid overrides retain Electron's normal user paths. */ }
}

const WINDOW_TITLE = 'Fantasy3D 资产商店';
let mainWindow = null;
let backend = null;
let startupPromise = Promise.resolve();
let shutdownPromise = null;
let isQuitting = false;
let shutdownComplete = false;

function appUrl(value) {
  if (typeof value !== 'string' || !value) return null;
  try {
    const url = new URL(value, backend.url);
    const origin = new URL(backend.url).origin;
    return url.protocol === 'http:' && url.origin === origin &&
      !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
}

function reportStartupFailure(error) {
  if (isQuitting) return;
  dialog.showErrorBox(
    `${WINDOW_TITLE}启动失败`,
    `无法启动本地商店，请关闭应用后重试。\n\n${error.message || String(error)}`
  );
  app.quit();
}

function reserveDownloadPath(filename) {
  const directory = app.getPath('downloads');
  fs.mkdirSync(directory, { recursive: true });
  const safeName = /^Fantasy3D-[a-zA-Z0-9_-]+-DEMO\.txt$/.test(filename)
    ? filename : 'Fantasy3D-asset-DEMO.txt';
  const stem = safeName.slice(0, -4);
  for (let suffix = 0; ; suffix += 1) {
    const destination = path.join(directory, `${stem}${suffix ? ` (${suffix})` : ''}.txt`);
    try {
      // Reserve atomically so simultaneous downloads cannot overwrite each other.
      fs.closeSync(fs.openSync(destination, 'wx'));
      return destination;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
}

function notifyDownload(window, detail) {
  if (isQuitting || window.isDestroyed()) return;
  window.webContents.executeJavaScript(
    `window.dispatchEvent(new CustomEvent('fantasy3d-download', { detail: ${JSON.stringify(detail)} }));`
  ).catch((error) => console.error('下载提示显示失败:', error));
}

function configureDownloads(window) {
  const onDownload = (event, item, contents) => {
    if (contents !== window.webContents) return;
    const url = appUrl(item.getURL());
    if (!url || !url.pathname.startsWith('/api/download/') ||
        !item.getURLChain().every((value) => appUrl(value))) {
      event.preventDefault();
      return;
    }
    let destination;
    try {
      destination = reserveDownloadPath(item.getFilename());
      item.setSavePath(destination);
    } catch (error) {
      event.preventDefault();
      try { if (destination) fs.rmSync(destination, { force: true }); } catch (cleanupError) {
        console.error('未完成的演示下载清理失败:', cleanupError);
      }
      notifyDownload(window, { state: 'failed', message: `无法保存演示文件：${error.message}` });
      return;
    }
    item.once('done', (_event, state) => {
      if (state !== 'completed') {
        try { fs.rmSync(destination, { force: true }); } catch (error) {
          console.error('未完成的演示下载清理失败:', error);
        }
      }
      notifyDownload(window, {
        state: state === 'completed' ? 'completed' : 'failed',
        path: destination,
        message: state === 'completed' ? `演示文件已保存：${destination}` : '演示下载未完成，请重试。'
      });
    });
  };
  const downloadSession = window.webContents.session;
  downloadSession.on('will-download', onDownload);
  window.once('closed', () => downloadSession.removeListener('will-download', onDownload));
}

async function createMainWindow() {
  const window = new BrowserWindow({
    width: 1300,
    height: 850,
    minWidth: 900,
    minHeight: 600,
    title: WINDOW_TITLE,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });
  mainWindow = window;
  configureDownloads(window);

  const guardNavigation = (event, url) => {
    if (!appUrl(event.url || url)) event.preventDefault();
  };
  window.webContents.on('will-navigate', guardNavigation);
  window.webContents.on('will-frame-navigate', guardNavigation);
  window.webContents.on('will-redirect', guardNavigation);
  window.webContents.setWindowOpenHandler(({ url: value }) => {
    const url = appUrl(value);
    if (url && !isQuitting && !window.isDestroyed()) {
      if (url.pathname.startsWith('/api/download/')) {
        // Keep target="_blank" downloads usable without opening an empty window.
        window.webContents.downloadURL(url.href);
      } else {
        window.loadURL(url.href).catch((error) => {
          if (!isQuitting) {
            dialog.showErrorBox('页面打开失败', error.message || String(error));
          }
        });
      }
    }
    return { action: 'deny' };
  });
  window.on('page-title-updated', (event) => event.preventDefault());
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null;
  });

  await window.loadURL(backend.url);
  if (!isQuitting && !window.isDestroyed()) window.show();
}

async function startApplication() {
  // Run inside Electron's bundled Node runtime, including when packaged in asar.
  // Port 0 lets the OS choose a free port; all writes go outside the installation.
  backend = await require('./server').startServer({
    port: 0,
    dataDir: path.join(app.getPath('userData'), 'store-data')
  });
  if (!isQuitting) await createMainWindow();
}

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed() || isQuitting) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', focusMainWindow);
  app.on('window-all-closed', () => app.quit());
  app.on('activate', () => {
    if (mainWindow) focusMainWindow();
    else if (backend && !isQuitting) createMainWindow().catch(reportStartupFailure);
  });

  app.on('before-quit', (event) => {
    if (shutdownComplete) return;
    event.preventDefault();
    isQuitting = true;
    if (shutdownPromise) return;
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.stop();

    shutdownPromise = (async () => {
      // Closing during startup must still close a server that finishes listening.
      try { await startupPromise; } catch { /* Reported by the startup handler. */ }
      if (backend) {
        await backend.close();
        backend = null;
      }
    })().catch((error) => {
      console.error('本地商店关闭失败:', error);
    }).finally(() => {
      shutdownComplete = true;
      app.quit();
    });
  });

  app.whenReady().then(() => {
    if (isQuitting) return;
    startupPromise = startApplication();
    startupPromise.catch(reportStartupFailure);
  }).catch(reportStartupFailure);
}
