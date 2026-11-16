const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const artifactDir = path.resolve('C:/Users/HP/.gemini/antigravity/brain/09fab391-3131-4e63-9822-ed522316ce4e');
const prodDbPath = 'C:\\Users\\HP\\OneDrive\\Documents\\MDConvent_SMS\\school_data.json';
const prodDB = JSON.parse(fs.readFileSync(prodDbPath, 'utf8'));

ipcMain.handle('load-data', () => JSON.parse(JSON.stringify(prodDB)));
ipcMain.handle('save-data', (e, d) => ({ success: true }));
ipcMain.handle('get-data-path', () => prodDbPath);
ipcMain.handle('export-csv', () => ({ success: true }));
ipcMain.handle('print-content', () => ({ success: true }));
ipcMain.handle('export-pdf', () => ({ success: true }));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    webPreferences: {
      preload: path.resolve(__dirname, '../src/preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  await win.loadFile(path.resolve(__dirname, '../src/index.html'));
  await new Promise(r => setTimeout(r, 1500));

  // 1. Current Month Screenshot
  const curMonthImg = await win.webContents.capturePage();
  const curMonthPath = path.join(artifactDir, 'screenshot_dashboard_current_month_kpi_fixed.png');
  fs.writeFileSync(curMonthPath, curMonthImg.toPNG());
  console.log('Saved:', curMonthPath);

  // 2. Switch to Select Month & Year (September 2026)
  await win.webContents.executeJavaScript(`
    (() => {
      const selMode = document.getElementById('db_period_mode');
      selMode.value = 'select_month';
      onDashboardPeriodChange();

      const moSel = document.getElementById('db_mo');
      if (moSel) moSel.value = 'September';
      const yrSel = document.getElementById('db_yr');
      if (yrSel) yrSel.value = '2026';
      renderDB();
    })()
  `);
  await new Promise(r => setTimeout(r, 600));

  const selMonthImg = await win.webContents.capturePage();
  const selMonthPath = path.join(artifactDir, 'screenshot_dashboard_select_month_kpi_fixed.png');
  fs.writeFileSync(selMonthPath, selMonthImg.toPNG());
  console.log('Saved:', selMonthPath);

  // Measure verification details
  const details = await win.webContents.executeJavaScript(`
    (() => {
      const ca = document.querySelector('.ca');
      const db = document.getElementById('page-dashboard');
      const btns = Array.from(document.querySelectorAll('.qa-buttons button')).map(b => ({
        text: b.textContent.trim(),
        height: b.offsetHeight
      }));
      const kpis = Array.from(document.querySelectorAll('.kpi-card')).map(c => ({
        val: c.querySelector('.kpi-val').innerText.trim(),
        title: c.querySelector('.kpi-title').innerText.trim(),
        sub: c.querySelector('.kpi-sub').innerText.trim(),
        hasEllipsis: c.querySelector('.kpi-sub').scrollWidth > c.querySelector('.kpi-sub').clientWidth
      }));

      const qa = document.querySelector('.qa-card-body');
      const ov = document.querySelector('.qa-overview');
      const mid = document.querySelector('.db-row-middle');
      const btm = document.querySelector('.db-row-bottom');

      return {
        caScrollH: ca.scrollHeight,
        caClientH: ca.clientHeight,
        hasScrollbar: ca.scrollHeight > ca.clientHeight,
        midH: mid ? mid.clientHeight : 0,
        btmH: btm ? btm.clientHeight : 0,
        qaH: qa ? qa.clientHeight : 0,
        qaScrollH: qa ? qa.scrollHeight : 0,
        ovH: ov ? ov.clientHeight : 0,
        btns,
        kpis
      };
    })()
  `);

  console.log('Verification Details:', JSON.stringify(details, null, 2));

  app.quit();
});
