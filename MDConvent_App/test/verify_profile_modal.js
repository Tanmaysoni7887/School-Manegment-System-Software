// =============================================================================
// Comprehensive Verification Test:
// 1. Profile Header improvements (large typography, balanced layout, TA avatar removed).
// 2. Student photo display (large portrait, No Photo placeholder, actual photo).
// 3. Bug 1: Student photo synchronization (Cases A, B, C, D).
// 4. Bug 2: View Fee Ledger loads exact selected student's fee ledger.
// 5. High-resolution screenshot capture.
// =============================================================================

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

const mockDB = {
  nextId: 105,
  nextAdm: 1005,
  settings: {
    schoolName: 'MD Convent Public School',
    schoolAddr: 'Amanpur, Kasganj Road, Uttar Pradesh',
    schoolPhone: '9876543210',
    schoolLogo: '',
    currentSession: '2026-27',
    admissionPrefix: 'MDC-'
  },
  sessions: [{ name: '2026-27', active: true }],
  classes: ['NC', 'KG', '1', '2', '3', '4', '5'],
  classSections: { 'NC': [{ name: 'A' }, { name: 'B' }], '1': [{ name: 'A' }, { name: 'B' }] },
  feeStructures: {
    'NC': { tuition: 2450, transport: 0, admission: 0 },
    '1': { tuition: 3500, transport: 0, admission: 0 }
  },
  students: [
    {
      id: 101,
      name: 'Tushar Agarwal',
      father: 'Mahendra Agarwal',
      mother: 'Meena Devi',
      dob: '2023-09-21',
      gender: 'Male',
      blood: 'A+',
      category: 'General',
      session: '2026-27',
      cls: 'NC',
      section: 'A',
      admissionDate: '2023-04-01',
      address: 'Near Gandhi Murti, Ganjdundwara',
      city: 'Ganjdundwara',
      state: 'Uttar Pradesh',
      pincode: '207242',
      phone: '9849059182',
      email: 'tushar.1@example.com',
      aadhar: '9876 5432 1098',
      penNo: 'PEN1234567',
      admno: 'MDC-1001',
      srNo: 'SR-101',
      rollno: '1',
      status: 'Active',
      photo: 'tushar.jpg'
    },
    {
      id: 102,
      name: 'Priya Sharma',
      father: 'Ramesh Sharma',
      mother: '',
      dob: '2020-11-15',
      gender: 'Female',
      blood: '',
      category: 'General',
      session: '2026-27',
      cls: '1',
      section: 'B',
      admissionDate: '2024-04-01',
      address: 'Main Market Road',
      city: 'Amanpur',
      state: '',
      pincode: '',
      phone: '9837123456',
      email: '',
      aadhar: '',
      penNo: '',
      admno: 'MDC-1002',
      srNo: '',
      rollno: '4',
      status: 'Inactive',
      photo: ''
    }
  ],
  fees: {
    '101_1': [
      { id: 'f1', type: 'Tuition Fee', title: 'Tuition Fee Q1', amount: 2450, paid: true, enabled: true }
    ],
    '102_1': [
      { id: 'f2', type: 'Tuition Fee', title: 'Tuition Fee Q1', amount: 3500, paid: true, enabled: true },
      { id: 'f3', type: 'Exam Fee', title: 'Exam Fee', amount: 1500, paid: false, enabled: true }
    ]
  }
};

// Realistic mock student portrait
const sampleSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="360" viewBox="0 0 300 360">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#475569"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
    <linearGradient id="skinGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#fed7aa"/>
      <stop offset="100%" stop-color="#fba868"/>
    </linearGradient>
  </defs>
  <rect width="300" height="360" fill="url(#bgGrad)"/>
  <path d="M40 360 C40 250 80 220 150 220 C220 220 260 250 260 360 Z" fill="#3b82f6"/>
  <polygon points="150,220 135,275 150,295 165,275" fill="#dc2626"/>
  <ellipse cx="150" cy="135" rx="62" ry="72" fill="url(#skinGrad)"/>
  <path d="M82 125 C82 65 118 45 150 45 C182 45 218 65 218 125 C202 90 182 80 150 80 C118 80 98 90 82 125 Z" fill="#0f172a"/>
  <circle cx="130" cy="130" r="5" fill="#0f172a"/>
  <circle cx="170" cy="130" r="5" fill="#0f172a"/>
  <path d="M136 165 Q150 180 164 165" stroke="#0f172a" stroke-width="3" fill="none" stroke-linecap="round"/>
