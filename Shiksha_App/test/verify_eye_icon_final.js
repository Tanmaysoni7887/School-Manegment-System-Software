const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const artifactDir = path.resolve('C:/Users/HP/.gemini/antigravity/brain/09fab391-3131-4e63-9822-ed522316ce4e');
const prodDbPath = 'C:\\Users\\HP\\OneDrive\\Documents\\MDConvent_SMS\\school_data.json';
const prodDB = JSON.parse(fs.readFileSync(prodDbPath, 'utf8'));

// Auth manager
const { createAuthManager } = require('../auth');
const testAuthManager = createAuthManager({ userDataPath: path.resolve(__dirname, '..') });

ipcMain.handle('load-data', () => JSON.parse(JSON.stringify(prodDB)));
ipcMain.handle('save-data', () => ({ success: true }));
ipcMain.handle('get-data-path', () => prodDbPath);
ipcMain.handle('export-csv', () => ({ success: true }));
ipcMain.handle('print-content', () => ({ success: true }));
ipcMain.handle('export-pdf', () => ({ success: true }));
ipcMain.handle('get-student-photo-data', () => null);
ipcMain.handle('auth-get-status', () => testAuthManager.getAuthStatus());
ipcMain.handle('auth-login', async (e, creds) => {
  return testAuthManager.login(creds && creds.username, creds && creds.password);
});
ipcMain.handle('auth-logout', async () => {
  testAuthManager.logout();
  return { success: true };
});

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
    console.log('SHIKSHA FINAL PASSWORD EYE ICON ROOT-CAUSE VERIFICATION');
    console.log('=============================================================\n');

    await win.loadFile(path.resolve(__dirname, '../src/index.html'));
    await new Promise(r => setTimeout(r, 600));

    // 1. Inspect State 1 (Password Hidden)
    const state1 = await win.webContents.executeJavaScript(`
      (() => {
        const btn = document.querySelector('.toggle-pwd');
        const svg = btn ? btn.querySelector('svg') : null;
        const path = svg ? svg.querySelector('path') : null;
        const input = document.getElementById('loginPassword');
        const container = input ? input.parentElement : null;

        const g = el => {
          if (!el) return null;
          const b = el.getBoundingClientRect();
          const cs = window.getComputedStyle(el);
          return {
            rect: { top: b.top, left: b.left, width: b.width, height: b.height, right: b.right, bottom: b.bottom },
            overflow: cs.overflow,
            display: cs.display
          };
        };

        const cB = g(container);
        const btnB = g(btn);
        const svgB = g(svg);

        const cMidY = cB.rect.top + cB.rect.height / 2;
        const sMidY = svgB.rect.top + svgB.rect.height / 2;
        const bMidY = btnB.rect.top + btnB.rect.height / 2;

        return {
          type: input.type,
          container: cB,
          btn: btnB,
          svg: svgB,
          pathD: path ? path.getAttribute('d') : null,
          viewBox: svg ? svg.getAttribute('viewBox') : null,
          vOffset: Math.abs(cMidY - sMidY),
          buttonRightClearance: cB.rect.right - btnB.rect.right,
          svgRightClearance: cB.rect.right - svgB.rect.right
        };
      })()
    `);

    console.log('[STATE 1] Metrics (Password Hidden):');
    console.log('  - Input type:', state1.type);
    console.log('  - Button box:', `${state1.btn.rect.width}x${state1.btn.rect.height} (clearance: ${state1.buttonRightClearance.toFixed(1)}px from right border)`);
    console.log('  - SVG box:', `${state1.svg.rect.width}x${state1.svg.rect.height} (clearance: ${state1.svgRightClearance.toFixed(1)}px from right border)`);
    console.log('  - Vertical offset from container center:', `${state1.vOffset.toFixed(2)}px`);
    console.log('  - SVG viewBox:', state1.viewBox);
    console.log('  - SVG path data:', state1.pathD);

    const isFullFeatherPath = state1.pathD && state1.pathD.includes('8-11-8-11-8z');
    if (!isFullFeatherPath) {
      console.error('  [FAIL] SVG path is missing the closing bottom-left arc!');
      allPassed = false;
    } else {
      console.log('  [PASS] Full 4-arc complete eye outline confirmed!');
    }

    if (state1.vOffset > 1.0) {
      console.error('  [FAIL] Vertical alignment off-center!');
      allPassed = false;
    } else {
      console.log('  [PASS] Exact vertical centering verified!');
    }

    if (state1.buttonRightClearance < 12) {
      console.error('  [FAIL] Insufficient right border clearance!');
      allPassed = false;
    } else {
      console.log('  [PASS] Comfortable border clearance (' + state1.buttonRightClearance.toFixed(1) + 'px) verified!');
    }

    // Capture cropped screenshot of State 1
    const cropArea = await win.webContents.executeJavaScript(`
      (() => {
        const c = document.getElementById('loginPassword').parentElement;
        const b = c.getBoundingClientRect();
        return { x: Math.round(b.x - 8), y: Math.round(b.y - 8), width: Math.round(b.width + 16), height: Math.round(b.height + 16) };
      })()
    `);

    const img1 = await win.webContents.capturePage();
    const cropped1 = img1.crop(cropArea);
    const path1 = path.join(artifactDir, 'eye_icon_fixed_final_state1_hidden.png');
    fs.writeFileSync(path1, cropped1.toPNG());
    console.log('  [SCREENSHOT] Saved eye_icon_fixed_final_state1_hidden.png');

    // 2. Type password and click toggle to State 2 (Password Revealed)
    console.log('\n[STATE 2] Typing password and clicking Eye Toggle...');
    await win.webContents.executeJavaScript(`
      const p = document.getElementById('loginPassword');
      p.value = 'MySecret2026!';
    `);

    await win.webContents.executeJavaScript(`
      document.querySelector('.toggle-pwd').click();
    `);
    await new Promise(r => setTimeout(r, 150));

    const state2 = await win.webContents.executeJavaScript(`
      (() => {
        const btn = document.querySelector('.toggle-pwd');
        const svg = btn ? btn.querySelector('svg') : null;
        const path = svg ? svg.querySelector('path') : null;
        const line = svg ? svg.querySelector('line') : null;
        const input = document.getElementById('loginPassword');
        const c = input.parentElement;

        const g = el => {
          if (!el) return null;
          const b = el.getBoundingClientRect();
          return { top: b.top, left: b.left, width: b.width, height: b.height, right: b.right, bottom: b.bottom };
        };

        const cB = g(c);
        const btnB = g(btn);
        const svgB = g(svg);

        return {
          type: input.type,
          value: input.value,
          pathD: path ? path.getAttribute('d') : null,
          hasSlashLine: Boolean(line),
          buttonRightClearance: cB.right - btnB.right,
          svgRightClearance: cB.right - svgB.right,
          vOffset: Math.abs((cB.top + cB.height / 2) - (svgB.top + svgB.height / 2))
        };
      })()
    `);

    console.log('  - Input type:', state2.type);
    console.log('  - Password value preserved:', state2.value);
    console.log('  - Slash line present:', state2.hasSlashLine);
    console.log('  - Button clearance:', `${state2.buttonRightClearance.toFixed(1)}px (SVG: ${state2.svgRightClearance.toFixed(1)}px)`);

    if (state2.type !== 'text') {
      console.error('  [FAIL] Type did not change to "text"!');
      allPassed = false;
    } else if (state2.value !== 'MySecret2026!') {
      console.error('  [FAIL] Password value changed or cleared!');
      allPassed = false;
    } else if (!state2.hasSlashLine) {
      console.error('  [FAIL] Slashed eye icon missing diagonal line!');
      allPassed = false;
    } else {
      console.log('  [PASS] Password revealed, value intact, eye-off icon rendered cleanly!');
    }

    const img2 = await win.webContents.capturePage();
    const cropped2 = img2.crop(cropArea);
    const path2 = path.join(artifactDir, 'eye_icon_fixed_final_state2_visible.png');
    fs.writeFileSync(path2, cropped2.toPNG());
    console.log('  [SCREENSHOT] Saved eye_icon_fixed_final_state2_visible.png');

    // 3. Toggle back to State 3 (Password Hidden again)
    console.log('\n[STATE 3] Toggling back to hidden password...');
    await win.webContents.executeJavaScript(`
      document.querySelector('.toggle-pwd').click();
    `);
    await new Promise(r => setTimeout(r, 150));

    const state3 = await win.webContents.executeJavaScript(`
      (() => {
        const input = document.getElementById('loginPassword');
        return {
          type: input.type,
          value: input.value
        };
      })()
    `);
    console.log('  - Input type:', state3.type);
    console.log('  - Password value preserved:', state3.value);

    if (state3.type !== 'password' || state3.value !== 'MySecret2026!') {
      console.error('  [FAIL] Reverting failed!');
      allPassed = false;
    } else {
      console.log('  [PASS] Reverted to password type with value 100% intact!');
    }

    // 4. Test Login
    console.log('\n[STEP 4] Verifying login submission with valid credentials...');
    await win.webContents.executeJavaScript(`
      document.getElementById('loginUsername').value = 'admin';
      document.getElementById('loginPassword').value = 'admin123';
      document.getElementById('btnAdminLogin').click();
    `);
    await new Promise(r => setTimeout(r, 500));

    const loginRes = await win.webContents.executeJavaScript(`
      (() => ({
        authViewHidden: document.getElementById('authView')?.style.display === 'none',
        appShellVisible: document.getElementById('appShell')?.style.display !== 'none'
      }))()
    `);
    console.log('  - Login result:', loginRes);

    if (!loginRes.authViewHidden || !loginRes.appShellVisible) {
      console.error('  [FAIL] Login failed!');
      allPassed = false;
    } else {
      console.log('  [PASS] Login succeeded smoothly!');
    }

    console.log('\n=============================================================');
    console.log(allPassed ? 'ALL VERIFICATIONS PASSED WITH 100% SUCCESS!' : 'VERIFICATION FAILED!');
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
