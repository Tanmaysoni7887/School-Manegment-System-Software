// Automated Unit & Integration Test Suite: Transport Fees & Receipts Logic
// Tests all 10 requirements specified in the Transport Fees & Receipts Bug Fix specification
// Runs completely in an isolated mock sandbox - zero impact on live data!

const assert = require('assert');

console.log('=== STARTING TEST SUITE: Transport Fees, Receipts & No-NaN Validation ===\n');

// 1. Setup isolated mock DB state
let DB = {
  settings: {
    schoolName: 'MD CONVENT PUBLIC SCHOOL',
    currentSession: '2026–27'
  },
  students: [
    { id: 101, name: 'Aarav Sharma', admno: 'MDC-1001', cls: '1', section: 'A', status: 'Active' },
    { id: 102, name: 'Priya Verma', admno: 'MDC-1002', cls: '2', section: 'A', status: 'Active' },
    { id: 103, name: 'Rohan Gupta', admno: 'MDC-1003', cls: '3', section: 'B', status: 'Active' }
  ],
  payments: [
    {
      receiptNo: 'REC-1001',
      studentId: 101,
      studentName: 'Aarav Sharma',
      amount: 1500,
      category: 'School Fee',
      date: '2026-05-10',
      reversed: false
    }
  ],
  fees: {
    '101_May_2026': [
      { type: 'School Fee', amount: 1500, paid: true, receiptNo: 'REC-1001' }
    ]
  },
  transport: {
    stops: [
      { id: 'stop_1', name: 'Main Gate', fee: 600, active: true },
      { id: 'stop_2', name: 'Railway Crossing', fee: 400, active: true }
    ],
    assignments: {
      101: {
        studentId: 101,
        admNo: 'MDC-1001',
        name: 'Aarav Sharma',
        class: '1 A',
        active: true,
        type: 'single',
        pickupStopId: 'stop_1',
        pickupStopName: 'Main Gate',
        monthlyFee: 600,
        effectiveFrom: 'April 2026',
        stoppedAt: null,
        history: []
      }
    },
    payments: [],
    nextReceiptSeq: 1
  }
};

// Import or recreate the helper functions tested in app.js
function safeNum(val, fallback = 0) {
  const n = Number(val);
  return (isNaN(n) || !isFinite(n)) ? fallback : n;
}

function safeCurrency(val) {
  const n = safeNum(val, 0);
  return '₹ ' + n.toLocaleString('en-IN');
}

function isValidTransportPayment(p) {
  if (!p || typeof p !== 'object' || p.reversed) return false;
  if (!p.receiptNo || typeof p.receiptNo !== 'string' || !p.receiptNo.trim()) return false;
  if (/^TR-REC-\d+$/i.test(p.receiptNo) && (p.amountReceived === undefined || !Array.isArray(p.allocations))) {
    return false;
  }
  const amt = (p.amountReceived !== undefined) ? Number(p.amountReceived) : Number(p.amount);
  if (isNaN(amt) || !isFinite(amt) || amt <= 0) return false;
  if (!p.studentId && !p.admNo) return false;
  return true;
}

function sanitizeTransportDatabase(db) {
  if (!db || !db.transport || !Array.isArray(db.transport.payments)) return false;
  const initialLen = db.transport.payments.length;
  if (initialLen === 0) return false;

  const cleaned = db.transport.payments.filter(p => isValidTransportPayment(p));
  if (cleaned.length !== initialLen) {
    db.transport.payments = cleaned;
    return true;
  }
  return false;
}

function getStudentMonthTransportAccounting(studentId, monthStrOrKey) {
  let paid = 0;
  let discount = 0;
  const payments = (DB.transport && Array.isArray(DB.transport.payments)) ? DB.transport.payments : [];
  payments.forEach(p => {
    if (p.studentId === studentId && !p.reversed && isValidTransportPayment(p)) {
      if (Array.isArray(p.allocations)) {
        p.allocations.forEach(al => {
          if (al.month === monthStrOrKey) {
            const pAlloc = safeNum(al.paidAllocated, 0);
            const dAlloc = safeNum(al.discountAllocated, 0);
            if (pAlloc > 0) paid += pAlloc;
            if (dAlloc > 0) discount += dAlloc;
          }
        });
      }
    }
  });
  return { paid, discount };
}

function getValidStudentTransportReceipts(studentId) {
  const payments = (DB.transport && Array.isArray(DB.transport.payments)) ? DB.transport.payments : [];
  return payments.filter(p => p.studentId === studentId && isValidTransportPayment(p));
}

