const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('============================================================');
console.log('VERIFYING DASHBOARD FEE COLLECTED OPTIMIZATION & FILTERS');
console.log('============================================================\n');

// 1. Load large demo dataset
const dataCandidates = [
  path.resolve(__dirname, '../../DEMO_TEST_KIT/demo_school_data_large.json'),
  path.resolve(__dirname, '../DEMO_TEST_KIT/demo_school_data_large.json'),
  path.resolve(__dirname, 'benchmark_datasets/dataset_C_1476.json')
];
const dataPath = dataCandidates.find(p => fs.existsSync(p));
assert.ok(dataPath, 'demo_school_data_large.json must exist');
const DB = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

console.log(`[PASS] Loaded demo dataset: ${DB.students.length} students, ${DB.payments.length} payments, ${Object.keys(DB.fees || {}).length} fee keys.\n`);

const dbJsonStr = JSON.stringify(DB);
global.localStorage = {
  getItem: function(k) { if (k === 'mdc') return dbJsonStr; return null; },
  setItem: function(k, v) {}
};
global.window = {
  electronAPI: null,
  addEventListener: function() {},
  localStorage: global.localStorage
};
global.DB = DB;
global.CLASSES = ['NC', 'LKG', 'UKG', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th', '12th'];
global.MONTHS_LIST = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March'];
global.SYS_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
global.isEl = false;
global.clL = function(c) { return c + ' Class'; };
global.escapeHtml = function(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
};
global.parseSessionYears = function(s) {
  const parts = String(s || '').split(/[-–]/);
  const start = parseInt(parts[0]) || 2026;
  let end = parseInt(parts[1]) || 27;
  if (end < 100) end = Math.floor(start / 100) * 100 + end;
  return [start, end];
};

let toastedMsg = null;
global.toast = function(msg) { toastedMsg = msg; };
let exportedCsvName = null, exportedCsvContent = null;
global.expCSV = function(fn, content) { exportedCsvName = fn; exportedCsvContent = content; };
let openModalId = null;
global.openM = function(id) { openModalId = id; };
global.closeM = function(id) { if (openModalId === id) openModalId = null; };

// Setup DOM mocks
const elements = {};
function createMockElement(id, tagName = 'div') {
  const el = {
    id: id,
    tagName: tagName.toUpperCase(),
    value: '',
    innerHTML: '',
    textContent: '',
    style: { display: '' },
    options: [],
    scrollTop: 0
  };
  elements[id] = el;
  return el;
}

global.document = {
  getElementById: function(id) {
    if (!elements[id]) {
      elements[id] = createMockElement(id);
    }
    return elements[id];
  },
  addEventListener: function() {},
  querySelector: function() { return null; },
  querySelectorAll: function() { return []; }
};

// Initialize elements
createMockElement('col_f_cls', 'select');
createMockElement('col_f_sess', 'select');
createMockElement('col_f_mode', 'select');
createMockElement('col_f_date_preset', 'select');
createMockElement('col_f_date_from', 'input');
createMockElement('col_f_date_to', 'input');
createMockElement('col_f_mo', 'select');
createMockElement('col_custom_date_row', 'div');
createMockElement('collectedBody', 'div');
createMockElement('collectedTableContainer', 'div');

// Load app.js functions in isolated context
const appCandidates = [
  path.resolve(__dirname, '../src/app.js'),
  path.resolve(__dirname, '../src/app.js'),
  path.resolve(__dirname, 'src/app.js')
];
const appJsPath = appCandidates.find(p => fs.existsSync(p));
assert.ok(appJsPath, 'app.js must exist');
const appCode = fs.readFileSync(appJsPath, 'utf8').replace(/\binit\(\);?\s*$/, '// init();');

// Evaluate app.js
const vm = require('vm');
const context = vm.createContext(global);
vm.runInContext(appCode, context);
context._testDb = DB;
vm.runInContext('DB = _testDb; invalidatePerformanceIndices();', context);

console.log('--- TEST 1: Performance Benchmark & Cache Functionality ---');
// Step 1: Cold start performance
const t0 = Date.now();
const tx1 = context.getValidPaymentTransactions();
const coldTime = Date.now() - t0;
console.log(`[BENCHMARK] Cold getValidPaymentTransactions() took: ${coldTime} ms (Target: < 100ms)`);
assert.ok(coldTime < 100, `Cold execution should be under 100ms, got ${coldTime}ms`);
assert.ok(tx1.length > 5000, `Expected >5000 transactions, got ${tx1.length}`);

// Step 2: Cache hit performance
const t1 = Date.now();
const tx2 = context.getValidPaymentTransactions();
const cachedTime = Date.now() - t1;
console.log(`[BENCHMARK] Cached getValidPaymentTransactions() took: ${cachedTime} ms (Target: < 5ms)`);
assert.ok(cachedTime < 5, `Cached execution should be under 5ms, got ${cachedTime}ms`);
assert.strictEqual(tx1, tx2, 'Cached transaction reference must match exactly');

// Step 3: Invalidation test
context.invalidatePerformanceIndices();
assert.strictEqual(context.window._cachedValidTransactions, null, 'Cache must be null after invalidation');
const tx3 = context.getValidPaymentTransactions();
assert.ok(tx3.length > 5000, 'Recomputed transactions after invalidation must be valid');
console.log('[PASS] Test 1: Performance benchmark & caching verified successfully.\n');

console.log('--- TEST 2: Filter Controls Initialization & Reset ---');
context.initCollectedFilters();
assert.ok(elements['col_f_cls'].innerHTML.includes('All Classes'), 'Class filter must have All Classes option');
assert.ok(elements['col_f_sess'].innerHTML.includes('Current Session'), 'Session filter must have Current Session option');
assert.strictEqual(elements['col_f_sess'].value, 'current', 'Default session should be current');

// Test Reset
elements['col_f_cls'].value = 'NC';
elements['col_f_mode'].value = 'Cash';
elements['col_f_mo'].value = 'April';
context.resetCollectedFilters();
assert.strictEqual(elements['col_f_cls'].value, '', 'Reset must clear class filter');
assert.strictEqual(elements['col_f_sess'].value, 'current', 'Reset must restore session filter to current');
assert.strictEqual(elements['col_f_mode'].value, '', 'Reset must clear mode filter');
assert.strictEqual(elements['col_f_mo'].value, '', 'Reset must clear month filter');
assert.strictEqual(elements['col_f_date_preset'].value, 'all', 'Reset must restore date preset to all');
assert.strictEqual(elements['col_custom_date_row'].style.display, 'none', 'Reset must hide custom date row');
console.log('[PASS] Test 2: Filter controls initialization and reset verified.\n');

console.log('--- TEST 3: Interactive Report Filters (Independent & Combined) ---');
// 3A. Class Filter
elements['col_f_cls'].value = 'NC';
context.applyCollectedFilters();
const ncRows = context.window._cachedFilteredTransactions;
assert.ok(ncRows.length > 0, 'Class NC should have transactions');
ncRows.forEach(r => assert.strictEqual(r.cls, 'NC', 'Every row must match class NC'));
console.log(`[PASS] Class Filter (NC): matched ${ncRows.length} transactions.`);

// 3B. Payment Mode Filter
context.resetCollectedFilters();
elements['col_f_mode'].value = 'Cheque';
context.applyCollectedFilters();
const chequeRows = context.window._cachedFilteredTransactions;
assert.ok(chequeRows.length > 0, 'Cheque mode should have transactions');
chequeRows.forEach(r => assert.strictEqual(r.mode, 'Cheque', 'Every row must match Cheque mode'));
console.log(`[PASS] Mode Filter (Cheque): matched ${chequeRows.length} transactions.`);

// 3C. Payment Mode Filter (Online / UPI)
context.resetCollectedFilters();
elements['col_f_mode'].value = 'Online / UPI';
context.applyCollectedFilters();
const upiRows = context.window._cachedFilteredTransactions;
assert.ok(upiRows.length > 0, 'Online / UPI mode should have transactions');
upiRows.forEach(r => {
  const m = r.mode || '';
  assert.ok(m.includes('Online') || m.includes('UPI'), `Mode ${m} must match Online / UPI`);
});
console.log(`[PASS] Mode Filter (Online / UPI): matched ${upiRows.length} transactions.`);

// 3D. Billing Month Filter
context.resetCollectedFilters();
elements['col_f_mo'].value = 'August';
context.applyCollectedFilters();
const augRows = context.window._cachedFilteredTransactions;
assert.ok(augRows.length > 0, 'August billing month should have transactions');
augRows.forEach(r => {
  assert.ok(r._monthSet && r._monthSet.has('August'), 'Transaction must contain August allocation');
});
console.log(`[PASS] Month Filter (August): matched ${augRows.length} transactions.`);

// 3E. Custom Date Range Filter
context.resetCollectedFilters();
elements['col_f_date_preset'].value = 'custom';
elements['col_f_date_from'].value = '2026-05-01';
elements['col_f_date_to'].value = '2026-05-31';
context.applyCollectedFilters();
const mayDateRows = context.window._cachedFilteredTransactions;
assert.ok(mayDateRows.length > 0, 'May 2026 date range should have transactions');
mayDateRows.forEach(r => {
  assert.ok(r.date >= '2026-05-01' && r.date <= '2026-05-31', `Date ${r.date} must be within May 2026 range`);
});
console.log(`[PASS] Date Range Filter (May 2026): matched ${mayDateRows.length} transactions.`);

// 3F. Combined Multi-Filter: Class (NC) + Mode (Cheque) + Month (August)
context.resetCollectedFilters();
elements['col_f_cls'].value = 'NC';
elements['col_f_mode'].value = 'Cheque';
elements['col_f_mo'].value = 'August';
context.applyCollectedFilters();
const combinedRows = context.window._cachedFilteredTransactions;
assert.ok(combinedRows.length > 0, 'Combined filter should return matching rows');
combinedRows.forEach(r => {
  assert.strictEqual(r.cls, 'NC');
  assert.strictEqual(r.mode, 'Cheque');
  assert.ok(r._monthSet.has('August'));
});
console.log(`[PASS] Combined Multi-Filter (NC + Cheque + August): matched ${combinedRows.length} transactions.\n`);

console.log('--- TEST 4: Pagination & Rendering Verification ---');
context.resetCollectedFilters();
context.changeCollectedPageSize('25');
assert.ok(elements['collectedBody'].innerHTML.includes('Showing <strong>1</strong>–<strong>25</strong> of'), 'Body should show page 1 slice');

context.goToCollectedPage(2);
assert.ok(elements['collectedBody'].innerHTML.includes('Showing <strong>26</strong>–<strong>50</strong> of'), 'Body should show page 2 slice');
assert.ok(elements['collectedBody'].innerHTML.includes('Page 2 of'), 'Pagination footer should show Page 2');
console.log('[PASS] Test 4: Pagination state, slicing and navigation verified.\n');

console.log('--- TEST 5: View Breakdown Toggle ---');
const testRowKey = 'test_row_1';
createMockElement(`row_bkd_${testRowKey}`, 'tr');
createMockElement(`btn_bkd_${testRowKey}`, 'button');
elements[`row_bkd_${testRowKey}`].style.display = 'none';

context.togglePaymentBreakdown(testRowKey);
assert.strictEqual(elements[`row_bkd_${testRowKey}`].style.display, 'table-row', 'Breakdown row should be displayed');
assert.ok(elements[`btn_bkd_${testRowKey}`].innerHTML.includes('Hide Breakdown'), 'Button should switch to Hide Breakdown');

context.togglePaymentBreakdown(testRowKey);
assert.strictEqual(elements[`row_bkd_${testRowKey}`].style.display, 'none', 'Breakdown row should be hidden');
assert.ok(elements[`btn_bkd_${testRowKey}`].innerHTML.includes('View Breakdown'), 'Button should switch to View Breakdown');
console.log('[PASS] Test 5: Breakdown toggle verified.\n');

console.log('--- TEST 6: CSV Export & Print Layout ---');
// CSV Export
context.expCSV = function(fn, content) { exportedCsvName = fn; exportedCsvContent = content; };
context.resetCollectedFilters();
elements['col_f_cls'].value = 'NC';
context.applyCollectedFilters();
context.exportCollectedCSV();
assert.strictEqual(exportedCsvName, 'fee_collection_report.csv', 'CSV file name must match fee_collection_report.csv');
assert.ok(exportedCsvContent.startsWith('Receipt No,Admission No,Student Name,Class,Section,Billing Period,Payment Date,Payment Mode,Amount Received'), 'CSV must have correct header');
const csvLineCount = exportedCsvContent.trim().split('\n').length - 1;
assert.strictEqual(csvLineCount, context.window._cachedFilteredTransactions.length, 'CSV row count must match filtered transactions count exactly');
console.log(`[PASS] CSV Export: correctly exported ${csvLineCount} rows for Class NC.`);

// Print Layout
let printedHtml = null;
context.window.open = function() {
  return {
    document: {
      write: function(h) { printedHtml = h; },
      close: function() {}
    }
  };
};
context.printCollected();
assert.ok(printedHtml !== null, 'Print HTML must be generated');
assert.ok(printedHtml.includes('Fee Collection Ledger Report'), 'Print header must be present');
assert.ok(printedHtml.includes('Class: Nursery') || printedHtml.includes('Class: NC'), 'Print subtitle must reflect active Class filter');
console.log('[PASS] Test 6: CSV export and Print layout verified.\n');

console.log('--- TEST 7: Production DB Safety Verification ---');
const prodPath = 'C:/Users/HP/OneDrive/Documents/MDConvent_SMS/school_data.json';
if (fs.existsSync(prodPath)) {
  const stat = fs.statSync(prodPath);
  console.log(`[SAFETY CHECK] Production database size: ${stat.size} bytes. Timestamp: ${stat.mtime}`);
  assert.ok(stat.size > 7000000, 'Production DB must remain intact and undisturbed');
}
console.log('[PASS] Test 7: Production database safety verified.\n');

console.log('============================================================');
console.log('ALL VERIFICATION TESTS PASSED SUCCESSFULLY! (100% GREEN)');
console.log('============================================================');
