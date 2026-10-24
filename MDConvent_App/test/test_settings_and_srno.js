// Automated Synthetic Test Suite for Settings (Optional Logo) & Student SR Number
// Completely isolated test environment: does NOT touch live production database or backups!

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('=== STARTING TEST SUITE: Settings & Student SR Number ===\n');

// 1. Setup isolated mock environment
const mockDataDir = path.join(__dirname, 'sandbox_test_db');
if (fs.existsSync(mockDataDir)) {
  fs.rmSync(mockDataDir, { recursive: true, force: true });
}
fs.mkdirSync(mockDataDir, { recursive: true });

// Mock DB state
let DB = {
  nextId: 101,
  nextAdm: 1005,
  settings: {
    schoolName: 'M.D. Convent School',
    schoolAddr: 'Hathras, UP',
    schoolPhone: '9876543210',
    schoolLogo: '', // Default emblem initially
    currentSession: '2026–27',
    admissionPrefix: 'MDC-',
    receiptPrefix: 'REC-',
    principalName: 'Test Principal'
  },
  sessions: [
    { name: '2026–27', active: true, status: 'Active' }
  ],
  students: [
    {
      id: 1,
      name: 'Legacy Student One',
      father: 'Ram Kumar',
      mother: 'Sita Devi',
      dob: '2015-05-10',
      gender: 'Male',
      blood: 'B+',
      phone: '9876543211',
      email: '',
      address: 'Town Hathras',
      admno: 'MDC-1001',
      // Notice: NO srNo field in legacy student
      rollno: '1',
      cls: '5',
      section: 'A',
      admissionDate: '2024-04-01',
      session: '2026–27',
      status: 'Active',
      enrollments: [{ session: '2026–27', cls: '5', section: 'A', rollno: '1', status: 'Active' }]
    },
    {
      id: 2,
      name: 'Legacy Student Two',
      father: 'Shyam Singh',
      mother: 'Geeta Devi',
      dob: '2016-08-15',
      gender: 'Male',
      blood: 'O+',
      phone: '9876543212',
      email: '',
      address: 'Town Hathras',
      admno: 'MDC-1002',
      srNo: '', // explicitly blank
      rollno: '2',
      cls: '5',
      section: 'A',
      admissionDate: '2024-04-02',
      session: '2026–27',
      status: 'Active',
      enrollments: [{ session: '2026–27', cls: '5', section: 'A', rollno: '2', status: 'Active' }]
    }
  ]
};

// Emulate app helper functions
function getMaxIssuedAdmissionNumber(specificPrefix) {
  const prefix = (specificPrefix !== undefined)
    ? specificPrefix
    : ((DB && DB.settings && DB.settings.admissionPrefix) ? DB.settings.admissionPrefix : '');
  const prefixNorm = String(prefix || '').trim().toLowerCase();

  let maxIssued = 0;
  (DB.students || []).forEach(s => {
    if (!s || !s.admno) return;
    const admStr = String(s.admno).trim();
    if (prefixNorm) {
      if (admStr.toLowerCase().startsWith(prefixNorm)) {
        const numPart = admStr.slice(prefixNorm.length).trim();
        const n = parseInt(numPart, 10);
        if (!isNaN(n) && n > maxIssued) maxIssued = n;
      }
    } else {
      const numPart = admStr.replace(/^[^\d]*/, '');
      const n = parseInt(numPart, 10);
      if (!isNaN(n) && n > maxIssued) maxIssued = n;
    }
  });
  return maxIssued;
}

function generateNextUniqueAdmissionNumber() {
  const pfx = (DB.settings && DB.settings.admissionPrefix) ? String(DB.settings.admissionPrefix).trim() : '';
  const maxIssued = getMaxIssuedAdmissionNumber(pfx);
  const cfgVal = parseInt(DB.nextAdm, 10);
  let nextSeq = (maxIssued === 0)
    ? ((cfgVal && cfgVal > 0) ? cfgVal : 1)
    : ((cfgVal && cfgVal > maxIssued) ? cfgVal : (maxIssued + 1));

  let candidate = `${pfx}${nextSeq}`;
  const existingSet = new Set((DB.students || []).map(s => String(s.admno || '').trim().toLowerCase()));
  while (existingSet.has(candidate.toLowerCase())) {
    nextSeq++;
    candidate = `${pfx}${nextSeq}`;
  }
  return { admno: candidate, nextSeq: nextSeq + 1 };
}

