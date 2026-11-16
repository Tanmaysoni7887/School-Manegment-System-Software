const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const demoDataPath = path.resolve(__dirname, '../../DEMO_TEST_KIT/demo_school_data_large.json');
let demoDB = {};
try {
  demoDB = JSON.parse(fs.readFileSync(demoDataPath, 'utf8'));
} catch (e) {
  demoDB = { students: [], classes: [], settings: { schoolName: 'MD Convent Public School' } };
}

ipcMain.handle('load-data', () => JSON.parse(JSON.stringify(demoDB)));
ipcMain.handle('save-data', (e, d) => ({ success: true }));
ipcMain.handle('get-data-path', () => 'C:\\Users\\HP\\OneDrive\\Documents\\MDConvent_SMS\\school_data.json');
ipcMain.handle('list-backups', () => ([]));
ipcMain.handle('backup-data', () => ({ success: true, filePath: 'C:\\Users\\HP\\OneDrive\\Documents\\MDConvent_SMS\\Backups\\test_backup.json' }));
ipcMain.handle('restore-data', () => ({ data: demoDB }));
ipcMain.handle('export-csv', () => ({ success: true }));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1650,
    height: 927,
    useContentSize: true,
    show: false,
    webPreferences: {
      preload: path.resolve(__dirname, '../src/preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  await win.loadFile(path.resolve(__dirname, '../src/index.html'));
  await new Promise(r => setTimeout(r, 1500));

  // Navigate to Data & Backup
  const navInfo = await win.webContents.executeJavaScript(`
    (() => {
      showPage('reports');
      const activePages = Array.from(document.querySelectorAll('.page.active')).map(p => p.id);
      const pr = document.getElementById('page-reports');
      const pd = document.getElementById('page-dashboard');
      return {
        curActivePage: typeof curActivePage !== 'undefined' ? curActivePage : 'undefined',
        activePages: activePages,
        reportsRect: pr ? pr.getBoundingClientRect() : null,
        dashRect: pd ? pd.getBoundingClientRect() : null,
        reportsDisplay: pr?.style.display,
        dashDisplay: pd?.style.display,
        reportsOffsetHeight: pr?.offsetHeight,
        dashOffsetHeight: pd?.offsetHeight
      };
    })()
  `);
  console.log('Nav debug info:', navInfo);
  await new Promise(r => setTimeout(r, 600));

  console.log('=== TEST SUITE: ORIGINAL DATA & BACKUP RESTORATION VERIFICATION ===\n');

  const result = await win.webContents.executeJavaScript(`
    (() => {
      const tests = [];
      const assert = (name, cond, details = '') => {
        tests.push({ name, pass: !!cond, details });
        console.log((cond ? '  ✓ ' : '  ✗ ') + name + (details ? ': ' + details : ''));
      };

      const pageReports = document.getElementById('page-reports');
      assert('page-reports exists and becomes active', pageReports && pageReports.classList.contains('active'));

      // 2. Topbar should be visible on original page
      const topbar = document.querySelector('.topbar');
      assert('Top bar is visible on original page', topbar && getComputedStyle(topbar).display !== 'none');

      // 3. Body should not have is-data-backup class
      assert('Body does not have redesign is-data-backup class', !document.body.classList.contains('is-data-backup'));

      // 4. Header title and subtitle
      const title = document.querySelector('.erp-page-title');
      const subtitle = document.querySelector('.erp-page-subtitle');
      assert('Header title matches original', title && title.textContent.trim() === 'Data Exports & Backup', title?.textContent);
      assert('Header subtitle matches original', subtitle && subtitle.textContent.includes('Export verified spreadsheet CSVs'), subtitle?.textContent);

      // 5. Panel 1: Data Exports (CSV)
      const csvPanel = document.querySelector('.erp-panel-card');
      assert('CSV Exports panel exists', !!csvPanel);
      const csvBtn1 = document.querySelector('button[onclick*="expSt"]');
      const csvBtn2 = document.querySelector('button[onclick*="expFe"]');
      assert('Export Students (CSV) button exists', !!csvBtn1);
      assert('Export Fee Collection Report (CSV) button exists', !!csvBtn2);

      // 6. Panel 2: Backup & Restore
      const panels = document.querySelectorAll('.erp-panel-card');
      const backupPanel = panels[1];
      assert('Backup & Data Protection panel exists', !!backupPanel);
      const backupBtn = document.querySelector('button[onclick*="doBackup"]');
      const restoreBtn = document.querySelector('button[onclick*="doRestore"]');
      assert('Create Full JSON Backup button exists', !!backupBtn);
      assert('Restore from Backup File button exists', !!restoreBtn);

      // 7. Active Data File display (#dpInfo)
      const dpInfo = document.getElementById('dpInfo');
      assert('Active Database File info exists', dpInfo && dpInfo.textContent.includes('school_data.json'), dpInfo?.textContent);

      // 8. Viewport & Dimensions
      const ca = document.querySelector('.ca');
      assert('No horizontal scrolling', ca.scrollWidth <= ca.clientWidth, 'scrollWidth: ' + ca.scrollWidth + ', clientWidth: ' + ca.clientWidth);

      return {
        tests,
        passed: tests.filter(t => t.pass).length,
        total: tests.length,
        dpInfoText: dpInfo ? dpInfo.textContent : ''
      };
    })()
  `);

  console.log('\n=== VERIFICATION RESULTS ===');
  console.log('Passed: ' + result.passed + ', Failed: ' + (result.total - result.passed));
  console.log('Test details:', result.tests);

  // Capture screenshot of restored page
  const screenshot = await win.webContents.capturePage();
  const screenshotPath = 'C:\\Users\\HP\\.gemini\\antigravity\\brain\\09fab391-3131-4e63-9822-ed522316ce4e\\screenshot_data_backup_restored.png';
  fs.writeFileSync(screenshotPath, screenshot.toPNG());
  console.log('\nScreenshot saved: ' + screenshotPath);

  app.quit();
});
