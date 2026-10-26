const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

// ==============================================================================
// PERSISTENT STORAGE PATH RESOLUTION
// Dedicated persistent storage folder: Documents/MDConvent_SMS/
//   - school_data.json   (Live persistent database)
//   - backups/           (Automatically managed timestamped backups)
//   - Student_Photos/    (Optional student photograph storage)
// ==============================================================================
function resolveStoragePaths() {
  const docs = app.getPath('documents');
  const primaryDir = path.join(docs, 'MDConvent_SMS');
  const fallbackDir = process.env.USERPROFILE 
    ? path.join(process.env.USERPROFILE, 'Documents', 'MDConvent_SMS') 
    : null;

  let chosenPath = primaryDir;
  if (!fs.existsSync(path.join(primaryDir, 'school_data.json')) && fallbackDir && fs.existsSync(path.join(fallbackDir, 'school_data.json'))) {
    chosenPath = fallbackDir;
  }

  const dataFilePath = path.join(chosenPath, 'school_data.json');
  const backupsDir = path.join(chosenPath, 'backups');
  const photosDir = path.join(chosenPath, 'Student_Photos');

  if (!fs.existsSync(chosenPath)) fs.mkdirSync(chosenPath, { recursive: true });
  if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });
  if (!fs.existsSync(photosDir)) fs.mkdirSync(photosDir, { recursive: true });

  return { userDataPath: chosenPath, dataFilePath, backupsDir, photosDir };
}

const { userDataPath, dataFilePath, backupsDir, photosDir } = resolveStoragePaths();

let mainWindow;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 820, minWidth: 1024, minHeight: 680,
    title: 'School Management System',
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'src', 'preload.js')
    },
    show: false,
    backgroundColor: '#f4f6f9'
  });
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.once('ready-to-show', () => { mainWindow.show(); mainWindow.maximize(); });
  mainWindow.setMenuBarVisibility(false);

  // Security: Prevent unauthorized window navigation away from the local app
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) {
      event.preventDefault();
    }
  });

  // Security: Open external links in default system browser, deny popup windows
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Security: Disable DevTools shortcut in production packaged app
  if (app.isPackaged) {
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if ((input.control && input.shift && input.key.toLowerCase() === 'i') || input.key === 'F12') {
        event.preventDefault();
      }
    });
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ==============================================================================
// AUTOMATIC BACKUP & DATA RETENTION ENGINE
// ==============================================================================
const BACKUP_RETENTION_LIMIT = 10;
let lastBackupTime = 0;

function isValidDatabasePayload(data) {
  return Boolean(
    data &&
    typeof data === 'object' &&
    Array.isArray(data.students) &&
    data.settings &&
    typeof data.settings === 'object'
  );
}

function safeAtomicWriteSync(targetPath, content) {
  const tempFile = targetPath + '.tmp';
  fs.writeFileSync(tempFile, content, 'utf8');
  let attempts = 0;
  const maxAttempts = 5;
  while (attempts < maxAttempts) {
    try {
      fs.renameSync(tempFile, targetPath);
      return;
    } catch(err) {
      attempts++;
      if (attempts >= maxAttempts) {
        try { fs.unlinkSync(tempFile); } catch(_) {}
        throw err;
      }
      const waitTill = Date.now() + 50;
      while (Date.now() < waitTill) {} // synchronous micro-sleep for transient Windows file lock
    }
  }
}