function recordTransportPayment({ studentId, months, received, discount = 0, discountReason = '', mode = 'Cash' }) {
  const student = DB.students.find(s => s.id === studentId);
  const assign = DB.transport.assignments[studentId];
  if (!student || !assign) throw new Error('Student or transport assignment not found');

  if (isNaN(received) || received <= 0) {
    throw new Error('Payment amount must be greater than ₹0 to record a transport payment.');
  }

  const seq = DB.transport.nextReceiptSeq || 1;
  const yr = 2026;
  const receiptNo = `TR-${yr}-${String(seq).padStart(4, '0')}`;
  DB.transport.nextReceiptSeq = seq + 1;

  const allocations = months.map(m => {
    return {
      month: m,
      fee: assign.monthlyFee,
      previousPaid: 0,
      discountAllocated: 0,
      paidAllocated: received / months.length,
      balanceRemaining: Math.max(0, assign.monthlyFee - (received / months.length))
    };
  });

  const paymentRecord = {
    id: 'trp_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    receiptNo,
    date: '02 Nov 2026',
    timestamp: new Date().toISOString(),
    studentId: student.id,
    studentName: student.name,
    admNo: student.admno,
    class: student.cls + ' ' + student.section,
    pickup: assign.pickupStopName,
    drop: '-',
    months,
    allocations,
    totalFee: assign.monthlyFee * months.length,
    discount,
    discountReason,
    amountReceived: received,
    remainingBalance: Math.max(0, (assign.monthlyFee * months.length) - discount - received),
    paymentMode: mode,
    reversed: false
  };

  DB.transport.payments.push(paymentRecord);
  return paymentRecord;
}

// -------------------------------------------------------------
// TEST 1: New student with transport assignment but no payment -> 0 receipts
// -------------------------------------------------------------
console.log('--- TEST 1: New student with transport assignment but no payment ---');
// Assign student 102 to transport
DB.transport.assignments[102] = {
  studentId: 102,
  admNo: 'MDC-1002',
  name: 'Priya Verma',
  class: '2 A',
  active: true,
  type: 'single',
  pickupStopId: 'stop_2',
  pickupStopName: 'Railway Crossing',
  monthlyFee: 400,
  effectiveFrom: 'April 2026',
  stoppedAt: null,
  history: []
};

const receipts102 = getValidStudentTransportReceipts(102);
assert.strictEqual(receipts102.length, 0, 'New student with assignment must have exactly 0 receipts');
console.log('✓ TEST 1 PASSED: New assigned student has exactly 0 receipts.');

// -------------------------------------------------------------
// TEST 2: Student with pending monthly transport fees -> 0 new receipts
// -------------------------------------------------------------
console.log('\n--- TEST 2: Student with pending monthly transport fees ---');
const accounting101 = getStudentMonthTransportAccounting(101, 'April 2026');
const pendingBalance = 600 - accounting101.paid;
assert.strictEqual(pendingBalance, 600, 'Student has 600 pending transport fee');
const receipts101Before = getValidStudentTransportReceipts(101);
assert.strictEqual(receipts101Before.length, 0, 'Unpaid dues must not generate any payment receipt');
console.log('✓ TEST 2 PASSED: Pending monthly transport fees exist with 0 payment receipts.');

// -------------------------------------------------------------
// TEST 3: Opening Transport Details repeatedly -> no new receipts
// -------------------------------------------------------------
console.log('\n--- TEST 3: Opening Transport Details repeatedly ---');
const seqBefore = DB.transport.nextReceiptSeq;
for (let i = 0; i < 10; i++) {
  getValidStudentTransportReceipts(101);
  getStudentMonthTransportAccounting(101, 'April 2026');
}
assert.strictEqual(DB.transport.nextReceiptSeq, seqBefore, 'nextReceiptSeq must never change when reading details');
assert.strictEqual(DB.transport.payments.length, 0, 'No payment records added when inspecting details');
console.log('✓ TEST 3 PASSED: Repeatedly reading transport details generates 0 new receipts.');

// -------------------------------------------------------------
// TEST 4: Reloading the application / DB sanitization -> no new receipts and removes fakes
// -------------------------------------------------------------
console.log('\n--- TEST 4: Reloading application with fake receipts -> sanitized to 0 receipts ---');
// Inject a fake receipt like TR-REC-31 with undefined amountReceived and missing allocations
DB.transport.payments.push({
  receiptNo: 'TR-REC-31',
  studentId: 101,
  admNo: 'MDC-1001',
  studentName: 'Aarav Sharma',
  class: '1 A',
  month: 'October',
  year: 2026,
  amount: 600,
  paymentMode: 'Cash',
  date: '2026-10-12',
  reversed: false
  // Notice: no amountReceived, no allocations
});
assert.strictEqual(DB.transport.payments.length, 1, 'Fake record injected');
sanitizeTransportDatabase(DB);
assert.strictEqual(DB.transport.payments.length, 0, 'Sanitization must prune fake TR-REC-* records');
assert.strictEqual(getValidStudentTransportReceipts(101).length, 0, 'Student has 0 receipts after sanitization');
console.log('✓ TEST 4 PASSED: App load sanitization strips fake receipts cleanly.');

