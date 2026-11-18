const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const artifactDir = path.resolve('C:/Users/HP/.gemini/antigravity/brain/09fab391-3131-4e63-9822-ed522316ce4e');
const prodDbPath = 'C:\\Users\\HP\\OneDrive\\Documents\\MDConvent_SMS\\school_data.json';
const prodDB = JSON.parse(fs.readFileSync(prodDbPath, 'utf8'));

// Auth manager
const { createAuthManager } = require('../auth');
const testAuthManager = createAuthManager({ userDataPath: path.resolve(__dirname, '..') });

// IPC mocks with production data (read-only)
ipcMain.handle('load-data', () => JSON.parse(JSON.stringify(prodDB)));
ipcMain.handle('save-data', () => ({ success: true }));
ipcMain.handle('get-data-path', () => prodDbPath);
ipcMain.handle('export-csv', () => ({ success: true }));
ipcMain.handle('print-content', () => ({ success: true }));
ipcMain.handle('export-pdf', () => ({ success: true }));
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

const pagesToTest = [
  { id: 'dashboard', name: 'Dashboard' },
  { id: 'students', name: 'All Students' },
  { id: 'addstudent', name: 'Add Student' },
  { id: 'classes', name: 'Classes & Sections' },
  { id: 'sessions', name: 'Sessions & Promotion' },
  { id: 'fees', name: 'Fee Collection' },
  { id: 'reminder', name: 'Fee Reminders' },
  { id: 'transport', name: 'Transport Fees' },
  { id: 'financial-reports', name: 'Financial Reports' },
  { id: 'reports', name: 'Data & Backup' },
  { id: 'history', name: 'Activity History' },
  { id: 'settings', name: 'Settings' },
  { id: 'support', name: 'Support & Info' }
];

async function typeIntoField(win, id, text) {
  win.webContents.focus();
  await win.webContents.executeJavaScript(`
    (() => {
      const el = document.getElementById('${id}');
      if (el) el.focus();
    })()
  `);
  await new Promise(r => setTimeout(r, 20));
  for (const ch of text) {
    win.webContents.sendInputEvent({ type: 'char', keyCode: ch });
  }
  await new Promise(r => setTimeout(r, 20));
}

