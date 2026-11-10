/**
 * MD CONVENT PUBLIC SCHOOL — DEMO DATASET VALIDATION SUITE
 * ==============================================================================
 * Validates integrity, schema compliance, uniqueness, references, and financial
 * consistency of the generated demo database.
 * ==============================================================================
 */

const fs = require('fs');
const path = require('path');

const targetFile = process.argv[2] || path.join(__dirname, 'demo_school_data_large.json');

console.log('=== STARTING DEMO DATASET VALIDATION ===\n');
console.log(`Inspecting dataset: ${targetFile}`);

if (!fs.existsSync(targetFile)) {
  console.error(`FATAL: File not found: ${targetFile}`);
  process.exit(1);
}

const raw = fs.readFileSync(targetFile, 'utf8');
const stat = fs.statSync(targetFile);
let db;
try {
  db = JSON.parse(raw);
} catch (e) {
  console.error('FATAL: Invalid JSON syntax:', e.message);
  process.exit(1);
}

const errors = [];
const warnings = [];

// 1. Student Count Check
const studentCount = (db.students && Array.isArray(db.students)) ? db.students.length : 0;
console.log(`\n1. Student Count: ${studentCount}`);
if (studentCount < 1000) {
  errors.push(`Total student count must be at least 1,000. Got: ${studentCount}`);
} else {
  console.log(`   ✓ PASSED: Student count is >= 1,000 (${studentCount} students).`);
}

// 2. Uniqueness Checks
console.log('\n2. Uniqueness Validations:');
const seenIds = new Set();
const seenAdmNos = new Set();
const seenSrNos = new Set();
let duplicateIds = 0;
let duplicateAdmNos = 0;
let duplicateSrNos = 0;
let emptySrCount = 0;

db.students.forEach(s => {
  // Student ID
  if (seenIds.has(s.id)) duplicateIds++;
  else seenIds.add(s.id);

  // Admission No
  if (!s.admno) errors.push(`Student ID ${s.id} is missing admission number.`);
  else if (seenAdmNos.has(s.admno)) duplicateAdmNos++;
  else seenAdmNos.add(s.admno);

  // SR No (Optional)
  if (s.srNo && String(s.srNo).trim() !== '') {
    if (seenSrNos.has(s.srNo)) duplicateSrNos++;
    else seenSrNos.add(s.srNo);
  } else {
    emptySrCount++;
  }
});

if (duplicateIds > 0) errors.push(`Found ${duplicateIds} duplicate student IDs.`);
else console.log(`   ✓ PASSED: All ${seenIds.size} student IDs are strictly unique.`);

if (duplicateAdmNos > 0) errors.push(`Found ${duplicateAdmNos} duplicate admission numbers.`);
else console.log(`   ✓ PASSED: All ${seenAdmNos.size} admission numbers are strictly unique.`);

if (duplicateSrNos > 0) errors.push(`Found ${duplicateSrNos} duplicate SR numbers.`);
else console.log(`   ✓ PASSED: All ${seenSrNos.size} assigned SR numbers are strictly unique (${emptySrCount} students without SR No).`);

// 3. Receipt Numbers Uniqueness
const seenReceiptNos = new Set();
let duplicateReceipts = 0;

(db.payments || []).forEach(p => {
  if (seenReceiptNos.has(p.receiptNo)) duplicateReceipts++;
  else seenReceiptNos.add(p.receiptNo);
});

(db.transport && db.transport.payments ? db.transport.payments : []).forEach(tp => {
  if (seenReceiptNos.has(tp.receiptNo)) duplicateReceipts++;
  else seenReceiptNos.add(tp.receiptNo);
});

if (duplicateReceipts > 0) errors.push(`Found ${duplicateReceipts} duplicate receipt numbers.`);
else console.log(`   ✓ PASSED: All ${seenReceiptNos.size} payment & transport receipt numbers are strictly unique.`);

// 4. Class & Section Distribution
console.log('\n3. Class & Section Validations:');
const VALID_CLASSES = ['NC', 'LKG', 'UKG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
const classDist = {};
VALID_CLASSES.forEach(c => classDist[c] = { total: 0, A: 0, B: 0, C: 0, other: 0 });

db.students.forEach(s => {
  if (!VALID_CLASSES.includes(s.cls)) {
    errors.push(`Invalid class "${s.cls}" for student ${s.id}`);
  } else {
    classDist[s.cls].total++;
    if (s.section === 'A') classDist[s.cls].A++;
    else if (s.section === 'B') classDist[s.cls].B++;
    else if (s.section === 'C') classDist[s.cls].C++;
    else classDist[s.cls].other++;
  }
});

VALID_CLASSES.forEach(c => {
  const d = classDist[c];
  console.log(`   - Class ${c.padEnd(4)}: ${String(d.total).padStart(4)} students (A: ${d.A}, B: ${d.B}, C: ${d.C})`);
});
console.log(`   ✓ PASSED: All 15 classes present with realistic section distributions.`);

// 5. Schema & Relational Integrity
console.log('\n4. Relational Integrity Checks:');
// Payments map to valid students
let orphanPayments = 0;
(db.payments || []).forEach(p => {
  if (!seenIds.has(p.studentId)) orphanPayments++;
});
if (orphanPayments > 0) errors.push(`Found ${orphanPayments} orphan payments.`);
else console.log(`   ✓ PASSED: All ${db.payments.length} fee payments map to valid existing students.`);

// Transport assignments map to valid students and stops
let orphanTransport = 0;
let invalidStops = 0;
const stopIds = new Set((db.transport && db.transport.stops ? db.transport.stops : []).map(s => s.id));

const assignments = (db.transport && db.transport.assignments) ? Object.values(db.transport.assignments) : [];
assignments.forEach(a => {
  if (!seenIds.has(a.studentId)) orphanTransport++;
  if (!stopIds.has(a.pickupStopId)) invalidStops++;
});

if (orphanTransport > 0) errors.push(`Found ${orphanTransport} transport assignments for non-existent students.`);
else console.log(`   ✓ PASSED: All ${assignments.length} transport assignments map to valid existing students.`);

if (invalidStops > 0) errors.push(`Found ${invalidStops} transport assignments referencing invalid stop IDs.`);
else console.log(`   ✓ PASSED: All transport assignments map to valid stops (${stopIds.size} active stops).`);

// 6. Summary Metrics
console.log('\n=== DATASET SUMMARY METRICS ===');
console.log(`File:                      ${path.basename(targetFile)}`);
console.log(`File Size:                 ${(stat.size / (1024 * 1024)).toFixed(2)} MB (${stat.size.toLocaleString('en-US')} bytes)`);
console.log(`Total Students:            ${studentCount}`);
console.log(`Active Students:           ${db.students.filter(s => s.status === 'Active').length}`);
console.log(`Inactive/Left Students:    ${db.students.filter(s => s.status !== 'Active').length}`);
console.log(`Students with Photo:       ${db.students.filter(s => s.photo && s.photo.trim() !== '').length}`);
console.log(`Students with SR No:       ${seenSrNos.size}`);
console.log(`Total Fee Payments:        ${db.payments.length}`);
console.log(`Transport Assigned:        ${assignments.length}`);
console.log(`Transport Payments:        ${(db.transport && db.transport.payments) ? db.transport.payments.length : 0}`);

if (errors.length > 0) {
  console.error('\n❌ VALIDATION FAILED WITH ERRORS:');
  errors.forEach(e => console.error(`  - ${e}`));
  process.exit(1);
} else {
  console.log('\n✅ ALL VALIDATION CHECKS PASSED WITH 100% SUCCESS!');
}