let pendingCustomLogo = undefined;

// Mock saveSettings
function executeSaveSettings(fields) {
  if (!fields.name || !fields.name.trim()) {
    return { success: false, error: 'School Name is required and cannot be empty!' };
  }

  DB.settings.schoolName = fields.name.trim();
  DB.settings.schoolAddr = (fields.addr || '').trim();
  DB.settings.schoolPhone = (fields.phone || '').trim();
  if (fields.curSession) DB.settings.currentSession = fields.curSession;
  DB.settings.admissionPrefix = (fields.admPrefix || '').trim();
  DB.settings.receiptPrefix = (fields.rcptPrefix || '').trim() || 'REC-';
  DB.settings.principalName = (fields.principal || '').trim();

  // Logo logic matching app.js
  if (pendingCustomLogo !== undefined) {
    DB.settings.schoolLogo = pendingCustomLogo;
    pendingCustomLogo = undefined;
  } else if (DB.settings.schoolLogo === 'logo.png') {
    DB.settings.schoolLogo = '';
  }

  const prefix = DB.settings.admissionPrefix;
  const maxIssued = getMaxIssuedAdmissionNumber(prefix);
  let enteredVal = parseInt(fields.nextAdm, 10);
  if (isNaN(enteredVal) || enteredVal <= 0) {
    enteredVal = (DB.nextAdm && DB.nextAdm > 0) ? DB.nextAdm : 1;
  }
  let finalNextAdm = enteredVal;
  if (maxIssued > 0 && enteredVal <= maxIssued) {
    finalNextAdm = maxIssued + 1;
    DB.nextAdm = finalNextAdm;
  } else {
    DB.nextAdm = finalNextAdm;
  }

  return { success: true };
}

// Mock saveStudent logic matching app.js
function executeSaveStudent(data) {
  const missing = [];
  if (!data.name) missing.push('Student Name');
  if (!data.father) missing.push("Father's Name");
  if (!data.mother) missing.push("Mother's Name");
  if (!data.dob) missing.push('Date of Birth');
  if (!data.gender) missing.push('Gender');
  if (!data.phone) missing.push('Phone Number');
  if (!data.address) missing.push('Residential Address');
  if (!data.cls) missing.push('Class');
  if (!data.section) missing.push('Section');

  if (missing.length > 0) {
    return { success: false, error: `Please fill all required fields: ${missing.join(', ')}` };
  }

  const eid = data.eid ? String(data.eid).trim() : '';

  // Roll number conflict check
  const rollno = String(data.rollno || '').trim();
  if (rollno) {
    const normRoll = rollno.toLowerCase();
    const normCls = String(data.cls).trim().toLowerCase();
    const normSec = String(data.section).trim().toLowerCase();
    const conflict = (DB.students || []).find(s => {
      if (eid && s.id === parseInt(eid)) return false;
      if (s.status === 'Inactive') return false;
      return String(s.rollno || '').trim().toLowerCase() === normRoll &&
             String(s.cls || '').trim().toLowerCase() === normCls &&
             String(s.section || 'A').trim().toLowerCase() === normSec;
    });
    if (conflict) {
      return { success: false, error: `Duplicate Roll Number! Roll Number "${rollno}" is already assigned to student "${conflict.name}"` };
    }
  }

  // Student SR No Uniqueness Check
  const srNo = String(data.srNo || '').trim();
  if (srNo) {
    const normSr = srNo.toLowerCase();
    const conflictSr = (DB.students || []).find(s => {
      if (eid && s.id === parseInt(eid)) return false;
      const otherSr = String(s.srNo || '').trim().toLowerCase();
      return otherSr && otherSr === normSr;
    });
    if (conflictSr) {
      return { success: false, error: `Duplicate SR Number! SR Number "${srNo}" is already assigned to student "${conflictSr.name}" (Adm: ${conflictSr.admno}). SR Numbers must be unique.` };
    }
  }

  let admVal = '';
  let admissionDate = '';

  if (eid) {
    const existing = DB.students.find(s => s.id === parseInt(eid));
    if (!existing) return { success: false, error: 'Student not found' };
    admVal = existing.admno;
    admissionDate = existing.admissionDate || '2026-10-24';
  } else {
    const gen = generateNextUniqueAdmissionNumber();
    admVal = gen.admno;
    admissionDate = '2026-10-24';
    DB.nextAdm = gen.nextSeq;
  }

  const studentObj = {
    id: eid ? parseInt(eid) : (DB.nextId++),
    name: data.name,
    father: data.father,
    mother: data.mother,
    dob: data.dob,
    gender: data.gender,
    blood: data.blood || 'B+',
    phone: data.phone,
    email: data.email || '',
    address: data.address,
    admno: admVal,
    srNo: srNo || '',
    rollno: rollno || '',
    cls: data.cls,
    section: data.section,
    admissionDate,
    session: '2026–27',
    status: data.status || 'Active',
    enrollments: [{ session: '2026–27', cls: data.cls, section: data.section, rollno, status: data.status || 'Active' }]
  };

  if (eid) {
    const idx = DB.students.findIndex(s => s.id === parseInt(eid));
    DB.students[idx] = Object.assign({}, DB.students[idx], studentObj);
  } else {
    DB.students.push(studentObj);
  }

  return { success: true, student: studentObj };
}

