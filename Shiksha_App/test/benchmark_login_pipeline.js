
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const prodDbPath = 'C:/Users/HP/OneDrive/Documents/MDConvent_SMS/school_data.json';
const prodDB = JSON.parse(fs.readFileSync(prodDbPath, 'utf8'));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'src', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Attach timings to console messages
  win.webContents.on('console-message', (e, level, msg) => {
    if (msg.startsWith('[TIMING]')) {
      console.log(msg);
    }
  });

  // Track IPC timing
  ipcMain.handle('load-data', () => {
    const t0 = performance.now();
    // Return deep copy of prodDB
    const res = JSON.parse(JSON.stringify(prodDB));
    const t1 = performance.now();
    console.log(`[TIMING] main:load-data took ${(t1 - t0).toFixed(2)}ms (size: ${(JSON.stringify(res).length/1024/1024).toFixed(2)} MB)`);
    return res;
  });

  ipcMain.handle('auth-get-status', () => ({
    isAuthenticated: true,
    mustChangePassword: false,
    user: { username: 'admin', role: 'admin' }
  }));

  ipcMain.handle('get-data-path', () => prodDbPath);
  ipcMain.handle('save-data', () => ({ success: true }));

  console.log('--- STARTING TIMING TEST ---');
  const tStart = performance.now();

  // 1. Load login.html
  await win.loadFile(path.join(__dirname, '..', 'src', 'login.html'));
  const tLoginLoaded = performance.now();
  console.log(`[TIMING] login.html load took ${(tLoginLoaded - tStart).toFixed(2)}ms`);

  // 2. Measure login click to authLogin IPC
  const tAuthStart = performance.now();
  // Simulate auth-login IPC
  const authRes = await new Promise(resolve => {
    // mock authLogin
    resolve({ success: true });
  });
  const tAuthDone = performance.now();
  console.log(`[TIMING] auth verification took ${(tAuthDone - tAuthStart).toFixed(2)}ms`);

  // 3. Navigation to index.html
  const tNavStart = performance.now();
  await win.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
  const tNavDone = performance.now();
  console.log(`[TIMING] index.html loadFile took ${(tNavDone - tNavStart).toFixed(2)}ms`);

  // 4. Measure dashboard initialization in renderer
  const renderTimings = await win.webContents.executeJavaScript(`
    (async () => {
      // In renderer, app.js already ran init() because of the script tag!
      // Let's measure each function individually!
      const t0 = performance.now();
      await loadDB();
      const tLoadDB = performance.now();

      invalidatePerformanceIndices();
      ensurePerformanceIndices();
      const tIndices = performance.now();

      fillDDs();
      const tFillDDs = performance.now();

      renderDB();
      const tRenderDB = performance.now();

      return {
        loadDB: (tLoadDB - t0).toFixed(2),
        ensureIndices: (tIndices - tLoadDB).toFixed(2),
        fillDDs: (tFillDDs - tIndices).toFixed(2),
        renderDB: (tRenderDB - tFillDDs).toFixed(2),
        totalInit: (tRenderDB - t0).toFixed(2)
      };
    })()
  `);

  console.log('[TIMING] Renderer Init breakdown:', JSON.stringify(renderTimings, null, 2));

  const tTotal = performance.now();
  console.log(`[TIMING] Total pipeline took ${(tTotal - tStart).toFixed(2)}ms`);

  app.quit();
});
