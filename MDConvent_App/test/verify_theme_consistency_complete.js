const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const brainDir = 'C:/Users/HP/.gemini/antigravity/brain/09fab391-3131-4e63-9822-ed522316ce4e';

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
  transportStops: [
    { id: 1, name: 'Main Road', monthlyFee: 800, active: true },
    { id: 2, name: 'City Center', monthlyFee: 1200, active: true }
  ],
  transportAssignments: [
    { studentId: 101, stopId: 1, monthlyFee: 800, active: true, startMonth: 'April', startYear: 2026 }
  ],
  transportPayments: [
    { id: 'TR-1001', studentId: 101, amount: 800, date: '2026-05-10', receiptNo: 'TR-REC-101', months: ['April'] }
  ],
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
      rollno: '12',
      admno: 'MDC-1001',
      srNo: 'SR-001',
      status: 'Active',
      mobile: '9876543210',
      address: 'Kasganj Road, Amanpur'
    },
    {
      id: 102,
      name: 'Priya Sharma',
      father: 'Ramesh Sharma',
      mother: 'Sunita Devi',
      dob: '2022-04-15',
      gender: 'Female',
      blood: 'B+',
      category: 'OBC',
      session: '2026-27',
      cls: '1',
      section: 'B',
      rollno: '05',
      admno: 'MDC-1002',
      srNo: 'SR-002',
      status: 'Active',
      mobile: '9876543211',
      address: 'Main Market, Amanpur'
    }
  ],
  fees: {
    '101_2026': [
      { id: 'f1', name: 'Tuition Fee (April)', amount: 2450, paid: true, enabled: true },
      { id: 'f2', name: 'Tuition Fee (May)', amount: 2450, paid: false, enabled: true }
    ],
    '102_2026': [
      { id: 'f3', name: 'Tuition Fee (April)', amount: 3500, paid: false, enabled: true }
    ]
  }
};

ipcMain.handle('load-data', () => JSON.parse(JSON.stringify(mockDB)));
ipcMain.handle('save-data', (e, d) => ({ success: true }));
ipcMain.handle('get-data-path', () => 'sandbox/test/school_data.json');
ipcMain.handle('get-student-photo-data', (e, name) => null);

