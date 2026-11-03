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
            stoppedAt: null,
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

      // Inspect Table Scrollbar & Row Counts
      const tableCardEl = document.querySelector('#modalStudentTransportDetails .tr-det-table-card');
      const tableRows = Array.from(document.querySelectorAll('#tr_details_usage_tbody tr'));
      const isTableCardScrollable = tableCardEl ? (tableCardEl.scrollHeight > tableCardEl.clientHeight && window.getComputedStyle(tableCardEl).overflowY === 'auto') : false;

      const baselineRows = tableRows.map(tr => {
        const tds = Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim());
        return { month: tds[0], status: tds[1], type: tds[2], pickup: tds[3], fee: tds[4], paid: tds[5], due: tds[6] };
      });

      // Inspect Right Column Cards Sizing
      const summaryCardRect = document.querySelector('#modalStudentTransportDetails .tr-det-summary-card')?.getBoundingClientRect();
      const receiptsCardRect = document.querySelector('#modalStudentTransportDetails .tr-det-receipts-card')?.getBoundingClientRect();
      const rcptsWrapRect = document.querySelector('#modalStudentTransportDetails .tr-det-rcpts-wrap')?.getBoundingClientRect();
      const usageCardRect = document.querySelector('#modalStudentTransportDetails .tr-det-usage-card')?.getBoundingClientRect();

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

      // -------------------------------------------------------------
      // SCENARIO 2 VERIFICATION: Student Assigned from May (Non-enrolled April)
      // -------------------------------------------------------------
      DB.transport.assignments[1001].effectiveFrom = 'May';
      DB.transport.assignments[1001].stoppedAt = null;
      openStudentTransportDetailsModal(1001);

      const usageRowsS2 = Array.from(document.querySelectorAll('#tr_details_usage_tbody tr')).map(tr => {
        const tds = Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim());
        return { month: tds[0], status: tds[1], type: tds[2], pickup: tds[3], fee: tds[4], paid: tds[5], due: tds[6] };
      });
      const aprRowS2 = usageRowsS2.find(r => r.month.startsWith('Apr'));
      const mayRowS2 = usageRowsS2.find(r => r.month.startsWith('May'));
      const sumFeesS2 = document.getElementById('tr_sum_total_fees')?.textContent || '';

      // -------------------------------------------------------------
      // SCENARIO 3 VERIFICATION: Student Removed in August (Cancelled Sept onward)
      // -------------------------------------------------------------
      DB.transport.assignments[1001].effectiveFrom = 'April';
      DB.transport.assignments[1001].stoppedAt = 'August';
      openStudentTransportDetailsModal(1001);

      const usageRowsS3 = Array.from(document.querySelectorAll('#tr_details_usage_tbody tr')).map(tr => {
        const tds = Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim());
        return { month: tds[0], status: tds[1], type: tds[2], pickup: tds[3], fee: tds[4], paid: tds[5], due: tds[6] };
      });
      const augRowS3 = usageRowsS3.find(r => r.month.startsWith('Aug'));
      const sepRowS3 = usageRowsS3.find(r => r.month.startsWith('Sep'));
      const octRowS3 = usageRowsS3.find(r => r.month.startsWith('Oct'));
      const sumFeesS3 = document.getElementById('tr_sum_total_fees')?.textContent || '';

      // Restore baseline for screenshot
      DB.transport.assignments[1001].effectiveFrom = 'April 2026';
      DB.transport.assignments[1001].stoppedAt = null;
      openStudentTransportDetailsModal(1001);

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
        usageRowCount: tableRows.length,
        isTableCardScrollable,
        baselineRows,
        summaryCardHeight: summaryCardRect?.height,
        receiptsCardHeight: receiptsCardRect?.height,
        rcptsWrapHeight: rcptsWrapRect?.height,
        usageCardHeight: usageCardRect?.height,
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
        wrapHeightAfterToggle,
        aprRowS2,
        mayRowS2,
        sumFeesS2,
        augRowS3,
        sepRowS3,
        octRowS3,
        sumFeesS3
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
  console.log(' - Total Month Rows Rendered:', testResult.usageRowCount);
  console.log(' - Table Card Has Internal Scrollbar:', testResult.isTableCardScrollable);
  assert.strictEqual(testResult.hasDiscountColumn, false, 'Discount column must be removed');
  assert.strictEqual(testResult.hasBalanceColumn, false, 'Balance column must be removed');
  assert.strictEqual(testResult.hasDueAmountColumn, true, 'Due Amount (₹) must be present');
  assert.strictEqual(testResult.usageThs.length, 7, 'Must have exactly 7 columns');
  assert.strictEqual(testResult.usageRowCount, 12, 'Must display all 12 session months');
  assert.strictEqual(testResult.isTableCardScrollable, false, 'Table card must not have internal vertical scrollbar');

  console.log('\nBaseline Rows Enrollment Status Check:');
  const aprRow = testResult.baselineRows.find(r => r.month.startsWith('Apr'));
  const decRow = testResult.baselineRows.find(r => r.month.startsWith('Dec'));
  const janRow = testResult.baselineRows.find(r => r.month.startsWith('Jan'));
  console.log(' - April (Past Enrolled):', aprRow);
  console.log(' - December (Future Upcoming):', decRow);
  console.log(' - January (Future Upcoming):', janRow);
  assert.strictEqual(aprRow.status, 'Enrolled', 'Past enrolled month must show Enrolled');
  assert.strictEqual(decRow.status, 'Upcoming', 'Future month must show Upcoming');
  assert.strictEqual(janRow.status, 'Upcoming', 'Future month must show Upcoming');
  assert.strictEqual(decRow.due, '—', 'Future month due must be —');
  assert.strictEqual(janRow.due, '—', 'Future month due must be —');

  console.log('\nRight Column Sizing:');
  console.log(' - Summary Card Height:', testResult.summaryCardHeight);
  console.log(' - Receipts Card Height:', testResult.receiptsCardHeight);
  console.log(' - Receipts Wrap Height:', testResult.rcptsWrapHeight);
  assert.ok(testResult.receiptsCardHeight >= 140, 'Receipts card should have increased vertical height');

  console.log('\nScenario 2 (Assigned from May - April Not Enrolled):');
  console.log(' - April Row:', testResult.aprRowS2);
  console.log(' - May Row:', testResult.mayRowS2);
  assert.strictEqual(testResult.aprRowS2.status, 'Not Enrolled', 'April must be marked Not Enrolled');
  assert.strictEqual(testResult.aprRowS2.fee, '—', 'April fee must be —');
  assert.strictEqual(testResult.aprRowS2.due, '—', 'April due must be —');
  assert.strictEqual(testResult.mayRowS2.status, 'Enrolled', 'May must be marked Enrolled');
  assert.strictEqual(testResult.mayRowS2.fee, '₹ 450', 'May fee must be ₹ 450');

  console.log('\nScenario 3 (Cancelled in August - Sept onward Cancelled):');
  console.log(' - August Row:', testResult.augRowS3);
  console.log(' - September Row:', testResult.sepRowS3);
  console.log(' - October Row:', testResult.octRowS3);
  assert.strictEqual(testResult.augRowS3.status, 'Enrolled', 'August must be marked Enrolled');
  assert.strictEqual(testResult.sepRowS3.status, 'Cancelled', 'September must be marked Cancelled');
  assert.strictEqual(testResult.sepRowS3.fee, '—', 'September fee must be —');
  assert.strictEqual(testResult.sepRowS3.due, '—', 'September due must be —');
  assert.strictEqual(testResult.octRowS3.status, 'Cancelled', 'October must be marked Cancelled');
  assert.strictEqual(testResult.octRowS3.fee, '—', 'October fee must be —');
  assert.strictEqual(testResult.octRowS3.due, '—', 'October due must be —');

  // Dynamic expectation based on current month (no hardcoded dates):
  const now = new Date();
  const curMo = now.getMonth() + 1; // 1 to 12
  const expectedMonthsUpToNow = (curMo >= 4) ? (curMo - 3) : (9 + curMo);
  const expectedTotalFees = `₹ ${(expectedMonthsUpToNow * 450).toLocaleString('en-IN')}`;
  const expectedDue = `₹ ${Math.max(0, expectedMonthsUpToNow * 450 - 2700).toLocaleString('en-IN')}`;

  console.log('\nPayment Summary:');
  console.log(' - Total Fees:', testResult.sumTotalFees, '(Expected:', expectedTotalFees, ')');
  console.log(' - Total Paid:', testResult.sumTotalPaid);
  console.log(' - Total Discount:', testResult.sumTotalDisc);
  console.log(' - Outstanding Due:', testResult.sumOutstanding, '(Expected:', expectedDue, ')');
  console.log(' - Due Box Class:', testResult.dueBoxClass);
  assert.strictEqual(testResult.sumTotalFees, expectedTotalFees);
  assert.strictEqual(testResult.sumTotalPaid, '₹ 2,700');
  assert.strictEqual(testResult.sumTotalDisc, '₹ 0');
  assert.strictEqual(testResult.sumOutstanding, expectedDue);
  if (expectedMonthsUpToNow * 450 - 2700 === 0) {
    assert.ok(testResult.dueBoxClass.includes('zero'));
  } else {
    assert.ok(testResult.dueBoxClass.includes('due'));
  }

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

  // Multi-resolution Responsive Layout Checks
  const resolutions = [
    { width: 1366, height: 768, label: '1366x768 (Standard Desktop / Laptop)' },
    { width: 1600, height: 900, label: '1600x900 (HD+ Desktop)' },
    { width: 1920, height: 1080, label: '1920x1080 (Full HD Desktop)' }
  ];

  for (const res of resolutions) {
    win.setSize(res.width, res.height);
    await new Promise(r => setTimeout(r, 200));
    const layout = await win.webContents.executeJavaScript(`
      (() => {
        const modal = document.querySelector('#modalStudentTransportDetails .md');
        if (!modal) return { ok: false };
        const rect = modal.getBoundingClientRect();
        return {
          ok: true,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          fitsWidth: rect.width <= window.innerWidth,
          fitsHeight: rect.height <= window.innerHeight
        };
      })()
    `);
    console.log(`Viewport ${res.label}: modal=${layout.width}x${layout.height}px, fitsWidth=${layout.fitsWidth}, fitsHeight=${layout.fitsHeight}`);
    assert.strictEqual(layout.fitsWidth, true, `Modal must fit within width at ${res.label}`);
    assert.strictEqual(layout.fitsHeight, true, `Modal must fit within height at ${res.label}`);
  }

  // Restore baseline size for screenshot
  win.setSize(1400, 950);
  await new Promise(r => setTimeout(r, 400));

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
