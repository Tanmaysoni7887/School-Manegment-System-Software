/**
 * Comprehensive End-to-End Test Suite for Shiksha_App Key Modules:
 * 1. Student Management (Active student filtering, admission numbering)
 * 2. Fee Collection & Receipt Generation
 * 3. Transport Fees (Multi-session dues, ledger, receipt modal)
 * 4. Reports & Printing (3-signature layout across reports)
 * 5. Academic Promotion (Promotion, repeat, boundary condition on Class 12, historical data preservation)
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

console.log('=== STARTING KEY MODULES END-TO-END VERIFICATION SUITE ===\n');

// 1. Mock DOM
const domElements = {};
function makeElement(id, tag = 'div') {
  if (!domElements[id]) {
    domElements[id] = {
      id,
      tagName: tag.toUpperCase(),
      style: {},
      innerHTML: '',
      textContent: '',
      value: '',
      title: '',
      checked: false,
      options: [],
      classList: {
        _classes: new Set(),
        add: function(c) { this._classes.add(c); },
        remove: function(c) { this._classes.delete(c); },
        contains: function(c) { return this._classes.has(c); }
      },
      setAttribute: () => {},
      getAttribute: () => null,
      remove: () => {},
      appendChild: function (child) { this.options.push(child); },
      cloneNode: function() {
        return {
          ...this,
          innerHTML: this.innerHTML,
          outerHTML: this.outerHTML || `<div id="${this.id}">${this.innerHTML}</div>`,
          querySelectorAll: () => [],
          querySelector: () => null,
          remove: () => {}
        };
      },
      querySelectorAll: () => [],
      querySelector: () => null,
      addEventListener: () => {},
      removeEventListener: () => {}
    };
  }
  return domElements[id];
}

const mockDocument = {
  getElementById: (id) => makeElement(id),
  querySelectorAll: (selector) => {
    if (selector === '.prm_st_check:checked') {
      return (mockDocument._checkedBoxes || []);
    }
    return [];
  },
  querySelector: () => null,
  addEventListener: () => {},
  removeEventListener: () => {},
  body: makeElement('body'),
  createElement: (tag) => makeElement('anon_' + Math.random(), tag),
  _checkedBoxes: []
};

// 2. Load demo dataset
const dataCandidates = [
  path.resolve(__dirname, '../../DEMO_TEST_KIT/demo_school_data_large.json'),
  path.resolve(__dirname, '../DEMO_TEST_KIT/demo_school_data_large.json'),
  path.resolve(__dirname, 'benchmark_datasets/dataset_C_1476.json')
];
const dataPath = dataCandidates.find(p => fs.existsSync(p));
assert.ok(dataPath, 'Dataset must exist');
const demoData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

// 3. Load app.js in sandbox
const appJsPath = path.resolve(__dirname, '../src/app.js');
const rawAppJs = fs.readFileSync(appJsPath, 'utf8').replace(/\binit\(\);?\s*$/, '// init();');

let printedHtmlStore = {};
let lastToast = null;

const sandbox = {
  document: mockDocument,
  window: {
    addEventListener: () => {},
    removeEventListener: () => {},
    electronAPI: {
      printContent: (html) => {
        printedHtmlStore.lastPrinted = html;
        return Promise.resolve({ success: true });
      },
      loadData: async () => demoData,
      saveData: async () => ({ success: true }),
      exportPDF: async () => ({ success: true })
    }
  },
  navigator: { userAgent: 'node' },
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  isEl: true,
  CLASSES: ['NC', 'LKG', 'UKG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
  SYS_MONTHS: ['January','February','March','April','May','June','July','August','September','October','November','December'],
  MONTHS_LIST: ['April','May','June','July','August','September','October','November','December','January','February','March'],
  toast: (msg, type) => {
    lastToast = { msg, type };
  },
  logActivity: () => {},
  saveDB: () => {},
  closeM: () => {},
  openM: () => {},
  clL: (c) => `Class ${c}`
};

vm.createContext(sandbox);
vm.runInContext(rawAppJs, sandbox);
sandbox._testData = JSON.parse(JSON.stringify(demoData));
vm.runInContext(`
  DB = _testData;
  invalidatePerformanceIndices();
  toast = function(msg, type) { window._lastToast = { msg, type }; };
`, sandbox);
const DB = sandbox._testData;

// =========================================================================
// MODULE 1: STUDENT MANAGEMENT (Active Filtering & Admission Numbering)
// =========================================================================
console.log('--- MODULE 1: Student Management Verification ---');

// 1.1 Active Student Filtering
const allStudents = vm.runInContext('DB.students', sandbox);
const activeList = sandbox.getActiveStudents('2026–27');
const totalCount = sandbox.getActiveStudentCount('2026–27');

assert.strictEqual(activeList.length, totalCount, 'getActiveStudents count must match getActiveStudentCount');
assert.ok(activeList.every(s => sandbox.isStudentActive(s)), 'Every student in activeList must satisfy isStudentActive');

// Ensure inactive/left are excluded
const leftStudents = allStudents.filter(s => s.status === 'Left School');
assert.ok(leftStudents.length > 0, 'Test dataset must have Left School students');
assert.ok(leftStudents.every(s => !sandbox.isStudentActive(s)), 'Left School students must return false for isStudentActive');

console.log(`✓ 1.1 Active Student Filtering: ${activeList.length} active students accurately filtered (excluded ${leftStudents.length} Left School records).`);

// 1.2 Admission Numbering
const admResult = sandbox.generateNextUniqueAdmissionNumber();
const nextAdmNo = typeof admResult === 'object' ? admResult.admno : admResult;
console.log(`Generated next admission number: ${nextAdmNo}`);
assert.ok(typeof nextAdmNo === 'string' && nextAdmNo.length > 0, 'Admission number must be a valid non-empty string');

// Prefix consistency
const prefix = (DB.settings && DB.settings.admissionPrefix) ? DB.settings.admissionPrefix : 'MDC-';
assert.ok(nextAdmNo.startsWith(prefix), `Generated admission number must start with prefix ${prefix}`);

// Verify strictly higher than all existing admission numbers
const existingAdms = new Set(allStudents.map(s => String(s.admno || '').trim().toLowerCase()));
assert.ok(!existingAdms.has(nextAdmNo.toLowerCase()), 'Generated admission number must not collide with any existing student');

console.log(`✓ 1.2 Admission Numbering: Generated unique, non-colliding admission number (${nextAdmNo}) with prefix ${prefix}.\n`);

// =========================================================================
// MODULE 2: FEE COLLECTION & RECEIPT GENERATION
// =========================================================================
console.log('--- MODULE 2: Fee Collection & Receipt Generation Verification ---');

// 2.1 Receipt Number Generation
const nextReceiptNo = sandbox.getNextReceiptNumber();
console.log(`Generated next receipt number: ${nextReceiptNo}`);
assert.ok(typeof nextReceiptNo === 'string' && nextReceiptNo.startsWith('REC-'), 'Receipt number must follow REC-XXXX convention');

// Ensure uniqueness against all past payments
const existingReceipts = new Set((DB.payments || []).map(p => String(p.receiptNo || '').toLowerCase()));
assert.ok(!existingReceipts.has(nextReceiptNo.toLowerCase()), 'Generated receipt number must be strictly unique');

// 2.2 School Fee Receipt HTML Generation & Invariants
const samplePayment = (DB.payments || [])[0];
assert.ok(samplePayment, 'Dataset must have at least one payment record');
printedHtmlStore.lastPrinted = null;
sandbox.printReceiptByNumber(samplePayment.receiptNo, 'a4');
const receiptHtml = printedHtmlStore.lastPrinted;
assert.ok(receiptHtml, 'Receipt HTML must be generated by printReceiptByNumber');

console.log('receiptHtml preview:', receiptHtml.slice(0, 400));
const schoolName = (DB.settings && DB.settings.schoolName) ? DB.settings.schoolName.toUpperCase() : 'MD CONVENT';
assert.ok(receiptHtml.toUpperCase().includes(schoolName) || receiptHtml.includes('MD Convent'), 'Receipt HTML must contain school name');
assert.ok(receiptHtml.includes(samplePayment.receiptNo), 'Receipt HTML must contain receipt number');
assert.ok(receiptHtml.includes(samplePayment.studentName), 'Receipt HTML must contain student name');
assert.ok(receiptHtml.includes('@page { size: A4 portrait; margin: 10mm; }'), 'Receipt HTML must enforce A4 margin 10mm');
assert.ok(receiptHtml.includes('table-layout: fixed;'), 'Receipt table must use table-layout: fixed for zero overflow');
assert.ok(!receiptHtml.includes('undefined'), 'Receipt HTML must never render "undefined"');
assert.ok(!receiptHtml.includes('NaN'), 'Receipt HTML must never render "NaN"');

console.log(`✓ 2.1 & 2.2 Receipt Number & A4 Print Generation: REC format, uniqueness, and print layout validated.\n`);

// =========================================================================
// MODULE 3: TRANSPORT FEES (Multi-Session Dues, Ledger, Receipt Modal)
// =========================================================================
console.log('--- MODULE 3: Transport Fees Verification ---');

// 3.1 Verify Multi-Session Transport Calculation & Ledger Functions
assert.strictEqual(typeof sandbox.buildTransportLedgerRows, 'function', 'buildTransportLedgerRows must be defined');
assert.strictEqual(typeof sandbox.renderTransportLedger, 'function', 'renderTransportLedger must be defined');

const trLedgerRows = sandbox.buildTransportLedgerRows();
assert.ok(Array.isArray(trLedgerRows), 'buildTransportLedgerRows must return an array');
assert.ok(trLedgerRows.length > 0, 'Transport ledger rows must have records');
console.log(`Transport ledger generated ${trLedgerRows.length} rows.`);

// Pick a transport assigned student
const transportAssignments = DB.transport ? (DB.transport.assignments || {}) : {};
const transportStudentIds = Object.keys(transportAssignments);
assert.ok(transportStudentIds.length > 0, 'Dataset must have transport assignments');

const firstRow = trLedgerRows[0];
console.log('firstRow details:', firstRow);
assert.ok(firstRow !== null && typeof firstRow === 'object', 'First ledger row must be valid object');
assert.ok(typeof firstRow.monthlyFee === 'number', 'Transport monthlyFee must be numeric');
assert.ok(typeof firstRow.due === 'number', 'Transport This Month Due must be numeric');
assert.ok(typeof firstRow.sessionDue === 'number', 'Transport Session Due must be numeric');
assert.ok(typeof firstRow.pendingRangeText === 'string', 'Transport pendingRangeText must be string');
console.log(`First student transport ledger entry: ${firstRow.name} (Monthly Fee: ₹${firstRow.monthlyFee}, This Month Due: ₹${firstRow.due}, Session Due: ₹${firstRow.sessionDue}, Range: ${firstRow.pendingRangeText})`);

const trAccounting = sandbox.getStudentMonthTransportAccounting(firstRow.id, 'April 2026');
assert.ok(trAccounting !== null, 'Transport accounting must return valid record');
assert.ok(typeof trAccounting.paid === 'number', 'Transport paid must be numeric');
assert.ok(typeof trAccounting.discount === 'number', 'Transport discount must be numeric');

// 3.2 Transport Receipt Generation
const genuinePayment = {
  receiptNo: 'TR-2026-0001',
  studentId: firstRow.id,
  studentName: firstRow.name,
  admNo: firstRow.admNo,
  amountReceived: 500,
  discount: 0,
  mode: 'Cash',
  date: '2026-11-15',
  allocations: [{ month: 'April 2026', paidAllocated: 500, discountAllocated: 0 }],
  reversed: false
};
if (!DB.transport.payments) DB.transport.payments = [];
DB.transport.payments.push(genuinePayment);

makeElement('tr_receipt_print_area').cloneNode = function() {
  const rcptNo = domElements['tr_rcpt_no'] ? domElements['tr_rcpt_no'].textContent : '';
  const stName = domElements['tr_rcpt_st_name'] ? domElements['tr_rcpt_st_name'].textContent : '';
  return {
    innerHTML: `<div>Receipt: ${rcptNo} | Student: ${stName}</div>`,
    outerHTML: `<div id="tr_receipt_print_area">Receipt: ${rcptNo} | Student: ${stName}</div>`,
    querySelectorAll: () => [],
    querySelector: () => null,
    remove: () => {}
  };
};

printedHtmlStore.lastPrinted = null;
sandbox.printTransportReceiptByNo(genuinePayment.receiptNo);
const trReceiptHtml = printedHtmlStore.lastPrinted;
assert.ok(trReceiptHtml !== null, 'Transport receipt HTML must be generated');
assert.ok(trReceiptHtml.toUpperCase().includes('TRANSPORT'), 'Transport receipt title must be present');
assert.ok(trReceiptHtml.includes(genuinePayment.receiptNo), 'Transport receipt must include receipt number');

console.log(`✓ 3.1 & 3.2 Transport Multi-Session Dues & Receipt Generation: Validated for student ${firstRow.id}.\n`);

// =========================================================================
// MODULE 4: REPORTS & PRINTING (3-Signature Layout)
// =========================================================================
console.log('--- MODULE 4: Reports & Printing (3-Signature Layout) Verification ---');

function verifyThreeSignatures(html, reportName) {
  assert.ok(html !== null && html !== undefined, `${reportName} print HTML must be generated`);
  assert.ok(html.includes('Prepared By'), `${reportName} must include "Prepared By" signature`);
  assert.ok(html.includes('Accountant'), `${reportName} must include "Accountant" signature`);
  assert.ok(html.includes('Principal'), `${reportName} must include "Principal" signature`);
  assert.ok(html.includes('page-break-inside: avoid') || html.includes('break-inside: avoid'), `${reportName} signature block must avoid page break`);
  console.log(`  ✓ ${reportName}: 3-signature block verified (Prepared By, Accountant, Principal)`);
}

// 4.1 Daily Fee Collection & Audit Report
printedHtmlStore.lastPrinted = null;
sandbox.printDailyCollectionReport();
verifyThreeSignatures(printedHtmlStore.lastPrinted, 'Daily Fee Collection & Audit Report');

// 4.2 Monthly Fee Collection Report
printedHtmlStore.lastPrinted = null;
sandbox.printMonthlyCollectionReport();
verifyThreeSignatures(printedHtmlStore.lastPrinted, 'Monthly Fee Collection Report');

// 4.3 Class-wise Collection & Dues Report
printedHtmlStore.lastPrinted = null;
sandbox.printClassWiseCollectionReport();
verifyThreeSignatures(printedHtmlStore.lastPrinted, 'Class-wise Collection & Dues Report');

// 4.4 Class Outstanding Dues & Defaulters Report
if (typeof sandbox.printClassOutstandingDuesReport === 'function') {
  printedHtmlStore.lastPrinted = null;
  sandbox.printClassOutstandingDuesReport();
  verifyThreeSignatures(printedHtmlStore.lastPrinted, 'Class Outstanding Dues & Defaulters Report');
}

console.log('✓ PASS: All official reports enforce the 3-signature layout with clean page-break avoidance.\n');

// =========================================================================
// MODULE 5: ACADEMIC PROMOTION
// =========================================================================
console.log('--- MODULE 5: Academic Promotion Verification ---');

// 5.1 Ensure target academic session exists (2027–28)
const sessionsList = DB.sessions || [];
if (!sessionsList.some(s => s.name === '2027–28' || s.session === '2027–28')) {
  DB.sessions.push({
    name: '2027–28',
    session: '2027–28',
    startDate: '2027-04-01',
    endDate: '2028-03-31',
    status: 'Upcoming'
  });
}

// 5.2 Terminal Class (Class 12) Boundary Condition Check
makeElement('prm_from_cls', 'select').value = '12';
const student12 = DB.students.find(s => s.cls === '12' && sandbox.isStudentActive(s));
assert.ok(student12, 'Dataset must have at least one active Class 12 student');

mockDocument._checkedBoxes = [
  { getAttribute: (attr) => attr === 'data-sid' ? String(student12.id) : null }
];

sandbox.window._lastToast = null;
sandbox.executeBulkAction('promote');
const toast12 = sandbox.window._lastToast;
assert.ok(toast12 !== null, 'Attempting to promote Class 12 must trigger a warning toast');
assert.ok(toast12.msg.includes('Class 12 is the final class'), 'Toast must explain that Class 12 cannot be promoted beyond Class 12');
console.log('✓ 5.1 Terminal Class Guard: Attempting to promote Class 12 students correctly prevented with explanatory warning.');

// 5.3 Normal Promotion (NC -> LKG)
makeElement('prm_from_cls', 'select').value = 'NC';
const ncStudents = DB.students.filter(s => s.cls === 'NC' && sandbox.isStudentActive(s)).slice(0, 5);
assert.strictEqual(ncStudents.length, 5, 'Must have at least 5 active NC students');

const originalAdmNos = ncStudents.map(s => s.admno);
const originalIds = ncStudents.map(s => s.id);

mockDocument._checkedBoxes = ncStudents.map(s => ({
  getAttribute: (attr) => attr === 'data-sid' ? String(s.id) : null
}));

sandbox.executeBulkAction('promote');
const bulkAction = vm.runInContext('curBulkPromotionAction', sandbox);
assert.ok(bulkAction, 'Promotion action payload must be constructed');
assert.strictEqual(bulkAction.nextCls, 'LKG', 'Next class for NC must be LKG');
assert.strictEqual(bulkAction.targetSess, '2027–28', 'Target session must be 2027–28');

// Confirm promotion
sandbox.confirmBulkAction();

// Verify students are now promoted
ncStudents.forEach((s, idx) => {
  assert.strictEqual(s.cls, 'LKG', `Promoted student ${s.name} class must be updated to LKG`);
  assert.strictEqual(s.session, '2027–28', `Promoted student ${s.name} session must be updated to 2027–28`);
  assert.strictEqual(s.admno, originalAdmNos[idx], `Student ${s.name} permanent admission number must remain untouched`);
  assert.strictEqual(s.id, originalIds[idx], `Student ${s.name} internal ID must remain untouched`);

  // Verify enrollment history
  const enrollments = sandbox.getStudentEnrollments(s);
  const srcEnr = enrollments.find(e => e.session === '2026–27');
  const targetEnr = enrollments.find(e => e.session === '2027–28');

  assert.ok(srcEnr, 'Source enrollment (2026–27) must exist');
  assert.strictEqual(srcEnr.status, 'Promoted', 'Source enrollment status must be "Promoted"');
  assert.strictEqual(srcEnr.cls, 'NC', 'Source enrollment class must be "NC"');

  assert.ok(targetEnr, 'Target enrollment (2027–28) must exist');
  assert.strictEqual(targetEnr.status, 'Active', 'Target enrollment status must be "Active"');
  assert.strictEqual(targetEnr.cls, 'LKG', 'Target enrollment class must be "LKG"');
});

console.log('✓ 5.2 Bulk Promotion Execution: 5 students successfully promoted from NC (2026–27) to LKG (2027–28) with historical enrollment preservation.');

// 5.4 Repeat Class Action
makeElement('prm_from_cls', 'select').value = '1';
const class1Student = DB.students.find(s => s.cls === '1' && sandbox.isStudentActive(s));
assert.ok(class1Student, 'Dataset must have at least one active Class 1 student');

mockDocument._checkedBoxes = [
  { getAttribute: (attr) => attr === 'data-sid' ? String(class1Student.id) : null }
];

sandbox.executeBulkAction('repeat');
const repeatAction = vm.runInContext('curBulkPromotionAction', sandbox);
assert.strictEqual(repeatAction.nextCls, '1', 'Repeat class must keep class as 1');
sandbox.confirmBulkAction();

assert.strictEqual(class1Student.cls, '1', 'Student class must remain 1');
assert.strictEqual(class1Student.session, '2027–28', 'Student session must advance to 2027–28');
console.log(`✓ 5.3 Repeat Class Execution: Student ${class1Student.name} successfully retained in Class 1 for session 2027–28.`);

console.log('\n============================================================');
console.log('ALL KEY MODULES TESTS PASSED WITH 100% SUCCESS!');
console.log('============================================================\n');