</svg>`;
const samplePhotoUri = 'data:image/svg+xml;base64,' + Buffer.from(sampleSvg).toString('base64');

let savedPhotosOnDisk = { 'tushar.jpg': samplePhotoUri };

ipcMain.handle('load-data', () => JSON.parse(JSON.stringify(mockDB)));
ipcMain.handle('save-data', (e, d) => {
  mockDB.students = d.students;
  return { success: true };
});
ipcMain.handle('get-data-path', () => 'sandbox/test/school_data.json');
ipcMain.handle('get-student-photo-data', (e, name) => savedPhotosOnDisk[name] || null);
ipcMain.handle('delete-student-photo', (e, name) => {
  delete savedPhotosOnDisk[name];
  return { success: true };
});
ipcMain.handle('select-student-photo', () => ({
  canceled: false,
  fileName: 'new_photo.png',
  sourcePath: 'sandbox/fake_path/new_photo.png',
  previewDataUri: samplePhotoUri,
  size: 45000
}));
ipcMain.handle('save-student-photo', (e, { admNo }) => {
  const newName = `${admNo}_saved.png`;
  savedPhotosOnDisk[newName] = samplePhotoUri;
  return { success: true, filename: newName };
});

app.whenReady().then(async () => {
  console.log('=== STARTING STUDENT PROFILE & BUG FIXES VERIFICATION ===\n');
  const artifactDir = path.resolve('C:/Users/HP/.gemini/antigravity/brain/09fab391-3131-4e63-9822-ed522316ce4e');

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, '../src/preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  await win.loadFile(path.join(__dirname, '../src/index.html'));
  
  // Wait until DB is loaded
  await win.webContents.executeJavaScript(`
    new Promise((resolve) => {
      let count = 0;
      const check = () => {
        count++;
        if ((typeof DB !== 'undefined' && DB && DB.students && DB.students.length > 0) || count > 40) {
          resolve();
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    })
  `);
  await new Promise(r => setTimeout(r, 400));

  console.log('1. Verifying Student Profile modal dialog structure and header...');
  const modalInfo = await win.webContents.executeJavaScript(`
    (() => {
      const modal = document.getElementById('profM');
      const dialog = modal ? modal.querySelector('.prof-modal-dialog') : null;
      const header = dialog ? dialog.querySelector('.prof-modal-header') : null;
      const title = header ? header.querySelector('.prof-modal-title') : null;
      const icon = header ? header.querySelector('.prof-title-icon-badge') : null;
      const closeBtn = header ? header.querySelector('.prof-modal-close-btn') : null;
      const body = dialog ? dialog.querySelector('#profB') : null;
      return {
        hasModal: !!modal,
        hasDialog: !!dialog,
        hasHeader: !!header,
        titleText: title ? title.textContent.trim() : '',
        hasIcon: !!icon,
        hasCloseBtn: !!closeBtn,
        hasBody: !!body
      };
    })()
  `);

  assert.strictEqual(modalInfo.hasModal, true, 'Modal #profM must exist');
  assert.strictEqual(modalInfo.hasDialog, true, '.prof-modal-dialog must exist');
  assert.strictEqual(modalInfo.hasHeader, true, '.prof-modal-header must exist');
  assert.strictEqual(modalInfo.titleText, 'Student Profile', 'Title must be "Student Profile"');
  assert.strictEqual(modalInfo.hasIcon, true, 'Title icon badge must exist');
  assert.strictEqual(modalInfo.hasCloseBtn, true, 'Close button must exist');
  assert.strictEqual(modalInfo.hasBody, true, 'Body #profB must exist');
  console.log('   ✓ Modal dialog container, header, icon badge and close button verified.');

  console.log('\n2. Testing viewProf(101) - Red Banner Typography & TA Avatar Removal...');
  await win.webContents.executeJavaScript(`viewProf(101)`);
  await new Promise(r => setTimeout(r, 600));

  const prof101Data = await win.webContents.executeJavaScript(`
    (() => {
      const modal = document.getElementById('profM');
      const isVisible = modal.classList.contains('show') || getComputedStyle(modal).display !== 'none';
      const body = document.getElementById('profB');

      // Header components
      const photoBox = body.querySelector('.prof-photo-box');
      const photoImg = photoBox ? photoBox.querySelector('#profAvatarImg') : null;
      const photoPlaceholder = photoBox ? photoBox.querySelector('#profAvatarPlaceholder') : null;
      const banner = body.querySelector('.prof-identity-banner');
      const initials = banner ? banner.querySelector('.prof-initials-badge') : null;
      const name = banner ? banner.querySelector('.prof-identity-name') : null;
      const cls = banner ? banner.querySelector('.prof-identity-class') : null;
      const statusPill = banner ? banner.querySelector('.prof-status-pill-top') : null;
      const metaRow1 = banner ? banner.querySelector('.prof-identity-meta-row1') : null;
      const metaRow2 = banner ? banner.querySelector('.prof-identity-meta-row2') : null;
      const metaWrap = banner ? banner.querySelector('.prof-identity-meta-wrap') : null;
      const bannerDirectChildrenCount = banner ? banner.children.length : 0;

      // Address Card rows
      const addrCard = body.querySelector('.prof-card-pink');
      const addrRows = addrCard ? Array.from(addrCard.querySelectorAll('.prof-row')).map(r => ({
        lbl: r.querySelector('.prof-row-lbl')?.textContent?.trim() || '',
        val: r.querySelector('.prof-row-val')?.textContent?.trim() || ''
      })) : [];

      // Cards
      const cards = body.querySelectorAll('.prof-cards-grid .prof-card');
      const cardTitles = Array.from(cards).map(c => c.querySelector('.prof-card-title')?.textContent?.trim() || '');

      // Action buttons
      const editBtn = body.querySelector('.prof-btn-edit');
      const ledgerBtn = body.querySelector('.prof-btn-ledger');

      return {
        isVisible,
        hasPhotoBox: !!photoBox,
        photoImgDisplay: photoImg ? getComputedStyle(photoImg).display : '',
        placeholderDisplay: photoPlaceholder ? getComputedStyle(photoPlaceholder).display : '',
        hasInitialsBadge: !!initials,
        hasMetaWrap: !!metaWrap,
        bannerDirectChildrenCount,
        nameText: name ? name.textContent.trim() : '',
        nameFontSize: name ? getComputedStyle(name).fontSize : '',
        clsText: cls ? cls.textContent.trim() : '',
        clsFontSize: cls ? getComputedStyle(cls).fontSize : '',
        statusText: statusPill ? statusPill.textContent.trim() : '',
        metaRow1: metaRow1 ? metaRow1.textContent.replace(/\\s+/g, ' ').trim() : '',
        metaRow2: metaRow2 ? metaRow2.textContent.replace(/\\s+/g, ' ').trim() : '',
        addrRows,
        cardsCount: cards.length,
        cardTitles,
        hasEditBtn: !!editBtn,
        hasLedgerBtn: !!ledgerBtn
      };
    })()
  `);

  assert.strictEqual(prof101Data.isVisible, true, 'Modal must be visible');
  assert.strictEqual(prof101Data.hasInitialsBadge, false, 'Circular initials avatar (TA) MUST be completely removed from red banner');
  assert.strictEqual(prof101Data.nameText, 'Tushar Agarwal', 'Student name must be "Tushar Agarwal"');
  assert.strictEqual(parseFloat(prof101Data.nameFontSize) >= 24, true, `Name font size must be large (>=24px, got ${prof101Data.nameFontSize})`);
  assert.strictEqual(parseFloat(prof101Data.clsFontSize) >= 14, true, `Class font size must be enhanced (>=14px, got ${prof101Data.clsFontSize})`);
  assert.strictEqual(prof101Data.clsText.includes('Nursery (NC) – Section A'), true, 'Class must show "Nursery (NC) – Section A"');
  assert.strictEqual(prof101Data.statusText.includes('Active'), true, 'Status badge must show "Active"');
  assert.strictEqual(prof101Data.hasMetaWrap, false, 'prof-identity-meta-wrap must be removed so rows distribute evenly');
  assert.strictEqual(prof101Data.bannerDirectChildrenCount, 3, 'prof-identity-banner must have exactly 3 evenly distributed children (top, meta1, meta2)');
  assert.strictEqual(prof101Data.metaRow1.includes('MDC-1001'), true, 'Admission No must be MDC-1001');
  assert.strictEqual(prof101Data.metaRow1.includes('SR-101'), true, 'SR No must be SR-101');
  assert.strictEqual(prof101Data.metaRow1.includes('1'), true, 'Roll No must be 1');
  assert.strictEqual(prof101Data.metaRow2.includes('Mahendra Agarwal'), true, 'Father must be Mahendra Agarwal');
  assert.strictEqual(prof101Data.metaRow2.includes('Meena Devi'), true, 'Mother must be Meena Devi');
  assert.strictEqual(prof101Data.photoImgDisplay, 'block', 'Photo image must be displayed when student has photo');
  assert.strictEqual(prof101Data.placeholderDisplay, 'none', 'Placeholder must be hidden when student has photo');

  // Verify Address Card rows order: 1. Address, 2. Village, 3. Pincode, 4. State
  assert.strictEqual(prof101Data.addrRows.length, 4, 'Address Information card must have exactly 4 rows');
  assert.strictEqual(prof101Data.addrRows[0].lbl, 'Address', 'First address row must be Address');
  assert.strictEqual(prof101Data.addrRows[1].lbl, 'Village', 'Second address row must be Village');
  assert.strictEqual(prof101Data.addrRows[2].lbl, 'Pincode', 'Third address row must be Pincode');
  assert.strictEqual(prof101Data.addrRows[3].lbl, 'State', 'Fourth address row must be State');
  assert.strictEqual(prof101Data.addrRows[1].val.includes('Ganjdundwara'), true, 'Village must display student village/city');

  console.log('   ✓ Red student banner verified:');
  console.log(`     - TA circular initials badge removed: ${!prof101Data.hasInitialsBadge}`);
  console.log(`     - 3-row even distribution: children=${prof101Data.bannerDirectChildrenCount}, metaWrapRemoved=${!prof101Data.hasMetaWrap}`);
  console.log(`     - Name font-size: ${prof101Data.nameFontSize} | Class font-size: ${prof101Data.clsFontSize}`);
  console.log(`     - Photo display: img=${prof101Data.photoImgDisplay}, placeholder=${prof101Data.placeholderDisplay}`);
  console.log('   ✓ Address Card 4-row layout verified:');
  console.log(`     - Rows: ${prof101Data.addrRows.map(r => r.lbl + ': ' + r.val).join(' | ')}`);

  console.log('\n3. Testing viewProf(102) - "No Photo" Placeholder with Person Icon...');
  await win.webContents.executeJavaScript(`viewProf(102)`);
  await new Promise(r => setTimeout(r, 600));

  const noPhotoScreenshotPath = path.join(artifactDir, 'screenshot_student_profile_no_photo.png');
  const noPhotoImage = await win.webContents.capturePage();
  fs.writeFileSync(noPhotoScreenshotPath, noPhotoImage.toPNG());
  console.log(`   ✓ High-resolution No Photo screenshot captured to: ${noPhotoScreenshotPath}`);

  const prof102Data = await win.webContents.executeJavaScript(`
    (() => {
      const body = document.getElementById('profB');
      const photoImg = body.querySelector('#profAvatarImg');
      const photoPlaceholder = body.querySelector('#profAvatarPlaceholder');
      const placeholderText = photoPlaceholder ? photoPlaceholder.textContent.trim() : '';
      const hasSvg = photoPlaceholder ? !!photoPlaceholder.querySelector('svg') : false;

      return {
        photoImgDisplay: photoImg ? getComputedStyle(photoImg).display : '',
        placeholderDisplay: photoPlaceholder ? getComputedStyle(photoPlaceholder).display : '',
        placeholderText,
        hasSvg
      };
    })()
  `);

  assert.strictEqual(prof102Data.photoImgDisplay, 'none', 'Photo img must be hidden for student with no photo');
  assert.notStrictEqual(prof102Data.placeholderDisplay, 'none', 'Placeholder must be visible for student with no photo');
  assert.strictEqual(prof102Data.placeholderText.includes('No Photo'), true, 'Placeholder must display "No Photo"');
  assert.strictEqual(prof102Data.hasSvg, true, 'Placeholder must contain person silhouette SVG');
  console.log('   ✓ Student 102 "No Photo" placeholder verified with SVG person icon and clean label.');

  console.log('\n4. Capturing high-resolution reference screenshot of redesigned Student Profile modal...');
  // Reopen 101 to capture high-res screenshot
  await win.webContents.executeJavaScript(`viewProf(101)`);
  await new Promise(r => setTimeout(r, 600));

  const screenshotPath = path.join(artifactDir, 'screenshot_student_profile.png');
  const image = await win.webContents.capturePage();
  fs.writeFileSync(screenshotPath, image.toPNG());
  console.log(`   ✓ High-resolution screenshot captured to: ${screenshotPath}`);

  console.log('\n5. Testing Add/Edit Student Form Village Label & Photo Synchronization:');

  console.log('   Checking Add/Edit Student form Village label and placeholder...');
  const formVillageCheck = await win.webContents.executeJavaScript(`
    (() => {
      openAddStudent();
      const cityInput = document.getElementById('s_city');
      const formRow = cityInput ? cityInput.closest('.stu-form-row') : null;
      const label = formRow ? formRow.querySelector('.stu-label')?.textContent?.trim() : '';
      const placeholder = cityInput ? cityInput.getAttribute('placeholder') : '';
      return { label, placeholder };
    })()
  `);
  assert.strictEqual(formVillageCheck.label, 'Village', 'Student form address label must be strictly "Village"');
  assert.strictEqual(formVillageCheck.placeholder, 'Village name', 'Student form address placeholder must be "Village name"');
  console.log(`   ✓ Student form label is strictly "Village" with placeholder "Village name".`);

  console.log('   [Case A]: Edit Student with NO photo (Student 102)...');
  await win.webContents.executeJavaScript(`
    editSt(102);
  `);
  await new Promise(r => setTimeout(r, 400));

  const edit102PhotoState = await win.webContents.executeJavaScript(`
    (() => {
      const prevImg = document.getElementById('s_photo_prev');
      const placeholder = document.getElementById('s_photo_placeholder');
      const removeBtn = document.getElementById('btnRemoveStudentPhoto');
      const statusTxt = document.getElementById('s_photo_status')?.textContent || '';
      return {
        prevImgDisplay: prevImg ? getComputedStyle(prevImg).display : '',
        placeholderDisplay: placeholder ? getComputedStyle(placeholder).display : '',
        removeBtnDisplay: removeBtn ? getComputedStyle(removeBtn).display : '',
        statusTxt,
        currentEditingStudentPhoto,
        pendingStudentPhotoAction
      };
    })()
  `);

  assert.strictEqual(edit102PhotoState.prevImgDisplay, 'none', 'Case A: Preview image must be hidden');
  assert.notStrictEqual(edit102PhotoState.placeholderDisplay, 'none', 'Case A: Placeholder must be visible');
  assert.strictEqual(edit102PhotoState.removeBtnDisplay, 'none', 'Case A: Remove button must be hidden');
  assert.strictEqual(edit102PhotoState.currentEditingStudentPhoto, '', 'Case A: currentEditingStudentPhoto must be empty string');
  assert.strictEqual(edit102PhotoState.pendingStudentPhotoAction, null, 'Case A: pendingStudentPhotoAction must be null');
  console.log('     ✓ Case A Passed: Student with no photo shows empty placeholder, hidden remove button, no fake photo attached.');

  console.log('   [Case B]: Edit Student with EXISTING photo (Student 101)...');
  await win.webContents.executeJavaScript(`
    editSt(101);
  `);
  await new Promise(r => setTimeout(r, 600));

  const edit101PhotoState = await win.webContents.executeJavaScript(`
    (() => {
      const prevImg = document.getElementById('s_photo_prev');
      const placeholder = document.getElementById('s_photo_placeholder');
      const removeBtn = document.getElementById('btnRemoveStudentPhoto');
      const cityVal = document.getElementById('s_city')?.value || '';
      return {
        prevImgDisplay: prevImg ? getComputedStyle(prevImg).display : '',
        placeholderDisplay: placeholder ? getComputedStyle(placeholder).display : '',
        removeBtnDisplay: removeBtn ? getComputedStyle(removeBtn).display : '',
        hasSrc: prevImg ? prevImg.src.startsWith('data:image') : false,
        cityVal,
        currentEditingStudentPhoto
      };
    })()
  `);

  assert.strictEqual(edit101PhotoState.prevImgDisplay, 'block', 'Case B: Preview image must be displayed');
  assert.strictEqual(edit101PhotoState.cityVal, 'Ganjdundwara', 'Edit form must preserve student address city/village');
  assert.strictEqual(edit101PhotoState.placeholderDisplay, 'none', 'Case B: Placeholder must be hidden');
  assert.notStrictEqual(edit101PhotoState.removeBtnDisplay, 'none', 'Case B: Remove button must be visible');
  assert.strictEqual(edit101PhotoState.hasSrc, true, 'Case B: Preview image must have valid data URI');
  assert.strictEqual(edit101PhotoState.currentEditingStudentPhoto, 'tushar.jpg', 'Case B: currentEditingStudentPhoto must match record');
  console.log('     ✓ Case B Passed: Student with existing photo displays immediate preview and active Remove button.');

  console.log('   [Case C]: Remove Photo and Save...');
  await win.webContents.executeJavaScript(`
    removeStudentPhoto();
  `);

  const afterRemoveState = await win.webContents.executeJavaScript(`
    (() => {
      const prevImg = document.getElementById('s_photo_prev');
      const placeholder = document.getElementById('s_photo_placeholder');
      const removeBtn = document.getElementById('btnRemoveStudentPhoto');
      return {
        prevImgDisplay: prevImg ? getComputedStyle(prevImg).display : '',
        placeholderDisplay: placeholder ? getComputedStyle(placeholder).display : '',
        removeBtnDisplay: removeBtn ? getComputedStyle(removeBtn).display : '',
        currentEditingStudentPhoto,
        pendingActionType: pendingStudentPhotoAction ? pendingStudentPhotoAction.type : ''
      };
    })()
  `);

  assert.strictEqual(afterRemoveState.prevImgDisplay, 'none', 'Case C: Image must be hidden after click Remove');
  assert.notStrictEqual(afterRemoveState.placeholderDisplay, 'none', 'Case C: Placeholder must be visible after click Remove');
  assert.strictEqual(afterRemoveState.removeBtnDisplay, 'none', 'Case C: Remove button must be hidden after click Remove');
  assert.strictEqual(afterRemoveState.pendingActionType, 'remove', 'Case C: pendingActionType must be remove');
  console.log('     ✓ Case C Passed: Remove button immediately transitions form to No Photo placeholder and marks action for save.');

  console.log('   [Case D]: Select New Photo...');
  await win.webContents.executeJavaScript(`
    chooseStudentPhoto();
  `);
  await new Promise(r => setTimeout(r, 400));

  const afterChooseState = await win.webContents.executeJavaScript(`
    (() => {
      const prevImg = document.getElementById('s_photo_prev');
      const placeholder = document.getElementById('s_photo_placeholder');
      const removeBtn = document.getElementById('btnRemoveStudentPhoto');
      return {
        prevImgDisplay: prevImg ? getComputedStyle(prevImg).display : '',
        placeholderDisplay: placeholder ? getComputedStyle(placeholder).display : '',
        removeBtnDisplay: removeBtn ? getComputedStyle(removeBtn).display : '',
        pendingActionType: pendingStudentPhotoAction ? pendingStudentPhotoAction.type : '',
        hasSrc: prevImg ? prevImg.src.startsWith('data:image') : false
      };
    })()
  `);

  assert.strictEqual(afterChooseState.prevImgDisplay, 'block', 'Case D: Preview image must show new photo');
  assert.strictEqual(afterChooseState.placeholderDisplay, 'none', 'Case D: Placeholder must be hidden');
  assert.notStrictEqual(afterChooseState.removeBtnDisplay, 'none', 'Case D: Remove button must be visible');
  assert.strictEqual(afterChooseState.pendingActionType, 'set', 'Case D: pendingActionType must be set');
  console.log('     ✓ Case D Passed: Selecting a replacement photo updates preview and sets pending action.');

  console.log('\n6. Testing BUG 2 (View Fee Ledger Navigation & Data Loading):');

  console.log('   Testing openFeeLedgerForStudent(101) from Student 101 Profile...');
  await win.webContents.executeJavaScript(`
    viewProf(101);
    openFeeLedgerForStudent(101);
  `);
  await new Promise(r => setTimeout(r, 600));

  const ledger101State = await win.webContents.executeJavaScript(`
    (() => {
      const feesPage = document.getElementById('page-fees');
      const isFeesActive = feesPage ? feesPage.classList.contains('active') : false;
      const feCl = document.getElementById('fe_cl')?.value;
      const feStSelect = document.getElementById('fe_st');
      const feStVal = feStSelect?.value;
      const selectedOptionText = feStSelect && feStSelect.selectedIndex >= 0 ? feStSelect.options[feStSelect.selectedIndex].text : '';
      const feLed = document.getElementById('feLed');
      const feHistTb = document.getElementById('feHistTb');
      const monthFeeText = document.getElementById('fe-t')?.textContent?.trim() || '';

      return {
        isFeesActive,
        curFSid,
        feCl,
        feStVal,
        selectedOptionText,
        hasFeeLedRows: feLed ? feLed.querySelectorAll('tr').length > 0 : false,
        monthFeeText
      };
    })()
  `);

  assert.strictEqual(ledger101State.isFeesActive, true, 'Must navigate to Fees page');
  assert.strictEqual(ledger101State.curFSid, 101, 'curFSid must be 101');
  assert.strictEqual(ledger101State.feStVal, '101', 'Dropdown fe_st must select student 101');
  assert.strictEqual(ledger101State.selectedOptionText.includes('Tushar Agarwal'), true, 'Selected student option must contain "Tushar Agarwal"');
  assert.strictEqual(ledger101State.selectedOptionText.includes('MDC-1001'), true, 'Selected student option must contain "MDC-1001"');
  assert.strictEqual(ledger101State.hasFeeLedRows, true, 'Fee ledger rows must be loaded for student 101');
  console.log('   ✓ Student 101 Fee Ledger automatically loaded with exact student name, admission number, and records:');
  console.log(`     - Selected student: ${ledger101State.selectedOptionText}`);
  console.log(`     - Active class filter: ${ledger101State.feCl}`);
  console.log(`     - Month Fee: ${ledger101State.monthFeeText}`);

  console.log('\n   Testing openFeeLedgerForStudent(102) from Student 102 Profile...');
  await win.webContents.executeJavaScript(`
    viewProf(102);
    openFeeLedgerForStudent(102);
  `);
  await new Promise(r => setTimeout(r, 600));

  const ledger102State = await win.webContents.executeJavaScript(`
    (() => {
      const feStSelect = document.getElementById('fe_st');
      const feStVal = feStSelect?.value;
      const selectedOptionText = feStSelect && feStSelect.selectedIndex >= 0 ? feStSelect.options[feStSelect.selectedIndex].text : '';
      const feLed = document.getElementById('feLed');
      const monthFeeText = document.getElementById('fe-t')?.textContent?.trim() || '';

      return {
        curFSid,
        feStVal,
        selectedOptionText,
        hasFeeLedRows: feLed ? feLed.querySelectorAll('tr').length > 0 : false,
        monthFeeText
      };
    })()
  `);

  assert.strictEqual(ledger102State.curFSid, 102, 'curFSid must be 102');
  assert.strictEqual(ledger102State.feStVal, '102', 'Dropdown fe_st must select student 102');
  assert.strictEqual(ledger102State.selectedOptionText.includes('Priya Sharma'), true, 'Selected student option must contain "Priya Sharma"');
  assert.strictEqual(ledger102State.selectedOptionText.includes('MDC-1002'), true, 'Selected student option must contain "MDC-1002"');
  assert.strictEqual(ledger102State.selectedOptionText.includes('Tushar Agarwal'), false, 'Selected student must NOT be student 101');
  console.log('   ✓ Student 102 Fee Ledger automatically loaded with exact student name, admission number, and records:');
  console.log(`     - Selected student: ${ledger102State.selectedOptionText}`);
  console.log(`     - Month Fee: ${ledger102State.monthFeeText}`);

  console.log('\n=== ALL STUDENT PROFILE, PHOTO SYNC & FEE LEDGER TESTS PASSED SUCCESSFULLY! ===\n');
  win.destroy();
  app.quit();
});