app.whenReady().then(async () => {
  let allPassed = true;
  let win = null;

  try {
    win = new BrowserWindow({
      width: 1650,
      height: 900,
      show: true,
      webPreferences: {
        preload: path.resolve(__dirname, '../src/preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    console.log('\n=============================================================');
    console.log('SHIKSHA APPLICATION-WIDE UI & MULTI-PAGE RENDERING VERIFICATION');
    console.log('=============================================================\n');

    await win.loadFile(path.resolve(__dirname, '../src/index.html'));
    await new Promise(r => setTimeout(r, 600));

    // 1. Initial State: AuthView visible
    const initialView = await win.webContents.executeJavaScript(`
      (() => ({
        authView: document.getElementById('authView')?.style.display,
        appShell: document.getElementById('appShell')?.style.display
      }))()
    `);
    console.log('[STEP 1] Initial launch state:', initialView);
    if (initialView.authView === 'none' || initialView.appShell !== 'none') {
      throw new Error('Initial launch did not show authView');
    }

    // Capture initial login screenshot
    const loginImg = await win.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, 'page_00_login_screen.png'), loginImg.toPNG());
    console.log('[SCREENSHOT] Saved page_00_login_screen.png');

    // 2. Perform Login via real keyboard input
    console.log('[STEP 2] Logging in with admin credentials via real keystrokes...');
    await typeIntoField(win, 'loginUsername', 'admin');
    await typeIntoField(win, 'loginPassword', 'admin123');

    await win.webContents.executeJavaScript(`
      setTimeout(() => document.getElementById('btnAdminLogin').click(), 0);
    `);
    await new Promise(r => setTimeout(r, 600));

    // 3. Verify Shell & Layout
    const shellLayout = await win.webContents.executeJavaScript(`
      (() => {
        const shell = document.getElementById('appShell');
        const sidebar = document.querySelector('.sidebar');
        const main = document.querySelector('.main');
        const topbar = document.querySelector('.topbar');
        const ca = document.querySelector('.ca');

        const g = el => {
          if (!el) return null;
          const b = el.getBoundingClientRect();
          return { top: b.top, left: b.left, width: b.width, height: b.height, bottom: b.bottom, right: b.right };
        };

        return {
          shell: g(shell),
          sidebar: g(sidebar),
          main: g(main),
          topbar: g(topbar),
          ca: g(ca)
        };
      })()
    `);
    console.log('[STEP 3] Layout bounding boxes after login:\n', JSON.stringify(shellLayout, null, 2));

    if (shellLayout.sidebar.left !== 0 || shellLayout.main.left < 200 || shellLayout.main.top !== 0) {
      throw new Error('Layout failed: sidebar and main are not side-by-side!');
    }
    if (shellLayout.ca.height < 500) {
      throw new Error('Layout failed: content area height is collapsed (' + shellLayout.ca.height + 'px)!');
    }
    console.log('[PASS] Unified AppShell side-by-side flex layout verified successfully!');

    // 4. Test and capture each page
    console.log('\n[STEP 4] Testing and capturing every application page...');
    for (let i = 0; i < pagesToTest.length; i++) {
      const page = pagesToTest[i];
      const pageIndexStr = String(i + 1).padStart(2, '0');

      // Click sidebar button or invoke showPage
      const pageResult = await win.webContents.executeJavaScript(`
        (() => {
          showPage('${page.id}');
          const pEl = document.getElementById('page-${page.id}');
          const ca = document.querySelector('.ca');
          const titleEl = document.getElementById('pgTitle');

          if (!pEl) return { found: false };

          const rect = pEl.getBoundingClientRect();
          const text = pEl.innerText || '';
          const html = pEl.innerHTML || '';
          const childrenCount = pEl.children.length;

          return {
            found: true,
            display: window.getComputedStyle(pEl).display,
            width: rect.width,
            height: rect.height,
            top: rect.top,
            left: rect.left,
            title: titleEl ? titleEl.textContent.trim() : '',
            textLength: text.trim().length,
            childrenCount: childrenCount,
            caHeight: ca ? ca.getBoundingClientRect().height : 0
          };
        })()
      `);

      await new Promise(r => setTimeout(r, 200));

      // Capture screenshot
      const img = await win.webContents.capturePage();
      const filename = `page_${pageIndexStr}_${page.id}.png`;
      fs.writeFileSync(path.join(artifactDir, filename), img.toPNG());

      console.log(`  [PAGE ${pageIndexStr}] ${page.name} (${page.id}):`);
      console.log(`    - Display: ${pageResult.display}, BBox: ${pageResult.width}x${pageResult.height} at (${pageResult.left}, ${pageResult.top})`);
      console.log(`    - Title: "${pageResult.title}", Children: ${pageResult.childrenCount}, TextLength: ${pageResult.textLength}`);
      console.log(`    - Screenshot: ${filename}`);

      if (!pageResult.found) {
        console.error(`    [FAIL] Page element #page-${page.id} not found!`);
        allPassed = false;
      } else if (pageResult.width < 500 || pageResult.height < 100) {
        console.error(`    [FAIL] Page #page-${page.id} dimensions too small (${pageResult.width}x${pageResult.height})!`);
        allPassed = false;
      } else if (pageResult.childrenCount === 0 || pageResult.textLength < 20) {
        console.error(`    [FAIL] Page #page-${page.id} content appears blank (children: ${pageResult.childrenCount}, textLength: ${pageResult.textLength})!`);
        allPassed = false;
      } else {
        console.log(`    [PASS] Page content rendered properly!`);
      }
    }

    // 5. Test Logout & Relogin
    console.log('\n[STEP 5] Testing Logout and Return to Login View...');
    await win.webContents.executeJavaScript(`
      handleAppLogout();
      setTimeout(() => document.getElementById('btnConfirmSignOut').click(), 10);
    `);
    await new Promise(r => setTimeout(r, 250));

    const afterLogout = await win.webContents.executeJavaScript(`
      (() => ({
        authViewVisible: document.getElementById('authView')?.style.display !== 'none',
        appShellHidden: document.getElementById('appShell')?.style.display === 'none',
        uVal: document.getElementById('loginUsername')?.value,
        pVal: document.getElementById('loginPassword')?.value
      }))()
    `);
    console.log('[STEP 5] Logout state:', afterLogout);
    if (!afterLogout.authViewVisible || !afterLogout.appShellHidden || afterLogout.uVal !== '' || afterLogout.pVal !== '') {
      throw new Error('Logout did not return to clean authView!');
    }
    console.log('[PASS] Logout successfully transitioned back to clean login view without window reload!');

    // 6. Test Relogin
    console.log('\n[STEP 6] Testing Relogin after logout...');
    await typeIntoField(win, 'loginUsername', 'admin');
    await typeIntoField(win, 'loginPassword', 'admin123');
    await win.webContents.executeJavaScript(`
      setTimeout(() => document.getElementById('btnAdminLogin').click(), 0);
    `);
    await new Promise(r => setTimeout(r, 350));

    const afterRelogin = await win.webContents.executeJavaScript(`
      (() => ({
        authViewHidden: document.getElementById('authView')?.style.display === 'none',
        appShellVisible: document.getElementById('appShell')?.style.display !== 'none',
        dashboardActive: document.getElementById('page-dashboard')?.classList.contains('active')
      }))()
    `);
    console.log('[STEP 6] Relogin state:', afterRelogin);
    if (!afterRelogin.authViewHidden || !afterRelogin.appShellVisible) {
      throw new Error('Relogin failed to display appShell!');
    }
    console.log('[PASS] Relogin succeeded instantly!');

    console.log('\n=============================================================');
    console.log(allPassed ? 'ALL PAGES AND NAVIGATION VERIFIED 100% WORKING!' : 'VERIFICATION FAILED!');
    console.log('=============================================================\n');

  } catch (err) {
    console.error('VERIFICATION_ERROR:', err.stack || err.message);
    allPassed = false;
  } finally {
    if (win && !win.isDestroyed()) win.destroy();
    app.quit();
    process.exit(allPassed ? 0 : 1);
  }
});
