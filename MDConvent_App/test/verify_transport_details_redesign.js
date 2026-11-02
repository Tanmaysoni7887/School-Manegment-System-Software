const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1400,
    height: 950,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  const htmlPath = path.join(__dirname, '..', 'src', 'index.html');
  await win.loadFile(htmlPath);

  console.log('=== RUNNING DETAILED STUDENT TRANSPORT MODAL VERIFICATION ===\n');

  const testResult = await win.webContents.executeJavaScript(`
    (async () => {
      // 1. Setup mock student exactly matching reference screenshot:
      // Tushar Agarwal, MDC-1001, NC A, Father: Mahendra Agarwal, Mother: Meena Devi
      DB.students = [
        {
          id: 1001,
          name: 'Tushar Agarwal',
          admno: 'MDC-1001',
          cls: 'NC',
          section: 'A',
          status: 'Active',
          father: 'Mahendra Agarwal',
          mother: 'Meena Devi',
          photo: null
        }
      ];

      DB.transport = {
        stops: [
          { id: 'stp_dholna', name: 'Dholna Tiraha', fee: 450, active: true }
        ],
        assignments: {
          1001: {
            studentId: 1001,
            admNo: 'MDC-1001',
            name: 'Tushar Agarwal',
            class: 'NC A',
            active: true,
            type: 'single',
            pickupStopId: 'stp_dholna',
            pickupStopName: 'Dholna Tiraha',
            monthlyFee: 450,
            effectiveFrom: 'April 2026',
            stoppedAt: 'September 2026',
            history: []
          }
        },
        payments: [
          {
            id: 'tr_pay_1',
            receiptNo: 'TR-REC-001',
            date: '2026-04-10',
            studentId: 1001,
            amount: 450,
            amountReceived: 450,
            discount: 0,
            paymentMode: 'Cash',
            months: ['April 2026'],
            allocations: [{ month: 'April 2026', fee: 450, paidAllocated: 450, discountAllocated: 0 }]
          },
          {
            id: 'tr_pay_2',
            receiptNo: 'TR-REC-002',
            date: '2026-05-12',
            studentId: 1001,
            amount: 450,
            amountReceived: 450,
            discount: 0,
            paymentMode: 'Cash',
            months: ['May 2026'],
            allocations: [{ month: 'May 2026', fee: 450, paidAllocated: 450, discountAllocated: 0 }]
          },
          {
            id: 'tr_pay_3',
            receiptNo: 'TR-REC-003',
            date: '2026-06-12',
            studentId: 1001,
            amount: 450,
            amountReceived: 450,
            discount: 0,
            paymentMode: 'Cash',
            months: ['June 2026'],
            allocations: [{ month: 'June 2026', fee: 450, paidAllocated: 450, discountAllocated: 0 }]
          },
          {
            id: 'tr_pay_4',
            receiptNo: 'TR-REC-004',
            date: '2026-07-10',
            studentId: 1001,
            amount: 450,
            amountReceived: 450,
            discount: 0,
            paymentMode: 'Cash',
            months: ['July 2026'],
            allocations: [{ month: 'July 2026', fee: 450, paidAllocated: 450, discountAllocated: 0 }]
          },
          {
            id: 'tr_pay_5',
            receiptNo: 'TR-REC-005',
            date: '2026-08-11',
            studentId: 1001,
            amount: 450,
            amountReceived: 450,
            discount: 0,
            paymentMode: 'Cash',
            months: ['August 2026'],
            allocations: [{ month: 'August 2026', fee: 450, paidAllocated: 450, discountAllocated: 0 }]
          },
          {
            id: 'tr_pay_6',
            receiptNo: 'TR-REC-006',
            date: '2026-09-10',
            studentId: 1001,
            amount: 450,
            amountReceived: 450,
            discount: 0,
            paymentMode: 'Cash',
            months: ['September 2026'],
            allocations: [{ month: 'September 2026', fee: 450, paidAllocated: 450, discountAllocated: 0 }]
          }
        ]
      };

      transportState.activeSession = '2026–27';
      transportState.activeMonth = 'September 2026';

      // Switch to transport fees page first to simulate user navigation
      showPage('transport');

      // Open the modal
      openStudentTransportDetailsModal(1001);

      const modalEl = document.getElementById('modalStudentTransportDetails');
      const isModalShown = modalEl ? modalEl.classList.contains('show') : false;
      const modalComputedDisplay = modalEl ? window.getComputedStyle(modalEl).display : '';

      // Inspect Header
      const title = document.getElementById('tr_details_modal_title')?.textContent || '';

      // Inspect Student Info Card
      const nameAdm = document.getElementById('tr_det_name_adm')?.textContent || '';
      const statusPill = document.getElementById('tr_det_status_pill')?.textContent || '';
      const cls = document.getElementById('tr_det_class')?.textContent || '';
      const mode = document.getElementById('tr_det_mode')?.textContent || '';
      const father = document.getElementById('tr_det_father')?.textContent || '';
      const mother = document.getElementById('tr_det_mother')?.textContent || '';
      const pickup = document.getElementById('tr_det_pickup_stop')?.textContent || '';

      // Inspect Monthly Fee Card
      const fee = document.getElementById('tr_det_monthly_fee')?.textContent || '';
      const eff = document.getElementById('tr_det_effective_from')?.textContent || '';

      // Inspect Actions
      const btnCollect = !!document.getElementById('tr_btn_details_collect');
      const btnEdit = !!document.getElementById('tr_btn_details_edit');
      const btnRemove = document.getElementById('tr_btn_details_remove')?.style.display !== 'none';

      // Inspect Usage Table Headers & Columns
      const usageThs = Array.from(document.querySelectorAll('#modalStudentTransportDetails .tr-det-usage-card th')).map(th => th.textContent.trim());
      const hasDiscountColumn = usageThs.some(t => t.toLowerCase().includes('discount'));
      const hasBalanceColumn = usageThs.some(t => t.toLowerCase().includes('balance'));
      const hasDueAmountColumn = usageThs.some(t => t.toLowerCase().includes('due amount'));

      // Inspect Payment Summary Card
      const sumTotalFees = document.getElementById('tr_sum_total_fees')?.textContent || '';
      const sumTotalPaid = document.getElementById('tr_sum_total_paid')?.textContent || '';
      const sumTotalDisc = document.getElementById('tr_sum_total_disc')?.textContent || '';
      const sumOutstanding = document.getElementById('tr_sum_outstanding_due')?.textContent || '';
      const dueBoxClass = document.getElementById('tr_sum_due_box')?.className || '';

      // Inspect Payment Receipts Card
      const rcptCount = document.getElementById('tr_details_payments_count')?.textContent || '';
      const rcptRows = Array.from(document.querySelectorAll('#tr_details_history_tbody tr'));
      const firstRowCols = rcptRows.length > 0 ? Array.from(rcptRows[0].querySelectorAll('td')).map(td => td.textContent.trim()) : [];
      const hasViewBtn = rcptRows.length > 0 && !!rcptRows[0].querySelector('.tr-rcpt-action-btn.view');
      const hasPrintBtn = rcptRows.length > 0 && !!rcptRows[0].querySelector('.tr-rcpt-action-btn.print');
      const viewAllBtnDisplay = document.getElementById('tr_btn_view_all_rcpts')?.style.display;

      // Test View All toggle
      toggleViewAllTransportReceipts();
      const wrapHeightAfterToggle = document.getElementById('tr_details_receipts_wrap')?.style.maxHeight;

      return {
        isModalShown,
        modalComputedDisplay,
        title,
        nameAdm,
        statusPill,
        cls,
        mode,
        father,
        mother,
        pickup,
        fee,
        eff,
        btnCollect,
        btnEdit,
        btnRemove,
        usageThs,
        hasDiscountColumn,
        hasBalanceColumn,
        hasDueAmountColumn,
        sumTotalFees,
        sumTotalPaid,
        sumTotalDisc,
        sumOutstanding,
        dueBoxClass,
        rcptCount,
        rcptRowsCount: rcptRows.length,
        firstRowCols,
        hasViewBtn,
        hasPrintBtn,
        viewAllBtnDisplay,
        wrapHeightAfterToggle
      };
    })();
  `);

  console.log('Verification Output:');
  console.log('Title:', testResult.title);
  assert.strictEqual(testResult.title, 'Tushar Agarwal (MDC-1001) — Transport Details');

  console.log('Student Info Card:');
  console.log(' - Name & Adm:', testResult.nameAdm);
  console.log(' - Status Pill:', testResult.statusPill);
  console.log(' - Class:', testResult.cls);
  console.log(' - Mode:', testResult.mode);
  console.log(' - Father:', testResult.father);
  console.log(' - Mother:', testResult.mother);
  console.log(' - Pickup:', testResult.pickup);
  assert.strictEqual(testResult.nameAdm, 'Tushar Agarwal (MDC-1001)');
  assert.strictEqual(testResult.statusPill, 'Active');
  assert.strictEqual(testResult.cls, 'NC A');
  assert.strictEqual(testResult.mode, 'Single Stop');
  assert.strictEqual(testResult.father, 'Mahendra Agarwal');
  assert.strictEqual(testResult.mother, 'Meena Devi');
  assert.strictEqual(testResult.pickup, 'Dholna Tiraha');

  console.log('\nMonthly Fee Card:');
  console.log(' - Fee:', testResult.fee);
  console.log(' - Effective:', testResult.eff);
  assert.strictEqual(testResult.fee, '₹ 450');
  assert.ok(testResult.eff.includes('April'));

  console.log('\nQuick Actions:');
  console.log(' - Collect Button:', testResult.btnCollect);
  console.log(' - Edit Button:', testResult.btnEdit);
  console.log(' - Remove Button (visible):', testResult.btnRemove);
  assert.strictEqual(testResult.btnCollect, true);
  assert.strictEqual(testResult.btnEdit, true);
  assert.strictEqual(testResult.btnRemove, true);

  console.log('\nUsage & Fee History Table:');
  console.log(' - Table Headers:', testResult.usageThs);
  assert.strictEqual(testResult.hasDiscountColumn, false, 'Discount column must be removed');
  assert.strictEqual(testResult.hasBalanceColumn, false, 'Balance column must be removed');
  assert.strictEqual(testResult.hasDueAmountColumn, true, 'Due Amount (₹) must be present');
  assert.strictEqual(testResult.usageThs.length, 7, 'Must have exactly 7 columns');

  console.log('\nPayment Summary:');
  console.log(' - Total Fees:', testResult.sumTotalFees);
  console.log(' - Total Paid:', testResult.sumTotalPaid);
  console.log(' - Total Discount:', testResult.sumTotalDisc);
  console.log(' - Outstanding Due:', testResult.sumOutstanding);
  console.log(' - Due Box Class:', testResult.dueBoxClass);
  assert.strictEqual(testResult.sumTotalFees, '₹ 2,700');
  assert.strictEqual(testResult.sumTotalPaid, '₹ 2,700');
  assert.strictEqual(testResult.sumTotalDisc, '₹ 0');
  assert.strictEqual(testResult.sumOutstanding, '₹ 0');
  assert.ok(testResult.dueBoxClass.includes('zero'));

  console.log('\nPayment Receipts:');
  console.log(' - Receipts Count:', testResult.rcptCount);
  console.log(' - Rendered Rows:', testResult.rcptRowsCount);
  console.log(' - Has View Button:', testResult.hasViewBtn);
  console.log(' - Has Print Button:', testResult.hasPrintBtn);
  console.log(' - View All Button Display:', testResult.viewAllBtnDisplay);
  console.log(' - Wrap Height After Toggle:', testResult.wrapHeightAfterToggle);
  assert.strictEqual(testResult.rcptCount, '6');
  assert.strictEqual(testResult.rcptRowsCount, 6);
  assert.strictEqual(testResult.hasViewBtn, true);
  assert.strictEqual(testResult.hasPrintBtn, true);
  assert.notStrictEqual(testResult.viewAllBtnDisplay, 'none');
  assert.strictEqual(testResult.wrapHeightAfterToggle, 'none');

  // Wait for DOM painting
  await new Promise(r => setTimeout(r, 1000));

  // Capture Screenshot of Modal
  const artifactDir = path.resolve('C:/Users/HP/.gemini/antigravity/brain/09fab391-3131-4e63-9822-ed522316ce4e');
  const screenshot = await win.webContents.capturePage();
  const screenPath = path.join(artifactDir, 'screenshot_transport_details_redesign.png');
  fs.writeFileSync(screenPath, screenshot.toPNG());
  console.log(`\nScreenshot successfully saved to: ${screenPath}`);

  console.log('\n=== ALL DETAILED VERIFICATION CHECKS PASSED 100%! ===');

  win.destroy();
  app.quit();
});
