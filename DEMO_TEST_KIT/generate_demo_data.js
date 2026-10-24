/**
 * MD CONVENT PUBLIC SCHOOL — REALISTIC DEMO DATA GENERATOR
 * ==============================================================================
 * Generates configurable, varied, and 100% synthetic school database JSON
 * strictly matching the schema of MDConvent_App (src/app.js & main.js).
 * ==============================================================================
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const args = process.argv.slice(2);
let requestedCount = 275;
let outputFileName = 'demo_school_data.json';
let runValidationOnly = false;

args.forEach(arg => {
  if (arg.startsWith('--count=')) {
    requestedCount = parseInt(arg.split('=')[1], 10);
  } else if (arg.startsWith('--output=')) {
    outputFileName = arg.split('=')[1].trim();
  } else if (arg === '--validate') {
    runValidationOnly = true;
  } else if (!isNaN(parseInt(arg, 10))) {
    requestedCount = parseInt(arg, 10);
  }
});

const SCRIPT_DIR = __dirname;
const DEMO_DATA_DIR = path.join(SCRIPT_DIR, 'demo_data');
const OUTPUT_FILE_PATH = path.join(DEMO_DATA_DIR, outputFileName);

if (!fs.existsSync(DEMO_DATA_DIR)) {
  fs.mkdirSync(DEMO_DATA_DIR, { recursive: true });
}

const MALE_FIRST_NAMES = [
  'Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Reyansh', 'Muhammad', 'Sai',
  'Arnav', 'Aayan', 'Krishna', 'Ishan', 'Shaurya', 'Atharv', 'Advik', 'Pranav',
  'Advaith', 'Aryan', 'Dhruv', 'Kabir', 'Ritvik', 'Darsh', 'Devansh', 'Samar',
  'Shivam', 'Yash', 'Ayush', 'Aman', 'Rohan', 'Rohit', 'Vikas', 'Amit',
  'Deepak', 'Manav', 'Kunal', 'Gaurav', 'Mohit', 'Tarun', 'Harshit', 'Nikhil',
  'Rishabh', 'Harsh', 'Mayank', 'Alok', 'Sachin', 'Rahul', 'Pankaj', 'Neeraj',
  'Suraj', 'Varun', 'Kartik', 'Ansh', 'Utkarsh', 'Piyush', 'Tushar', 'Abhishek'
];

const FEMALE_FIRST_NAMES = [
  'Saanvi', 'Aadya', 'Kiara', 'Diya', 'Pihu', 'Prisha', 'Ananya', 'Fatima',
  'Sanvi', 'Samaira', 'Myra', 'Pari', 'Riya', 'Aadhya', 'Ira', 'Avani',
  'Navya', 'Kashvi', 'Siya', 'Meera', 'Sara', 'Tanvi', 'Riddhi', 'Shreya',
  'Sneha', 'Pooja', 'Priya', 'Neha', 'Ritu', 'Anjali', 'Simran', 'Divya',
  'Muskan', 'Komal', 'Payal', 'Swati', 'Jyoti', 'Kavita', 'Sunita', 'Pinki',
  'Renu', 'Khushi', 'Dolly', 'Aarti', 'Kajal', 'Manshi', 'Garima', 'Bhavna'
];

const SURNAMES = [
  'Sharma', 'Verma', 'Gupta', 'Singh', 'Yadav', 'Soni', 'Agarwal', 'Mishra',
  'Tiwari', 'Chauhan', 'Rajput', 'Saxena', 'Dubey', 'Pandey', 'Kumar', 'Kashyap',
  'Lodhi', 'Baghel', 'Gautam', 'Maurya', 'Pal', 'Prajapati', 'Dixit', 'Upadhyay',
  'Varshney', 'Maheshwari', 'Bansal', 'Goel', 'Jain', 'Khandelwal', 'Joshi'
];

const FATHER_FIRST_NAMES = [
  'Rajesh', 'Mukesh', 'Suresh', 'Ramesh', 'Dinesh', 'Naresh', 'Satish', 'Harish',
  'Vinod', 'Pramod', 'Ashok', 'Manoj', 'Sunil', 'Anil', 'Sanjay', 'Ajay',
  'Vijay', 'Rakesh', 'Santosh', 'Brijesh', 'Mahendra', 'Devendra', 'Narendra'
];

const MOTHER_FIRST_NAMES = [
  'Sunita', 'Anita', 'Geeta', 'Seema', 'Rekha', 'Usha', 'Saroj', 'Shanti',
  'Kamlesh', 'Vimla', 'Sushila', 'Meena', 'Mamta', 'Neelam', 'Pushpa', 'Savitri',
  'Radha', 'Maya', 'Kiran', 'Santosh', 'Manju', 'Asha', 'Sudha', 'Rajni'
];

const LOCALITIES = [
  'Mohalla Chobdar, Amanpur', 'Near Old Post Office, Amanpur', 'Railway Station Road, Kasganj',
  'Bilram Gate, Kasganj', 'Main Market, Sahawar', 'Mohanpur Tiraha, Sahawar Road',
  'Near Gandhi Murti, Ganjdundwara', 'Patiali Crossing, Ganjdundwara', 'Village Dholna, Kasganj',
  'Near Primary Health Centre, Bilram', 'Nai Basti, Amanpur Road', 'Sujawalpur Road, Ganjdundwara'
];

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
const CLASSES = ['NC', 'LKG', 'UKG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
const MONTHS_LIST = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March'];
const PAYMENT_MODES = ['Cash', 'Online / UPI', 'Bank Transfer', 'Cheque'];

const CLASS_AGE_MAP = {
  'NC': 3, 'LKG': 4, 'UKG': 5,
  '1': 6, '2': 7, '3': 8, '4': 9, '5': 10,
  '6': 11, '7': 12, '8': 13, '9': 14, '10': 15,
  '11': 16, '12': 17
};

function randomChoice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function generateDemoDatabase(count) {
  if (count < 10 || count > 10000) throw new Error('Count must be 10-10000');
  const curSession = '2026–27';
  const startYr = 2026;

  const feeStructures = {};
  CLASSES.forEach((c, idx) => {
    const tuition = idx < 3 ? 350 : idx < 8 ? 400 : idx < 11 ? 450 : idx < 13 ? 500 : 550;
    feeStructures[c] = { tuition, transport: 300, admission: 500, examFee: 200 };
  });

  const classSections = {};
  CLASSES.forEach(c => {
    classSections[c] = [{ name: 'A', teacher: '' }, { name: 'B', teacher: '' }];
  });

  const transportStops = [
    { id: 'stop_kasganj_01', name: 'Kasganj Bypass', route: 'Route 1 - Kasganj Express', distance: '14 km', fee: 550, effectiveFrom: 'April', active: true },
    { id: 'stop_kasganj_02', name: 'Dholna Tiraha', route: 'Route 1 - Kasganj Express', distance: '10 km', fee: 450, effectiveFrom: 'April', active: true },
    { id: 'stop_kasganj_03', name: 'Bilram Gate', route: 'Route 1 - Kasganj Express', distance: '8 km', fee: 400, effectiveFrom: 'April', active: true },
    { id: 'stop_sahawar_01', name: 'Sahawar Bus Stand', route: 'Route 2 - Sahawar Feeder', distance: '12 km', fee: 500, effectiveFrom: 'April', active: true },
    { id: 'stop_sahawar_02', name: 'Mohanpur Turn', route: 'Route 2 - Sahawar Feeder', distance: '9 km', fee: 450, effectiveFrom: 'April', active: true },
    { id: 'stop_ganj_01', name: 'Ganjdundwara Road', route: 'Route 3 - Ganjdundwara', distance: '15 km', fee: 600, effectiveFrom: 'April', active: true },
    { id: 'stop_local_01', name: 'Amanpur Station Road', route: 'Route 4 - Local Amanpur', distance: '3 km', fee: 300, effectiveFrom: 'April', active: true }
  ];

  const transport = { stops: transportStops, assignments: {}, payments: [], nextReceiptSeq: 1 };

  const classAllocations = {};
  const perClass = Math.floor(count / CLASSES.length);
  CLASSES.forEach(c => classAllocations[c] = perClass);
  let rem = count - (perClass * CLASSES.length);
  for (let i = 0; i < rem; i++) classAllocations[CLASSES[i]]++;

  const students = [];
  const fees = {};
  const feeConfig = {};
  const payments = [];

  let sid = 1;
  let admSeq = 1001;
  let rcptSeq = 1001;
  let srSeq = 101;
  const billingMonths = ['April', 'May', 'June', 'July', 'August', 'September', 'October'];

  CLASSES.forEach(cls => {
    const n = classAllocations[cls];
    let rA = 1, rB = 1;
    for (let i = 0; i < n; i++) {
      const id = sid++;
      const isMale = Math.random() > 0.48;
      const fn = isMale ? randomChoice(MALE_FIRST_NAMES) : randomChoice(FEMALE_FIRST_NAMES);
      const ln = randomChoice(SURNAMES);
      const sName = `${fn} ${ln}`;
      const fName = `${randomChoice(FATHER_FIRST_NAMES)} ${ln}`;
      const mName = `${randomChoice(MOTHER_FIRST_NAMES)} Devi`;
      const sec = (i % 2 === 0) ? 'A' : 'B';
      const roll = String(sec === 'A' ? rA++ : rB++);
      const age = CLASS_AGE_MAP[cls] || 10;
      const dob = `${startYr - age}-0${randomInt(1, 9)}-15`;
      const admno = `MDC-${admSeq++}`;
      const srNo = Math.random() < 0.75 ? `SR-${srSeq++}` : '';
      const stat = Math.random() < 0.92 ? 'Active' : (Math.random() < 0.5 ? 'Inactive' : 'Transferred');
      const phone = '98' + String(randomInt(10000000, 99999999));

      const st = {
        id,
        name: sName,
        father: fName,
        mother: mName,
        dob,
        gender: isMale ? 'Male' : 'Female',
        blood: randomChoice(BLOOD_GROUPS),
        phone,
        email: '',
        address: randomChoice(LOCALITIES),
        admno,
        srNo,
        rollno: roll,
        cls,
        section: sec,
        admissionDate: `${startYr - 1}-04-05`,
        session: curSession,
        status: stat,
        academicHistory: [],
        enrollments: [{ session: curSession, cls, section: sec, rollno: roll, status: stat, enrolledAt: `${startYr - 1}-04-05` }]
      };
      students.push(st);

      const tuition = feeStructures[cls].tuition;
      const usesTr = (stat === 'Active' && Math.random() < 0.35);

      feeConfig[id] = {
        customTuition: null,
        tuition: true,
        transportEnabled: usesTr,
        customTransport: null,
        transport: usesTr,
        examFee: 200,
        examEnabled: true,
        admission: false,
        customAdmission: null,
        previousArrears: 0,
        advanceBalance: 0
      };

      if (usesTr) {
        const stop = randomChoice(transportStops);
        transport.assignments[id] = {
          studentId: id,
          admNo: admno,
          name: sName,
          class: `${cls} ${sec}`,
          active: true,
          type: 'single',
          pickupStopId: stop.id,
          pickupStopName: stop.name,
          dropStopId: null,
          dropStopName: '-',
          monthlyFee: stop.fee,
          effectiveFrom: 'April',
          stoppedAt: null,
          history: []
        };
      }

      // Payments
      const payTier = Math.random();
      const paidUpto = (stat !== 'Active') ? 1 : (payTier < 0.45 ? 7 : (payTier < 0.80 ? 4 : 1));

      billingMonths.forEach((mo, mIdx) => {
        const feeKey = `${id}_${mo}_${startYr}`;
        const isPaid = mIdx < paidUpto;
        const isPart = (mIdx === paidUpto && Math.random() < 0.5);

        let feeItem = null;
        if (isPaid) {
          const rcpt = `REC-${rcptSeq++}`;
          feeItem = {
            type: 'School Fee',
            amount: tuition,
            paid: true,
            enabled: true,
            date: `${startYr}-05-10`,
            mode: 'Cash',
            receiptNo: rcpt,
            discount: 0,
            partialPaid: tuition,
            partialRemaining: 0,
            lateFee: 0
          };
          payments.push({
            receiptNo: rcpt,
            studentId: id,
            studentName: sName,
            admno,
            cls,
            section: sec,
            amount: tuition,
            baseSubtotal: tuition,
            lateFee: 0,
            discountAmt: 0,
            discountReason: '',
            mode: 'Cash',
            date: `${startYr}-05-10`,
            category: 'School Fee',
            period: `School Fee (${mo} ${startYr})`,
            session: curSession,
            paymentStatus: 'FULL PAYMENT',
            receiptDescription: `Full payment received.`,
            totalRemainingDue: 0,
            items: [{ feeKey, type: 'School Fee', period: `${mo} ${startYr}`, month: mo, year: startYr, baseAmount: tuition, paidAmount: tuition, remainingDue: 0, allocated: tuition, discount: 0, lateFee: 0 }],
            reversed: false,
            voidReason: ''
          });
        } else if (isPart) {
          const rcpt = `REC-${rcptSeq++}`;
          const partAmt = Math.round(tuition / 2);
          feeItem = {
            type: 'School Fee',
            amount: tuition,
            paid: false,
            enabled: true,
            date: `${startYr}-08-10`,
            mode: 'Online / UPI',
            receiptNo: rcpt,
            discount: 0,
            partialPaid: partAmt,
            partialRemaining: tuition - partAmt,
            lateFee: 0
          };
          payments.push({
            receiptNo: rcpt,
            studentId: id,
            studentName: sName,
            admno,
            cls,
            section: sec,
            amount: partAmt,
            baseSubtotal: tuition,
            lateFee: 0,
            discountAmt: 0,
            discountReason: '',
            mode: 'Online / UPI',
            date: `${startYr}-08-10`,
            category: 'School Fee',
            period: `School Fee (${mo} ${startYr})`,
            session: curSession,
            paymentStatus: 'PARTIAL PAYMENT',
            receiptDescription: `Partial payment received.`,
            totalRemainingDue: tuition - partAmt,
            items: [{ feeKey, type: 'School Fee', period: `${mo} ${startYr}`, month: mo, year: startYr, baseAmount: tuition, paidAmount: partAmt, remainingDue: tuition - partAmt, allocated: partAmt, discount: 0, lateFee: 0 }],
            reversed: false,
            voidReason: ''
          });
        } else {
          feeItem = {
            type: 'School Fee',
            amount: tuition,
            paid: false,
            enabled: true,
            partialPaid: 0,
            partialRemaining: tuition
          };
        }
        fees[feeKey] = [feeItem];
      });
    }
  });

  return {
    settings: {
      schoolName: 'MD Convent Public School',
      schoolAddr: 'Amanpur, Kasganj Road, Uttar Pradesh',
      schoolPhone: '9528371785',
      schoolLogo: '',
      currentSession: curSession,
      admissionPrefix: 'MDC-',
      receiptPrefix: 'REC-',
      principalName: 'Tanmay Soni'
    },
    sessions: [{ name: curSession, active: true, createdAt: `${startYr}-04-01T00:00:00.000Z` }],
    feeStructures,
    classSections,
    students,
    fees,
    feeConfig,
    payments,
    expenses: [],
    history: [],
    transport,
    nextAdm: admSeq,
    nextReceiptSeq: rcptSeq,
    nextId: sid
  };
}

const db = generateDemoDatabase(requestedCount);
fs.writeFileSync(OUTPUT_FILE_PATH, JSON.stringify(db, null, 2), 'utf8');
console.log(`Generated demo database: ${OUTPUT_FILE_PATH} with ${db.students.length} students.`);
