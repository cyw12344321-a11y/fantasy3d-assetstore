const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'electron-main.js'), 'utf8');
const flush = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function event(url) {
  return { url, prevented: false, preventDefault() { this.prevented = true; } };
}

// Run the actual main entry point with Electron's event surface mocked. No GUI,
// server process, global Node dependency, or files in the user's Downloads open.
function harness(options = {}) {
  const ready = deferred();
  const listening = deferred();
  const windows = [], starts = [], dialogs = [], downloads = [], notices = [];
  const files = new Set();
  const session = new EventEmitter();
  const app = new EventEmitter();
  const paths = new Map();
  let closeCalls = 0, exits = 0;
  app.commandLine = {
    hasSwitch: (name) => Object.hasOwn(options.switches || {}, name),
    getSwitchValue: (name) => options.switches[name]
  };
  app.requestSingleInstanceLock = () => options.primary !== false;
  app.whenReady = () => ready.promise;
  app.getPath = (name) => paths.get(name) || path.join('mock-user', name);
  app.setPath = (name, directory) => paths.set(name, directory);
  app.quit = () => {
    const quitting = event();
    app.emit('before-quit', quitting);
    if (!quitting.prevented) exits += 1;
  };
  const backend = {
    url: 'http://127.0.0.1:49152',
    close: async () => { closeCalls += 1; await options.closeGate; }
  };
  class BrowserWindow extends EventEmitter {
    constructor(settings) {
      super();
      this.settings = settings;
      this.loaded = [];
      this.shown = 0;
      this.focused = 0;
      this.restored = 0;
      this.stopped = 0;
      this.destroyed = false;
      this.minimized = false;
      this.webContents = new EventEmitter();
      this.webContents.session = session;
      this.webContents.setWindowOpenHandler = (handler) => { this.openHandler = handler; };
      this.webContents.downloadURL = (url) => downloads.push(url);
      this.webContents.executeJavaScript = async (source) => { notices.push(source); };
      this.webContents.stop = () => { this.stopped += 1; options.onStop?.(); };
      windows.push(this);
    }
    loadURL(url) { this.loaded.push(url); return options.load?.(url) || Promise.resolve(); }
    isDestroyed() { return this.destroyed; }
    isMinimized() { return this.minimized; }
    restore() { this.restored += 1; this.minimized = false; }
    show() { this.shown += 1; }
    focus() { this.focused += 1; }
  }
  vm.runInNewContext(mainSource, {
    URL,
    console: { error() {} },
    require(name) {
      if (name === 'electron') return {
        app, BrowserWindow,
        dialog: { showErrorBox: (...args) => dialogs.push(args) }
      };
      if (name === './server') return {
        startServer: (settings) => { starts.push(settings); return listening.promise; }
      };
      if (name === 'path') return path;
      if (name === 'fs') return {
        statSync(directory) {
          if (!options.existingDirectories?.includes(directory)) throw new Error('missing directory');
          return { isDirectory: () => true };
        },
        mkdirSync() {},
        openSync(destination, flags) {
          assert.equal(flags, 'wx');
          if (files.has(destination)) throw Object.assign(new Error('exists'), { code: 'EEXIST' });
          files.add(destination);
          return 1;
        },
        closeSync() {},
        rmSync(destination) { files.delete(destination); }
      };
      throw new Error(`Unexpected dependency: ${name}`);
    }
  }, { filename: 'electron-main.js' });
  return {
    app, ready, listening, backend, windows, starts, dialogs, downloads, notices, session, files,
    get closeCalls() { return closeCalls; },
    get exits() { return exits; },
    async boot() { ready.resolve(); await flush(); listening.resolve(backend); await flush(); }
  };
}

test('starts the in-process backend on a free port before loading a secure window', async () => {
  const h = harness();
  h.ready.resolve();
  await flush();
  assert.equal(h.starts.length, 1);
  assert.equal(h.starts[0].port, 0);
  assert.equal(h.starts[0].dataDir, path.join('mock-user', 'userData', 'store-data'));
  assert.equal(h.windows.length, 0);
  h.listening.resolve(h.backend);
  await flush();
  const window = h.windows[0];
  assert.deepEqual(window.loaded, [h.backend.url]);
  assert.equal(window.settings.width, 1300);
  assert.equal(window.settings.height, 850);
  assert.equal(window.settings.title, 'Fantasy3D 资产商店');
  assert.equal(window.settings.webPreferences.nodeIntegration, false);
  assert.equal(window.settings.webPreferences.contextIsolation, true);
  assert.equal(window.settings.webPreferences.sandbox, true);
  assert.equal(window.shown, 1);
  const title = event();
  window.emit('page-title-updated', title);
  assert.equal(title.prevented, true);
  h.app.quit();
  await flush();
});

