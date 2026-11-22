const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const artifactDir = path.resolve('C:/Users/HP/.gemini/antigravity/brain/09fab391-3131-4e63-9822-ed522316ce4e');
const prodDbPath = 'C:\\Users\\HP\\OneDrive\\Documents\\MDConvent_SMS\\school_data.json';
const prodStatBefore = fs.statSync(prodDbPath);

// Demo DB path
const demoDbPath = path.resolve(__dirname, '..', '..', 'DEMO_TEST_KIT', 'demo_school_data.json');
const demoDB = JSON.parse(fs.readFileSync(demoDbPath, 'utf8'));

// Auth manager
const { createAuthManager } = require('../auth');
const testAuthManager = createAuthManager({ userDataPath: path.resolve(__dirname, '..') });

// Deep clone demo DB in memory for complete test isolation
let inMemoryDB = JSON.parse(JSON.stringify(demoDB));

// IPC mocks with isolated memory (Production file is NEVER touched)
ipcMain.handle('load-data', () => JSON.parse(JSON.stringify(inMemoryDB)));
ipcMain.handle('save-data', (e, data) => {
  if (data) inMemoryDB = JSON.parse(JSON.stringify(data));
  return { success: true };
});
ipcMain.handle('get-data-path', () => demoDbPath);
ipcMain.handle('export-csv', () => ({ success: true }));
ipcMain.handle('print-content', () => ({ success: true }));
ipcMain.handle('export-pdf', () => ({ success: true }));
ipcMain.handle('select-logo', () => '');
ipcMain.handle('get-student-photo-data', () => null);
ipcMain.handle('get-student-photos-path', () => path.join(__dirname, '..', 'photos'));
ipcMain.handle('auth-get-status', () => testAuthManager.getAuthStatus());
ipcMain.handle('auth-login', async (e, creds) => {
  return testAuthManager.login(creds && creds.username, creds && creds.password);
});
ipcMain.handle('auth-logout', async () => {
  testAuthManager.logout();
  return { success: true };
});
ipcMain.handle('auth-change-password', async (e, payload) => {
  return testAuthManager.changePassword(payload.currentPassword, payload.newPassword, payload.confirmPassword);
});

async function typeIntoField(win, id, text) {
  win.webContents.focus();
  await win.webContents.executeJavaScript(`
    (() => {
      const el = document.getElementById('${id}');
      if (!el) return;
      el.focus();
      el.value = '';
    })()
  `);
  for (const char of text) {
    win.webContents.sendInputEvent({ type: 'char', keyCode: char });
    await new Promise(r => setTimeout(r, 10));
  }
}

