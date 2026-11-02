const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

ipcMain.handle('load-data', () => ({
  nextId: 1,
  nextAdm: 1001,
  settings: { currentSession: '2026–27', admissionPrefix: 'MDC-' },
  students: [],
  classes: ['1', '2'],
  classSections: { '1': [{ name: 'A' }] }
}));
ipcMain.handle('save-data', () => ({ success: true }));
ipcMain.handle('get-data-path', () => 'sandbox/data.json');

app.whenReady().then(async () => {
  const sizes = [
    { w: 1920, h: 1080 },
    { w: 1600, h: 900 },
    { w: 1536, h: 1024 },
    { w: 1366, h: 768 },
    { w: 1280, h: 720 }
  ];

  const win = new BrowserWindow({
    width: 1920,
    height: 1080,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../src/preload.js')
    }
  });

  await win.loadFile(path.join(__dirname, '../src/index.html'));
  await new Promise(r => setTimeout(r, 600));

  await win.webContents.executeJavaScript(`openAddStudent();`);

  for (const s of sizes) {
    win.setSize(s.w, s.h);
    await new Promise(r => setTimeout(r, 400));
    const layout = await win.webContents.executeJavaScript(`
      (() => {
        const bodyH = document.body.offsetHeight;
        const panelH = document.querySelector('.stu-main-panel')?.offsetHeight;
        const hasHScroll = document.body.scrollWidth > document.body.clientWidth;
        const caScrollH = document.querySelector('.ca')?.scrollHeight;
        const caClientH = document.querySelector('.ca')?.clientHeight;
        return { bodyH, panelH, hasHScroll, caScrollH, caClientH };
      })()
    `);
    console.log('Viewport ' + s.w + 'x' + s.h + ': Panel=' + layout.panelH + 'px, HScroll=' + layout.hasHScroll + ', CaScrollH=' + layout.caScrollH + 'px, CaClientH=' + layout.caClientH + 'px');
  }
  win.destroy();
  app.quit();
});
