/**
 * test_transport_session_dues.js
 * Comprehensive Multi-Agent Automated Test Suite for:
 * 1. UI: Removal of session dropdown, unified multi-session month list.
 * 2. Calculation & Payment: Multi-session dues finding, enrollment boundary safety, exact allocation, mixed-session receipts.
 * 3. Ledger Display & Verification: Session Due total outstanding across all sessions, short month range formatting, gaps handling, immediate updates upon payment.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('=== MULTI-AGENT TRANSPORT FEES VERIFICATION: PENDING PREVIOUS SESSION FIX ===\n');

// =========================================================================
// AGENT 1: UI VERIFICATION (index.html)
// =========================================================================
console.log('--- AGENT 1 UI CHECKS: index.html ---');
const indexHtml = fs.readFileSync(path.join(__dirname, '../src/index.html'), 'utf8');

// Check 1: Session dropdown is removed from Collect Transport modal
assert.ok(!indexHtml.includes('id="tr_col_session_select"'), 'Academic Session dropdown #tr_col_session_select must be removed from Collect Modal');
assert.ok(!indexHtml.includes('id="tr_col_session_badge"'), 'Session badge #tr_col_session_badge must be removed from Collect Modal');
console.log('✓ PASS: Academic Session dropdown is completely removed from Collect Transport Fee modal');

// Check 2: Column headers in Transport Ledger
assert.ok(indexHtml.includes('<th class="text-right">This Month Due</th>'), 'Header "This Month Due" must be present');
assert.ok(indexHtml.includes('<th class="text-right">Session Due</th>'), 'Header "Session Due" must be present');
console.log('✓ PASS: Table headers "This Month Due" and "Session Due" are present');

// =========================================================================
// AGENT 2 & 3: CALCULATION, ALLOCATION & DISPLAY IN ISOLATED SANDBOX
// =========================================================================
const rawAppJs = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8');
const appJs = rawAppJs.replace(/\binit\(\);?\s*$/, '// init();');

function createMockEnvironment() {
  const domElements = {};
  function makeElement(id, tag = 'div') {
    return {
      id,
      tagName: tag.toUpperCase(),
      style: {},
      innerHTML: '',
      textContent: '',
      value: '',
      checked: false,
      options: [],
      classList: {
        add: () => {},
        remove: () => {},
        contains: () => false
      },
      setAttribute: () => {},
      getAttribute: () => null,
      remove: () => {},
      appendChild: function (child) {
        this.options.push(child);
      },
      querySelectorAll: () => [],
      addEventListener: () => {},
      removeEventListener: () => {}
    };
  }

  const ids = [
    'tr_ledger_title', 'tr_ledger_tbody', 'tr_stat_collected', 'tr_stat_collected_sub',
    'tr_stat_pending', 'tr_stat_pending_sub', 'tr_stat_students', 'tr_stat_stops',
    'tr_col_search_input', 'tr_col_search_results', 'tr_col_class_filter', 'tr_col_student_switcher',
    'tr_col_student_name', 'tr_col_student_class', 'tr_col_student_mode', 'tr_col_student_stop',
    'tr_col_student_rate', 'tr_col_student_status', 'tr_col_discount_amount', 'tr_col_discount_reason',
    'tr_col_discount_display', 'tr_col_amount_input', 'tr_col_total_display', 'tr_col_balance_display',
    'tr_col_payment_mode', 'tr_col_allow_advance', 'tr_col_months_list', 'tr_btn_select_all_months',
    'tr_col_allocation_preview', 'tr_rcpt_no', 'tr_rcpt_date', 'tr_rcpt_session', 'tr_rcpt_school_name',
    'tr_rcpt_logo_img', 'tr_rcpt_st_name', 'tr_rcpt_st_adm', 'tr_rcpt_st_class', 'tr_rcpt_pickup',
    'tr_rcpt_drop', 'tr_rcpt_month', 'tr_rcpt_fee', 'tr_rcpt_disc', 'tr_rcpt_received', 'tr_rcpt_bal',
    'tr_rcpt_mode', 'tr_rcpt_items_tbody'
  ];

  ids.forEach(id => {
    domElements[id] = makeElement(id, id.includes('select') ? 'select' : (id.includes('input') ? 'input' : 'div'));
  });

  const doc = {
    getElementById: (id) => domElements[id] || makeElement(id),
    querySelectorAll: () => [],
    querySelector: () => null,
    createElement: (tag) => makeElement('', tag),
    addEventListener: () => {},
    removeEventListener: () => {},
    body: makeElement('body')
  };

  const sandbox = {
    console,
    document: doc,
    window: {
      addEventListener: () => {},
      removeEventListener: () => {},
      electronAPI: {
        loadData: () => ({}),
        saveData: () => true,
        getDataPath: () => 'mock/path',
        printContent: () => {}
      }
    },
    setTimeout: (fn) => fn(),
    clearTimeout: () => {},
    setInterval: () => {},
    clearInterval: () => {},
    Date: Date,
    Math: Math,
    parseInt: parseInt,
    parseFloat: parseFloat,
    isNaN: isNaN,
    String: String,
    Number: Number,
    Array: Array,
    Object: Object,
    Set: Set,
    Map: Map,
    openM: () => {},
    closeM: () => {},
    showToast: () => {},
    saveDB: () => {},
    safeCurrency: (n) => '₹ ' + Number(n || 0).toLocaleString('en-IN')
  };

  vm.createContext(sandbox);
  vm.runInContext(appJs, sandbox);
  return sandbox;
}

const env = createMockEnvironment();

// Setup 6 distinct students covering all requirements
vm.runInContext(`
DB = {
  settings: { currentSession: '2026–27' },
  sessions: [
    { name: '2026–27', startDate: '2026-04-01', endDate: '2027-03-31', active: true },
    { name: '2025–26', startDate: '2025-04-01', endDate: '2026-03-31', active: false }
  ],
  students: [
    { id: 101, name: 'Student A (Current Dues Only)', admno: 'ADM-101', cls: '5', section: 'A', status: 'Active' },
    { id: 102, name: 'Student B (Prev Dues Only)', admno: 'ADM-102', cls: '6', section: 'A', status: 'Active' },
    { id: 103, name: 'Student C (Mixed Session Dues)', admno: 'ADM-103', cls: '7', section: 'A', status: 'Active' },
    { id: 104, name: 'Student D (Gaps In Dues)', admno: 'ADM-104', cls: '8', section: 'A', status: 'Active' },
    { id: 105, name: 'Student E (Partially Paid)', admno: 'ADM-105', cls: '9', section: 'A', status: 'Active' },
    { id: 106, name: 'Student F (Fully Paid)', admno: 'ADM-106', cls: '10', section: 'A', status: 'Active' }
  ],
  transport: {
    stops: [{ id: 1, name: 'Main Gate', monthlyFee: 500, active: true }],
    assignments: {
      // 101: Enrolled April 2026 (current session only). Active month Oct 2026.
      101: {
        studentId: 101, pickupStopId: 1, pickupStopName: 'Main Gate', dropStopId: 1, dropStopName: 'Main Gate',
        type: 'same', monthlyFee: 500, effectiveFrom: 'April 2026', stoppedAt: null, active: true
      },
      // 102: Enrolled April 2025, stopped March 2026. Prior dues only!
      102: {
        studentId: 102, pickupStopId: 1, pickupStopName: 'Main Gate', dropStopId: 1, dropStopName: 'Main Gate',
        type: 'same', monthlyFee: 400, effectiveFrom: 'April 2025', stoppedAt: 'March 2026', active: false
      },
      // 103: Enrolled April 2025, active continuous through 2026–27. Mixed session dues!
      103: {
        studentId: 103, pickupStopId: 1, pickupStopName: 'Main Gate', dropStopId: 1, dropStopName: 'Main Gate',
        type: 'same', monthlyFee: 500, effectiveFrom: 'April 2025', stoppedAt: null, active: true
      },
      // 104: Enrolled April 2025. Has payments in middle, creating a gap in pending months.
      104: {
        studentId: 104, pickupStopId: 1, pickupStopName: 'Main Gate', dropStopId: 1, dropStopName: 'Main Gate',
        type: 'same', monthlyFee: 500, effectiveFrom: 'April 2025', stoppedAt: null, active: true
      },
      // 105: Enrolled October 2026, partial payment made.
      105: {
        studentId: 105, pickupStopId: 1, pickupStopName: 'Main Gate', dropStopId: 1, dropStopName: 'Main Gate',
        type: 'same', monthlyFee: 600, effectiveFrom: 'October 2026', stoppedAt: null, active: true
      },
      // 106: Enrolled April 2026, all months fully paid.
      106: {
        studentId: 106, pickupStopId: 1, pickupStopName: 'Main Gate', dropStopId: 1, dropStopName: 'Main Gate',
        type: 'same', monthlyFee: 500, effectiveFrom: 'April 2026', stoppedAt: null, active: true
      }
    },
    payments: [
      // Payments for 104: paid June 2025 through September 2026, so pending are Apr-May 2025 and Oct 2026!
      {
        id: 'p104_1', receiptNo: 'TR-2025-0001', studentId: 104, date: '10 Jun 2025', amountReceived: 8000,
        allocations: [
          { month: 'June 2025', paidAllocated: 500, fee: 500 },
          { month: 'July 2025', paidAllocated: 500, fee: 500 },
          { month: 'August 2025', paidAllocated: 500, fee: 500 },
          { month: 'September 2025', paidAllocated: 500, fee: 500 },
          { month: 'October 2025', paidAllocated: 500, fee: 500 },
          { month: 'November 2025', paidAllocated: 500, fee: 500 },
          { month: 'December 2025', paidAllocated: 500, fee: 500 },
          { month: 'January 2026', paidAllocated: 500, fee: 500 },
          { month: 'February 2026', paidAllocated: 500, fee: 500 },
          { month: 'March 2026', paidAllocated: 500, fee: 500 },
          { month: 'April 2026', paidAllocated: 500, fee: 500 },
          { month: 'May 2026', paidAllocated: 500, fee: 500 },
          { month: 'June 2026', paidAllocated: 500, fee: 500 },
          { month: 'July 2026', paidAllocated: 500, fee: 500 },
          { month: 'August 2026', paidAllocated: 500, fee: 500 },
          { month: 'September 2026', paidAllocated: 500, fee: 500 }
        ]
      },
      // Payment for 105: partial payment of 200 in October 2026 (due 400 remaining)
      {
        id: 'p105_1', receiptNo: 'TR-2026-0002', studentId: 105, date: '10 Oct 2026', amountReceived: 200,
        allocations: [{ month: 'October 2026', paidAllocated: 200, fee: 600 }]
      },
      // Payment for 106: paid all months from April 2026 to October 2026
      {
        id: 'p106_1', receiptNo: 'TR-2026-0003', studentId: 106, date: '10 Oct 2026', amountReceived: 3500,
        allocations: [
          { month: 'April 2026', paidAllocated: 500, fee: 500 },
          { month: 'May 2026', paidAllocated: 500, fee: 500 },
          { month: 'June 2026', paidAllocated: 500, fee: 500 },
          { month: 'July 2026', paidAllocated: 500, fee: 500 },
          { month: 'August 2026', paidAllocated: 500, fee: 500 },
          { month: 'September 2026', paidAllocated: 500, fee: 500 },
          { month: 'October 2026', paidAllocated: 500, fee: 500 }
        ]
      }
    ],
    nextReceiptSeq: 10
  }
};
transportState.activeSession = '2026–27';
transportState.activeMonth = 'October 2026';
invalidatePerformanceIndices();
`, env);

console.log('\n--- AGENT 3 CHECKS: Ledger Dues & Range Formatting ---');
const rows = env.buildTransportLedgerRows();

// Test Student A (101): Enrolled April 2026, unpaid April to October 2026 (7 months @ 500 = 3500)
// This Month Due (October 2026) = 500. Session Due (all sessions total) = 3500. Range = Apr 2026 – Oct 2026.
const rowA = rows.find(r => r.id === 101);
assert.ok(rowA, 'Student A must be present in ledger');
assert.strictEqual(rowA.due, 500, 'Student A This Month Due must be 500');
assert.strictEqual(rowA.sessionDue, 3500, 'Student A Session Due must be 3500 (Apr-Oct 2026)');
assert.strictEqual(rowA.pendingRangeText, 'Apr 2026 – Oct 2026', 'Student A range must be Apr 2026 – Oct 2026');
console.log('✓ PASS: Student A (Current session dues only): This Month Due = ₹500, Session Due = ₹3,500 [Apr 2026 – Oct 2026]');

// Test Student C (103): Mixed session dues. Enrolled April 2025.
// 2025-26: 12 months @ 500 = 6000.
// 2026-27: 7 months (Apr to Oct 2026) @ 500 = 3500.
// Total Session Due = 6000 + 3500 = 9500!
// Range = Apr 2025 – Oct 2026.
const rowC = rows.find(r => r.id === 103);
assert.ok(rowC, 'Student C must be present in ledger');
assert.strictEqual(rowC.due, 500, 'Student C This Month Due must be 500');
assert.strictEqual(rowC.sessionDue, 9500, 'Student C Session Due must be 9500 (19 months continuous @ 500)');
assert.strictEqual(rowC.pendingRangeText, 'Apr 2025 – Oct 2026', 'Student C range must be continuous Apr 2025 – Oct 2026');
console.log('✓ PASS: Student C (Mixed session continuous dues): This Month Due = ₹500, Session Due = ₹9,500 [Apr 2025 – Oct 2026]');

// Test Student D (104): Gaps in dues.
// Unpaid months: April 2025, May 2025 (2 months = 1000), and October 2026 (1 month = 500).
// Total Session Due = 1500.
// Range must NOT falsely join gaps; must display: "Apr 2025 – May 2025, Oct 2026"!
const rowD = rows.find(r => r.id === 104);
assert.ok(rowD, 'Student D must be present in ledger');
assert.strictEqual(rowD.due, 500, 'Student D This Month Due must be 500');
assert.strictEqual(rowD.sessionDue, 1500, 'Student D Session Due must be 1500');
assert.strictEqual(rowD.pendingRangeText, 'Apr 2025 – May 2025, Oct 2026', 'Gaps must NOT be continuous; must show disjoint runs');
console.log('✓ PASS: Student D (Gaps in pending months): Session Due = ₹1,500 [Apr 2025 – May 2025, Oct 2026]');

// Test Student E (105): Partially paid month.
// Monthly fee: 600. Paid: 200. Remaining: 400.
const rowE = rows.find(r => r.id === 105);
assert.ok(rowE, 'Student E must be present in ledger');
assert.strictEqual(rowE.due, 400, 'Student E This Month Due must be 400');
assert.strictEqual(rowE.sessionDue, 400, 'Student E Session Due must be 400');
assert.strictEqual(rowE.pendingRangeText, 'Oct 2026');
console.log('✓ PASS: Student E (Partially paid month): This Month Due = ₹400, Session Due = ₹400 [Oct 2026]');

// Test Student F (106): Fully paid.
const rowF = rows.find(r => r.id === 106);
assert.ok(rowF, 'Student F must be present in ledger');
assert.strictEqual(rowF.due, 0, 'Student F This Month Due must be 0');
assert.strictEqual(rowF.sessionDue, 0, 'Student F Session Due must be 0');
assert.strictEqual(rowF.status, 'Paid');
console.log('✓ PASS: Student F (Fully paid): This Month Due = ₹0, Session Due = ₹0, Status = Paid');

// Check Table HTML Render
env.renderTransportLedger();
const tbodyHtml = env.document.getElementById('tr_ledger_tbody').innerHTML;
assert.ok(tbodyHtml.includes('Apr 2025 – Oct 2026'), 'Range must be rendered under Session Due cell');
assert.ok(tbodyHtml.includes('Apr 2025 – May 2025, Oct 2026'), 'Disjoint range must be rendered under Session Due cell');
console.log('✓ PASS: Table HTML successfully displays Session Due with short pending month ranges');

// =========================================================================
// AGENT 2 CHECKS: UNIFIED MONTHS LIST & PAYMENT FLOW
// =========================================================================
console.log('\n--- AGENT 2 CHECKS: Unified Month List & Payment Flow ---');
// Select Student C (103)
env.selectCollectStudent(103);
const monthsListHtml = env.document.getElementById('tr_col_months_list').innerHTML;

// Verify both 2025 and 2026 months exist together in the same list
assert.ok(monthsListHtml.includes('April 2025'), 'April 2025 must be in unified month list');
assert.ok(monthsListHtml.includes('May 2025'), 'May 2025 must be in unified month list');
assert.ok(monthsListHtml.includes('March 2026'), 'March 2026 must be in unified month list');
assert.ok(monthsListHtml.includes('April 2026'), 'April 2026 must be in unified month list');
assert.ok(monthsListHtml.includes('October 2026'), 'October 2026 must be in unified month list');
assert.ok(monthsListHtml.includes('Previous Due'), 'Previous session months must show Previous Due badge');
console.log('✓ PASS: Previous session months and current session months appear together in the same list');

// Verify enrollment boundary rule: Student A (101) enrolled April 2026 must NOT charge 2025 months
env.selectCollectStudent(101);
const stAMonthsHtml = env.document.getElementById('tr_col_months_list').innerHTML;
assert.ok(!stAMonthsHtml.includes('April 2025'), 'Months before enrollment date (April 2026) must not be charged');
console.log('✓ PASS: Months before enrollment date are strictly not charged');

// Test Payment Across Mixed Sessions (Student C: pay March 2026 from prev session and April 2026 from current session)
env.selectCollectStudent(103);

const cbMar2026 = {
  value: 'March 2026',
  checked: true,
  getAttribute: (k) => k === 'data-balance' ? '500' : (k === 'data-fee' ? '500' : '0')
};
const cbApr2026 = {
  value: 'April 2026',
  checked: true,
  getAttribute: (k) => k === 'data-balance' ? '500' : (k === 'data-fee' ? '500' : '0')
};

env.document.querySelectorAll = (sel) => {
  if (sel === '.tr-due-mo-check:checked') return [cbMar2026, cbApr2026];
  if (sel === '.tr-due-mo-check:not(:disabled)') return [cbMar2026, cbApr2026];
  return [];
};

env.document.getElementById('tr_col_amount_input').value = '1000';
env.document.getElementById('tr_col_payment_mode').value = 'Bank Transfer';

env.saveTransportPayment();

const lastPayment = vm.runInContext('DB.transport.payments[DB.transport.payments.length - 1]', env);
assert.ok(lastPayment, 'Payment must be recorded');
assert.strictEqual(lastPayment.sessionType, 'mixed', 'Payment spanning both sessions must be sessionType mixed');
assert.ok(lastPayment.session.includes('2025–26') && lastPayment.session.includes('2026–27'), 'Session field must reflect both sessions');
assert.strictEqual(lastPayment.allocations[0].session, '2025–26', 'March 2026 allocation must belong to 2025–26');
assert.strictEqual(lastPayment.allocations[1].session, '2026–27', 'April 2026 allocation must belong to 2026–27');
console.log('✓ PASS: Mixed session payment correctly recorded allocations across 2025–26 and 2026–27');

// Verify Student C ledger update: Session Due must drop from 9500 to 8500!
const updatedRows = env.buildTransportLedgerRows();
const updatedRowC = updatedRows.find(r => r.id === 103);
assert.strictEqual(updatedRowC.sessionDue, 8500, 'Student C Session Due must immediately drop from 9500 to 8500');
console.log('✓ PASS: Paying dues immediately updates ledger Session Due to ₹8,500');

console.log('\n=== ALL MULTI-AGENT REQUIREMENTS VERIFIED AND PASSED 100%! ===');