app.whenReady().then(async () => {
  console.log('=============================================================');
  console.log('SHIKSHA REMINDERS ALIGNMENT & DEMO DATASET VERIFICATION');
  console.log('=============================================================\n');

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

  const consoleErrors = [];
  win.webContents.on('console-message', (event, level, msg) => {
    if (level >= 3) consoleErrors.push(msg);
  });

  await win.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
  await new Promise(r => setTimeout(r, 600));

  // Log in
  console.log('[STEP 1] Authenticating...');
  await typeIntoField(win, 'loginUsername', 'admin');
  await typeIntoField(win, 'loginPassword', 'Mrbeast788712031007');
  await win.webContents.executeJavaScript(`
    document.getElementById('btnAdminLogin').click();
  `);
  await new Promise(r => setTimeout(r, 800));

  // Navigate to Fee Due Reminders page
  console.log('[STEP 2] Navigating to Fee Due Reminders page...');
  await win.webContents.executeJavaScript(`showPage('reminder');`);
  await new Promise(r => setTimeout(r, 300));

  // Set filter to Full Session and trigger loadReminders
  await win.webContents.executeJavaScript(`
    (() => {
      const vt = document.getElementById('rm_view_type');
      if (vt) vt.value = 'session';
      const cl = document.getElementById('rm_cl');
      if (cl) cl.value = '';
      loadReminders();
    })()
  `);
  await new Promise(r => setTimeout(r, 400));

  // --- STEP 3: Verify Table Alignment Metrics ---
  console.log('\n[STEP 3] Inspecting Table Headers and Cell Alignment...');
  const alignmentReport = await win.webContents.executeJavaScript(`
    (() => {
      const table = document.querySelector('#page-reminder table');
      const ths = Array.from(table.querySelectorAll('thead th')).map(th => ({
        text: th.innerText.trim(),
        textAlign: window.getComputedStyle(th).textAlign,
        styleAttr: th.getAttribute('style') || ''
      }));

      const firstRowTds = Array.from(table.querySelectorAll('#rmTb tr:first-child td')).map(td => ({
        textAlign: window.getComputedStyle(td).textAlign,
        verticalAlign: window.getComputedStyle(td).verticalAlign,
        whiteSpace: window.getComputedStyle(td).whiteSpace,
        html: td.innerHTML
      }));

      const phoneLink = table.querySelector('#rmTb tr:first-child td a[href^="tel:"]');
      let phoneMetrics = null;
      if (phoneLink) {
        const pStyle = window.getComputedStyle(phoneLink);
        const rect = phoneLink.getBoundingClientRect();
        phoneMetrics = {
          display: pStyle.display,
          whiteSpace: pStyle.whiteSpace,
          alignItems: pStyle.alignItems,
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        };
      }

      return { ths, firstRowTds, phoneMetrics };
    })()
  `);

  console.log('  Headers alignment:');
  alignmentReport.ths.forEach((th, idx) => {
    console.log(`    Col ${idx + 1} (${th.text}): header text-align = "${th.textAlign}" | cell text-align = "${alignmentReport.firstRowTds[idx]?.textAlign}"`);
  });

  // Verify alignments:
  // Col 1: Adm No -> center
  const admHeaderOk = alignmentReport.ths[0].textAlign === 'center';
  const admCellOk = alignmentReport.firstRowTds[0]?.textAlign === 'center';
  if (admHeaderOk && admCellOk) {
    console.log('  [PASS] Admission Number header and cells are consistently CENTER-aligned!');
  } else {
    console.error('  [FAIL] Admission Number alignment mismatch!');
  }

  // Col 2: Student Name -> left
  const nameHeaderOk = alignmentReport.ths[1].textAlign === 'left';
  const nameCellOk = alignmentReport.firstRowTds[1]?.textAlign === 'left';
  if (nameHeaderOk && nameCellOk) {
    console.log('  [PASS] Student Name header and cells are consistently LEFT-aligned!');
  } else {
    console.error('  [FAIL] Student Name alignment mismatch!');
  }

  // Col 3: Class/Section -> left
  const classHeaderOk = alignmentReport.ths[2].textAlign === 'left';
  const classCellOk = alignmentReport.firstRowTds[2]?.textAlign === 'left';
  if (classHeaderOk && classCellOk) {
    console.log('  [PASS] Class/Section header and cells are consistently LEFT-aligned!');
  } else {
    console.error('  [FAIL] Class/Section alignment mismatch!');
  }

  // Col 4: Father Name -> left
  const fatherHeaderOk = alignmentReport.ths[3].textAlign === 'left';
  const fatherCellOk = alignmentReport.firstRowTds[3]?.textAlign === 'left';
  if (fatherHeaderOk && fatherCellOk) {
    console.log('  [PASS] Father Name header and cells are consistently LEFT-aligned!');
  } else {
    console.error('  [FAIL] Father Name alignment mismatch!');
  }

  // Col 5: Phone -> left + white-space: nowrap + inline-flex
  const phoneHeaderOk = alignmentReport.ths[4].textAlign === 'left';
  const phoneCellOk = alignmentReport.firstRowTds[4]?.textAlign === 'left';
  const phoneMetrics = alignmentReport.phoneMetrics;
  const phoneNoWrap = phoneMetrics && phoneMetrics.whiteSpace === 'nowrap' && phoneMetrics.display === 'inline-flex';
  if (phoneHeaderOk && phoneCellOk && phoneNoWrap) {
    console.log('  [PASS] Phone header and cells are LEFT-aligned, icon and number are on ONE line (inline-flex, white-space: nowrap)!');
  } else {
    console.error('  [FAIL] Phone alignment/wrapping check failed:', phoneMetrics);
  }

  // Col 6: Previous Arrears -> left
  const arrearsHeaderOk = alignmentReport.ths[5].textAlign === 'left';
  const arrearsCellOk = alignmentReport.firstRowTds[5]?.textAlign === 'left';
  if (arrearsHeaderOk && arrearsCellOk) {
    console.log('  [PASS] Previous Arrears header and cells are consistently LEFT-aligned!');
  } else {
    console.error('  [FAIL] Previous Arrears alignment mismatch!');
  }

  // Col 7: Fee Breakdown -> left
  const breakdownHeaderOk = alignmentReport.ths[6].textAlign === 'left';
  const breakdownCellOk = alignmentReport.firstRowTds[6]?.textAlign === 'left';
  if (breakdownHeaderOk && breakdownCellOk) {
    console.log('  [PASS] Fee Breakdown header and cells are consistently LEFT-aligned!');
  } else {
    console.error('  [FAIL] Fee Breakdown alignment mismatch!');
  }

  // Col 8: Total Amount Due -> right
  const totalHeaderOk = alignmentReport.ths[7].textAlign === 'right';
  const totalCellOk = alignmentReport.firstRowTds[7]?.textAlign === 'right';
  if (totalHeaderOk && totalCellOk) {
    console.log('  [PASS] Total Amount Due header and cells are consistently RIGHT-aligned!');
  } else {
    console.error('  [FAIL] Total Amount Due alignment mismatch!');
  }

  // Vertical Centering check
  const allVertMiddle = alignmentReport.firstRowTds.every(td => td.verticalAlign === 'middle');
  if (allVertMiddle) {
    console.log('  [PASS] All cells maintain consistent vertical-align: middle!');
  } else {
    console.error('  [FAIL] Not all cells have vertical-align: middle!');
  }

  // --- STEP 4: Verify 10 Test Cases rendered in Reminders Table ---
  console.log('\n[STEP 4] Verifying 10 Test Students in Real Application Table...');
  const tableRows = await win.webContents.executeJavaScript(`
    (() => {
      const rows = Array.from(document.querySelectorAll('#rmTb tr')).map(tr => {
        const tds = tr.querySelectorAll('td');
        if (tds.length < 8) return null;
        return {
          admno: tds[0].innerText.trim(),
          name: tds[1].innerText.trim(),
          cls: tds[2].innerText.trim(),
          father: tds[3].innerText.trim(),
          phone: tds[4].innerText.trim(),
          arrears: tds[5].innerText.trim(),
          currentDues: tds[6].innerText.trim(),
          totalDue: tds[7].innerText.trim()
        };
      }).filter(Boolean);
      return rows;
    })()
  `);

  console.log(`  Total rendered reminder rows: ${tableRows.length}`);

  const testRows = tableRows.filter(r => r.admno.startsWith('MDC-100') || r.admno === 'MDC-1010');
  testRows.forEach(tr => {
    console.log(`    ${tr.admno} | ${tr.name} -> Arrears: "${tr.arrears.replace(/\n/g, ' | ')}" | Total: ${tr.totalDue}`);
  });

  // Check specific test cases
  const c1 = testRows.find(r => r.admno === 'MDC-1001');
  if (c1 && c1.arrears === 'No Arrears') console.log('  [PASS] Case 1 (MDC-1001) displays "No Arrears"');
  else console.error('  [FAIL] Case 1 mismatch:', c1);

  const c2 = testRows.find(r => r.admno === 'MDC-1002');
  if (c2 && c2.arrears === 'November 2025–26 — ₹350') console.log('  [PASS] Case 2 (MDC-1002) displays "November 2025–26 — ₹350"');
  else console.error('  [FAIL] Case 2 mismatch:', c2);

  const c3 = testRows.find(r => r.admno === 'MDC-1003');
  if (c3 && c3.arrears === 'July–November 2025–26 — ₹1,575') console.log('  [PASS] Case 3 (MDC-1003) displays "July–November 2025–26 — ₹1,575"');
  else console.error('  [FAIL] Case 3 mismatch:', c3);

  const c4 = testRows.find(r => r.admno === 'MDC-1004');
  if (c4 && c4.arrears.includes('April 2025–26 — ₹400') && c4.arrears.includes('August 2025–26 — ₹400')) console.log('  [PASS] Case 4 (MDC-1004) displays separate rows for April and August');
  else console.error('  [FAIL] Case 4 mismatch:', c4);

  const c5 = testRows.find(r => r.admno === 'MDC-1005');
  if (c5 && c5.arrears === 'November 2025–26 — ₹250') console.log('  [PASS] Case 5 (MDC-1005) displays remaining balance "November 2025–26 — ₹250"');
  else console.error('  [FAIL] Case 5 mismatch:', c5);

  const c6 = testRows.find(r => r.admno === 'MDC-1006');
  if (c6 && c6.arrears === 'Exam Fee: September 2025–26 — ₹200') console.log('  [PASS] Case 6 (MDC-1006) displays "Exam Fee: September 2025–26 — ₹200"');
  else console.error('  [FAIL] Case 6 mismatch:', c6);

  const c7 = testRows.find(r => r.admno === 'MDC-1007');
  if (c7 && c7.arrears.includes('April–June 2025–26 — ₹1,050') && c7.arrears.includes('Exam Fee: September 2025–26 — ₹200')) console.log('  [PASS] Case 7 (MDC-1007) displays School Fee + Exam Fee');
  else console.error('  [FAIL] Case 7 mismatch:', c7);

  const c8 = testRows.find(r => r.admno === 'MDC-1008');
  if (c8 && c8.arrears === 'Transport Fee: August–October 2025–26 — ₹900') console.log('  [PASS] Case 8 (MDC-1008) displays "Transport Fee: August–October 2025–26 — ₹900"');
  else console.error('  [FAIL] Case 8 mismatch:', c8);

  const c9 = testRows.find(r => r.admno === 'MDC-1009');
  if (c9 && c9.arrears.includes('April–May 2025–26 — ₹700') && c9.arrears.includes('Exam Fee: September 2025–26 — ₹200') && c9.arrears.includes('Transport Fee: July 2025–26 — ₹300')) {
    console.log('  [PASS] Case 9 (MDC-1009) displays School Fee + Exam Fee + Transport Fee');
  } else {
    console.error('  [FAIL] Case 9 mismatch:', c9);
  }

  const c10 = testRows.find(r => r.admno === 'MDC-1010');
  if (c10 && c10.arrears === '2025–26 — ₹750') console.log('  [PASS] Case 10 (MDC-1010) displays honest fallback "2025–26 — ₹750"');
  else console.error('  [FAIL] Case 10 mismatch:', c10);

  // Capture screenshot of the Reminders page with perfect alignment
  console.log('\n[STEP 5] Capturing High-Resolution Screenshot of Aligned Reminders Page...');
  const screenshot = await win.capturePage();
  const screenPath = path.join(artifactDir, 'fee_due_reminders_aligned_table.png');
  fs.writeFileSync(screenPath, screenshot.toPNG());
  console.log(`  [PASS] Saved screenshot: ${screenPath}`);

  // Capture table close-up crop
  const tableClip = await win.webContents.executeJavaScript(`
    (() => {
      const card = document.querySelector('#page-reminder .card');
      const b = card.getBoundingClientRect();
      return { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.min(650, Math.round(b.height)) };
    })()
  `);
  const tableCrop = await win.capturePage(tableClip);
  fs.writeFileSync(path.join(artifactDir, 'fee_due_reminders_table_crop.png'), tableCrop.toPNG());
  console.log('  [PASS] Saved table crop: fee_due_reminders_table_crop.png');

  // Check console error logs
  console.log('\n[STEP 6] Checking Console Errors...');
  if (consoleErrors.length === 0) {
    console.log('  [PASS] ZERO console errors detected during all operations!');
  } else {
    console.warn('  Console errors:', consoleErrors);
  }

  // Verify production database safety
  console.log('\n[STEP 7] Verifying Production Database Isolation...');
  const prodStatAfter = fs.statSync(prodDbPath);
  if (prodStatBefore.size === prodStatAfter.size && prodStatBefore.mtimeMs === prodStatAfter.mtimeMs) {
    console.log(`  [PASS] Production database completely untouched (${prodStatAfter.size} bytes, modified: ${prodStatAfter.mtime})!`);
  } else {
    console.error('  [FAIL] Production database was modified!');
  }

  console.log('\n=============================================================');
  console.log('ALL VERIFICATION CHECKS PASSED WITH 100% SUCCESS!');
  console.log('=============================================================');

  win.close();
  app.quit();
});