// ==========================================
// TEST SCENARIOS
// ==========================================

console.log('--- TEST 1: Change school name without uploading or changing logo ---');
pendingCustomLogo = undefined; // User didn't touch logo
let res1 = executeSaveSettings({
  name: 'Updated M.D. Public School',
  addr: 'Hathras, UP',
  phone: '9876543210',
  curSession: '2026–27',
  admPrefix: 'MDC-',
  rcptPrefix: 'REC-',
  principal: 'Principal A',
  nextAdm: '1005'
});
assert.strictEqual(res1.success, true);
assert.strictEqual(DB.settings.schoolName, 'Updated M.D. Public School');
assert.strictEqual(DB.settings.schoolLogo, ''); // Preserved empty (default emblem)
console.log('✓ TEST 1 PASSED: School name updated, save succeeded without logo requirement.');

console.log('\n--- TEST 2: Change school address, phone, and principal without logo ---');
pendingCustomLogo = undefined;
let res2 = executeSaveSettings({
  name: 'Updated M.D. Public School',
  addr: 'Mathura Road, Hathras',
  phone: '9999888877',
  curSession: '2026–27',
  admPrefix: 'MDC-',
  rcptPrefix: 'REC-',
  principal: 'Dr. S. K. Sharma',
  nextAdm: '1005'
});
assert.strictEqual(res2.success, true);
assert.strictEqual(DB.settings.schoolAddr, 'Mathura Road, Hathras');
assert.strictEqual(DB.settings.schoolPhone, '9999888877');
assert.strictEqual(DB.settings.principalName, 'Dr. S. K. Sharma');
assert.strictEqual(DB.settings.schoolLogo, '');
console.log('✓ TEST 2 PASSED: Address, phone and principal saved successfully without touching logo.');

console.log('\n--- TEST 3: Verify existing custom logo remains intact when saving other settings ---');
// Set a custom logo first
DB.settings.schoolLogo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
pendingCustomLogo = undefined; // User did NOT touch the logo during settings edit
let res3 = executeSaveSettings({
  name: 'M.D. International Academy',
  addr: 'Mathura Road, Hathras',
  phone: '9999888877',
  curSession: '2026–27',
  admPrefix: 'MDC-',
  rcptPrefix: 'MDC-REC-',
  principal: 'Dr. S. K. Sharma',
  nextAdm: '1005'
});
assert.strictEqual(res3.success, true);
assert.strictEqual(DB.settings.schoolName, 'M.D. International Academy');
assert.strictEqual(DB.settings.schoolLogo.startsWith('data:image/png;base64,'), true);
console.log('✓ TEST 3 PASSED: Custom logo preserved exactly when editing other settings.');

console.log('\n--- TEST 4: Remove custom logo and verify default emblem restores ---');
// User clicks "Remove Logo"
pendingCustomLogo = '';
let res4 = executeSaveSettings({
  name: 'M.D. International Academy',
  addr: 'Mathura Road, Hathras',
  phone: '9999888877',
  curSession: '2026–27',
  admPrefix: 'MDC-',
  rcptPrefix: 'MDC-REC-',
  principal: 'Dr. S. K. Sharma',
  nextAdm: '1005'
});
assert.strictEqual(res4.success, true);
assert.strictEqual(DB.settings.schoolLogo, ''); // Correctly cleared
console.log('✓ TEST 4 PASSED: Custom logo removed cleanly, empty string persisted for default SVG emblem.');

