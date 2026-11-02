// =============================================================================
// Comprehensive End-to-End Functional & Screenshot Verification
// Isolated sandbox environment - ZERO mutation to live production DB!
// =============================================================================

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

// Mock data
const mockDB = {
  nextId: 105,
  nextAdm: 1005,
  settings: {
    schoolName: 'MD Convent Public School',
    schoolAddr: 'Amanpur (Kasganj)',
    schoolPhone: '9876543210',
    schoolLogo: '',
    currentSession: '2026–27',
    admissionPrefix: 'MDC-'
  },
  sessions: [{ name: '2026–27', active: true }],
  classes: ['NC', 'KG', '1', '2', '3', '4', '5'],
  classSections: { '1': [{ name: 'A' }, { name: 'B' }] },
  students: [
    {
      id: 1,
      name: 'Aarav Sharma',
      father: 'Rajesh Sharma',
      mother: 'Pooja Sharma',
      dob: '2019-06-14',
      gender: 'Male',
      blood: 'O+',
      phone: '9876543210',
      email: '',
      address: '123, Green Park',
      city: 'Kanpur',
      state: 'Uttar Pradesh',
      pincode: '208001',
      category: 'General',
      aadhar: '123456789012',
      penNo: 'UP123456789',
      admno: 'MDC-1001',
      srNo: '1',
      rollno: '1',
      cls: '1',
      section: 'A',
      admissionDate: '2026-10-25',
      session: '2026–27',
      status: 'Active',
      photo: 'aarav_photo.png',
      legacyTransport: 'Route-5',
      legacyPreviousSchool: 'St. Mary School',
      enrollments: [{ session: '2026–27', cls: '1', section: 'A', rollno: '1', status: 'Active' }]
    },
    {
      id: 2,
      name: 'Legacy Student',
      father: 'Old Father',
      mother: 'Old Mother',
      dob: '2018-01-01',
      gender: 'Female',
      blood: 'B+',
      phone: '9123456780',
      email: '',
      address: 'Old Village, Kasganj',
      admno: 'MDC-1002',
      srNo: '',
      rollno: '2',
      cls: '2',
      section: 'A',
      admissionDate: '2025-04-01',
      session: '2026–27',
      status: 'Active',
      photo: '',
      enrollments: [{ session: '2026–27', cls: '2', section: 'A', rollno: '2', status: 'Active' }]
    }
  ],
  fees: {}
};

ipcMain.handle('load-data', () => JSON.parse(JSON.stringify(mockDB)));
ipcMain.handle('save-data', (e, d) => {
  mockDB.students = d.students;
  return { success: true };
});
ipcMain.handle('get-data-path', () => 'sandbox/test/school_data.json');
ipcMain.handle('select-student-photo', () => ({
  canceled: false,
  fileName: 'aarav_photo.png',
  previewDataUri: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="240"><rect fill="%2360a5fa" width="200" height="240"/><circle cx="100" cy="80" r="45" fill="%23ffffff"/><ellipse cx="100" cy="180" rx="65" ry="45" fill="%23ffffff"/></svg>',
  size: 38000
}));
ipcMain.handle('get-student-photo-data', (e, name) => {
  return 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="240"><rect fill="%2360a5fa" width="200" height="240"/><circle cx="100" cy="80" r="45" fill="%23ffffff"/><ellipse cx="100" cy="180" rx="65" ry="45" fill="%23ffffff"/></svg>';
});

