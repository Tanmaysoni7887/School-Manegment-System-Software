/**
 * MD CONVENT SMS — GLOBAL MODAL & POPUP BACKGROUND BLUR VERIFICATION
 * Tests all modal categories, nested modals, Escape key, backdrop filter styling,
 * and captures visual screenshot artifacts.
 */

const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const ARTIFACT_DIR = 'C:\\Users\\HP\\.gemini\\antigravity\\brain\\09fab391-3131-4e63-9822-ed522316ce4e';

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1366,
    height: 768,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: false
    }
  });

  await win.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
  await new Promise(r => setTimeout(r, 1500));

  console.log('=== STARTING GLOBAL MODAL BACKGROUND BLUR VERIFICATION ===\n');

  // Helper to test opening a modal, verifying blur, and closing it
  async function testModalBlur(modalId, categoryName, options = {}) {
    console.log(`--- Testing Category: ${categoryName} (Modal: #${modalId}) ---`);
    
    // Open modal
    await win.webContents.executeJavaScript(`
      if (typeof openM === 'function') {
        openM('${modalId}');
      }
    `);
    await new Promise(r => setTimeout(r, 250)); // Allow animation to settle

    // Check computed styles on the modal backdrop
    const modalState = await win.webContents.executeJavaScript(`(() => {
      const el = document.getElementById('${modalId}');
      if (!el) return { exists: false };
      const comp = window.getComputedStyle(el);
      const isVisible = comp.display === 'flex';
      const hasShowClass = el.classList.contains('show');
      const backdropFilter = comp.backdropFilter || comp.webkitBackdropFilter || '';
      const webkitBackdropFilter = comp.webkitBackdropFilter || '';
      const bg = comp.backgroundColor;
      const pos = comp.position;
      const zIdx = parseInt(comp.zIndex, 10);
      const bodyHasActive = document.body.classList.contains('has-modal-active');
      const dialog = el.querySelector('.md, .prof-modal-dialog, .def-modal-dialog');
      const dialogComp = dialog ? window.getComputedStyle(dialog) : null;
      const dialogBg = dialogComp ? dialogComp.backgroundColor : '';
      const dialogFilter = dialogComp ? (dialogComp.filter || '') : '';

      return {
        exists: true,
        isVisible,
        hasShowClass,
        backdropFilter,
        webkitBackdropFilter,
        bg,
        pos,
        zIdx,
        bodyHasActive,
        dialogBg,
        dialogFilter
      };
    })()`);

    if (!modalState.exists) {
      throw new Error(`Modal #${modalId} does not exist in DOM!`);
    }

    console.log(`  State: Visible=${modalState.isVisible}, Pos=${modalState.pos}, Z-Index=${modalState.zIdx}`);
    console.log(`  Backdrop-Filter: "${modalState.backdropFilter}", Background: "${modalState.bg}"`);
    console.log(`  Body has-modal-active: ${modalState.bodyHasActive}`);
    console.log(`  Dialog Background: "${modalState.dialogBg}", Dialog Filter: "${modalState.dialogFilter}"`);

    // Validations
    if (!modalState.isVisible) throw new Error(`Modal #${modalId} is not visible (display != flex)`);
    if (!modalState.hasShowClass) throw new Error(`Modal #${modalId} does not have .show class`);
    if (!modalState.backdropFilter.includes('blur')) throw new Error(`Modal #${modalId} backdrop-filter missing blur! Got: "${modalState.backdropFilter}"`);
    if (modalState.pos !== 'fixed') throw new Error(`Modal #${modalId} position is not fixed`);
    if (!modalState.bodyHasActive) throw new Error(`document.body missing has-modal-active class`);

    // Optionally capture screenshot
    if (options.captureScreenshot) {
      const img = await win.webContents.capturePage();
      const filename = `screenshot_modal_blur_${options.screenshotName || modalId}.png`;
      const outPath = path.join(ARTIFACT_DIR, filename);
      fs.writeFileSync(outPath, img.toPNG());
      console.log(`  ✓ Saved screenshot artifact: ${filename}`);
    }

    // Close modal
    await win.webContents.executeJavaScript(`
      if (typeof closeM === 'function') {
        closeM('${modalId}');
      }
    `);
    await new Promise(r => setTimeout(r, 220)); // Allow fadeout animation to complete

    // Verify closed state
    const closedState = await win.webContents.executeJavaScript(`(() => {
      const el = document.getElementById('${modalId}');
      const comp = window.getComputedStyle(el);
      const isVisible = comp.display === 'flex';
      const hasShowClass = el.classList.contains('show');
      const bodyHasActive = document.body.classList.contains('has-modal-active');
      return { isVisible, hasShowClass, bodyHasActive };
    })()`);

    if (closedState.hasShowClass || closedState.isVisible) {
      throw new Error(`Modal #${modalId} did not close cleanly! Show=${closedState.hasShowClass}, Visible=${closedState.isVisible}`);
    }
    console.log(`  ✓ Successfully closed #${modalId}. Background restored to normal.\n`);
  }

  // 1. Student Profile Modal
  await testModalBlur('profM', 'Student Profile Modal', {
    captureScreenshot: true,
    screenshotName: 'student_profile'
  });

  // 2. Fee Collection / Payment History Modal
  await testModalBlur('paymentHistoryM', 'Payment History Modal', {
    captureScreenshot: true,
    screenshotName: 'payment_history'
  });

  // 3. Student Fee Ledger Modal
  await testModalBlur('feeDetailsM', 'Student Fee Ledger Modal');

  // 4. Quick Fee Collect Modal
  await testModalBlur('payM', 'Fee Collection (Quick Pay) Modal');

  // 5. Unified Fee Collection Modal
  await testModalBlur('unifiedCollectM', 'Unified Fee Collection Modal');

  // 6. Transport Student Details Modal
  await testModalBlur('modalStudentTransportDetails', 'Transport Student Details Modal', {
    captureScreenshot: true,
    screenshotName: 'transport_details'
  });

  // 7. Transport Manage Stops Modal
  await testModalBlur('modalManageStops', 'Transport Manage Stops Modal');

  // 8. Transport Collect Fee Modal
  await testModalBlur('modalCollectTransport', 'Transport Fee Collection Modal');

  // 9. Receipt Preview Modal
  await testModalBlur('rcC', 'Receipt Preview / Print Modal', {
    captureScreenshot: true,
    screenshotName: 'receipt_preview'
  });

  // 10. Confirmation Dialog (Promotion Confirm)
  await testModalBlur('prmConfirmM', 'Academic Promotion Confirmation Dialog');

  // 11. Settings / Management Modals (Section, Session, Fee Setup)
  await testModalBlur('secM', 'Section Management Modal');
  await testModalBlur('sessM', 'Session Management Modal');
  await testModalBlur('feeSetupM', 'Fee Structure Setup Modal');

  // 12. Top 10 Fee Defaulters Modal
  await testModalBlur('modalTopDefaulters', 'Top 10 Fee Defaulters Modal', {
    captureScreenshot: true,
    screenshotName: 'top10_defaulters'
  });

  // 13. All Students Selection Modal
  await testModalBlur('allStudentsM', 'All Students Quick Search Modal');

  // 14. Nested Modals Test: Open modalTopDefaulters, then open profM on top
  console.log('--- Testing Nested Modals & Stacking Context ---');
  await win.webContents.executeJavaScript(`
    openM('modalTopDefaulters');
  `);
  await new Promise(r => setTimeout(r, 200));

  await win.webContents.executeJavaScript(`
    openM('profM');
  `);
  await new Promise(r => setTimeout(r, 250));

  const nestedState = await win.webContents.executeJavaScript(`(() => {
    const defM = document.getElementById('modalTopDefaulters');
    const profM = document.getElementById('profM');
    const defZ = parseInt(window.getComputedStyle(defM).zIndex, 10);
    const profZ = parseInt(window.getComputedStyle(profM).zIndex, 10);
    const bothActive = defM.classList.contains('show') && profM.classList.contains('show');
    const bodyActive = document.body.classList.contains('has-modal-active');
    return { defZ, profZ, bothActive, bodyActive };
  })()`);

  console.log(`  Nested state: Defaulters Z=${nestedState.defZ}, Profile Z=${nestedState.profZ}`);
  console.log(`  Both modals show=true: ${nestedState.bothActive}, Body active: ${nestedState.bodyActive}`);

  if (nestedState.profZ <= nestedState.defZ) {
    throw new Error(`Profile modal z-index (${nestedState.profZ}) must be higher than Defaulters modal (${nestedState.defZ})!`);
  }
  if (!nestedState.bothActive || !nestedState.bodyActive) {
    throw new Error('Nested modal activation state incorrect!');
  }

  // Capture screenshot of nested modal
  const nestedImg = await win.webContents.capturePage();
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'screenshot_nested_modal_blur.png'), nestedImg.toPNG());
  console.log('  ✓ Saved screenshot artifact: screenshot_nested_modal_blur.png');

  // Close child modal (profM)
  await win.webContents.executeJavaScript(`closeM('profM');`);
  await new Promise(r => setTimeout(r, 220));

  // Verify that modalTopDefaulters is STILL open and blur remains active
  const midState = await win.webContents.executeJavaScript(`(() => {
    const defM = document.getElementById('modalTopDefaulters');
    const profM = document.getElementById('profM');
    return {
      profClosed: !profM.classList.contains('show'),
      defStillOpen: defM.classList.contains('show'),
      bodyStillActive: document.body.classList.contains('has-modal-active')
    };
  })()`);

  console.log(`  After closing child modal: Child closed=${midState.profClosed}, Parent still open=${midState.defStillOpen}, Blur still active=${midState.bodyStillActive}`);
  if (!midState.profClosed || !midState.defStillOpen || !midState.bodyStillActive) {
    throw new Error('Parent modal blur was prematurely removed when child closed!');
  }

  // Close parent modal (modalTopDefaulters)
  await win.webContents.executeJavaScript(`closeM('modalTopDefaulters');`);
  await new Promise(r => setTimeout(r, 220));

  const finalState = await win.webContents.executeJavaScript(`(() => {
    return {
      bodyActive: document.body.classList.contains('has-modal-active'),
      anyOpen: document.querySelectorAll('.mo.show').length
    };
  })()`);

  if (finalState.bodyActive || finalState.anyOpen > 0) {
    throw new Error('Blur state stuck after all modals closed!');
  }
  console.log('  ✓ Nested modals test PASSED cleanly!\n');

  // 15. Escape Key Test
  console.log('--- Testing Escape Key Handler ---');
  await win.webContents.executeJavaScript(`openM('secM');`);
  await new Promise(r => setTimeout(r, 200));

  // Dispatch Escape key
  await win.webContents.executeJavaScript(`
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  `);
  await new Promise(r => setTimeout(r, 250));

  const escState = await win.webContents.executeJavaScript(`(() => {
    const el = document.getElementById('secM');
    return {
      closed: !el.classList.contains('show'),
      bodyActive: document.body.classList.contains('has-modal-active')
    };
  })()`);

  if (!escState.closed || escState.bodyActive) {
    throw new Error('Escape key failed to close active modal!');
  }
  console.log('  ✓ Escape key test PASSED cleanly!\n');

  console.log('=== ALL GLOBAL MODAL BACKGROUND BLUR VERIFICATIONS PASSED (100% SUCCESS) ===');
  app.quit();
});
