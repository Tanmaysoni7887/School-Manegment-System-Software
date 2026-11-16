const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

const artifactDir = path.resolve('C:/Users/HP/.gemini/antigravity/brain/09fab391-3131-4e63-9822-ed522316ce4e');
const prodDbPath = 'C:\\Users\\HP\\OneDrive\\Documents\\MDConvent_SMS\\school_data.json';
const prodDB = JSON.parse(fs.readFileSync(prodDbPath, 'utf8'));

// Mock IPC
ipcMain.handle('load-data', () => JSON.parse(JSON.stringify(prodDB)));
ipcMain.handle('save-data', (e, d) => ({ success: true }));
ipcMain.handle('get-data-path', () => prodDbPath);
ipcMain.handle('export-csv', () => ({ success: true }));
ipcMain.handle('print-content', () => ({ success: true }));
ipcMain.handle('export-pdf', () => ({ success: true }));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1360,
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

  console.log('=== TEST 1: Quick Actions Buttons Content & Labels ===');
  const buttonsInfo = await win.webContents.executeJavaScript(`
    (() => {
      const btns = Array.from(document.querySelectorAll('.qa-buttons button'));
      return btns.map(b => ({
        text: b.textContent.trim(),
        onclick: b.getAttribute('onclick'),
        height: b.offsetHeight,
        className: b.className
      }));
    })()
  `);
  console.log('Buttons found:', buttonsInfo);

  assert.strictEqual(buttonsInfo.length, 5, 'Must have exactly 5 Quick Actions buttons');
  assert.strictEqual(buttonsInfo[0].text, 'Add New Student');
  assert.strictEqual(buttonsInfo[1].text, 'Collect Fee');
  assert.strictEqual(buttonsInfo[2].text, 'Fee Reminders');
  assert.strictEqual(buttonsInfo[3].text, 'Financial Reports');
  assert.strictEqual(buttonsInfo[4].text, 'Data & Backup');
  console.log('✓ PASS: All 5 button labels match requirements exactly.');

  console.log('\n=== TEST 2: Dashboard Viewport & Zero-Scroll Verification ===');
  const scrollInfo = await win.webContents.executeJavaScript(`
    (() => {
      const ca = document.querySelector('.ca');
      const dbPage = document.getElementById('page-dashboard');
      return {
        caScrollHeight: ca.scrollHeight,
        caClientHeight: ca.clientHeight,
        caScrollWidth: ca.scrollWidth,
        caClientWidth: ca.clientWidth,
        caOverflowY: window.getComputedStyle(ca).overflowY,
        dbScrollHeight: dbPage.scrollHeight,
        dbClientHeight: dbPage.clientHeight,
        dbOverflow: window.getComputedStyle(dbPage).overflow
      };
    })()
  `);
  console.log('Scroll metrics:', scrollInfo);
  assert.ok(scrollInfo.caScrollHeight <= scrollInfo.caClientHeight + 2, 'No vertical scroll on .ca container');
  assert.ok(scrollInfo.caScrollWidth <= scrollInfo.caClientWidth, 'No horizontal scroll on .ca container');
  console.log('✓ PASS: Zero scrollbar verified on Dashboard viewport.');

  console.log('\n=== TEST 3: Navigation Actions Verification ===');

  // Test 3A: Click Financial Reports
  console.log('Testing Financial Reports click...');
  await win.webContents.executeJavaScript(`
    const finBtn = Array.from(document.querySelectorAll('.qa-buttons button')).find(b => b.textContent.includes('Financial Reports'));
    finBtn.click();
  `);
  await new Promise(r => setTimeout(r, 400));
  const isFinPageActive = await win.webContents.executeJavaScript(`
    document.getElementById('page-financial-reports').classList.contains('active') &&
    document.getElementById('page-financial-reports').style.display !== 'none'
  `);
  assert.strictEqual(isFinPageActive, true, 'Financial Reports page must be active after clicking Financial Reports button');
  console.log('✓ PASS: Financial Reports button successfully navigates to Financial Reports page.');

  // Return to Dashboard
  await win.webContents.executeJavaScript(`showPage('dashboard');`);
  await new Promise(r => setTimeout(r, 400));

  // Test 3B: Click Data & Backup
  console.log('Testing Data & Backup click...');
  await win.webContents.executeJavaScript(`
    const dataBtn = Array.from(document.querySelectorAll('.qa-buttons button')).find(b => b.textContent.includes('Data & Backup'));
    dataBtn.click();
  `);
  await new Promise(r => setTimeout(r, 400));
  const isReportsPageActive = await win.webContents.executeJavaScript(`
    document.getElementById('page-reports').classList.contains('active') &&
    document.getElementById('page-reports').style.display !== 'none'
  `);
  assert.strictEqual(isReportsPageActive, true, 'Data & Backup page (page-reports) must be active after clicking Data & Backup button');
  console.log('✓ PASS: Data & Backup button successfully navigates to Data & Backup page.');

  // Return to Dashboard for final screenshot
  await win.webContents.executeJavaScript(`showPage('dashboard');`);
  await new Promise(r => setTimeout(r, 400));

  const img = await win.capturePage();
  fs.writeFileSync(path.join(artifactDir, 'screenshot_dashboard_quick_actions_updated.png'), img.toPNG());
  console.log('✓ Saved screenshot_dashboard_quick_actions_updated.png');

  console.log('\n=== ALL QUICK ACTIONS TESTS PASSED SUCCESSFULLY! ===\n');
  app.quit();
});