test('a second process exits without starting a server; an existing window is restored', async () => {
  const second = harness({ primary: false });
  await second.boot();
  assert.equal(second.starts.length, 0);
  assert.equal(second.windows.length, 0);
  assert.equal(second.exits, 1);
  const first = harness();
  await first.boot();
  first.windows[0].minimized = true;
  first.app.emit('second-instance');
  assert.equal(first.windows[0].restored, 1);
  assert.equal(first.windows[0].focused, 1);
  assert.equal(first.starts.length, 1);
  first.app.quit();
  await flush();
});

test('quitting during startup waits for and closes the server without creating a window', async () => {
  const h = harness();
  h.ready.resolve();
  await flush();
  h.app.quit();
  h.app.quit();
  assert.equal(h.exits, 0);
  h.listening.resolve(h.backend);
  await flush();
  assert.equal(h.windows.length, 0);
  assert.equal(h.closeCalls, 1);
  assert.equal(h.exits, 1);
});

test('closing the last window waits for one graceful server close', async () => {
  const gate = deferred();
  const h = harness({ closeGate: gate.promise });
  await h.boot();
  h.windows[0].destroyed = true;
  h.windows[0].emit('closed');
  assert.equal(h.session.listenerCount('will-download'), 0);
  h.app.emit('window-all-closed');
  h.app.quit();
  await flush();
  assert.equal(h.exits, 0);
  assert.equal(h.closeCalls, 1);
  gate.resolve();
  await flush();
  assert.equal(h.exits, 1);
});

test('quit aborts an unfinished page load instead of waiting indefinitely', async () => {
  const load = deferred();
  const h = harness({ load: () => load.promise, onStop: () => load.reject(new Error('aborted')) });
  await h.boot();
  assert.equal(h.windows[0].shown, 0);
  h.app.quit();
  await flush();
  assert.equal(h.windows[0].stopped, 1);
  assert.equal(h.closeCalls, 1);
  assert.equal(h.exits, 1);
  assert.equal(h.dialogs.length, 0);
});

test('server and initial page failures produce readable errors and exit cleanly', async () => {
  const failedServer = harness();
  failedServer.ready.resolve();
  await flush();
  failedServer.listening.reject(new Error('cannot write data directory'));
  await flush();
  assert.match(failedServer.dialogs[0][0], /启动失败/);
  assert.match(failedServer.dialogs[0][1], /cannot write data directory/);
  assert.equal(failedServer.windows.length, 0);
  assert.equal(failedServer.exits, 1);
  const failedPage = harness({ load: () => Promise.reject(new Error('connection failed')) });
  await failedPage.boot();
  assert.equal(failedPage.dialogs.length, 1);
  assert.equal(failedPage.closeCalls, 1);
  assert.equal(failedPage.exits, 1);
});

test('navigation and redirects stay on the exact local origin', async () => {
  const h = harness();
  await h.boot();
  const contents = h.windows[0].webContents;
  for (const kind of ['will-navigate', 'will-frame-navigate', 'will-redirect']) {
    for (const url of ['https://example.com', 'http://127.0.0.1:49153', 'file:///C:/test.txt',
      'javascript:alert(1)', 'http://user:pass@127.0.0.1:49152', 'http://127.0.0.1.example.com:49152']) {
      const navigation = event(url);
      contents.emit(kind, navigation);
      assert.equal(navigation.prevented, true, `${kind}: ${url}`);
    }
    for (const url of ['/orders.html', `${h.backend.url}/store.html`, 'about.html']) {
      const navigation = event(url);
      contents.emit(kind, navigation);
      assert.equal(navigation.prevented, false, `${kind}: ${url}`);
    }
  }
  h.app.quit();
  await flush();
});

