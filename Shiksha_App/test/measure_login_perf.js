const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const prodDbPath = 'C:/Users/HP/OneDrive/Documents/MDConvent_SMS/school_data.json';
const { createAuthManager } = require('../auth');
const authManager = createAuthManager();

let _cachedDb = null;
let _preloadPromise = null;

async function preloadDB() {
  const t0 = performance.now();
  const raw = await fs.promises.readFile(prodDbPath, 'utf8');
  _cachedDb = JSON.parse(raw);
  console.log(`[PERF] Background preload finished in ${(performance.now() - t0).toFixed(2)}ms`);
}

app.whenReady().then(async () => {
  // Start preload immediately on app ready
  _preloadPromise = preloadDB();

  const win = new BrowserWindow({
    width: 1650,
    height: 900,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'src', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  let tClick = 0;

  ipcMain.handle('load-data', async () => {
    const t0 = performance.now();
    if (_preloadPromise) {
      await _preloadPromise;
      _preloadPromise = null;
    }
    console.log(`[PERF] main:load-data took ${(performance.now() - t0).toFixed(2)}ms (from cache)`);
    return _cachedDb;
  });

  ipcMain.handle('get-data-path', () => prodDbPath);
  ipcMain.handle('save-data', () => ({ success: true }));
  ipcMain.handle('auth-get-status', () => authManager.getAuthStatus());
  ipcMain.handle('auth-login', async (e, creds) => {
    const t0 = performance.now();
    const res = authManager.login(creds.username, creds.password);
    console.log(`[PERF] main:authManager.login took ${(performance.now() - t0).toFixed(2)}ms`);
    if (res.success) {
      win.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
    }
    return res;
  });

  console.log('[PERF] Loading login.html...');
  await win.loadFile(path.join(__dirname, '..', 'src', 'login.html'));

  // Simulate user typing for 200ms
  await new Promise(r => setTimeout(r, 200));

  console.log('[PERF] Submitting login form...');
  tClick = performance.now();
  await win.webContents.executeJavaScript(`
    document.getElementById('loginUsername').value = 'admin';
    document.getElementById('loginPassword').value = 'admin123';
    document.getElementById('formAdminLogin').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  `);

  // Wait until we see index.html finish init()
  await new Promise(resolve => {
    const check = setInterval(async () => {
      try {
        const isReady = await win.webContents.executeJavaScript(`
          Boolean(window.DB && window.DB.students && window.DB.students.length > 0)
        `);
        if (isReady) {
          clearInterval(check);
          console.log(`[PERF] >>> DASHBOARD READY in ${(performance.now() - tClick).toFixed(2)}ms total! <<<`);
          resolve();
        }
      } catch (_) {}
    }, 20);
  });

  app.quit();
});
