/**
 * SHIKSHA — SYNTHETIC DEMO DATASET GENERATOR
 * ==============================================================================
 * Generates a clean, reproducible, and fully schema-compliant demo database
 * specifically enriched with comprehensive Previous-Session Arrears test cases
 * while maintaining 100% isolation from the production database.
 * ==============================================================================
 */

const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, 'demo_school_data.json');
const PROD_FORBIDDEN = 'MDConvent_SMS';

// CRITICAL SAFETY CHECK: Never overwrite production database
if (OUTPUT_FILE.includes(PROD_FORBIDDEN) && path.basename(OUTPUT_FILE) === 'school_data.json') {
  console.error('CRITICAL SAFETY BLOCK: Cannot target production database!');
  process.exit(1);
}

console.log('Generating fresh Previous-Arrears Demo Dataset...');

const CLASSES = ['Nursery', 'LKG', 'UKG', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th', '12th'];
const SECTIONS = ['A', 'B'];
const MONTHS_LIST = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March'];

const FIRST_NAMES_BOYS = [
  'Aarav', 'Advait', 'Aryan', 'Ayush', 'Chirag', 'Dev', 'Dhruv', 'Eshan', 'Farhan', 'Gaurav',
  'Harsh', 'Ishaan', 'Jayant', 'Kabir', 'Lakshya', 'Manav', 'Nakul', 'Om', 'Pranav', 'Rohan',
  'Samar', 'Shaurya', 'Tanmay', 'Utkarsh', 'Varun', 'Yash', 'Zaid', 'Reyansh', 'Vivaan', 'Ansh'
];

const FIRST_NAMES_GIRLS = [
  'Aadhya', 'Ananya', 'Bhavya', 'Chhavi', 'Diya', 'Ekta', 'Fatima', 'Gauri', 'Ishita', 'Jhanvi',
  'Khushi', 'Lavanya', 'Meera', 'Navya', 'Pari', 'Riddhi', 'Saanvi', 'Tanvi', 'Urvi', 'Vanya',
  'Zara', 'Sneha', 'Pooja', 'Priya', 'Riya', 'Kavya', 'Simran', 'Palak', 'Nisha', 'Muskan'
];

const SURNAMES = [
  'Sharma', 'Verma', 'Gupta', 'Singh', 'Patel', 'Yadav', 'Dubey', 'Tiwari', 'Mishra', 'Pandey',
  'Khan', 'Ali', 'Chauhan', 'Saxena', 'Agrawal', 'Bansal', 'Joshi', 'Shukla', 'Kumar', 'Lodhi'
];

const TRANSPORT_STOPS = [
  { id: 1, name: 'Kasganj Bypass Tiraha', fare: 350 },
  { id: 2, name: 'Dholna Road Crossing', fare: 300 },
  { id: 3, name: 'Bilram Gate Chowk', fare: 250 },
  { id: 4, name: 'Sahawar Bus Stand', fare: 300 },
  { id: 5, name: 'Mohanpur Turn', fare: 350 },
  { id: 6, name: 'Ganjdundwara Road', fare: 400 },
  { id: 7, name: 'Amanpur Station Road', fare: 200 },
  { id: 8, name: 'Soron Road Tiraha', fare: 300 }
];

let nextStudentId = 100;
let nextAdmSeq = 1000;
let nextReceiptSeq = 5000;

function generatePhone() {
  const prefixes = ['98', '97', '94', '95', '96', '91', '89', '88', '87', '79'];
  const p = prefixes[Math.floor(Math.random() * prefixes.length)];
  const rest = String(Math.floor(10000000 + Math.random() * 90000000));
  return p + rest.slice(2);
}

function generateDemoDatabase() {
  const currentSession = '2026–27';
  const previousSession = '2025–26';

  const db = {
    settings: {
      schoolName: 'MD Convent Public School',
      schoolAddr: 'Amanpur, Kasganj Road, Uttar Pradesh',
      schoolPhone: '9528371785',
      schoolLogo: '',
      currentSession: currentSession,
      admissionPrefix: 'MDC-',
      receiptPrefix: 'REC-',
      principalName: 'Tanmay Soni'
    },
    classes: CLASSES.map(cls => ({ name: cls, sections: ['A', 'B'] })),
    students: [],
    feeConfig: {},
    fees: {},
    payments: [],
    transport: {
      stops: TRANSPORT_STOPS,
      assignments: {},
      payments: []
    },
    expenses: [],
    activityLog: [],
    nextStudentSeq: 0,
    nextReceiptSeq: 0,
    nextId: 0,
    metadata: {
      generator: 'SHIKSHA Previous-Arrears Test Dataset Engine v3.0',
      generatedAt: new Date().toISOString(),
      currentSession: currentSession,
      previousSession: previousSession,
      isFictionalDemoData: true
    }
  };

  // --------------------------------------------------------------------------
  // SECTION A: 10 SPECIFIC PREVIOUS-SESSION ARREARS TEST CASE STUDENTS
  // --------------------------------------------------------------------------
  const arrearsTestCases = [
    {
      id: 101,
      admno: 'MDC-1001',
      name: 'Aarav Sharma (Case 1: No Arrears)',
      cls: '5th',
      sec: 'A',
      father: 'Ramesh Sharma',
      phone: '9876500001',
      setup: (s) => {
        // Fully paid historical fees in 2025–26
        ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November'].forEach(m => {
          db.fees[`${s.id}_${m}_2025`] = [{ type: 'School Fee', amount: 350, paid: true, enabled: true }];
        });
        db.feeConfig[String(s.id)] = { tuition: true, examEnabled: true, previousArrears: 0 };
      }
    },
    {
      id: 102,
      admno: 'MDC-1002',
      name: 'Bhavya Gupta (Case 2: Single Month)',
      cls: '6th',
      sec: 'A',
      father: 'Suresh Gupta',
      phone: '9876500002',
      setup: (s) => {
        // Paid April-October 2025; Unpaid November 2025: ₹350
        ['April', 'May', 'June', 'July', 'August', 'September', 'October'].forEach(m => {
          db.fees[`${s.id}_${m}_2025`] = [{ type: 'School Fee', amount: 350, paid: true, enabled: true }];
        });
        db.fees[`${s.id}_November_2025`] = [{ type: 'School Fee', amount: 350, paid: false, enabled: true }];
        db.feeConfig[String(s.id)] = { tuition: true, examEnabled: true, previousArrears: 0 };
      }
    },
    {
      id: 103,
      admno: 'MDC-1003',
      name: 'Chirag Verma (Case 3: Consecutive Months)',
      cls: '4th',
      sec: 'A',
      father: 'Dinesh Verma',
      phone: '9876500003',
      setup: (s) => {
        // Paid April-June 2025; Unpaid July-November 2025: 5 * 315 = 1575
        ['April', 'May', 'June'].forEach(m => {
          db.fees[`${s.id}_${m}_2025`] = [{ type: 'School Fee', amount: 315, paid: true, enabled: true }];
        });
        ['July', 'August', 'September', 'October', 'November'].forEach(m => {
          db.fees[`${s.id}_${m}_2025`] = [{ type: 'School Fee', amount: 315, paid: false, enabled: true }];
        });
        db.feeConfig[String(s.id)] = { tuition: true, examEnabled: true, previousArrears: 0 };
      }
    },
    {
      id: 104,
      admno: 'MDC-1004',
      name: 'Diya Patel (Case 4: Non-Consecutive Months)',
      cls: '3rd',
      sec: 'A',
      father: 'Anand Patel',
      phone: '9876500004',
      setup: (s) => {
        // Unpaid April 2025 (400) and August 2025 (400); May, June, July paid
        db.fees[`${s.id}_April_2025`] = [{ type: 'School Fee', amount: 400, paid: false, enabled: true }];
        ['May', 'June', 'July'].forEach(m => {
          db.fees[`${s.id}_${m}_2025`] = [{ type: 'School Fee', amount: 400, paid: true, enabled: true }];
        });
        db.fees[`${s.id}_August_2025`] = [{ type: 'School Fee', amount: 400, paid: false, enabled: true }];
        db.feeConfig[String(s.id)] = { tuition: true, examEnabled: true, previousArrears: 0 };
      }
    },
    {
      id: 105,
      admno: 'MDC-1005',
      name: 'Eshan Khan (Case 5: Partially Paid Historical Fee)',
      cls: '7th',
      sec: 'A',
      father: 'Imran Khan',
      phone: '9876500005',
      setup: (s) => {
        // November 2025: amount 400, partialPaid 150 -> remaining 250
        db.fees[`${s.id}_November_2025`] = [{
          type: 'School Fee',
          amount: 400,
          paid: false,
          partialPaid: 150,
          partialRemaining: 250,
          enabled: true
        }];
        db.feeConfig[String(s.id)] = { tuition: true, examEnabled: true, previousArrears: 0 };
      }
    },
    {
      id: 106,
      admno: 'MDC-1006',
      name: 'Farhan Ali (Case 6: Exam Fee Pending)',
      cls: '8th',
      sec: 'A',
      father: 'Zahid Ali',
      phone: '9876500006',
      setup: (s) => {
        // School fees fully paid; September 2025 Exam Fee unpaid: 200
        ['April', 'May', 'June', 'July', 'August', 'September'].forEach(m => {
          db.fees[`${s.id}_${m}_2025`] = [{ type: 'School Fee', amount: 450, paid: true, enabled: true }];
        });
        db.fees[`${s.id}_September_2025`].push({
          type: 'Exam Fee',
          name: 'Half-Yearly Exam Fee',
          amount: 200,
          paid: false,
          enabled: true
        });
        db.feeConfig[String(s.id)] = { tuition: true, examEnabled: true, previousArrears: 0 };
      }
    },
    {
      id: 107,
      admno: 'MDC-1007',
      name: 'Gaurav Joshi (Case 7: Both School Fee and Exam Fee)',
      cls: '9th',
      sec: 'A',
      father: 'Harish Joshi',
      phone: '9876500007',
      setup: (s) => {
        // April-June 2025 School Fee (350 * 3 = 1050) + September 2025 Exam Fee (200) = 1250
        ['April', 'May', 'June'].forEach(m => {
          db.fees[`${s.id}_${m}_2025`] = [{ type: 'School Fee', amount: 350, paid: false, enabled: true }];
        });
        db.fees[`${s.id}_September_2025`] = [{
          type: 'Exam Fee',
          name: 'Half-Yearly Examination',
          amount: 200,
          paid: false,
          enabled: true
        }];
        db.feeConfig[String(s.id)] = { tuition: true, examEnabled: true, previousArrears: 0 };
      }
    },
    {
      id: 108,
      admno: 'MDC-1008',
      name: 'Harshit Yadav (Case 8: Transport Fee Pending)',
      cls: '2nd',
      sec: 'A',
      father: 'Rajesh Yadav',
      phone: '9876500008',
      setup: (s) => {
        // Transport Fee unpaid: August, September, October 2025 @ 300 = 900
        ['August', 'September', 'October'].forEach(m => {
          db.fees[`${s.id}_${m}_2025`] = [{ type: 'Transport Fee', amount: 300, paid: false, enabled: true }];
        });
        db.transport.assignments[String(s.id)] = {
          stopId: 2,
          pickupStopName: 'Dholna Road Crossing',
          monthlyFee: 300,
          active: true,
          effectiveFrom: '2025-04'
        };
        db.feeConfig[String(s.id)] = { tuition: true, examEnabled: true, previousArrears: 0 };
      }
    },
    {
      id: 109,
      admno: 'MDC-1009',
      name: 'Ishita Mishra (Case 9: School + Exam + Transport Fee)',
      cls: '6th',
      sec: 'B',
      father: 'Vinod Mishra',
      phone: '9876500009',
      setup: (s) => {
        // School Fee April-May 2025 (350 * 2 = 700)
        ['April', 'May'].forEach(m => {
          db.fees[`${s.id}_${m}_2025`] = [{ type: 'School Fee', amount: 350, paid: false, enabled: true }];
        });
        // Exam Fee September 2025 (200)
        db.fees[`${s.id}_September_2025`] = [{ type: 'Exam Fee', amount: 200, paid: false, enabled: true }];
        // Transport Fee July 2025 (300)
        db.fees[`${s.id}_July_2025`] = [{ type: 'Transport Fee', amount: 300, paid: false, enabled: true }];
        db.transport.assignments[String(s.id)] = {
          stopId: 3,
          pickupStopName: 'Bilram Gate Chowk',
          monthlyFee: 300,
          active: true,
          effectiveFrom: '2025-04'
        };
        db.feeConfig[String(s.id)] = { tuition: true, examEnabled: true, previousArrears: 0 };
      }
    },
    {
      id: 110,
      admno: 'MDC-1010',
      name: 'Jayant Dubey (Case 10: Fallback Opening Balance)',
      cls: '1st',
      sec: 'A',
      father: 'Santosh Dubey',
      phone: '9876500010',
      setup: (s) => {
        // Honest opening balance with NO month records in DB.fees
        db.feeConfig[String(s.id)] = { tuition: true, examEnabled: true, previousArrears: 750 };
      }
    }
  ];

  // Seed the 10 test students
  arrearsTestCases.forEach(tc => {
    const sObj = {
      id: tc.id,
      admno: tc.admno,
      name: tc.name,
      cls: tc.cls,
      sec: tc.sec,
      section: tc.sec,
      father: tc.father,
      mother: 'Sunita ' + tc.father.split(' ')[1],
      phone: tc.phone,
      session: currentSession,
      admissionSession: previousSession,
      admissionDate: '2025-04-05',
      academicHistory: [{ session: previousSession, cls: tc.cls }],
      status: 'active',
      active: true
    };
    db.students.push(sObj);
    tc.setup(sObj);

    // Current session 2026–27 initial dues (April–November 2026 tuition)
    ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November'].forEach(m => {
      const k = `${sObj.id}_${m}_2026`;
      if (!db.fees[k]) db.fees[k] = [];
      db.fees[k].push({ type: 'School Fee', amount: 400, paid: false, enabled: true });
    });
  });

  // --------------------------------------------------------------------------
  // SECTION B: REALISTIC COHORT OF GENERAL STUDENTS (240 STUDENTS)
  // --------------------------------------------------------------------------
  let curSeq = 1011;
  nextStudentId = 200;
  CLASSES.forEach(cls => {
    SECTIONS.forEach(sec => {
      const count = 8; // 8 students per section * 15 classes * 2 sections = 240 students
      for (let i = 0; i < count; i++) {
        const sid = ++nextStudentId;
        const adm = `MDC-${curSeq++}`;
        const isBoy = Math.random() > 0.5;
        const fn = isBoy
          ? FIRST_NAMES_BOYS[Math.floor(Math.random() * FIRST_NAMES_BOYS.length)]
          : FIRST_NAMES_GIRLS[Math.floor(Math.random() * FIRST_NAMES_GIRLS.length)];
        const ln = SURNAMES[Math.floor(Math.random() * SURNAMES.length)];
        const fatherFn = FIRST_NAMES_BOYS[Math.floor(Math.random() * FIRST_NAMES_BOYS.length)];
        const motherFn = FIRST_NAMES_GIRLS[Math.floor(Math.random() * FIRST_NAMES_GIRLS.length)];

        const st = {
          id: sid,
          admno: adm,
          name: `${fn} ${ln}`,
          cls: cls,
          sec: sec,
          section: sec,
          father: `${fatherFn} ${ln}`,
          mother: `${motherFn} ${ln}`,
          phone: generatePhone(),
          session: currentSession,
          admissionSession: '2026–27',
          admissionDate: '2026-04-10',
          academicHistory: [],
          status: 'active',
          active: true
        };

        db.students.push(st);
        db.feeConfig[String(sid)] = { tuition: true, examEnabled: true, previousArrears: 0 };

        // Seed current session fees and realistic payments
        const monthlyTuition = 400;
        const paidUpToIdx = Math.floor(Math.random() * 8); // Paid between 0 and 7 months
        MONTHS_LIST.slice(0, 8).forEach((m, idx) => {
          const isPaid = idx <= paidUpToIdx;
          db.fees[`${sid}_${m}_2026`] = [{
            type: 'School Fee',
            amount: monthlyTuition,
            paid: isPaid,
            enabled: true
          }];

          if (isPaid) {
            db.payments.push({
              rcpt: `REC-${nextReceiptSeq++}`,
              studentId: sid,
              studentName: st.name,
              admno: st.admno,
              cls: st.cls,
              sec: st.sec,
              date: '2026-07-15',
              session: currentSession,
              mo: m,
              yr: 2026,
              feeType: 'School Fee',
              amount: monthlyTuition,
              mode: 'Cash',
              remarks: `Tuition for ${m} 2026`
            });
          }
        });
      }
    });
  });

  db.nextStudentSeq = curSeq;
  db.nextReceiptSeq = nextReceiptSeq;
  db.nextId = nextStudentId;

  return db;
}

const generatedDb = generateDemoDatabase();
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(generatedDb, null, 2), 'utf8');

const stat = fs.statSync(OUTPUT_FILE);
const sizeKb = (stat.size / 1024).toFixed(1);

console.log(`[SUCCESS] Generated fresh demo dataset at: ${OUTPUT_FILE}`);
console.log(`  File size: ${sizeKb} KB`);
console.log(`  Total Students: ${generatedDb.students.length}`);
console.log(`  Targeted Previous-Arrears Test Cases: 10`);
console.log(`  Total Receipts: ${generatedDb.payments.length}`);