function getAvailableBackups() {
  try {
    if (!fs.existsSync(backupsDir)) return [];
    return fs.readdirSync(backupsDir)
      .filter(f => f.startsWith('backup_') && f.endsWith('.json'))
      .map(f => {
        const full = path.join(backupsDir, f);
        try {
          return { name: f, path: full, mtime: fs.statSync(full).mtimeMs };
        } catch(_) { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => b.mtime - a.mtime); // descending (newest first)
  } catch(_) {
    return [];
  }
}

function getAvailableBackupsWithValidation() {
  try {
    if (!fs.existsSync(backupsDir)) return [];
    return fs.readdirSync(backupsDir)
      .filter(f => f.startsWith('backup_') && f.endsWith('.json'))
      .map(f => {
        const full = path.join(backupsDir, f);
        try {
          const stat = fs.statSync(full);
          let isValid = false;
          let studentCount = 0;
          let schoolName = '';
          try {
            const parsed = JSON.parse(fs.readFileSync(full, 'utf8'));
            if (isValidDatabasePayload(parsed)) {
              isValid = true;
              studentCount = Array.isArray(parsed.students) ? parsed.students.length : 0;
              schoolName = (parsed.settings && parsed.settings.schoolName) || 'School Management System';
            }
          } catch (_) {
            isValid = false;
          }
          return {
            name: f,
            path: full,
            mtime: stat.mtimeMs,
            dateFormatted: new Date(stat.mtimeMs).toLocaleString(),
            sizeBytes: stat.size,
            sizeFormatted: (stat.size / 1024).toFixed(1) + ' KB',
            isValid,
            studentCount,
            schoolName
          };
        } catch(_) { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => b.mtime - a.mtime);
  } catch(_) {
    return [];
  }
}

function pruneOldBackups(maxRetain = BACKUP_RETENTION_LIMIT) {
  try {
    const backups = getAvailableBackups();
    if (backups.length > maxRetain) {
      const toRemove = backups.slice(maxRetain);
      for (const item of toRemove) {
        try {
          fs.unlinkSync(item.path);
          console.log(`[Backup Engine] Pruned expired backup: ${item.name}`);
        } catch(e) {
          console.warn(`[Backup Engine] Could not delete expired backup ${item.name}:`, e.message);
        }
      }
    }
  } catch(err) {
    console.warn(`[Backup Engine] Pruning error:`, err.message);
  }
}

function createAutomaticBackup(data, reason = 'auto') {
  try {
    if (!isValidDatabasePayload(data)) {
      console.warn(`[Backup Engine] Skipped backup (${reason}): Invalid database payload.`);
      return { success: false, error: 'INVALID_PAYLOAD' };
    }

    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    const filename = `backup_${timestamp}_${reason}.json`;
    const targetFile = path.join(backupsDir, filename);

    // Atomic write
    safeAtomicWriteSync(targetFile, JSON.stringify(data, null, 2));

    // Verify
    const raw = fs.readFileSync(targetFile, 'utf8');
    JSON.parse(raw);

    lastBackupTime = Date.now();
    pruneOldBackups(BACKUP_RETENTION_LIMIT);

    console.log(`[Backup Engine] Automatic backup created successfully: ${filename}`);
    return { success: true, filename, path: targetFile };
  } catch(err) {
    console.error(`[Backup Engine] Automatic backup failed (${reason}):`, err);
    return { success: false, error: err.message };
  }
}

function triggerStartupBackupIfNeeded(parsedData) {
  try {
    const existing = getAvailableBackups();
    const now = Date.now();
    const twelveHours = 12 * 60 * 60 * 1000;
    if (existing.length === 0 || (now - existing[0].mtime) > twelveHours) {
      createAutomaticBackup(parsedData, 'startup');
    }
  } catch(_) {}
}

// ==============================================================================
// IPC HANDLERS
// ==============================================================================

// Load data with integrity protection
ipcMain.handle('load-data', () => {
  try {
    if (fs.existsSync(dataFilePath)) {
      const raw = fs.readFileSync(dataFilePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (!isValidDatabasePayload(parsed)) {
        return { error: 'INVALID_DATABASE', message: 'school_data.json exists but does not contain valid school data structure.' };
      }
      triggerStartupBackupIfNeeded(parsed);
      return parsed;
    }

    // Database missing!
    const available = getAvailableBackupsWithValidation();
    if (available.length > 0) {
      // STOP & REPORT per Requirement 6: Do not silently restore or create empty db
      return {
        error: 'DATABASE_MISSING',
        message: 'The live database file school_data.json is missing in Documents/MDConvent_SMS, but automatically managed backups were found in the backups folder.',
        hasBackups: true,
        hasValidBackups: available.some(b => b.isValid),
        availableBackups: available
      };
    }

    // Fresh clean install on a new computer
    return { isFreshInstall: true };
  } catch(e) {
    console.error('Failed to load data:', e);
    try {
      if (fs.existsSync(dataFilePath)) {
        const corruptName = `corrupted_${Date.now()}.json`;
        const corruptPath = path.join(backupsDir, corruptName);
        fs.copyFileSync(dataFilePath, corruptPath);
        return { error: 'CORRUPTED_DATA', message: e.message, backupPath: corruptPath };
      }
    } catch(_) {}
    return { error: 'CORRUPTED_DATA', message: e.message };
  }
});

// Atomic save data with safety temp file, payload validation, sync, and scheduled backup
ipcMain.handle('save-data', (e, data) => {
  try {
    if (!isValidDatabasePayload(data)) {
      return { success: false, error: 'Invalid data payload: missing required students or settings structure' };
    }

    // Safety guard: If existing data on disk has students but incoming payload is empty,
    // take an emergency snapshot in backups/ before writing
    if (fs.existsSync(dataFilePath) && data.students.length === 0) {
      try {
        const rawExisting = fs.readFileSync(dataFilePath, 'utf8');
        const parsedExisting = JSON.parse(rawExisting);
        if (Array.isArray(parsedExisting.students) && parsedExisting.students.length > 0) {
          createAutomaticBackup(parsedExisting, 'pre_empty_save');
        }
      } catch(_) {}
    }

    safeAtomicWriteSync(dataFilePath, JSON.stringify(data, null, 2));

    // Scheduled periodic backup check (every 4 hours of active use)
    const fourHours = 4 * 60 * 60 * 1000;
    if (Date.now() - lastBackupTime > fourHours) {
      createAutomaticBackup(data, 'scheduled');
    }

    return { success: true };
  } catch(e) {
    console.error('Failed to save data:', e);
    return { success: false, error: e.message };
  }
});

// Manual file dialog backup (User export)
ipcMain.handle('backup-data', async (e, data) => {
  const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const schoolName = (data && data.settings && data.settings.schoolName)
    ? data.settings.schoolName.replace(/[^a-zA-Z0-9]/g, '_')
    : 'School';
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Backup School Data',
    defaultPath: path.join(app.getPath('desktop'), `${schoolName}_Backup_${dateStr}.json`),
    filters: [{ name: 'JSON Backup', extensions: ['json'] }]
  });
  if (canceled || !filePath) return { success: false, canceled: true };
  try {
    safeAtomicWriteSync(filePath, JSON.stringify(data, null, 2));
    return { success: true, filePath };
  } catch(e) {
    return { success: false, error: e.message };
  }
});

// Restore backup file selection and parsing
ipcMain.handle('restore-data', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Restore Backup File',
    filters: [{ name: 'JSON Backup', extensions: ['json'] }],
    properties: ['openFile']
  });
  if (canceled || !filePaths || !filePaths.length) return null;
  try {
    const content = fs.readFileSync(filePaths[0], 'utf8');
    const parsed = JSON.parse(content);
    return { data: parsed, filePath: filePaths[0] };
  } catch(e) {
    return { error: 'Invalid JSON file: ' + e.message };
  }
});

