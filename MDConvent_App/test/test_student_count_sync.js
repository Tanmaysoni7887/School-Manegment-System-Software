// ============================================================
// Automated Test: Dashboard vs Sessions & Promotion Student Count Sync
// ============================================================

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

console.log('=== VERIFYING STUDENT COUNT SYNCHRONIZATION: DASHBOARD VS SESSIONS & PROMOTION ===\n');

// 1. Setup DOM mock
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
      querySelector: () => null,
      addEventListener: () => {},
      removeEventListener: () => {}
    };
  }
  return domElements[id];
}

const mockDocument = {
  getElementById: (id) => makeElement(id),
  querySelectorAll: () => [],
  querySelector: () => null,
  addEventListener: () => {},
  removeEventListener: () => {},
  body: makeElement('body'),
  createElement: (tag) => makeElement('anon_' + Math.random(), tag)
};

const mockWindow = {
  addEventListener: () => {},
  removeEventListener: () => {},
  electronAPI: null
};

// 2. Load DB from production (read-only copy)
const dbPath = 'C:\\Users\\HP\\OneDrive\\Documents\\MDConvent_SMS\\school_data.json';
assert(fs.existsSync(dbPath), 'Production database must exist');
const prodData = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

// 3. Load app.js in sandbox
const rawAppJs = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8');
const appJs = rawAppJs.replace(/\binit\(\);?\s*$/, '// init();');

