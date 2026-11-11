/**
 * MD CONVENT PUBLIC SCHOOL — REALISTIC LARGE DEMO DATA GENERATOR
 * ==============================================================================
 * Generates configurable, varied, reproducible, and 100% synthetic school database
 * strictly matching the schema of MDConvent_App (src/app.js & main.js).
 * ==============================================================================
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);

// Requirement: Student count randomly selected between 1,000 and 1,500
// Never fixed, never exactly 1,000 every time, never below 1,000.
function getRandomStudentCount(min = 1000, max = 1500) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

let requestedCount = null;
let outputFileName = 'demo_school_data_large.json';

args.forEach(arg => {
  if (arg.startsWith('--count=')) {
    requestedCount = parseInt(arg.split('=')[1], 10);
  } else if (arg.startsWith('--output=')) {
    outputFileName = arg.split('=')[1].trim();
  } else if (!isNaN(parseInt(arg, 10))) {
    requestedCount = parseInt(arg, 10);
  }
});

if (!requestedCount || requestedCount <= 0) {
  requestedCount = getRandomStudentCount(1000, 1500);
}

const SCRIPT_DIR = __dirname;
const OUTPUT_FILE_PATH = path.join(SCRIPT_DIR, outputFileName);

// --- EXPANDED FICTIONAL INDIAN NAMES POOL ---
const MALE_FIRST_NAMES = [
  'Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Reyansh', 'Muhammad', 'Sai',
  'Arnav', 'Aayan', 'Krishna', 'Ishan', 'Shaurya', 'Atharv', 'Advik', 'Pranav',
  'Advaith', 'Aryan', 'Dhruv', 'Kabir', 'Ritvik', 'Darsh', 'Devansh', 'Samar',
  'Shivam', 'Yash', 'Ayush', 'Aman', 'Rohan', 'Rohit', 'Vikas', 'Amit',
  'Deepak', 'Manav', 'Kunal', 'Gaurav', 'Mohit', 'Tarun', 'Harshit', 'Nikhil',
  'Rishabh', 'Harsh', 'Mayank', 'Alok', 'Sachin', 'Rahul', 'Pankaj', 'Neeraj',
  'Suraj', 'Varun', 'Kartik', 'Ansh', 'Utkarsh', 'Piyush', 'Tushar', 'Abhishek',
  'Devendra', 'Himanshu', 'Anurag', 'Deepesh', 'Chirag', 'Girish', 'Kamal', 'Lalit',
  'Manoj', 'Naveen', 'Omkar', 'Parth', 'Rajesh', 'Sandeep', 'Tanmay', 'Umesh',
  'Vineet', 'Vipul', 'Yogesh', 'Zaid', 'Bhavesh', 'Chetan', 'Dhanush', 'Eklavya'
];

const FEMALE_FIRST_NAMES = [
  'Saanvi', 'Aadya', 'Kiara', 'Diya', 'Pihu', 'Prisha', 'Ananya', 'Fatima',
  'Sanvi', 'Samaira', 'Myra', 'Pari', 'Riya', 'Aadhya', 'Ira', 'Avani',
  'Navya', 'Kashvi', 'Siya', 'Meera', 'Sara', 'Tanvi', 'Riddhi', 'Shreya',
  'Sneha', 'Pooja', 'Priya', 'Neha', 'Ritu', 'Anjali', 'Simran', 'Divya',
  'Muskan', 'Komal', 'Payal', 'Swati', 'Jyoti', 'Kavita', 'Sunita', 'Pinki',
  'Renu', 'Khushi', 'Dolly', 'Aarti', 'Kajal', 'Manshi', 'Garima', 'Bhavna',
  'Barkha', 'Chhavi', 'Disha', 'Ekta', 'Gunjan', 'Harsha', 'Ishita', 'Jaya',
  'Kusum', 'Lavanya', 'Mahima', 'Nandini', 'Pallavi', 'Rashmi', 'Sonal', 'Tanya'
];

const SURNAMES = [
  'Sharma', 'Verma', 'Gupta', 'Singh', 'Yadav', 'Soni', 'Agarwal', 'Mishra',
  'Tiwari', 'Chauhan', 'Rajput', 'Saxena', 'Dubey', 'Pandey', 'Kumar', 'Kashyap',
  'Lodhi', 'Baghel', 'Gautam', 'Maurya', 'Pal', 'Prajapati', 'Dixit', 'Upadhyay',
  'Varshney', 'Maheshwari', 'Bansal', 'Goel', 'Jain', 'Khandelwal', 'Joshi',
  'Rathore', 'Chaudhary', 'Shukla', 'Bhatt', 'Nagar', 'Tomar', 'Solanki'
];

const FATHER_FIRST_NAMES = [
  'Rajesh', 'Mukesh', 'Suresh', 'Ramesh', 'Dinesh', 'Naresh', 'Satish', 'Harish',
  'Vinod', 'Pramod', 'Ashok', 'Manoj', 'Sunil', 'Anil', 'Sanjay', 'Ajay',
  'Vijay', 'Rakesh', 'Santosh', 'Brijesh', 'Mahendra', 'Devendra', 'Narendra',
  'Gopal', 'Kishore', 'Praveen', 'Rajendra', 'Shailendra', 'Virendra', 'Surendra'
];

const MOTHER_FIRST_NAMES = [
  'Sunita', 'Anita', 'Geeta', 'Seema', 'Rekha', 'Usha', 'Saroj', 'Shanti',
  'Kamlesh', 'Vimla', 'Sushila', 'Meena', 'Mamta', 'Neelam', 'Pushpa', 'Savitri',
  'Radha', 'Maya', 'Kiran', 'Santosh', 'Manju', 'Asha', 'Sudha', 'Rajni',
  'Shashi', 'Madhu', 'Chitra', 'Alka', 'Anju', 'Babita', 'Kalpana', 'Kusum'
];

const LOCALITIES = [
  'Mohalla Chobdar, Amanpur', 'Near Old Post Office, Amanpur', 'Railway Station Road, Kasganj',
  'Bilram Gate, Kasganj', 'Main Market, Sahawar', 'Mohanpur Tiraha, Sahawar Road',
  'Near Gandhi Murti, Ganjdundwara', 'Patiali Crossing, Ganjdundwara', 'Village Dholna, Kasganj',
  'Near Primary Health Centre, Bilram', 'Nai Basti, Amanpur Road', 'Sujawalpur Road, Ganjdundwara',
  'Siddhpura Crossing, Kasganj', 'Soron Gate Road, Kasganj', 'Mandi Samiti Road, Amanpur',
  'Ganjdundwara Railway Road', 'Police Line Road, Kasganj', 'Gandhi Nagar, Sahawar'
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

// Synthetic SVG Avatar Generator for optional photos
function generateSyntheticAvatar(name, isMale) {
  const bgColors = ['#4F46E5', '#7C3AED', '#2563EB', '#0D9488', '#059669', '#D97706'];
  const bg = randomChoice(bgColors);
  const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="${bg}"/><text x="50" y="62" font-family="Segoe UI,Arial,sans-serif" font-size="38" font-weight="bold" fill="#ffffff" text-anchor="middle">${initials}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

function generateDemoDatabase(count) {
  if (count < 50 || count > 10000) throw new Error('Student count must be between 50 and 10000');
  const curSession = '2026–27';
  const startYr = 2026;

  // 1. Fee structures across 15 classes
  const feeStructures = {};
  CLASSES.forEach((c, idx) => {
    const tuition = idx < 3 ? 350 : idx < 8 ? 400 : idx < 11 ? 450 : idx < 13 ? 500 : 550;
    feeStructures[c] = { tuition, transport: 300, admission: 500, examFee: 200 };
  });

  // 2. Sections per class: Multiple sections (A, B, and C)
  const classSections = {};
  CLASSES.forEach(c => {
    classSections[c] = [
      { name: 'A', teacher: `Teacher ${c}-A` },
      { name: 'B', teacher: `Teacher ${c}-B` },
      { name: 'C', teacher: `Teacher ${c}-C` }
    ];
  });

  // 3. Transport routes and pickup stops
  const transportStops = [
    { id: 'stop_kasganj_01', name: 'Kasganj Bypass', route: 'Route 1 - Kasganj Express', distance: '14 km', fee: 550, effectiveFrom: 'April', active: true },
    { id: 'stop_kasganj_02', name: 'Dholna Tiraha', route: 'Route 1 - Kasganj Express', distance: '10 km', fee: 450, effectiveFrom: 'April', active: true },
    { id: 'stop_kasganj_03', name: 'Bilram Gate', route: 'Route 1 - Kasganj Express', distance: '8 km', fee: 400, effectiveFrom: 'April', active: true },
    { id: 'stop_sahawar_01', name: 'Sahawar Bus Stand', route: 'Route 2 - Sahawar Feeder', distance: '12 km', fee: 500, effectiveFrom: 'April', active: true },
    { id: 'stop_sahawar_02', name: 'Mohanpur Turn', route: 'Route 2 - Sahawar Feeder', distance: '9 km', fee: 450, effectiveFrom: 'April', active: true },
    { id: 'stop_ganj_01', name: 'Ganjdundwara Road', route: 'Route 3 - Ganjdundwara', distance: '15 km', fee: 600, effectiveFrom: 'April', active: true },
    { id: 'stop_local_01', name: 'Amanpur Station Road', route: 'Route 4 - Local Amanpur', distance: '3 km', fee: 300, effectiveFrom: 'April', active: true },
    { id: 'stop_soron_01', name: 'Soron Road Tiraha', route: 'Route 5 - Soron Connect', distance: '18 km', fee: 700, effectiveFrom: 'April', active: true }
  ];

  const transport = { stops: transportStops, assignments: {}, payments: [], nextReceiptSeq: 1 };

  // 4. Distribute students naturally across 15 classes
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
  let trRcptSeq = 101;
  let srSeq = 101;
  const billingMonths = ['April', 'May', 'June', 'July', 'August', 'September', 'October'];

  // Track unique IDs and numbers to strictly guarantee no duplicates
  const usedAdmNos = new Set();
  const usedSrNos = new Set();
  const usedReceiptNos = new Set();

  CLASSES.forEach(cls => {
    const n = classAllocations[cls];
    let rA = 1, rB = 1, rC = 1;
    for (let i = 0; i < n; i++) {
      const id = sid++;
      const isMale = Math.random() > 0.48;
      const fn = isMale ? randomChoice(MALE_FIRST_NAMES) : randomChoice(FEMALE_FIRST_NAMES);
      const ln = randomChoice(SURNAMES);
      const sName = `${fn} ${ln}`;
      const fName = `${randomChoice(FATHER_FIRST_NAMES)} ${ln}`;
      const mName = `${randomChoice(MOTHER_FIRST_NAMES)} Devi`;

      // 3 sections: A, B, C
      const secChoice = i % 3;
      const sec = secChoice === 0 ? 'A' : (secChoice === 1 ? 'B' : 'C');
      const roll = String(sec === 'A' ? rA++ : (sec === 'B' ? rB++ : rC++));

      const age = CLASS_AGE_MAP[cls] || 10;
      const dob = `${startYr - age}-${String(randomInt(1, 12)).padStart(2, '0')}-${String(randomInt(1, 28)).padStart(2, '0')}`;
      
      const admno = `MDC-${admSeq++}`;
      usedAdmNos.add(admno);

      // Unique optional SR Number (present for ~75% of students)
      let srNo = '';
      if (Math.random() < 0.75) {
        srNo = `SR-${srSeq++}`;
        usedSrNos.add(srNo);
      }

      // Status: Active (91%), Inactive (5%), Left School (4%)
      const statRand = Math.random();
      const stat = statRand < 0.91 ? 'Active' : (statRand < 0.96 ? 'Inactive' : 'Left School');
      const phone = '98' + String(randomInt(10000000, 99999999));

      // Optional student photo (present for ~20% of students)
      const hasPhoto = Math.random() < 0.20;
      const photo = hasPhoto ? generateSyntheticAvatar(sName, isMale) : '';

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
        photo,
        academicHistory: [],
        enrollments: [{ session: curSession, cls, section: sec, rollno: roll, status: stat, enrolledAt: `${startYr - 1}-04-05` }]
      };
      students.push(st);

      const tuition = feeStructures[cls].tuition;
      const usesTr = (stat === 'Active' && Math.random() < 0.32);

      // Previous session arrears for ~10% of students
      const hasPreviousArrears = Math.random() < 0.10;
      const previousArrears = hasPreviousArrears ? randomChoice([400, 750, 1200, 1850]) : 0;

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
        previousArrears,
        advanceBalance: 0
      };

      // Transport Assignment
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

        // Create genuine transport payments for some enrolled students
        if (Math.random() < 0.60) {
          const trRcpt = `TR-REC-${trRcptSeq++}`;
          usedReceiptNos.add(trRcpt);
          const trPaidMonths = ['April', 'May'];
          const trAmount = stop.fee * trPaidMonths.length;
          transport.payments.push({
            id: `TR-PAY-${id}`,
            studentId: id,
            studentName: sName,
            admno,
            receiptNo: trRcpt,
            date: `${startYr}-05-15`,
            amount: trAmount,
            baseRate: stop.fee,
            discount: 0,
            mode: randomChoice(PAYMENT_MODES),
            months: trPaidMonths,
            remainingDue: 0
          });
        }
      }

      // Fee Payments Distribution:
      // ~45% Fully Paid through current month
      // ~30% Partially Paid or Paid few months
      // ~25% Defaulters with pending dues
      const payTier = Math.random();
      const paidUpto = (stat !== 'Active') ? 1 : (payTier < 0.45 ? billingMonths.length : (payTier < 0.75 ? 3 : 0));

      billingMonths.forEach((mo, mIdx) => {
        const feeKey = `${id}_${mo}_${startYr}`;
        const isPaid = mIdx < paidUpto;
        const isPart = (mIdx === paidUpto && Math.random() < 0.40);

        let feeItem = null;
        if (isPaid) {
          const rcpt = `REC-${rcptSeq++}`;
          usedReceiptNos.add(rcpt);
          const payMode = randomChoice(PAYMENT_MODES);
          feeItem = {
            type: 'School Fee',
            amount: tuition,
            paid: true,
            enabled: true,
            date: `${startYr}-05-10`,
            mode: payMode,
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
            mode: payMode,
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
          usedReceiptNos.add(rcpt);
          const partAmt = Math.round(tuition / 2);
          const payMode = randomChoice(PAYMENT_MODES);
          feeItem = {
            type: 'School Fee',
            amount: tuition,
            paid: false,
            enabled: true,
            date: `${startYr}-08-10`,
            mode: payMode,
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
            mode: payMode,
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
    nextId: sid,
    metadata: {
      generator: 'MD Convent SMS Synthetic Demo Engine v2.0',
      generatedAt: new Date().toISOString(),
      studentCount: students.length,
      isFictionalDemoData: true
    }
  };
}

console.log(`[Demo Generator] Selected random target student count: ${requestedCount}`);
const db = generateDemoDatabase(requestedCount);
fs.writeFileSync(OUTPUT_FILE_PATH, JSON.stringify(db, null, 2), 'utf8');

const fileSizeMB = (fs.statSync(OUTPUT_FILE_PATH).size / (1024 * 1024)).toFixed(2);
console.log(`[Demo Generator] SUCCESS: Created ${OUTPUT_FILE_PATH}`);
console.log(`[Demo Generator] Total Students: ${db.students.length}`);
console.log(`[Demo Generator] Total Payments: ${db.payments.length}`);
console.log(`[Demo Generator] File Size: ${fileSizeMB} MB`);