// Handler to list available backups with metadata & schema validation status
ipcMain.handle('list-backups', () => {
  return getAvailableBackupsWithValidation();
});

// Handler to safely restore a specific backup from the backups directory
ipcMain.handle('restore-specific-backup', async (e, filename) => {
  try {
    if (!filename || typeof filename !== 'string') {
      return { success: false, error: 'Invalid backup filename specified' };
    }
    // Prevent path traversal
    const safeName = path.basename(filename);
    const targetBackupPath = path.join(backupsDir, safeName);
    if (!fs.existsSync(targetBackupPath)) {
      return { success: false, error: 'Backup file does not exist: ' + safeName };
    }

    const raw = fs.readFileSync(targetBackupPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!isValidDatabasePayload(parsed)) {
      return { success: false, error: 'Backup file failed validation: missing required students or settings structure' };
    }

    // If an existing school_data.json exists on disk, create an emergency pre-restore snapshot
    if (fs.existsSync(dataFilePath)) {
      try {
        const rawExisting = fs.readFileSync(dataFilePath, 'utf8');
        const parsedExisting = JSON.parse(rawExisting);
        if (isValidDatabasePayload(parsedExisting)) {
          createAutomaticBackup(parsedExisting, 'pre_restore');
        }
      } catch (_) {}
    }

    // Safe atomic restore
    safeAtomicWriteSync(dataFilePath, JSON.stringify(parsed, null, 2));

    // Verify restored file can be read and parsed from disk
    const verifyRaw = fs.readFileSync(dataFilePath, 'utf8');
    const verifyParsed = JSON.parse(verifyRaw);
    if (!isValidDatabasePayload(verifyParsed)) {
      return { success: false, error: 'Restored database verification failed after writing to disk' };
    }

    return { success: true, filename: safeName, data: verifyParsed };
  } catch (err) {
    console.error('Failed to restore specific backup:', err);
    return { success: false, error: err.message };
  }
});

