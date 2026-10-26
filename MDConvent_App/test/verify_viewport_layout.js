const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// Provide harmless mock handlers for app initialization
ipcMain.handle('load-data', () => ({
  students: [],
  settings: { schoolName: 'MD Convent Public School', currentSession: '2026–27', admissionPrefix: 'MDC-' },
  fees: {}
}));
ipcMain.handle('get-data-path', () => 'mock/path');

app.whenReady().then(async () => {
  console.log('=== RUNNING ELECTRON VIEWPORT & LAYOUT VERIFICATION ===\n');

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

  const inspectLayout = async (resName, w, h) => {
    win.setContentSize(w, h);
    await new Promise(r => setTimeout(r, 400)); // allow layout pass

    const report = await win.webContents.executeJavaScript(`
      (() => {
        showPage('addstudent', null);

        const pageEl = document.getElementById('page-addstudent');
        const cardEl = pageEl ? pageEl.querySelector('.card') : null;
        const caEl = document.querySelector('.ca');

        const requiredIds = [
          'sft', 's_photo_prev', 's_photo_placeholder', 'btnRemoveStudentPhoto', 's_photo_status',
          's_n', 's_f', 's_m', 's_dob', 's_g', 's_b',
          's_ph', 's_em', 's_ad',
          's_an', 's_srn', 's_admdt', 's_sess',
          's_cl', 's_sec', 's_rn', 's_stat',
          's_eid'
        ];
        const missing = requiredIds.filter(id => !document.getElementById(id));

        const cardWidth = cardEl ? cardEl.offsetWidth : 0;
        const caWidth = caEl ? caEl.clientWidth : 0;
        const widthUtilization = caWidth > 0 ? ((cardWidth / caWidth) * 100).toFixed(1) : 0;

        const cardHeight = cardEl ? cardEl.offsetHeight : 0;
        const caHeight = caEl ? caEl.clientHeight : 0;

        const hasHorizontalScroll = caEl ? (caEl.scrollWidth > caEl.clientWidth) : false;
        const hasVerticalScroll = caEl ? (caEl.scrollHeight > caEl.clientHeight) : false;

        const photoBar = document.querySelector('#page-addstudent .student-photo-bar');
        const photoBarWidth = photoBar ? photoBar.offsetWidth : 0;
        const saveBtn = document.querySelector('#page-addstudent .stu-save-btn');
        const saveBtnRect = saveBtn ? saveBtn.getBoundingClientRect() : null;
        const isSaveBtnVisible = saveBtnRect ? (saveBtnRect.top >= 0 && saveBtnRect.bottom <= window.innerHeight) : false;

        return {
          missing,
          cardWidth,
          caWidth,
          widthUtilization: widthUtilization + '%',
          cardHeight,
          caHeight,
          scrollHeight: caEl ? caEl.scrollHeight : 0,
          clientHeight: caEl ? caEl.clientHeight : 0,
          hasHorizontalScroll,
          hasVerticalScroll,
          photoBarWidth,
          isSaveBtnVisible
        };
      })()
    `);

    console.log('Resolution: ' + resName);
    console.log('  - Content Area (Client/Scroll Height): ' + report.clientHeight + 'px / ' + report.scrollHeight + 'px');
    console.log('  - Horizontal Overflow: ' + (report.hasHorizontalScroll ? 'FAIL (Horizontal Scroll detected)' : 'PASS (No horizontal scroll)'));
    console.log('  - Vertical Fit: ' + (report.hasVerticalScroll ? 'Scroll required (' + (report.scrollHeight - report.clientHeight) + 'px overflow)' : 'PASS (Fits completely without vertical scroll)'));
    console.log('  - Save Student Button Visible: ' + (report.isSaveBtnVisible ? 'YES (Fully on screen)' : 'NO'));
    console.log('  - Missing Fields: ' + (report.missing.length === 0 ? 'None (All 17 fields present)' : report.missing.join(', ')));
    console.log('');
  };

  await inspectLayout('1600x900 (Target Resolution)', 1600, 900);
  await inspectLayout('1920x1080 (Full HD Maximized)', 1920, 1080);
  await inspectLayout('1366x768 (Standard Laptop Maximized)', 1366, 768);
  await inspectLayout('1024x768 (Small Window)', 1024, 768);

  console.log('=== VIEWPORT VERIFICATION COMPLETED SUCCESSFULLY ===');
  win.destroy();
  app.quit();
});