const sandbox = {
  document: mockDocument,
  window: mockWindow,
  navigator: { userAgent: 'node' },
  console: console,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  setInterval: setInterval,
  clearInterval: clearInterval,
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
vm.runInContext(appJs, sandbox);

// Inject production data directly into script-level DB and invalidate caches
sandbox._testProdData = JSON.parse(JSON.stringify(prodData));
vm.runInContext('DB = _testProdData; invalidatePerformanceIndices();', sandbox);

console.log('--- Step 1: Core Helper Functions Verification ---');
assert.strictEqual(typeof sandbox.isStudentActive, 'function', 'isStudentActive should be defined');
assert.strictEqual(typeof sandbox.isStudentInSession, 'function', 'isStudentInSession should be defined');
assert.strictEqual(typeof sandbox.getActiveStudents, 'function', 'getActiveStudents should be defined');
assert.strictEqual(typeof sandbox.getActiveStudentCount, 'function', 'getActiveStudentCount should be defined');
console.log('✓ PASS: isStudentActive, isStudentInSession, getActiveStudents, getActiveStudentCount functions are present');

console.log('\n--- Step 2: Production DB Status & Eligibility Verification ---');
const totalDbStudents = vm.runInContext('DB.students.length', sandbox);
assert.strictEqual(totalDbStudents, 1476, 'Production DB must have 1,476 total student records');

const allDbStudents = vm.runInContext('DB.students', sandbox);
const activeInDb = allDbStudents.filter(s => sandbox.isStudentActive(s));
const leftInDb = allDbStudents.filter(s => s.status === 'Left School');
const inactInDb = allDbStudents.filter(s => s.status === 'Inactive');

assert.strictEqual(activeInDb.length, 1359, 'Active students in DB must be exactly 1,359');
assert.strictEqual(leftInDb.length, 51, 'Left School students in DB must be exactly 51');
assert.strictEqual(inactInDb.length, 66, 'Inactive students in DB must be exactly 66');
assert.strictEqual(activeInDb.length + leftInDb.length + inactInDb.length, 1476, '1359 Active + 51 Left + 66 Inactive = 1,476 total');
console.log(`✓ PASS: Production DB records breakdown:`);
console.log(`  - Total students in DB: ${totalDbStudents}`);
console.log(`  - Active eligible students: ${activeInDb.length}`);
console.log(`  - Left School students: ${leftInDb.length}`);
console.log(`  - Inactive students: ${inactInDb.length}`);

console.log('\n--- Step 3: Dashboard Student Count Verification ---');
sandbox.renderDB();
const dbTotal = parseInt(sandbox.document.getElementById('dt').textContent);
const dbBoys = parseInt(sandbox.document.getElementById('db').textContent);
const dbGirls = parseInt(sandbox.document.getElementById('dg').textContent);

assert.strictEqual(dbTotal, 1359, 'Dashboard Total Students (#dt) must equal 1,359');
assert.strictEqual(dbBoys, 704, 'Dashboard Boys (#db) must equal 704');
assert.strictEqual(dbGirls, 655, 'Dashboard Girls (#dg) must equal 655');
assert.strictEqual(dbBoys + dbGirls, 1359, 'Boys (704) + Girls (655) must equal Total (1359)');
console.log(`✓ PASS: Dashboard displays Total Students = ${dbTotal} (Boys: ${dbBoys}, Girls: ${dbGirls})`);

console.log('\n--- Step 4: Sessions & Promotion Page Student Count Verification ---');
sandbox.renderSessions();
const sessTbHtml = sandbox.document.getElementById('sessTb').innerHTML;
assert.ok(sessTbHtml.includes('2026–27'), 'Sessions table must contain 2026–27');
assert.ok(sessTbHtml.includes('1359 Students'), 'Sessions table must contain "1359 Students"');
assert.ok(!sessTbHtml.includes('1476 Students'), 'Sessions table must NOT contain "1476 Students"');

const sessMatch = sessTbHtml.match(/<td>(\d+)\s+Students<\/td>/);
assert.ok(sessMatch, 'Could not parse student count from sessTb');
const sessCount = parseInt(sessMatch[1]);
assert.strictEqual(sessCount, 1359, 'Sessions table student count must equal 1359');
console.log(`✓ PASS: Sessions & Promotion table displays ${sessCount} Students`);

console.log('\n--- Step 5: Dashboard vs Sessions & Promotion Count Parity ---');
assert.strictEqual(dbTotal, sessCount, `Dashboard (${dbTotal}) and Sessions page (${sessCount}) must match!`);
console.log(`✓ PASS: PERFECT MATCH! Dashboard = ${dbTotal} === Sessions & Promotion = ${sessCount}`);

console.log('\n--- Step 6: Inactive / Left Status Robustness Check ---');
const statuses = [
  { status: 'Active', expected: true },
  { status: 'Inactive', expected: false },
  { status: 'Left School', expected: false },
  { status: 'School Left', expected: false },
  { status: 'Alumni', expected: false },
  { status: 'Deleted', expected: false },
  { status: 'Archived', expected: false },
  { status: 'Transferred', expected: false },
  { status: 'Void', expected: false },
  { status: 'Promoted', expected: false }
];

statuses.forEach(({ status, expected }) => {
  const dummy = { id: 888, name: 'Test', status, session: '2026–27' };
  assert.strictEqual(sandbox.isStudentActive(dummy), expected, `Status "${status}" should be ${expected}`);
});
console.log('✓ PASS: All 10 status scenarios accurately handled by isStudentActive()');

console.log('\n--- Step 7: Session Filtering & Dynamic Synchronization ---');
// Add an active student to session 2027–28
vm.runInContext(`
  DB.students.push({
    id: 9999,
    name: 'Future Student',
    status: 'Active',
    session: '2027–28',
    gender: 'Female',
    cls: '1'
  });
  invalidatePerformanceIndices();
`, sandbox);

// Check 2026–27 remains 1,359
assert.strictEqual(sandbox.getActiveStudentCount('2026–27'), 1359, 'Session 2026–27 active count must remain 1,359');
assert.strictEqual(sandbox.getActiveStudentCount('2027–28'), 1, 'Session 2027–28 active count must be 1');

// Re-render Dashboard (active session 2026–27)
sandbox.renderDB();
assert.strictEqual(parseInt(sandbox.document.getElementById('dt').textContent), 1359, 'Dashboard must still show 1,359 for session 2026–27');

// Add an active student to session 2026–27
vm.runInContext(`
  DB.students.push({
    id: 10000,
    name: 'New Current Student',
    status: 'Active',
    session: '2026–27',
    gender: 'Male',
    cls: '2'
  });
  invalidatePerformanceIndices();
`, sandbox);

assert.strictEqual(sandbox.getActiveStudentCount('2026–27'), 1360, 'Session 2026–27 active count must become 1,360');
sandbox.renderDB();
assert.strictEqual(parseInt(sandbox.document.getElementById('dt').textContent), 1360, 'Dashboard Total Students must now equal 1,360');

sandbox.renderSessions();
const updatedSessMatch = sandbox.document.getElementById('sessTb').innerHTML.match(/<td>(\d+)\s+Students<\/td>/);
assert.strictEqual(parseInt(updatedSessMatch[1]), 1360, 'Sessions page must now also equal 1,360');
console.log('✓ PASS: Dynamic synchronization confirmed: adding active student increases both Dashboard and Sessions page count to 1,360 in lockstep');

console.log('\n======================================================');
console.log('ALL 7 STUDENT COUNT TESTS PASSED WITHOUT ANY ERRORS! (7/7)');
console.log('======================================================\n');