test('new-window requests keep local pages and downloads working without opening windows', async () => {
  const h = harness();
  await h.boot();
  const window = h.windows[0];
  assert.equal(window.openHandler({ url: `${h.backend.url}/api/download/order-1` }).action, 'deny');
  assert.deepEqual(h.downloads, [`${h.backend.url}/api/download/order-1`]);
  assert.equal(window.openHandler({ url: '/orders.html' }).action, 'deny');
  assert.equal(window.loaded.at(-1), `${h.backend.url}/orders.html`);
  const loadCount = window.loaded.length;
  assert.equal(window.openHandler({ url: 'https://example.com/api/download/order-1' }).action, 'deny');
  assert.equal(window.loaded.length, loadCount);
  assert.equal(h.downloads.length, 1);
  assert.equal(h.windows.length, 1);
  h.app.quit();
  await flush();
});

function downloadItem(h, filename, url = `${h.backend.url}/api/download/order-1`) {
  const item = new EventEmitter();
  item.getURL = () => url;
  item.getURLChain = () => [url];
  item.getFilename = () => filename;
  item.setSavePath = (destination) => { item.destination = destination; };
  const download = event();
  h.session.emit('will-download', download, item, h.windows[0].webContents);
  return { item, download };
}

test('downloads save automatically with unique names and report their paths', async () => {
  const h = harness();
  await h.boot();
  const original = path.join('mock-user', 'downloads', 'Fantasy3D-p1-DEMO.txt');
  h.files.add(original);
  const first = downloadItem(h, 'Fantasy3D-p1-DEMO.txt');
  const second = downloadItem(h, 'Fantasy3D-p1-DEMO.txt');
  assert.equal(first.item.destination, path.join('mock-user', 'downloads', 'Fantasy3D-p1-DEMO (1).txt'));
  assert.equal(second.item.destination, path.join('mock-user', 'downloads', 'Fantasy3D-p1-DEMO (2).txt'));
  assert.equal(h.files.has(original), true);
  first.item.emit('done', event(), 'completed');
  assert.equal(h.files.has(first.item.destination), true);
  assert.match(h.notices[0], /fantasy3d-download/);
  assert.match(h.notices[0], /completed/);
  second.item.emit('done', event(), 'interrupted');
  assert.equal(h.files.has(second.item.destination), false);
  assert.equal(h.files.has(original), true);
  assert.match(h.notices[1], /failed/);
  h.app.quit();
  await flush();
});

test('downloads reject external origins and keep supplied filenames inside Downloads', async () => {
  const h = harness();
  await h.boot();
  const outside = downloadItem(h, 'external.txt', 'https://example.com/api/download/order-1');
  assert.equal(outside.download.prevented, true);
  assert.equal(outside.item.destination, undefined);
  const unsafe = downloadItem(h, '../../outside.exe');
  assert.equal(unsafe.item.destination, path.join('mock-user', 'downloads', 'Fantasy3D-asset-DEMO.txt'));
  unsafe.item.emit('done', event(), 'cancelled');
  assert.equal(h.files.size, 0);
  h.app.quit();
  await flush();
});

test('local launch overrides isolate data and downloads only for existing absolute folders', async () => {
  const dataDirectory = path.resolve('test-data');
  const downloadDirectory = path.resolve('test-downloads');
  const h = harness({
    switches: { 'user-data-dir': dataDirectory, 'demo-download-dir': downloadDirectory },
    existingDirectories: [dataDirectory, downloadDirectory]
  });
  assert.equal(h.app.getPath('userData'), dataDirectory);
  await h.boot();
  assert.equal(h.starts[0].dataDir, path.join(dataDirectory, 'store-data'));
  const download = downloadItem(h, 'Fantasy3D-p1-DEMO.txt');
  assert.equal(download.item.destination, path.join(downloadDirectory, 'Fantasy3D-p1-DEMO.txt'));
  download.item.emit('done', event(), 'cancelled');
  h.app.quit();
  await flush();
  const invalid = harness({ switches: { 'user-data-dir': 'relative-folder', 'demo-download-dir': path.resolve('missing-folder') } });
  await invalid.boot();
  assert.equal(invalid.starts[0].dataDir, path.join('mock-user', 'userData', 'store-data'));
  assert.equal(invalid.app.getPath('downloads'), path.join('mock-user', 'downloads'));
  invalid.app.quit();
  await flush();
});