// Pre-restore safety snapshot creation in backups/
ipcMain.handle('create-safety-backup', async () => {
  try {
    if (fs.existsSync(dataFilePath)) {
      const raw = fs.readFileSync(dataFilePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (isValidDatabasePayload(parsed)) {
        const res = createAutomaticBackup(parsed, 'pre_restore');
        return { success: res.success, path: res.path };
      }
    }
    return { success: true, path: null };
  } catch(e) {
    return { success: false, error: e.message };
  }
});

// Explicit automatic backup trigger endpoint (e.g. before promotions, migrations)
ipcMain.handle('create-automatic-backup', async (e, { reason }) => {
  try {
    if (fs.existsSync(dataFilePath)) {
      const raw = fs.readFileSync(dataFilePath, 'utf8');
      const parsed = JSON.parse(raw);
      return createAutomaticBackup(parsed, reason || 'manual');
    }
    return { success: false, error: 'Database file not found' };
  } catch(e) {
    return { success: false, error: e.message };
  }
});

// Select school logo image file and return base64 data URI
ipcMain.handle('select-logo', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Select School Logo',
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'svg'] }],
    properties: ['openFile']
  });
  if (canceled || !filePaths || !filePaths.length) return null;
  try {
    const filePath = filePaths[0];
    const ext = path.extname(filePath).slice(1).toLowerCase();
    const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    const base64 = fs.readFileSync(filePath, 'base64');
    return `data:${mime};base64,${base64}`;
  } catch(e) {
    return null;
  }
});

// Export CSV
ipcMain.handle('export-csv', async (e, { filename, content }) => {
  const safeFilename = path.basename(String(filename || 'export.csv')).replace(/[<>:"/\\|?*]/g, '_');
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Export CSV',
    defaultPath: path.join(app.getPath('desktop'), safeFilename),
    filters: [{ name: 'CSV File', extensions: ['csv'] }]
  });
  if (canceled || !filePath) return { success: false, canceled: true };
  try {
    // Add UTF-8 BOM so Excel opens Hindi / special characters without scrambling
    const bomContent = '\uFEFF' + String(content || '');
    fs.writeFileSync(filePath, bomContent, 'utf8');
    return { success: true, filePath };
  } catch(e) {
    return { success: false, error: e.message };
  }
});

// PRINT - write temp HTML file and open in default browser for printing
ipcMain.handle('print-content', async (e, html) => {
  if (typeof html !== 'string') return { success: false, error: 'Invalid HTML payload' };
  try {
    const tmpFile = path.join(os.tmpdir(), 'sms_print_' + Date.now() + '.html');
    const printHtml = html.replace('</body>', '<script>window.onload=function(){setTimeout(function(){window.print();},500);}<\/script></body>');
    fs.writeFileSync(tmpFile, printHtml, 'utf8');
    await shell.openExternal('file://' + tmpFile);
    setTimeout(() => { try { fs.unlinkSync(tmpFile); } catch(e){} }, 30000);
    return { success: true };
  } catch(e) {
    return { success: false, error: e.message };
  }
});

// Get data path
ipcMain.handle('get-data-path', () => dataFilePath);

// ==============================================================================
// STUDENT PHOTOGRAPH MANAGEMENT (OPTIONAL)
// ==============================================================================
const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MB maximum
const ALLOWED_PHOTO_EXTS = ['jpg', 'jpeg', 'png', 'webp'];

