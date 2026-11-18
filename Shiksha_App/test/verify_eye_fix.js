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
    console.log('SHIKSHA PASSWORD EYE ICON FIX — TARGETED VERIFICATION');
    console.log('=============================================================\n');

    await win.loadFile(path.resolve(__dirname, '../src/index.html'));
    await new Promise(r => setTimeout(r, 600));

    // 1. Initial State: inspect Eye Icon metrics in State 1 (Password hidden)
    const state1 = await win.webContents.executeJavaScript(`
      (() => {
        const btn = document.querySelector('.toggle-pwd');
        const svg = btn ? btn.querySelector('svg') : null;
        const input = document.getElementById('loginPassword');
        const container = input ? input.parentElement : null;

        const g = el => {
          if (!el) return null;
          const b = el.getBoundingClientRect();
          return { top: b.top, left: b.left, width: b.width, height: b.height, right: b.right, bottom: b.bottom };
        };

        const cB = g(container);
        const btnB = g(btn);
        const svgB = g(svg);

        const containerMidY = cB.top + (cB.height / 2);
        const btnMidY = btnB.top + (btnB.height / 2);
        const svgMidY = svgB.top + (svgB.height / 2);

        const rightClearance = cB.right - btnB.right;
        const svgRightClearance = cB.right - svgB.right;

        return {
          type: input.type,
          container: cB,
          btn: btnB,
          svg: svgB,
          containerMidY,
          btnMidY,
          svgMidY,
          vOffset: Math.abs(containerMidY - svgMidY),
          rightClearance,
          svgRightClearance,
          viewBox: svg ? svg.getAttribute('viewBox') : null
        };
      })()
    `);

    console.log('[STATE 1] Metrics (Password Hidden):');
    console.log('  - Input type:', state1.type);
    console.log('  - Button bounding box:', `${state1.btn.width}x${state1.btn.height} at right-clearance ${state1.rightClearance.toFixed(1)}px`);
    console.log('  - SVG bounding box:', `${state1.svg.width}x${state1.svg.height} at right-clearance ${state1.svgRightClearance.toFixed(1)}px`);
    console.log('  - Vertical centering offset:', `${state1.vOffset.toFixed(2)}px (Container Mid: ${state1.containerMidY.toFixed(1)}, SVG Mid: ${state1.svgMidY.toFixed(1)})`);
    console.log('  - SVG viewBox:', state1.viewBox);

    if (state1.vOffset > 1.5) {
      console.error('  [FAIL] Vertical alignment off-center by >1.5px!');
      allPassed = false;
    } else {
      console.log('  [PASS] Vertically centered within subpixel tolerance!');
    }

    if (state1.rightClearance < 12) {
      console.error('  [FAIL] Right clearance too small (<12px)!');
      allPassed = false;
    } else {
      console.log('  [PASS] Generous right-side clearance from rounded border (' + state1.rightClearance.toFixed(1) + 'px)!');
    }

    if (state1.viewBox !== '-1 -1 26 26') {
      console.error('  [FAIL] Expected viewBox "-1 -1 26 26" to prevent stroke clipping!');
      allPassed = false;
    } else {
      console.log('  [PASS] Unclipped padded viewBox active!');
    }

    // Capture cropped screenshot of password container in State 1
    const cropArea = await win.webContents.executeJavaScript(`
      (() => {
        const c = document.getElementById('loginPassword').parentElement;
        const b = c.getBoundingClientRect();
        return { x: Math.round(b.x - 8), y: Math.round(b.y - 8), width: Math.round(b.width + 16), height: Math.round(b.height + 16) };
      })()
    `);

    const img1 = await win.webContents.capturePage();
    const cropped1 = img1.crop(cropArea);
    const state1Path = path.join(artifactDir, 'eye_icon_fixed_state1_hidden.png');
    fs.writeFileSync(state1Path, cropped1.toPNG());
    console.log('  [SCREENSHOT] Saved eye_icon_fixed_state1_hidden.png');

    // 2. Type password and click Toggle to State 2 (Password Revealed)
    console.log('\n[STATE 2] Typing test password and clicking Eye Toggle...');
    await win.webContents.executeJavaScript(`
      const p = document.getElementById('loginPassword');
      p.value = 'SecretPass999';
    `);

    await win.webContents.executeJavaScript(`
      document.querySelector('.toggle-pwd').click();
    `);
    await new Promise(r => setTimeout(r, 150));

    const state2 = await win.webContents.executeJavaScript(`
      (() => {
        const btn = document.querySelector('.toggle-pwd');
        const svg = btn ? btn.querySelector('svg') : null;
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
          rightClearance: cB.right - btnB.right,
          svgRightClearance: cB.right - svgB.right,
          vOffset: Math.abs((cB.top + cB.height / 2) - (svgB.top + svgB.height / 2)),
          viewBox: svg ? svg.getAttribute('viewBox') : null
        };
      })()
    `);

    console.log('  - Input type:', state2.type);
    console.log('  - Preserved value:', state2.value);
    console.log('  - SVG viewBox:', state2.viewBox);
    console.log('  - Right clearance:', `${state2.rightClearance.toFixed(1)}px (SVG: ${state2.svgRightClearance.toFixed(1)}px)`);

    if (state2.type !== 'text') {
      console.error('  [FAIL] Password input type did not change to "text"!');
      allPassed = false;
    } else if (state2.value !== 'SecretPass999') {
      console.error('  [FAIL] Password value was lost on toggle!');
      allPassed = false;
    } else {
      console.log('  [PASS] Password correctly revealed as plaintext with value intact!');
    }

    const img2 = await win.webContents.capturePage();
    const cropped2 = img2.crop(cropArea);
    const state2Path = path.join(artifactDir, 'eye_icon_fixed_state2_visible.png');
    fs.writeFileSync(state2Path, cropped2.toPNG());
    console.log('  [SCREENSHOT] Saved eye_icon_fixed_state2_visible.png');

    // 3. Toggle back to State 3 (Password Hidden again)
    console.log('\n[STATE 3] Clicking Eye Toggle again to hide password...');
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
    console.log('  - Preserved value:', state3.value);

    if (state3.type !== 'password' || state3.value !== 'SecretPass999') {
      console.error('  [FAIL] Reverting to password type failed!');
      allPassed = false;
    } else {
      console.log('  [PASS] Password reverted to "password" type cleanly!');
    }

    // 4. Test Login with actual credentials
    console.log('\n[STEP 4] Verifying login submission still works properly...');
    await win.webContents.executeJavaScript(`
      document.getElementById('loginUsername').value = 'admin';
      document.getElementById('loginPassword').value = 'admin123';
      document.getElementById('btnAdminLogin').click();
    `);
    await new Promise(r => setTimeout(r, 500));

    const loginSuccess = await win.webContents.executeJavaScript(`
      (() => ({
        authViewHidden: document.getElementById('authView')?.style.display === 'none',
        appShellVisible: document.getElementById('appShell')?.style.display !== 'none'
      }))()
    `);
    console.log('  - Login result:', loginSuccess);
    if (!loginSuccess.authViewHidden || !loginSuccess.appShellVisible) {
      console.error('  [FAIL] Login failed after eye icon interaction!');
      allPassed = false;
    } else {
      console.log('  [PASS] Login successful, transitioned smoothly to appShell!');
    }

    console.log('\n=============================================================');
    console.log(allPassed ? 'ALL PASSWORD EYE ICON VERIFICATIONS PASSED 100%!' : 'VERIFICATION FAILED!');
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