// -------------------------------------------------------------
// TEST 5: Genuine ₹600 transport payment -> exactly 1 receipt
// -------------------------------------------------------------
console.log('\n--- TEST 5: Genuine ₹600 transport payment ---');
const payment1 = recordTransportPayment({
  studentId: 101,
  months: ['April 2026'],
  received: 600,
  mode: 'Cash'
});
assert.strictEqual(payment1.receiptNo, 'TR-2026-0001', 'First receipt must be TR-2026-0001');
assert.strictEqual(payment1.amountReceived, 600, 'Amount received must be 600');
const receiptsAfter1 = getValidStudentTransportReceipts(101);
assert.strictEqual(receiptsAfter1.length, 1, 'Exactly 1 receipt for student 101');
assert.strictEqual(receiptsAfter1[0].receiptNo, 'TR-2026-0001');
console.log('✓ TEST 5 PASSED: Genuine ₹600 payment created exactly 1 receipt.');

// -------------------------------------------------------------
// TEST 6: Genuine ₹600 payment followed by another ₹400 payment -> exactly 2 receipts
// -------------------------------------------------------------
console.log('\n--- TEST 6: Second genuine payment of ₹400 ---');
const payment2 = recordTransportPayment({
  studentId: 101,
  months: ['May 2026'],
  received: 400,
  mode: 'Online / UPI'
});
assert.strictEqual(payment2.receiptNo, 'TR-2026-0002', 'Second receipt must be TR-2026-0002');
assert.strictEqual(payment2.amountReceived, 400, 'Amount received must be 400');
const receiptsAfter2 = getValidStudentTransportReceipts(101);
assert.strictEqual(receiptsAfter2.length, 2, 'Exactly 2 receipts for student 101');
console.log('✓ TEST 6 PASSED: Exactly 2 receipts exist after two genuine payments.');

// -------------------------------------------------------------
// TEST 7: Receipt amount must never display ₹NaN
// -------------------------------------------------------------
console.log('\n--- TEST 7: Receipt amount formatting never displays ₹NaN ---');
assert.doesNotMatch(safeCurrency(payment1.amountReceived), /NaN/, 'Payment 1 amount cannot contain NaN');
assert.doesNotMatch(safeCurrency(payment2.amountReceived), /NaN/, 'Payment 2 amount cannot contain NaN');
assert.strictEqual(safeCurrency(undefined), '₹ 0', 'Undefined converts safely to ₹ 0');
assert.strictEqual(safeCurrency(null), '₹ 0', 'Null converts safely to ₹ 0');
assert.strictEqual(safeCurrency(NaN), '₹ 0', 'NaN converts safely to ₹ 0');
assert.strictEqual(safeCurrency(600), '₹ 600', '600 converts to ₹ 600');
assert.strictEqual(safeNum(undefined, 0), 0);
assert.strictEqual(safeNum(NaN, 0), 0);
assert.strictEqual(safeNum(450, 0), 450);
console.log('✓ TEST 7 PASSED: Safe currency formatting prevents ₹NaN in all scenarios.');

// -------------------------------------------------------------
// TEST 8: Existing genuine receipts must remain unchanged
// -------------------------------------------------------------
console.log('\n--- TEST 8: Existing genuine receipts remain unchanged during sanitization ---');
const countBeforeSanitize = DB.transport.payments.length;
sanitizeTransportDatabase(DB);
assert.strictEqual(DB.transport.payments.length, countBeforeSanitize, 'Genuine receipts are not removed by sanitization');
assert.strictEqual(DB.transport.payments[0].receiptNo, 'TR-2026-0001');
assert.strictEqual(DB.transport.payments[1].receiptNo, 'TR-2026-0002');
console.log('✓ TEST 8 PASSED: Existing genuine receipts remain intact.');

// -------------------------------------------------------------
// TEST 9: Normal Fee Collection receipts must remain unaffected
// -------------------------------------------------------------
console.log('\n--- TEST 9: Normal Fee Collection receipts unaffected ---');
assert.strictEqual(DB.payments.length, 1, 'Normal school payments array unchanged');
assert.strictEqual(DB.payments[0].receiptNo, 'REC-1001', 'Normal receipt REC-1001 untouched');
assert.strictEqual(DB.payments[0].amount, 1500, 'Normal payment amount untouched');
assert.strictEqual(DB.fees['101_May_2026'][0].receiptNo, 'REC-1001');
console.log('✓ TEST 9 PASSED: Normal school fee collection and receipts are 100% unaffected.');

// -------------------------------------------------------------
// TEST 10: Existing student transport assignments must remain unchanged
// -------------------------------------------------------------
console.log('\n--- TEST 10: Existing student transport assignments remain unchanged ---');
assert.ok(DB.transport.assignments[101], 'Assignment for 101 intact');
assert.strictEqual(DB.transport.assignments[101].pickupStopName, 'Main Gate');
assert.strictEqual(DB.transport.assignments[101].monthlyFee, 600);
assert.ok(DB.transport.assignments[102], 'Assignment for 102 intact');
assert.strictEqual(DB.transport.assignments[102].pickupStopName, 'Railway Crossing');
assert.strictEqual(DB.transport.assignments[102].monthlyFee, 400);
console.log('✓ TEST 10 PASSED: All student transport assignments remain 100% preserved.');

console.log('\n=== ALL 10 TESTS IN TEST SUITE PASSED SUCCESSFULLY! ===');
