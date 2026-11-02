// Electron UI Verification Test for Transport Fees & Receipts Fix
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  const htmlPath = path.join(__dirname, '..', 'src', 'index.html');
  await win.loadFile(htmlPath);

  console.log('=== RUNNING ELECTRON TRANSPORT UI VERIFICATION ===\n');

  const result = await win.webContents.executeJavaScript(`
    (async () => {
      // 1. Setup isolated test data in memory
      DB.students = [
        { id: 201, name: 'Ananya Verma', admno: 'MDC-2001', cls: '4', section: 'A', status: 'Active' },
        { id: 202, name: 'Kabir Das', admno: 'MDC-2002', cls: '5', section: 'B', status: 'Active' }
      ];
      DB.transport = {
        stops: [
          { id: 'stp_test1', name: 'Gandhi Chowk', fee: 550, active: true },
          { id: 'stp_test2', name: 'Station Road', fee: 450, active: true }
        ],
        assignments: {
          201: {
            studentId: 201,
            admNo: 'MDC-2001',
            name: 'Ananya Verma',
            class: '4 A',
            active: true,
            type: 'single',
            pickupStopId: 'stp_test1',
            pickupStopName: 'Gandhi Chowk',
            monthlyFee: 550,
            effectiveFrom: 'April 2026',
            stoppedAt: null,
            history: []
          }
        },
        payments: [],
        nextReceiptSeq: 1
      };
      transportState.activeSession = '2026–27';
      transportState.activeMonth = 'April 2026';

      // Case A: Open transport details for student with assignment but NO payment
      openStudentTransportDetailsModal(201);

      const countEl = document.getElementById('tr_details_payments_count');
      const tbody = document.getElementById('tr_details_history_tbody');

      const initialCount = countEl ? countEl.textContent : '';
      const initialHtml = tbody ? tbody.innerHTML : '';
      const initialText = tbody ? tbody.textContent.trim() : '';

      const hasNoPaymentsMsg = initialText.includes('No transport payments recorded yet.');
      const containsNaN = initialHtml.includes('NaN');
      const containsFakeTrRec = initialHtml.includes('TR-REC-');

      // Test zero payment rejection in Collect Transport Modal
      openCollectTransportModal(201);
      
      const amtInput = document.getElementById('tr_col_amount_input');
      if (amtInput) amtInput.value = '0';
      
      let zeroRejected = false;
      const originalToast = window.showToast;
      window.showToast = (msg, type) => {
        if (msg.includes('greater than ₹0') && type === 'error') {
          zeroRejected = true;
        }
      };
      saveTransportPayment();

      // Test genuine payment of ₹550
      if (amtInput) amtInput.value = '550';
      let paymentSuccess = false;
      window.showToast = (msg, type) => {
        if (msg.includes('recorded successfully') && type === 'success') {
          paymentSuccess = true;
        }
      };
      saveTransportPayment();
      window.showToast = originalToast;

      // Case B: Re-open details modal after genuine payment
      openStudentTransportDetailsModal(201);
      const postCount = countEl ? countEl.textContent : '';
      const postHtml = tbody ? tbody.innerHTML : '';

      const postHasReceipt = postHtml.includes('TR-2026-0001');
      const postHasAmount = postHtml.includes('550');
      const postContainsNaN = postHtml.includes('NaN');

      // Test View Receipt Modal
      viewTransportReceiptByNo('TR-2026-0001');
      const rcptNoEl = document.getElementById('tr_rcpt_no');
      const rcptRecEl = document.getElementById('tr_rcpt_received');
      const rcptHtml = document.getElementById('tr_receipt_print_area')?.innerHTML || '';
      
      const modalReceiptNo = rcptNoEl ? rcptNoEl.textContent : '';
      const modalReceived = rcptRecEl ? rcptRecEl.textContent : '';
      const modalContainsNaN = rcptHtml.includes('NaN');

      return {
        initialCount,
        hasNoPaymentsMsg,
        containsNaN,
        containsFakeTrRec,
        zeroRejected,
        paymentSuccess,
        postCount,
        postHasReceipt,
        postHasAmount,
        postContainsNaN,
        modalReceiptNo,
        modalReceived,
        modalContainsNaN
      };
    })();
  `);

  console.log('Test Results:');
  console.log('1. Initial Payment Receipts Count (Expected 0):', result.initialCount);
  assert.strictEqual(result.initialCount, '0', 'Initial count must be 0');

  console.log('2. Empty State Message ("No transport payments recorded yet."):', result.hasNoPaymentsMsg);
  assert.strictEqual(result.hasNoPaymentsMsg, true, 'Must display empty state message');

  console.log('3. Initial UI Contains NaN (Expected false):', result.containsNaN);
  assert.strictEqual(result.containsNaN, false, 'Initial UI must not contain NaN');

  console.log('4. Initial UI Contains Fake TR-REC- (Expected false):', result.containsFakeTrRec);
  assert.strictEqual(result.containsFakeTrRec, false, 'Initial UI must not contain TR-REC-');

  console.log('5. ₹0 Payment Rejected with Validation Error:', result.zeroRejected);
  assert.strictEqual(result.zeroRejected, true, 'Zero payment must be rejected');

  console.log('6. Genuine ₹550 Payment Recorded Successfully:', result.paymentSuccess);
  assert.strictEqual(result.paymentSuccess, true, 'Genuine payment must succeed');

  console.log('7. Post-Payment Receipts Count (Expected 1):', result.postCount);
  assert.strictEqual(result.postCount, '1', 'Post-payment count must be 1');

  console.log('8. Generated Receipt Number TR-2026-0001 Present:', result.postHasReceipt);
  assert.strictEqual(result.postHasReceipt, true, 'TR-2026-0001 must be displayed');

  console.log('9. Payment Table Contains NaN (Expected false):', result.postContainsNaN);
  assert.strictEqual(result.postContainsNaN, false, 'Payment table must not contain NaN');

  console.log('10. Receipt Modal Populated Correctly:', result.modalReceiptNo, 'Amt:', result.modalReceived);
  assert.strictEqual(result.modalReceiptNo, 'TR-2026-0001');
  assert.strictEqual(result.modalReceived, '550.00');
  assert.strictEqual(result.modalContainsNaN, false, 'Receipt modal must not contain NaN');

  console.log('\n=== ALL ELECTRON TRANSPORT UI TESTS PASSED 100%! ===');
  app.exit(0);
});
