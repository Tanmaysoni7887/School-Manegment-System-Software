// Load the actual main process to have all real IPC handlers registered
require('../main.js');

const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.whenReady().then(async () => {
  console.log('--- Launching real app with live main.js logic ---');
  // Wait for the main window created by main.js
  let win = null;
  for (let i = 0; i < 30; i++) {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      win = windows[0];
      break;
    }
    await new Promise(r => setTimeout(r, 100));
  }

  if (!win) {
    console.error('No window created!');
    app.quit();
    return;
  }

  console.log('Found main window, waiting for DB to load...');
  await new Promise(r => setTimeout(r, 1200));

  const dbInfo = await win.webContents.executeJavaScript(`
    (() => {
      return {
        hasDB: typeof DB !== 'undefined',
        studentsCount: (typeof DB !== 'undefined' && DB.students) ? DB.students.length : 0,
        firstStudent: (typeof DB !== 'undefined' && DB.students && DB.students[0]) ? { id: DB.students[0].id, name: DB.students[0].name, admno: DB.students[0].admno } : null
      };
    })()
  `);
  console.log('Live DB state:', dbInfo);

  if (dbInfo.firstStudent) {
    console.log(`Opening profile for student ID ${dbInfo.firstStudent.id} (${dbInfo.firstStudent.name})...`);
    await win.webContents.executeJavaScript(`viewProf(${dbInfo.firstStudent.id})`);
    await new Promise(r => setTimeout(r, 800));

    const profileDom = await win.webContents.executeJavaScript(`
      (() => {
        const modal = document.getElementById('profM');
        const title = document.getElementById('profModalTitle')?.textContent || '';
        const body = document.getElementById('profB');
        const topCard = body ? body.querySelector('.prof-top-card') : null;
        const oldBanner = body ? body.querySelector('.prof-identity-banner') : null;
        return {
          modalClass: modal ? modal.className : '',
          headerTitle: title,
          hasTopCard: !!topCard,
          hasOldBanner: !!oldBanner,
          bodyHtmlExcerpt: body ? body.innerHTML.slice(0, 400) : ''
        };
      })()
    `);
    console.log('Profile DOM Inspection:', profileDom);

    const artifactDir = path.resolve('C:/Users/HP/.gemini/antigravity/brain/09fab391-3131-4e63-9822-ed522316ce4e');
    const screenshot = await win.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, 'screenshot_live_start_app.png'), screenshot.toPNG());
    console.log('Screenshot saved to screenshot_live_start_app.png');
  }

  win.destroy();
  app.quit();
});