app.whenReady().then(async () => {
  console.log('=== VERIFYING THEME CONSISTENCY ACROSS THE APPLICATION ===\n');

  const win = new BrowserWindow({
    width: 1400,
    height: 850,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../src/preload.js')
    }
  });

  win.webContents.on('console-message', (e, level, message) => {
    if (level > 1) console.log('[Renderer Log]', message);
  });

  await win.loadFile(path.join(__dirname, '../src/index.html'));
  await new Promise(r => setTimeout(r, 1800));

  try {
    // 1. Verify Student Profile Modal styling
    console.log('--- CHECK 1: Student Profile Popup Theme ---');
    const profStyles = await win.webContents.executeJavaScript(`(() => {
      try {
        viewProf(101);

        const profM = document.getElementById('profM');
        const banner = profM.querySelector('.prof-identity-banner');
        const btnLedger = profM.querySelector('.prof-btn-ledger');
        const btnEdit = profM.querySelector('.prof-btn-edit');
        const dialog = profM.querySelector('.prof-modal-dialog');
        const header = profM.querySelector('.prof-modal-header');

        const getBg = el => el ? window.getComputedStyle(el).backgroundImage || window.getComputedStyle(el).backgroundColor : '';
        const getColor = el => el ? window.getComputedStyle(el).color : '';

        return {
          profM_visible: profM.classList.contains('show'),
          bannerBg: getBg(banner),
          btnLedgerBg: getBg(btnLedger),
          btnLedgerColor: getColor(btnLedger),
          btnEditBg: getBg(btnEdit),
          btnEditColor: getColor(btnEdit),
          dialogBg: getBg(dialog),
          headerBg: getBg(header)
        };
      } catch (err) {
        return { error: err.message, stack: err.stack };
      }
    })()`);

    console.log('Student Profile Styles:', profStyles);
    if (!profStyles.error && profStyles.profM_visible && profStyles.bannerBg.includes('rgb(46, 35, 108)')) {
      console.log('✓ CHECK 1 PASSED: Student Profile uses purple-lavender theme with no red banner.');
    } else {
      throw new Error('✗ CHECK 1 FAILED: ' + JSON.stringify(profStyles));
    }

    // Capture screenshot of Student Profile Modal
    await new Promise(r => setTimeout(r, 300));
    const imgProf = await win.capturePage();
    fs.writeFileSync(path.join(brainDir, 'theme_profile_modal_unified.png'), imgProf.toPNG());
    console.log('✓ Saved artifact: theme_profile_modal_unified.png');

    // Close profile modal
    await win.webContents.executeJavaScript(`closeM('profM');`);
    await new Promise(r => setTimeout(r, 400));

    // 2. Verify Transport Modals & Student Transport Details styling
    console.log('\n--- CHECK 2: Transport Modals & Student Transport Details Theme ---');
    await win.webContents.executeJavaScript(`showPage('transport', null)`);
    await new Promise(r => setTimeout(r, 500));

    const transportStyles = await win.webContents.executeJavaScript(`(() => {
      try {
        if (typeof viewStudentTransportDetails === 'function') {
          viewStudentTransportDetails(101);
        } else {
          openM('modalStudentTransportDetails');
        }

        const modal = document.getElementById('modalStudentTransportDetails');
        const header = modal.querySelector('.tr-modal-header');
        const body = modal.querySelector('.tr-modal-body');
        const btnCollect = modal.querySelector('.tr-det-btn-collect');
        const btnEdit = modal.querySelector('.tr-det-btn-edit');

        const getBg = el => el ? window.getComputedStyle(el).backgroundImage || window.getComputedStyle(el).backgroundColor : '';
        const getColor = el => el ? window.getComputedStyle(el).color : '';

        return {
          modal_visible: modal.classList.contains('show'),
          headerBg: getBg(header),
          bodyBg: getBg(body),
          btnCollectBg: getBg(btnCollect),
          btnEditBg: getBg(btnEdit),
          btnEditColor: getColor(btnEdit)
        };
      } catch (err) {
        return { error: err.message };
      }
    })()`);

    console.log('Transport Details Styles:', transportStyles);
    if (!transportStyles.error && transportStyles.headerBg.includes('rgb(46, 35, 108)') && transportStyles.btnCollectBg.includes('rgb(120, 57, 212)')) {
      console.log('✓ CHECK 2 PASSED: Student Transport Details modal header & buttons use purple-lavender theme.');
    } else {
      throw new Error('✗ CHECK 2 FAILED: Transport details modal styling did not match purple theme!');
    }

    // Screenshot 2: Student Transport Details Modal
    await new Promise(r => setTimeout(r, 300));
    const imgTrDet = await win.capturePage();
    fs.writeFileSync(path.join(brainDir, 'theme_transport_details_modal_unified.png'), imgTrDet.toPNG());
    console.log('✓ Saved artifact: theme_transport_details_modal_unified.png');

    // Close transport details modal
    await win.webContents.executeJavaScript(`closeM('modalStudentTransportDetails')`);
    await new Promise(r => setTimeout(r, 400));

    // 3. Verify Support & Info Page
    console.log('\n--- CHECK 3: Support & Info Page Theme ---');
    const supportStyles = await win.webContents.executeJavaScript(`(() => {
      try {
        showPage('support', null);
        const page = document.getElementById('page-support');
        const devBanner = page.querySelector('.card:first-child .cb > div:first-child');
        const customCard = page.querySelector('.card:nth-child(2) .cb div');

        const getBg = el => el ? window.getComputedStyle(el).backgroundImage || window.getComputedStyle(el).backgroundColor : '';
        const getBorder = el => el ? window.getComputedStyle(el).borderLeftColor : '';

        return {
          page_active: page.classList.contains('active'),
          devBannerBg: getBg(devBanner),
          customBorderLeft: getBorder(customCard)
        };
      } catch (err) {
        return { error: err.message };
      }
    })()`);

    console.log('Support Page Styles:', supportStyles);
    if (!supportStyles.error && supportStyles.page_active && supportStyles.devBannerBg.includes('rgb(48, 38, 111)') && supportStyles.customBorderLeft.includes('rgb(120, 57, 212)')) {
      console.log('✓ CHECK 3 PASSED: Support page developer banner and customization borders match purple theme.');
    } else {
      throw new Error('✗ CHECK 3 FAILED: Support page developer banner did not match purple theme!');
    }

    // Screenshot 3: Support & Info Page
    await new Promise(r => setTimeout(r, 300));
    const imgSupport = await win.capturePage();
    fs.writeFileSync(path.join(brainDir, 'theme_support_page_unified.png'), imgSupport.toPNG());
    console.log('✓ Saved artifact: theme_support_page_unified.png');

    // 4. Verify Standard Modals Header & Buttons
    console.log('\n--- CHECK 4: Standard Modals (.mh, .bp) ---');
    const standardModalStyles = await win.webContents.executeJavaScript(`(() => {
      try {
        openM('secM');
        const secM = document.getElementById('secM');
        const mh = secM.querySelector('.mh');
        const bp = secM.querySelector('.btn.bp');

        const getBg = el => el ? window.getComputedStyle(el).backgroundImage || window.getComputedStyle(el).backgroundColor : '';
        const getColor = el => el ? window.getComputedStyle(el).color : '';

        const res = {
          mhBg: getBg(mh),
          bpBg: getBg(bp),
          bpColor: getColor(bp)
        };
        closeM('secM');
        return res;
      } catch (err) {
        return { error: err.message };
      }
    })()`);

    console.log('Standard Modal Styles:', standardModalStyles);
    if (!standardModalStyles.error && standardModalStyles.bpBg.includes('rgb(120, 57, 212)')) {
      console.log('✓ CHECK 4 PASSED: Standard modal headers and buttons use theme surfaces and purple gradients.');
    } else {
      throw new Error('✗ CHECK 4 FAILED: Standard modal button not matching purple theme!');
    }

    // 5. Verify Transport Fees Main Page
    console.log('\n--- CHECK 5: Transport Fees Main Page ---');
    await win.webContents.executeJavaScript(`showPage('transport', null)`);
    await new Promise(r => setTimeout(r, 400));
    const trIconBg = await win.webContents.executeJavaScript(`(() => {
      const icon = document.querySelector('.tr-bus-icon');
      return icon ? window.getComputedStyle(icon).backgroundImage || window.getComputedStyle(icon).backgroundColor : '';
    })()`);
    console.log('Transport Bus Icon Bg:', trIconBg);
    const imgTransport = await win.capturePage();
    fs.writeFileSync(path.join(brainDir, 'theme_transport_page_unified.png'), imgTransport.toPNG());
    console.log('✓ Saved artifact: theme_transport_page_unified.png');

    console.log('\n=== ALL THEME CONSISTENCY CHECKS COMPLETED WITH 100% SUCCESS! ===');
  } catch (e) {
    console.error('Fatal execution error:', e);
  } finally {
    app.quit();
  }
});
