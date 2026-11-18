const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'src', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  await win.loadFile(path.join(__dirname, '..', 'src', 'login.html'));
  await new Promise(r => setTimeout(r, 600));

  // Enter a password to test spacing and eye visibility
  await win.webContents.executeJavaScript(`
    const p = document.getElementById('loginPassword');
    p.value = 'MySecretPassword123!';
  `);

  const img1 = await win.webContents.capturePage();
  const outPath1 = 'C:/Users/HP/.gemini/antigravity/brain/09fab391-3131-4e63-9822-ed522316ce4e/login_eye_state1.png';
  fs.writeFileSync(outPath1, img1.toPNG());
  console.log('Saved state 1 to:', outPath1);

  // Toggle eye visibility
  await win.webContents.executeJavaScript(`
    const btn = document.querySelector('.toggle-pwd');
    btn.click();
  `);
  await new Promise(r => setTimeout(r, 200));

  const img2 = await win.webContents.capturePage();
  const outPath2 = 'C:/Users/HP/.gemini/antigravity/brain/09fab391-3131-4e63-9822-ed522316ce4e/login_eye_state2.png';
  fs.writeFileSync(outPath2, img2.toPNG());
  console.log('Saved state 2 to:', outPath2);

  app.quit();
});