app.whenReady().then(async () => {
  console.log('=== STARTING ADD / EDIT STUDENT REDESIGN VERIFICATION ===\n');

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../src/preload.js')
    }
  });

  await win.loadFile(path.join(__dirname, '../src/index.html'));
  await new Promise(r => setTimeout(r, 600));

  // 1. Test Add New Student Open
  const addStudentInit = await win.webContents.executeJavaScript(`
    (() => {
      openAddStudent();
      const sft = document.getElementById('sft')?.textContent;
      const admNo = document.getElementById('s_an')?.value;
      const admDt = document.getElementById('s_admdt')?.value;
      const saveBtnTxt = document.getElementById('btnSaveStudent')?.textContent?.trim();
      const activeNav = (document.querySelector('.nb.active')?.innerText || document.querySelector('.nb.active')?.textContent || '').trim();
      const sidebarBg = window.getComputedStyle(document.querySelector('.sidebar')).backgroundImage;
      const sidebarWidth = window.getComputedStyle(document.querySelector('.sidebar')).width;
      const panelHeight = document.querySelector('.stu-main-panel')?.offsetHeight;
      const windowHeight = window.innerHeight;

      return { sft, admNo, admDt, saveBtnTxt, activeNav, sidebarBg, sidebarWidth, panelHeight, windowHeight };
    })()
  `);

  console.log('1. Add Student Initial State:');
  console.log('   - Header Title:', addStudentInit.sft);
  assert.strictEqual(addStudentInit.sft, 'Add New Student');
  console.log('   - Auto Admission No:', addStudentInit.admNo);
  assert.ok(addStudentInit.admNo.startsWith('MDC-'));
  console.log('   - Auto Admission Date:', addStudentInit.admDt);
  assert.ok(addStudentInit.admDt.length >= 10);
  console.log('   - Save Button Label:', addStudentInit.saveBtnTxt);
  assert.strictEqual(addStudentInit.saveBtnTxt, 'Save Student');
  console.log('   - Active Nav Item:', addStudentInit.activeNav);
  assert.strictEqual(addStudentInit.activeNav, 'Add Student');
  console.log('   - Sidebar Width:', addStudentInit.sidebarWidth);
  assert.strictEqual(addStudentInit.sidebarWidth, '236px');
  console.log('   - Sidebar Background:', addStudentInit.sidebarBg);
  assert.ok(addStudentInit.sidebarBg.includes('gradient'));
  console.log('   - Panel Height vs Window Height:', `${addStudentInit.panelHeight}px / ${addStudentInit.windowHeight}px`);
  assert.ok(addStudentInit.panelHeight >= addStudentInit.windowHeight - 95);
  console.log('   ✓ Test 1 Passed: Add Student opens cleanly with restored sidebar & full height layout.\n');

  // Populate Add Student Form to match reference image exactly for screenshot
  try {
    await win.webContents.executeJavaScript(`
      (() => {
        showPage('addstudent');
        document.getElementById('s_an').value = 'MDC-1001';
        document.getElementById('s_admdt').value = '2026-10-25';
        document.getElementById('s_n').value = 'Aarav Sharma';
        document.getElementById('s_cl').value = '1';
        onStudentFormClassChange();
        document.getElementById('s_sec').value = 'A';
        document.getElementById('s_rn').value = '1';
        document.getElementById('s_srn').value = '1';

        document.getElementById('s_f').value = 'Rajesh Sharma';
        document.getElementById('s_m').value = 'Pooja Sharma';
        document.getElementById('s_dob').value = '2019-06-14';
        document.getElementById('s_g').value = 'Male';
        document.getElementById('s_ph').value = '9876543210';

        document.getElementById('s_ad').value = '123, Green Park';
        document.getElementById('s_city').value = 'Kanpur';
        document.getElementById('s_state').value = 'Uttar Pradesh';
        document.getElementById('s_pin').value = '208001';

        document.getElementById('s_cat').value = 'General';
        document.getElementById('s_b').value = 'O+';
        document.getElementById('s_aadhar').value = '123456789012';
        document.getElementById('s_pen').value = 'UP123456789';

        return document.querySelector('.page.active')?.id;
      })()
    `).then(activePg => console.log('   Active page before add student screenshot:', activePg));
  } catch (err) {
    console.error('ERROR in executeJavaScript:', err);
  }

  await new Promise(r => setTimeout(r, 1200));

  // Capture Add Student Screenshot
  const artifactDir = 'C:/Users/HP/.gemini/antigravity/brain/09fab391-3131-4e63-9822-ed522316ce4e';
  const addStudentImg = await win.webContents.capturePage();
  const addStudentPath = path.join(artifactDir, 'screenshot_add_student.png');
  fs.writeFileSync(addStudentPath, addStudentImg.toPNG());
  console.log('2. Add Student Screenshot captured: ' + addStudentPath);

  // 3. Test Save New Student
  const saveResult = await win.webContents.executeJavaScript(`
    (async () => {
      // Clear eid so it's a new student
      document.getElementById('s_eid').value = '';
      document.getElementById('s_n').value = 'Kavya Patel';
      document.getElementById('s_f').value = 'Suresh Patel';
      document.getElementById('s_m').value = 'Geeta Patel';
      document.getElementById('s_dob').value = '2019-03-20';
      document.getElementById('s_g').value = 'Female';
      document.getElementById('s_ph').value = '9876543219';
      document.getElementById('s_ad').value = '456, Civil Lines';
      document.getElementById('s_cl').value = '1';
      onStudentFormClassChange();
      document.getElementById('s_sec').value = 'B';
      document.getElementById('s_rn').value = '15';
      document.getElementById('s_srn').value = 'SR-999';

      document.getElementById('s_city').value = 'Kanpur';
      document.getElementById('s_state').value = 'Uttar Pradesh';
      document.getElementById('s_pin').value = '208001';
      document.getElementById('s_cat').value = 'General';
      document.getElementById('s_b').value = 'O+';
      document.getElementById('s_aadhar').value = '123456789012';
      document.getElementById('s_pen').value = 'UP123456789';

      let toastMsg = '';
      const origToast = window.toast;
      window.toast = (msg, type) => {
        toastMsg = msg + ' (' + type + ')';
        if (origToast) origToast(msg, type);
      };

      await saveStudent();
      const saved = DB.students.find(s => s.name === 'Kavya Patel');
      return {
        saved: Boolean(saved),
        toastMsg,
        studentsCount: DB.students.length,
        allNames: DB.students.map(s => s.name),
        name: saved?.name,
        penNo: saved?.penNo,
        aadhar: saved?.aadhar,
        city: saved?.city,
        state: saved?.state,
        pincode: saved?.pincode,
        category: saved?.category
      };
    })()
  `);

  console.log('3. Save Student Result:');
  console.log('   - Student found in DB:', saveResult.saved);
  assert.strictEqual(saveResult.saved, true);
  console.log('   - Name:', saveResult.name);
  assert.strictEqual(saveResult.name, 'Kavya Patel');
  console.log('   - PEN No stored:', saveResult.penNo);
  assert.strictEqual(saveResult.penNo, 'UP123456789');
  console.log('   - Aadhar No stored:', saveResult.aadhar);
  assert.strictEqual(saveResult.aadhar, '123456789012');
  console.log('   - City & State:', `${saveResult.city}, ${saveResult.state} (${saveResult.pincode})`);
  assert.strictEqual(saveResult.city, 'Kanpur');
  assert.strictEqual(saveResult.state, 'Uttar Pradesh');
  assert.strictEqual(saveResult.pincode, '208001');
  assert.strictEqual(saveResult.category, 'General');
  console.log('   ✓ Test 3 Passed: Student saved with all new fields persisted cleanly.\n');

  // 4. Test Edit Student & Geometry Validation
  const editResult = await win.webContents.executeJavaScript(`
    (async () => {
      // Edit student id 1 (Aarav Sharma) with photo so both buttons are active
      studentPhotoCache.set('sample_photo.jpg', 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg"/>');
      if (DB.students && DB.students[0]) DB.students[0].photo = 'sample_photo.jpg';
      editSt(1);
      await new Promise(r => setTimeout(r, 400));
      const sft = document.getElementById('sft')?.textContent;
      const name = document.getElementById('s_n')?.value;
      const pen = document.getElementById('s_pen')?.value;
      const aadhar = document.getElementById('s_aadhar')?.value;
      const city = document.getElementById('s_city')?.value;
      const btnTxt = document.getElementById('btnSaveStudent')?.textContent?.trim();

      // Geometry checks
      const photoCard = document.querySelector('.stu-photo-card');
      const cardRect = photoCard.getBoundingClientRect();
      const chooseBtn = document.querySelector('.stu-btn-choose');
      const chooseRect = chooseBtn.getBoundingClientRect();
      const removeBtn = document.querySelector('.stu-btn-remove');
      const removeRect = removeBtn.getBoundingClientRect();

      const chooseInside = chooseRect.left >= cardRect.left - 1 &&
                           chooseRect.right <= cardRect.right + 1 &&
                           chooseRect.top >= cardRect.top - 1 &&
                           chooseRect.bottom <= cardRect.bottom + 1;

      const removeInside = removeRect.left >= cardRect.left - 1 &&
                           removeRect.right <= cardRect.right + 1 &&
                           removeRect.top >= cardRect.top - 1 &&
                           removeRect.bottom <= cardRect.bottom + 1;

      const buttonsHorizontal = Math.abs(chooseRect.top - removeRect.top) < 4;

      // Lower 3 cards alignment
      const pCard = document.querySelector('.stu-personal-card');
      const aCard = document.querySelector('.stu-address-card');
      const oCard = document.querySelector('.stu-other-card');
      const pRect = pCard.getBoundingClientRect();
      const aRect = aCard.getBoundingClientRect();
      const oRect = oCard.getBoundingClientRect();

      const heightsEqual = Math.abs(pRect.height - aRect.height) <= 1 && Math.abs(pRect.height - oRect.height) <= 1;
      const topsAligned = Math.abs(pRect.top - aRect.top) <= 1 && Math.abs(pRect.top - oRect.top) <= 1;
      const bottomsAligned = Math.abs(pRect.bottom - aRect.bottom) <= 1 && Math.abs(pRect.bottom - oRect.bottom) <= 1;

      // Gap checks
      const pListGap = window.getComputedStyle(document.querySelector('.stu-personal-card .stu-form-list')).gap;
      const aListGap = window.getComputedStyle(document.querySelector('.stu-address-card .stu-form-list')).gap;
      const oListGap = window.getComputedStyle(document.querySelector('.stu-other-card .stu-form-list')).gap;

      // Save button inside main panel
      const panel = document.querySelector('.stu-main-panel');
      const panelRect = panel.getBoundingClientRect();
      const saveBtn = document.getElementById('btnSaveStudent');
      const saveRect = saveBtn.getBoundingClientRect();
      const saveInside = saveRect.right <= panelRect.right + 1 && saveRect.bottom <= panelRect.bottom + 1;

      return {
        sft, name, pen, aadhar, city, btnTxt,
        cardRect: { w: cardRect.width, h: cardRect.height },
        chooseRect: { l: chooseRect.left, r: chooseRect.right, b: chooseRect.bottom },
        removeRect: { l: removeRect.left, r: removeRect.right, b: removeRect.bottom },
        chooseInside, removeInside, buttonsHorizontal,
        heightsEqual, topsAligned, bottomsAligned,
        pListGap, aListGap, oListGap, saveInside
      };
    })()
  `);

  console.log('4. Edit Student Loaded State & Geometry Containment:');
  console.log('   - Header Title:', editResult.sft);
  assert.ok(editResult.sft.includes('Edit Student'));
  console.log('   - Student Name loaded:', editResult.name);
  assert.strictEqual(editResult.name, 'Aarav Sharma');
  console.log('   - PEN No loaded:', editResult.pen);
  assert.strictEqual(editResult.pen, 'UP123456789');
  console.log('   - Aadhar No loaded:', editResult.aadhar);
  assert.strictEqual(editResult.aadhar, '123456789012');
  console.log('   - City loaded:', editResult.city);
  assert.strictEqual(editResult.city, 'Kanpur');
  console.log('   - Button text changed to:', editResult.btnTxt);
  assert.strictEqual(editResult.btnTxt, 'Update Student');

  console.log('   - Choose Photo button inside card:', editResult.chooseInside);
  assert.strictEqual(editResult.chooseInside, true);
  console.log('   - Remove button inside card:', editResult.removeInside);
  assert.strictEqual(editResult.removeInside, true);
  console.log('   - Buttons horizontally aligned:', editResult.buttonsHorizontal);
  assert.strictEqual(editResult.buttonsHorizontal, true);

  console.log('   - Lower 3 cards heights equal:', editResult.heightsEqual);
  assert.strictEqual(editResult.heightsEqual, true);
  console.log('   - Lower 3 cards tops aligned:', editResult.topsAligned);
  assert.strictEqual(editResult.topsAligned, true);
  console.log('   - Lower 3 cards bottoms aligned:', editResult.bottomsAligned);
  assert.strictEqual(editResult.bottomsAligned, true);

  console.log('   - Compact form list gap (10px):', editResult.pListGap);
  assert.strictEqual(editResult.pListGap, '10px');
  assert.strictEqual(editResult.aListGap, '10px');
  assert.strictEqual(editResult.oListGap, '10px');

  console.log('   - Save button inside main panel at bottom-right:', editResult.saveInside);
  assert.strictEqual(editResult.saveInside, true);

  console.log('   ✓ Test 4 Passed: Edit Student populates all fields with 100% contained geometry and aligned cards.\n');

  // Capture Edit Student Screenshot
  await new Promise(r => setTimeout(r, 400));
  const editStudentImg = await win.webContents.capturePage();
  const editStudentPath = path.join(artifactDir, 'screenshot_edit_student.png');
  fs.writeFileSync(editStudentPath, editStudentImg.toPNG());
  console.log('5. Edit Student Screenshot captured: ' + editStudentPath);

  // 6. Test Updating Edited Student and verifying legacy property preservation
  const updateResult = await win.webContents.executeJavaScript(`
    (async () => {
      document.getElementById('s_f').value = 'Rajesh Kumar Sharma';
      document.getElementById('s_pen').value = 'UP999888777';
      await saveStudent();
      const updated = DB.students.find(s => s.id === 1);
      return {
        father: updated?.father,
        penNo: updated?.penNo,
        legacyTransport: updated?.legacyTransport,
        legacyPreviousSchool: updated?.legacyPreviousSchool
      };
    })()
  `);

  console.log('6. Update Student & Legacy Preservation:');
  console.log('   - Updated Father:', updateResult.father);
  assert.strictEqual(updateResult.father, 'Rajesh Kumar Sharma');
  console.log('   - Updated PEN No:', updateResult.penNo);
  assert.strictEqual(updateResult.penNo, 'UP999888777');
  console.log('   - Legacy Transport intact:', updateResult.legacyTransport);
  assert.strictEqual(updateResult.legacyTransport, 'Route-5');
  console.log('   - Legacy Previous School intact:', updateResult.legacyPreviousSchool);
  assert.strictEqual(updateResult.legacyPreviousSchool, 'St. Mary School');
  console.log('   ✓ Test 6 Passed: Updates succeed without modifying or deleting legacy properties.\n');

  // 7. Test Legacy Student Load without PEN No.
  const legacyLoadResult = await win.webContents.executeJavaScript(`
    (() => {
      editSt(2); // Legacy Student with no PEN No.
      const pen = document.getElementById('s_pen')?.value;
      const aadhar = document.getElementById('s_aadhar')?.value;
      const city = document.getElementById('s_city')?.value;
      return { pen, aadhar, city };
    })()
  `);

  console.log('7. Legacy Student without PEN No. loaded:');
  console.log('   - PEN input value:', `"${legacyLoadResult.pen}"`);
  assert.strictEqual(legacyLoadResult.pen, '');
  console.log('   - Aadhar input value:', `"${legacyLoadResult.aadhar}"`);
  assert.strictEqual(legacyLoadResult.aadhar, '');
  console.log('   ✓ Test 7 Passed: Older student records load gracefully without errors.\n');

  console.log('=== ALL FUNCTIONAL & UI TESTS PASSED SUCCESSFULLY! ===');
  win.destroy();
  app.quit();
});