ipcMain.handle('select-student-photo', async () => {
  const win = (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isMinimized()) 
    ? mainWindow 
    : (BrowserWindow.getFocusedWindow() || null);
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Select Student Photograph (Optional)',
    filters: [
      { name: 'Image Files (*.jpg;*.jpeg;*.png;*.webp)', extensions: ALLOWED_PHOTO_EXTS },
      { name: 'All Files (*.*)', extensions: ['*'] }
    ],
    properties: ['openFile']
  });
  if (canceled || !filePaths || !filePaths.length) return { canceled: true, selected: false };

  const filePath = filePaths[0];
  try {
    const stats = fs.statSync(filePath);
    if (stats.size > MAX_PHOTO_BYTES) {
      return {
        error: `Selected image size (${(stats.size / (1024 * 1024)).toFixed(1)} MB) exceeds the 5 MB limit. Please select a photo under 5 MB.`
      };
    }

    const ext = path.extname(filePath).slice(1).toLowerCase();
    if (!ALLOWED_PHOTO_EXTS.includes(ext)) {
      return { error: 'Invalid file format. Please select a JPG, JPEG, PNG, or WebP photo.' };
    }

    const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    const base64 = fs.readFileSync(filePath, 'base64');
    const previewDataUri = `data:${mime};base64,${base64}`;

    return {
      canceled: false,
      selected: true,
      sourcePath: filePath,
      previewDataUri,
      fileName: path.basename(filePath),
      ext: ext === 'jpeg' ? 'jpg' : ext,
      size: stats.size
    };
  } catch (err) {
    return { error: 'Failed to access selected photo: ' + err.message };
  }
});

ipcMain.handle('save-student-photo', async (e, { sourcePath, admNo, existingPhoto }) => {
  try {
    if (!sourcePath || !fs.existsSync(sourcePath)) {
      return { error: 'Source photo file not found on disk.' };
    }

    const stats = fs.statSync(sourcePath);
    if (stats.size > MAX_PHOTO_BYTES) {
      return { error: 'Selected image exceeds the 5 MB file size limit.' };
    }

    const ext = path.extname(sourcePath).slice(1).toLowerCase();
    const normExt = ext === 'jpeg' ? 'jpg' : ext;
    if (!['jpg', 'png', 'webp'].includes(normExt)) {
      return { error: 'Unsupported photo format: .' + ext };
    }

    if (!fs.existsSync(photosDir)) {
      fs.mkdirSync(photosDir, { recursive: true });
    }

    // Generate unique, filesystem-safe filename: MDC_1001_a8f31c.jpg
    const safeAdm = String(admNo || 'STU').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    const randomSuffix = crypto.randomBytes(3).toString('hex');
    const destFilename = `${safeAdm}_${randomSuffix}.${normExt}`;
    const destPath = path.join(photosDir, destFilename);

    fs.copyFileSync(sourcePath, destPath);

    // After successful copy, safely remove previous photo if replacing
    if (existingPhoto && typeof existingPhoto === 'string') {
      const oldSafe = path.basename(existingPhoto);
      const oldPath = path.join(photosDir, oldSafe);
      if (fs.existsSync(oldPath) && oldSafe !== destFilename) {
        try { fs.unlinkSync(oldPath); } catch (_) {}
      }
    }

    return { success: true, filename: destFilename };
  } catch (err) {
    console.error('save-student-photo error:', err);
    return { error: 'Failed to save student photo: ' + err.message };
  }
});

ipcMain.handle('delete-student-photo', async (e, filename) => {
  try {
    if (!filename || typeof filename !== 'string') return { success: true };
    const safeFilename = path.basename(filename);
    const targetPath = path.join(photosDir, safeFilename);
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
    }
    return { success: true };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('get-student-photo-data', async (e, filename) => {
  try {
    if (!filename || typeof filename !== 'string') return null;
    const safeFilename = path.basename(filename);
    const targetPath = path.join(photosDir, safeFilename);
    if (!fs.existsSync(targetPath)) return null;

    const ext = path.extname(safeFilename).slice(1).toLowerCase();
    const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    const base64 = fs.readFileSync(targetPath, 'base64');
    return `data:${mime};base64,${base64}`;
  } catch (_) {
    return null;
  }
});

ipcMain.handle('get-student-photos-path', () => photosDir);