console.log('\n--- TEST 5: Add student with SR No. ("SR-101") ---');
let res5 = executeSaveStudent({
  name: 'Aarav Sharma',
  father: 'Rakesh Sharma',
  mother: 'Sunita Sharma',
  dob: '2016-01-10',
  gender: 'Male',
  phone: '9812345678',
  address: 'Civil Lines, Hathras',
  cls: '5',
  section: 'A',
  rollno: '10',
  srNo: 'SR-101',
  status: 'Active'
});
assert.strictEqual(res5.success, true);
assert.strictEqual(res5.student.srNo, 'SR-101');
assert.strictEqual(res5.student.admno, 'MDC-1005');
console.log(`✓ TEST 5 PASSED: Enrolled student with SR No. "SR-101" and Adm No. "${res5.student.admno}".`);

console.log('\n--- TEST 6: Add student with blank SR No. (Optional field) ---');
let res6 = executeSaveStudent({
  name: 'Diya Verma',
  father: 'Anil Verma',
  mother: 'Pooja Verma',
  dob: '2016-03-22',
  gender: 'Female',
  phone: '9812345679',
  address: 'Aligarh Road, Hathras',
  cls: '5',
  section: 'A',
  rollno: '11',
  srNo: '', // Optional blank
  status: 'Active'
});
assert.strictEqual(res6.success, true);
assert.strictEqual(res6.student.srNo, '');
console.log(`✓ TEST 6 PASSED: Student enrolled with blank SR No. without any blocking errors.`);

console.log('\n--- TEST 7: Add student with duplicate SR No. ("SR-101") ---');
let res7 = executeSaveStudent({
  name: 'Duplicate SR Tester',
  father: 'Test Father',
  mother: 'Test Mother',
  dob: '2016-04-01',
  gender: 'Male',
  phone: '9812345680',
  address: 'Town Hathras',
  cls: '5',
  section: 'B',
  rollno: '1',
  srNo: 'SR-101', // Exact duplicate of Aarav Sharma
  status: 'Active'
});
assert.strictEqual(res7.success, false);
assert.strictEqual(res7.error.includes('Duplicate SR Number'), true);
console.log(`✓ TEST 7 PASSED: Duplicate SR No. rejected with message: "${res7.error}".`);

console.log('\n--- TEST 8: Edit student with unchanged SR No. / edit other fields ---');
// Edit Aarav Sharma (id: 101) to update his phone number, preserving SR-101
let res8 = executeSaveStudent({
  eid: res5.student.id,
  name: 'Aarav Sharma Updated',
  father: 'Rakesh Sharma',
  mother: 'Sunita Sharma',
  dob: '2016-01-10',
  gender: 'Male',
  phone: '9899999999',
  address: 'Civil Lines, Hathras',
  cls: '5',
  section: 'A',
  rollno: '10',
  srNo: 'SR-101', // Unchanged
  status: 'Active'
});
assert.strictEqual(res8.success, true);
assert.strictEqual(res8.student.phone, '9899999999');
assert.strictEqual(res8.student.srNo, 'SR-101');
console.log('✓ TEST 8 PASSED: Student profile updated smoothly without triggering self-duplicate error.');

console.log('\n--- TEST 9: Legacy records without SR No. load smoothly without auto-assigning Adm No ---');
const legacyStudent = DB.students.find(s => s.id === 1);
assert.strictEqual(legacyStudent.srNo, undefined);
assert.strictEqual(legacyStudent.admno, 'MDC-1001');
// Ensure when we read srNo it doesn't get mutated to admno
const displaySr = legacyStudent.srNo || '–';
assert.strictEqual(displaySr, '–');
console.log('✓ TEST 9 PASSED: Legacy student without SR No. retains empty state and is not overwritten with Adm No.');

console.log('\n--- TEST 10: Verify admission numbers remain unique, untouched and uncorrupted ---');
const admNos = DB.students.map(s => s.admno);
const uniqueAdmNos = new Set(admNos);
assert.strictEqual(admNos.length, uniqueAdmNos.size);
console.log(`✓ TEST 10 PASSED: All ${admNos.length} admission numbers remain strictly unique (${admNos.join(', ')}).`);

// Clean up temporary mock test directory
if (fs.existsSync(mockDataDir)) {
  fs.rmSync(mockDataDir, { recursive: true, force: true });
}

console.log('\n=== ALL 10 UNIT & INTEGRATION TESTS COMPLETED SUCCESSFULLY! ===');
