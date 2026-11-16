/**
 * Automated Test Suite: Dashboard Current Month & Select Month & Year Modes
 * Tests multi-month financial calculations, KPI metrics, UI labels, and caching across all months.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

console.log('=== STARTING TEST SUITE: DASHBOARD MODES ACROSS MONTHS ===\n');

// 1. Load demo dataset sandbox
const dataCandidates = [
  path.resolve(__dirname, '../../DEMO_TEST_KIT/demo_school_data_large.json'),
  path.resolve(__dirname, '../DEMO_TEST_KIT/demo_school_data_large.json'),
  path.resolve(__dirname, 'benchmark_datasets/dataset_C_1476.json')
];
const dataPath = dataCandidates.find(p => fs.existsSync(p));
assert.ok(dataPath, 'Dataset must exist');
const testDB = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

// 2. Setup mock DOM
const elements = {};
function makeMockElement(id, tagName = 'div') {
  if (!elements[id]) {
    elements[id] = {
      id,
      tagName: tagName.toUpperCase(),
      style: {},
      innerHTML: '',
      textContent: '',
      value: '',
      title: '',
      options: [],
      classList: {
        add: () => {},
        remove: () => {},
        contains: () => false
      },
      appendChild: function(c) { this.options.push(c); },
      querySelectorAll: () => [],
      querySelector: () => null
    };
  }
  return elements[id];
}

const mockDoc = {
  getElementById: (id) => makeMockElement(id),
  querySelectorAll: () => [],
  querySelector: () => null,
  addEventListener: () => {},
  removeEventListener: () => {},
  body: makeMockElement('body'),
  createElement: (tag) => makeMockElement('anon_' + Math.random(), tag)
};

// 3. Load app.js into VM sandbox
const appJsPath = path.resolve(__dirname, '../src/app.js');
const rawAppJs = fs.readFileSync(appJsPath, 'utf8').replace(/\binit\(\);?\s*$/, '// init();');

const sandbox = {
  document: mockDoc,
  window: {
    addEventListener: () => {},
    removeEventListener: () => {},
    electronAPI: null
  },
  navigator: { userAgent: 'node' },
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  isEl: false,
  CLASSES: ['NC', 'LKG', 'UKG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
  SYS_MONTHS: ['January','February','March','April','May','June','July','August','September','October','November','December'],
  MONTHS_LIST: ['April','May','June','July','August','September','October','November','December','January','February','March'],
  toast: () => {},
  logActivity: () => {},
  saveDB: () => {},
  closeM: () => {},
  openM: () => {},
  clL: (c) => `Class ${c}`
};

vm.createContext(sandbox);
vm.runInContext(rawAppJs, sandbox);
sandbox._testData = JSON.parse(JSON.stringify(testDB));
vm.runInContext('DB = _testData; invalidatePerformanceIndices();', sandbox);

console.log('--- TEST 1: Helper Availability & Active Student Consistency ---');
assert.strictEqual(typeof sandbox.getDashboardFinancialMetrics, 'function', 'getDashboardFinancialMetrics must be defined');
assert.strictEqual(typeof sandbox.renderDB, 'function', 'renderDB must be defined');

const activeCount = sandbox.getActiveStudents('2026–27').length;
console.log(`Active students in 2026–27: ${activeCount}`);
assert.ok(activeCount > 0, 'Active students must be > 0');
console.log('✓ PASS: Core helper functions and active students verified.\n');

console.log('--- TEST 2: Current Month Mode Execution ---');
const currentMonthMetrics = sandbox.getDashboardFinancialMetrics('current_month', null, null, '2026–27');
console.log('Current Month Metrics:', currentMonthMetrics);

assert.strictEqual(currentMonthMetrics.periodMode, 'current_month');
assert.ok(currentMonthMetrics.collectedAmt >= 0, 'Collected must be non-negative');
assert.ok(currentMonthMetrics.pendingAmt >= 0, 'Pending must be non-negative');
assert.strictEqual(
  currentMonthMetrics.totalExpected,
  currentMonthMetrics.collectedAmt + currentMonthMetrics.pendingAmt,
  'Total Expected must equal Collected + Pending'
);
if (currentMonthMetrics.totalExpected > 0) {
  const expectedRate = Math.min(100, Math.round((currentMonthMetrics.collectedAmt / currentMonthMetrics.totalExpected) * 100));
  assert.strictEqual(currentMonthMetrics.collectionRate, expectedRate, 'Collection rate must be mathematically exact');
}
assert.ok(currentMonthMetrics.badgeText.includes('Current Month'), 'Badge text must reflect Current Month');
console.log(`✓ PASS: Current Month metrics mathematically valid (Collected: ₹${currentMonthMetrics.collectedAmt.toLocaleString('en-IN')}, Pending: ₹${currentMonthMetrics.pendingAmt.toLocaleString('en-IN')}, Rate: ${currentMonthMetrics.collectionRate}%)\n`);

console.log('--- TEST 3: Select Month & Year Mode Across All Academic Months ---');
const testMonths = [
  { month: 'April', year: 2026 },
  { month: 'May', year: 2026 },
  { month: 'June', year: 2026 },
  { month: 'July', year: 2026 },
  { month: 'August', year: 2026 },
  { month: 'September', year: 2026 },
  { month: 'October', year: 2026 },
  { month: 'November', year: 2026 },
  { month: 'December', year: 2026 },
  { month: 'January', year: 2027 },
  { month: 'February', year: 2027 },
  { month: 'March', year: 2027 }
];

testMonths.forEach(({ month, year }) => {
  const m = sandbox.getDashboardFinancialMetrics('select_month', month, year, '2026–27');
  
  // Verify structure & mathematical coherence
  assert.strictEqual(m.periodMode, 'select_month', `${month} ${year}: mode must be select_month`);
  assert.strictEqual(m.label, `${month} ${year}`, `${month} ${year}: label must match month and year`);
  assert.ok(m.badgeText.includes(`Selected Month: ${month} ${year}`), `${month} ${year}: badgeText must include Selected Month: ${month} ${year}`);
  assert.ok(m.collectedAmt >= 0, `${month} ${year}: collectedAmt must be >= 0 (got ${m.collectedAmt})`);
  assert.ok(m.pendingAmt >= 0, `${month} ${year}: pendingAmt must be >= 0 (got ${m.pendingAmt})`);
  assert.strictEqual(m.totalExpected, m.collectedAmt + m.pendingAmt, `${month} ${year}: totalExpected must equal collectedAmt + pendingAmt`);
  assert.ok(m.collectionRate >= 0 && m.collectionRate <= 100, `${month} ${year}: collectionRate must be in [0, 100] (got ${m.collectionRate})`);
  
  console.log(`  ✓ [PASS] ${month} ${year.toString().padEnd(4)}: Collected: ₹${m.collectedAmt.toLocaleString('en-IN').padStart(10)} | Pending: ₹${m.pendingAmt.toLocaleString('en-IN').padStart(10)} | Rate: ${m.collectionRate.toString().padStart(3)}%`);
});
console.log('✓ PASS: All 12 academic months computed with complete mathematical coherence.\n');

console.log('--- TEST 4: Full Session Mode Verification ---');
const fullSessMetrics = sandbox.getDashboardFinancialMetrics('full_session', null, null, '2026–27');
console.log('Full Session Metrics:', fullSessMetrics);
assert.strictEqual(fullSessMetrics.periodMode, 'full_session');
assert.strictEqual(fullSessMetrics.label, 'Full Session');
assert.ok(fullSessMetrics.badgeText.includes('Full Academic Session (2026–27)'));
assert.strictEqual(fullSessMetrics.totalExpected, fullSessMetrics.collectedAmt + fullSessMetrics.pendingAmt);
console.log(`✓ PASS: Full Session verified (Collected: ₹${fullSessMetrics.collectedAmt.toLocaleString('en-IN')}, Pending: ₹${fullSessMetrics.pendingAmt.toLocaleString('en-IN')})\n`);

console.log('--- TEST 5: UI DOM Elements Synchronization in renderDB() ---');
// Configure select_month October 2026 in DOM
makeMockElement('db_period_mode', 'select').value = 'select_month';
makeMockElement('db_mo', 'select').value = 'October';
makeMockElement('db_yr', 'input').value = '2026';

sandbox.renderDB();

const octMetrics = sandbox.getDashboardFinancialMetrics('select_month', 'October', 2026, '2026–27');
assert.strictEqual(elements['dc'].textContent, '₹' + octMetrics.collectedAmt.toLocaleString('en-IN'), '#dc textContent must match collectedAmt');
assert.strictEqual(elements['dd'].textContent, '₹' + octMetrics.pendingAmt.toLocaleString('en-IN'), '#dd textContent must match pendingAmt');
assert.strictEqual(elements['db-inc'].textContent, '₹' + octMetrics.collectedAmt.toLocaleString('en-IN'), '#db-inc textContent must match collectedAmt');
assert.strictEqual(elements['db-out'].textContent, '₹' + octMetrics.pendingAmt.toLocaleString('en-IN'), '#db-out textContent must match pendingAmt');
assert.strictEqual(elements['db-exp'].textContent, '₹' + octMetrics.totalExpected.toLocaleString('en-IN'), '#db-exp textContent must match totalExpected');
assert.strictEqual(elements['db-rate'].textContent, octMetrics.collectionRate + '%', '#db-rate textContent must match collectionRate%');
assert.strictEqual(elements['dc_lbl'].textContent, '(October 2026)', '#dc_lbl must show (October 2026)');
assert.strictEqual(elements['db_period_badge'].textContent, '📅 Selected Month: October 2026', '#db_period_badge must show selected month badge');

// Verify student counts remain accurate
assert.strictEqual(parseInt(elements['dt'].textContent), activeCount, '#dt must match activeCount');
console.log('✓ PASS: renderDB() perfectly updates all DOM elements for Select Month (October 2026).\n');

// Now switch to September 2026
elements['db_mo'].value = 'September';
sandbox.renderDB();
const sepMetrics = sandbox.getDashboardFinancialMetrics('select_month', 'September', 2026, '2026–27');
assert.strictEqual(elements['dc'].textContent, '₹' + sepMetrics.collectedAmt.toLocaleString('en-IN'), '#dc textContent must match sep collectedAmt');
assert.strictEqual(elements['dd'].textContent, '₹' + sepMetrics.pendingAmt.toLocaleString('en-IN'), '#dd textContent must match sep pendingAmt');
assert.strictEqual(elements['dc_lbl'].textContent, '(September 2026)', '#dc_lbl must show (September 2026)');
assert.strictEqual(elements['db_period_badge'].textContent, '📅 Selected Month: September 2026');
console.log('✓ PASS: renderDB() dynamically switches to September 2026 seamlessly.\n');

// Switch back to current_month
elements['db_period_mode'].value = 'current_month';
sandbox.renderDB();
assert.strictEqual(elements['dc'].textContent, '₹' + currentMonthMetrics.collectedAmt.toLocaleString('en-IN'));
assert.strictEqual(elements['dd'].textContent, '₹' + currentMonthMetrics.pendingAmt.toLocaleString('en-IN'));
console.log('✓ PASS: renderDB() seamlessly switches back to Current Month mode.\n');

console.log('--- TEST 6: Caching & Invalidation Integrity ---');
const t0 = Date.now();
const res1 = sandbox.getDashboardFinancialMetrics('select_month', 'November', 2026, '2026–27');
const time1 = Date.now() - t0;

const t1 = Date.now();
const res2 = sandbox.getDashboardFinancialMetrics('select_month', 'November', 2026, '2026–27');
const time2 = Date.now() - t1;

assert.strictEqual(res1, res2, 'Second call must return cached reference');
console.log(`✓ PASS: Cache hit confirmed (Call 1: ${time1}ms, Call 2 [cached]: ${time2}ms).`);

sandbox.invalidatePerformanceIndices();
const res3 = sandbox.getDashboardFinancialMetrics('select_month', 'November', 2026, '2026–27');
assert.deepStrictEqual(res1, res3, 'Data values must remain identical after invalidation and recomputation');
console.log('✓ PASS: Cache invalidation successfully forces recomputation without data corruption.\n');

console.log('============================================================');
console.log('ALL DASHBOARD MULTI-MONTH TESTS PASSED WITH 100% SUCCESS!');
console.log('============================================================\n');
