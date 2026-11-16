const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const artifactDir = path.resolve('C:/Users/HP/.gemini/antigravity/brain/09fab391-3131-4e63-9822-ed522316ce4e');
const demoDataPath = path.resolve(__dirname, '../DEMO_TEST_KIT/demo_school_data_large.json');
const demoDB = JSON.parse(fs.readFileSync(demoDataPath, 'utf8'));

// Mock IPC for Electron
ipcMain.handle('load-data', () => JSON.parse(JSON.stringify(demoDB)));
ipcMain.handle('save-data', (e, d) => ({ success: true }));
ipcMain.handle('get-data-path', () => demoDataPath);
ipcMain.handle('export-csv', () => ({ success: true }));

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
  await new Promise(r => setTimeout(r, 800));

  console.log('--- CAPTURE 1: Click Fee Collected KPI & Initial Paginated View ---');
  await win.webContents.executeJavaScript(`
    showCollectedDetail();
  `);
  await new Promise(r => setTimeout(r, 400));

  const img1 = await win.capturePage();
  fs.writeFileSync(path.join(artifactDir, 'screenshot_collected_modal_full_report.png'), img1.toPNG());
  console.log('✓ Saved screenshot_collected_modal_full_report.png');

  console.log('--- CAPTURE 2: Expanded Payment Breakdown Row ---');
  await win.webContents.executeJavaScript(`
    // Find the first breakdown button and click it
    const btn = document.querySelector('[id^="btn_bkd_"]');
    if (btn) btn.click();
  `);
  await new Promise(r => setTimeout(r, 300));

  const img2 = await win.capturePage();
  fs.writeFileSync(path.join(artifactDir, 'screenshot_collected_modal_breakdown_expanded.png'), img2.toPNG());
  console.log('✓ Saved screenshot_collected_modal_breakdown_expanded.png');

  console.log('--- CAPTURE 3: Filtered View (Class: NC, Mode: Online / UPI) ---');
  await win.webContents.executeJavaScript(`
    document.getElementById('col_f_cls').value = 'NC';
    document.getElementById('col_f_mode').value = 'Online / UPI';
    applyCollectedFilters();
  `);
  await new Promise(r => setTimeout(r, 300));

  const img3 = await win.capturePage();
  fs.writeFileSync(path.join(artifactDir, 'screenshot_collected_modal_filtered_class_mode.png'), img3.toPNG());
  console.log('✓ Saved screenshot_collected_modal_filtered_class_mode.png');

  console.log('--- CAPTURE 4: Custom Date Range Filter ---');
  await win.webContents.executeJavaScript(`
    resetCollectedFilters();
    document.getElementById('col_f_date_preset').value = 'custom';
    onCollectedDatePresetChange();
    document.getElementById('col_f_date_from').value = '2026-05-01';
    document.getElementById('col_f_date_to').value = '2026-05-15';
    applyCollectedFilters();
  `);
  await new Promise(r => setTimeout(r, 300));

  const img4 = await win.capturePage();
  fs.writeFileSync(path.join(artifactDir, 'screenshot_collected_modal_custom_date_range.png'), img4.toPNG());
  console.log('✓ Saved screenshot_collected_modal_custom_date_range.png');

  console.log('ALL SCREENSHOTS CAPTURED SUCCESSFULLY!');
  app.quit();
});
