// ============================================================
// SCHOOL MANAGEMENT SYSTEM - ENTERPRISE CORE LOGIC (v2.0)
// Fully Offline, Multi-School Configurable, Safe Migration
// ============================================================

const CLASSES = ['NC', 'LKG', 'UKG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
const MONTHS_LIST = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March'];
const SYS_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const isEl = !!window.electronAPI;
let svT = null;
let curFSid = null;
let curPayFeeIndex = null;
let selClassForSections = 'NC';
let curSummaryMonthKey = null; // Independent state for Month-wise Collection Summary filter e.g. "October_2026"
let pendingPaymentData = null; // For payment confirmation summary modal before final commit
let curVoidReceiptNo = null;   // Active receipt number selected for void reversal
let activeReceiptNo = null;    // Current receipt number for printing (A4 / Thermal)
let curDailyFilter = 'today';  // Active shortcut for Daily Collection Report

// Helper: Parse session string (e.g. "2026–27" or "2026-27") into [startYear, endYear]
function parseSessionYears(sessStr) {
  const s = String(sessStr || '2026–27');
  const nums = s.match(/\d{4}/g);
  if (nums && nums.length >= 2) {
    return [parseInt(nums[0]), parseInt(nums[1])];
  }
  if (nums && nums.length === 1) {
    const yr = parseInt(nums[0]);
    return [yr, yr + 1];
  }
  return [2026, 2027];
}

// Helper: Escape HTML special characters for safe markup insertion
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Helper: Get chronological sort key (year * 100 + monthIndex)
function getFeeYearMonthSortKey(mo, yr) {
  const y = parseInt(yr) || 0;
  const mIdx = MONTHS_LIST.indexOf(mo);
  const sysIdx = mIdx >= 0 ? (mIdx < 9 ? mIdx + 4 : mIdx - 8) : 1;
  return y * 100 + sysIdx;
}

// Helper: Map a (month, year) billing period to its academic session string (e.g. April 2026 -> "2026–27", March 2027 -> "2026–27")
function getAcademicSessionForPeriod(mo, yr) {
  const y = parseInt(yr);
  if (isNaN(y)) return '';
  const mIdx = MONTHS_LIST.indexOf(mo);
  if (mIdx < 0) return '';
  // April..December belong to start year y (e.g., April 2026 belongs to 2026–27)
  // January..March belong to session starting in (y - 1) (e.g., March 2027 belongs to 2026–27)
  const startY = (mIdx < 9) ? y : y - 1;
  const endY = startY + 1;
  const endSuffix = String(endY).slice(-2);
  return `${startY}–${endSuffix}`;
}

// Helper: Determine if a fee for (month, year) belongs to the specified academic session
function isFeeInAcademicSession(mo, yr, sessionStr) {
  const [startY, endY] = parseSessionYears(sessionStr);
  const y = parseInt(yr);
  if (isNaN(y)) return false;
  const mIdx = MONTHS_LIST.indexOf(mo);
  if (mIdx < 0) return false;

  // April..December must have year === startY
  if (mIdx < 9) return y === startY;
  // January..March must have year === endY
  return y === endY;
}

// Helper: Determine if a fee for (month, year) is currently overdue/due for the current academic session
function isFeeRecordCurrentlyDue(mo, yr, currentSessionStr = null) {
  const sess = currentSessionStr || (DB.settings && DB.settings.currentSession) || '2026–27';
  const [startY, endY] = parseSessionYears(sess);
  const y = parseInt(yr);
  if (isNaN(y)) return false;

  const mIdx = MONTHS_LIST.indexOf(mo);
  if (mIdx < 0) return false;

  // STRICT RULE: The current-session pending dues must ONLY include records
  // that belong to the active academic session (April startY through March endY).
  // Historical sessions (earlier years) and future sessions (later years) are excluded.
  if (!isFeeInAcademicSession(mo, y, sess)) {
    return false;
  }

  // Session must have reached its configured start date or be active
  if (!hasAcademicSessionStarted(sess)) {
    return false;
  }

  // For the current academic session, check if the billing month has arrived according to today's date.
  const today = new Date();
  const curCalYear = today.getFullYear();
  const curCalMonthIdx = today.getMonth(); // 0 = Jan, 3 = April, 9 = Oct

  // Sort key comparison:
  const feeSortKey = getFeeYearMonthSortKey(mo, y);
  const currentSortKey = curCalYear * 100 + (curCalMonthIdx + 1);

  // If the fee billing month has arrived or passed in current calendar time, it is due
  return feeSortKey <= currentSortKey;
}

// Helper: Determine accurate status for a fee obligation ('Paid', 'Partial', 'Due', 'Overdue', 'Upcoming')
function getFeePeriodStatus(feeObj, mo, yr, sessionStr = null) {
  if (feeObj && feeObj.paid) {
    return { status: 'Paid', label: 'Paid ✓', chipClass: 'cg', isUpcoming: false, isDue: false, isOverdue: false, isPaid: true, isPartial: false };
  }
  const amt = Number(feeObj?.amount) || 0;
  const disc = Number(feeObj?.discount) || 0;
  const partialPaid = Number(feeObj?.partialPaid) || 0;
  const rem = (feeObj?.partialRemaining !== undefined && feeObj?.partialRemaining !== null)
    ? Number(feeObj.partialRemaining)
    : Math.max(0, amt - disc - partialPaid);

  if ((partialPaid > 0 || disc > 0) && rem > 0) {
    return {
      status: 'Partial',
      label: `Partial (₹${rem.toLocaleString('en-IN')})`,
      chipClass: 'cy',
      isUpcoming: false,
      isDue: true,
      isOverdue: false,
      isPaid: false,
      isPartial: true,
      remainingAmount: rem
    };
  }

  const sess = sessionStr || (DB.settings && DB.settings.currentSession) || '2026–27';
  const today = new Date();
  const curCalYear = today.getFullYear();
  const curCalMonthIdx = today.getMonth(); // 0 = Jan, 9 = Oct
  const feeSortKey = getFeeYearMonthSortKey(mo, yr);
  const currentMonthSortKey = curCalYear * 100 + (curCalMonthIdx + 1);

  if (!hasAcademicSessionStarted(sess) || feeSortKey > currentMonthSortKey) {
    return { status: 'Upcoming', label: 'Upcoming', chipClass: 'cgr', isUpcoming: true, isDue: false, isOverdue: false, isPaid: false, isPartial: false };
  } else if (feeSortKey === currentMonthSortKey) {
    return { status: 'Due', label: 'Due', chipClass: 'cr', isUpcoming: false, isDue: true, isOverdue: false, isPaid: false, isPartial: false };
  } else {
    return { status: 'Overdue', label: 'Overdue', chipClass: 'cr', isUpcoming: false, isDue: true, isOverdue: true, isPaid: false, isPartial: false };
  }
}

// Helper: Check if an exam fee for student, month, year has already been paid (prevent duplicate charging)
function isExamFeeAlreadyPaid(studentId, mo, yr) {
  const key = `${studentId}_${mo}_${yr}`;
  const fees = DB.fees && DB.fees[key];
  if (Array.isArray(fees)) {
    const ef = fees.find(f => f.type === 'Exam Fee');
    if (ef && ef.paid) return true;
  }
  if (Array.isArray(DB.payments)) {
    const hasPaid = DB.payments.some(p =>
      !p.reversed &&
      String(p.studentId) === String(studentId) &&
      Array.isArray(p.items) &&
      p.items.some(it => it.type === 'Exam Fee' && it.month === mo && Number(it.year) === Number(yr))
    );
    if (hasPaid) return true;
  }
  return false;
}

// Helper: Get admission fee payment record for a student in a specific academic session
function getStudentAdmissionFeePaymentRecord(studentId, sessionStr = null) {
  const curSess = sessionStr || (DB.settings && DB.settings.currentSession) || '2026–27';
  let record = null;

  // 1. Check DB.fees records for curSess
  Object.entries(DB.fees || {}).forEach(([k, arr]) => {
    if (record) return;
    if (k.startsWith(studentId + '_') && Array.isArray(arr)) {
      const parts = k.split('_');
      if (isFeeInAcademicSession(parts[1], parts[2], curSess)) {
        const af = arr.find(f => {
          if (f.type !== 'Admission Fee' || !f.paid) return false;
          if (f.receiptNo && Array.isArray(DB.payments)) {
            const isRev = DB.payments.some(p => p.receiptNo === f.receiptNo && p.reversed);
            if (isRev) return false;
          }
          return true;
        });
        if (af) {
          record = {
            paid: true,
            receiptNo: af.receiptNo || '–',
            date: af.date || '–',
            amount: Number(af.amount) || 0,
            mode: af.mode || 'Cash'
          };
        }
      }
    }
  });

  // 2. Check DB.payments transactions specifically for curSess
  if (!record && Array.isArray(DB.payments)) {
    const p = DB.payments.find(p => {
      if (p.reversed) return false;
      if (String(p.studentId) !== String(studentId)) return false;
      const sessMatches = p.session ? (p.session === curSess || p.session.replace(/[-–]/g, '-') === curSess.replace(/[-–]/g, '-')) : false;

      if (Array.isArray(p.items) && p.items.length > 0) {
        return p.items.some(it => {
          if (it.type !== 'Admission Fee') return false;
          if (sessMatches) return true;
          if (it.year) return isFeeInAcademicSession(it.month || 'April', it.year, curSess);
          if (p.date) {
            const yr = parseInt(p.date.split('-')[0]);
            return isFeeInAcademicSession(p.month || 'April', yr, curSess);
          }
          return false;
        });
      }

      if (p.category === 'Admission Fee') {
        if (sessMatches) return true;
        if (p.year) return isFeeInAcademicSession(p.month || 'April', p.year, curSess);
        if (p.date) {
          const yr = parseInt(p.date.split('-')[0]);
          return isFeeInAcademicSession(p.month || 'April', yr, curSess);
        }
      }

      return false;
    });

    if (p) {
      const admItem = Array.isArray(p.items) ? p.items.find(it => it.type === 'Admission Fee') : null;
      record = {
        paid: true,
        receiptNo: p.receiptNo || '–',
        date: p.date || '–',
        amount: admItem ? (Number(admItem.paidAmount) || Number(admItem.baseAmount) || Number(p.amount)) : Number(p.amount),
        mode: p.mode || 'Cash'
      };
    }
  }

  return record;
}

// Helper: Check if an admission fee has already been paid for the active academic session
function isAdmissionFeeAlreadyPaid(studentId, sessionStr = null) {
  return getStudentAdmissionFeePaymentRecord(studentId, sessionStr) !== null;
}

// Helper: Determine if an academic session has reached its configured start date or is currently active
function hasAcademicSessionStarted(sessionStr, todayStr = null) {
  if (!sessionStr) return false;
  const curActiveSess = (DB.settings && DB.settings.currentSession) || '2026–27';
  const normSess = String(sessionStr).replace(/[-–]/g, '-');
  const normActive = String(curActiveSess).replace(/[-–]/g, '-');

  // If this session is the currently active academic session, it is active/started
  if (normSess === normActive) return true;

  // Check configured session start date in DB.sessions
  const sessObj = (DB.sessions || []).find(x => x.name && String(x.name).replace(/[-–]/g, '-') === normSess);
  let startDate = '';
  if (sessObj && sessObj.startDate) {
    startDate = sessObj.startDate;
  } else {
    const [startY] = parseSessionYears(sessionStr);
    startDate = `${startY}-04-01`;
  }

  const today = todayStr || new Date().toISOString().split('T')[0];
  return today >= startDate;
}

// Helper: Determine accurate status for a student's admission fee in an academic session
function getStudentAdmissionFeeStatus(studentId, sessionStr = null, todayStr = null) {
  const s = (DB.students || []).find(x => String(x.id) === String(studentId));
  const curSess = sessionStr || s?.session || (DB.settings && DB.settings.currentSession) || '2026–27';
  const cfg = s ? getStudentFeeConfig(s.id) : {};
  const struct = (s && DB.feeStructures && DB.feeStructures[s.cls]) ? DB.feeStructures[s.cls] : { admission: 500 };
  const totalAmt = (cfg.customAdmission !== null && cfg.customAdmission !== undefined && cfg.customAdmission !== '' && !isNaN(Number(cfg.customAdmission)))
    ? Number(cfg.customAdmission) : (struct.admission || 500);

  if (cfg.admission === false) {
    return {
      status: 'N/A',
      label: 'N/A',
      color: 'var(--txt2)',
      chipClass: 'cgr',
      isUpcoming: false,
      isDue: false,
      isPaid: false,
      isPartial: false,
      amount: 0,
      remainingAmount: 0,
      receiptNo: '–'
    };
  }

  // 1. Check for valid payment record
  const payRecord = getStudentAdmissionFeePaymentRecord(studentId, curSess);
  if (payRecord && payRecord.paid) {
    return {
      status: 'Paid',
      label: 'Paid ✓',
      color: 'var(--grn)',
      chipClass: 'cg',
      isUpcoming: false,
      isDue: false,
      isPaid: true,
      isPartial: false,
      amount: payRecord.amount || totalAmt,
      remainingAmount: 0,
      receiptNo: payRecord.receiptNo || '–',
      date: payRecord.date || '',
      mode: payRecord.mode || 'Cash'
    };
  }

  // 2. Check for partial payment in DB.fees
  const [startY] = parseSessionYears(curSess);
  const feeKey = `${studentId}_April_${startY}`;
  const feesArr = DB.fees && DB.fees[feeKey];
  let partialPaid = 0;
  let partialRem = totalAmt;
  let partialReceipt = '–';

  if (Array.isArray(feesArr)) {
    const af = feesArr.find(f => f.type === 'Admission Fee');
    if (af) {
      if (Number(af.partialPaid) > 0 && !af.paid) {
        partialPaid = Number(af.partialPaid);
        partialRem = (af.partialRemaining !== undefined && af.partialRemaining !== null)
          ? Number(af.partialRemaining)
          : Math.max(0, totalAmt - partialPaid);
        if (af.receiptNo) partialReceipt = af.receiptNo;
      }
    }
  }

  if (partialPaid > 0 && partialRem > 0) {
    return {
      status: 'Partial',
      label: `Partial (₹${partialRem.toLocaleString('en-IN')})`,
      color: 'var(--ylw)',
      chipClass: 'cy',
      isUpcoming: false,
      isDue: true,
      isPaid: false,
      isPartial: true,
      amount: totalAmt,
      paidAmount: partialPaid,
      remainingAmount: partialRem,
      receiptNo: partialReceipt
    };
  }

  // 3. Check if academic session has started using configured session start date
  const started = hasAcademicSessionStarted(curSess, todayStr);
  if (!started) {
    return {
      status: 'Upcoming',
      label: 'Upcoming',
      color: 'var(--txt2)',
      chipClass: 'cb',
      isUpcoming: true,
      isDue: false,
      isPaid: false,
      isPartial: false,
      amount: totalAmt,
      remainingAmount: totalAmt,
      receiptNo: '–'
    };
  }

  // 4. Session is active or has reached its start date and fee is unpaid => Due
  return {
    status: 'Due',
    label: 'Due',
    color: 'var(--red)',
    chipClass: 'cr',
    isUpcoming: false,
    isDue: true,
    isPaid: false,
    isPartial: false,
    amount: totalAmt,
    remainingAmount: totalAmt,
    receiptNo: '–'
  };
}

// Helper: Get structured academic session enrollments for a student
function getStudentEnrollments(s) {
  if (!s) return [];
  if (!Array.isArray(s.enrollments)) s.enrollments = [];

  // Reconcile from academicHistory: process chronologically so later promotions update prior classes
  if (Array.isArray(s.academicHistory) && s.academicHistory.length > 0) {
    const sortedHist = [...s.academicHistory].sort((a, b) => {
      const tA = a.promotedDate ? new Date(a.promotedDate).getTime() : 0;
      const tB = b.promotedDate ? new Date(b.promotedDate).getTime() : 0;
      return tA - tB;
    });

    sortedHist.forEach(h => {
      if (!h.session) return;
      const existing = s.enrollments.find(e => e.session === h.session);
      if (existing) {
        // Update to the latest verified class and section from academicHistory
        if (h.cls) existing.cls = h.cls;
        if (h.section) existing.section = h.section;
        if (h.promotedDate) existing.enrolledAt = h.promotedDate;
        if (existing.status !== 'Repeated' && existing.status !== 'Left School') {
          existing.status = 'Promoted';
        }
      } else {
        s.enrollments.push({
          session: h.session,
          cls: h.cls,
          section: h.section || 'A',
          status: 'Promoted',
          enrolledAt: h.promotedDate || s.admissionDate || new Date().toISOString()
        });
      }
    });
  }

  // Ensure current active enrollment is present
  const curSess = s.session || (DB.settings && DB.settings.currentSession) || '2026–27';
  let curEnr = s.enrollments.find(e => e.session === curSess);
  if (!curEnr) {
    curEnr = {
      session: curSess,
      cls: s.cls,
      section: s.section || 'A',
      status: s.status || 'Active',
      enrolledAt: s.admissionDate || new Date().toISOString()
    };
    s.enrollments.push(curEnr);
  } else {
    if (s.cls) curEnr.cls = s.cls;
    if (s.section) curEnr.section = s.section;
    curEnr.status = s.status || 'Active';
  }

  // Deduplicate enrollments by session keeping the latest verified record
  const deduped = new Map();
  s.enrollments.forEach(e => {
    if (e.session) deduped.set(e.session, e);
  });
  s.enrollments = Array.from(deduped.values());

  // Sort enrollments chronologically
  s.enrollments.sort((a, b) => {
    const [stA] = parseSessionYears(a.session);
    const [stB] = parseSessionYears(b.session);
    return (stA || 0) - (stB || 0);
  });

  return s.enrollments;
}

// Helper: Determine the start year of student's admission session
function getStudentAdmissionSessionYears(s) {
  if (!s) return 2026;
  const curSess = (DB.settings && DB.settings.currentSession) || '2026–27';
  const [curStartY] = parseSessionYears(curSess);

  if (s.admissionDate) {
    const d = new Date(s.admissionDate);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = d.getMonth(); // 0=Jan..2=Mar, 3=Apr...
      return m >= 3 ? y : y - 1;
    }
  }
  if (Array.isArray(s.enrollments) && s.enrollments.length > 0) {
    const enrStarts = s.enrollments.map(e => {
      const [st] = parseSessionYears(e.session);
      return isNaN(st) ? Infinity : st;
    });
    const minEnr = Math.min(...enrStarts);
    if (minEnr !== Infinity) return minEnr;
  }
  if (Array.isArray(s.academicHistory) && s.academicHistory.length > 0) {
    const pastStarts = s.academicHistory.map(h => {
      const [st] = parseSessionYears(h.session);
      return isNaN(st) ? Infinity : st;
    });
    const minPast = Math.min(...pastStarts);
    if (minPast !== Infinity) return minPast;
  }
  if (s.session) {
    const [adStart] = parseSessionYears(s.session);
    if (!isNaN(adStart)) return adStart;
  }
  return curStartY;
}

// Helper: Determine if a billing period (mo, yr) is a valid fee obligation for a student
function isPeriodValidForStudent(s, mo, yr) {
  if (!s) return false;
  const curSess = (DB.settings && DB.settings.currentSession) || '2026–27';
  const studentSess = s.session || curSess;
  const y = parseInt(yr);
  if (isNaN(y)) return false;
  const mIdx = MONTHS_LIST.indexOf(mo);
  if (mIdx < 0) return false;

  // 1. Full Academic Session Rule:
  // For the student's active enrolled session, all 12 months (April–March) are valid fee obligations
  if (isFeeInAcademicSession(mo, y, studentSess)) {
    return true;
  }

  // Also valid for the application's global active session
  if (isFeeInAcademicSession(mo, y, curSess)) {
    return true;
  }

  // 2. Historical academic session rules (prior to student/active session)
  const [curStartY] = parseSessionYears(curSess);
  const [stStartY] = parseSessionYears(studentSess);
  const minActiveStart = Math.min(curStartY, stStartY);

  const feeStartY = (mIdx < 9) ? y : y - 1;
  if (feeStartY < minActiveStart) {
    const sessLabel = `${feeStartY}–${String(feeStartY + 1).slice(-2)}`;
    const sessLabelAlt = `${feeStartY}-${String(feeStartY + 1).slice(-2)}`;
    const studentPastSessions = (s.academicHistory || []).map(h => h.session).filter(Boolean);
    if (Array.isArray(s.enrollments)) {
      s.enrollments.forEach(e => { if (e.session) studentPastSessions.push(e.session); });
    }
    const admStartY = getStudentAdmissionSessionYears(s);
    const isVerified = studentPastSessions.some(ps => ps === sessLabel || ps === sessLabelAlt) || (admStartY <= feeStartY);
    if (!isVerified) {
      return false;
    }
    const key = `${s.id}_${mo}_${y}`;
    return DB.fees && Array.isArray(DB.fees[key]) && DB.fees[key].length > 0;
  }

  // Outside active session and no valid saved records
  return false;
}

// ============================================================
// CONSECUTIVE MONTH & PERIOD GROUPING HELPERS
// ============================================================
function areMonthsConsecutive(mo1, yr1, mo2, yr2) {
  const y1 = parseInt(yr1);
  const y2 = parseInt(yr2);
  const idx1 = MONTHS_LIST.indexOf(mo1);
  const idx2 = MONTHS_LIST.indexOf(mo2);
  if (idx1 < 0 || idx2 < 0 || isNaN(y1) || isNaN(y2)) return false;

  // April through November (indices 0..7) -> Next month is in the same year
  if (idx1 < 8) {
    return idx2 === idx1 + 1 && y2 === y1;
  }
  // December (index 8) -> Next month is January (index 9) in the following calendar year
  else if (idx1 === 8) {
    return idx2 === 9 && y2 === y1 + 1;
  }
  // January through February (indices 9..10) -> Next month is in the same calendar year
  else if (idx1 < 11) {
    return idx2 === idx1 + 1 && y2 === y1;
  }
  return false;
}

function formatConsecutivePeriodRange(startMo, startYr, endMo, endYr) {
  const y1 = parseInt(startYr);
  const y2 = parseInt(endYr);
  if (startMo === endMo && y1 === y2) {
    return `${startMo} ${y1}`;
  }
  if (y1 === y2) {
    return `${startMo.slice(0, 3)}–${endMo.slice(0, 3)} ${y1}`;
  }
  return `${startMo.slice(0, 3)} ${y1}–${endMo.slice(0, 3)} ${y2}`;
}

function groupFeeItemsByPeriod(items) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const schoolItems = [];
  const otherItems = [];

  items.forEach(it => {
    const isSchool = it.type === 'School Fee' || it.type === 'Tuition Fee' || it.type === 'Tuition';
    if (isSchool && it.month && it.year) {
      schoolItems.push(it);
    } else {
      otherItems.push(it);
    }
  });

  const grouped = [];

  if (schoolItems.length > 0) {
    // Sort school fee items by academic session order
    schoolItems.sort((a, b) => {
      const yA = parseInt(a.year) || 0;
      const yB = parseInt(b.year) || 0;
      if (yA !== yB) return yA - yB;
      return MONTHS_LIST.indexOf(a.month) - MONTHS_LIST.indexOf(b.month);
    });

    let currentGroup = null;

    schoolItems.forEach(it => {
      const itAmt = Number(it.paidAmount !== undefined ? it.paidAmount : (it.baseAmount !== undefined ? it.baseAmount : it.amount)) || 0;
      if (!currentGroup) {
        currentGroup = {
          type: 'School Fee',
          startMo: it.month,
          startYr: it.year,
          endMo: it.month,
          endYr: it.year,
          amount: itAmt,
          months: [it.month]
        };
      } else {
        if (areMonthsConsecutive(currentGroup.endMo, currentGroup.endYr, it.month, it.year)) {
          currentGroup.endMo = it.month;
          currentGroup.endYr = it.year;
          currentGroup.amount += itAmt;
          currentGroup.months.push(it.month);
        } else {
          currentGroup.period = formatConsecutivePeriodRange(currentGroup.startMo, currentGroup.startYr, currentGroup.endMo, currentGroup.endYr);
          grouped.push(currentGroup);
          currentGroup = {
            type: 'School Fee',
            startMo: it.month,
            startYr: it.year,
            endMo: it.month,
            endYr: it.year,
            amount: itAmt,
            months: [it.month]
          };
        }
      }
    });

    if (currentGroup) {
      currentGroup.period = formatConsecutivePeriodRange(currentGroup.startMo, currentGroup.startYr, currentGroup.endMo, currentGroup.endYr);
      grouped.push(currentGroup);
    }
  }

  otherItems.forEach(it => {
    const itAmt = Number(it.paidAmount !== undefined ? it.paidAmount : (it.baseAmount !== undefined ? it.baseAmount : it.amount)) || 0;
    let periodText = '';
    if (it.month && it.year) {
      periodText = `${it.month} ${it.year}`;
    } else {
      periodText = it.period || it.type || '–';
    }
    grouped.push({
      type: it.type || 'Fee',
      period: periodText,
      amount: itAmt,
      original: it
    });
  });

  return grouped;
}

function getTransactionSummaryPeriod(tx) {
  if (Array.isArray(tx.items) && tx.items.length > 0) {
    const grp = groupFeeItemsByPeriod(tx.items);
    if (grp.length === 1) {
      return grp[0].period;
    }
    return grp.map(g => {
      if (g.type === 'School Fee') return g.period;
      if (g.type === 'Exam Fee') return `Exam (${g.period})`;
      if (g.type === 'Admission Fee') return `Adm (${g.period})`;
      if (g.type === 'Previous Arrears' || g.type === 'Previous Session Arrears') return 'Arrears';
      return g.period;
    }).join(', ');
  }
  return tx.period || '–';
}

function groupPendingFeeDues(rawRows) {
  if (!Array.isArray(rawRows) || rawRows.length === 0) return [];
  const studentMap = new Map();
  rawRows.forEach(r => {
    if (!studentMap.has(r.studentId)) {
      studentMap.set(r.studentId, []);
    }
    studentMap.get(r.studentId).push(r);
  });

  const finalRows = [];

  studentMap.forEach((studentRows) => {
    const schoolRows = [];
    const otherRows = [];

    studentRows.forEach(r => {
      if ((r.feeType === 'School Fee' || r.feeType === 'Tuition Fee') && !r.isArrears && r.mo && r.yr) {
        schoolRows.push(r);
      } else {
        otherRows.push(r);
      }
    });

    if (schoolRows.length > 0) {
      schoolRows.sort((a, b) => {
        const yA = parseInt(a.yr) || 0;
        const yB = parseInt(b.yr) || 0;
        if (yA !== yB) return yA - yB;
        return MONTHS_LIST.indexOf(a.mo) - MONTHS_LIST.indexOf(b.mo);
      });

      let curGroup = null;

      schoolRows.forEach(sr => {
        if (!curGroup) {
          curGroup = {
            ...sr,
            startMo: sr.mo,
            startYr: sr.yr,
            endMo: sr.mo,
            endYr: sr.yr,
            amount: sr.amount,
            months: [sr.mo]
          };
        } else {
          if (areMonthsConsecutive(curGroup.endMo, curGroup.endYr, sr.mo, sr.yr)) {
            curGroup.endMo = sr.mo;
            curGroup.endYr = sr.yr;
            curGroup.amount += sr.amount;
            curGroup.months.push(sr.mo);
          } else {
            curGroup.period = formatConsecutivePeriodRange(curGroup.startMo, curGroup.startYr, curGroup.endMo, curGroup.endYr);
            curGroup.displayPeriod = curGroup.period;
            curGroup.mo = curGroup.period;
            curGroup.yr = '';
            finalRows.push(curGroup);

            curGroup = {
              ...sr,
              startMo: sr.mo,
              startYr: sr.yr,
              endMo: sr.mo,
              endYr: sr.yr,
              amount: sr.amount,
              months: [sr.mo]
            };
          }
        }
      });

      if (curGroup) {
        curGroup.period = formatConsecutivePeriodRange(curGroup.startMo, curGroup.startYr, curGroup.endMo, curGroup.endYr);
        curGroup.displayPeriod = curGroup.period;
        curGroup.mo = curGroup.period;
        curGroup.yr = '';
        finalRows.push(curGroup);
      }
    }

    otherRows.forEach(or => {
      let period = '';
      if (or.isArrears) {
        period = 'Previous Session Arrears';
      } else if (or.mo && or.yr) {
        period = `${or.mo} ${or.yr}`;
      } else {
        period = or.mo || or.feeType || '–';
      }
      finalRows.push({
        ...or,
        period: period,
        displayPeriod: period
      });
    });
  });

  return finalRows;
}

function formatFullPeriodRange(startMo, startYr, endMo, endYr) {
  const y1 = parseInt(startYr);
  const y2 = parseInt(endYr);
  if (startMo === endMo && y1 === y2) {
    return `${startMo} ${y1}`;
  }
  if (y1 === y2) {
    return `${startMo}–${endMo} ${y1}`;
  }
  return `${startMo} ${y1}–${endMo} ${y2}`;
}

function getConsolidatedPendingStudents(rawRows, targetSession = null) {
  if (!Array.isArray(rawRows) || rawRows.length === 0) return [];
  const curSess = targetSession || (DB.settings && DB.settings.currentSession) || '2026–27';

  // Group by studentId while preserving student order
  const studentMap = new Map();
  rawRows.forEach(r => {
    if (!studentMap.has(r.studentId)) {
      studentMap.set(r.studentId, []);
    }
    studentMap.get(r.studentId).push(r);
  });

  const consolidatedList = [];

  studentMap.forEach((studentRows, studentId) => {
    const s = (DB.students || []).find(st => st.id === studentId) || studentRows[0];
    const breakdown = [];
    let totalAmount = 0;
    const schoolRanges = [];

    // Separate School Fee vs Other fee items
    const schoolRows = [];
    const otherRows = [];

    studentRows.forEach(r => {
      if ((r.feeType === 'School Fee' || r.feeType === 'Tuition Fee') && !r.isArrears && r.mo && r.yr) {
        schoolRows.push(r);
      } else {
        otherRows.push(r);
      }
    });

    // 1. Group consecutive School Fee months into ranges (e.g., April–October 2026)
    if (schoolRows.length > 0) {
      schoolRows.sort((a, b) => {
        const yA = parseInt(a.yr) || 0;
        const yB = parseInt(b.yr) || 0;
        if (yA !== yB) return yA - yB;
        return MONTHS_LIST.indexOf(a.mo) - MONTHS_LIST.indexOf(b.mo);
      });

      let curGroup = null;

      schoolRows.forEach(sr => {
        if (!curGroup) {
          curGroup = {
            startMo: sr.mo,
            startYr: sr.yr,
            endMo: sr.mo,
            endYr: sr.yr,
            amount: sr.amount
          };
        } else {
          if (areMonthsConsecutive(curGroup.endMo, curGroup.endYr, sr.mo, sr.yr)) {
            curGroup.endMo = sr.mo;
            curGroup.endYr = sr.yr;
            curGroup.amount += sr.amount;
          } else {
            const periodStr = formatFullPeriodRange(curGroup.startMo, curGroup.startYr, curGroup.endMo, curGroup.endYr);
            schoolRanges.push(periodStr);
            breakdown.push({
              category: 'School Fee',
              period: periodStr,
              amount: curGroup.amount
            });
            totalAmount += curGroup.amount;

            curGroup = {
              startMo: sr.mo,
              startYr: sr.yr,
              endMo: sr.mo,
              endYr: sr.yr,
              amount: sr.amount
            };
          }
        }
      });

      if (curGroup) {
        const periodStr = formatFullPeriodRange(curGroup.startMo, curGroup.startYr, curGroup.endMo, curGroup.endYr);
        schoolRanges.push(periodStr);
        breakdown.push({
          category: 'School Fee',
          period: periodStr,
          amount: curGroup.amount
        });
        totalAmount += curGroup.amount;
      }
    }

    // 2. Exam Fee, Admission Fee, and Previous Session Arrears
    otherRows.forEach(or => {
      let period = '';
      if (or.isArrears) {
        const sessPart = or.arrearSession ? `Previous Session ${or.arrearSession}` : (or.yr && or.yr !== 'Arrears' ? `Previous Session ${or.yr}` : 'Previous Session');
        const periodPart = or.arrearPeriod || (or.mo && or.mo !== 'Previous Session' ? or.mo : 'Historical period unavailable');
        period = `${sessPart} — ${periodPart}`;
      } else if (or.feeType === 'Admission Fee') {
        period = `Session ${curSess}`;
      } else if (or.mo && or.yr) {
        period = `${or.mo} ${or.yr}`;
      } else {
        period = or.mo || or.feeType || '–';
      }
      breakdown.push({
        category: or.feeType,
        period: period,
        amount: or.amount
      });
      totalAmount += or.amount;
    });

    let duePeriod = '';
    if (schoolRanges.length > 0) {
      duePeriod = schoolRanges.join(', ');
    } else if (breakdown.length > 0) {
      duePeriod = breakdown[0].period;
    } else {
      duePeriod = `Session ${curSess}`;
    }

    consolidatedList.push({
      studentId: studentId,
      admno: s.admno,
      name: s.name,
      cls: s.cls,
      section: s.section || 'A',
      father: s.father || '–',
      phone: s.phone || '–',
      duePeriod: duePeriod,
      breakdown: breakdown,
      totalAmount: totalAmount,
      amount: totalAmount
    });
  });

  return consolidatedList;
}

// Default Schema Definition
let DB = {
  settings: {
    schoolName: 'MD Convent Public School',
    schoolAddr: 'Amanpur (Kasganj), Uttar Pradesh',
    schoolPhone: '9528371785',
    schoolLogo: '',
    currentSession: '2026–27',
    admissionPrefix: '',
    receiptPrefix: 'REC-',
    principalName: 'Tanmay Soni'
  },
  sessions: [
    { name: '2026–27', active: true, createdAt: new Date().toISOString() },
    { name: '2027–28', active: false, createdAt: new Date().toISOString() }
  ],
  feeStructures: {
    'NC':  { tuition: 350, transport: 300, admission: 500 },
    'LKG': { tuition: 350, transport: 300, admission: 500 },
    'UKG': { tuition: 350, transport: 300, admission: 500 },
    '1':   { tuition: 400, transport: 300, admission: 500 },
    '2':   { tuition: 400, transport: 300, admission: 500 },
    '3':   { tuition: 400, transport: 300, admission: 500 },
    '4':   { tuition: 400, transport: 300, admission: 500 },
    '5':   { tuition: 400, transport: 300, admission: 500 },
    '6':   { tuition: 450, transport: 300, admission: 500 },
    '7':   { tuition: 450, transport: 300, admission: 500 },
    '8':   { tuition: 450, transport: 300, admission: 500 },
    '9':   { tuition: 500, transport: 300, admission: 500 },
    '10':  { tuition: 500, transport: 300, admission: 500 },
    '11':  { tuition: 550, transport: 300, admission: 500 },
    '12':  { tuition: 550, transport: 300, admission: 500 }
  },
  classSections: {
    'NC':  [{ name: 'A', teacher: '' }],
    'LKG': [{ name: 'A', teacher: '' }],
    'UKG': [{ name: 'A', teacher: '' }],
    '1':   [{ name: 'A', teacher: '' }],
    '2':   [{ name: 'A', teacher: '' }],
    '3':   [{ name: 'A', teacher: '' }],
    '4':   [{ name: 'A', teacher: '' }],
    '5':   [{ name: 'A', teacher: '' }],
    '6':   [{ name: 'A', teacher: '' }],
    '7':   [{ name: 'A', teacher: '' }],
    '8':   [{ name: 'A', teacher: '' }],
    '9':   [{ name: 'A', teacher: '' }],
    '10':  [{ name: 'A', teacher: '' }],
    '11':  [{ name: 'A', teacher: '' }],
    '12':  [{ name: 'A', teacher: '' }]
  },
  students: [],
  fees: {},
  feeConfig: {},
  payments: [],
  expenses: [],
  history: [],
  nextAdm: 1,
  nextReceiptSeq: 1,
  nextId: 1
};

// ============================================================
// DATA STORAGE, MIGRATION & AUTOSAVE ENGINE
// ============================================================
let isDataCorrupted = false;

async function loadDB() {
  if (isEl) {
    const d = await window.electronAPI.loadData();
    if (d && d.error === 'CORRUPTED_DATA') {
      isDataCorrupted = true;
      setSS('error');
      console.error('CRITICAL: Corrupted data file detected:', d.message);
      toast('CRITICAL ERROR: Data file is corrupted. Auto-save disabled to prevent data loss!', 'error', 10000);
      alert('CRITICAL DATA ERROR:\n\nThe school database file is corrupted and could not be loaded.\nAuto-save has been disabled to prevent data loss.\nPlease restore from a valid backup in Documents/MDConvent_SMS/backups/.');
      return;
    }
    if (d && d.error === 'INVALID_DATABASE') {
      isDataCorrupted = true;
      setSS('error');
      console.error('CRITICAL: Invalid database structure:', d.message);
      toast('CRITICAL ERROR: Database file has invalid structure. Auto-save disabled!', 'error', 10000);
      alert('CRITICAL DATA ERROR:\n\nThe database file school_data.json has an invalid format or missing required structures.\nAuto-save has been disabled to protect your files.\nPlease verify your database file in Documents/MDConvent_SMS/.');
      return;
    }
    if (d && d.error === 'DATABASE_MISSING') {
      isDataCorrupted = true;
      setSS('recovery');
      console.warn('DATABASE MISSING: Backups detected. Presenting recovery interface.');
      showMissingDatabaseRecoveryScreen(d.availableBackups || [], d.hasValidBackups !== false);
      return;
    }
    if (d && d.isFreshInstall) {
      isDataCorrupted = false;
      DB.students = [];
      DB.fees = {};
      DB.feeConfig = {};
      DB.payments = [];
      DB.expenses = [];
      DB.history = [];
      DB.settings = {
        schoolName: 'School Management System',
        schoolAddr: '',
        schoolPhone: '',
        schoolLogo: '',
        currentSession: '2026–27',
        admissionPrefix: '',
        receiptPrefix: 'REC-',
        principalName: ''
      };
      ensureDefaultState();
      applyBranding();
      saveDB(true);
      const p = await window.electronAPI.getDataPath();
      const e = document.getElementById('dpInfo');
      if (e) e.textContent = 'Data File: ' + p;
      return;
    }
    if (d && typeof d === 'object') {
      migrateExistingData(d);
    }
    const p = await window.electronAPI.getDataPath();
    const e = document.getElementById('dpInfo');
    if (e) e.textContent = 'Data File: ' + p;
  } else {
    try {
      const s = localStorage.getItem('mdc');
      if (s) {
        const d = JSON.parse(s);
        migrateExistingData(d);
      }
    } catch(err) {
      console.error(err);
    }
  }
  ensureDefaultState();
  applyBranding();
}

function migrateExistingData(legacy) {
  // Preserve existing student records and fee entries
  if (Array.isArray(legacy.students)) DB.students = legacy.students;
  if (legacy.fees && typeof legacy.fees === 'object') DB.fees = legacy.fees;
  if (legacy.feeConfig && typeof legacy.feeConfig === 'object') DB.feeConfig = legacy.feeConfig;
  if (Array.isArray(legacy.expenses)) DB.expenses = legacy.expenses;
  if (Array.isArray(legacy.payments)) DB.payments = legacy.payments;
  if (Array.isArray(legacy.history)) DB.history = legacy.history;
  if (legacy.settings && typeof legacy.settings === 'object') {
    DB.settings = Object.assign({}, DB.settings, legacy.settings);
  }
  if (Array.isArray(legacy.sessions) && legacy.sessions.length) {
    DB.sessions = legacy.sessions;
  }
  if (legacy.feeStructures && typeof legacy.feeStructures === 'object') {
    DB.feeStructures = Object.assign({}, DB.feeStructures, legacy.feeStructures);
  }
  if (legacy.classSections && typeof legacy.classSections === 'object') {
    DB.classSections = Object.assign({}, DB.classSections, legacy.classSections);
  }
  if (legacy.nextAdm) DB.nextAdm = legacy.nextAdm;
  if (legacy.nextReceiptSeq) DB.nextReceiptSeq = legacy.nextReceiptSeq;
  if (legacy.nextId) DB.nextId = legacy.nextId;
  if (legacy.transport && typeof legacy.transport === 'object') {
    DB.transport = legacy.transport;
  }

  // Enrich students with modern status, session, and section if missing (preserve admissionDate unchanged)
  const curSess = DB.settings.currentSession || '2026–27';
  DB.students.forEach(s => {
    if (!s.status) s.status = 'Active';
    if (!s.session) s.session = curSess;
    if (!s.section) s.section = 'A';
    if (!s.academicHistory) s.academicHistory = [];
    getStudentEnrollments(s);
  });

  // Ensure feeConfig backward compatibility
  if (!DB.feeConfig) DB.feeConfig = {};
  Object.keys(DB.feeConfig).forEach(sid => {
    const cfg = DB.feeConfig[sid];
    if (cfg && typeof cfg === 'object') {
      if (cfg.transportEnabled === undefined) cfg.transportEnabled = (cfg.transport !== false);
      if (cfg.transport === undefined) cfg.transport = cfg.transportEnabled;
      if (cfg.examFee === undefined) cfg.examFee = 200;
      if (cfg.examEnabled === undefined) cfg.examEnabled = true;
      if (cfg.advanceBalance === undefined) cfg.advanceBalance = 0;
      if (cfg.previousArrears === undefined) cfg.previousArrears = 0;
    }
  });
}

function ensureDefaultState() {
  if (!DB.settings) DB.settings = {};
  if (!DB.settings.schoolName) DB.settings.schoolName = 'School Management System';
  if (!DB.settings.currentSession) DB.settings.currentSession = '2026–27';
  if (!DB.settings.receiptPrefix) DB.settings.receiptPrefix = 'REC-';
  if (!DB.settings.principalName) DB.settings.principalName = '';
  if (!DB.settings.schoolLogo || DB.settings.schoolLogo === 'logo.png') {
    DB.settings.schoolLogo = '';
  }

  CLASSES.forEach(c => {
    if (!DB.feeStructures[c]) DB.feeStructures[c] = { tuition: 400, transport: 300, admission: 500, examFee: 200 };
    else if (!DB.feeStructures[c].examFee) DB.feeStructures[c].examFee = 200;
    if (!DB.classSections[c] || !DB.classSections[c].length) DB.classSections[c] = [{ name: 'A', teacher: '' }];
  });

  const maxIssued = typeof getMaxIssuedAdmissionNumber === 'function' ? getMaxIssuedAdmissionNumber() : 0;
  if (!DB.nextAdm || isNaN(parseInt(DB.nextAdm, 10))) {
    DB.nextAdm = (maxIssued > 0) ? (maxIssued + 1) : 1;
  } else if (maxIssued > 0 && parseInt(DB.nextAdm, 10) <= maxIssued) {
    DB.nextAdm = maxIssued + 1;
  }
  if (!DB.nextReceiptSeq) DB.nextReceiptSeq = 1;
  if (!DB.nextId) DB.nextId = (DB.students.length ? Math.max(...DB.students.map(s => s.id || 0)) + 1 : 1);

  (DB.students || []).forEach(s => {
    getStudentEnrollments(s);
  });
  if (!DB.transport || typeof DB.transport !== 'object') {
    DB.transport = {
      stops: [],
      assignments: {},
      payments: [],
      nextReceiptSeq: 1
    };
  }
  if (!Array.isArray(DB.transport.stops)) DB.transport.stops = [];
  if (!DB.transport.assignments || typeof DB.transport.assignments !== 'object') DB.transport.assignments = {};
  if (!Array.isArray(DB.transport.payments)) DB.transport.payments = [];
  if (typeof DB.transport.nextReceiptSeq !== 'number') DB.transport.nextReceiptSeq = 1;
  determineActiveAcademicSession();
}

let isSavingInProgress = false;
let pendingSaveQueued = false;
let lastSaveError = '';

function saveDB(now = false) {
  if (isDataCorrupted) {
    console.error('Save aborted: Database is in corrupted/emergency recovery state.');
    setSS('recovery');
    return Promise.resolve(false);
  }
  setSS('saving');
  if (svT) clearTimeout(svT);
  const go = async () => {
    if (isSavingInProgress) {
      pendingSaveQueued = true;
      return true;
    }
    isSavingInProgress = true;
    let ok = false;
    try {
      if (isEl) {
        const res = await window.electronAPI.saveData(DB);
        ok = !!(res && res.success);
        if (!ok) {
          lastSaveError = (res && res.error) || 'Save rejected by persistence layer';
        } else {
          lastSaveError = '';
        }
      } else {
        try {
          localStorage.setItem('mdc', JSON.stringify(DB));
          ok = true;
          lastSaveError = '';
        } catch(e) {
          ok = false;
          lastSaveError = e.message;
        }
      }
      if (ok) {
        setSS('saved');
      } else {
        setSS('error');
        toast('Failed to save data: ' + (lastSaveError || 'Disk write error'), 'error');
      }
      return ok;
    } finally {
      isSavingInProgress = false;
      if (pendingSaveQueued) {
        pendingSaveQueued = false;
        saveDB(true);
      }
    }
  };
  if (now) return go();
  else {
    svT = setTimeout(go, 800);
    return Promise.resolve(true);
  }
}

function setSS(s) {
  const d = document.getElementById('sdot'), l = document.getElementById('sstxt');
  if (!d || !l) return;
  if (s === 'saving') {
    d.style.background = '#f39c12';
    l.textContent = 'Saving...';
  } else if (s === 'error') {
    d.style.background = '#e74c3c';
    l.textContent = lastSaveError ? ('Save Error: ' + lastSaveError) : 'Save Error!';
  } else if (s === 'recovery') {
    d.style.background = '#e67e22';
    l.textContent = 'Recovery Mode (Auto-save Paused)';
  } else {
    d.style.background = '#2ecc71';
    l.textContent = 'All saved ✓';
  }
}

function logActivity(actionType, description) {
  if (!DB.history) DB.history = [];
  const entry = {
    id: 'act_' + Date.now() + '_' + Math.floor(Math.random()*1000),
    timestamp: new Date().toISOString(),
    actionType,
    description
  };
  DB.history.unshift(entry);
  if (DB.history.length > 500) DB.history = DB.history.slice(0, 500);
}

function toast(msg, type = 'success') {
  const w = document.getElementById('tw2');
  if (!w) return;
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.innerHTML = (type === 'success' ? '✓' : type === 'error' ? '✕' : '⚠') + ' ' + msg;
  w.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transition = 'opacity 0.4s';
    setTimeout(() => t.remove(), 400);
  }, 3200);
}

// ============================================================
// BRANDING & NAVIGATION
// ============================================================
function applyBranding() {
  const s = DB.settings || {};
  const sName = s.schoolName || 'School Management System';
  const sAddr = s.schoolAddr || '';
  const sPhone = s.schoolPhone || '';
  const curSess = s.currentSession || '2026–27';

  document.title = sName + ' - SMS';
  const hTitle = document.getElementById('htmlAppTitle');
  if (hTitle) hTitle.textContent = sName + ' - SMS';

  const sbName = document.getElementById('sbSchoolName');
  if (sbName) sbName.textContent = sName;
  const sbAddr = document.getElementById('sbSchoolAddr');
  if (sbAddr) sbAddr.textContent = sAddr || sPhone;

  const topSess = document.getElementById('topSessionBdg');
  if (topSess) topSess.textContent = 'Session ' + curSess;

  const topHead = document.getElementById('topSchoolHead');
  if (topHead) topHead.textContent = s.principalName ? 'Principal: ' + s.principalName : sName;

  const logoImg = document.getElementById('sbLogoImg');
  const logoFb = document.getElementById('logofb');
  const customLogo = (s.schoolLogo && s.schoolLogo !== 'logo.png') ? s.schoolLogo : '';
  if (logoImg) {
    logoImg.src = customLogo || 'assets/default-school-logo.svg';
    logoImg.style.display = 'block';
    if (logoFb) logoFb.style.display = 'none';
  }
  const trLogo = document.getElementById('tr_rcpt_logo_img');
  if (trLogo) {
    trLogo.src = customLogo || 'assets/default-school-logo.svg';
  }
  const trSchool = document.getElementById('tr_rcpt_school_name');
  if (trSchool) {
    trSchool.textContent = (sName || 'School Management System').toUpperCase();
  }
}

// ============================================================
// DEDICATED MISSING DATABASE RECOVERY ENGINE
// ============================================================
function showMissingDatabaseRecoveryScreen(backupsList, hasValid) {
  const container = document.getElementById('recoveryBackupsListContainer');
  if (!container) return;

  if (!backupsList || backupsList.length === 0) {
    container.innerHTML = `
      <div style="background:#fff3cd;border:1px solid #ffeeba;padding:14px;border-radius:8px;color:#856404;font-size:13px">
        No backups were found in the <code>backups/</code> folder. Please place a valid backup or database file in <code>Documents/MDConvent_SMS/</code> or use the browse option below.
      </div>`;
    openM('modalDatabaseRecovery');
    return;
  }

  let html = `
    <div style="font-size:12.5px;font-weight:600;color:var(--txt);margin-bottom:4px">
      Available Backups in <code>Documents/MDConvent_SMS/backups/</code> (${backupsList.length}):
    </div>
    <div style="display:flex;flex-direction:column;gap:8px;max-height:280px;overflow-y:auto;padding-right:4px">`;

  backupsList.forEach((b) => {
    const isObj = (typeof b === 'object' && b !== null);
    const bName = isObj ? b.name : b;
    const bDate = isObj && b.dateFormatted ? b.dateFormatted : (bName.replace('backup_', '').replace('.json', '').replace(/_/g, ' '));
    const bSize = isObj && b.sizeFormatted ? b.sizeFormatted : '';
    const bValid = isObj ? b.isValid : true;
    const bStudents = isObj && b.studentCount !== undefined ? b.studentCount : null;
    const bSchool = isObj && b.schoolName ? b.schoolName : '';

    html += `
      <div style="border:1px solid ${bValid ? '#cbd5e1' : '#fca5a5'};background:${bValid ? '#f8fafc' : '#fff1f2'};border-radius:8px;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px">
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:13px;color:#1e293b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${bName}">
            📄 ${bName}
          </div>
          <div style="font-size:11.5px;color:#64748b;margin-top:2px;display:flex;gap:10px;flex-wrap:wrap">
            <span>🕒 ${bDate}</span>
            ${bSize ? `<span>💾 ${bSize}</span>` : ''}
            ${bStudents !== null ? `<span>👥 ${bStudents} Students</span>` : ''}
            ${bSchool ? `<span>🏫 ${bSchool}</span>` : ''}
          </div>
          <div style="margin-top:4px">
            ${bValid 
              ? `<span style="display:inline-block;background:#dcfce7;color:#15803d;font-size:10.5px;font-weight:600;padding:1px 6px;border-radius:4px">✓ Valid School Data</span>`
              : `<span style="display:inline-block;background:#fee2e2;color:#b91c1c;font-size:10.5px;font-weight:600;padding:1px 6px;border-radius:4px">✗ Invalid / Corrupted Payload</span>`}
          </div>
        </div>
        <div>
          ${bValid 
            ? `<button class="btn bp bsm" onclick="confirmAndRestoreBackup('${bName}')">Restore This Backup</button>`
            : `<button class="btn bo bsm" disabled style="opacity:0.5;cursor:not-allowed">Unusable</button>`}
        </div>
      </div>`;
  });

  html += `</div>`;

  if (!hasValid) {
    html += `
      <div style="background:#fef2f2;border:1px solid #fecaca;padding:12px 14px;border-radius:8px;color:#991b1b;font-size:12.5px;margin-top:8px">
        ⚠️ <strong>Notice:</strong> Backups were detected, but none passed structural schema validation. Auto-save remains disabled and a blank database will <strong>not</strong> be created automatically. Please inspect your backups folder or restore from an external verified file.
      </div>`;
  }

  container.innerHTML = html;
  openM('modalDatabaseRecovery');
}

async function confirmAndRestoreBackup(backupName) {
  if (!confirm(`RESTORE CONFIRMATION:\n\nAre you sure you want to restore from backup:\n"${backupName}"?\n\nThis will safely recreate your primary database (school_data.json) and resume normal operations.`)) {
    return;
  }

  if (!isEl || !window.electronAPI || !window.electronAPI.restoreSpecificBackup) {
    toast('Restore operation not supported in this environment', 'error');
    return;
  }

  const res = await window.electronAPI.restoreSpecificBackup(backupName);
  if (!res || !res.success) {
    alert('RESTORATION FAILED:\n\n' + ((res && res.error) || 'Unknown error occurred while restoring backup.'));
    return;
  }

  isDataCorrupted = false;
  closeM('modalDatabaseRecovery');
  migrateExistingData(res.data);
  ensureDefaultState();
  applyBranding();
  renderDB();
  setSS('saved');
  logActivity('Backup Restored', `Restored school database from automatic backup: ${backupName}`);
  toast('Database successfully restored! All features are now active.', 'success', 6000);

  const p = await window.electronAPI.getDataPath();
  const e = document.getElementById('dpInfo');
  if (e) e.textContent = 'Data File: ' + p;
}

function showPage(id, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('page-' + id);
  if (target) target.classList.add('active');

  const ca = document.querySelector('.ca');
  if (ca) {
    ca.style.overflowX = 'hidden';
  }

  document.querySelectorAll('.nb').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  else {
    const matchBtn = Array.from(document.querySelectorAll('.nb')).find(b => b.getAttribute('onclick') && b.getAttribute('onclick').includes("'" + id + "'"));
    if (matchBtn) matchBtn.classList.add('active');
  }

  const titles = {
    dashboard: 'Dashboard Overview',
    students: 'Student Management',
    addstudent: 'Add / Edit Student',
    classes: 'Class & Section Management',
    sessions: 'Academic Sessions & Promotion',
    feestructure: 'Class-wise Fee Structures',
    fees: 'Fee Collection & Ledgers',
    reminder: 'Fee Due Reminders',
    transport: 'Transport Fees',
    expenses: 'Expense Management',
    'financial-reports': 'Financial & Collection Reports',
    reports: 'Data Exports & Backup',
    history: 'Activity History & Audit Log',
    settings: 'Application Settings',
    support: 'Developer Support & Updates'
  };
  const tEl = document.getElementById('pgTitle');
  if (tEl) tEl.textContent = titles[id] || id;

  if (id === 'dashboard') renderDB();
  else if (id === 'students') renderSt();
  else if (id === 'addstudent') {
    fillDDs();
    if (!document.getElementById('s_eid')?.value) {
      resetForm();
    }
  }
  else if (id === 'classes') renderClasses();
  else if (id === 'sessions') renderSessions();
  else if (id === 'feestructure') renderFeeStructures();
  else if (id === 'fees') {
    fillDDs();
    autoSetCurrentMonth('fe_mo', 'fe_yr', true);
    // Default summary month selector to current live month if valid in active session
    const curSess = (DB.settings && DB.settings.currentSession) || '2026–27';
    const [startY, endY] = parseSessionYears(curSess);
    const now = new Date();
    const liveMo = SYS_MONTHS[now.getMonth()];
    const liveYr = now.getFullYear();
    const liveKey = `${liveMo}_${liveYr}`;
    const validSessionKeys = MONTHS_LIST.map((mo, idx) => `${mo}_${idx < 9 ? startY : endY}`);
    if (!curSummaryMonthKey || !validSessionKeys.includes(curSummaryMonthKey)) {
      curSummaryMonthKey = validSessionKeys.includes(liveKey) ? liveKey : validSessionKeys[0];
    }
    renderMonthWiseSummary();
    renderFeD();
  }
  else if (id === 'reminder') {
    fillRmSessions();
    fillRmClasses();
    autoSetCurrentMonth('rm_mo', 'rm_yr');
    loadReminders();
  }
  else if (id === 'transport') {
    initTransportPage();
  }
  else if (id === 'history') renderHistory();
  else if (id === 'settings') loadSettingsForm();
}

function autoSetCurrentMonth(moId, yrId, forceLive = false) {
  const now = new Date();
  const curMo = SYS_MONTHS[now.getMonth()];
  const mEl = document.getElementById(moId);
  const yEl = document.getElementById(yrId);
  if (mEl && (forceLive || !mEl.value)) mEl.value = curMo;
  if (yEl && (forceLive || !yEl.value)) yEl.value = now.getFullYear();
}

function openM(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('show');
}
function closeM(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('show');
}

function clL(c) {
  return c === 'NC' ? 'Nursery (NC)' : (c === 'LKG' || c === 'UKG') ? c : 'Class ' + c;
}

function getNextReceiptNumber() {
  const prefix = (DB.settings && DB.settings.receiptPrefix) ? DB.settings.receiptPrefix : 'REC-';
  const curSess = (DB.settings && DB.settings.currentSession) ? DB.settings.currentSession.replace(/[^a-zA-Z0-9]/g, '') : '202627';
  const seq = String(DB.nextReceiptSeq || 1).padStart(4, '0');
  DB.nextReceiptSeq = (DB.nextReceiptSeq || 1) + 1;
  return `${prefix}${curSess}-${seq}`;
}

function fillDDs() {
  ['fCls', 's_cl', 'fe_cl', 'prm_from_cls'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const cur = el.value;
    const isFilter = (id === 'fCls' || id === 'fe_cl' || id === 'prm_from_cls');
    el.innerHTML = isFilter ? '<option value="">All Classes</option>' : '<option value="">Select Class</option>';
    CLASSES.forEach(c => {
      el.innerHTML += `<option value="${c}">${clL(c)}</option>`;
    });
    if (cur) el.value = cur;
  });
  if (typeof loadFeSt === 'function') loadFeSt();

  // Sessions dropdowns
  ['set_cur_session'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const cur = el.value || (DB.settings && DB.settings.currentSession);
    el.innerHTML = '';
    (DB.sessions || []).forEach(sess => {
      el.innerHTML += `<option value="${sess.name}"${sess.name === cur ? ' selected' : ''}>${sess.name}</option>`;
    });
  });
}

// ============================================================
// 1. DASHBOARD
// ============================================================
function onDashboardPeriodChange() {
  const modeSel = document.getElementById('db_period_mode');
  const customWrap = document.getElementById('db_custom_month_wrap');
  if (modeSel && customWrap) {
    customWrap.style.display = (modeSel.value === 'custom_month' || modeSel.value === 'select_month') ? 'flex' : 'none';
  }
  renderDB();
}

function getDashboardFinancialMetrics(periodMode = 'current_month', targetMonth = null, targetYear = null, targetSession = null) {
  const curSess = targetSession || (DB.settings && DB.settings.currentSession) || '2026–27';
  const today = new Date();
  const curMo = SYS_MONTHS[today.getMonth()] || 'October';
  const curYr = today.getFullYear();
  const tMo = targetMonth || curMo;
  const tYr = targetYear || curYr;

  let label = '';
  let badgeText = '';

  const isSelectMonth = (periodMode === 'custom_month' || periodMode === 'select_month');

  if (periodMode === 'full_session') {
    label = 'Full Session';
    badgeText = `🏫 Full Academic Session (${curSess})`;
  } else if (isSelectMonth) {
    label = `${tMo} ${tYr}`;
    badgeText = `📅 Selected Month: ${tMo} ${tYr}`;
  } else {
    label = `${curMo} ${curYr}`;
    badgeText = `📅 Current Month: ${curMo} ${curYr}`;
  }

  // 1. Fee Collected (attribute to periods and only valid non-reversed receipts)
  const validTransactions = getValidPaymentTransactions();
  let collectedAmt = 0;

  validTransactions.forEach(tx => {
    if (periodMode === 'full_session') {
      // Sum allocations for current academic session
      if (Array.isArray(tx.items) && tx.items.length > 0) {
        tx.items.forEach(it => {
          if (it.feeKey === 'arrears' || it.type === 'Previous Arrears' || isFeeInAcademicSession(it.month, it.year || tYr, curSess)) {
            collectedAmt += (Number(it.paidAmount !== undefined ? it.paidAmount : (it.baseAmount !== undefined ? it.baseAmount : it.amount)) || 0);
          }
        });
      } else {
        if (!tx.session || tx.session === curSess) {
          collectedAmt += Number(tx.amount) || 0;
        }
      }
    } else {
      // Specific month (current_month or select_month / custom_month)
      const targetM = isSelectMonth ? tMo : curMo;
      const targetY = isSelectMonth ? tYr : curYr;

      if (Array.isArray(tx.items) && tx.items.length > 0) {
        tx.items.forEach(it => {
          if (it.month === targetM && (Number(it.year) === Number(targetY) || !it.year)) {
            collectedAmt += (Number(it.paidAmount !== undefined ? it.paidAmount : (it.baseAmount !== undefined ? it.baseAmount : it.amount)) || 0);
          }
        });
      } else {
        if (tx.period && tx.period.includes(targetM)) {
          collectedAmt += Number(tx.amount) || 0;
        }
      }
    }
  });

  // 2. Fee Pending (calculated from active students only via unified getPendingFeesDueList)
  let pendingRows = [];
  if (periodMode === 'full_session') {
    pendingRows = getPendingFeesDueList({ sessMode: 'current', dueType: 'all', month: '' });
  } else {
    const targetM = isSelectMonth ? tMo : curMo;
    const targetY = isSelectMonth ? tYr : curYr;
    pendingRows = getPendingFeesDueList({ sessMode: 'current', dueType: 'current', month: targetM, year: targetY });
  }

  const pendingAmt = pendingRows.reduce((sum, r) => sum + r.amount, 0);
  const totalExpected = collectedAmt + pendingAmt;
  const collectionRate = totalExpected > 0
    ? Math.min(100, Math.round((collectedAmt / totalExpected) * 100))
    : (collectedAmt > 0 ? 100 : 0);

  return {
    periodMode,
    label,
    badgeText,
    collectedAmt,
    pendingAmt,
    totalExpected,
    collectionRate,
    curSess
  };
}

function renderDB() {
  const students = DB.students || [];
  const curSess = (DB.settings && DB.settings.currentSession) || '2026–27';
  const activeStudents = students.filter(s => s.status !== 'Inactive' && s.status !== 'Left School' && s.status !== 'Alumni');

  document.getElementById('dt').textContent = activeStudents.length;
  document.getElementById('db').textContent = activeStudents.filter(s => s.gender === 'Male').length;
  document.getElementById('dg').textContent = activeStudents.filter(s => s.gender === 'Female').length;

  const modeSel = document.getElementById('db_period_mode');
  const periodMode = modeSel ? modeSel.value : 'current_month';
  const customMoSel = document.getElementById('db_mo');
  const customYrInp = document.getElementById('db_yr');
  const today = new Date();
  const curMo = SYS_MONTHS[today.getMonth()] || 'October';
  const curYr = today.getFullYear();
  const isSelectMonth = (periodMode === 'custom_month' || periodMode === 'select_month');
  const targetMo = isSelectMonth ? (customMoSel?.value || curMo) : curMo;
  const targetYr = isSelectMonth ? (parseInt(customYrInp?.value) || curYr) : curYr;

  const metrics = getDashboardFinancialMetrics(periodMode, targetMo, targetYr, curSess);

  const dcEl = document.getElementById('dc');
  if (dcEl) dcEl.textContent = '₹' + metrics.collectedAmt.toLocaleString('en-IN');
  const ddEl = document.getElementById('dd');
  if (ddEl) ddEl.textContent = '₹' + metrics.pendingAmt.toLocaleString('en-IN');

  const incEl = document.getElementById('db-inc');
  if (incEl) incEl.textContent = '₹' + metrics.collectedAmt.toLocaleString('en-IN');
  const expEl = document.getElementById('db-exp');
  if (expEl) expEl.textContent = '₹' + metrics.totalExpected.toLocaleString('en-IN');
  const outEl = document.getElementById('db-out');
  if (outEl) outEl.textContent = '₹' + metrics.pendingAmt.toLocaleString('en-IN');

  const rateEl = document.getElementById('db-rate');
  if (rateEl) {
    rateEl.textContent = metrics.collectionRate + '%';
    rateEl.style.color = metrics.collectionRate >= 80 ? 'var(--grn)' : metrics.collectionRate >= 50 ? 'var(--ylw)' : 'var(--red)';
  }

  const dcLbl = document.getElementById('dc_lbl');
  if (dcLbl) {
    dcLbl.innerHTML = `<span class="sl-title">Fee Collected</span><span class="sl-sub">(${metrics.label})</span>`;
    dcLbl.title = `Fee Collected (${metrics.label} - Session ${curSess}) — Click to view collected payments ledger`;
  }
  const ddLbl = document.getElementById('dd_lbl');
  if (ddLbl) {
    ddLbl.innerHTML = `<span class="sl-title">Fee Pending</span><span class="sl-sub">(${metrics.label})</span>`;
    ddLbl.title = `Fee Pending (${metrics.label} - Session ${curSess}) — Click to view pending fee dues report`;
  }
  const expLbl = document.getElementById('db-exp-lbl');
  if (expLbl) {
    expLbl.innerHTML = `<span class="sl-title">Total Expected</span><span class="sl-sub">(${metrics.label})</span>`;
    expLbl.title = `Total Expected (${metrics.label} - Session ${curSess})`;
  }
  const rateLbl = document.getElementById('db-rate-lbl');
  if (rateLbl) {
    rateLbl.innerHTML = `<span class="sl-title">Collection Rate</span><span class="sl-sub">(${metrics.label})</span>`;
    rateLbl.title = `Collection Rate (${metrics.label} - Session ${curSess})`;
  }
  const qaSess = document.getElementById('qaSessVal');
  if (qaSess) qaSess.textContent = 'Session ' + curSess;
  const badgeEl = document.getElementById('db_period_badge');
  if (badgeEl) badgeEl.textContent = metrics.badgeText;

  const sessEl = document.getElementById('db-sess');
  if (sessEl) sessEl.textContent = curSess;

  // Class-wise enrollment bar chart (NC to 12)
  const cnt = {};
  activeStudents.forEach(s => { cnt[s.cls] = (cnt[s.cls] || 0) + 1; });
  const maxEnroll = Math.max(...CLASSES.map(c => cnt[c] || 0), 1);
  const clsChartEl = document.getElementById('clsChart');
  if (clsChartEl) {
    clsChartEl.innerHTML = CLASSES.map(c => {
      const n = cnt[c] || 0;
      const pct = Math.round((n / maxEnroll) * 100);
      return `
        <div class="cbw">
          <div style="width:75px;font-size:11.5px;color:var(--txt2);text-align:right">${clL(c)}</div>
          <div class="cbb"><div class="cbf" style="width:${pct}%"></div></div>
          <div style="width:26px;font-size:12px;font-weight:600">${n}</div>
        </div>`;
    }).join('');
  }

  // Monthly revenue chart (April to March)
  const revData = MONTHS_LIST.map(mo => {
    let amt = 0;
    Object.entries(DB.fees || {}).forEach(([key, arr]) => {
      const parts = key.split('_');
      if (parts[1] === mo && Array.isArray(arr)) {
        arr.forEach(f => {
          if (f.paid && f.enabled !== false) amt += (Number(f.amount) || 0);
        });
      }
    });
    return { mo: mo.substring(0, 3), fullMo: mo, amt };
  });

  const maxRev = Math.max(...revData.map(r => r.amt), 1);
  const revEl = document.getElementById('revenueChart');
  if (revEl) {
    if (revData.every(r => r.amt === 0)) {
      revEl.innerHTML = '<div class="empty" style="padding:40px 0">No fee collections recorded yet in this session</div>';
    } else {
      revEl.innerHTML = `
        <div style="display:flex;align-items:flex-end;gap:8px;height:165px;padding:8px 6px 0 6px">
          ${revData.map(r => {
            const h = Math.max(Math.round((r.amt / maxRev) * 135), 4);
            const active = r.amt > 0;
            return `
              <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px">
                <div style="font-size:9.5px;color:var(--txt2);font-weight:600">${active ? (r.amt >= 1000 ? '₹' + (r.amt/1000).toFixed(1) + 'k' : '₹' + r.amt) : ''}</div>
                <div style="width:100%;height:${h}px;background:${active ? 'var(--grn)' : 'var(--bdr)'};border-radius:4px 4px 0 0;transition:height 0.4s" title="${r.fullMo}: ₹${r.amt.toLocaleString('en-IN')}"></div>
                <div style="font-size:10px;color:var(--txt2);font-weight:600">${r.mo}</div>
              </div>`;
          }).join('')}
        </div>`;
    }
  }

  // Top 10 Defaulters: calculate session-to-date total dues (April through current calendar month)
  // regardless of dashboard month filter, including School Fee, Exam Fee, Admission Fee, and Arrears
  const sessionDues = getPendingFeesDueList({ sessMode: 'current', dueType: 'all', month: '' });
  let defMap = {};
  sessionDues.forEach(d => {
    if (!defMap[d.studentId]) {
      const st = activeStudents.find(s => s.id === d.studentId);
      if (st) {
        defMap[d.studentId] = { student: st, due: 0 };
      }
    }
    if (defMap[d.studentId]) {
      defMap[d.studentId].due += d.amount;
    }
  });

  const top10 = Object.values(defMap).filter(d => d.due > 0).sort((a, b) => b.due - a.due).slice(0, 10);
  const defEl = document.getElementById('defaultersList');
  if (defEl) {
    if (!top10.length) {
      defEl.innerHTML = '<div class="empty" style="color:var(--grn)">✓ No outstanding fee defaulters recorded!</div>';
    } else {
      defEl.innerHTML = top10.map((d, i) => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 14px;border-bottom:1px solid var(--bdr);${i === 0 ? 'background:#fdecea;' : i < 3 ? 'background:#fff8f8;' : ''}">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="width:20px;height:20px;border-radius:50%;background:${i === 0 ? 'var(--red)' : i < 3 ? 'var(--ylw)' : 'var(--bdr)'};color:${i < 3 ? '#fff' : 'var(--txt2)'};display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0">${i + 1}</span>
            <div>
              <div style="font-weight:600;font-size:12.5px">${d.student.name}</div>
              <div style="font-size:10.5px;color:var(--txt2)">${clL(d.student.cls)} ${d.student.section || 'A'} | ${d.student.phone}</div>
            </div>
          </div>
          <span style="font-weight:700;color:var(--red);font-size:13px">₹${d.due.toLocaleString('en-IN')}</span>
        </div>`).join('');
    }
  }
}

// Collected Details Modal
function getValidPaymentTransactions() {
  const transactions = [];
  const handledReceipts = new Set();

  // 1. Primary source: DB.payments
  (DB.payments || []).forEach(p => {
    // Strictly exclude reversed / voided receipts from valid collections
    if (p.reversed === true || p.status === 'Void' || p.status === 'Reversed') return;

    const rNo = p.receiptNo || '–';
    if (rNo !== '–') handledReceipts.add(rNo);

    const s = (DB.students || []).find(st => st.id === p.studentId) || {};
    let items = Array.isArray(p.items) && p.items.length > 0 ? p.items : [];

    // Fallback if payment record does not have items array: recover from DB.fees matching receiptNo
    if (items.length === 0 && rNo !== '–') {
      Object.entries(DB.fees || {}).forEach(([key, arr]) => {
        if (!Array.isArray(arr)) return;
        const parts = key.split('_');
        if (p.studentId && parseInt(parts[0]) !== p.studentId) return;
        const mo = parts[1], yr = parts[2];
        arr.forEach(f => {
          if (f.paid && f.receiptNo === rNo) {
            items.push({
              month: mo,
              year: parseInt(yr),
              type: f.type,
              baseAmount: Number(f.amount) || 0,
              paidAmount: Number(f.amount) || 0
            });
          }
        });
      });
    }

    transactions.push({
      receiptNo: rNo,
      studentId: p.studentId,
      studentName: p.studentName || s.name || 'Unknown Student',
      admno: p.admno || s.admno || '–',
      cls: p.cls || s.cls || '–',
      section: p.section || s.section || 'A',
      amount: Number(p.amount) || 0,
      mode: p.mode || 'Cash',
      date: p.date || '–',
      session: p.session || '',
      category: p.category || '',
      period: p.period || '',
      items: items,
      reversed: false
    });
  });

  // 2. Fallback: Group any legacy paid fee items from DB.fees that lack an entry in DB.payments
  const feeReceiptMap = {};
  (DB.students || []).forEach(s => {
    Object.entries(DB.fees || {}).forEach(([key, arr]) => {
      const parts = key.split('_');
      if (parseInt(parts[0]) !== s.id || !Array.isArray(arr)) return;
      const mo = parts[1], yr = parts[2];
      arr.filter(f => f.enabled !== false && f.paid).forEach(f => {
        const rNo = f.receiptNo || '–';
        if (rNo !== '–' && handledReceipts.has(rNo)) return; // already handled above

        const grpKey = rNo !== '–' ? rNo : `NO_REC_${s.id}_${f.date || 'nodate'}`;
        if (!feeReceiptMap[grpKey]) {
          feeReceiptMap[grpKey] = {
            receiptNo: rNo,
            studentId: s.id,
            studentName: s.name,
            admno: s.admno,
            cls: s.cls,
            section: s.section || 'A',
            amount: 0,
            mode: f.mode || 'Cash',
            date: f.date || '–',
            session: '',
            category: f.type,
            period: `${mo} ${yr}`,
            items: [],
            reversed: false
          };
        }
        const fAmt = (f.partialPaid !== undefined && f.partialPaid !== null)
          ? Number(f.partialPaid)
          : (f.paid ? Math.max(0, (Number(f.amount) || 0) - (Number(f.discount) || 0)) : 0);
        feeReceiptMap[grpKey].amount += fAmt;
        feeReceiptMap[grpKey].items.push({
          month: mo,
          year: parseInt(yr),
          type: f.type,
          baseAmount: Number(f.amount) || fAmt,
          paidAmount: fAmt
        });
      });
    });
  });

  Object.values(feeReceiptMap).forEach(synthTx => {
    transactions.push(synthTx);
  });

  // Sort chronologically descending
  transactions.sort((a, b) => {
    const da = a.date || '';
    const db = b.date || '';
    if (da !== db) return db.localeCompare(da);
    return (b.receiptNo || '').localeCompare(a.receiptNo || '');
  });

  return transactions;
}

function togglePaymentBreakdown(idx) {
  const row = document.getElementById(`row_bkd_${idx}`);
  const btn = document.getElementById(`btn_bkd_${idx}`);
  if (!row) return;
  if (row.style.display === 'none' || !row.style.display) {
    row.style.display = 'table-row';
    if (btn) btn.innerHTML = '▲ Hide Breakdown';
  } else {
    row.style.display = 'none';
    if (btn) btn.innerHTML = '👁 View Breakdown';
  }
}

function showCollectedDetail() {
  const transactions = getValidPaymentTransactions();
  const body = document.getElementById('collectedBody');
  if (!body) return;

  if (!transactions.length) {
    body.innerHTML = '<div class="empty" style="padding:24px 0">No fee payments collected yet.</div>';
    openM('collectedM');
    return;
  }

  const totalColl = transactions.reduce((a, r) => a + r.amount, 0);

  body.innerHTML = `
    <div style="background:var(--gl);border-radius:8px;padding:12px 16px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;border:1px solid #a9dfbf;flex-shrink:0">
      <div>
        <div style="font-size:11px;color:var(--grn);font-weight:600">Total Valid Fee Collections</div>
        <div style="font-size:22px;font-weight:700;color:var(--grn)">₹${totalColl.toLocaleString('en-IN')}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:12px;font-weight:700;color:var(--grn)">${transactions.length} receipt transaction(s)</div>
        <div style="font-size:10.5px;color:var(--txt2)">Grouped by original payment receipt</div>
      </div>
    </div>
    <div style="flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;width:100%;border:1px solid var(--bdr);border-radius:6px">
      <table style="width:100%;font-size:12px;border-collapse:collapse;table-layout:fixed">
        <colgroup>
          <col style="width:135px">
          <col style="width:18%">
          <col style="width:95px">
          <col style="width:17%">
          <col style="width:90px">
          <col style="width:70px">
          <col style="width:120px">
          <col style="width:145px">
        </colgroup>
        <thead style="position:sticky;top:0;background:var(--bg);z-index:2">
          <tr>
            <th>Receipt #</th>
            <th>Student</th>
            <th>Class</th>
            <th>Period</th>
            <th>Date</th>
            <th>Mode</th>
            <th style="text-align:right">Amount Received</th>
            <th style="text-align:center">Breakdown</th>
          </tr>
        </thead>
        <tbody>
          ${transactions.map((tx, idx) => {
            const summaryPeriod = getTransactionSummaryPeriod(tx);
            const groupedAllocations = groupFeeItemsByPeriod(tx.items);
            let periodLinesHtml = '';
            if (groupedAllocations.length > 0) {
              periodLinesHtml = groupedAllocations.map(g => `
                <div style="margin-bottom:3px;font-size:11.5px;line-height:1.4">
                  <span style="font-weight:600;color:var(--txt)">${escapeHtml(g.type)}:</span> <span style="color:var(--txt2);font-weight:500">${escapeHtml(g.period)}</span>
                </div>
              `).join('');
            } else {
              periodLinesHtml = `<div style="font-size:11.5px;line-height:1.4;font-weight:600;color:var(--txt)">${escapeHtml(summaryPeriod)}</div>`;
            }
            return `
            <tr>
              <td style="padding:10px 12px"><strong style="color:var(--blu);font-family:monospace;font-size:12.5px">${escapeHtml(tx.receiptNo)}</strong></td>
              <td style="padding:10px 12px;word-break:break-word"><strong>${escapeHtml(tx.studentName)}</strong> <span class="chip cb2" style="font-size:10px;margin-left:4px">${escapeHtml(tx.admno)}</span></td>
              <td style="padding:10px 6px;text-align:center"><span class="chip cr" style="font-size:11px">${clL(tx.cls)}${tx.section ? ' (' + escapeHtml(tx.section) + ')' : ''}</span></td>
              <td style="padding:10px 12px;vertical-align:top">${periodLinesHtml}</td>
              <td style="padding:10px 8px;text-align:center">${escapeHtml(tx.date || '–')}</td>
              <td style="padding:10px 8px;text-align:center"><span class="chip cg" style="font-size:11px">${escapeHtml(tx.mode || 'Cash')}</span></td>
              <td style="padding:10px 12px;font-weight:700;color:var(--grn);text-align:right;font-size:13.5px;white-space:nowrap">₹${tx.amount.toLocaleString('en-IN')}</td>
              <td style="padding:8px 6px;text-align:center;box-sizing:border-box">
                <button class="btn bo bsm" id="btn_bkd_${idx}" onclick="togglePaymentBreakdown(${idx})" style="font-size:11px;padding:4px 8px;white-space:nowrap;cursor:pointer;display:inline-flex;align-items:center;justify-content:center">👁 View Breakdown</button>
              </td>
            </tr>
            <tr id="row_bkd_${idx}" style="display:none;background:#fafbfc">
              <td colspan="8" style="padding:10px 16px;border-top:none;border-bottom:1.5px solid var(--bdr)">
                <div style="font-size:11px;font-weight:700;color:var(--txt2);text-transform:uppercase;margin-bottom:6px">Allocations Included in Receipt ${escapeHtml(tx.receiptNo)}:</div>
                <table style="width:100%;font-size:12px;background:#ffffff;border:1px solid var(--bdr);border-radius:6px;overflow:hidden">
                  <thead>
                    <tr style="background:#f1f4f8">
                      <th style="padding:6px 10px;font-size:11px;text-align:left">#</th>
                      <th style="padding:6px 10px;font-size:11px;text-align:left">Period</th>
                      <th style="padding:6px 10px;font-size:11px;text-align:left">Category</th>
                      <th style="padding:6px 10px;font-size:11px;text-align:right">Allocated Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${groupedAllocations.length > 0 ? groupedAllocations.map((it, itemIdx) => {
                      return `
                        <tr>
                          <td style="padding:5px 10px;color:var(--txt2);width:30px">${itemIdx + 1}</td>
                          <td style="padding:5px 10px;font-weight:600">${escapeHtml(it.period)}</td>
                          <td style="padding:5px 10px"><span class="chip cb2" style="font-size:10.5px">${escapeHtml(it.type || 'Fee')}</span></td>
                          <td style="padding:5px 10px;text-align:right;font-weight:700;color:var(--grn)">₹${it.amount.toLocaleString('en-IN')}</td>
                        </tr>
                      `;
                    }).join('') : `
                      <tr>
                        <td colspan="4" style="padding:8px 10px;color:var(--txt2);text-align:center">Direct payment transaction of ₹${tx.amount.toLocaleString('en-IN')}</td>
                      </tr>
                    `}
                  </tbody>
                </table>
              </td>
            </tr>
          `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
  openM('collectedM');
}

function printCollected() {
  const transactions = getValidPaymentTransactions();
  const s = DB.settings || {};
  const totalColl = transactions.reduce((a, r) => a + r.amount, 0);

  const html = `<!DOCTYPE html><html><head><title>Fee Collection Report</title>
  <style>
    body{font-family:Arial,sans-serif;margin:20px;font-size:12px}
    table{width:100%;border-collapse:collapse;margin-top:10px}
    th{background:#27ae60;color:#fff;padding:7px 10px;text-align:left;font-size:11px}
    td{padding:6px 10px;border-bottom:1px solid #eee}
    tr:nth-child(even){background:#fafafa}
    .hdr{text-align:center;margin-bottom:14px;border-bottom:2px solid #27ae60;padding-bottom:10px}
    @media print{body{margin:0}}
  </style>
  </head><body>
  <div class="hdr">
    <div style="font-size:16px;font-weight:700;color:#27ae60">${escapeHtml(s.schoolName || 'School Management System')}</div>
    <div style="font-size:11px;color:#666">${escapeHtml(s.schoolAddr || '')} | Phone: ${escapeHtml(s.schoolPhone || '')}</div>
    <div style="font-size:13px;font-weight:600;margin-top:5px">Fee Collection Ledger Report (Receipt Summary)</div>
    <div style="font-size:11px;color:#666">Generated: ${new Date().toLocaleDateString('en-IN')}</div>
  </div>
  <div style="background:#e8f8f5;border:1px solid #a9dfbf;padding:10px 14px;margin-bottom:12px;display:flex;justify-content:space-between">
    <div><strong>Total Collections:</strong> ₹${totalColl.toLocaleString('en-IN')}</div>
    <div><strong>Total Receipts:</strong> ${transactions.length}</div>
  </div>
  <table>
    <thead>
      <tr><th>Receipt #</th><th>Student</th><th>Class</th><th>Period</th><th>Date</th><th>Mode</th><th style="text-align:right">Amount</th></tr>
    </thead>
    <tbody>
      ${transactions.map(tx => {
        const summaryPeriod = getTransactionSummaryPeriod(tx);
        return `
        <tr>
          <td><strong>${escapeHtml(tx.receiptNo)}</strong></td>
          <td>${escapeHtml(tx.studentName)} (${escapeHtml(tx.admno)})</td>
          <td>${clL(tx.cls)} Sec ${escapeHtml(tx.section)}</td>
          <td>${escapeHtml(summaryPeriod)}</td>
          <td>${escapeHtml(tx.date || '–')}</td>
          <td>${escapeHtml(tx.mode || 'Cash')}</td>
          <td style="text-align:right;font-weight:700;color:#27ae60">₹${tx.amount.toLocaleString('en-IN')}</td>
        </tr>
      `;
      }).join('')}
    </tbody>
  </table>
  <div style="margin-top:20px;display:flex;justify-content:space-between;font-size:11px;color:#666;border-top:1px solid #eee;padding-top:8px">
    <span>Authorized Signatory: ${escapeHtml(s.principalName || '')}</span>
    <span>Printed on: ${new Date().toLocaleString('en-IN')}</span>
  </div>
  </body></html>`;

  if (isEl && window.electronAPI && window.electronAPI.printContent) {
    window.electronAPI.printContent(html);
  } else {
    const w = window.open('', '_blank');
    if (w) {
      w.document.write(html);
      w.document.close();
    }
  }
}

// Filtered Pending Details Modal & Multi-Filter Logic
let cachedFilteredPendingRows = [];

function getPendingFeesDueList(options = {}) {
  const curSess = (DB.settings && DB.settings.currentSession) || '2026–27';
  const [curStartY, curEndY] = parseSessionYears(curSess);
  const selCls = options.cls || '';
  const selSessMode = options.sessMode || 'current';
  const selDueType = options.dueType || 'current';
  const selMonth = options.month || '';
  const selYear = options.year ? parseInt(options.year) : null;

  let rows = [];
  const activeStudents = (DB.students || []).filter(s => s.status !== 'Inactive' && s.status !== 'Left School' && s.status !== 'Alumni');
  const targetStudents = selCls ? activeStudents.filter(s => s.cls === selCls) : activeStudents;

  targetStudents.forEach(s => {
    // 1. Process verified previous session arrears if dueType is 'arrears' or 'all'
    const shouldIncludeArrears = (selDueType === 'arrears') ||
      (selSessMode === 'all') ||
      (selDueType === 'all' && (!selMonth || selMonth === 'April'));

    if (shouldIncludeArrears) {
      const arrearsList = getStudentPreviousArrearsBreakdown(s, curSess);
      arrearsList.forEach(item => {
        // If a specific month filter is active (e.g. September), only include if item matches that month or if dueType is strictly 'arrears'
        if (selMonth && selDueType !== 'arrears') {
          if (!item.period.includes(selMonth) && item.period !== 'Historical period unavailable') {
            return;
          }
        }
        rows.push({
          studentId: s.id,
          name: s.name,
          admno: s.admno,
          cls: s.cls,
          section: s.section || 'A',
          phone: s.phone,
          mo: item.period,
          yr: item.session,
          feeType: item.category,
          amount: item.remainingAmount,
          isArrears: true,
          arrearSession: item.session,
          arrearPeriod: item.period
        });
      });
    }

    // 2. Current session dues (if dueType is 'current' or 'all')
    if (selDueType === 'current' || selDueType === 'all') {
      const monthsToCheck = selMonth ? [selMonth] : MONTHS_LIST;

      monthsToCheck.forEach(m => {
        const mIdx = MONTHS_LIST.indexOf(m);
        const y = selYear || ((mIdx < 9) ? curStartY : curEndY);

        // Check period validity for student and current calendar due status
        if (!isPeriodValidForStudent(s, m, y)) return;
        if (!isFeeRecordCurrentlyDue(m, y, curSess)) return;

        const key = `${s.id}_${m}_${y}`;
        const feeArr = (DB.fees && Array.isArray(DB.fees[key])) ? DB.fees[key] : null;

        // A. School Fee
        let schoolRem = 0;
        if (feeArr && feeArr.length > 0) {
          const sf = feeArr.find(f => f.enabled !== false && (f.type === 'School Fee' || f.type === 'Tuition Fee'));
          if (sf && !sf.paid) {
            const amt = Number(sf.amount) || 0;
            const pPaid = Number(sf.partialPaid) || 0;
            schoolRem = (sf.partialRemaining !== undefined && sf.partialRemaining !== null) ? Number(sf.partialRemaining) : (amt - pPaid);
          }
        } else {
          const struct = (DB.feeStructures && DB.feeStructures[s.cls]) ? DB.feeStructures[s.cls] : { tuition: 400 };
          const cfg = getStudentFeeConfig(s.id);
          if (cfg.tuition !== false) {
            const schoolAmt = (cfg.customTuition !== null && cfg.customTuition !== undefined && cfg.customTuition !== '' && !isNaN(Number(cfg.customTuition)))
              ? Number(cfg.customTuition) : struct.tuition;
            let paidAmt = 0;
            if (Array.isArray(DB.payments)) {
              DB.payments.forEach(p => {
                if (!p.reversed && p.studentId === s.id && Array.isArray(p.items)) {
                  p.items.forEach(it => {
                    if (it.month === m && Number(it.year) === Number(y) && (it.type === 'School Fee' || it.type === 'Tuition')) {
                      paidAmt += (Number(it.paidAmount !== undefined ? it.paidAmount : (it.baseAmount || it.amount)) || 0);
                    }
                  });
                }
              });
            }
            schoolRem = Math.max(0, schoolAmt - paidAmt);
          }
        }

        if (schoolRem > 0) {
          rows.push({
            studentId: s.id,
            name: s.name,
            admno: s.admno,
            cls: s.cls,
            section: s.section || 'A',
            phone: s.phone,
            mo: m,
            yr: y,
            feeType: 'School Fee',
            amount: schoolRem,
            isArrears: false
          });
        }

        // B. Exam Fee (September, December, March)
        if (['September', 'December', 'March'].includes(m)) {
          if (!isExamFeeAlreadyPaid(s.id, m, y)) {
            let examRem = 0;
            if (feeArr && feeArr.length > 0) {
              const ef = feeArr.find(f => f.enabled !== false && f.type === 'Exam Fee');
              if (ef && !ef.paid) {
                const amt = Number(ef.amount) || 0;
                const pPaid = Number(ef.partialPaid) || 0;
                examRem = (ef.partialRemaining !== undefined && ef.partialRemaining !== null) ? Number(ef.partialRemaining) : (amt - pPaid);
              }
            } else {
              const struct = (DB.feeStructures && DB.feeStructures[s.cls]) ? DB.feeStructures[s.cls] : { examFee: 200 };
              const cfg = getStudentFeeConfig(s.id);
              if (cfg.examEnabled !== false) {
                examRem = (cfg.examFee !== null && cfg.examFee !== undefined && cfg.examFee !== '' && !isNaN(Number(cfg.examFee)))
                  ? Number(cfg.examFee) : (struct.examFee || 200);
              }
            }

            if (examRem > 0) {
              rows.push({
                studentId: s.id,
                name: s.name,
                admno: s.admno,
                cls: s.cls,
                section: s.section || 'A',
                phone: s.phone,
                mo: m,
                yr: y,
                feeType: 'Exam Fee',
                amount: examRem,
                isArrears: false
              });
            }
          }
        }

        // C. Admission Fee (April only)
        if (m === 'April') {
          const admStat = getStudentAdmissionFeeStatus(s.id, curSess);
          if (admStat.isDue && admStat.remainingAmount > 0) {
            rows.push({
              studentId: s.id,
              name: s.name,
              admno: s.admno,
              cls: s.cls,
              section: s.section || 'A',
              phone: s.phone,
              mo: 'April',
              yr: y,
              feeType: 'Admission Fee',
              amount: admStat.remainingAmount,
              isArrears: false
            });
          }
        }
      });
    }
  });

  // Sort rows chronologically by period then student
  rows.sort((a, b) => {
    if (a.isArrears && !b.isArrears) return -1;
    if (!a.isArrears && b.isArrears) return 1;
    const ka = getFeeYearMonthSortKey(a.mo, a.yr);
    const kb = getFeeYearMonthSortKey(b.mo, b.yr);
    if (ka !== kb) return ka - kb;
    return a.name.localeCompare(b.name);
  });

  return rows;
}

function showPendingDetail() {
  const modeSel = document.getElementById('db_period_mode');
  const mode = modeSel ? modeSel.value : 'current_month';
  const today = new Date();
  const curMo = SYS_MONTHS[today.getMonth()] || 'October';

  const clsSel = document.getElementById('pend_f_cls');
  if (clsSel) {
    clsSel.innerHTML = '<option value="">All Classes</option>' + CLASSES.map(c => `<option value="${c}">${clL(c)}</option>`).join('');
    clsSel.value = '';
  }

  const moSel = document.getElementById('pend_f_mo');
  const typeSel = document.getElementById('pend_f_type');
  const sessSel = document.getElementById('pend_f_sess');

  if (sessSel) sessSel.value = 'current';

  if (mode === 'full_session') {
    if (moSel) moSel.value = '';
    if (typeSel) typeSel.value = 'all';
  } else if (mode === 'custom_month' || mode === 'select_month') {
    const custMo = document.getElementById('db_mo')?.value || curMo;
    if (moSel) moSel.value = custMo;
    if (typeSel) typeSel.value = 'current';
  } else {
    // current_month
    if (moSel) moSel.value = curMo;
    if (typeSel) typeSel.value = 'current';
  }

  renderPendingFilteredTable();
  openM('pendingM');
}

function renderPendingFilteredTable() {
  const curSess = (DB.settings && DB.settings.currentSession) || '2026–27';
  const selCls = document.getElementById('pend_f_cls')?.value || '';
  const selSessMode = document.getElementById('pend_f_sess')?.value || 'current';
  const selDueType = document.getElementById('pend_f_type')?.value || 'current';
  const selMonth = document.getElementById('pend_f_mo')?.value || '';

  const rawRows = getPendingFeesDueList({
    cls: selCls,
    sessMode: selSessMode,
    dueType: selDueType,
    month: selMonth
  });

  const students = getConsolidatedPendingStudents(rawRows, curSess);
  cachedFilteredPendingRows = students;
  const body = document.getElementById('pendingBody');
  if (!body) return;

  if (!students.length) {
    body.innerHTML = '<div class="empty" style="color:var(--grn);padding:24px 0">✓ No outstanding dues found matching the selected report filters!</div>';
    return;
  }

  const totalDue = students.reduce((a, s) => a + s.totalAmount, 0);
  const totalItemCount = students.reduce((a, s) => a + s.breakdown.length, 0);

  body.innerHTML = `
    <div style="background:var(--rl);border-radius:8px;padding:12px 18px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;border:1px solid #f5b7b1;flex-shrink:0">
      <div>
        <div style="font-size:11.5px;color:var(--red);font-weight:600">Total Filtered Pending Dues</div>
        <div style="font-size:22px;font-weight:700;color:var(--red)">₹${totalDue.toLocaleString('en-IN')}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:12px;color:var(--red);font-weight:700">${students.length} student(s) · ${totalItemCount} due category line(s)</div>
        <div style="font-size:11px;color:var(--txt2);margin-top:2px">Active Session: ${curSess}</div>
      </div>
    </div>
    <div style="flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;width:100%;border:1px solid var(--bdr);border-radius:8px">
      <table style="width:100%;border-collapse:collapse;font-size:12.5px;table-layout:fixed">
        <colgroup>
          <col style="width:78px">
          <col style="width:15%">
          <col style="width:88px">
          <col style="width:15%">
          <col style="width:125px">
          <col style="width:auto">
          <col style="width:135px">
        </colgroup>
        <thead style="position:sticky;top:0;background:var(--bg);z-index:2">
          <tr>
            <th style="padding:11px 8px;text-align:center">Adm No</th>
            <th style="padding:11px 10px">Student Name</th>
            <th style="padding:11px 6px;text-align:center">Class/Sec</th>
            <th style="padding:11px 10px">Father Name</th>
            <th style="padding:11px 10px">Phone</th>
            <th style="padding:11px 10px">Fee Breakdown</th>
            <th style="padding:11px 12px;text-align:right">Total Amount Due</th>
          </tr>
        </thead>
        <tbody>
          ${students.map(r => `<tr>
            <td style="padding:10px 8px;text-align:center;vertical-align:top"><span class="chip cb2" style="font-size:11px">${escapeHtml(r.admno)}</span></td>
            <td style="padding:10px 10px;vertical-align:top;word-break:break-word"><strong>${escapeHtml(r.name)}</strong></td>
            <td style="padding:10px 6px;text-align:center;vertical-align:top"><span class="chip cr" style="font-size:11px">${clL(r.cls)}${r.section ? ' (' + escapeHtml(r.section) + ')' : ''}</span></td>
            <td style="padding:10px 10px;vertical-align:top;word-break:break-word">${escapeHtml(r.father || '–')}</td>
            <td style="padding:10px 10px;vertical-align:top;white-space:nowrap"><a href="tel:${escapeHtml(r.phone)}" style="color:var(--blu);font-weight:600;text-decoration:none">📞 ${escapeHtml(r.phone || '–')}</a></td>
            <td style="padding:10px 10px;vertical-align:top">
              <div style="font-size:12px;line-height:1.5;color:var(--txt)">
                ${r.breakdown.map(it => `
                  <div style="margin-bottom:3px;word-break:break-word">
                    • <strong>${escapeHtml(it.category)}:</strong> ${escapeHtml(it.period)} — <span style="font-weight:600;color:var(--txt)">₹${it.amount.toLocaleString('en-IN')}</span>
                  </div>
                `).join('')}
              </div>
            </td>
            <td style="padding:10px 12px;vertical-align:top;font-weight:700;color:var(--red);text-align:right;white-space:nowrap;font-size:14px">₹${r.totalAmount.toLocaleString('en-IN')}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

async function expPendingCSV() {
  if (!cachedFilteredPendingRows.length) {
    toast('No pending records to export for current filter!', 'warning');
    return;
  }
  let csv = 'Admission No,Student Name,Class,Section,Father Name,Phone,Due Period,Fee Breakdown,Total Amount Due\n';
  cachedFilteredPendingRows.forEach(r => {
    const cName = (r.name || '').replace(/"/g, '""');
    const fName = (r.father || '').replace(/"/g, '""');
    const period = (r.duePeriod || r.displayPeriod || '').replace(/"/g, '""');
    const bkdText = (r.breakdown || []).map(it => `${it.category}: ${it.period} - ₹${it.amount}`).join('; ').replace(/"/g, '""');
    const amt = r.totalAmount !== undefined ? r.totalAmount : r.amount;
    csv += `"${r.admno}","${cName}","${r.cls}","${r.section}","${fName}","${r.phone || ''}","${period}","${bkdText}",${amt}\n`;
  });
  await expCSV('pending_fee_report.csv', csv);
}

function printPendingList() {
  const body = document.getElementById('pendingBody');
  if (!body) return;
  const s = DB.settings || {};
  const html = `<!DOCTYPE html><html><head><title>Pending Fee Report</title>
  <style>body{font-family:Arial,sans-serif;margin:20px;font-size:12px}table{width:100%;border-collapse:collapse}th{background:#c0392b;color:#fff;padding:7px 10px;text-align:left;font-size:11px}td{padding:6px 10px;border-bottom:1px solid #eee;vertical-align:top}tr:nth-child(even){background:#fafafa}.hdr{text-align:center;margin-bottom:14px;border-bottom:2px solid #c0392b;padding-bottom:10px}@media print{body{margin:0}}</style>
  </head><body>
  <div class="hdr">
    <div style="font-size:16px;font-weight:700;color:#c0392b">${escapeHtml(s.schoolName || 'School Management System')}</div>
    <div style="font-size:11px;color:#666">${escapeHtml(s.schoolAddr || '')} | Phone: ${escapeHtml(s.schoolPhone || '')}</div>
    <div style="font-size:13px;font-weight:600;margin-top:5px">Pending Fees Summary Report</div>
    <div style="font-size:11px;color:#666">Generated: ${new Date().toLocaleDateString('en-IN')}</div>
  </div>
  ${body.innerHTML}
  <div style="margin-top:20px;display:flex;justify-content:space-between;font-size:11px;color:#666;border-top:1px solid #eee;padding-top:8px">
    <span>Authorized Signatory: ${escapeHtml(s.principalName || '')}</span>
    <span>Printed on: ${new Date().toLocaleString('en-IN')}</span>
  </div>
  </body></html>`;
  if (isEl && window.electronAPI && window.electronAPI.printContent) {
    window.electronAPI.printContent(html);
  } else {
    const w = window.open('', '_blank');
    if (w) {
      w.document.write(html);
      w.document.close();
    }
  }
}

// ============================================================
// 2. STUDENT MANAGEMENT
// ============================================================
function renderSt() {
  fillDDs();
  const cls = document.getElementById('fCls')?.value || '';
  const gen = document.getElementById('fGen')?.value || '';
  const stat = document.getElementById('fStat')?.value || '';
  const q = document.getElementById('gSch')?.value.trim().toLowerCase() || '';

  let list = DB.students || [];
  if (cls) list = list.filter(s => s.cls === cls);
  if (gen) list = list.filter(s => s.gender === gen);
  if (stat) list = list.filter(s => (s.status || 'Active') === stat);
  if (q) {
    list = list.filter(s =>
      (s.name && s.name.toLowerCase().includes(q)) ||
      (s.father && s.father.toLowerCase().includes(q)) ||
      String(s.admno).toLowerCase().includes(q) ||
      (s.srNo && String(s.srNo).toLowerCase().includes(q))
    );
  }

  const tb = document.getElementById('sTb');
  if (!tb) return;
  if (!list.length) {
    tb.innerHTML = '<tr><td colspan="9" class="empty">No students found matching current filters</td></tr>';
    return;
  }

  tb.innerHTML = list.map(s => {
    const stClass = s.status === 'Active' ? 'cg' : s.status === 'Inactive' ? 'cy' : 'cgr';
    const srChip = s.srNo ? `<span class="chip" style="background:var(--card);border:1px solid var(--bdr);font-size:11px">${s.srNo}</span>` : '<span style="color:var(--txt2);font-size:11px">–</span>';
    return `<tr>
      <td><span class="chip cb2">${s.admno}</span></td>
      <td>${srChip}</td>
      <td><strong>${s.name}</strong></td>
      <td><span class="chip cr">${clL(s.cls)}</span> <span style="font-size:11px;color:var(--txt2)">Sec ${s.section || 'A'}</span></td>
      <td>${s.father}</td>
      <td><a href="tel:${s.phone}" style="color:var(--blu);text-decoration:none">${s.phone}</a></td>
      <td>${s.gender}</td>
      <td><span class="chip ${stClass}">${s.status || 'Active'}</span></td>
      <td style="display:flex;gap:4px">
        <button class="btn bo bsm" title="View Profile" onclick="viewProf(${s.id})">👁</button>
        <button class="btn bo bsm" title="Edit Student" onclick="editSt(${s.id})">✏</button>
        <button class="btn bd bsm" title="Archive / Delete" onclick="delSt(${s.id})">🗑</button>
      </td>
    </tr>`;
  }).join('');
}

// Helper: Get local date formatted as YYYY-MM-DD
function getTodayLocalDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Helper: Get currently configured active academic session
function getActiveAcademicSession() {
  if (DB.settings && DB.settings.currentSession && String(DB.settings.currentSession).trim()) {
    return String(DB.settings.currentSession).trim();
  }
  const activeSess = (DB.sessions || []).find(s => s.active === true || s.status === 'Active');
  if (activeSess && activeSess.name && String(activeSess.name).trim()) {
    return String(activeSess.name).trim();
  }
  return '';
}

// Helper: Extract highest previously issued numeric admission number
function getMaxIssuedAdmissionNumber(specificPrefix) {
  const prefix = (specificPrefix !== undefined)
    ? specificPrefix
    : ((DB && DB.settings && DB.settings.admissionPrefix) ? DB.settings.admissionPrefix : '');
  const prefixNorm = String(prefix || '').trim().toLowerCase();

  let maxIssued = 0;
  ((DB && DB.students) || []).forEach(s => {
    const adm = String(s.admno || '').trim();
    if (!adm) return;

    if (prefixNorm) {
      if (adm.toLowerCase().startsWith(prefixNorm)) {
        const numPart = parseInt(adm.slice(prefix.length), 10);
        if (!isNaN(numPart) && numPart > maxIssued) {
          maxIssued = numPart;
        }
      }
    } else {
      const numPart = parseInt(adm, 10);
      if (!isNaN(numPart) && String(numPart) === adm && numPart > maxIssued) {
        maxIssued = numPart;
      }
    }
  });
  return maxIssued;
}

// Helper: Generate next guaranteed unique admission number adhering to sequence rules
function generateNextUniqueAdmissionNumber() {
  const prefix = (DB.settings && DB.settings.admissionPrefix) ? DB.settings.admissionPrefix : '';
  const existingSet = new Set((DB.students || []).map(s => String(s.admno || '').trim().toLowerCase()));

  const maxIssued = getMaxIssuedAdmissionNumber(prefix);
  const configured = parseInt(DB.nextAdm, 10);

  // Sequence Determination Rules:
  // 1. In a fresh database or when prefix has never been used (maxIssued === 0), start from configured value (or 1)
  // 2. When admissions already exist (maxIssued > 0), the sequence continues safely without creating duplicates.
  //    If configured is greater than maxIssued, allow the safe forward jump; otherwise continue from maxIssued + 1.
  let startSeq = 1;
  if (maxIssued === 0) {
    startSeq = (configured && configured > 0) ? configured : 1;
  } else {
    startSeq = (configured && configured > maxIssued) ? configured : (maxIssued + 1);
  }

  let seq = startSeq;
  let candidate = prefix + String(seq);
  while (existingSet.has(candidate.toLowerCase())) {
    seq++;
    candidate = prefix + String(seq);
  }

  return {
    admno: candidate,
    nextSeq: seq + 1,
    maxIssued: maxIssued,
    startSeq: startSeq
  };
}

// Helper: Populate student form section dropdown based on class configuration
function populateStudentSections(cls, currentSec = 'A') {
  const secEl = document.getElementById('s_sec');
  if (!secEl) return;
  const configured = (DB.classSections && DB.classSections[cls]) ? DB.classSections[cls] : [];
  let secNames = configured.map(s => s.name).filter(Boolean);
  if (!secNames.length) {
    secNames = ['A', 'B', 'C', 'D'];
  }
  if (currentSec && !secNames.includes(currentSec)) {
    secNames.push(currentSec);
  }
  secEl.innerHTML = secNames.map(s => `<option value="${escapeHtml(s)}"${s === currentSec ? ' selected' : ''}>Section ${escapeHtml(s)}</option>`).join('');
}

function onStudentFormClassChange() {
  const cls = document.getElementById('s_cl')?.value;
  const currentSec = document.getElementById('s_sec')?.value || 'A';
  populateStudentSections(cls, currentSec);
}

function openAddStudent(btn) {
  resetForm();
  showPage('addstudent', btn || null);
}

let isStudentSaving = false;

function saveStudent() {
  if (isStudentSaving) {
    console.warn('Student save operation already in progress, ignoring duplicate trigger.');
    return;
  }
  isStudentSaving = true;
  try {
    const name = String(document.getElementById('s_n')?.value || '').trim();
  const father = String(document.getElementById('s_f')?.value || '').trim();
  const mother = String(document.getElementById('s_m')?.value || '').trim();
  const dob = String(document.getElementById('s_dob')?.value || '').trim();
  const gender = String(document.getElementById('s_g')?.value || '').trim();
  const phone = String(document.getElementById('s_ph')?.value || '').trim();
  const address = String(document.getElementById('s_ad')?.value || '').trim();
  const cls = String(document.getElementById('s_cl')?.value || '').trim();
  const section = String(document.getElementById('s_sec')?.value || '').trim();
  const eid = String(document.getElementById('s_eid')?.value || '').trim();

  // 1. Mandatory Fields Validation
  const missing = [];
  if (!name) missing.push('Student Name');
  if (!father) missing.push("Father's Name");
  if (!mother) missing.push("Mother's Name");
  if (!dob) missing.push('Date of Birth');
  if (!gender) missing.push('Gender');
  if (!phone) missing.push('Phone Number');
  if (!address) missing.push('Residential Address');
  if (!cls) missing.push('Class');
  if (!section) missing.push('Section');

  if (missing.length > 0) {
    toast(`Please fill all required fields: ${missing.join(', ')}`, 'error');
    return;
  }

  // 2. Academic Session Handling
  const activeSession = getActiveAcademicSession();
  let session = '';
  if (eid) {
    const existingStudent = DB.students.find(s => s.id === parseInt(eid));
    if (!existingStudent) {
      toast('Student record not found for editing!', 'error');
      return;
    }
    // Strictly preserve existing student's session
    session = existingStudent.session || activeSession;
    if (!session) {
      toast('No active academic session is configured. Please configure an academic session first.', 'error');
      return;
    }
  } else {
    // For new student, active session must be configured
    if (!activeSession) {
      toast('Cannot add student: No active academic session is currently configured. Please configure an active academic session in Settings or Academic Sessions first.', 'error');
      return;
    }
    session = activeSession;
  }

  // 3. Prevent Duplicate Roll Numbers within same class and section
  const rollno = String(document.getElementById('s_rn')?.value || '').trim();
  if (rollno) {
    const normRoll = rollno.toLowerCase();
    const normCls = String(cls).trim().toLowerCase();
    const normSec = String(section).trim().toLowerCase();

    const conflict = (DB.students || []).find(s => {
      if (eid && s.id === parseInt(eid)) return false;
      if (s.status === 'Inactive') return false; // Inactive / archived students do not block roll numbers
      const sRoll = String(s.rollno || '').trim().toLowerCase();
      if (!sRoll) return false;
      const sCls = String(s.cls || '').trim().toLowerCase();
      const sSec = String(s.section || 'A').trim().toLowerCase();
      return sRoll === normRoll && sCls === normCls && sSec === normSec;
    });

    if (conflict) {
      toast(`Duplicate Roll Number! Roll Number "${rollno}" is already assigned to student "${conflict.name}" (Adm: ${conflict.admno}) in Class ${clL(cls)}, Section ${section}.`, 'error');
      return;
    }
  }

  // 3b. Student SR No. Uniqueness Validation (Optional field, but must be unique if provided)
  const srNo = String(document.getElementById('s_srn')?.value || '').trim();
  if (srNo) {
    const normSr = srNo.toLowerCase();
    const conflictSr = (DB.students || []).find(s => {
      if (eid && s.id === parseInt(eid)) return false;
      const otherSr = String(s.srNo || '').trim().toLowerCase();
      return otherSr && otherSr === normSr;
    });
    if (conflictSr) {
      toast(`Duplicate SR Number! SR Number "${srNo}" is already assigned to student "${conflictSr.name}" (Adm: ${conflictSr.admno}). SR Numbers must be unique.`, 'error');
      const srInput = document.getElementById('s_srn');
      if (srInput) srInput.focus();
      return;
    }
  }

  // 4. Admission Number & Admission Date Handling
  let admVal = '';
  let admissionDate = '';

  if (eid) {
    const existingStudent = DB.students.find(s => s.id === parseInt(eid));
    admVal = existingStudent.admno; // Strictly preserve existing admission number
    admissionDate = existingStudent.admissionDate || getTodayLocalDate(); // Strictly preserve existing admission date

    // Validate that admVal is unique across other students
    const duplicate = (DB.students || []).find(s => s.id !== parseInt(eid) && String(s.admno).trim().toLowerCase() === String(admVal).trim().toLowerCase());
    if (duplicate) {
      toast(`Admission number "${admVal}" is already in use by another student (${duplicate.name})!`, 'error');
      return;
    }
  } else {
    // Generate next unique admission number
    const gen = generateNextUniqueAdmissionNumber();
    admVal = gen.admno;
    admissionDate = getTodayLocalDate();

    // Final safety validation at save time across ALL existing students (active & inactive)
    const existingConflict = (DB.students || []).find(s => String(s.admno || '').trim().toLowerCase() === String(admVal).trim().toLowerCase());
    if (existingConflict) {
      toast(`Admission number "${admVal}" already exists for student "${existingConflict.name}"! Sequence auto-advanced. Please try again.`, 'error');
      DB.nextAdm = Math.max(DB.nextAdm || 1, gen.nextSeq + 1);
      return;
    }

    DB.nextAdm = gen.nextSeq;
  }

  // 5. Build Student Object
  const studentObj = {
    id: eid ? parseInt(eid) : (DB.nextId++),
    name,
    father,
    mother,
    dob,
    gender,
    blood: document.getElementById('s_b').value || 'B+',
    phone,
    email: document.getElementById('s_em').value.trim(),
    address,
    admno: admVal,
    srNo: srNo || '',
    rollno,
    cls,
    section,
    admissionDate,
    session,
    status: document.getElementById('s_stat').value || 'Active',
    academicHistory: [],
    enrollments: []
  };

  if (eid) {
    const idx = DB.students.findIndex(s => s.id === parseInt(eid));
    if (idx >= 0) {
      studentObj.academicHistory = DB.students[idx].academicHistory || [];
      studentObj.enrollments = DB.students[idx].enrollments || [];
      // Guarantee admissionDate invariant
      studentObj.admissionDate = DB.students[idx].admissionDate || admissionDate;
      // Ensure enrollment for current session is synchronized
      let enr = studentObj.enrollments.find(e => e.session === session);
      if (enr) {
        enr.cls = cls;
        enr.section = section;
        enr.rollno = rollno;
        enr.status = studentObj.status;
      } else {
        studentObj.enrollments.push({
          session,
          cls,
          section,
          rollno,
          status: studentObj.status,
          enrolledAt: studentObj.admissionDate
        });
      }
      DB.students[idx] = Object.assign({}, DB.students[idx], studentObj);
      logActivity('Student Edited', `Updated profile for ${name} (Adm: ${admVal})`);
      toast(`Student "${name}" updated successfully!`);
    }
  } else {
    studentObj.enrollments = [{
      session,
      cls,
      section,
      rollno,
      status: studentObj.status,
      enrolledAt: admissionDate
    }];
    DB.students.push(studentObj);
    logActivity('Student Added', `Enrolled new student ${name} (Adm: ${admVal}) in ${clL(cls)}`);
    toast(`Student "${name}" added successfully!`);
  }

    saveDB(true);
    resetForm();
    showPage('students', null);
  } finally {
    isStudentSaving = false;
  }
}

function resetForm() {
  ['s_n','s_f','s_m','s_dob','s_ph','s_em','s_ad','s_rn','s_srn','s_eid'].forEach(id => {
    const e = document.getElementById(id);
    if (e) e.value = '';
  });
  if (document.getElementById('s_g')) document.getElementById('s_g').value = 'Male';
  if (document.getElementById('s_b')) document.getElementById('s_b').value = 'B+';
  if (document.getElementById('s_stat')) document.getElementById('s_stat').value = 'Active';
  if (document.getElementById('s_cl')) document.getElementById('s_cl').value = '';
  populateStudentSections('', 'A');

  const admDtEl = document.getElementById('s_admdt');
  if (admDtEl) admDtEl.value = getTodayLocalDate();

  const sessEl = document.getElementById('s_sess');
  if (sessEl) sessEl.value = getActiveAcademicSession();

  const anEl = document.getElementById('s_an');
  if (anEl) {
    const gen = generateNextUniqueAdmissionNumber();
    anEl.value = gen.admno;
  }

  const sftEl = document.getElementById('sft');
  if (sftEl) sftEl.textContent = 'Add New Student';
}

function editSt(id) {
  const s = DB.students.find(x => x.id === id);
  if (!s) return;
  showPage('addstudent', null);
  fillDDs();

  document.getElementById('sft').textContent = 'Edit Student — ' + s.name;
  document.getElementById('s_eid').value = String(s.id);
  document.getElementById('s_n').value = s.name || '';
  document.getElementById('s_f').value = s.father || '';
  document.getElementById('s_m').value = s.mother || '';
  document.getElementById('s_dob').value = s.dob || '';
  document.getElementById('s_g').value = s.gender || 'Male';
  document.getElementById('s_b').value = s.blood || 'B+';
  document.getElementById('s_ph').value = s.phone || '';
  document.getElementById('s_em').value = s.email || '';
  document.getElementById('s_ad').value = s.address || '';

  // Preserved fields - read-only
  document.getElementById('s_an').value = s.admno || '';
  document.getElementById('s_srn').value = s.srNo || '';
  document.getElementById('s_admdt').value = s.admissionDate || '';
  document.getElementById('s_sess').value = s.session || (DB.settings.currentSession || '2026–27');

  document.getElementById('s_cl').value = s.cls || '';
  populateStudentSections(s.cls, s.section || 'A');
  document.getElementById('s_sec').value = s.section || 'A';
  document.getElementById('s_rn').value = s.rollno || '';
  document.getElementById('s_stat').value = s.status || 'Active';
}

function delSt(id) {
  const s = DB.students.find(x => x.id === id);
  if (!s) return;

  // Check if financial history exists
  let hasFinancialHistory = false;
  Object.keys(DB.fees || {}).forEach(k => {
    if (k.startsWith(s.id + '_')) {
      const arr = DB.fees[k];
      if (Array.isArray(arr) && arr.some(f => f.paid || (f.partialPaid && f.partialPaid > 0))) hasFinancialHistory = true;
    }
  });
  if (!hasFinancialHistory && Array.isArray(DB.payments)) {
    hasFinancialHistory = DB.payments.some(p => !p.reversed && (p.studentId === s.id || String(p.admno) === String(s.admno)));
  }

  if (hasFinancialHistory) {
    if (confirm(`Student "${s.name}" has recorded financial payment history and cannot be permanently destroyed without losing audit trails.\n\nWould you like to mark this student as "Inactive / Archived" instead?`)) {
      s.status = 'Inactive';
      saveDB(true);
      renderSt();
      logActivity('Student Archived', `Student ${s.name} (Adm: ${s.admno}) status changed to Inactive due to existing financial history.`);
      toast(`Student "${s.name}" archived as Inactive`, 'warning');
    }
    return;
  }

  if (confirm(`Are you sure you want to delete student "${s.name}" (Adm: ${s.admno})? This action cannot be undone.`)) {
    DB.students = DB.students.filter(x => x.id !== id);
    saveDB(true);
    renderSt();
    logActivity('Student Deleted', `Deleted student record for ${s.name} (Adm: ${s.admno})`);
    toast(`Student "${s.name}" deleted`, 'warning');
  }
}

function viewProf(id) {
  const s = DB.students.find(x => x.id === id);
  if (!s) return;
  const initials = s.name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();

  // Financial summary for student
  let totFees = 0, totPaid = 0;
  Object.entries(DB.fees || {}).forEach(([k, arr]) => {
    if (k.startsWith(s.id + '_') && Array.isArray(arr)) {
      arr.forEach(f => {
        if (f.enabled !== false) {
          totFees += (Number(f.amount) || 0);
          if (f.paid) totPaid += (Number(f.amount) || 0);
        }
      });
    }
  });

  document.getElementById('profB').innerHTML = `
    <div class="ph">
      <div class="pa">${initials}</div>
      <div>
        <h2 style="font-size:18px;margin-bottom:4px">${s.name}</h2>
        <p style="opacity:.9">${clL(s.cls)} – Section ${s.section || 'A'} | Adm No: ${s.admno}${s.srNo ? ` | SR No: ${s.srNo}` : ''}</p>
        <p style="opacity:.75;font-size:12px">Father: ${s.father} | Mother: ${s.mother || '–'}</p>
      </div>
    </div>
    <div class="g3" style="gap:10px;margin-bottom:14px">
      ${pf('Date of Birth', s.dob || '–')}
      ${pf('Gender', s.gender)}
      ${pf('Blood Group', s.blood)}
      ${pf('Student SR No.', s.srNo || '–')}
      ${pf('Roll Number', s.rollno || '–')}
      ${pf('Contact Phone', s.phone)}
      ${pf('Email', s.email || '–')}
      ${pf('Academic Session', s.session || '2026–27')}
      ${pf('Admission Date', s.admissionDate || '–')}
      ${pf('Current Status', s.status || 'Active')}
    </div>
    <div style="background:var(--bg);border-radius:7px;padding:10px 14px;margin-bottom:12px">
      <div style="font-size:10.5px;color:var(--txt2);margin-bottom:2px">Residential Address</div>
      <div style="font-weight:500;font-size:13px">${s.address || '–'}</div>
    </div>
    <!-- Academic Session Enrollments & Progression -->
    <div style="background:var(--bg);border-radius:7px;padding:10px 14px;margin-bottom:12px;border:1px solid var(--bdr)">
      <div style="font-size:11px;font-weight:700;color:var(--txt);margin-bottom:6px">📚 Academic Session Enrollments & Progression</div>
      ${getStudentEnrollments(s).map(e => `
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;padding:3px 0;border-bottom:1px dashed #e2e8f0">
          <span><strong>Class ${clL(e.cls)}</strong> (Sec ${e.section || 'A'}) — Session <strong>${e.session}</strong></span>
          <span class="chip ${e.session === s.session ? 'cg' : 'cgr'}" style="font-size:10px">${e.status || (e.session === s.session ? 'Current' : 'Historical')}</span>
        </div>
      `).join('')}
    </div>
    <div class="g3" style="gap:10px;margin-bottom:12px">
      <div class="fb"><div class="lbl">Total Fees Billed</div><div class="amt" style="font-size:16px">₹${totFees.toLocaleString('en-IN')}</div></div>
      <div class="fb"><div class="lbl">Total Fees Paid</div><div class="amt" style="font-size:16px;color:var(--grn)">₹${totPaid.toLocaleString('en-IN')}</div></div>
      <div class="fb"><div class="lbl">Outstanding Due</div><div class="amt" style="font-size:16px;color:var(--red)">₹${(totFees - totPaid).toLocaleString('en-IN')}</div></div>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="btn bo bsm" onclick="editSt(${id});closeM('profM')">✏ Edit Profile</button>
      <button class="btn bp bsm" onclick="closeM('profM');curFSid=${id};showPage('fees',null)">💳 View Fee Ledger</button>
    </div>`;
  openM('profM');
}

function pf(label, val) {
  return `<div style="background:var(--bg);border-radius:7px;padding:8px 12px">
    <div style="font-size:10.5px;color:var(--txt2);margin-bottom:2px">${label}</div>
    <div style="font-weight:600;font-size:12.5px">${val}</div>
  </div>`;
}

// ============================================================
// 3. CLASS AND SECTION MANAGEMENT
// ============================================================
function renderClasses() {
  const list = document.getElementById('clsList');
  if (!list) return;
  list.innerHTML = '';
  CLASSES.forEach(c => {
    const studentCount = (DB.students || []).filter(s => s.cls === c && s.status !== 'Inactive' && s.status !== 'Left School' && s.status !== 'Alumni').length;
    const btn = document.createElement('button');
    btn.className = 'btn ' + (selClassForSections === c ? 'bp' : 'bo');
    btn.style.cssText = 'width:100%;justify-content:space-between;font-size:12.5px;margin-bottom:3px';
    btn.innerHTML = `<span>${clL(c)}</span><span class="chip ${selClassForSections === c ? 'cg' : 'cb2'}">${studentCount} students</span>`;
    btn.onclick = () => {
      selClassForSections = c;
      renderClasses();
      renderClassSectionsDetail();
    };
    list.appendChild(btn);
  });
  renderClassSectionsDetail();
}

function renderClassSectionsDetail() {
  const c = selClassForSections || 'NC';
  const title = document.getElementById('secClsT');
  if (title) title.textContent = clL(c) + ' - Sections & Record';

  const sections = (DB.classSections && DB.classSections[c]) ? DB.classSections[c] : [];
  const classStudents = (DB.students || []).filter(s => s.cls === c && s.status !== 'Inactive' && s.status !== 'Left School' && s.status !== 'Alumni');
  const body = document.getElementById('classDetailBody');
  if (!body) return;

  const sectionRows = sections.map((sec, i) => {
    const secCount = classStudents.filter(s => s.section === sec.name).length;
    return `<tr>
      <td><strong>Section ${sec.name}</strong></td>
      <td>${sec.teacher || '<span style="color:var(--txt2)">Unassigned</span>'}</td>
      <td><span class="chip cg">${secCount} Students</span></td>
      <td>
        <button class="btn bo bsm" onclick="editSection(${i})">✏ Edit Teacher</button>
        <button class="btn bd bsm" onclick="deleteSection(${i})">🗑 Delete</button>
      </td>
    </tr>`;
  }).join('');

  body.innerHTML = `
    <div style="margin-bottom:14px">
      <div style="font-size:12px;color:var(--txt2);margin-bottom:6px">Sections for ${clL(c)} (Teacher assignments are for school record):</div>
      <div class="tw"><table>
        <thead><tr><th>Section</th><th>Class Teacher</th><th>Student Count</th><th>Actions</th></tr></thead>
        <tbody>${sectionRows || '<tr><td colspan="4" class="empty">No sections configured for this class</td></tr>'}</tbody>
      </table></div>
    </div>
    <div style="margin-top:16px;border-top:1px solid var(--bdr);padding-top:14px">
      <div style="font-weight:600;font-size:13px;margin-bottom:8px">Enrolled Students in ${clL(c)} (${classStudents.length} total)</div>
      <div class="tw"><table>
        <thead><tr><th>Adm No</th><th>Name</th><th>Section</th><th>Roll No</th><th>Father</th><th>Phone</th></tr></thead>
        <tbody>${classStudents.length ? classStudents.map(s => `<tr>
          <td><span class="chip cb2">${s.admno}</span></td>
          <td><strong>${s.name}</strong></td>
          <td>${s.section || 'A'}</td>
          <td>${s.rollno || '–'}</td>
          <td>${s.father}</td>
          <td>${s.phone}</td>
        </tr>`).join('') : '<tr><td colspan="6" class="empty">No students enrolled in this class</td></tr>'}</tbody>
      </table></div>
    </div>`;
}

function openAddSecModal() {
  document.getElementById('secMTitle').textContent = 'Add Section for ' + clL(selClassForSections);
  document.getElementById('sec_name').value = '';
  document.getElementById('sec_teacher').value = '';
  document.getElementById('sec_edit_idx').value = '-1';
  openM('secM');
}

function editSection(i) {
  const c = selClassForSections;
  const sec = DB.classSections[c][i];
  if (!sec) return;
  document.getElementById('secMTitle').textContent = 'Edit Section ' + sec.name + ' (' + clL(c) + ')';
  document.getElementById('sec_name').value = sec.name;
  document.getElementById('sec_teacher').value = sec.teacher || '';
  document.getElementById('sec_edit_idx').value = i;
  openM('secM');
}

function saveSection() {
  const c = selClassForSections;
  const name = document.getElementById('sec_name').value.trim().toUpperCase();
  const teacher = document.getElementById('sec_teacher').value.trim();
  const editIdx = parseInt(document.getElementById('sec_edit_idx').value);

  if (!name) {
    toast('Section name is required (e.g. A, B)', 'error');
    return;
  }

  if (!DB.classSections[c]) DB.classSections[c] = [];

  if (editIdx >= 0) {
    DB.classSections[c][editIdx].name = name;
    DB.classSections[c][editIdx].teacher = teacher;
  } else {
    if (DB.classSections[c].some(s => s.name === name)) {
      toast(`Section "${name}" already exists for this class!`, 'error');
      return;
    }
    DB.classSections[c].push({ name, teacher });
  }

  saveDB(true);
  closeM('secM');
  renderClassSectionsDetail();
  logActivity('Section Configured', `Saved section ${name} for ${clL(c)} (Teacher: ${teacher || 'None'})`);
  toast('Section saved successfully!');
}

function deleteSection(i) {
  const c = selClassForSections;
  const sec = DB.classSections[c][i];
  if (!sec) return;

  // Check if safe to delete (any students currently assigned)
  const assigned = (DB.students || []).filter(s => s.cls === c && s.section === sec.name);
  if (assigned.length > 0) {
    toast(`Cannot delete Section ${sec.name}: ${assigned.length} students currently assigned! Please reassign them first.`, 'error');
    return;
  }

  if (confirm(`Delete Section ${sec.name} for ${clL(c)}?`)) {
    DB.classSections[c].splice(i, 1);
    saveDB(true);
    renderClassSectionsDetail();
    logActivity('Section Deleted', `Deleted section ${sec.name} from ${clL(c)}`);
    toast('Section deleted', 'warning');
  }
}

// ============================================================
// 4. ACADEMIC SESSIONS & PROMOTION
// ============================================================
let curBulkPromotionAction = null;

function getSessionDates(sess) {
  if (!sess) return { startDate: '', endDate: '' };
  if (sess.startDate && sess.endDate) {
    return { startDate: sess.startDate, endDate: sess.endDate };
  }
  const [startY, endY] = parseSessionYears(sess.name);
  const start = `${startY}-04-01`;
  const end = `${endY}-03-31`;
  if (!sess.startDate) sess.startDate = start;
  if (!sess.endDate) sess.endDate = end;
  return { startDate: start, endDate: end };
}

function getSessionStatus(sess, todayStr = null) {
  const t = todayStr || new Date().toISOString().split('T')[0];
  const { startDate, endDate } = getSessionDates(sess);
  if (!startDate || !endDate) return 'Completed/Archived';
  if (t >= startDate && t <= endDate) {
    return 'Current';
  } else if (t < startDate) {
    return 'Upcoming';
  } else {
    return 'Completed/Archived';
  }
}

function determineActiveAcademicSession(customDate = null) {
  if (!DB.sessions || !DB.sessions.length) {
    if (!DB.sessions) DB.sessions = [];
    DB.sessions.push({
      name: '2026–27',
      startDate: '2026-04-01',
      endDate: '2027-03-31',
      active: true,
      createdAt: new Date().toISOString()
    });
  }

  // Ensure all sessions have valid dates
  DB.sessions.forEach(s => getSessionDates(s));

  const todayStr = customDate || new Date().toISOString().split('T')[0];
  
  // Check for session date overlaps or ambiguity
  let hasOverlap = false;
  let overlapReason = '';
  for (let i = 0; i < DB.sessions.length; i++) {
    for (let j = i + 1; j < DB.sessions.length; j++) {
      const s1 = DB.sessions[i];
      const s2 = DB.sessions[j];
      const d1 = getSessionDates(s1);
      const d2 = getSessionDates(s2);
      if (!d1.startDate || !d1.endDate || !d2.startDate || !d2.endDate) {
        hasOverlap = true;
        overlapReason = `Missing dates for session ${!d1.startDate ? s1.name : s2.name}.`;
        break;
      }
      if (d1.startDate <= d2.endDate && d2.startDate <= d1.endDate) {
        hasOverlap = true;
        overlapReason = `Date overlap detected between ${s1.name} (${d1.startDate} to ${d1.endDate}) and ${s2.name} (${d2.startDate} to ${d2.endDate}).`;
        break;
      }
    }
    if (hasOverlap) break;
  }

  let activeSessionName = null;
  let ambiguityWarning = null;

  if (hasOverlap) {
    ambiguityWarning = `Warning: ${overlapReason} Please review and correct session dates in Settings.`;
    activeSessionName = (DB.settings && DB.settings.currentSession) || DB.sessions[0].name;
  } else {
    // Find session whose date range includes today
    const currentSessions = DB.sessions.filter(s => {
      const { startDate, endDate } = getSessionDates(s);
      return todayStr >= startDate && todayStr <= endDate;
    });

    if (currentSessions.length === 1) {
      activeSessionName = currentSessions[0].name;
    } else if (currentSessions.length === 0) {
      const existing = (DB.settings && DB.settings.currentSession) && DB.sessions.find(s => s.name === DB.settings.currentSession);
      if (existing) {
        activeSessionName = existing.name;
      } else {
        const pastSessions = DB.sessions.filter(s => getSessionDates(s).endDate < todayStr);
        if (pastSessions.length > 0) {
          pastSessions.sort((a, b) => getSessionDates(b).endDate.localeCompare(getSessionDates(a).endDate));
          activeSessionName = pastSessions[0].name;
        } else {
          activeSessionName = DB.sessions[0].name;
        }
      }
    }
  }

  if (activeSessionName) {
    if (!DB.settings) DB.settings = {};
    DB.settings.currentSession = activeSessionName;
    DB.sessions.forEach(s => {
      s.active = (s.name === activeSessionName);
    });
  }

  return { activeSessionName, ambiguityWarning };
}

function getNextAcademicSession(curSessName = null) {
  const cur = curSessName || (DB.settings && DB.settings.currentSession) || '2026–27';
  const [curStartY] = parseSessionYears(cur);
  const nextStartY = curStartY + 1;
  const target = (DB.sessions || []).find(s => {
    const [stY] = parseSessionYears(s.name);
    return stY === nextStartY;
  });
  return target ? target.name : null;
}

function getNextClass(cls) {
  const idx = CLASSES.indexOf(String(cls));
  if (idx === -1) return null;
  if (idx === CLASSES.length - 1) return null; // Terminal class (Class 12)
  return CLASSES[idx + 1];
}

function autoPopulateSessionDates(name) {
  if (!name) return;
  const [startY, endY] = parseSessionYears(name);
  const startEl = document.getElementById('new_sess_start');
  const endEl = document.getElementById('new_sess_end');
  if (startEl && startY) startEl.value = `${startY}-04-01`;
  if (endEl && endY) endEl.value = `${endY}-03-31`;
}

function openAddSessionModal() {
  const cur = (DB.settings && DB.settings.currentSession) || '2026–27';
  const [curStartY] = parseSessionYears(cur);
  const nextStart = curStartY + 1;
  const nextEnd = String(curStartY + 2).slice(-2);
  const defName = `${nextStart}–${nextEnd}`;
  document.getElementById('new_sess_name').value = defName;
  autoPopulateSessionDates(defName);
  openM('sessM');
}

function saveNewSession() {
  const name = document.getElementById('new_sess_name').value.trim();
  const start = document.getElementById('new_sess_start')?.value;
  const end = document.getElementById('new_sess_end')?.value;

  if (!name) {
    toast('Session name required (e.g. 2027–28)', 'error');
    return;
  }
  if (!start || !end) {
    toast('Both session start date and end date are required!', 'error');
    return;
  }
  if (start >= end) {
    toast('Session start date must be before end date!', 'error');
    return;
  }

  if (!DB.sessions) DB.sessions = [];
  if (DB.sessions.some(s => s.name === name)) {
    toast('Session with this name already exists!', 'error');
    return;
  }

  // Create new session without manual activation (determined automatically based on dates)
  DB.sessions.push({
    name,
    startDate: start,
    endDate: end,
    active: false,
    createdAt: new Date().toISOString()
  });

  // Automatically determine active session based on dates
  determineActiveAcademicSession();

  saveDB(true);
  closeM('sessM');
  applyBranding();
  renderSessions();
  logActivity('Session Created', `Created academic session ${name} (${start} to ${end})`);
  toast(`Academic Session "${name}" created successfully!`);
}

function renderSessions() {
  fillDDs();
  const tb = document.getElementById('sessTb');
  if (!tb) return;

  const { activeSessionName, ambiguityWarning } = determineActiveAcademicSession();
  const sessions = DB.sessions || [];
  const todayStr = new Date().toISOString().split('T')[0];

  const alertEl = document.getElementById('sessAmbiguityAlert');
  if (alertEl) {
    if (ambiguityWarning) {
      alertEl.innerHTML = `<div style="background:#fdecea;border:1px solid #f5c6cb;color:#721c24;padding:8px 12px;border-radius:6px;font-size:12px;margin-bottom:10px">${ambiguityWarning}</div>`;
      alertEl.style.display = 'block';
    } else {
      alertEl.innerHTML = '';
      alertEl.style.display = 'none';
    }
  }

  tb.innerHTML = sessions.map(sess => {
    const { startDate, endDate } = getSessionDates(sess);
    const isCur = (sess.name === activeSessionName);
    const status = isCur ? 'Current' : getSessionStatus(sess, todayStr);
    const count = (DB.students || []).filter(s => s.session === sess.name).length;

    let chipClass = 'cgr';
    if (status === 'Current') chipClass = 'cg';
    else if (status === 'Upcoming') chipClass = 'cb2';

    const dateRangeStr = (startDate && endDate)
      ? `${startDate.split('-').reverse().join('/')} – ${endDate.split('-').reverse().join('/')}`
      : '–';

    return `<tr>
      <td><strong>${sess.name}</strong></td>
      <td style="font-size:11.5px;color:var(--txt2);white-space:nowrap">${dateRangeStr}</td>
      <td><span class="chip ${chipClass}">${status}</span></td>
      <td>${count} Students</td>
      <td>
        ${isCur
          ? '<span style="font-size:11.5px;font-weight:700;color:var(--grn)">✓ Active</span>'
          : `<span style="font-size:11px;color:var(--txt2)">${status}</span>`}
      </td>
    </tr>`;
  }).join('');

  // Update promotion section headers and indicators
  const nextSess = getNextAcademicSession(activeSessionName);
  const srcLbl = document.getElementById('prm_src_sess_lbl');
  const destLbl = document.getElementById('prm_dest_sess_lbl');
  const missingAlert = document.getElementById('prm_missing_dest_alert');
  const btnPromote = document.getElementById('btn_bulk_promote');
  const btnRepeat = document.getElementById('btn_bulk_repeat');

  if (srcLbl) srcLbl.textContent = `${activeSessionName} (Current)`;
  if (destLbl) {
    if (nextSess) {
      destLbl.textContent = `${nextSess} (Next)`;
      destLbl.className = 'chip cb2';
    } else {
      const [curStartY] = parseSessionYears(activeSessionName);
      destLbl.textContent = `Not Configured (${curStartY + 1}–${String(curStartY + 2).slice(-2)})`;
      destLbl.className = 'chip cr';
    }
  }

  if (missingAlert) {
    if (!nextSess) {
      const [curStartY] = parseSessionYears(activeSessionName);
      missingAlert.innerHTML = `⚠️ <strong>Next Academic Session Not Configured:</strong> Session ${curStartY + 1}–${String(curStartY + 2).slice(-2)} must be created first before promoting students to the next session. Click <strong>+ New Session</strong> above to add it.`;
      missingAlert.style.display = 'block';
      if (btnPromote) btnPromote.disabled = true;
      if (btnRepeat) btnRepeat.disabled = true;
    } else {
      missingAlert.style.display = 'none';
      if (btnPromote) btnPromote.disabled = false;
      if (btnRepeat) btnRepeat.disabled = false;
    }
  }

  // Populate source classes in promotion dropdown if not done
  const fromClsEl = document.getElementById('prm_from_cls');
  if (fromClsEl && (!fromClsEl.options || fromClsEl.options.length <= 1)) {
    fromClsEl.innerHTML = '<option value="">-- Select Source Class --</option>' +
      CLASSES.map(c => `<option value="${c}">${clL(c)}</option>`).join('');
  }

  renderPromotionStudents();
}

function onPromotionClassChange() {
  const fromCls = document.getElementById('prm_from_cls')?.value;
  const progText = document.getElementById('prm_prog_text');
  const activeSess = (DB.settings && DB.settings.currentSession) || '2026–27';
  const nextSess = getNextAcademicSession(activeSess) || '(Next Session Not Configured)';

  if (!fromCls) {
    if (progText) progText.textContent = 'Select a class above';
  } else {
    const nextCls = getNextClass(fromCls);
    if (nextCls) {
      if (progText) progText.innerHTML = `<strong>${clL(fromCls)}</strong> (${activeSess}) ➔ <strong style="color:var(--grn)">${clL(nextCls)}</strong> (${nextSess})`;
    } else {
      if (progText) progText.innerHTML = `<strong>${clL(fromCls)}</strong> (${activeSess}) ➔ <strong style="color:var(--red)">Terminal Class (Class 12 Alumni / School Left / Repeat)</strong>`;
    }
  }
  renderPromotionStudents();
}

function renderPromotionStudents() {
  const tb = document.getElementById('prmStudentsTb');
  if (!tb) return;

  const fromCls = document.getElementById('prm_from_cls')?.value;
  const secFilter = document.getElementById('prm_filter_sec')?.value;
  const activeSess = (DB.settings && DB.settings.currentSession) || '2026–27';
  const nextSess = getNextAcademicSession(activeSess);

  if (!fromCls) {
    tb.innerHTML = '<tr><td colspan="8" class="empty" style="padding:24px">Select a source class above to view and promote students.</td></tr>';
    updatePromotionSelectionCount();
    return;
  }

  let students = (DB.students || []).filter(s => s.cls === fromCls);
  if (secFilter) {
    students = students.filter(s => (s.section || 'A') === secFilter);
  }

  if (!students.length) {
    tb.innerHTML = `<tr><td colspan="8" class="empty" style="padding:24px">No students enrolled in ${clL(fromCls)}${secFilter ? ' (Section ' + secFilter + ')' : ''}.</td></tr>`;
    updatePromotionSelectionCount();
    return;
  }

  const nextCls = getNextClass(fromCls);

  tb.innerHTML = students.map(s => {
    const isLeft = (s.status === 'Left School' || s.status === 'School Left' || s.status === 'Inactive' || s.status === 'Alumni');
    const isAlreadyTargetSess = nextSess && (s.session === nextSess);
    const isEligible = !isLeft && !isAlreadyTargetSess;

    let targetDesc = '';
    if (isLeft) {
      targetDesc = `<span class="chip cgr">${s.status} (Not Eligible)</span>`;
    } else if (isAlreadyTargetSess) {
      targetDesc = `<span class="chip cg">Already in ${nextSess}</span>`;
    } else if (nextCls) {
      targetDesc = `<span style="color:var(--grn);font-weight:600">${clL(nextCls)} (${s.section || 'A'}) in ${nextSess || 'Next Session'}</span>`;
    } else {
      targetDesc = `<span style="color:#e67e22;font-weight:600">Class 12 Terminal (Alumni / Repeat)</span>`;
    }

    const statusBadge = isLeft
      ? `<span class="chip cr">${s.status}</span>`
      : `<span class="chip cg">Active</span>`;

    return `<tr style="${isLeft ? 'background:#f9f9f9;opacity:0.75' : ''}">
      <td style="text-align:center">
        <input type="checkbox" class="prm_st_check" data-sid="${s.id}" ${isEligible ? '' : 'disabled'} onchange="updatePromotionSelectionCount()">
      </td>
      <td style="text-align:center"><span class="chip cb2">${s.admno}</span></td>
      <td><strong>${s.name}</strong></td>
      <td>${s.father || '–'}</td>
      <td style="text-align:center">${clL(s.cls)} (${s.section || 'A'})</td>
      <td style="text-align:center">${s.session || activeSess}</td>
      <td style="text-align:center">${statusBadge}</td>
      <td>${targetDesc}</td>
    </tr>`;
  }).join('');

  updatePromotionSelectionCount();
}

function updatePromotionSelectionCount() {
  const checkboxes = document.querySelectorAll('.prm_st_check:checked');
  const totalCheckable = document.querySelectorAll('.prm_st_check:not(:disabled)');
  const badge = document.getElementById('prm_selected_count_badge');
  const thCb = document.getElementById('prm_th_select_all');

  if (badge) {
    badge.textContent = `Selected: ${checkboxes.length} / ${totalCheckable.length}`;
  }
  if (thCb) {
    thCb.checked = (totalCheckable.length > 0 && checkboxes.length === totalCheckable.length);
  }
}

function selectAllEligiblePromotionStudents() {
  const checkboxes = document.querySelectorAll('.prm_st_check:not(:disabled)');
  checkboxes.forEach(cb => { cb.checked = true; });
  updatePromotionSelectionCount();
}

function deselectAllPromotionStudents() {
  const checkboxes = document.querySelectorAll('.prm_st_check');
  checkboxes.forEach(cb => { cb.checked = false; });
  updatePromotionSelectionCount();
}

function toggleSelectAllTh(th) {
  if (th.checked) {
    selectAllEligiblePromotionStudents();
  } else {
    deselectAllPromotionStudents();
  }
}

function executeBulkAction(actionType) {
  const activeSess = (DB.settings && DB.settings.currentSession) || '2026–27';
  const nextSess = getNextAcademicSession(activeSess);
  const fromCls = document.getElementById('prm_from_cls')?.value;

  if (!fromCls) {
    toast('Please select a source class first!', 'warning');
    return;
  }

  // Check next session for promote and repeat
  if ((actionType === 'promote' || actionType === 'repeat') && !nextSess) {
    const [curStartY] = parseSessionYears(activeSess);
    toast(`Next academic session (${curStartY + 1}–${String(curStartY + 2).slice(-2)}) is not configured. Please create it first.`, 'error');
    return;
  }

  const selectedBoxes = Array.from(document.querySelectorAll('.prm_st_check:checked'));
  if (!selectedBoxes.length) {
    toast('Please select at least one student using the checkboxes!', 'warning');
    return;
  }

  const selectedIds = selectedBoxes.map(b => b.getAttribute('data-sid'));
  const selectedStudents = (DB.students || []).filter(s => selectedIds.includes(String(s.id)));

  // Filter out any ineligible students
  const eligibleStudents = [];
  const ineligibleStudents = [];

  selectedStudents.forEach(s => {
    const isLeft = (s.status === 'Left School' || s.status === 'School Left' || s.status === 'Inactive' || s.status === 'Alumni');
    if (actionType === 'promote' || actionType === 'repeat') {
      if (isLeft) {
        ineligibleStudents.push({ student: s, reason: `Status is '${s.status}'` });
      } else if (s.session === nextSess) {
        ineligibleStudents.push({ student: s, reason: `Already enrolled in target session ${nextSess}` });
      } else {
        eligibleStudents.push(s);
      }
    } else if (actionType === 'left') {
      if (isLeft) {
        ineligibleStudents.push({ student: s, reason: 'Already marked as Left School' });
      } else {
        eligibleStudents.push(s);
      }
    }
  });

  if (!eligibleStudents.length) {
    toast('None of the selected students are eligible for this action.', 'error');
    return;
  }

  // Terminal class check for promotion
  if (actionType === 'promote') {
    const nextCls = getNextClass(fromCls);
    if (!nextCls) {
      toast('Class 12 is the final class. Students cannot be promoted beyond Class 12. Please use "Repeat Class" or "Mark School Left".', 'warning');
      return;
    }
  }

  // Setup confirmation modal
  curBulkPromotionAction = {
    actionType,
    fromCls,
    nextCls: actionType === 'promote' ? getNextClass(fromCls) : fromCls,
    sourceSess: activeSess,
    targetSess: nextSess,
    students: eligibleStudents
  };

  const titleEl = document.getElementById('prmConfirmTitle');
  const summaryEl = document.getElementById('prmConfirmSummary');
  const ineligibleEl = document.getElementById('prmConfirmIneligibleNotice');
  const listEl = document.getElementById('prmConfirmList');
  const btnEl = document.getElementById('prmConfirmBtn');

  if (actionType === 'promote') {
    if (titleEl) titleEl.textContent = '🎓 Confirm Bulk Student Promotion';
    if (summaryEl) {
      summaryEl.innerHTML = `You are about to promote <strong>${eligibleStudents.length} student(s)</strong> from <strong>${clL(fromCls)} (${activeSess})</strong> to <strong>${clL(getNextClass(fromCls))} (${nextSess})</strong>.<br><span style="font-size:12px;color:var(--txt2)">Permanent Admission Numbers and all historical fees and receipts will be safely preserved.</span>`;
    }
    if (btnEl) btnEl.textContent = `✓ Promote ${eligibleStudents.length} Student(s)`;
  } else if (actionType === 'repeat') {
    if (titleEl) titleEl.textContent = '🔁 Confirm Repeat Class';
    if (summaryEl) {
      summaryEl.innerHTML = `You are about to retain <strong>${eligibleStudents.length} student(s)</strong> in <strong>${clL(fromCls)}</strong> for the next session <strong>(${nextSess})</strong>.<br><span style="font-size:12px;color:var(--txt2)">Students will remain in ${clL(fromCls)} in the new session with their historical records preserved.</span>`;
    }
    if (btnEl) btnEl.textContent = `✓ Repeat ${eligibleStudents.length} Student(s)`;
  } else if (actionType === 'left') {
    if (titleEl) titleEl.textContent = '🚪 Confirm Mark School Left';
    if (summaryEl) {
      summaryEl.innerHTML = `You are about to mark <strong>${eligibleStudents.length} student(s)</strong> as <strong>Left School</strong>.<br><span style="font-size:12px;color:var(--red)">They will be excluded from future promotions and active lists. Their fee records, past dues, and receipts will remain intact.</span>`;
    }
    if (btnEl) btnEl.textContent = `✓ Mark ${eligibleStudents.length} as Left`;
  }

  if (ineligibleEl) {
    if (ineligibleStudents.length > 0) {
      ineligibleEl.innerHTML = `ℹ <strong>${ineligibleStudents.length} selected student(s) skipped</strong> as ineligible (${ineligibleStudents.map(i => `${i.student.name}: ${i.reason}`).join(', ')}).`;
      ineligibleEl.style.display = 'block';
    } else {
      ineligibleEl.style.display = 'none';
    }
  }

  if (listEl) {
    listEl.innerHTML = eligibleStudents.map(s => `
      <div style="padding:3px 0;display:flex;justify-content:space-between">
        <span><strong>${s.name}</strong> (Adm No: ${s.admno})</span>
        <span style="color:var(--txt2)">Current: ${clL(s.cls)} (${s.section || 'A'})</span>
      </div>
    `).join('');
  }

  openM('prmConfirmM');
}

function confirmBulkAction() {
  if (!curBulkPromotionAction) return;

  const { actionType, fromCls, nextCls, sourceSess, targetSess, students } = curBulkPromotionAction;
  if (isEl && window.electronAPI && typeof window.electronAPI.createAutomaticBackup === 'function') {
    window.electronAPI.createAutomaticBackup({ reason: `bulk_${actionType}` });
  }
  let count = 0;

  students.forEach(s => {
    getStudentEnrollments(s);

    const studentSourceSess = s.session || sourceSess;
    const studentFromCls = s.cls || fromCls;

    if (actionType === 'promote') {
      // 1. Update source session enrollment
      let srcEnr = s.enrollments.find(e => e.session === studentSourceSess);
      if (srcEnr) {
        srcEnr.status = 'Promoted';
        srcEnr.cls = studentFromCls;
      } else {
        s.enrollments.push({
          session: studentSourceSess,
          cls: studentFromCls,
          section: s.section || 'A',
          status: 'Promoted',
          enrolledAt: s.admissionDate || new Date().toISOString()
        });
      }

      // 2. Create or update target session enrollment
      let destEnr = s.enrollments.find(e => e.session === targetSess);
      if (destEnr) {
        destEnr.cls = nextCls;
        destEnr.section = s.section || 'A';
        destEnr.status = 'Active';
      } else {
        s.enrollments.push({
          session: targetSess,
          cls: nextCls,
          section: s.section || 'A',
          status: 'Active',
          enrolledAt: new Date().toISOString()
        });
      }

      // 3. Update top-level references
      s.session = targetSess;
      s.cls = nextCls;

      // 4. Update academicHistory for backwards compatibility (clean single entry per session)
      if (!s.academicHistory) s.academicHistory = [];
      s.academicHistory = s.academicHistory.filter(h => h.session !== studentSourceSess);
      s.academicHistory.push({
        session: studentSourceSess,
        cls: studentFromCls,
        section: s.section || 'A',
        promotedDate: new Date().toISOString()
      });
      count++;
    } else if (actionType === 'repeat') {
      let srcEnr = s.enrollments.find(e => e.session === studentSourceSess);
      if (srcEnr) {
        srcEnr.status = 'Repeated';
        srcEnr.cls = studentFromCls;
      }
      let destEnr = s.enrollments.find(e => e.session === targetSess);
      if (destEnr) {
        destEnr.cls = studentFromCls;
        destEnr.section = s.section || 'A';
        destEnr.status = 'Active';
      } else {
        s.enrollments.push({
          session: targetSess,
          cls: studentFromCls,
          section: s.section || 'A',
          status: 'Active',
          enrolledAt: new Date().toISOString()
        });
      }
      s.session = targetSess;
      s.cls = studentFromCls;
      if (!s.academicHistory) s.academicHistory = [];
      s.academicHistory = s.academicHistory.filter(h => h.session !== studentSourceSess);
      s.academicHistory.push({
        session: studentSourceSess,
        cls: studentFromCls,
        section: s.section || 'A',
        promotedDate: new Date().toISOString()
      });
      count++;
    } else if (actionType === 'left') {
      let curEnr = s.enrollments.find(e => e.session === (s.session || sourceSess));
      if (curEnr) curEnr.status = 'Left School';
      s.status = 'Left School';
      count++;
    }
  });

  saveDB(true);
  closeM('prmConfirmM');

  let logMsg = '';
  if (actionType === 'promote') {
    logMsg = `Bulk promoted ${count} students from ${clL(fromCls)} (${sourceSess}) to ${clL(nextCls)} (${targetSess})`;
  } else if (actionType === 'repeat') {
    logMsg = `Bulk retained ${count} students in ${clL(fromCls)} for session ${targetSess}`;
  } else if (actionType === 'left') {
    logMsg = `Marked ${count} students from ${clL(fromCls)} as Left School`;
  }

  logActivity('Student Promotion', logMsg);
  renderSessions();
  toast(`Success: ${logMsg}!`);
  curBulkPromotionAction = null;
}

// ============================================================
// 5. FEE STRUCTURE MANAGEMENT
// ============================================================
function renderFeeStructures() {
  const tb = document.getElementById('feeStructTb');
  if (!tb) return;
  const structures = DB.feeStructures || {};

  tb.innerHTML = CLASSES.map(c => {
    const s = structures[c] || { tuition: 400, transport: 300, admission: 500 };
    return `<tr>
      <td><strong>${clL(c)}</strong></td>
      <td><input type="number" id="fs_t_${c}" value="${s.tuition}" style="width:100px;border:1px solid var(--bdr);border-radius:4px;padding:4px 8px;font-size:12px"></td>
      <td><input type="number" id="fs_tr_${c}" value="${s.transport}" style="width:100px;border:1px solid var(--bdr);border-radius:4px;padding:4px 8px;font-size:12px"></td>
      <td><input type="number" id="fs_ad_${c}" value="${s.admission}" style="width:100px;border:1px solid var(--bdr);border-radius:4px;padding:4px 8px;font-size:12px"></td>
      <td><button class="btn bp bsm" onclick="saveFeeStructureRow('${c}')">💾 Update ${c}</button></td>
    </tr>`;
  }).join('');
}

function saveFeeStructureRow(c) {
  const t = parseFloat(document.getElementById('fs_t_' + c).value) || 0;
  const tr = parseFloat(document.getElementById('fs_tr_' + c).value) || 0;
  const ad = parseFloat(document.getElementById('fs_ad_' + c).value) || 0;

  if (!DB.feeStructures) DB.feeStructures = {};
  DB.feeStructures[c] = { tuition: t, transport: tr, admission: ad };

  saveDB(true);
  logActivity('Fee Structure Changed', `Updated fee structure for ${clL(c)}: School=${t}, Van=${tr}, Admission=${ad}`);
  toast(`Fee structure for ${clL(c)} updated!`);
}

// ============================================================
// 6. FEE COLLECTION & LEDGER
// ============================================================
function loadFeSt() {
  const clsEl = document.getElementById('fe_cl');
  const cls = clsEl ? clsEl.value : '';
  const sel = document.getElementById('fe_st');
  if (!sel) return;

  const prevVal = sel.value;
  let optionsHtml = '<option value="">-- Select Student --</option>';

  const eligibleStudents = (DB.students || []).filter(s => 
    s.status !== 'Inactive' && s.status !== 'Left School' && s.status !== 'Alumni'
  );

  const filteredStudents = cls ? eligibleStudents.filter(s => s.cls === cls) : eligibleStudents;

  // Add "All Students" option
  const allLabel = cls ? `👥 All Students (${clL(cls)})` : '👥 All Students (All Classes)';
  optionsHtml += `<option value="all">${allLabel}</option>`;

  filteredStudents.forEach(s => {
    optionsHtml += `<option value="${s.id}">${s.name} (Adm: ${s.admno}${s.cls ? ' · Class ' + clL(s.cls) : ''}${s.session ? ' · ' + s.session : ''})</option>`;
  });

  sel.innerHTML = optionsHtml;

  if (prevVal === 'all') {
    sel.value = 'all';
    curFSid = 'all';
  } else if (prevVal && filteredStudents.some(s => String(s.id) === String(prevVal))) {
    sel.value = prevVal;
    curFSid = parseInt(prevVal);
  } else {
    sel.value = '';
    curFSid = null;
  }
}

function loadFeDt() {
  const sid = document.getElementById('fe_st')?.value;
  if (!sid) {
    curFSid = null;
    renderFeD();
    return;
  }
  if (sid === 'all') {
    curFSid = 'all';
    renderFeD();
    return;
  }
  curFSid = parseInt(sid);
  const s = (DB.students || []).find(x => x.id === curFSid);
  if (s && s.session) {
    const [stY] = parseSessionYears(s.session);
    const yrEl = document.getElementById('fe_yr');
    if (yrEl && stY) {
      const curY = parseInt(yrEl.value);
      if (curY !== stY && curY !== (stY + 1)) {
        yrEl.value = stY;
      }
    }
  }
  renderFeD();
}

function selectStudentForPayment(studentId) {
  const s = (DB.students || []).find(x => x.id === studentId);
  if (!s) return;
  const clEl = document.getElementById('fe_cl');
  if (clEl && clEl.value !== s.cls) {
    clEl.value = s.cls;
    loadFeSt();
  }
  const stEl = document.getElementById('fe_st');
  if (stEl) stEl.value = String(s.id);
  curFSid = s.id;
  if (s && s.session) {
    const [stY] = parseSessionYears(s.session);
    const yrEl = document.getElementById('fe_yr');
    if (yrEl && stY) {
      const curY = parseInt(yrEl.value);
      if (curY !== stY && curY !== (stY + 1)) {
        yrEl.value = stY;
      }
    }
  }
  renderFeD();
}

function feK() {
  const mo = document.getElementById('fe_mo')?.value || 'April';
  const yr = document.getElementById('fe_yr')?.value || '2026';
  return `${curFSid}_${mo}_${yr}`;
}

// Helper: Convert numbers to Indian Rupees in words
function numberToWordsINR(amount) {
  const num = Math.round(Number(amount) || 0);
  if (num === 0) return 'Zero Rupees Only';
  const a = ['','One ','Two ','Three ','Four ','Five ','Six ','Seven ','Eight ','Nine ','Ten ','Eleven ','Twelve ','Thirteen ','Fourteen ','Fifteen ','Sixteen ','Seventeen ','Eighteen ','Nineteen '];
  const b = ['', '', 'Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  function inWords(n) {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + ((n % 10 !== 0) ? ' ' + a[n % 10] : '');
    if (n < 1000) return a[Math.floor(n / 100)] + 'Hundred ' + ((n % 100 !== 0) ? inWords(n % 100) : '');
    if (n < 100000) return inWords(Math.floor(n / 1000)) + 'Thousand ' + ((n % 1000 !== 0) ? inWords(n % 1000) : '');
    if (n < 10000000) return inWords(Math.floor(n / 100000)) + 'Lakh ' + ((n % 100000 !== 0) ? inWords(n % 100000) : '');
    return inWords(Math.floor(n / 10000000)) + 'Crore ' + ((n % 10000000 !== 0) ? inWords(n % 10000000) : '');
  }
  return 'Rupees ' + inWords(num).trim() + ' Only';
}

// Student-wise Fee Configuration Helpers
function getStudentFeeConfig(sid) {
  if (!DB.feeConfig) DB.feeConfig = {};
  if (!DB.feeConfig[sid]) {
    DB.feeConfig[sid] = {
      customTuition: null,
      tuition: true,
      transportEnabled: true,
      customTransport: null,
      transport: true,
      examFee: 200,
      examEnabled: true,
      admission: true,
      customAdmission: null,
      previousArrears: 0,
      advanceBalance: 0
    };
  }
  const cfg = DB.feeConfig[sid];
  if (cfg.transportEnabled === undefined) cfg.transportEnabled = (cfg.transport !== false);
  if (cfg.transport === undefined) cfg.transport = cfg.transportEnabled;
  if (cfg.examFee === undefined) cfg.examFee = 200;
  if (cfg.examEnabled === undefined) cfg.examEnabled = true;
  if (cfg.advanceBalance === undefined) cfg.advanceBalance = 0;
  if (cfg.previousArrears === undefined) cfg.previousArrears = 0;
  return cfg;
}

function getStudentAdvanceBalance(sid) {
  const cfg = getStudentFeeConfig(sid);
  return Number(cfg.advanceBalance) || 0;
}

function setStudentAdvanceBalance(sid, amt) {
  const cfg = getStudentFeeConfig(sid);
  cfg.advanceBalance = Math.max(0, Math.round(Number(amt) || 0));
}

function getStudentPreviousArrears(sid) {
  const cfg = getStudentFeeConfig(sid);
  return Number(cfg.previousArrears) || 0;
}

function setStudentPreviousArrears(sid, amt) {
  const cfg = getStudentFeeConfig(sid);
  cfg.previousArrears = Math.max(0, Math.round(Number(amt) || 0));
}

function getStudentPreviousArrearsBreakdown(s, curSess = null) {
  const sess = curSess || s?.session || (DB.settings && DB.settings.currentSession) || '2026–27';
  const [curStartY] = parseSessionYears(sess);
  const items = [];

  // Determine student's admission session start year
  const admStartY = getStudentAdmissionSessionYears(s);
  const enrollments = getStudentEnrollments(s);
  const studentPastSessions = (s.academicHistory || []).map(h => h.session).filter(Boolean);
  enrollments.forEach(e => { if (e.session) studentPastSessions.push(e.session); });
  let feeRecordSum = 0;

  // 1. Group previous session fee records by category and consecutive period ranges
  const pastRecordsByCategory = {};

  Object.entries(DB.fees || {}).forEach(([k, arr]) => {
    if (!k.startsWith(s.id + '_') || !Array.isArray(arr)) return;
    const parts = k.split('_');
    const mo = parts[1], yr = parseInt(parts[2]);
    const mIdx = MONTHS_LIST.indexOf(mo);
    const feeStartY = (mIdx < 9) ? yr : yr - 1;

    // Must be strictly prior to current session
    if (feeStartY < curStartY) {
      const sessLabel = `${feeStartY}–${String(feeStartY + 1).slice(-2)}`;
      const sessLabelAlt = `${feeStartY}-${String(feeStartY + 1).slice(-2)}`;
      // Verified past session check: Student must have legitimate academic history or was admitted on/before that session
      const isVerifiedSession = studentPastSessions.some(ps => ps === sessLabel || ps === sessLabelAlt) || (admStartY <= feeStartY);
      if (!isVerifiedSession) {
        return; // Skip illegitimate / orphaned fees before student was admitted
      }

      arr.forEach(f => {
        if (f.enabled !== false && !f.paid && f.type !== 'Van Fee' && f.type !== 'Transport Fee') {
          const amt = Number(f.amount) || 0;
          const partialPaid = Number(f.partialPaid) || 0;
          const rem = f.partialRemaining !== undefined ? Number(f.partialRemaining) : (amt - partialPaid);
          if (rem > 0) {
            feeRecordSum += rem;
            const groupKey = `${sessLabel}__${f.type}`;
            if (!pastRecordsByCategory[groupKey]) pastRecordsByCategory[groupKey] = [];
            pastRecordsByCategory[groupKey].push({
              session: sessLabel,
              mo,
              yr,
              feeStartY,
              category: f.type,
              amount: rem,
              originalAmount: amt,
              paidAmount: partialPaid
            });
          }
        }
      });
    }
  });

  // Group consecutive months for each category within each previous session
  Object.keys(pastRecordsByCategory).forEach(groupKey => {
    const list = pastRecordsByCategory[groupKey];
    list.sort((a, b) => {
      const yA = parseInt(a.yr) || 0, yB = parseInt(b.yr) || 0;
      if (yA !== yB) return yA - yB;
      return MONTHS_LIST.indexOf(a.mo) - MONTHS_LIST.indexOf(b.mo);
    });

    let curGroup = null;
    list.forEach(rec => {
      if (!curGroup) {
        curGroup = {
          session: rec.session,
          category: rec.category,
          startMo: rec.mo,
          startYr: rec.yr,
          endMo: rec.mo,
          endYr: rec.yr,
          originalAmount: rec.originalAmount,
          paidAmount: rec.paidAmount,
          remainingAmount: rec.amount
        };
      } else if (areMonthsConsecutive(curGroup.endMo, curGroup.endYr, rec.mo, rec.yr)) {
        curGroup.endMo = rec.mo;
        curGroup.endYr = rec.yr;
        curGroup.originalAmount += rec.originalAmount;
        curGroup.paidAmount += rec.paidAmount;
        curGroup.remainingAmount += rec.amount;
      } else {
        const periodText = formatFullPeriodRange(curGroup.startMo, curGroup.startYr, curGroup.endMo, curGroup.endYr);
        items.push({
          session: curGroup.session,
          period: periodText,
          category: curGroup.category,
          originalAmount: curGroup.originalAmount,
          paidAmount: curGroup.paidAmount,
          remainingAmount: curGroup.remainingAmount,
          source: 'fee_record'
        });
        curGroup = {
          session: rec.session,
          category: rec.category,
          startMo: rec.mo,
          startYr: rec.yr,
          endMo: rec.mo,
          endYr: rec.yr,
          originalAmount: rec.originalAmount,
          paidAmount: rec.paidAmount,
          remainingAmount: rec.amount
        };
      }
    });
    if (curGroup) {
      const periodText = formatFullPeriodRange(curGroup.startMo, curGroup.startYr, curGroup.endMo, curGroup.endYr);
      items.push({
        session: curGroup.session,
        period: periodText,
        category: curGroup.category,
        originalAmount: curGroup.originalAmount,
        paidAmount: curGroup.paidAmount,
        remainingAmount: curGroup.remainingAmount,
        source: 'fee_record'
      });
    }
  });

  // 2. Manually configured previous session arrears from student fee config (opening balance carried forward)
  // Reconcile with fee records to ensure zero double counting
  const manualArrears = getStudentPreviousArrears(s.id);
  if (manualArrears > 0) {
    const unrepresentedManual = Math.max(0, manualArrears - feeRecordSum);
    if (unrepresentedManual > 0) {
      const prevStart = curStartY - 1;
      const prevEnd = String(curStartY).slice(-2);
      const prevSess = `${prevStart}–${prevEnd}`;
      items.push({
        session: prevSess,
        period: 'Historical period unavailable',
        category: 'Previous Session Arrears',
        originalAmount: unrepresentedManual,
        paidAmount: 0,
        remainingAmount: unrepresentedManual,
        source: 'config'
      });
    }
  }

  return items;
}

function showArrearsDetailModal() {
  if (!curFSid) {
    toast('Please select a student from the dropdown first', 'warning');
    return;
  }
  const s = DB.students.find(x => x.id === curFSid);
  if (!s) return;

  const curSess = (DB.settings && DB.settings.currentSession) || '2026–27';
  const breakdown = getStudentPreviousArrearsBreakdown(s, curSess);
  const totalArrears = breakdown.reduce((sum, it) => sum + it.remainingAmount, 0);

  // Group by academic session
  const sessionMap = {};
  breakdown.forEach(item => {
    if (!sessionMap[item.session]) sessionMap[item.session] = [];
    sessionMap[item.session].push(item);
  });

  const bEl = document.getElementById('arrearsDetailBody');
  if (bEl) {
    if (breakdown.length === 0) {
      bEl.innerHTML = `
        <div style="background:var(--gl);padding:14px;border-radius:8px;text-align:center;border:1px solid #a9dfbf">
          <div style="font-size:24px;margin-bottom:4px">✓</div>
          <div style="font-weight:700;color:var(--grn);font-size:14px">No Previous Academic Session Arrears</div>
          <div style="font-size:12px;color:var(--txt2);margin-top:4px">${s.name} (Adm: ${s.admno}) has zero carried forward arrears from previous sessions.</div>
        </div>`;
    } else {
      let sessionsHtml = '';
      Object.entries(sessionMap).forEach(([sess, arr]) => {
        const sessTotal = arr.reduce((sum, it) => sum + it.remainingAmount, 0);
        sessionsHtml += `
          <div style="margin-bottom:14px;border:1px solid #fed7aa;border-radius:8px;overflow:hidden;background:#fff">
            <div style="background:#fff7ed;padding:8px 12px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #fed7aa">
              <span style="font-weight:700;font-size:12.5px;color:#c2410c">Academic Session ${sess}</span>
              <span style="font-size:11.5px;color:#c2410c;font-weight:700">Subtotal: ₹${sessTotal.toLocaleString('en-IN')} (${arr.length} obligation${arr.length > 1 ? 's' : ''})</span>
            </div>
            <table style="width:100%;font-size:12px">
              <thead style="background:#fefce8;font-size:11px;color:var(--txt2)">
                <tr>
                  <th style="padding:6px 10px;text-align:left">Period</th>
                  <th style="padding:6px 10px;text-align:left">Fee Category</th>
                  <th style="padding:6px 10px;text-align:right">Original Fee</th>
                  <th style="padding:6px 10px;text-align:right">Paid</th>
                  <th style="padding:6px 10px;text-align:right">Remaining Due</th>
                </tr>
              </thead>
              <tbody>
                ${arr.map(it => `
                  <tr style="border-top:1px solid #f0f0f0">
                    <td style="padding:6px 10px;font-weight:600">${it.period}</td>
                    <td style="padding:6px 10px">${it.category}</td>
                    <td style="padding:6px 10px;text-align:right">₹${it.originalAmount.toLocaleString('en-IN')}</td>
                    <td style="padding:6px 10px;text-align:right;color:var(--grn)">₹${it.paidAmount.toLocaleString('en-IN')}</td>
                    <td style="padding:6px 10px;text-align:right;font-weight:700;color:var(--red)">₹${it.remainingAmount.toLocaleString('en-IN')}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>`;
      });

      bEl.innerHTML = `
        <div style="background:var(--bg);border-radius:8px;padding:10px 14px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-weight:700;font-size:14px">${s.name} (Adm: ${s.admno})</div>
            <div style="font-size:11.5px;color:var(--txt2)">Class ${clL(s.cls)} (${s.section || 'A'}) | Current Active Session: ${curSess}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:11px;color:var(--txt2)">Total Arrears Carried Forward</div>
            <div style="font-size:16px;font-weight:700;color:var(--red)">₹${totalArrears.toLocaleString('en-IN')}</div>
          </div>
        </div>

        <div style="font-size:11px;color:var(--txt2);margin-bottom:8px">Itemized breakdown of all unpaid obligations preserved from prior sessions:</div>
        <div style="max-height:280px;overflow-y:auto">
          ${sessionsHtml}
        </div>

        <div style="background:#fee2e2;border:1px solid #fca5a5;border-radius:6px;padding:10px 14px;margin-top:10px;display:flex;justify-content:space-between;align-items:center;font-size:12.5px;font-weight:700">
          <span style="color:var(--red)">Total Cumulative Previous Session Arrears:</span>
          <span style="color:var(--red);font-size:16px">₹${totalArrears.toLocaleString('en-IN')}</span>
        </div>`;
    }
  }

  openM('arrearsDetailM');
}

function calcStudentPreviousArrears(s, curSess = null) {
  const sess = curSess || s?.session || (DB.settings && DB.settings.currentSession) || '2026–27';
  const breakdown = getStudentPreviousArrearsBreakdown(s, sess);
  return breakdown.reduce((sum, it) => sum + it.remainingAmount, 0);
}

function calcStudentCurrentSessionDue(s, curSess = null) {
  if (!s) return 0;
  const sess = curSess || s.session || (DB.settings && DB.settings.currentSession) || '2026–27';
  const [startY, endY] = parseSessionYears(sess);
  let total = 0;

  MONTHS_LIST.forEach((mo, idx) => {
    const yr = (idx < 9) ? startY : endY;
    if (isFeeRecordCurrentlyDue(mo, yr, sess) && isPeriodValidForStudent(s, mo, yr)) {
      const key = `${s.id}_${mo}_${yr}`;
      if (DB.fees && Array.isArray(DB.fees[key]) && DB.fees[key].length > 0) {
        const existingTypes = new Set();
        DB.fees[key].forEach(f => {
          if (f.enabled !== false && f.type !== 'Van Fee' && f.type !== 'Transport Fee') {
            existingTypes.add(f.type);
            if (!f.paid) {
              const amt = Number(f.amount) || 0;
              const disc = Number(f.discount) || 0;
              const partialPaid = Number(f.partialPaid) || 0;
              const rem = (f.partialRemaining !== undefined && f.partialRemaining !== null)
                ? Number(f.partialRemaining)
                : Math.max(0, amt - disc - partialPaid);
              total += Math.max(0, rem);
            }
          }
        });
        // Check for any applicable category in getEffectiveFeesForStudent not yet registered in DB.fees
        const eff = getEffectiveFeesForStudent(s, mo, yr);
        eff.forEach(effItem => {
          if (effItem.enabled !== false && !existingTypes.has(effItem.type) && effItem.type !== 'Van Fee' && effItem.type !== 'Transport Fee') {
            // Check if covered by DB.payments
            let isCovered = false;
            if (Array.isArray(DB.payments)) {
              isCovered = DB.payments.some(p =>
                !p.reversed &&
                String(p.studentId) === String(s.id) &&
                Array.isArray(p.items) &&
                p.items.some(it => it.month === mo && Number(it.year) === Number(yr) && it.type === effItem.type)
              );
            }
            if (!isCovered) {
              total += (Number(effItem.amount) || 0);
            }
          }
        });
      } else {
        // Not initialized in DB.fees yet, calculate effective configured dues
        const eff = getEffectiveFeesForStudent(s, mo, yr);
        eff.forEach(f => {
          if (f.enabled !== false && f.type !== 'Van Fee' && f.type !== 'Transport Fee') {
            let paidAmt = 0;
            if (Array.isArray(DB.payments)) {
              DB.payments.forEach(p => {
                if (!p.reversed && String(p.studentId) === String(s.id)) {
                  if (Array.isArray(p.items)) {
                    p.items.forEach(it => {
                      if (it.month === mo && Number(it.year) === Number(yr) && it.type === f.type) {
                        paidAmt += (Number(it.paidAmount || it.baseAmount || it.amount) || 0);
                      }
                    });
                  } else if (p.category === f.type && p.period && p.period.includes(mo)) {
                    paidAmt += (Number(p.amount) || 0);
                  }
                }
              });
            }
            const rem = Math.max(0, (Number(f.amount) || 0) - paidAmt);
            total += rem;
          }
        });
      }
    }
  });

  return total;
}

function calcStudentSessionPaid(s, curSess = null) {
  const sess = curSess || s?.session || (DB.settings && DB.settings.currentSession) || '2026–27';
  let total = 0;
  Object.entries(DB.fees || {}).forEach(([k, arr]) => {
    if (!k.startsWith(s.id + '_') || !Array.isArray(arr)) return;
    const parts = k.split('_');
    const mo = parts[1], yr = parseInt(parts[2]);
    if (isFeeInAcademicSession(mo, yr, sess)) {
      arr.forEach(f => {
        if (f.enabled !== false && f.type !== 'Van Fee' && f.type !== 'Transport Fee') {
          const actualPaid = (f.partialPaid !== undefined && f.partialPaid !== null)
            ? Number(f.partialPaid)
            : (f.paid ? Math.max(0, (Number(f.amount) || 0) - (Number(f.discount) || 0)) : 0);
          total += actualPaid;
        }
      });
    }
  });
  return total;
}

function getEffectiveFeesForStudent(s, targetMonth = null, targetYear = null) {
  if (!s) return [];
  const mo = targetMonth || document.getElementById('fe_mo')?.value || 'April';
  const yr = targetYear || document.getElementById('fe_yr')?.value || '2026';

  // Check student period validity (respect admission date and session boundary)
  if (!isPeriodValidForStudent(s, mo, yr)) {
    return [];
  }

  const mIdx = MONTHS_LIST.indexOf(mo);
  const feeStartY = (mIdx < 9) ? parseInt(yr) : parseInt(yr) - 1;
  const feeSess = `${feeStartY}–${String(feeStartY + 1).slice(-2)}`;
  const feeSessAlt = `${feeStartY}-${String(feeStartY + 1).slice(-2)}`;

  const enrollments = getStudentEnrollments(s);
  const enr = enrollments.find(e => e.session === feeSess || e.session === feeSessAlt);
  const effectiveClass = enr ? enr.cls : s.cls;
  const struct = (DB.feeStructures && DB.feeStructures[effectiveClass]) ? DB.feeStructures[effectiveClass] : { tuition: 400, transport: 300, admission: 500, examFee: 200 };
  const cfg = getStudentFeeConfig(s.id);
  const curSess = enr ? enr.session : (s.session || (DB.settings && DB.settings.currentSession) || '2026–27');

  // 1. School Fee
  const schoolAmt = (cfg.customTuition !== null && cfg.customTuition !== undefined && cfg.customTuition !== '' && !isNaN(Number(cfg.customTuition)))
    ? Number(cfg.customTuition)
    : struct.tuition;
  const schoolEnabled = cfg.tuition !== false;

  // 2. Exam Fee (Charged in September, December, March)
  const isExamMonth = ['September', 'December', 'March'].includes(mo);
  const examAmt = (cfg.examFee !== null && cfg.examFee !== undefined && cfg.examFee !== '' && !isNaN(Number(cfg.examFee)))
    ? Number(cfg.examFee)
    : (struct.examFee || 200);
  const examAlreadyPaid = isExamFeeAlreadyPaid(s.id, mo, yr);
  const examEnabled = isExamMonth && !examAlreadyPaid && (cfg.examEnabled !== false);

  // 3. Admission Fee (One-time per active academic session)
  const admAlreadyPaid = isAdmissionFeeAlreadyPaid(s.id, curSess);
  const admAmt = (cfg.customAdmission !== null && cfg.customAdmission !== undefined && cfg.customAdmission !== '' && !isNaN(Number(cfg.customAdmission)))
    ? Number(cfg.customAdmission)
    : (struct.admission || 500);

  // Admission Fee is one-time per academic session, scheduled in April
  const isFirstMonth = (mo === 'April');
  const admEnabled = isFirstMonth && !admAlreadyPaid && (cfg.admission !== false);

  const list = [
    { type: 'School Fee', amount: schoolAmt, enabled: schoolEnabled }
  ];
  if (examEnabled) {
    list.push({ type: 'Exam Fee', amount: examAmt, enabled: true });
  }
  if (admEnabled) {
    list.push({ type: 'Admission Fee', amount: admAmt, enabled: true });
  }
  return list;
}

function initFeeLedger(s, targetMonth = null, targetYear = null) {
  if (!s) return [];
  const mo = targetMonth || document.getElementById('fe_mo')?.value || 'April';
  const yr = targetYear || document.getElementById('fe_yr')?.value || '2026';
  const key = `${s.id}_${mo}_${yr}`;

  const curSess = s.session || (DB.settings && DB.settings.currentSession) || '2026–27';

  // If period is not valid for student:
  if (!isPeriodValidForStudent(s, mo, yr)) {
    if (DB.fees && Array.isArray(DB.fees[key]) && DB.fees[key].length > 0) {
      return DB.fees[key].filter(f => f.type !== 'Van Fee' && f.type !== 'Transport Fee');
    }
    return [];
  }

  const isValidSession = isFeeInAcademicSession(mo, yr, curSess);

  if (!DB.fees[key]) {
    const effective = getEffectiveFeesForStudent(s, mo, yr)
      .filter(f => f.enabled)
      .map(f => ({ type: f.type, amount: f.amount, paid: false, date: '', receiptNo: '', enabled: true }));

    // Only persist auto-generated empty fee records if they belong to valid active session
    if (isValidSession) {
      DB.fees[key] = effective;
      saveDB();
    }
    return effective;
  } else {
    // Synchronize while strictly preserving all existing, paid, and custom items
    DB.fees[key] = DB.fees[key].filter(f => !(!f.paid && (f.type === 'Van Fee' || f.type === 'Transport Fee')));
    const existing = DB.fees[key];
    const effective = getEffectiveFeesForStudent(s, mo, yr);
    effective.forEach(eff => {
      const found = existing.find(x => x.type === eff.type);
      if (!found && eff.enabled) {
        existing.push({ type: eff.type, amount: eff.amount, paid: false, date: '', receiptNo: '', enabled: true });
      } else if (found && !found.paid) {
        found.enabled = eff.enabled;
        // Do not overwrite amount if fee is partially paid or has active partial progress
        if (eff.enabled && !(found.partialPaid > 0) && !(found.discount > 0)) {
          found.amount = eff.amount;
        }
      }
    });
    return DB.fees[key];
  }
}

// Student Quick Search & 12-Month Session Overview
function onFeeStudentSearch(query) {
  const resEl = document.getElementById('feSearchResults');
  if (!resEl) return;
  const q = String(query || '').trim().toLowerCase();
  if (!q) {
    resEl.style.display = 'none';
    resEl.innerHTML = '';
    return;
  }

  const matches = (DB.students || []).filter(s => {
    if (s.status === 'Inactive' || s.status === 'Left School' || s.status === 'Alumni') return false;
    return (s.name && s.name.toLowerCase().includes(q)) ||
      String(s.admno).toLowerCase().includes(q) ||
      (s.cls && s.cls.toLowerCase().includes(q)) ||
      (s.phone && s.phone.includes(q)) ||
      (s.father && s.father.toLowerCase().includes(q));
  }).slice(0, 8);

  if (!matches.length) {
    resEl.innerHTML = '<div style="padding:10px 12px;font-size:12px;color:var(--txt2);text-align:center">No matching students found</div>';
    resEl.style.display = 'block';
    return;
  }

  resEl.innerHTML = matches.map(s => `
    <div class="fe-sr-item" onclick="selectStudentFromSearch(${s.id})">
      <div>
        <strong>${s.name}</strong>
        <span style="font-size:11px;color:var(--txt2);margin-left:6px">${clL(s.cls)} (Sec ${s.section || 'A'}) | Father: ${s.father}</span>
      </div>
      <div><span class="chip cb2" style="font-size:10.5px">Adm: ${s.admno}</span></div>
    </div>`).join('');
  resEl.style.display = 'block';
}

function clearFeeSearch() {
  const inp = document.getElementById('fe_search');
  if (inp) inp.value = '';
  const resEl = document.getElementById('feSearchResults');
  if (resEl) {
    resEl.innerHTML = '';
    resEl.style.display = 'none';
  }
}

function selectStudentFromSearch(sid) {
  const s = DB.students.find(x => x.id === sid);
  if (!s) return;
  clearFeeSearch();
  const clEl = document.getElementById('fe_cl');
  if (clEl) clEl.value = s.cls;
  loadFeSt();
  const stEl = document.getElementById('fe_st');
  if (stEl) stEl.value = String(s.id);
  curFSid = s.id;
  renderFeD();
}

function render12MonthSessionOverview(s) {
  const ovCard = document.getElementById('feStudentOverviewCard');
  if (!ovCard) return;

  if (!s) {
    ovCard.style.display = 'none';
    return;
  }

  ovCard.style.display = 'block';
  const curSess = (DB.settings && DB.settings.currentSession) || '2026–27';
  const [startY, endY] = parseSessionYears(curSess);

  // Student Meta
  const nameEl = document.getElementById('feOvStudentName');
  const metaEl = document.getElementById('feOvStudentMeta');
  if (nameEl) nameEl.textContent = `${s.name} (Adm: ${s.admno})`;
  if (metaEl) metaEl.textContent = `${clL(s.cls)} (Sec ${s.section || 'A'}) | Father: ${s.father} | Phone: ${s.phone || '–'} | Session: ${curSess}`;

  // 4 Financial Summary Badges
  const curDue = calcStudentCurrentSessionDue(s, curSess);
  const arrears = calcStudentPreviousArrears(s, curSess);
  const advBal = getStudentAdvanceBalance(s.id);
  const paidTot = calcStudentSessionPaid(s, curSess);

  const cdEl = document.getElementById('feOvCurDue');
  const arEl = document.getElementById('feOvArrears');
  const adEl = document.getElementById('feOvAdvance');
  const pdEl = document.getElementById('feOvPaid');

  if (cdEl) cdEl.textContent = '₹' + curDue.toLocaleString('en-IN');
  if (arEl) arEl.textContent = '₹' + arrears.toLocaleString('en-IN');
  if (adEl) adEl.textContent = '₹' + advBal.toLocaleString('en-IN');
  if (pdEl) pdEl.textContent = '₹' + paidTot.toLocaleString('en-IN');

  // 12-Month Grid
  const gridEl = document.getElementById('fe12MonthGrid');
  if (!gridEl) return;

  const curMo = document.getElementById('fe_mo')?.value || 'April';
  const curYr = parseInt(document.getElementById('fe_yr')?.value) || 2026;

  gridEl.innerHTML = MONTHS_LIST.map((mo, idx) => {
    const yr = (idx < 9) ? startY : endY;
    const isSelected = (mo === curMo && yr === curYr);
    const key = `${s.id}_${mo}_${yr}`;
    const fees = DB.fees[key] || [];

    const isDue = isFeeRecordCurrentlyDue(mo, yr, curSess);
    const enabledFees = fees.filter(f => f.enabled !== false);
    const hasFees = enabledFees.length > 0;
    const allPaid = hasFees && enabledFees.every(f => f.paid);
    const anyPaid = enabledFees.some(f => f.paid);

    let statusChip = '';
    let cardBg = '#fff';
    let amtLabel = '';

    if (allPaid) {
      statusChip = '<span class="chip cg" style="font-size:10px">Paid ✓</span>';
      cardBg = '#eafaf1';
      const totPaid = enabledFees.reduce((a, f) => a + (Number(f.amount) || 0), 0);
      amtLabel = `<span style="color:var(--grn);font-size:11px;font-weight:600">₹${totPaid.toLocaleString('en-IN')}</span>`;
    } else if (anyPaid) {
      statusChip = '<span class="chip cy" style="font-size:10px">Partial</span>';
      cardBg = '#fefde8';
      const rem = enabledFees.filter(f => !f.paid).reduce((a, f) => a + (Number(f.amount) || 0), 0);
      amtLabel = `<span style="color:var(--ylw);font-size:11px;font-weight:600">Due: ₹${rem.toLocaleString('en-IN')}</span>`;
    } else if (isDue) {
      statusChip = '<span class="chip cr" style="font-size:10px">Due</span>';
      cardBg = '#fdf2f2';
      const eff = getEffectiveFeesForStudent(s, mo, yr).filter(f => f.enabled);
      const effTot = eff.reduce((a, f) => a + (Number(f.amount) || 0), 0);
      amtLabel = `<span style="color:var(--red);font-size:11px;font-weight:600">₹${effTot.toLocaleString('en-IN')}</span>`;
    } else {
      statusChip = '<span class="chip cgr" style="font-size:10px">Upcoming</span>';
      cardBg = '#fbfcfc';
      amtLabel = '<span style="color:var(--txt2);font-size:11px">Future</span>';
    }

    return `
      <div class="mc-card ${isSelected ? 'active' : ''}" style="background:${isSelected ? '#fff' : cardBg}" onclick="selectFeeMonth('${mo}', ${yr})">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span class="mo-name">${mo.substring(0, 3)} ${yr}</span>
          ${statusChip}
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:2px">
          ${amtLabel}
          ${isSelected ? '<span style="font-size:9.5px;color:var(--red);font-weight:700">ACTIVE</span>' : ''}
        </div>
      </div>`;
  }).join('');
}

function selectFeeMonth(mo, yr) {
  const mEl = document.getElementById('fe_mo');
  const yEl = document.getElementById('fe_yr');
  if (mEl) mEl.value = mo;
  if (yEl) yEl.value = yr;
  renderFeD();
}

function getGroupedOverdueFees(s, curSess, selIdx) {
  const [startY, endY] = parseSessionYears(curSess);
  const schoolFeeGroups = [];
  const specialItems = [];
  let currentSchoolRun = null;

  for (let pi = 0; pi < selIdx; pi++) {
    const pMo = MONTHS_LIST[pi];
    const pYr = (pi < 9) ? startY : endY;
    const pFees = initFeeLedger(s, pMo, pYr).filter(f => f.enabled !== false && f.type !== 'Van Fee' && f.type !== 'Transport Fee');

    // 1. Monthly School Fee
    const schoolFee = pFees.find(f => (f.type === 'School Fee' || f.type === 'Tuition Fee'));
    if (schoolFee && !schoolFee.paid) {
      const amt = Number(schoolFee.amount) || 0;
      const partialPaid = Number(schoolFee.partialPaid) || 0;
      const rem = schoolFee.partialRemaining !== undefined ? Number(schoolFee.partialRemaining) : (amt - partialPaid);
      const isPartial = partialPaid > 0;
      const monthItem = {
        mo: pMo,
        yr: pYr,
        mIdx: pi,
        amount: amt,
        paid: partialPaid,
        remaining: rem,
        isPartial,
        monthKey: `${pMo}_${pYr}`
      };

      if (currentSchoolRun && pi === currentSchoolRun.lastIndex + 1) {
        currentSchoolRun.items.push(monthItem);
        currentSchoolRun.totalRemaining += rem;
        currentSchoolRun.lastIndex = pi;
        currentSchoolRun.endMo = pMo;
        currentSchoolRun.endYr = pYr;
        currentSchoolRun.count++;
        currentSchoolRun.monthKeys.push(`${pMo}_${pYr}`);
        if (isPartial) currentSchoolRun.hasPartial = true;
      } else {
        if (currentSchoolRun) schoolFeeGroups.push(currentSchoolRun);
        currentSchoolRun = {
          type: 'School Fee',
          startMo: pMo,
          startYr: pYr,
          endMo: pMo,
          endYr: pYr,
          count: 1,
          totalRemaining: rem,
          hasPartial: isPartial,
          startIndex: pi,
          lastIndex: pi,
          items: [monthItem],
          monthKeys: [`${pMo}_${pYr}`]
        };
      }
    } else {
      if (currentSchoolRun) {
        schoolFeeGroups.push(currentSchoolRun);
        currentSchoolRun = null;
      }
    }

    // 2. Special / Non-Monthly Fees (Exam Fee, Admission Fee, Custom charges)
    pFees.forEach(f => {
      if (f.type !== 'School Fee' && f.type !== 'Tuition Fee' && !f.paid) {
        const amt = Number(f.amount) || 0;
        const partialPaid = Number(f.partialPaid) || 0;
        const rem = f.partialRemaining !== undefined ? Number(f.partialRemaining) : (amt - partialPaid);
        specialItems.push({
          type: f.type,
          mo: pMo,
          yr: pYr,
          mIdx: pi,
          amount: amt,
          paid: partialPaid,
          remaining: rem,
          isPartial: partialPaid > 0,
          monthKey: `${pMo}_${pYr}`
        });
      }
    });
  }

  if (currentSchoolRun) {
    schoolFeeGroups.push(currentSchoolRun);
  }

  return { schoolFeeGroups, specialItems };
}

function openCombinedPayWithSelection(targetMonths, targetCategory) {
  openCombinedPay(targetMonths, targetCategory);
}

// Helper: Group consecutive School Fee months into a single line item with accumulated totals
function groupReceiptItems(items) {
  if (!Array.isArray(items) || items.length === 0) return [];

  const schoolItems = [];
  const otherItems = [];

  items.forEach(it => {
    const itType = it.type || '';
    const baseAmt = Number(it.baseAmount !== undefined ? it.baseAmount : it.amount) || 0;
    const paidAmt = Number(it.paidAmount !== undefined ? it.paidAmount : it.amount) || 0;
    const discAmt = Number(it.discount) || 0;
    const remDue = Number(it.remainingDue !== undefined ? it.remainingDue : (it.partialRemaining !== undefined ? it.partialRemaining : 0)) || 0;

    if (itType === 'School Fee' || itType === 'Tuition Fee') {
      const mIdx = MONTHS_LIST.indexOf(it.month);
      schoolItems.push({
        ...it,
        type: 'School Fee',
        baseAmount: baseAmt,
        paidAmount: paidAmt,
        amount: paidAmt,
        discount: discAmt,
        remainingDue: remDue,
        discountReason: it.discountReason || '',
        mIdx: mIdx >= 0 ? mIdx : 99,
        year: parseInt(it.year) || 0
      });
    } else {
      otherItems.push({
        ...it,
        type: itType,
        baseAmount: baseAmt,
        paidAmount: paidAmt,
        amount: paidAmt,
        discount: discAmt,
        remainingDue: remDue,
        discountReason: it.discountReason || ''
      });
    }
  });

  // Sort schoolItems chronologically by year then session month index
  schoolItems.sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.mIdx - b.mIdx;
  });

  const grouped = [];
  let curRun = null;

  function formatSchoolRun(run) {
    const period = run.count === 1
      ? `${run.startMo} ${run.startYr}`
      : `${run.startMo} ${run.startYr} – ${run.endMo} ${run.endYr}`;
    return {
      type: 'School Fee',
      period: period,
      count: run.count,
      baseAmount: run.baseAmount,
      discount: run.discount,
      paidAmount: run.paidAmount,
      amount: run.paidAmount,
      remainingDue: run.remainingDue,
      discountReason: run.discountReasons.filter(Boolean).join(', ') || '',
      label: `School Fee (${period})`
    };
  }

  schoolItems.forEach(it => {
    // Check if consecutive month in same sequence and session
    const sameSession = !it.session || !curRun?.session || it.session === curRun.session;
    const isConsecutive = curRun && sameSession && (
      (it.year === curRun.lastYr && it.mIdx === curRun.lastMIdx + 1) ||
      (it.year === curRun.lastYr + 1 && curRun.lastMIdx === 8 && it.mIdx === 9) // December -> January session rollover
    );

    if (isConsecutive) {
      curRun.endMo = it.month;
      curRun.endYr = it.year;
      curRun.lastMIdx = it.mIdx;
      curRun.lastYr = it.year;
      curRun.count++;
      curRun.baseAmount += it.baseAmount;
      curRun.discount += it.discount;
      curRun.paidAmount += it.paidAmount;
      curRun.remainingDue += it.remainingDue;
      if (it.discountReason && !curRun.discountReasons.includes(it.discountReason)) {
        curRun.discountReasons.push(it.discountReason);
      }
    } else {
      if (curRun) {
        grouped.push(formatSchoolRun(curRun));
      }
      curRun = {
        type: 'School Fee',
        session: it.session || '',
        startMo: it.month,
        startYr: it.year,
        endMo: it.month,
        endYr: it.year,
        firstMIdx: it.mIdx,
        lastMIdx: it.mIdx,
        firstYr: it.year,
        lastYr: it.year,
        count: 1,
        baseAmount: it.baseAmount,
        discount: it.discount,
        paidAmount: it.paidAmount,
        remainingDue: it.remainingDue,
        discountReasons: it.discountReason ? [it.discountReason] : []
      };
    }
  });
  if (curRun) {
    grouped.push(formatSchoolRun(curRun));
  }

  otherItems.forEach(it => {
    let period = it.period;
    if (!period) {
      if (it.month) {
        period = it.year ? `${it.month} ${it.year}` : it.month;
      } else {
        period = '–';
      }
    }
    grouped.push({
      type: it.type,
      period: period,
      count: 1,
      baseAmount: it.baseAmount,
      discount: it.discount,
      paidAmount: it.paidAmount,
      amount: it.paidAmount,
      remainingDue: it.remainingDue,
      discountReason: it.discountReason || '',
      label: `${it.type} (${period})`
    });
  });

  return grouped;
}

function renderAllStudentsOverview() {
  const clsEl = document.getElementById('fe_cl');
  const cls = clsEl ? clsEl.value : '';
  const selMo = document.getElementById('fe_mo')?.value || 'April';
  const selYr = parseInt(document.getElementById('fe_yr')?.value) || 2026;
  const curSess = (DB.settings && DB.settings.currentSession) || '2026–27';

  // Hide single student 12-month overview card
  render12MonthSessionOverview(null);

  const eligibleStudents = (DB.students || []).filter(s => 
    s.status !== 'Inactive' && s.status !== 'Left School' && s.status !== 'Alumni'
  );
  const roster = cls ? eligibleStudents.filter(s => s.cls === cls) : eligibleStudents;

  // Calculate roster totals across all active students
  let grandTot = 0;
  let grandPaid = 0;
  let grandDue = 0;
  let grandCurSessionDue = 0;
  let grandPrevArrears = 0;

  roster.forEach(st => {
    grandCurSessionDue += calcStudentCurrentSessionDue(st, curSess);
    grandPrevArrears += calcStudentPreviousArrears(st, curSess);
  });
  const grandCombined = grandCurSessionDue + grandPrevArrears;

  const rosterData = roster.map(st => {
    const isValid = isPeriodValidForStudent(st, selMo, selYr);
    if (!isValid) {
      return {
        student: st,
        tot: 0,
        paid: 0,
        due: 0,
        statusChip: '<span class="chip cgr" style="font-size:10px">Outside Session</span>'
      };
    }

    const fees = initFeeLedger(st, selMo, selYr).filter(f => f.enabled !== false && f.type !== 'Van Fee' && f.type !== 'Transport Fee');
    const tot = fees.reduce((a, f) => a + (Number(f.amount) || 0), 0);
    const paid = fees.filter(f => f.paid).reduce((a, f) => a + (Number(f.amount) || 0), 0) +
      fees.filter(f => !f.paid && f.partialPaid > 0).reduce((a, f) => a + (Number(f.partialPaid) || 0), 0);
    const due = Math.max(0, tot - paid);

    grandTot += tot;
    grandPaid += paid;
    grandDue += due;

    let chip = '';
    if (tot === 0) chip = '<span class="chip cgr" style="font-size:10px">No Fee</span>';
    else if (due === 0) chip = '<span class="chip cg" style="font-size:10px">Paid ✓</span>';
    else if (paid > 0) chip = `<span class="chip cy" style="font-size:10px">Partial (₹${due.toLocaleString('en-IN')})</span>`;
    else chip = '<span class="chip cr" style="font-size:10px">Due</span>';

    return {
      student: st,
      tot,
      paid,
      due,
      statusChip: chip
    };
  });

  // Update 4 Summary Cards
  document.getElementById('fe-t').textContent = '₹' + grandTot.toLocaleString('en-IN');
  const tSub = document.getElementById('fe-t-sub');
  if (tSub) tSub.textContent = `Paid: ₹${grandPaid.toLocaleString('en-IN')} · Due: ₹${grandDue.toLocaleString('en-IN')}`;

  document.getElementById('fe-d').textContent = '₹' + grandCurSessionDue.toLocaleString('en-IN');
  const dSub = document.getElementById('fe-d-sub');
  if (dSub) dSub.textContent = `Session ${curSess} (${roster.length} students)`;

  const arrEl = document.getElementById('fe-arr');
  if (arrEl) arrEl.textContent = '₹' + grandPrevArrears.toLocaleString('en-IN');
  const arrSub = document.getElementById('fe-arr-sub');
  if (arrSub) arrSub.textContent = grandPrevArrears > 0 ? 'Carried forward arrears' : 'No prior arrears ✓';

  const combEl = document.getElementById('fe-comb');
  if (combEl) combEl.textContent = '₹' + grandCombined.toLocaleString('en-IN');
  const combSub = document.getElementById('fe-comb-sub');
  if (combSub) combSub.textContent = 'Total Outstanding Roster';

  // Compatibility elements
  const pEl = document.getElementById('fe-p');
  if (pEl) pEl.textContent = '₹' + grandPaid.toLocaleString('en-IN');
  const admStatEl = document.getElementById('fe-adm-stat');
  if (admStatEl) admStatEl.textContent = `${roster.length} Students`;

  const scopeLabel = cls ? `Class ${clL(cls)}` : 'All Classes';
  const thead = document.querySelector('#feLed')?.closest('table')?.querySelector('thead');
  if (thead) {
    thead.innerHTML = `<tr><th style="padding:6px 10px">Adm No</th><th style="padding:6px 10px">Student Name</th><th style="padding:6px 10px">Class</th><th style="padding:6px 10px;text-align:right">Configured</th><th style="padding:6px 10px;text-align:right">Paid</th><th style="padding:6px 10px;text-align:right">Pending Due</th><th style="padding:6px 10px;text-align:center">Status</th><th style="padding:6px 10px;text-align:center">Action</th></tr>`;
  }
  const ledCardTitle = document.querySelector('#feLed')?.closest('.card')?.querySelector('.ch h3');
  if (ledCardTitle) ledCardTitle.textContent = `Student Fee Collection Roster (${scopeLabel} · ${selMo} ${selYr})`;

  if (!rosterData.length) {
    document.getElementById('feLed').innerHTML = `<tr><td colspan="8" class="empty">No active students found in ${scopeLabel}.</td></tr>`;
  } else {
    document.getElementById('feLed').innerHTML = rosterData.map(r => `
      <tr>
        <td><strong>${r.student.admno}</strong></td>
        <td>
          <strong>${r.student.name}</strong>
          <div style="font-size:10.5px;color:var(--txt2)">Father: ${r.student.father || '–'}</div>
        </td>
        <td>${clL(r.student.cls)} (Sec ${r.student.section || 'A'})</td>
        <td style="text-align:right;font-weight:600">₹${r.tot.toLocaleString('en-IN')}</td>
        <td style="text-align:right;font-weight:600;color:var(--grn)">₹${r.paid.toLocaleString('en-IN')}</td>
        <td style="text-align:right;font-weight:700;color:${r.due > 0 ? 'var(--red)' : 'var(--txt2)'}">₹${r.due.toLocaleString('en-IN')}</td>
        <td style="text-align:center">${r.statusChip}</td>
        <td style="text-align:center">
          <div style="display:flex;gap:4px;justify-content:center">
            <button class="btn bs bsm" onclick="selectStudentForPayment(${r.student.id})" style="font-size:11px;padding:3px 8px" title="Collect fee for ${r.student.name}">⚡ Collect Fee</button>
            <button class="btn bo bsm" onclick="openStudentFeeDetailsModal(${r.student.id})" style="font-size:11px;padding:3px 7px" title="View Fee Details">👤</button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  renderAllStudentsHistory(roster);
}

function renderAllStudentsHistory(roster) {
  const rosterIds = new Set(roster.map(s => s.id));
  const rosterAdms = new Set(roster.map(s => String(s.admno)));

  const matchingPayments = (DB.payments || []).filter(p => 
    rosterIds.has(p.studentId) || rosterAdms.has(String(p.admno))
  ).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const theadEl = document.getElementById('feHistThead') || document.querySelector('#feHistTb')?.closest('table')?.querySelector('thead');
  if (theadEl) {
    theadEl.innerHTML = `<tr>
      <th style="padding:6px 10px;white-space:nowrap;width:95px">Date</th>
      <th style="padding:6px 10px;white-space:nowrap;width:125px">Receipt #</th>
      <th style="padding:6px 10px;white-space:nowrap;min-width:130px">Student</th>
      <th style="padding:6px 10px;min-width:140px">Month/Period</th>
      <th style="padding:6px 10px;white-space:nowrap;min-width:90px">Fee Category</th>
      <th style="padding:6px 10px;white-space:nowrap;width:65px">Mode</th>
      <th style="padding:6px 10px;white-space:nowrap;width:85px;text-align:right">Amount</th>
      <th style="padding:6px 10px;white-space:nowrap;width:70px;text-align:center">Status</th>
      <th style="padding:6px 10px;white-space:nowrap;width:130px;text-align:center">Action</th>
    </tr>`;
  }

  const hTb = document.getElementById('feHistTb');
  if (!hTb) return;

  if (!matchingPayments.length) {
    hTb.innerHTML = '<tr><td colspan="9" class="empty">No past payments recorded for selected students</td></tr>';
    return;
  }

  hTb.innerHTML = matchingPayments.slice(0, 50).map(p => {
    const isVoid = p.reversed;
    const statusBadge = isVoid
      ? `<span class="chip cr" style="font-size:10px">VOID</span>`
      : `<span class="chip cg" style="font-size:10px">Paid ✓</span>`;

    let displayPeriod = p.period;
    if (Array.isArray(p.items) && p.items.length > 0) {
      const g = groupReceiptItems(p.items);
      displayPeriod = g.map(it => `${it.type} (${it.period})`).join(', ');
    }

    return `<tr>
      <td style="white-space:nowrap">${p.date || '–'}</td>
      <td style="white-space:nowrap"><strong style="color:${isVoid ? 'var(--red)' : 'var(--blu)'}">${p.receiptNo}</strong></td>
      <td style="white-space:nowrap"><strong>${p.studentName}</strong> <span style="font-size:10.5px;color:var(--txt2)">(${p.admno})</span></td>
      <td style="min-width:140px;line-height:1.4">${displayPeriod || '–'}</td>
      <td style="white-space:nowrap">${p.category || 'School Fee'}</td>
      <td style="white-space:nowrap">${p.mode || 'Cash'}</td>
      <td style="white-space:nowrap;text-align:right;font-weight:700;color:${isVoid ? 'var(--txt2)' : 'var(--grn)'};${isVoid ? 'text-decoration:line-through' : ''}">₹${(Number(p.amount) || 0).toLocaleString('en-IN')}</td>
      <td style="white-space:nowrap;text-align:center">${statusBadge}</td>
      <td style="white-space:nowrap;text-align:center">
        <button class="btn bo bsm" onclick="showReceiptModal('${p.receiptNo}')" title="Preview receipt" style="font-size:11px;padding:3px 7px">🧾</button>
        <button class="btn bo bsm" onclick="printReceiptByNumber('${p.receiptNo}', 'a4')" title="Print formal A4 receipt" style="font-size:11px;padding:3px 7px">🖨 Print</button>
      </td>
    </tr>`;
  }).join('');
}

function renderStudentPaymentHistory(s) {
  let receiptMap = {};

  (DB.payments || []).filter(p => p.studentId === s.id || String(p.admno) === String(s.admno)).forEach(p => {
    let displayPeriod = p.period;
    if (Array.isArray(p.items) && p.items.length > 0) {
      const g = groupReceiptItems(p.items);
      displayPeriod = g.map(it => `${it.type} (${it.period})`).join(', ');
    }
    receiptMap[p.receiptNo] = {
      receiptNo: p.receiptNo,
      date: p.date || '–',
      mode: p.mode || 'Cash',
      period: displayPeriod || p.month || '–',
      category: p.category || 'School Fee',
      total: Number(p.amount) || 0,
      reversed: p.reversed === true
    };
  });

  Object.entries(DB.fees || {}).forEach(([k, arr]) => {
    if (!k.startsWith(s.id + '_') || !Array.isArray(arr)) return;
    const parts = k.split('_');
    const mo = parts[1], yr = parts[2];
    arr.filter(f => f.paid).forEach((f, idx) => {
      const rNo = f.receiptNo || ('REC-LEGACY-' + k + '-' + idx);
      if (!receiptMap[rNo]) {
        receiptMap[rNo] = {
          receiptNo: f.receiptNo || '–',
          date: f.date || '–',
          mode: f.mode || 'Cash',
          period: `${mo} ${yr}`,
          category: f.type,
          total: Number(f.amount) || 0,
          reversed: false
        };
      }
    });
  });

  const theadEl = document.getElementById('feHistThead') || document.querySelector('#feHistTb')?.closest('table')?.querySelector('thead');
  if (theadEl) {
    theadEl.innerHTML = `<tr>
      <th style="padding:6px 10px;white-space:nowrap;width:95px">Date</th>
      <th style="padding:6px 10px;white-space:nowrap;width:125px">Receipt #</th>
      <th style="padding:6px 10px;min-width:140px">Month/Period</th>
      <th style="padding:6px 10px;white-space:nowrap;min-width:90px">Fee Category</th>
      <th style="padding:6px 10px;white-space:nowrap;width:65px">Mode</th>
      <th style="padding:6px 10px;white-space:nowrap;width:85px;text-align:right">Amount</th>
      <th style="padding:6px 10px;white-space:nowrap;width:70px;text-align:center">Status</th>
      <th style="padding:6px 10px;white-space:nowrap;width:130px;text-align:center">Action</th>
    </tr>`;
  }

  const histRows = Object.values(receiptMap).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const hTb = document.getElementById('feHistTb');
  if (!hTb) return;
  if (!histRows.length) {
    hTb.innerHTML = '<tr><td colspan="8" class="empty">No past payments recorded for this student</td></tr>';
  } else {
    hTb.innerHTML = histRows.map(r => {
      const isVoid = r.reversed;
      const statusBadge = isVoid
        ? `<span class="chip cr" style="font-size:10px">VOID</span>`
        : `<span class="chip cg" style="font-size:10px">Paid ✓</span>`;

      return `<tr>
        <td style="white-space:nowrap">${r.date}</td>
        <td style="white-space:nowrap"><strong style="color:${isVoid ? 'var(--red)' : 'var(--blu)'}">${r.receiptNo}</strong></td>
        <td style="min-width:140px;line-height:1.4">${r.period}</td>
        <td style="white-space:nowrap">${r.category}</td>
        <td style="white-space:nowrap">${r.mode}</td>
        <td style="white-space:nowrap;text-align:right;font-weight:700;color:${isVoid ? 'var(--txt2)' : 'var(--grn)'};${isVoid ? 'text-decoration:line-through' : ''}">₹${r.total.toLocaleString('en-IN')}</td>
        <td style="white-space:nowrap;text-align:center">${statusBadge}</td>
        <td style="white-space:nowrap;text-align:center">
          <button class="btn bo bsm" onclick="showReceiptModal('${r.receiptNo}')" title="Preview receipt" style="font-size:11px;padding:3px 7px">🧾 Receipt</button>
          <button class="btn bo bsm" onclick="printReceiptByNumber('${r.receiptNo}', 'a4')" title="Print formal A4 receipt" style="font-size:11px;padding:3px 7px">🖨 Print</button>
        </td>
      </tr>`;
    }).join('');
  }
}

function renderFeD() {
  if (!curFSid) {
    const activeMo = document.getElementById('fe_mo')?.value || 'April';
    const activeYr = document.getElementById('fe_yr')?.value || '2026';
    document.getElementById('fe-t').textContent = '₹0';
    document.getElementById('fe-d').textContent = '₹0';
    if (document.getElementById('fe-arr')) document.getElementById('fe-arr').textContent = '₹0';
    if (document.getElementById('fe-comb')) document.getElementById('fe-comb').textContent = '₹0';
    if (document.getElementById('fe-t-sub')) document.getElementById('fe-t-sub').textContent = '–';
    if (document.getElementById('fe-d-sub')) document.getElementById('fe-d-sub').textContent = '–';
    if (document.getElementById('fe-arr-sub')) document.getElementById('fe-arr-sub').textContent = '–';
    if (document.getElementById('fe-comb-sub')) document.getElementById('fe-comb-sub').textContent = '–';
    if (document.getElementById('fe-p')) document.getElementById('fe-p').textContent = '₹0';
    if (document.getElementById('fe-adm-stat')) document.getElementById('fe-adm-stat').textContent = '–';

    const thead = document.querySelector('#feLed')?.closest('table')?.querySelector('thead');
    if (thead) thead.innerHTML = `<tr><th style="padding:6px 10px">Fee Category</th><th style="padding:6px 10px">Amount</th><th style="padding:6px 10px">Status</th><th style="padding:6px 10px">Receipt #</th><th style="padding:6px 10px">Date</th><th style="padding:6px 10px">Action</th></tr>`;
    document.getElementById('feLed').innerHTML = `<tr><td colspan="6" class="empty">Selected Fee Month: <strong>${activeMo} ${activeYr}</strong>. Please select Class and Student above to view monthly fee ledger.</td></tr>`;
    document.getElementById('feHistTb').innerHTML = `<tr><td colspan="8" class="empty">Select Class and Student above to view payment history.</td></tr>`;
    return;
  }

  if (curFSid === 'all') {
    renderAllStudentsOverview();
    return;
  }

  const s = DB.students.find(x => x.id === curFSid);
  if (!s) {
    return;
  }

  // Restore single student table header
  const thead = document.querySelector('#feLed')?.closest('table')?.querySelector('thead');
  if (thead) thead.innerHTML = `<tr><th style="padding:6px 10px">Fee Category</th><th style="padding:6px 10px">Amount</th><th style="padding:6px 10px">Status</th><th style="padding:6px 10px">Receipt #</th><th style="padding:6px 10px">Date</th><th style="padding:6px 10px">Action</th></tr>`;

  const appActiveSess = (DB.settings && DB.settings.currentSession) || '2026–27';
  const studentSess = s.session || appActiveSess;
  const curSess = studentSess;
  const [startY] = parseSessionYears(studentSess);
  const selMo = document.getElementById('fe_mo')?.value || 'April';
  const selYr = parseInt(document.getElementById('fe_yr')?.value) || startY;
  const enrollments = getStudentEnrollments(s);

  const mIdx = MONTHS_LIST.indexOf(selMo);
  const feeStartY = (mIdx < 9) ? selYr : selYr - 1;
  const feeSess = `${feeStartY}–${String(feeStartY + 1).slice(-2)}`;
  const feeSessAlt = `${feeStartY}-${String(feeStartY + 1).slice(-2)}`;

  const isInSession = (studentSess === feeSess || studentSess === feeSessAlt) ||
    enrollments.some(e => e.session === feeSess || e.session === feeSessAlt) ||
    isFeeInAcademicSession(selMo, selYr, appActiveSess);

  const isValidPeriod = isPeriodValidForStudent(s, selMo, selYr);

  // Student-level total outstanding due across all applicable unpaid obligations
  const curSessionDue = calcStudentCurrentSessionDue(s, studentSess);
  const prevArrears = calcStudentPreviousArrears(s, studentSess);
  const totalOutstanding = curSessionDue + prevArrears;

  const updateSummaryCards = (tot, paid) => {
    const rem = Math.max(0, tot - paid);
    // Card 1: Selected Month Fee
    const tEl = document.getElementById('fe-t');
    if (tEl) tEl.textContent = '₹' + tot.toLocaleString('en-IN');
    const tSub = document.getElementById('fe-t-sub');
    if (tSub) {
      if (tot === 0) {
        tSub.textContent = 'No fee scheduled';
      } else if (paid >= tot) {
        tSub.innerHTML = '<span style="color:var(--grn);font-weight:600">Paid ✓</span>';
      } else if (paid > 0) {
        tSub.innerHTML = `<span style="color:var(--grn)">Paid: ₹${paid.toLocaleString('en-IN')}</span> · <span style="color:var(--red)">Due: ₹${rem.toLocaleString('en-IN')}</span>`;
      } else {
        tSub.innerHTML = `<span style="color:var(--red)">Unpaid: ₹${tot.toLocaleString('en-IN')}</span>`;
      }
    }

    // Card 2: Current Session Due
    const dueEl = document.getElementById('fe-d');
    if (dueEl) dueEl.textContent = '₹' + curSessionDue.toLocaleString('en-IN');
    const dSub = document.getElementById('fe-d-sub');
    if (dSub) {
      dSub.textContent = curSessionDue === 0 ? 'All current dues clear ✓' : `Session ${studentSess} (up to ${selMo})`;
    }

    // Card 3: Previous Session Arrears
    const arrEl = document.getElementById('fe-arr');
    if (arrEl) arrEl.textContent = '₹' + prevArrears.toLocaleString('en-IN');
    const arrSub = document.getElementById('fe-arr-sub');
    if (arrSub) {
      arrSub.textContent = prevArrears === 0 ? 'No prior arrears ✓' : 'Carried forward';
    }

    // Card 4: Combined Balance
    const combEl = document.getElementById('fe-comb');
    if (combEl) combEl.textContent = '₹' + totalOutstanding.toLocaleString('en-IN');
    const combSub = document.getElementById('fe-comb-sub');
    if (combSub) {
      combSub.textContent = totalOutstanding === 0 ? 'Zero balance due ✓' : (prevArrears > 0 ? `Curr ₹${curSessionDue.toLocaleString('en-IN')} + Arrears ₹${prevArrears.toLocaleString('en-IN')}` : 'Total payable balance');
    }

    // Compatibility elements
    const pEl = document.getElementById('fe-p');
    if (pEl) pEl.textContent = '₹' + paid.toLocaleString('en-IN');
  };

  // If selected period is not valid for student, show clean empty state
  if (!isValidPeriod || (!isInSession && (!DB.fees[`${s.id}_${selMo}_${selYr}`] || DB.fees[`${s.id}_${selMo}_${selYr}`].length === 0))) {
    updateSummaryCards(0, 0);
    const admStatEl = document.getElementById('fe-adm-stat');
    if (admStatEl) admStatEl.textContent = '–';

    document.getElementById('feLed').innerHTML = `<tr><td colspan="6" class="empty" style="padding:22px;text-align:center;color:var(--txt2)">
      <div style="font-size:24px;margin-bottom:6px">📅</div>
      <strong>No active fee obligations for ${selMo} ${selYr}</strong>
      <div style="font-size:11.5px;margin-top:4px">Student ${s.name} (Adm: ${s.admno}) has no fee schedule configured for this period. Active session is ${studentSess}.</div>
    </td></tr>`;

    renderStudentPaymentHistory(s);
    return;
  }

  const fees = initFeeLedger(s);
  const enabledFees = fees.filter(f => f.enabled !== false && f.type !== 'Van Fee' && f.type !== 'Transport Fee');
  const tot = enabledFees.reduce((a, f) => a + (Number(f.amount) || 0), 0);
  const paid = enabledFees.filter(f => f.paid).reduce((a, f) => a + (Number(f.amount) || 0), 0) +
    enabledFees.filter(f => !f.paid && f.partialPaid > 0).reduce((a, f) => a + (Number(f.partialPaid) || 0), 0);

  updateSummaryCards(tot, paid);

  // Admission status for student and active/selected session
  const admStat = getStudentAdmissionFeeStatus(s.id, studentSess);
  const admStatus = admStat.label;
  const admStatEl = document.getElementById('fe-adm-stat');
  if (admStatEl) admStatEl.textContent = admStatus;

  // Selected Month rows only - clean, no grouped overdue blocks or extra panels
  let ledgerHtml = '';
  if (enabledFees.length === 0) {
    ledgerHtml = `<tr><td colspan="6" class="empty">No fee obligations found for ${selMo} ${selYr}.</td></tr>`;
  } else {
    ledgerHtml = enabledFees.map((f, i) => {
      const isPaid = f.paid === true;
      const periodStatus = getFeePeriodStatus(f, selMo, selYr, curSess);
      const statusChip = `<span class="chip ${periodStatus.chipClass}">${periodStatus.label}</span>`;
      return `<tr>
        <td><strong>${f.type}</strong></td>
        <td>₹${Number(f.amount).toLocaleString('en-IN')}</td>
        <td>${statusChip}</td>
        <td>${f.receiptNo || '–'}</td>
        <td>${f.date || '–'}</td>
        <td>${!isPaid ?
          `<button class="btn bs bsm" onclick="openPay(${i})">💳 Collect</button>` :
          `<button class="btn bo bsm" onclick="showSingleReceipt(${i})">🧾 Receipt</button>`
        }</td>
      </tr>`;
    }).join('');
  }

  document.getElementById('feLed').innerHTML = ledgerHtml;
  renderStudentPaymentHistory(s);
}

let spManualReceived = false;

// Simple Single Payment Modal Logic
function openPay(idx) {
  if (!curFSid || curFSid === 'all') return;
  const s = DB.students.find(x => x.id === curFSid);
  if (!s) return;

  const mo = document.getElementById('fe_mo')?.value || 'April';
  const yr = document.getElementById('fe_yr')?.value || '2026';
  const feeKey = `${s.id}_${mo}_${yr}`;

  // Synchronize fee ledger with effective configured fees
  initFeeLedger(s, mo, yr);

  const allFees = (DB.fees[feeKey] || []).filter(x => x.enabled !== false && x.type !== 'Van Fee' && x.type !== 'Transport Fee');
  const f = allFees[idx];
  if (!f) return;

  curPayFeeIndex = idx;
  spManualReceived = false;
  const baseAmt = Number(f.amount) || 0;
  const remainingDue = (f.partialRemaining !== undefined && f.partialRemaining > 0)
    ? Number(f.partialRemaining)
    : (f.paid ? 0 : baseAmt);

  const displayPeriod = `${mo} ${yr}`;

  document.getElementById('payB').innerHTML = `
    <div style="background:var(--bg);border-radius:8px;padding:12px 14px;margin-bottom:12px">
      <div style="font-size:11px;color:var(--txt2)">Student Details</div>
      <div style="font-weight:700;font-size:14px;margin-top:2px">${s.name} (Adm: ${s.admno})</div>
      <div style="font-size:11.5px;color:var(--txt2)">${clL(s.cls)} (Sec ${s.section || 'A'}) | Father: ${s.father || '–'} | Billing Period: <strong>${displayPeriod}</strong></div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
      <div style="background:var(--rl);border-radius:8px;padding:10px;text-align:center">
        <div style="font-size:10.5px;color:var(--red);margin-bottom:2px">Fee Category</div>
        <div style="font-weight:700;font-size:13.5px">${f.type}</div>
      </div>
      <div style="background:var(--gl);border-radius:8px;padding:10px;text-align:center">
        <div style="font-size:10.5px;color:var(--grn);margin-bottom:2px">Amount Due</div>
        <div style="font-weight:700;font-size:18px;color:var(--grn)">₹${remainingDue.toLocaleString('en-IN')}</div>
      </div>
    </div>

    <!-- Optional Adjustments: Late Fee & Discount -->
    <div style="background:#fff;border:1px solid var(--bdr);border-radius:8px;padding:10px 12px;margin-bottom:12px">
      <div style="font-size:11.5px;font-weight:700;margin-bottom:8px">Adjustments (Optional):</div>
      <div class="g2" style="gap:10px;margin-bottom:6px">
        <div class="fg">
          <label style="font-size:11px">Late Fee (₹)</label>
          <input type="number" id="sp_late_fee" value="0" min="0" oninput="calcSinglePayBreakdown()" style="padding:4px 8px;font-size:12px">
        </div>
        <div class="fg">
          <label style="font-size:11px">Concession / Discount (₹)</label>
          <input type="number" id="sp_disc_val" value="0" min="0" oninput="calcSinglePayBreakdown()" style="padding:4px 8px;font-size:12px">
        </div>
      </div>
      <div class="fg" style="margin-top:4px">
        <label style="font-size:11px">Discount Reason <span style="color:var(--txt2);font-weight:normal">(Required if Discount &gt; 0)</span></label>
        <input type="text" id="sp_disc_reason" list="sp_disc_reasons" placeholder="e.g. Sibling concession, Financial assistance" style="padding:4px 8px;font-size:12px">
        <datalist id="sp_disc_reasons">
          <option value="Financial assistance">
          <option value="Sibling concession">
          <option value="Principal-approved concession">
          <option value="Special concession">
          <option value="Staff ward concession">
          <option value="Other">
        </datalist>
      </div>
    </div>

    <!-- Payment Date, Mode, & Amount Received -->
    <div style="background:var(--bg);border-radius:8px;padding:10px 12px;margin-bottom:12px">
      <div class="g2" style="gap:10px;margin-bottom:8px">
        <div class="fg">
          <label style="font-size:11px">Payment Date</label>
          <input type="date" id="pay_dt" value="${new Date().toISOString().split('T')[0]}" style="padding:4px 8px;font-size:12px">
        </div>
        <div class="fg">
          <label style="font-size:11px">Payment Method</label>
          <select id="pay_md" style="padding:4px 8px;font-size:12px">
            <option>Cash</option>
            <option>UPI</option>
            <option>Bank Transfer</option>
            <option>Cheque</option>
            <option>Other</option>
          </select>
        </div>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px">
        <div>
          <div style="font-size:11px;font-weight:700;color:var(--txt)">Net Payable:</div>
          <div style="font-size:16px;font-weight:700;color:var(--red)" id="sp_net_payable">₹${remainingDue.toLocaleString('en-IN')}</div>
        </div>
        <div style="text-align:right">
          <label style="font-size:11px;font-weight:700">Amount Received (₹):</label>
          <input type="number" id="sp_amt_received" value="${remainingDue}" min="0" oninput="spManualReceived=true;calcSinglePayBreakdown()" style="width:110px;padding:4px 8px;font-size:14px;font-weight:700;border:1.5px solid var(--grn);border-radius:4px;text-align:right">
        </div>
      </div>
      <div id="sp_feedback_banner" style="margin-top:8px;font-size:11.5px;font-weight:600"></div>
    </div>`;

  openM('payM');
  calcSinglePayBreakdown();
}

function calcSinglePayBreakdown() {
  if (curPayFeeIndex === null || !curFSid) return;
  const s = DB.students.find(x => x.id === curFSid);
  const mo = document.getElementById('fe_mo')?.value || 'April';
  const yr = document.getElementById('fe_yr')?.value || '2026';
  const key = `${s.id}_${mo}_${yr}`;
  const fees = (DB.fees[key] || []).filter(f => f.enabled !== false && f.type !== 'Van Fee' && f.type !== 'Transport Fee');
  const f = fees[curPayFeeIndex];
  if (!f) return;

  const baseAmt = Number(f.amount) || 0;
  const remainingDue = (f.partialRemaining !== undefined && f.partialRemaining > 0) ? Number(f.partialRemaining) : (f.paid ? 0 : baseAmt);
  const lateFee = Math.max(0, parseFloat(document.getElementById('sp_late_fee')?.value) || 0);
  const discVal = Math.max(0, parseFloat(document.getElementById('sp_disc_val')?.value) || 0);

  const netPayable = Math.max(0, remainingDue + lateFee - discVal);
  const netEl = document.getElementById('sp_net_payable');
  if (netEl) netEl.textContent = '₹' + netPayable.toLocaleString('en-IN');

  const amtReceivedInp = document.getElementById('sp_amt_received');
  if (amtReceivedInp && !spManualReceived) {
    amtReceivedInp.value = netPayable;
  }

  const amtReceived = parseFloat(amtReceivedInp?.value);
  const validReceived = !isNaN(amtReceived) ? Math.max(0, amtReceived) : netPayable;
  const remBalance = Math.max(0, netPayable - validReceived);

  const feedbackEl = document.getElementById('sp_feedback_banner');
  if (feedbackEl) {
    if (netPayable === 0 && validReceived === 0) {
      feedbackEl.style.color = 'var(--grn)';
      feedbackEl.textContent = '✓ 100% Fee Waived via discount. Remaining balance: ₹0.';
    } else if (remBalance > 0) {
      feedbackEl.style.color = '#d35400';
      feedbackEl.textContent = `⚠️ Partial Payment: Remaining balance ₹${remBalance.toLocaleString('en-IN')} will stay due.`;
    } else {
      feedbackEl.style.color = 'var(--grn)';
      feedbackEl.textContent = '✓ Full payment confirmed.';
    }
  }
}

let isPaymentProcessing = false;

function procPay() {
  if (isPaymentProcessing) return;
  if (curPayFeeIndex === null || !curFSid) return;
  const s = DB.students.find(x => x.id === curFSid);
  if (!s) return;

  const mo = document.getElementById('fe_mo')?.value || 'April';
  const yr = document.getElementById('fe_yr')?.value || '2026';
  const key = `${s.id}_${mo}_${yr}`;
  const allFees = (DB.fees[key] || []).filter(f => f.enabled !== false && f.type !== 'Van Fee' && f.type !== 'Transport Fee');
  const f = allFees[curPayFeeIndex];

  if (!f) return;
  if (f.paid) {
    toast('Payment has already been confirmed!', 'warning');
    return;
  }

  isPaymentProcessing = true;
  try {

  const baseAmt = Number(f.amount) || 0;
  const priorDiscount = Number(f.discount) || 0;
  const priorPaid = (f.partialPaid !== undefined && f.partialPaid !== null)
    ? Number(f.partialPaid)
    : (f.paid ? Math.max(0, baseAmt - priorDiscount) : 0);

  const remainingDue = (f.partialRemaining !== undefined && f.partialRemaining > 0)
    ? Number(f.partialRemaining)
    : Math.max(0, baseAmt - priorDiscount - priorPaid);

  const lateFee = Math.max(0, parseFloat(document.getElementById('sp_late_fee')?.value) || 0);
  const discVal = Math.max(0, parseFloat(document.getElementById('sp_disc_val')?.value) || 0);
  const discReason = document.getElementById('sp_disc_reason')?.value?.trim() || '';

  if (discVal > (remainingDue + lateFee)) {
    toast(`Discount cannot exceed total payable fee amount (₹${remainingDue + lateFee})!`, 'warning');
    return;
  }

  if (discVal > 0 && !discReason) {
    toast('Please provide a discount reason for the concession.', 'warning');
    return;
  }

  const netPayable = Math.max(0, remainingDue + lateFee - discVal);
  const amtReceivedRaw = document.getElementById('sp_amt_received')?.value;
  let amtReceived = netPayable;
  if (amtReceivedRaw !== undefined && amtReceivedRaw !== '') {
    const parsedAmt = parseFloat(amtReceivedRaw);
    if (!isNaN(parsedAmt)) {
      if (parsedAmt < 0) {
        toast('Amount received cannot be negative!', 'warning');
        return;
      }
      if (parsedAmt > netPayable) {
        toast(`Amount received cannot exceed net payable amount (₹${netPayable})!`, 'warning');
        return;
      }
      amtReceived = parsedAmt;
    }
  }
  const dt = document.getElementById('pay_dt')?.value || new Date().toISOString().split('T')[0];
  const md = document.getElementById('pay_md')?.value || 'Cash';

  const receiptNo = getNextReceiptNumber();

  // Discount is waived amount, amtReceived is actual money collected
  const newCumulativeDiscount = priorDiscount + discVal;
  const newCumulativePaid = priorPaid + amtReceived;
  const totalPayableFee = baseAmt + lateFee;
  const newRemainingDue = Math.max(0, totalPayableFee - newCumulativeDiscount - newCumulativePaid);

  f.date = dt;
  f.mode = (netPayable === 0 && amtReceived === 0) ? 'Waived' : md;
  f.receiptNo = receiptNo;
  f.discount = newCumulativeDiscount;
  if (discReason) f.discountReason = discReason;
  f.partialPaid = newCumulativePaid;
  f.partialRemaining = newRemainingDue;
  if (lateFee > 0) f.lateFee = (Number(f.lateFee) || 0) + lateFee;

  let paymentStatus = 'FULL PAYMENT';
  let receiptDescription = '';

  if (newRemainingDue === 0) {
    f.paid = true;
    if (netPayable === 0 && amtReceived === 0) {
      paymentStatus = 'FEE WAIVED';
      receiptDescription = `Fee completely waived via authorized discount for ${f.type} (${mo} ${yr}). Remaining amount due: ₹0.`;
    } else {
      paymentStatus = 'FULL PAYMENT';
      receiptDescription = `Full payment received for ${f.type} (${mo} ${yr}). Remaining amount due: ₹0.`;
    }
  } else {
    f.paid = false;
    paymentStatus = 'PARTIAL PAYMENT';
    receiptDescription = `Partial payment received for ${f.type} (${mo} ${yr}). Remaining amount due: ₹${newRemainingDue.toLocaleString('en-IN')}.`;
  }

  // Record payment in DB.payments
  const mIdx = MONTHS_LIST.indexOf(mo);
  const feeStartY = (mIdx < 9) ? parseInt(yr) : parseInt(yr) - 1;
  const derivedSess = `${feeStartY}–${String(feeStartY + 1).slice(-2)}`;
  const paymentSess = (s.session && isFeeInAcademicSession(mo, yr, s.session)) ? s.session : derivedSess;

  if (!DB.payments) DB.payments = [];
  DB.payments.push({
    receiptNo: receiptNo,
    studentId: s.id,
    studentName: s.name,
    admno: s.admno,
    cls: s.cls,
    section: s.section || 'A',
    amount: amtReceived,
    baseSubtotal: baseAmt,
    lateFee: lateFee,
    discountAmt: discVal,
    discountReason: discReason,
    mode: md,
    date: dt,
    category: f.type,
    period: `${mo} ${yr}`,
    session: paymentSess,
    paymentStatus: paymentStatus,
    receiptDescription: receiptDescription,
    totalRemainingDue: newRemainingDue,
    items: [{
      month: mo,
      year: parseInt(yr),
      type: f.type,
      baseAmount: baseAmt,
      discount: discVal,
      discountReason: discReason,
      lateFee: lateFee,
      netPayable: netPayable,
      paidAmount: amtReceived,
      remainingDue: newRemainingDue,
      period: `${mo} ${yr}`,
      feeKey: key
    }],
    reversed: false,
    voidReason: '',
    voidDate: ''
  });

    saveDB(true);
    closeM('payM');

    renderFeD();
    logActivity('Payment Recorded', `Collected ₹${amtReceived} for ${s.name} - Receipt #${receiptNo} (${paymentStatus})`);
    toast(`Payment confirmed successfully! Receipt #${receiptNo}`, 'success');

    showReceiptModal(receiptNo);
  } finally {
    isPaymentProcessing = false;
  }
}

// ============================================================
// FINAL FEE COLLECTION UI & WORKFLOW UPGRADE CONTROLLERS
// ============================================================

let curUnifiedPayStudentId = null;
let curUnifiedPayState = null;

// 1. ALL STUDENTS OVERVIEW POPUP
function openAllStudentsModal() {
  const searchInp = document.getElementById('asm_search');
  if (searchInp) searchInp.value = '';
  const statusFilter = document.getElementById('asm_status_filter');
  if (statusFilter) statusFilter.value = 'all';
  renderAllStudentsModalTable();
  openM('allStudentsM');
}

function renderAllStudentsModalTable() {
  const bodyEl = document.getElementById('allStudentsBody');
  const countEl = document.getElementById('asm_count_badge');
  if (!bodyEl) return;

  const curSess = (DB.settings && DB.settings.currentSession) || '2026–27';
  const [startY, endY] = parseSessionYears(curSess);
  const q = (document.getElementById('asm_search')?.value || '').toLowerCase().trim();
  const filter = document.getElementById('asm_status_filter')?.value || 'all';

  const eligibleStudents = (DB.students || []).filter(s =>
    s.status !== 'Inactive' && s.status !== 'Left School' && s.status !== 'Alumni'
  );

  let filtered = eligibleStudents.filter(s => {
    if (!q) return true;
    const nameMatch = (s.name || '').toLowerCase().includes(q);
    const admMatch = String(s.admno || '').toLowerCase().includes(q);
    const fatherMatch = (s.father || '').toLowerCase().includes(q);
    const clsMatch = (s.cls || '').toLowerCase().includes(q);
    return nameMatch || admMatch || fatherMatch || clsMatch;
  });

  // Calculate fee status for each student
  const studentRows = filtered.map(s => {
    const sSess = s.session || curSess;
    const [sStartY, sEndY] = parseSessionYears(sSess);
    const curDue = calcStudentCurrentSessionDue(s, sSess);
    const arrears = calcStudentPreviousArrears(s, sSess);
    const totalDue = curDue + arrears;
    const paid = calcStudentSessionPaid(s, sSess);
    const totalApplicable = paid + totalDue;

    // School Fee Status & Period computation
    const activeDueMonths = [];
    MONTHS_LIST.forEach((mo, idx) => {
      const yr = (idx < 9) ? sStartY : sEndY;
      if (isFeeRecordCurrentlyDue(mo, yr, sSess) && isPeriodValidForStudent(s, mo, yr)) {
        let isPaid = false;
        let isPartial = false;
        let remAmt = 0;
        const fees = (DB.fees[`${s.id}_${mo}_${yr}`] || []).filter(f => f.enabled !== false && (f.type === 'School Fee' || f.type === 'Tuition Fee'));
        if (fees.length > 0) {
          const sf = fees[0];
          if (sf.paid) {
            isPaid = true;
          } else {
            const amt = Number(sf.amount) || 0;
            const pPaid = Number(sf.partialPaid) || 0;
            remAmt = (sf.partialRemaining !== undefined && sf.partialRemaining !== null) ? Number(sf.partialRemaining) : (amt - pPaid);
            if (pPaid > 0 && remAmt > 0) isPartial = true;
          }
        } else {
          const struct = (DB.feeStructures && DB.feeStructures[s.cls]) ? DB.feeStructures[s.cls] : { tuition: 400 };
          const cfg = getStudentFeeConfig(s.id);
          const baseAmt = (cfg.customTuition !== null && cfg.customTuition !== undefined && cfg.customTuition !== '' && !isNaN(Number(cfg.customTuition)))
            ? Number(cfg.customTuition) : struct.tuition;
          let paidAmt = 0;
          if (Array.isArray(DB.payments)) {
            DB.payments.forEach(p => {
              if (!p.reversed && String(p.studentId) === String(s.id)) {
                if (Array.isArray(p.items)) {
                  p.items.forEach(it => {
                    if (it.month === mo && Number(it.year) === Number(yr) && (it.type === 'School Fee' || it.type === 'Tuition')) {
                      paidAmt += (Number(it.baseAmount || it.amount) || 0);
                    }
                  });
                }
              }
            });
          }
          if (paidAmt >= baseAmt) {
            isPaid = true;
          } else if (paidAmt > 0) {
            isPartial = true;
            remAmt = baseAmt - paidAmt;
          } else {
            remAmt = baseAmt;
          }
        }

        activeDueMonths.push({ mo, yr, idx, isPaid, isPartial, remAmt });
      }
    });

    const paidList = activeDueMonths.filter(m => m.isPaid);
    const partialList = activeDueMonths.filter(m => m.isPartial);
    const unpaidList = activeDueMonths.filter(m => !m.isPaid && !m.isPartial);

    let schoolPeriodHtml = '<span class="chip cb" style="font-size:10px">Upcoming</span>';
    if (activeDueMonths.length > 0) {
      if (paidList.length === activeDueMonths.length) {
        const firstMo = activeDueMonths[0].mo.slice(0, 3);
        const lastMo = activeDueMonths[activeDueMonths.length - 1].mo.slice(0, 3);
        const yrStr = activeDueMonths[0].yr === activeDueMonths[activeDueMonths.length - 1].yr
          ? activeDueMonths[0].yr
          : `${activeDueMonths[0].yr}–${activeDueMonths[activeDueMonths.length - 1].yr}`;
        const pText = (activeDueMonths.length === 1) ? `${firstMo} ${yrStr}` : `${firstMo}–${lastMo} ${yrStr}`;
        schoolPeriodHtml = `<span class="chip cg" style="font-size:10px;white-space:nowrap;font-weight:600">Paid · ${pText}</span>`;
      } else if (partialList.length > 0) {
        const dueOrPartial = activeDueMonths.filter(m => !m.isPaid);
        const firstMo = dueOrPartial[0].mo.slice(0, 3);
        const lastMo = dueOrPartial[dueOrPartial.length - 1].mo.slice(0, 3);
        const yrStr = dueOrPartial[0].yr === dueOrPartial[dueOrPartial.length - 1].yr
          ? dueOrPartial[0].yr
          : `${dueOrPartial[0].yr}–${dueOrPartial[dueOrPartial.length - 1].yr}`;
        const pText = (dueOrPartial.length === 1) ? `${firstMo} ${yrStr}` : `${firstMo}–${lastMo} ${yrStr}`;
        schoolPeriodHtml = `<span class="chip cy" style="font-size:10px;white-space:nowrap;font-weight:600">Partial · ${pText}</span>`;
      } else if (paidList.length === 0) {
        const firstMo = activeDueMonths[0].mo.slice(0, 3);
        const lastMo = activeDueMonths[activeDueMonths.length - 1].mo.slice(0, 3);
        const yrStr = activeDueMonths[0].yr === activeDueMonths[activeDueMonths.length - 1].yr
          ? activeDueMonths[0].yr
          : `${activeDueMonths[0].yr}–${activeDueMonths[activeDueMonths.length - 1].yr}`;
        const pText = (activeDueMonths.length === 1) ? `${firstMo} ${yrStr}` : `${firstMo}–${lastMo} ${yrStr} (${activeDueMonths.length} mos)`;
        schoolPeriodHtml = `<span class="chip cr" style="font-size:10px;white-space:nowrap;font-weight:600">Due · ${pText}</span>`;
      } else {
        const firstUnpaid = unpaidList[0].mo.slice(0, 3);
        const lastUnpaid = unpaidList[unpaidList.length - 1].mo.slice(0, 3);
        const unpYr = unpaidList[0].yr === unpaidList[unpaidList.length - 1].yr
          ? unpaidList[0].yr
          : `${unpaidList[0].yr}–${unpaidList[unpaidList.length - 1].yr}`;
        const unpPeriodStr = (unpaidList.length === 1) ? `${firstUnpaid} ${unpYr}` : `${firstUnpaid}–${lastUnpaid} ${unpYr}`;
        const firstPaid = paidList[0].mo.slice(0, 3);
        const lastPaid = paidList[paidList.length - 1].mo.slice(0, 3);
        const paidPeriodStr = (paidList.length === 1) ? `${firstPaid}` : `${firstPaid}–${lastPaid}`;
        schoolPeriodHtml = `<div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap">
          <span class="chip cr" style="font-size:10px;white-space:nowrap;font-weight:600">Due · ${unpPeriodStr}</span>
          <span style="font-size:9.5px;color:var(--txt2);white-space:nowrap">(Paid ${paidPeriodStr})</span>
        </div>`;
      }
    }

    // Exam Fee Status (Sep, Dec, Mar)
    const examSepPaid = isExamFeeAlreadyPaid(s.id, 'September', sStartY);
    const examDecPaid = isExamFeeAlreadyPaid(s.id, 'December', sStartY);
    const examMarPaid = isExamFeeAlreadyPaid(s.id, 'March', sEndY);
    const examBadges = `
      <span class="chip ${examSepPaid ? 'cg' : 'cr'}" style="font-size:9.5px;padding:2px 5px" title="September Exam: ${examSepPaid ? 'Paid' : 'Due'}">Sep: ${examSepPaid ? '✓' : 'Due'}</span>
      <span class="chip ${examDecPaid ? 'cg' : 'cb'}" style="font-size:9.5px;padding:2px 5px;${examDecPaid ? '' : 'opacity:0.85'}" title="December Exam: ${examDecPaid ? 'Paid' : 'Upcoming'}">Dec: ${examDecPaid ? '✓' : 'Upc'}</span>
      <span class="chip ${examMarPaid ? 'cg' : 'cb'}" style="font-size:9.5px;padding:2px 5px;${examMarPaid ? '' : 'opacity:0.85'}" title="March Exam: ${examMarPaid ? 'Paid' : 'Upcoming'}">Mar: ${examMarPaid ? '✓' : 'Upc'}</span>
    `;

    // Admission Fee Status
    const admStat = getStudentAdmissionFeeStatus(s.id, sSess);
    const admBadge = admStat.status === 'N/A'
      ? '<span style="font-size:10px;color:var(--txt2)">N/A</span>'
      : (admStat.isPaid
        ? '<span class="chip cg" style="font-size:9.5px;padding:2px 6px">Paid ✓</span>'
        : (admStat.isPartial
          ? `<span class="chip cy" style="font-size:9.5px;padding:2px 6px">${admStat.label}</span>`
          : (admStat.isUpcoming
            ? '<span class="chip cb" style="font-size:9.5px;padding:2px 6px">Upcoming</span>'
            : '<span class="chip cr" style="font-size:9.5px;padding:2px 6px">Due</span>')));

    return {
      student: s,
      curDue,
      arrears,
      totalDue,
      paid,
      totalApplicable,
      schoolPeriodHtml,
      examBadges,
      admBadge
    };
  });

  // Apply status filter
  let displayRows = studentRows;
  if (filter === 'due') {
    displayRows = studentRows.filter(r => r.totalDue > 0);
  } else if (filter === 'paid') {
    displayRows = studentRows.filter(r => r.totalDue === 0 && r.paid > 0);
  } else if (filter === 'partial') {
    displayRows = studentRows.filter(r => r.paid > 0 && r.totalDue > 0);
  }

  if (countEl) countEl.textContent = `Showing ${displayRows.length} of ${eligibleStudents.length} students`;

  if (displayRows.length === 0) {
    bodyEl.innerHTML = '<div style="text-align:center;padding:30px;color:var(--txt2);font-size:13px">No students match the current search & filter criteria.</div>';
    return;
  }

  // Group by Class
  const byClass = {};
  displayRows.forEach(r => {
    const c = r.student.cls || 'Other';
    if (!byClass[c]) byClass[c] = [];
    byClass[c].push(r);
  });

  let html = '';
  CLASSES.concat(['Other']).forEach(cls => {
    const list = byClass[cls];
    if (!list || list.length === 0) return;

    html += `
      <div style="margin-bottom:14px;border:1px solid var(--bdr);border-radius:8px;overflow:hidden;background:#fff">
        <div style="background:var(--bg);padding:7px 12px;border-bottom:1px solid var(--bdr);display:flex;justify-content:space-between;align-items:center">
          <strong style="font-size:12.5px;color:var(--txt)">${clL(cls)}</strong>
          <span style="font-size:11px;color:var(--txt2)">${list.length} Student${list.length > 1 ? 's' : ''}</span>
        </div>
        <div class="tw" style="overflow-x:auto">
          <table style="width:100%;font-size:11.5px;margin:0;border-collapse:collapse;min-width:1040px">
            <thead>
              <tr style="background:var(--bg)">
                <th style="padding:6px 8px;white-space:nowrap;width:55px">Adm #</th>
                <th style="padding:6px 8px;min-width:130px">Student Name</th>
                <th style="padding:6px 8px;white-space:nowrap;width:75px">Class/Sec</th>
                <th style="padding:6px 8px;white-space:nowrap;text-align:right;width:75px">Total Fee</th>
                <th style="padding:6px 8px;white-space:nowrap;text-align:right;width:70px">Paid</th>
                <th style="padding:6px 8px;white-space:nowrap;text-align:right;width:80px">Current Due</th>
                <th style="padding:6px 8px;white-space:nowrap;text-align:right;width:65px">Arrears</th>
                <th style="padding:6px 8px;min-width:160px">School Fee Status & Period</th>
                <th style="padding:6px 8px;white-space:nowrap;min-width:130px">Exam Fees</th>
                <th style="padding:6px 8px;white-space:nowrap;width:70px">Admission</th>
                <th style="padding:6px 8px;white-space:nowrap;text-align:center;width:80px">Action</th>
              </tr>
            </thead>
            <tbody>
              ${list.map(r => `
                <tr>
                  <td style="padding:6px 8px"><strong>${r.student.admno}</strong></td>
                  <td style="padding:6px 8px">
                    <div style="font-weight:600">${r.student.name}</div>
                    ${r.student.father ? `<div style="font-size:9.5px;color:var(--txt2);line-height:1.2">F: ${r.student.father}</div>` : ''}
                  </td>
                  <td style="padding:6px 8px">
                    <span class="chip cb2" style="font-size:10px;padding:2px 5px">${clL(r.student.cls)}${r.student.section ? ' (' + r.student.section + ')' : ''}</span>
                    <div style="font-size:9.5px;color:var(--txt2);margin-top:2px">Session: <strong>${r.student.session || curSess}</strong></div>
                  </td>
                  <td style="padding:6px 8px;text-align:right;white-space:nowrap;font-weight:600">₹${r.totalApplicable.toLocaleString('en-IN')}</td>
                  <td style="padding:6px 8px;text-align:right;white-space:nowrap;color:var(--grn);font-weight:600">₹${r.paid.toLocaleString('en-IN')}</td>
                  <td style="padding:6px 8px;text-align:right;white-space:nowrap;color:${r.curDue > 0 ? 'var(--red)' : 'var(--txt2)'};font-weight:${r.curDue > 0 ? '700' : 'normal'}">₹${r.curDue.toLocaleString('en-IN')}</td>
                  <td style="padding:6px 8px;text-align:right;white-space:nowrap;color:${r.arrears > 0 ? 'var(--red)' : 'var(--txt2)'};font-weight:${r.arrears > 0 ? '700' : 'normal'}">${r.arrears > 0 ? '₹' + r.arrears.toLocaleString('en-IN') : '₹0'}</td>
                  <td style="padding:6px 8px">${r.schoolPeriodHtml}</td>
                  <td style="padding:6px 8px"><div style="display:flex;gap:3px;align-items:center">${r.examBadges}</div></td>
                  <td style="padding:6px 8px">${r.admBadge}</td>
                  <td style="padding:6px 8px;text-align:center">
                    <button class="btn bo bsm" onclick="viewStudentFromAllModal(${r.student.id})" style="font-size:10px;padding:3px 7px;white-space:nowrap">View Details</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  });

  bodyEl.innerHTML = html;
}

function viewStudentFromAllModal(sid) {
  closeM('allStudentsM');
  selectStudentForPayment(sid);
  openStudentFeeDetailsModal(sid);
}

function viewSt(sid) {
  openStudentFeeDetailsModal(sid);
}

// 2. STUDENT FEE DETAILS POPUP
function openStudentFeeDetailsModal(sid, targetSession = null) {
  const targetId = sid || curFSid;
  if (!targetId || targetId === 'all') {
    toast('Please select a student first', 'warning');
    return;
  }
  const s = (DB.students || []).find(x => x.id === targetId);
  if (!s) {
    toast('Student record not found', 'error');
    return;
  }

  curUnifiedPayStudentId = s.id;
  const bodyEl = document.getElementById('feeDetailsBody');
  if (!bodyEl) return;

  const enrollments = getStudentEnrollments(s);
  const curSess = targetSession || s.session || (DB.settings && DB.settings.currentSession) || '2026–27';
  const currentEnr = enrollments.find(e => e.session === curSess) || { session: curSess, cls: s.cls, section: s.section || 'A' };
  const effectiveClass = currentEnr.cls || s.cls;
  const [startY, endY] = parseSessionYears(curSess);
  const struct = (DB.feeStructures && DB.feeStructures[effectiveClass]) ? DB.feeStructures[effectiveClass] : { tuition: 400, admission: 500, examFee: 200 };
  const cfg = getStudentFeeConfig(s.id);

  const curDue = calcStudentCurrentSessionDue(s, curSess);
  const arrears = calcStudentPreviousArrears(s, curSess);
  const paidTot = calcStudentSessionPaid(s, curSess);
  const totalApplicable = paidTot + curDue + arrears;

  // Build Monthly School Fee Ledger
  const monthlyRows = MONTHS_LIST.map((mo, idx) => {
    const yr = (idx < 9) ? startY : endY;
    const key = `${s.id}_${mo}_${yr}`;
    const allFees = (DB.fees[key] || []).filter(f => f.enabled !== false && f.type !== 'Van Fee' && f.type !== 'Transport Fee');
    const schFee = allFees.find(f => f.type === 'School Fee' || f.type === 'Tuition Fee');

    let amt = (cfg.customTuition !== null && cfg.customTuition !== undefined && cfg.customTuition !== '' && !isNaN(Number(cfg.customTuition)))
      ? Number(cfg.customTuition) : struct.tuition;
    let statusText = 'Pending';
    let statusColor = 'var(--red)';
    let receiptStr = '–';

    if (schFee) {
      if (schFee.paid || (schFee.partialPaid && schFee.partialPaid > 0)) {
        amt = Number(schFee.amount) || amt;
      } else {
        // Synchronize unpaid fee amount with student's configured rate
        schFee.amount = amt;
      }
      if (schFee.receiptNo) receiptStr = schFee.receiptNo;
    }

    const periodStatus = getFeePeriodStatus(schFee, mo, yr, curSess);
    statusText = periodStatus.label;
    if (periodStatus.status === 'Paid') statusColor = 'var(--grn)';
    else if (periodStatus.status === 'Partial') statusColor = 'var(--ylw)';
    else if (periodStatus.status === 'Upcoming') statusColor = 'var(--txt2)';
    else statusColor = 'var(--red)';

    return `
      <tr>
        <td><strong>${mo} ${yr}</strong></td>
        <td>School Fee</td>
        <td>₹${amt.toLocaleString('en-IN')}</td>
        <td style="color:${statusColor};font-weight:600">${statusText}</td>
        <td>${receiptStr}</td>
      </tr>
    `;
  }).join('');

  // Exam Fees
  const examRows = [
    { mo: 'September', yr: startY, label: 'Half-Yearly Exam' },
    { mo: 'December', yr: startY, label: 'Quarterly / Pre-Board Exam' },
    { mo: 'March', yr: endY, label: 'Annual Board Exam' }
  ].map(ex => {
    const isPaid = isExamFeeAlreadyPaid(s.id, ex.mo, ex.yr);
    let examReceipt = '–';
    const key = `${s.id}_${ex.mo}_${ex.yr}`;
    const fees = DB.fees && DB.fees[key];
    if (Array.isArray(fees)) {
      const ef = fees.find(f => f.type === 'Exam Fee');
      if (ef && ef.receiptNo) examReceipt = ef.receiptNo;
    }
    if (examReceipt === '–' && Array.isArray(DB.payments)) {
      const p = DB.payments.find(p =>
        !p.reversed &&
        String(p.studentId) === String(s.id) &&
        Array.isArray(p.items) &&
        p.items.some(it => it.type === 'Exam Fee' && it.month === ex.mo && Number(it.year) === Number(ex.yr))
      );
      if (p && p.receiptNo) examReceipt = p.receiptNo;
    }
    const amt = (cfg.examFee !== null && cfg.examFee !== undefined && cfg.examFee !== '' && !isNaN(Number(cfg.examFee)))
      ? Number(cfg.examFee) : (struct.examFee || 200);
    const exStatus = isPaid
      ? { label: 'Paid ✓', color: 'var(--grn)' }
      : (() => {
          const ps = getFeePeriodStatus(null, ex.mo, ex.yr, curSess);
          return { label: ps.label, color: ps.isUpcoming ? 'var(--txt2)' : 'var(--red)' };
        })();
    return `
      <tr>
        <td><strong>${ex.mo} ${ex.yr}</strong></td>
        <td>Exam Fee (${ex.label})</td>
        <td>₹${amt.toLocaleString('en-IN')}</td>
        <td style="color:${exStatus.color};font-weight:600">${exStatus.label}</td>
        <td>${examReceipt}</td>
      </tr>
    `;
  }).join('');

  // Admission Fee
  const admStat = getStudentAdmissionFeeStatus(s.id, curSess);
  const admAmt = (cfg.customAdmission !== null && cfg.customAdmission !== undefined && cfg.customAdmission !== '' && !isNaN(Number(cfg.customAdmission)))
    ? Number(cfg.customAdmission) : (struct.admission || 500);
  const admRow = `
    <tr>
      <td><strong>Session ${curSess}</strong></td>
      <td>Admission Fee (One-Time)</td>
      <td>₹${admAmt.toLocaleString('en-IN')}</td>
      <td style="color:${admStat.color};font-weight:600">${admStat.label}</td>
      <td>${admStat.receiptNo || '–'}</td>
    </tr>
  `;

  // Arrears Breakdown
  const arrearsItems = getStudentPreviousArrearsBreakdown(s, curSess);
  let arrearsHtml = '';
  if (arrearsItems.length > 0) {
    arrearsHtml = `
      <div style="margin-top:14px">
        <h4 style="font-size:12.5px;margin-bottom:6px;color:#c2410c">⚠️ Previous Session Arrears Breakdown</h4>
        <div class="tw">
          <table style="font-size:11.5px">
            <thead><tr><th>Session</th><th>Period / Category</th><th>Remaining Due</th></tr></thead>
            <tbody>
              ${arrearsItems.map(it => `
                <tr>
                  <td>${it.session}</td>
                  <td>${it.category} (${it.period})</td>
                  <td style="color:var(--red);font-weight:700">₹${it.remainingAmount.toLocaleString('en-IN')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // Enrollment selector control
  let enrollmentControlHtml = '';
  if (enrollments.length > 1) {
    enrollmentControlHtml = `
      <div style="display:flex;align-items:center;gap:6px">
        <span style="font-size:11.5px;color:var(--txt2);font-weight:600">Selected Enrollment:</span>
        <select id="feeDetailsSessSelect" onchange="openStudentFeeDetailsModal(${s.id}, this.value)" style="padding:4px 8px;font-size:12px;border:1.5px solid var(--pri);border-radius:6px;font-weight:600;background:#fff;color:var(--pri);cursor:pointer">
          ${enrollments.map(e => `
            <option value="${e.session}" ${e.session === curSess ? 'selected' : ''}>
              Class ${clL(e.cls)} — Session ${e.session}${e.session === s.session ? ' (Current)' : ' (Historical)'}
            </option>
          `).join('')}
        </select>
      </div>
    `;
  } else {
    enrollmentControlHtml = `<span class="chip cb2" style="font-size:11.5px;font-weight:600">Enrollment: Class ${clL(effectiveClass)} — Session ${curSess}</span>`;
  }

  bodyEl.innerHTML = `
    <!-- Student Header -->
    <div style="background:var(--bg);border-radius:8px;padding:12px 14px;margin-bottom:12px;border:1px solid var(--bdr)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <div>
          <div style="font-size:16px;font-weight:700">${s.name}</div>
          <div style="font-size:12px;color:var(--txt2);margin-top:2px">
            Adm No: <strong>${s.admno}</strong>${s.srNo ? ` | SR No: <strong>${s.srNo}</strong>` : ''} | Class ${clL(effectiveClass)} (Sec ${currentEnr.section || s.section || 'A'}) | Father: ${s.father || '–'} | Phone: ${s.phone || '–'}
          </div>
        </div>
        ${enrollmentControlHtml}
      </div>
    </div>

    <!-- 4 Summary Stat Cards -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px">
      <div style="background:#f8f9fa;border:1px solid var(--bdr);border-radius:8px;padding:10px;text-align:center">
        <div style="font-size:11px;color:var(--txt2)">Total Applicable</div>
        <div style="font-size:16px;font-weight:700;color:var(--txt);margin-top:2px">₹${totalApplicable.toLocaleString('en-IN')}</div>
      </div>
      <div style="background:#eafaf1;border:1px solid #a9dfbf;border-radius:8px;padding:10px;text-align:center">
        <div style="font-size:11px;color:var(--grn)">Total Paid</div>
        <div style="font-size:16px;font-weight:700;color:var(--grn);margin-top:2px">₹${paidTot.toLocaleString('en-IN')}</div>
      </div>
      <div style="background:#fdf2f2;border:1px solid #f5b7b1;border-radius:8px;padding:10px;text-align:center">
        <div style="font-size:11px;color:var(--red)">Current Session Due</div>
        <div style="font-size:16px;font-weight:700;color:var(--red);margin-top:2px">₹${curDue.toLocaleString('en-IN')}</div>
      </div>
      <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:10px;text-align:center">
        <div style="font-size:11px;color:#c2410c">Previous Arrears</div>
        <div style="font-size:16px;font-weight:700;color:#c2410c;margin-top:2px">₹${arrears.toLocaleString('en-IN')}</div>
      </div>
    </div>

    <!-- 12-Month School Fee Breakdown -->
    <div>
      <h4 style="font-size:12.5px;margin-bottom:6px">📅 Enrollment: Class ${clL(effectiveClass)} — Academic Session ${curSess} Monthly School Fee</h4>
      <div class="tw">
        <table style="font-size:11.5px">
          <thead><tr><th>Period</th><th>Category</th><th>Amount</th><th>Status</th><th>Receipt #</th></tr></thead>
          <tbody>${monthlyRows}</tbody>
        </table>
      </div>
    </div>

    <!-- Exam & Admission Fees -->
    <div style="margin-top:14px">
      <h4 style="font-size:12.5px;margin-bottom:6px">📝 Exam & One-Time Admission Fees</h4>
      <div class="tw">
        <table style="font-size:11.5px">
          <thead><tr><th>Period</th><th>Category</th><th>Amount</th><th>Status</th><th>Receipt #</th></tr></thead>
          <tbody>${examRows}${admRow}</tbody>
        </table>
      </div>
    </div>

    ${arrearsHtml}
  `;

  openM('feeDetailsM');
}

const openFeeDetails = openStudentFeeDetailsModal;

function openUnifiedCollectFromDetails() {
  closeM('feeDetailsM');
  openUnifiedCollectFeeModal(curUnifiedPayStudentId);
}

// 3. UNIFIED ONE-WORKFLOW PAYMENT COLLECTION MODAL
function openUnifiedCollectFeeModal(sid) {
  const targetId = sid || curFSid;
  if (!targetId || targetId === 'all') {
    toast('Please select a student from the dropdown first', 'warning');
    return;
  }
  const s = (DB.students || []).find(x => x.id === targetId);
  if (!s) {
    toast('Student not found', 'error');
    return;
  }

  curUnifiedPayStudentId = s.id;
  const curSess = s.session || (DB.settings && DB.settings.currentSession) || '2026–27';
  const [startY, endY] = parseSessionYears(curSess);
  const struct = (DB.feeStructures && DB.feeStructures[s.cls]) ? DB.feeStructures[s.cls] : { tuition: 400, admission: 500, examFee: 200 };
  const cfg = getStudentFeeConfig(s.id);

  const schoolRate = (cfg.customTuition !== null && cfg.customTuition !== undefined && cfg.customTuition !== '' && !isNaN(Number(cfg.customTuition)))
    ? Number(cfg.customTuition) : struct.tuition;
  const examRate = cfg.examFee || struct.examFee || 200;
  const admRate = cfg.customAdmission || struct.admission || 500;
  const arrearsAmt = calcStudentPreviousArrears(s, curSess);

  // Initialize payment state
  curUnifiedPayState = {
    studentId: s.id,
    session: curSess,
    categories: {
      school: true,
      exam: false,
      admission: false,
      arrears: false
    },
    rates: {
      school: schoolRate,
      exam: examRate,
      admission: admRate
    },
    selectedMonths: {}, // key: "Month_Year" => true
    selectedExams: {
      September: false,
      December: false,
      March: false
    },
    selectedAdmission: false,
    selectedArrears: false,
    arrearsAmount: arrearsAmt,
    lateFee: 0,
    discountAmt: 0,
    discountReason: '',
    paymentDate: new Date().toISOString().split('T')[0],
    paymentMode: 'Cash',
    amountReceived: 0,
    manualAmtReceived: false
  };

  // Pre-select current month if unpaid, or first pending month
  const activeMo = document.getElementById('fe_mo')?.value || 'April';
  const activeYr = parseInt(document.getElementById('fe_yr')?.value) || startY;
  const activeKey = `${activeMo}_${activeYr}`;

  // Check if active month school fee is unpaid
  const activeFees = (DB.fees[`${s.id}_${activeKey}`] || []).filter(f => f.enabled !== false && (f.type === 'School Fee' || f.type === 'Tuition Fee'));
  const isActivePaid = activeFees.length > 0 && activeFees.every(f => f.paid);
  if (!isActivePaid && isPeriodValidForStudent(s, activeMo, activeYr)) {
    curUnifiedPayState.selectedMonths[activeKey] = true;
  } else {
    // Select first pending month
    for (let i = 0; i < MONTHS_LIST.length; i++) {
      const mo = MONTHS_LIST[i];
      const yr = (i < 9) ? startY : endY;
      const k = `${mo}_${yr}`;
      if (isFeeRecordCurrentlyDue(mo, yr, curSess) && isPeriodValidForStudent(s, mo, yr)) {
        const fees = (DB.fees[`${s.id}_${k}`] || []).filter(f => f.enabled !== false && (f.type === 'School Fee' || f.type === 'Tuition Fee'));
        if (!fees.length || !fees.every(f => f.paid)) {
          curUnifiedPayState.selectedMonths[k] = true;
          break;
        }
      }
    }
  }

  renderUnifiedCollectModalUI();
  openM('unifiedCollectM');
}

function renderUnifiedCollectModalUI() {
  const bodyEl = document.getElementById('unifiedCollectBody');
  if (!bodyEl || !curUnifiedPayState) return;

  const s = (DB.students || []).find(x => x.id === curUnifiedPayState.studentId);
  if (!s) return;

  const curSess = curUnifiedPayState.session;
  const [startY, endY] = parseSessionYears(curSess);
  const titleEl = document.getElementById('ucm_title');
  if (titleEl) titleEl.textContent = `💳 Collect Fee — ${s.name} (Adm: ${s.admno})`;

  // 1. Month Cards Grid (April to March)
  const monthCardsHtml = MONTHS_LIST.map((mo, idx) => {
    const yr = (idx < 9) ? startY : endY;
    const key = `${mo}_${yr}`;
    const feeArr = (DB.fees[`${s.id}_${key}`] || []).filter(f => f.enabled !== false && (f.type === 'School Fee' || f.type === 'Tuition Fee'));
    const schFee = feeArr.length > 0 ? feeArr[0] : null;
    const isPaid = feeArr.length > 0 && feeArr.every(f => f.paid);
    const isPartial = feeArr.length > 0 && feeArr.some(f => f.partialRemaining > 0);
    const remAmt = isPartial ? feeArr[0].partialRemaining : curUnifiedPayState.rates.school;
    const isChecked = !!curUnifiedPayState.selectedMonths[key] && !isPaid;

    const periodStatus = getFeePeriodStatus(schFee, mo, yr, curSess);
    const statusBadge = `<span class="chip ${periodStatus.chipClass}" style="font-size:9.5px">${periodStatus.label}</span>`;

    return `
      <div style="border:1.5px solid ${isChecked ? 'var(--red)' : 'var(--bdr)'};border-radius:6px;padding:8px 10px;background:${isPaid ? '#f8f9fa' : (isChecked ? '#fff5f5' : '#fff')};opacity:${isPaid ? '0.65' : '1'}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;cursor:${isPaid ? 'default' : 'pointer'};margin:0">
            <input type="checkbox" ${isPaid ? 'disabled' : ''} ${isChecked ? 'checked' : ''} onchange="toggleUnifiedMonth('${key}', this.checked)" style="cursor:pointer">
            ${mo.substring(0, 3)} ${yr}
          </label>
          ${statusBadge}
        </div>
        <div style="font-size:11px;color:var(--txt2);display:flex;justify-content:space-between">
          <span>Fee:</span>
          <strong>₹${isPaid ? curUnifiedPayState.rates.school : remAmt}</strong>
        </div>
      </div>
    `;
  }).join('');

  // 2. Exam Cards (Sep, Dec, Mar)
  const examCards = [
    { mo: 'September', yr: startY, label: 'Half-Yearly' },
    { mo: 'December', yr: startY, label: 'Pre-Board / Qtr' },
    { mo: 'March', yr: endY, label: 'Annual Final' }
  ].map(ex => {
    const isPaid = isExamFeeAlreadyPaid(s.id, ex.mo, ex.yr);
    const isChecked = !!curUnifiedPayState.selectedExams[ex.mo] && !isPaid;
    const exPeriodStatus = isPaid
      ? { label: 'Paid ✓', chipClass: 'cg' }
      : getFeePeriodStatus(null, ex.mo, ex.yr, curSess);
    return `
      <div style="border:1.5px solid ${isChecked ? 'var(--red)' : 'var(--bdr)'};border-radius:6px;padding:8px 10px;background:${isPaid ? '#f8f9fa' : (isChecked ? '#fff5f5' : '#fff')};opacity:${isPaid ? '0.65' : '1'}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;cursor:${isPaid ? 'default' : 'pointer'};margin:0">
            <input type="checkbox" ${isPaid ? 'disabled' : ''} ${isChecked ? 'checked' : ''} onchange="toggleUnifiedExam('${ex.mo}', this.checked)">
            ${ex.mo} (${ex.label})
          </label>
          <span class="chip ${exPeriodStatus.chipClass}" style="font-size:9.5px">${exPeriodStatus.label}</span>
        </div>
        <div style="font-size:11px;color:var(--txt2);display:flex;justify-content:space-between">
          <span>Rate:</span>
          <strong>₹${curUnifiedPayState.rates.exam}</strong>
        </div>
      </div>
    `;
  }).join('');

  // 3. Admission Fee Card
  const admStat = getStudentAdmissionFeeStatus(s.id, curSess);
  const admPaid = admStat.isPaid;
  const admChecked = !!curUnifiedPayState.selectedAdmission && !admPaid;

  // 4. Arrears Option
  const arrearsAmt = curUnifiedPayState.arrearsAmount;
  const arrearsChecked = !!curUnifiedPayState.selectedArrears && arrearsAmt > 0;

  bodyEl.innerHTML = `
    <!-- Section A: Student Information -->
    <div style="background:var(--bg);border-radius:8px;padding:10px 14px;margin-bottom:12px;border:1px solid var(--bdr);display:flex;justify-content:space-between;align-items:center">
      <div>
        <strong style="font-size:14px">${s.name}</strong>
        <span style="font-size:12px;color:var(--txt2);margin-left:8px">Adm No: <strong>${s.admno}</strong> | ${clL(s.cls)} (Sec ${s.section || 'A'}) | Father: ${s.father || '–'}</span>
      </div>
      <span class="chip cb2" style="font-size:11px">Session: ${curSess}</span>
    </div>

    <!-- Section B: Fee Category Toggles & Editable Rates -->
    <div style="background:#fff;border:1px solid var(--bdr);border-radius:8px;padding:12px;margin-bottom:12px">
      <div style="font-size:11.5px;font-weight:700;color:var(--txt2);text-transform:uppercase;margin-bottom:8px">Fee Categories & Current Payment Rates</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
        <div style="background:var(--bg);padding:8px 10px;border-radius:6px">
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;margin-bottom:4px">
            <input type="checkbox" ${curUnifiedPayState.categories.school ? 'checked' : ''} onchange="toggleUnifiedCategory('school', this.checked)">
            School Fee (Monthly)
          </label>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-size:11px;color:var(--txt2)">₹</span>
            <input type="number" value="${curUnifiedPayState.rates.school}" min="0" onchange="updateUnifiedRate('school', this.value)" style="padding:3px 6px;font-size:12px;width:100px;font-weight:700">
          </div>
        </div>

        <div style="background:var(--bg);padding:8px 10px;border-radius:6px">
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;margin-bottom:4px">
            <input type="checkbox" ${curUnifiedPayState.categories.exam ? 'checked' : ''} onchange="toggleUnifiedCategory('exam', this.checked)">
            Exam Fee
          </label>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-size:11px;color:var(--txt2)">₹</span>
            <input type="number" value="${curUnifiedPayState.rates.exam}" min="0" onchange="updateUnifiedRate('exam', this.value)" style="padding:3px 6px;font-size:12px;width:100px;font-weight:700">
          </div>
        </div>

        <div style="background:var(--bg);padding:8px 10px;border-radius:6px">
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;margin-bottom:4px">
            <input type="checkbox" ${curUnifiedPayState.categories.admission ? 'checked' : ''} ${admPaid ? 'disabled' : ''} onchange="toggleUnifiedCategory('admission', this.checked)">
            Admission Fee (One-Time)
          </label>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-size:11px;color:var(--txt2)">₹</span>
            <input type="number" value="${curUnifiedPayState.rates.admission}" min="0" ${admPaid ? 'disabled' : ''} onchange="updateUnifiedRate('admission', this.value)" style="padding:3px 6px;font-size:12px;width:100px;font-weight:700">
          </div>
        </div>
      </div>
    </div>

    <!-- Section C: School Fee Month Selection Grid -->
    ${curUnifiedPayState.categories.school ? `
      <div style="background:#fff;border:1px solid var(--bdr);border-radius:8px;padding:12px;margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <strong style="font-size:12.5px">Select School Fee Months to Collect:</strong>
          <div style="display:flex;gap:6px">
            <button class="btn bo bsm" onclick="selectUnifiedAllMonths()" style="font-size:11px;padding:2px 8px">Select Full Year (12 Mos)</button>
            <button class="btn bo bsm" onclick="selectUnifiedPendingMonths()" style="font-size:11px;padding:2px 8px">Select All Pending</button>
            <button class="btn bo bsm" onclick="clearUnifiedMonths()" style="font-size:11px;padding:2px 8px">Clear Selection</button>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
          ${monthCardsHtml}
        </div>
      </div>
    ` : ''}

    <!-- Section D: Exam Fee Selection -->
    ${curUnifiedPayState.categories.exam ? `
      <div style="background:#fff;border:1px solid var(--bdr);border-radius:8px;padding:12px;margin-bottom:12px">
        <strong style="font-size:12.5px;display:block;margin-bottom:8px">Select Exam Fees to Collect:</strong>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
          ${examCards}
        </div>
      </div>
    ` : ''}

    <!-- Section E: Admission Fee & Previous Arrears -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
      ${curUnifiedPayState.categories.admission ? `
        <div style="border:1.5px solid ${admChecked ? 'var(--red)' : 'var(--bdr)'};border-radius:6px;padding:10px;background:${admPaid ? '#f8f9fa' : (admChecked ? '#fff5f5' : '#fff')}">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <label style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;margin:0">
              <input type="checkbox" ${admPaid ? 'disabled' : ''} ${admChecked ? 'checked' : ''} onchange="toggleUnifiedAdmission(this.checked)">
              Admission Fee (Session ${curSess})
            </label>
            ${admPaid
              ? '<span class="chip cg" style="font-size:9.5px">Paid ✓</span>'
              : (admStat.isPartial
                ? `<span class="chip cy" style="font-size:9.5px">${admStat.label}</span>`
                : (admStat.isUpcoming
                  ? '<span class="chip cb" style="font-size:9.5px">Upcoming</span>'
                  : '<span class="chip cr" style="font-size:9.5px">Unpaid</span>'))}
          </div>
          <div style="font-size:11.5px;color:var(--txt2);display:flex;justify-content:space-between">
            <span>Payable:</span>
            <strong>₹${admPaid ? 0 : (admStat.isPartial ? admStat.remainingAmount : curUnifiedPayState.rates.admission)}</strong>
          </div>
        </div>
      ` : '<div></div>'}

      ${arrearsAmt > 0 ? `
        <div style="border:1.5px solid ${arrearsChecked ? 'var(--red)' : 'var(--bdr)'};border-radius:6px;padding:10px;background:${arrearsChecked ? '#fff5f5' : '#fff'}">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <label style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;margin:0;color:#c2410c">
              <input type="checkbox" ${arrearsChecked ? 'checked' : ''} onchange="toggleUnifiedArrears(this.checked)">
              Previous Session Arrears
            </label>
            <span class="chip cr" style="font-size:9.5px">Arrears</span>
          </div>
          <div style="font-size:11.5px;color:var(--txt2);display:flex;justify-content:space-between">
            <span>Outstanding Due:</span>
            <strong style="color:var(--red)">₹${arrearsAmt.toLocaleString('en-IN')}</strong>
          </div>
        </div>
      ` : '<div></div>'}
    </div>

    <!-- Section F: Payment Form, Adjustments & Partial Payment -->
    <div style="background:var(--bg);border-radius:8px;padding:12px;border:1px solid var(--bdr)">
      <div class="g4" style="gap:10px;margin-bottom:10px">
        <div class="fg">
          <label style="font-size:11px">Payment Date</label>
          <input type="date" id="ucm_dt" value="${curUnifiedPayState.paymentDate}" onchange="curUnifiedPayState.paymentDate=this.value" style="padding:4px 8px;font-size:12px">
        </div>
        <div class="fg">
          <label style="font-size:11px">Payment Method</label>
          <select id="ucm_md" onchange="curUnifiedPayState.paymentMode=this.value" style="padding:4px 8px;font-size:12px">
            <option ${curUnifiedPayState.paymentMode==='Cash'?'selected':''}>Cash</option>
            <option ${curUnifiedPayState.paymentMode==='UPI'?'selected':''}>UPI</option>
            <option ${curUnifiedPayState.paymentMode==='Bank Transfer'?'selected':''}>Bank Transfer</option>
            <option ${curUnifiedPayState.paymentMode==='Cheque'?'selected':''}>Cheque</option>
            <option ${curUnifiedPayState.paymentMode==='Other'?'selected':''}>Other</option>
          </select>
        </div>
        <div class="fg">
          <label style="font-size:11px">Late Fee (₹)</label>
          <input type="number" id="ucm_late_fee" value="${curUnifiedPayState.lateFee}" min="0" oninput="calcUnifiedTotals()" style="padding:4px 8px;font-size:12px">
        </div>
        <div class="fg">
          <label style="font-size:11px">Discount (₹)</label>
          <input type="number" id="ucm_disc" value="${curUnifiedPayState.discountAmt}" min="0" oninput="calcUnifiedTotals()" style="padding:4px 8px;font-size:12px">
        </div>
      </div>

      <div class="fg" style="margin-bottom:10px">
        <label style="font-size:11px">Discount Reason <span style="color:var(--txt2);font-weight:normal">(Required if Discount &gt; 0)</span></label>
        <input type="text" id="ucm_disc_reason" list="ucm_disc_reasons" placeholder="e.g. Financial assistance, Sibling concession, Principal-approved concession..." value="${escapeHtml(curUnifiedPayState.discountReason || '')}" oninput="curUnifiedPayState.discountReason=this.value" onchange="curUnifiedPayState.discountReason=this.value" style="padding:4px 8px;font-size:12px;width:100%">
        <datalist id="ucm_disc_reasons">
          <option value="Financial assistance">
          <option value="Sibling concession">
          <option value="Principal-approved concession">
          <option value="Special concession">
          <option value="Staff ward concession">
          <option value="Other">
        </datalist>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;padding-top:8px;border-top:1px solid var(--bdr)">
        <div>
          <div style="font-size:11px;color:var(--txt2)">Subtotal: <span id="ucm_subtotal">₹0</span></div>
          <div style="font-size:13px;font-weight:700">Net Payable: <span id="ucm_net" style="color:var(--red);font-size:17px">₹0</span></div>
        </div>
        <div style="text-align:right">
          <label style="font-size:11px;font-weight:700;display:block">Amount Received (₹):</label>
          <input type="number" id="ucm_amt_received" value="${curUnifiedPayState.amountReceived}" min="0" oninput="onUnifiedAmtReceivedInput(this.value)" style="width:130px;padding:5px 8px;font-size:15px;font-weight:700;border:1.5px solid var(--grn);border-radius:4px;text-align:right">
        </div>
      </div>
      <div id="ucm_feedback" style="margin-top:6px;font-size:11.5px;font-weight:600"></div>
    </div>
  `;

  calcUnifiedTotals();
}

function toggleUnifiedCategory(cat, val) {
  if (!curUnifiedPayState) return;
  curUnifiedPayState.categories[cat] = val;
  if (!val) {
    if (cat === 'school') curUnifiedPayState.selectedMonths = {};
    if (cat === 'exam') curUnifiedPayState.selectedExams = { September: false, December: false, March: false };
    if (cat === 'admission') curUnifiedPayState.selectedAdmission = false;
  }
  renderUnifiedCollectModalUI();
}

function updateUnifiedRate(type, val) {
  if (!curUnifiedPayState) return;
  const num = Math.max(0, parseFloat(val) || 0);
  curUnifiedPayState.rates[type] = num;
  renderUnifiedCollectModalUI();
}

function toggleUnifiedMonth(key, val) {
  if (!curUnifiedPayState) return;
  if (val) curUnifiedPayState.selectedMonths[key] = true;
  else delete curUnifiedPayState.selectedMonths[key];
  calcUnifiedTotals();
}

function toggleUnifiedExam(mo, val) {
  if (!curUnifiedPayState) return;
  curUnifiedPayState.selectedExams[mo] = val;
  calcUnifiedTotals();
}

function toggleUnifiedAdmission(val) {
  if (!curUnifiedPayState) return;
  curUnifiedPayState.selectedAdmission = val;
  calcUnifiedTotals();
}

function toggleUnifiedArrears(val) {
  if (!curUnifiedPayState) return;
  curUnifiedPayState.selectedArrears = val;
  calcUnifiedTotals();
}

function selectUnifiedAllMonths() {
  if (!curUnifiedPayState) return;
  const s = (DB.students || []).find(x => x.id === curUnifiedPayState.studentId);
  const [startY, endY] = parseSessionYears(curUnifiedPayState.session);
  MONTHS_LIST.forEach((mo, idx) => {
    const yr = (idx < 9) ? startY : endY;
    const key = `${mo}_${yr}`;
    const feeArr = (DB.fees[`${s.id}_${key}`] || []).filter(f => f.enabled !== false && (f.type === 'School Fee' || f.type === 'Tuition Fee'));
    const isPaid = feeArr.length > 0 && feeArr.every(f => f.paid);
    if (!isPaid && isPeriodValidForStudent(s, mo, yr)) {
      curUnifiedPayState.selectedMonths[key] = true;
    }
  });
  renderUnifiedCollectModalUI();
}

function selectUnifiedPendingMonths() {
  if (!curUnifiedPayState) return;
  const s = (DB.students || []).find(x => x.id === curUnifiedPayState.studentId);
  const [startY, endY] = parseSessionYears(curUnifiedPayState.session);
  MONTHS_LIST.forEach((mo, idx) => {
    const yr = (idx < 9) ? startY : endY;
    const key = `${mo}_${yr}`;
    if (isFeeRecordCurrentlyDue(mo, yr, curUnifiedPayState.session) && isPeriodValidForStudent(s, mo, yr)) {
      const feeArr = (DB.fees[`${s.id}_${key}`] || []).filter(f => f.enabled !== false && (f.type === 'School Fee' || f.type === 'Tuition Fee'));
      const isPaid = feeArr.length > 0 && feeArr.every(f => f.paid);
      if (!isPaid) curUnifiedPayState.selectedMonths[key] = true;
    }
  });
  renderUnifiedCollectModalUI();
}

function clearUnifiedMonths() {
  if (!curUnifiedPayState) return;
  curUnifiedPayState.selectedMonths = {};
  renderUnifiedCollectModalUI();
}

function onUnifiedAmtReceivedInput(val) {
  if (!curUnifiedPayState) return;
  curUnifiedPayState.manualAmtReceived = true;
  curUnifiedPayState.amountReceived = Math.max(0, parseFloat(val) || 0);
  calcUnifiedTotals(true);
}

function calcUnifiedTotals(skipAmtReceivedSync = false) {
  if (!curUnifiedPayState) return;
  const s = (DB.students || []).find(x => x.id === curUnifiedPayState.studentId);
  if (!s) return;

  let subtotal = 0;

  // 1. School Fee
  if (curUnifiedPayState.categories.school) {
    Object.keys(curUnifiedPayState.selectedMonths).forEach(key => {
      const feeArr = (DB.fees[`${s.id}_${key}`] || []).filter(f => f.enabled !== false && (f.type === 'School Fee' || f.type === 'Tuition Fee'));
      const isPartial = feeArr.length > 0 && feeArr.some(f => f.partialRemaining > 0);
      const amt = isPartial ? feeArr[0].partialRemaining : curUnifiedPayState.rates.school;
      subtotal += amt;
    });
  }

  // 2. Exam Fee
  if (curUnifiedPayState.categories.exam) {
    Object.entries(curUnifiedPayState.selectedExams).forEach(([mo, isSel]) => {
      if (isSel) subtotal += curUnifiedPayState.rates.exam;
    });
  }

  // 3. Admission Fee
  if (curUnifiedPayState.categories.admission && curUnifiedPayState.selectedAdmission) {
    subtotal += curUnifiedPayState.rates.admission;
  }

  // 4. Arrears
  if (curUnifiedPayState.selectedArrears && curUnifiedPayState.arrearsAmount > 0) {
    subtotal += curUnifiedPayState.arrearsAmount;
  }

  const lateFee = Math.max(0, parseFloat(document.getElementById('ucm_late_fee')?.value) || 0);
  const discVal = Math.max(0, parseFloat(document.getElementById('ucm_disc')?.value) || 0);
  curUnifiedPayState.lateFee = lateFee;
  curUnifiedPayState.discountAmt = discVal;

  const netPayable = Math.max(0, subtotal + lateFee - discVal);

  if (!skipAmtReceivedSync && !curUnifiedPayState.manualAmtReceived) {
    curUnifiedPayState.amountReceived = netPayable;
    const rInp = document.getElementById('ucm_amt_received');
    if (rInp) rInp.value = netPayable;
  }

  const subEl = document.getElementById('ucm_subtotal');
  const netEl = document.getElementById('ucm_net');
  const fNetEl = document.getElementById('ucm_footer_net');
  if (subEl) subEl.textContent = '₹' + subtotal.toLocaleString('en-IN');
  if (netEl) netEl.textContent = '₹' + netPayable.toLocaleString('en-IN');
  if (fNetEl) fNetEl.textContent = '₹' + netPayable.toLocaleString('en-IN');

  const amtReceived = curUnifiedPayState.amountReceived;
  const fbEl = document.getElementById('ucm_feedback');
  if (fbEl) {
    if (amtReceived < netPayable) {
      fbEl.style.color = '#d35400';
      fbEl.textContent = `⚠️ Partial Payment: Remaining balance ₹${(netPayable - amtReceived).toLocaleString('en-IN')} will stay due.`;
    } else {
      fbEl.style.color = 'var(--grn)';
      fbEl.textContent = '✓ Full payment confirmed.';
    }
  }
}

function procUnifiedPayment() {
  if (isPaymentProcessing) return;
  if (!curUnifiedPayState || !curUnifiedPayStudentId) return;
  const s = (DB.students || []).find(x => x.id === curUnifiedPayStudentId);
  if (!s) return;

  isPaymentProcessing = true;
  try {

  const dt = document.getElementById('ucm_dt')?.value || new Date().toISOString().split('T')[0];
  const md = document.getElementById('ucm_md')?.value || 'Cash';
  const lateFee = curUnifiedPayState.lateFee;
  const discAmt = curUnifiedPayState.discountAmt;
  const discReason = (curUnifiedPayState.discountReason || document.getElementById('ucm_disc_reason')?.value || '').trim();

  if (discAmt > 0 && !discReason) {
    toast('Please provide a discount reason for the concession.', 'warning');
    return;
  }
  const curSess = curUnifiedPayState.session;
  const [startY, endY] = parseSessionYears(curSess);

  // Compile items to pay
  const paymentItems = [];

  // 1. School Months
  if (curUnifiedPayState.categories.school) {
    Object.keys(curUnifiedPayState.selectedMonths).forEach(key => {
      const [mo, yr] = key.split('_');
      const feeArr = (DB.fees[`${s.id}_${key}`] || []).filter(f => f.enabled !== false && (f.type === 'School Fee' || f.type === 'Tuition Fee'));
      const isPartial = feeArr.length > 0 && feeArr.some(f => f.partialRemaining > 0);
      const amt = isPartial ? feeArr[0].partialRemaining : curUnifiedPayState.rates.school;
      paymentItems.push({
        type: 'School Fee',
        month: mo,
        year: parseInt(yr),
        baseAmount: amt,
        period: `${mo} ${yr}`,
        feeKey: `${s.id}_${key}`
      });
    });
  }

  // 2. Exam Fees
  if (curUnifiedPayState.categories.exam) {
    Object.entries(curUnifiedPayState.selectedExams).forEach(([mo, isSel]) => {
      if (isSel) {
        const yr = (mo === 'March') ? endY : startY;
        paymentItems.push({
          type: 'Exam Fee',
          month: mo,
          year: yr,
          baseAmount: curUnifiedPayState.rates.exam,
          period: `${mo} ${yr}`,
          feeKey: `${s.id}_${mo}_${yr}`
        });
      }
    });
  }

  // 3. Admission Fee
  if (curUnifiedPayState.categories.admission && curUnifiedPayState.selectedAdmission) {
    paymentItems.push({
      type: 'Admission Fee',
      month: 'April',
      year: startY,
      baseAmount: curUnifiedPayState.rates.admission,
      period: `Session ${curSess}`,
      feeKey: `${s.id}_April_${startY}`
    });
  }

  // 4. Arrears
  if (curUnifiedPayState.selectedArrears && curUnifiedPayState.arrearsAmount > 0) {
    paymentItems.push({
      type: 'Previous Arrears',
      month: 'Opening',
      year: startY,
      baseAmount: curUnifiedPayState.arrearsAmount,
      period: 'Previous Session Arrears',
      feeKey: 'arrears'
    });
  }

  if (paymentItems.length === 0) {
    toast('Please select at least one fee item to collect!', 'warning');
    return;
  }

  const subtotal = paymentItems.reduce((sum, it) => sum + it.baseAmount, 0);

  if (discAmt > subtotal + lateFee) {
    toast(`Discount cannot exceed total payable fee amount (₹${subtotal + lateFee})!`, 'warning');
    return;
  }

  const netPayable = Math.max(0, subtotal + lateFee - discAmt);
  let amtReceived = netPayable;
  let amtReceivedVal = NaN;
  if (curUnifiedPayState.manualAmtReceived && curUnifiedPayState.amountReceived !== undefined) {
    amtReceivedVal = curUnifiedPayState.amountReceived;
  } else {
    const amtReceivedInp = document.getElementById('ucm_amt_received');
    if (amtReceivedInp && amtReceivedInp.value !== '') {
      amtReceivedVal = parseFloat(amtReceivedInp.value);
    }
  }

  if (!isNaN(amtReceivedVal)) {
    if (amtReceivedVal < 0) {
      toast('Amount received cannot be negative!', 'warning');
      return;
    }
    if (amtReceivedVal > netPayable) {
      toast(`Amount received cannot exceed net payable amount (₹${netPayable})!`, 'warning');
      return;
    }
    amtReceived = amtReceivedVal;
  }

  const receiptNo = getNextReceiptNumber();

  // Proportional distribution of discount and late fee across payment items
  let remainingPaidPool = amtReceived;
  let remainingDiscPool = discAmt;
  let remainingLatePool = lateFee;
  let totalRemainingDueAll = 0;

  paymentItems.forEach((it, idx) => {
    // Proportional discount and late fee
    let itDisc = 0;
    let itLate = 0;
    if (idx === paymentItems.length - 1) {
      itDisc = remainingDiscPool;
      itLate = remainingLatePool;
    } else if (subtotal > 0) {
      itDisc = Math.min(it.baseAmount, Math.round((it.baseAmount / subtotal) * discAmt));
      itLate = Math.round((it.baseAmount / subtotal) * lateFee);
      remainingDiscPool = Math.max(0, remainingDiscPool - itDisc);
      remainingLatePool = Math.max(0, remainingLatePool - itLate);
    }
    it.discount = itDisc;
    it.discountReason = itDisc > 0 ? discReason : '';
    it.lateFee = itLate;
    const itNetPayable = Math.max(0, it.baseAmount + itLate - itDisc);
    it.netPayable = itNetPayable;

    // Distribute cash received up to this item's net payable
    const allocated = Math.min(itNetPayable, remainingPaidPool);
    it.paidAmount = allocated;
    remainingPaidPool = Math.max(0, remainingPaidPool - allocated);

    const itRemaining = Math.max(0, itNetPayable - allocated);
    it.remainingDue = itRemaining;
    totalRemainingDueAll += itRemaining;

    if (it.feeKey === 'arrears') {
      // Deduct from student previous arrears
      const curArrears = getStudentPreviousArrears(s.id);
      setStudentPreviousArrears(s.id, Math.max(0, curArrears - allocated - itDisc));
    } else {
      // Update DB.fees entry
      if (!DB.fees[it.feeKey]) {
        initFeeLedger(s, it.month, it.year);
      }
      const arr = DB.fees[it.feeKey];
      let f = arr.find(x => x.type === it.type || (it.type === 'School Fee' && x.type === 'Tuition Fee'));
      if (!f) {
        f = { type: it.type, amount: it.baseAmount, paid: false, enabled: true };
        arr.push(f);
      } else if (!f.paid && !(f.partialPaid > 0) && it.baseAmount > 0) {
        f.amount = it.baseAmount;
      }

      const fullFeeAmount = Number(f.amount) || Number(it.baseAmount) || 0;
      const priorDiscount = Number(f.discount) || 0;
      const priorPaid = (f.partialPaid !== undefined && f.partialPaid !== null)
        ? Number(f.partialPaid)
        : (f.paid ? Math.max(0, fullFeeAmount - priorDiscount) : 0);

      const newCumulativeDiscount = priorDiscount + itDisc;
      const newCumulativePaid = priorPaid + allocated;
      const totalPayableFee = fullFeeAmount + itLate;
      const feeRemaining = Math.max(0, totalPayableFee - newCumulativeDiscount - newCumulativePaid);

      f.date = dt;
      f.mode = (itNetPayable === 0 && allocated === 0) ? 'Waived' : md;
      f.receiptNo = receiptNo;
      f.discount = newCumulativeDiscount;
      if (itDisc > 0 && discReason) f.discountReason = discReason;
      f.partialPaid = newCumulativePaid;
      f.partialRemaining = feeRemaining;
      if (itLate > 0) f.lateFee = (Number(f.lateFee) || 0) + itLate;

      if (feeRemaining === 0) {
        f.paid = true;
      } else {
        f.paid = false;
      }
    }
  });

  let paymentStatus = 'FULL PAYMENT';
  let receiptDescription = '';

  if (totalRemainingDueAll === 0) {
    if (netPayable === 0 && amtReceived === 0) {
      paymentStatus = 'FEE WAIVED';
      receiptDescription = `Fee completely waived via authorized discount. Remaining amount due: ₹0.`;
    } else {
      paymentStatus = 'FULL PAYMENT';
      receiptDescription = paymentItems.length === 1
        ? `Full payment received for ${paymentItems[0].type} (${paymentItems[0].period}). Remaining amount due: ₹0.`
        : `Full payment received for ${paymentItems.length} fee items. Remaining amount due: ₹0.`;
    }
  } else {
    paymentStatus = 'PARTIAL PAYMENT';
    if (paymentItems.length === 1) {
      receiptDescription = `Partial payment received for ${paymentItems[0].type} (${paymentItems[0].period}). Remaining amount due: ₹${totalRemainingDueAll.toLocaleString('en-IN')}.`;
    } else {
      const breakdownText = paymentItems
        .filter(it => it.remainingDue > 0)
        .map(it => `${it.type} (${it.period}): ₹${it.remainingDue.toLocaleString('en-IN')}`)
        .join(', ');
      receiptDescription = `Partial payment received. Remaining amount due: ₹${totalRemainingDueAll.toLocaleString('en-IN')} (${breakdownText}).`;
    }
  }

  // Record in DB.payments
  if (!DB.payments) DB.payments = [];
  const primaryCategory = paymentItems.length === 1 ? paymentItems[0].type : 'Combined Fee';
  const displayPeriod = paymentItems.map(it => `${it.type} (${it.period})`).join(', ');

  DB.payments.push({
    receiptNo: receiptNo,
    studentId: s.id,
    studentName: s.name,
    admno: s.admno,
    cls: s.cls,
    section: s.section || 'A',
    amount: amtReceived,
    baseSubtotal: subtotal,
    lateFee: lateFee,
    discountAmt: discAmt,
    discountReason: discReason,
    mode: md,
    date: dt,
    category: primaryCategory,
    period: displayPeriod,
    session: curSess,
    paymentStatus: paymentStatus,
    receiptDescription: receiptDescription,
    totalRemainingDue: totalRemainingDueAll,
    items: paymentItems,
    reversed: false,
    voidReason: '',
    voidDate: ''
  });

    saveDB(true);
    closeM('unifiedCollectM');

    renderFeD();
    logActivity('Payment Recorded', `Collected ₹${amtReceived} for ${s.name} - Receipt #${receiptNo} (${paymentStatus})`);
    toast(`Payment confirmed successfully! Receipt #${receiptNo}`, 'success');

    showReceiptModal(receiptNo);
  } finally {
    isPaymentProcessing = false;
  }
}

// 4. STUDENT PAYMENT HISTORY POPUP
function openPaymentHistoryModal(sid) {
  const targetId = sid || curFSid;
  if (!targetId || targetId === 'all') {
    toast('Please select a student from the dropdown first', 'warning');
    return;
  }
  const s = (DB.students || []).find(x => x.id === targetId);
  if (!s) {
    toast('Student not found', 'error');
    return;
  }

  const bodyEl = document.getElementById('paymentHistoryBody');
  if (!bodyEl) return;

  let receiptMap = {};

  (DB.payments || []).filter(p => p.studentId === s.id || String(p.admno) === String(s.admno)).forEach(p => {
    let displayPeriod = p.period;
    if (Array.isArray(p.items) && p.items.length > 0) {
      const g = groupReceiptItems(p.items);
      displayPeriod = g.map(it => `${it.type} (${it.period})`).join(', ');
    }
    receiptMap[p.receiptNo] = {
      receiptNo: p.receiptNo,
      date: p.date || '–',
      mode: p.mode || 'Cash',
      period: displayPeriod || p.month || '–',
      category: p.category || 'School Fee',
      total: Number(p.amount) || 0,
      reversed: p.reversed === true
    };
  });

  Object.entries(DB.fees || {}).forEach(([k, arr]) => {
    if (!k.startsWith(s.id + '_') || !Array.isArray(arr)) return;
    const parts = k.split('_');
    const mo = parts[1], yr = parts[2];
    arr.filter(f => f.paid).forEach((f, idx) => {
      const rNo = f.receiptNo || ('REC-LEGACY-' + k + '-' + idx);
      if (!receiptMap[rNo]) {
        receiptMap[rNo] = {
          receiptNo: f.receiptNo || '–',
          date: f.date || '–',
          mode: f.mode || 'Cash',
          period: `${mo} ${yr}`,
          category: f.type,
          total: Number(f.amount) || 0,
          reversed: false
        };
      }
    });
  });

  const histRows = Object.values(receiptMap).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  bodyEl.innerHTML = `
    <!-- Student Header -->
    <div style="background:var(--bg,#f8fafc);border-radius:8px;padding:10px 14px;margin-bottom:12px;border:1px solid var(--bdr,#e2e8f0);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;flex-shrink:0">
      <div>
        <strong style="font-size:13.5px;color:var(--txt)">${escapeHtml(s.name)}</strong>
        <span style="font-size:12px;color:var(--txt2);margin-left:8px">Adm No: <strong style="color:var(--txt)">${escapeHtml(s.admno)}</strong> | Class: <strong>${clL(s.cls)}</strong> (Sec ${escapeHtml(s.section || 'A')}) | Father: <strong>${escapeHtml(s.father || '–')}</strong></span>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <span class="chip cb2" style="font-size:11px;padding:3px 8px">Total Payments: <strong>${histRows.length}</strong></span>
      </div>
    </div>

    <!-- Payments Table Container -->
    <div class="tw" style="flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;border:1px solid var(--bdr);border-radius:6px;background:var(--card,#fff)">
      <table style="font-size:12px;width:100%;border-collapse:collapse;table-layout:auto">
        <thead style="position:sticky;top:0;background:var(--bg,#f8fafc);z-index:2;box-shadow:0 1px 2px rgba(0,0,0,0.05)">
          <tr>
            <th style="padding:8px 8px;white-space:nowrap;width:85px;text-align:left">Date</th>
            <th style="padding:8px 8px;white-space:nowrap;width:130px;text-align:left">Receipt #</th>
            <th style="padding:8px 10px;text-align:left">Month/Period</th>
            <th style="padding:8px 8px;white-space:nowrap;width:95px;text-align:left">Category</th>
            <th style="padding:8px 6px;white-space:nowrap;width:60px;text-align:center">Mode</th>
            <th style="padding:8px 8px;white-space:nowrap;width:85px;text-align:right">Amount</th>
            <th style="padding:8px 6px;white-space:nowrap;width:65px;text-align:center">Status</th>
            <th style="padding:8px 8px;white-space:nowrap;width:125px;text-align:center">Action</th>
          </tr>
        </thead>
        <tbody>
          ${histRows.length === 0 ? '<tr><td colspan="8" class="empty" style="padding:24px;text-align:center">No past payment records found for this student.</td></tr>' : histRows.map(r => {
            let periodHtml = '';
            if (typeof r.period === 'string' && r.period.includes('), ')) {
              periodHtml = r.period.split('), ').map((item, idx, arr) => {
                const full = item + (idx < arr.length - 1 ? ')' : '');
                return `<div style="margin:2px 0;line-height:1.35;word-break:break-word;font-size:11.5px">${escapeHtml(full)}</div>`;
              }).join('');
            } else {
              periodHtml = `<div style="line-height:1.35;word-break:break-word;font-size:11.5px">${escapeHtml(r.period || '–')}</div>`;
            }

            return `
            <tr style="border-bottom:1px solid var(--bdr,#e2e8f0)">
              <td style="padding:7px 8px;white-space:nowrap;font-size:11.5px">${escapeHtml(r.date)}</td>
              <td style="padding:7px 8px;white-space:nowrap"><strong style="font-size:11.5px;color:${r.reversed ? 'var(--red)' : 'var(--pri,#1e3a8a)'}">${escapeHtml(r.receiptNo)}</strong></td>
              <td style="padding:7px 10px;white-space:normal;word-break:break-word">${periodHtml}</td>
              <td style="padding:7px 8px;white-space:nowrap;font-size:11.5px">${escapeHtml(r.category)}</td>
              <td style="padding:7px 6px;white-space:nowrap;text-align:center;font-size:11.5px">${escapeHtml(r.mode)}</td>
              <td style="padding:7px 8px;white-space:nowrap;text-align:right;font-weight:700;font-size:12px;color:${r.reversed ? 'var(--txt2)' : 'var(--grn)'};${r.reversed ? 'text-decoration:line-through' : ''}">₹${Number(r.total || 0).toLocaleString('en-IN')}</td>
              <td style="padding:7px 6px;white-space:nowrap;text-align:center">${r.reversed ? '<span class="chip cr" style="font-size:10px;padding:2px 6px">VOID</span>' : '<span class="chip cg" style="font-size:10px;padding:2px 6px">Paid</span>'}</td>
              <td style="padding:7px 8px;white-space:nowrap;text-align:center">
                <div style="display:inline-flex;gap:4px;justify-content:center">
                  <button class="btn bo bsm" onclick="showReceiptModal('${escapeHtml(r.receiptNo)}')" title="Preview receipt" style="font-size:10.5px;padding:3px 6px;white-space:nowrap">🧾 Receipt</button>
                  <button class="btn bo bsm" onclick="printReceiptByNumber('${escapeHtml(r.receiptNo)}', 'a4')" title="Print A4 receipt" style="font-size:10.5px;padding:3px 6px;white-space:nowrap">🖨 Print</button>
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;

  openM('paymentHistoryM');
}

// Harmless stubs for legacy / removed advanced modals
function openPaymentConfirmation() {}
function commitFinalizedPayment() {}
function showConfiguredFeeDetail() {}
function showPaidFeeDetail() {}
function showOutstandingFeeDetail() {}
function showArrearsDetailModal() {}

// Payment Void / Reversal Logic
function openVoidPaymentModal(receiptNo) {
  const p = (DB.payments || []).find(x => x.receiptNo === receiptNo);
  if (!p) {
    toast('Payment record not found for #' + receiptNo, 'error');
    return;
  }

  curVoidReceiptNo = receiptNo;
  const detEl = document.getElementById('voidPayDetails');
  if (detEl) {
    detEl.innerHTML = `
      <div style="background:var(--rl);border:1px solid #f5b7b1;border-radius:8px;padding:12px">
        <div style="font-weight:700;font-size:14px;color:var(--red)">Receipt #${p.receiptNo}</div>
        <div style="font-size:12px;margin-top:2px"><strong>Student:</strong> ${p.studentName} (Adm: ${p.admno}) | ${clL(p.cls)} (Sec ${p.section || 'A'})</div>
        <div style="font-size:12px"><strong>Amount Collected:</strong> ₹${Number(p.amount).toLocaleString('en-IN')} (${p.mode}) | <strong>Date:</strong> ${p.date}</div>
        <div style="font-size:12px"><strong>Category:</strong> ${p.category} | <strong>Period:</strong> ${p.period}</div>
      </div>`;
  }

  const reasonInp = document.getElementById('void_reason_input');
  if (reasonInp) reasonInp.value = '';

  openM('voidPayM');
}

function procVoidPayment() {
  if (!curVoidReceiptNo) return;
  const reason = document.getElementById('void_reason_input')?.value.trim();
  if (!reason) {
    toast('Mandatory reversal reason is required to void a payment!', 'error');
    return;
  }

  const p = (DB.payments || []).find(x => x.receiptNo === curVoidReceiptNo);
  if (!p) {
    toast('Payment record not found!', 'error');
    return;
  }

  if (p.reversed) {
    toast('Payment has already been voided!', 'warning');
    closeM('voidPayM');
    return;
  }

  const s = (DB.students || []).find(x => x.id === p.studentId);
  const cfg = s ? getStudentFeeConfig(s.id) : null;
  const today = new Date().toISOString().split('T')[0];

  // 1. Mark payment record as VOID
  p.reversed = true;
  p.voidReason = reason;
  p.voidDate = today;

  // 2. Restore previous arrears if this payment collected arrears (BUG-002 fix)
  if (Array.isArray(p.items)) {
    p.items.forEach(it => {
      if (it.type === 'Previous Arrears') {
        const arrearsAmt = (it.paidAmount !== undefined && it.paidAmount !== null)
          ? Number(it.paidAmount)
          : (Number(it.baseAmount) || 0);
        if (arrearsAmt > 0 && s) {
          const curArrears = getStudentPreviousArrears(s.id);
          setStudentPreviousArrears(s.id, curArrears + arrearsAmt);
        }
      }
    });
  } else if (p.category === 'Previous Arrears' && s) {
    const curArrears = getStudentPreviousArrears(s.id);
    setStudentPreviousArrears(s.id, curArrears + (Number(p.amount) || 0));
  }

  // 3. Reconcile fee records in DB.fees based on remaining active non-reversed payments (BUG-003 fix)
  if (s) {
    Object.entries(DB.fees || {}).forEach(([k, arr]) => {
      if (!k.startsWith(s.id + '_') || !Array.isArray(arr)) return;
      const parts = k.split('_');
      const mo = parts[1];
      const yr = parseInt(parts[2]);

      arr.forEach(f => {
        // Query remaining valid non-reversed payment contributions for this student & fee item
        let remPaid = 0;
        let remDiscount = 0;
        let lastReceipt = '';
        let lastDate = '';
        let lastMode = '';

        (DB.payments || []).forEach(otherP => {
          if (otherP.reversed || String(otherP.studentId) !== String(s.id)) return;
          if (Array.isArray(otherP.items) && otherP.items.length > 0) {
            otherP.items.forEach(it => {
              const matchKey = (it.feeKey === k) || (it.month === mo && Number(it.year) === yr);
              const matchType = (it.type === f.type) || (it.type === 'School Fee' && f.type === 'Tuition Fee');
              if (matchKey && matchType) {
                const paidVal = (it.paidAmount !== undefined && it.paidAmount !== null)
                  ? Number(it.paidAmount)
                  : (Number(it.baseAmount) || 0);
                const discVal = Number(it.discount) || 0;
                remPaid += paidVal;
                remDiscount += discVal;
                lastReceipt = otherP.receiptNo || lastReceipt;
                lastDate = otherP.date || lastDate;
                lastMode = otherP.mode || lastMode;
              }
            });
          } else if (otherP.category === f.type && otherP.period && otherP.period.includes(mo)) {
            remPaid += (Number(otherP.amount) || 0);
            remDiscount += (Number(otherP.discountAmt) || 0);
            lastReceipt = otherP.receiptNo || lastReceipt;
            lastDate = otherP.date || lastDate;
            lastMode = otherP.mode || lastMode;
          }
        });

        const fullFee = Number(f.amount) || 0;
        f.discount = remDiscount;
        const totalSettled = remPaid + remDiscount;
        if (totalSettled >= fullFee && fullFee > 0) {
          f.paid = true;
          f.partialPaid = remPaid;
          f.partialRemaining = 0;
          f.receiptNo = lastReceipt;
          f.date = lastDate;
          f.mode = lastMode;
        } else if (remPaid > 0 || remDiscount > 0) {
          f.paid = false;
          f.partialPaid = remPaid;
          f.partialRemaining = Math.max(0, fullFee - remDiscount - remPaid);
          f.receiptNo = lastReceipt;
          f.date = lastDate;
          f.mode = lastMode;
        } else {
          // If this fee item was touched by the voided receipt (or has no payments remaining)
          if (f.receiptNo === curVoidReceiptNo || !remPaid) {
            f.paid = false;
            f.receiptNo = '';
            f.date = '';
            f.mode = '';
            f.discount = 0;
            delete f.partialPaid;
            delete f.partialRemaining;
          }
        }
      });
    });
  }

  // 4. Reverse advance balance changes
  if (cfg) {
    if (p.excessAdvance > 0) {
      cfg.advanceBalance = Math.max(0, (cfg.advanceBalance || 0) - p.excessAdvance);
    }
    if (p.advanceApplied > 0) {
      cfg.advanceBalance = (cfg.advanceBalance || 0) + p.advanceApplied;
    }
  }

  saveDB(true);
  closeM('voidPayM');
  logActivity('Payment Voided', `Voided receipt #${p.receiptNo} for ${p.studentName}. Reason: ${reason}`);
  toast(`Receipt #${p.receiptNo} has been marked VOID and dues restored!`, 'warning');
  renderFeD();
}

// Receipt Modal & Formats (A4 Formal & Thermal 80mm)
function showSingleReceipt(idx) {
  if (!curFSid) return;
  const fees = DB.fees[feK()].filter(f => f.enabled !== false);
  const f = fees[idx];
  if (f && f.receiptNo) {
    showReceiptModal(f.receiptNo);
  }
}

function showReceiptModal(receiptNo) {
  activeReceiptNo = receiptNo;
  const rcB = document.getElementById('rcB');
  if (!rcB) return;
  rcB.innerHTML = buildReceiptHTML(receiptNo, 'preview');
  openM('rcC');
}

function printActiveReceipt(format = 'a4') {
  if (!activeReceiptNo) return;
  printReceiptByNumber(activeReceiptNo, format);
}

function printRcpt() {
  printActiveReceipt('a4');
}
function printRcptA4() {
  printActiveReceipt('a4');
}
function printRcptThermal() {
  printActiveReceipt('thermal');
}

function buildReceiptHTML(receiptNo, mode = 'preview') {
  const settings = DB.settings || {};
  let matchingItems = [];
  let studentObj = null;
  let paymentRecord = (DB.payments || []).find(p => p.receiptNo === receiptNo);

  if (paymentRecord && Array.isArray(paymentRecord.items) && paymentRecord.items.length > 0) {
    matchingItems = paymentRecord.items.map(it => ({
      month: it.month,
      year: it.year,
      type: it.type,
      amount: Number(it.paidAmount !== undefined ? it.paidAmount : it.baseAmount) || 0,
      baseAmount: Number(it.baseAmount) || 0,
      discount: Number(it.discount) || 0,
      discountReason: it.discountReason || paymentRecord.discountReason || '',
      session: it.session || paymentRecord.session || '',
      paidAmount: Number(it.paidAmount !== undefined ? it.paidAmount : it.baseAmount) || 0,
      remainingDue: Number(it.remainingDue) || 0,
      period: it.period || (it.month ? `${it.month} ${it.year}` : '–'),
      date: paymentRecord.date,
      mode: paymentRecord.mode || 'Cash'
    }));
  } else {
    Object.entries(DB.fees || {}).forEach(([k, arr]) => {
      if (!Array.isArray(arr)) return;
      const parts = k.split('_');
      const sid = parseInt(parts[0]), mo = parts[1], yr = parts[2];
      arr.forEach(f => {
        if (f.receiptNo === receiptNo) {
          const baseAmt = Number(f.amount) || 0;
          const disc = Number(f.discount) || 0;
          const paid = (f.partialPaid !== undefined && f.partialPaid !== null)
            ? Number(f.partialPaid)
            : (f.paid ? Math.max(0, baseAmt - disc) : 0);
          const rem = (f.partialRemaining !== undefined && f.partialRemaining !== null)
            ? Number(f.partialRemaining)
            : (f.paid ? 0 : Math.max(0, baseAmt - disc - paid));
          matchingItems.push({
            month: mo,
            year: yr,
            type: f.type,
            amount: paid,
            baseAmount: baseAmt,
            discount: disc,
            discountReason: f.discountReason || '',
            session: f.session || '',
            paidAmount: paid,
            remainingDue: rem,
            period: `${mo} ${yr}`,
            date: f.date,
            mode: f.mode || 'Cash'
          });
          if (!studentObj) studentObj = (DB.students || []).find(s => s.id === sid);
        }
      });
    });
  }

  if (!studentObj && paymentRecord) {
    studentObj = (DB.students || []).find(s => s.id === paymentRecord.studentId || s.admno === paymentRecord.admno);
  }
  if (!studentObj && curFSid) {
    studentObj = (DB.students || []).find(s => s.id === curFSid);
  }

  const s = studentObj || { name: 'Student', admno: '–', cls: '–', section: 'A', father: '–' };
  const payDate = paymentRecord?.date || matchingItems[0]?.date || new Date().toISOString().split('T')[0];
  const payMode = paymentRecord?.mode || matchingItems[0]?.mode || 'Cash';
  const grandTotal = paymentRecord ? Number(paymentRecord.amount) : matchingItems.reduce((a, it) => a + it.amount, 0);
  const isVoid = paymentRecord?.reversed === true;

  // Determine badge and banner
  let badgeText = '';
  let badgeBg = 'var(--gl)';
  let badgeColor = 'var(--grn)';

  if (isVoid) {
    badgeText = 'VOID / CANCELLED';
    badgeBg = 'var(--rl)';
    badgeColor = 'var(--red)';
  } else if (paymentRecord?.paymentStatus === 'PARTIAL PAYMENT' || (paymentRecord?.totalRemainingDue > 0)) {
    badgeText = 'PARTIAL PAYMENT';
    badgeBg = '#fff7ed';
    badgeColor = '#c2410c';
  } else if (paymentRecord?.paymentStatus === 'FEE WAIVED' || (grandTotal === 0 && paymentRecord?.discountAmt > 0)) {
    badgeText = 'FEE WAIVED';
    badgeBg = '#e0f2fe';
    badgeColor = '#0284c7';
  }

  const receiptDesc = paymentRecord?.receiptDescription || (
    isVoid ? `This receipt was voided on ${paymentRecord?.voidDate || ''}. Reason: ${paymentRecord?.voidReason || ''}` :
    (badgeText === 'PARTIAL PAYMENT' ? `Partial payment received. Remaining amount due: ₹${(paymentRecord?.totalRemainingDue || 0).toLocaleString('en-IN')}.` :
    (badgeText === 'FEE WAIVED' ? 'Fee completely waived via authorized discount. Remaining amount due: ₹0.' :
    'Full payment received. Remaining amount due: ₹0.'))
  );

  const logoHtml = settings.schoolLogo
    ? `<img src="${settings.schoolLogo}" style="width:50px;height:50px;border-radius:50%;object-fit:cover;margin-bottom:4px" onerror="this.style.display='none'">`
    : '';

  // Itemized breakdown rows (with consecutive month grouping)
  const displayItems = groupReceiptItems(matchingItems);
  let breakdownRowsHtml = '';
  if (displayItems.length > 0) {
    breakdownRowsHtml = displayItems.map((it, idx) => `
      <div style="display:grid;grid-template-columns:1.8fr 1fr 1fr 1.1fr 1.1fr;gap:4px;padding:4px 0;font-size:11.5px;border-bottom:1px solid #f0f0f0;align-items:center">
        <span>${idx + 1}. <strong>${it.type}</strong> <span style="font-size:10.5px;color:var(--txt2)">(${it.period})</span>${it.discount > 0 && it.discountReason ? `<div style="font-size:10px;color:var(--grn);font-weight:normal">Reason: ${escapeHtml(it.discountReason)}</div>` : ''}</span>
        <span style="text-align:right">₹${(it.baseAmount || it.amount).toLocaleString('en-IN')}</span>
        <span style="text-align:right;color:var(--grn)">${it.discount > 0 ? `-₹${it.discount.toLocaleString('en-IN')}` : '–'}</span>
        <span style="text-align:right;font-weight:700">₹${(it.paidAmount !== undefined ? it.paidAmount : it.amount).toLocaleString('en-IN')}</span>
        <span style="text-align:right;color:${it.remainingDue > 0 ? 'var(--red)' : 'var(--txt2)'};font-weight:${it.remainingDue > 0 ? '700' : 'normal'}">${it.remainingDue > 0 ? `₹${it.remainingDue.toLocaleString('en-IN')}` : '₹0'}</span>
      </div>`).join('');
  } else if (paymentRecord) {
    breakdownRowsHtml = `
      <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px">
        <span>${paymentRecord.category} (${paymentRecord.period})</span>
        <span style="font-weight:600">₹${grandTotal.toLocaleString('en-IN')}</span>
      </div>`;
  }

  return `
    <div style="position:relative;border:2px solid ${isVoid ? 'var(--red)' : 'var(--bdr)'};border-radius:10px;padding:16px;background:#fff">
      ${isVoid ? `<div style="background:var(--rl);color:var(--red);border:1.5px solid var(--red);border-radius:6px;padding:6px;text-align:center;font-weight:700;font-size:12px;margin-bottom:10px">
        *** VOID / CANCELLED RECEIPT ***<br>
        <span style="font-size:11px;font-weight:500">Void Date: ${paymentRecord.voidDate || '–'} | Reason: ${paymentRecord.voidReason || '–'}</span>
      </div>` : ''}

      <div style="text-align:center;border-bottom:1px dashed var(--bdr);padding-bottom:10px;margin-bottom:10px">
        ${logoHtml}
        <div style="font-weight:700;font-size:15px;color:var(--red)">${settings.schoolName || 'MD Convent Public School'}</div>
        <div style="font-size:11px;color:var(--txt2)">${settings.schoolAddr || ''} | Phone: ${settings.schoolPhone || ''}</div>
        <div style="margin-top:6px;display:flex;justify-content:center;gap:6px">
          <span style="background:${isVoid ? 'var(--rl)' : 'var(--gl)'};color:${isVoid ? 'var(--red)' : 'var(--grn)'};padding:2px 12px;border-radius:20px;font-size:11px;font-weight:700">FEE PAYMENT RECEIPT</span>
          ${badgeText ? `<span style="background:${badgeBg};color:${badgeColor};border:1px solid ${badgeColor};padding:2px 10px;border-radius:20px;font-size:10.5px;font-weight:700">${badgeText}</span>` : ''}
        </div>
      </div>

      <div class="rr"><span style="color:var(--txt2)">Receipt #</span><strong style="color:var(--blu)">${receiptNo}</strong></div>
      <div class="rr"><span style="color:var(--txt2)">Date</span><span>${payDate}</span></div>
      <div class="rr"><span style="color:var(--txt2)">Student Name</span><strong>${s.name}</strong></div>
      <div class="rr"><span style="color:var(--txt2)">Admission No</span><span>${s.admno}</span></div>
      <div class="rr"><span style="color:var(--txt2)">Class & Section</span><span>${clL(s.cls)} (Sec ${s.section || 'A'})</span></div>
      <div class="rr"><span style="color:var(--txt2)">Payment Method</span><strong>${payMode}</strong></div>

      ${badgeText ? `
      <!-- Receipt Description & Balance Note (partial, void, or waived) -->
      <div style="background:${badgeText === 'PARTIAL PAYMENT' ? '#fff7ed' : '#f0fdf4'};border:1px solid ${badgeText === 'PARTIAL PAYMENT' ? '#fdba74' : '#bbf7d0'};border-radius:6px;padding:7px 10px;margin:10px 0;font-size:11.5px;color:${badgeText === 'PARTIAL PAYMENT' ? '#9a3412' : '#166534'};font-weight:600">
        📌 <strong>Receipt Note:</strong> ${receiptDesc}
      </div>` : ''}

      <div style="margin-top:10px;margin-bottom:4px;font-size:11px;font-weight:700;color:var(--txt2);text-transform:uppercase">Itemized Breakdown</div>
      <div style="background:var(--bg);border-radius:6px;padding:6px 10px;margin-bottom:8px">
        <div style="display:grid;grid-template-columns:1.8fr 1fr 1fr 1.1fr 1.1fr;gap:4px;font-size:10.5px;font-weight:700;color:var(--txt2);border-bottom:1px solid var(--bdr);padding-bottom:3px;margin-bottom:4px">
          <span>Particulars</span>
          <span style="text-align:right">Original</span>
          <span style="text-align:right">Discount</span>
          <span style="text-align:right">Paid</span>
          <span style="text-align:right">Balance Due</span>
        </div>
        ${breakdownRowsHtml}
      </div>

      ${paymentRecord?.discountAmt > 0 ? `<div class="rr" style="color:var(--grn)"><span>Total Discount ${paymentRecord.discountReason ? `(${escapeHtml(paymentRecord.discountReason)})` : ''}</span><span>-₹${Number(paymentRecord.discountAmt).toLocaleString('en-IN')}</span></div>` : ''}
      ${paymentRecord?.lateFee > 0 ? `<div class="rr" style="color:#d35400"><span>Late Fee</span><span>+₹${Number(paymentRecord.lateFee).toLocaleString('en-IN')}</span></div>` : ''}

      <div class="rt" style="font-size:15px">
        <span>Grand Total Paid</span>
        <span style="color:${isVoid ? 'var(--txt2)' : 'var(--grn)'};${isVoid ? 'text-decoration:line-through' : ''}">₹${grandTotal.toLocaleString('en-IN')}</span>
      </div>

      <div style="margin-top:14px;text-align:center;font-size:10px;color:var(--txt2);border-top:1px dashed var(--bdr);padding-top:8px">
        Computer Generated Receipt · Authorized Signatory: ${settings.principalName || 'Tanmay Soni'}
      </div>
    </div>`;
}

function printReceiptByNumber(receiptNo, format = 'a4') {
  if (!receiptNo || receiptNo === '–') {
    toast('No valid receipt number to print!', 'warning');
    return;
  }
  const settings = DB.settings || {};
  let matchingItems = [];
  let studentObj = null;
  let paymentRecord = (DB.payments || []).find(p => p.receiptNo === receiptNo);

  if (paymentRecord && Array.isArray(paymentRecord.items) && paymentRecord.items.length > 0) {
    matchingItems = paymentRecord.items.map(it => ({
      month: it.month,
      year: it.year,
      type: it.type,
      amount: Number(it.paidAmount !== undefined ? it.paidAmount : it.baseAmount) || 0,
      baseAmount: Number(it.baseAmount) || 0,
      discount: Number(it.discount) || 0,
      discountReason: it.discountReason || paymentRecord.discountReason || '',
      session: it.session || paymentRecord.session || '',
      paidAmount: Number(it.paidAmount !== undefined ? it.paidAmount : it.baseAmount) || 0,
      remainingDue: Number(it.remainingDue) || 0,
      period: it.period || (it.month ? `${it.month} ${it.year}` : '–'),
      date: paymentRecord.date,
      mode: paymentRecord.mode || 'Cash'
    }));
  } else {
    Object.entries(DB.fees || {}).forEach(([k, arr]) => {
      if (!Array.isArray(arr)) return;
      const parts = k.split('_');
      const sid = parseInt(parts[0]), mo = parts[1], yr = parts[2];
      arr.forEach(f => {
        if (f.receiptNo === receiptNo) {
          const baseAmt = Number(f.amount) || 0;
          const disc = Number(f.discount) || 0;
          const paid = (f.partialPaid !== undefined && f.partialPaid !== null)
            ? Number(f.partialPaid)
            : (f.paid ? Math.max(0, baseAmt - disc) : 0);
          const rem = (f.partialRemaining !== undefined && f.partialRemaining !== null)
            ? Number(f.partialRemaining)
            : (f.paid ? 0 : Math.max(0, baseAmt - disc - paid));
          matchingItems.push({
            month: mo,
            year: yr,
            type: f.type,
            amount: paid,
            baseAmount: baseAmt,
            discount: disc,
            discountReason: f.discountReason || '',
            session: f.session || '',
            paidAmount: paid,
            remainingDue: rem,
            period: `${mo} ${yr}`,
            date: f.date,
            mode: f.mode || 'Cash'
          });
          if (!studentObj) studentObj = (DB.students || []).find(s => s.id === sid);
        }
      });
    });
  }

  if (!studentObj && paymentRecord) {
    studentObj = (DB.students || []).find(s => s.id === paymentRecord.studentId || s.admno === paymentRecord.admno);
  }
  if (!studentObj && curFSid) {
    studentObj = (DB.students || []).find(s => s.id === curFSid);
  }

  const s = studentObj || { name: 'Student', admno: '–', cls: '–', section: 'A', father: '–' };
  const payDate = paymentRecord?.date || matchingItems[0]?.date || new Date().toISOString().split('T')[0];
  const payMode = paymentRecord?.mode || matchingItems[0]?.mode || 'Cash';
  const grandTotal = paymentRecord ? Number(paymentRecord.amount) : matchingItems.reduce((a, it) => a + it.amount, 0);
  const isVoid = paymentRecord?.reversed === true;
  const inWords = numberToWordsINR(grandTotal);

  // Determine badge and banner
  let badgeText = '';
  let badgeBorder = '#27ae60';
  let badgeBg = '#eafaf1';
  let badgeColor = '#27ae60';

  if (isVoid) {
    badgeText = 'VOID / CANCELLED';
    badgeBorder = '#c0392b';
    badgeBg = '#fdecea';
    badgeColor = '#c0392b';
  } else if (paymentRecord?.paymentStatus === 'PARTIAL PAYMENT' || (paymentRecord?.totalRemainingDue > 0)) {
    badgeText = 'PARTIAL PAYMENT';
    badgeBorder = '#c2410c';
    badgeBg = '#fff7ed';
    badgeColor = '#c2410c';
  } else if (paymentRecord?.paymentStatus === 'FEE WAIVED' || (grandTotal === 0 && paymentRecord?.discountAmt > 0)) {
    badgeText = 'FEE WAIVED';
    badgeBorder = '#0284c7';
    badgeBg = '#e0f2fe';
    badgeColor = '#0284c7';
  }

  const receiptDesc = paymentRecord?.receiptDescription || (
    isVoid ? `This receipt was voided on ${paymentRecord?.voidDate || ''}. Reason: ${paymentRecord?.voidReason || ''}` :
    (badgeText === 'PARTIAL PAYMENT' ? `Partial payment received. Remaining amount due: ₹${(paymentRecord?.totalRemainingDue || 0).toLocaleString('en-IN')}.` :
    (badgeText === 'FEE WAIVED' ? 'Fee completely waived via authorized discount. Remaining amount due: ₹0.' :
    'Full payment received. Remaining amount due: ₹0.'))
  );

  const logoHtml = settings.schoolLogo
    ? `<img src="${settings.schoolLogo}" style="width:55px;height:55px;border-radius:50%;object-fit:cover;margin-bottom:4px" onerror="this.style.display='none'">`
    : '';

  const displayItems = groupReceiptItems(matchingItems);
  let html = '';

  if (format === 'thermal') {
    // 80mm POS Thermal Slip Layout
    html = `<!DOCTYPE html><html><head><title>Thermal Receipt - ${receiptNo}</title>
    <style>
      @page { size: 80mm auto; margin: 2mm; }
      *, *::before, *::after { box-sizing: border-box; }
      body { width: 76mm; margin: 0 auto; font-family: monospace, Arial, sans-serif; font-size: 11px; color: #000; padding: 4px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .tc { text-align: center; }
      .dash { border-bottom: 1px dashed #000; margin: 4px 0; }
      .row { display: flex; justify-content: space-between; padding: 2px 0; }
      .bold { font-weight: bold; }
    </style></head><body>
      <div class="tc">
        ${logoHtml}
        <div style="font-weight:bold;font-size:13px">${settings.schoolName || 'MD Convent Public School'}</div>
        <div style="font-size:10px">${settings.schoolAddr || ''} | Tel: ${settings.schoolPhone || ''}</div>
        <div class="dash"></div>
        <div style="font-weight:bold;font-size:11px">${isVoid ? '*** VOID / CANCELLED RECEIPT ***' : 'OFFICIAL FEE RECEIPT'}</div>
        ${badgeText ? `<div style="font-weight:bold;font-size:10.5px;margin-top:2px">[ ${badgeText} ]</div>` : ''}
        ${isVoid ? `<div style="font-size:9.5px;color:#c00">Reason: ${paymentRecord?.voidReason || ''} (${paymentRecord?.voidDate || ''})</div>` : ''}
      </div>
      <div class="dash"></div>
      <div class="row"><span>Receipt #:</span><span class="bold">${receiptNo}</span></div>
      <div class="row"><span>Date:</span><span>${payDate}</span></div>
      <div class="row"><span>Student:</span><span class="bold">${s.name}</span></div>
      <div class="row"><span>Adm No:</span><span>${s.admno}</span></div>
      <div class="row"><span>Class:</span><span>${clL(s.cls)} (Sec ${s.section || 'A'})</span></div>
      <div class="row"><span>Payment Mode:</span><span>${payMode}</span></div>
      ${badgeText ? `
      <div class="dash"></div>
      <div style="font-size:10px;padding:3px 0;line-height:1.3"><strong>Note:</strong> ${receiptDesc}</div>` : ''}
      <div class="dash"></div>
      <div class="bold" style="margin-bottom:2px">ITEMIZED PARTICULARS:</div>
      ${displayItems.map(it => `
        <div class="row" style="font-size:10.5px">
          <span>${it.type} (${it.period})</span>
          <span>₹${(it.paidAmount !== undefined ? it.paidAmount : it.amount).toLocaleString('en-IN')}</span>
        </div>
        ${it.discount > 0 || it.remainingDue > 0 ? `
          <div style="display:flex;justify-content:space-between;font-size:9.5px;color:#444;padding-left:6px">
            <span>Orig: ₹${it.baseAmount} ${it.discount > 0 ? `| Disc: ₹${it.discount}${it.discountReason ? ` (${it.discountReason})` : ''}` : ''}</span>
            <span style="font-weight:${it.remainingDue > 0 ? 'bold' : 'normal'}">Due: ₹${it.remainingDue}</span>
          </div>` : ''}
      `).join('')}
      ${paymentRecord?.discountAmt > 0 ? `<div class="row"><span>Total Discount ${paymentRecord.discountReason ? `(${paymentRecord.discountReason})` : ''}:</span><span>-₹${paymentRecord.discountAmt}</span></div>` : ''}
      ${paymentRecord?.lateFee > 0 ? `<div class="row"><span>Late Fee:</span><span>+₹${paymentRecord.lateFee}</span></div>` : ''}
      <div class="dash"></div>
      <div class="row bold" style="font-size:13px">
        <span>TOTAL PAID:</span>
        <span>₹${grandTotal.toLocaleString('en-IN')}</span>
      </div>
      <div class="dash"></div>
      <div class="tc" style="font-size:9.5px;margin-top:6px">
        ${inWords}<br>
        Auth Signatory: ${settings.principalName || 'Tanmay Soni'}<br>
        Principal Signature: ____________<br>
        Thank you!
      </div>
    </body></html>`;
  } else {
    // Formal A4 Printable School Receipt Layout
    html = `<!DOCTYPE html><html><head><title>Receipt - ${receiptNo}</title>
    <style>
      @page { size: A4; margin: 12mm; }
      body { margin: 0; font-family: Arial, sans-serif; font-size: 12.5px; color: #222; background: #fff; }
      .rc-box { max-width: 720px; margin: 10px auto; border: 2px solid ${isVoid ? '#c0392b' : '#333'}; border-radius: 8px; padding: 20px; position: relative; }
      .hdr { text-align: center; border-bottom: 2px solid #c0392b; padding-bottom: 10px; margin-bottom: 12px; }
      .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .rw { display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid #f0f0f0; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; }
      th { background: #f5f5f5; border: 1px solid #ddd; padding: 8px 10px; text-align: left; font-size: 11px; }
      td { border: 1px solid #ddd; padding: 7px 10px; font-size: 12px; }
    </style></head><body>
      <div class="rc-box">
        ${isVoid ? `<div style="background:#fdecea;color:#c0392b;border:1.5px solid #c0392b;border-radius:6px;padding:8px;text-align:center;font-weight:bold;font-size:12.5px;margin-bottom:12px">
          *** THIS RECEIPT HAS BEEN VOIDED / CANCELLED ***<br>
          <span style="font-size:11px;font-weight:normal">Cancellation Date: ${paymentRecord.voidDate || ''} | Reason: ${paymentRecord.voidReason || ''}</span>
        </div>` : ''}

        <div class="hdr">
          ${logoHtml}
          <div style="font-weight:bold;font-size:18px;color:#c0392b">${settings.schoolName || 'MD Convent Public School'}</div>
          <div style="font-size:11px;color:#555">${settings.schoolAddr || ''} | Contact: ${settings.schoolPhone || ''}</div>
          <div style="margin-top:6px;display:flex;justify-content:center;gap:8px">
            <span style="background:${isVoid ? '#fdecea' : '#eafaf1'};color:${isVoid ? '#c0392b' : '#27ae60'};padding:3px 16px;border-radius:20px;font-weight:bold;font-size:11.5px;border:1px solid ${isVoid ? '#f5b7b1' : '#a9dfbf'}">OFFICIAL FEE RECEIPT</span>
            ${badgeText ? `<span style="background:${badgeBg};color:${badgeColor};padding:3px 14px;border-radius:20px;font-weight:bold;font-size:11.5px;border:1px solid ${badgeBorder}">${badgeText}</span>` : ''}
          </div>
        </div>

        <div class="grid2" style="margin-bottom:10px">
          <div>
            <div class="rw"><span style="color:#666">Receipt Number</span><strong>${receiptNo}</strong></div>
            <div class="rw"><span style="color:#666">Student Name</span><strong>${s.name}</strong></div>
            <div class="rw"><span style="color:#666">Admission No</span><span>${s.admno}</span></div>
            <div class="rw"><span style="color:#666">Father Name</span><span>${s.father || '–'}</span></div>
          </div>
          <div>
            <div class="rw"><span style="color:#666">Date</span><span>${payDate}</span></div>
            <div class="rw"><span style="color:#666">Academic Session</span><span>${paymentRecord?.session || settings.currentSession || '2026–27'}</span></div>
            <div class="rw"><span style="color:#666">Class & Section</span><span>${clL(s.cls)} (Sec ${s.section || 'A'})</span></div>
            <div class="rw"><span style="color:#666">Payment Mode</span><strong>${payMode}</strong></div>
          </div>
        </div>

        ${badgeText ? `
        <div style="background:${badgeText === 'PARTIAL PAYMENT' ? '#fff7ed' : '#f0fdf4'};border:1px solid ${badgeText === 'PARTIAL PAYMENT' ? '#fed7aa' : '#bbf7d0'};border-radius:6px;padding:8px 12px;margin:10px 0;font-size:12px;color:${badgeText === 'PARTIAL PAYMENT' ? '#9a3412' : '#166534'}">
          <strong>Receipt Note:</strong> ${receiptDesc}
        </div>` : ''}

        <table>
          <thead>
            <tr>
              <th style="width:30px">#</th>
              <th>Billing Period</th>
              <th>Category</th>
              <th style="width:90px;text-align:right">Original Fee</th>
              <th style="width:80px;text-align:right">Discount</th>
              <th style="width:95px;text-align:right">Amount Paid</th>
              <th style="width:90px;text-align:right">Balance Due</th>
            </tr>
          </thead>
          <tbody>
            ${displayItems.length > 0 ? displayItems.map((it, idx) => `
              <tr>
                <td>${idx + 1}</td>
                <td>${it.period}</td>
                <td><strong>${it.type}</strong>${it.discount > 0 && it.discountReason ? `<div style="font-size:10.5px;color:#27ae60;font-weight:normal">Reason: ${escapeHtml(it.discountReason)}</div>` : ''}</td>
                <td style="text-align:right">₹${(it.baseAmount || it.amount).toLocaleString('en-IN')}</td>
                <td style="text-align:right;color:#27ae60">${it.discount > 0 ? `-₹${it.discount.toLocaleString('en-IN')}` : '–'}</td>
                <td style="text-align:right;font-weight:bold">₹${(it.paidAmount !== undefined ? it.paidAmount : it.amount).toLocaleString('en-IN')}</td>
                <td style="text-align:right;color:${it.remainingDue > 0 ? '#c0392b' : '#666'};font-weight:${it.remainingDue > 0 ? 'bold' : 'normal'}">${it.remainingDue > 0 ? `₹${it.remainingDue.toLocaleString('en-IN')}` : '₹0'}</td>
              </tr>`).join('') : `
              <tr>
                <td>1</td>
                <td>${paymentRecord?.period || '–'}</td>
                <td><strong>${paymentRecord?.category || 'School Fee'}</strong></td>
                <td style="text-align:right">₹${grandTotal.toLocaleString('en-IN')}</td>
                <td style="text-align:right">–</td>
                <td style="text-align:right;font-weight:bold">₹${grandTotal.toLocaleString('en-IN')}</td>
                <td style="text-align:right">₹0</td>
              </tr>`}
          </tbody>
        </table>

        <div style="margin-top:10px;display:flex;justify-content:flex-end">
          <div style="width:280px;font-size:12.5px">
            ${paymentRecord?.lateFee > 0 ? `<div style="display:flex;justify-content:space-between;padding:2px 0;color:#d35400"><span>Late Fee</span><span>+₹${paymentRecord.lateFee.toLocaleString('en-IN')}</span></div>` : ''}
            ${paymentRecord?.discountAmt > 0 ? `<div style="display:flex;justify-content:space-between;padding:2px 0;color:#27ae60"><span>Total Discount ${paymentRecord.discountReason ? `(${escapeHtml(paymentRecord.discountReason)})` : ''}</span><span>-₹${paymentRecord.discountAmt.toLocaleString('en-IN')}</span></div>` : ''}
            <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:14px;border-top:2px solid #333;padding-top:4px">
              <span>Grand Total Paid</span>
              <span style="color:${isVoid ? '#666' : '#27ae60'};${isVoid ? 'text-decoration:line-through' : ''}">₹${grandTotal.toLocaleString('en-IN')}</span>
            </div>
          </div>
        </div>

        <div style="margin-top:6px;font-size:11.5px;color:#444"><strong>In Words:</strong> ${inWords}</div>

        <div style="margin-top:24px;display:flex;justify-content:space-between;align-items:flex-end;border-top:1px dashed #ccc;padding-top:12px;font-size:11px;color:#666">
          <div>
            Computer Generated Receipt<br>
            Authorized Signatory: <strong>${settings.principalName || 'Tanmay Soni'}</strong>
          </div>
          <div style="text-align:center;width:130px;height:45px;border:1px dashed #bbb;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:10px;color:#666">
            Principal Signature
          </div>
        </div>
      </div>
    </body></html>`;
  }

  if (isEl) window.electronAPI.printContent(html);
  else { const w = window.open('','_blank'); w.document.write(html); w.document.close(); }
}

function printStoredReceipt(key, idx) {
  const arr = DB.fees[key];
  if (!arr || !arr[idx]) return;
  const f = arr[idx];
  if (f.receiptNo && f.receiptNo !== '–') {
    printReceiptByNumber(f.receiptNo, 'a4');
  }
}

// Per-Student Fee Setup Modal
function openFeeSetup(studentId = null) {
  const sid = studentId || curFSid;
  if (!sid) {
    toast('Please select a student first', 'warning');
    return;
  }
  const s = DB.students.find(x => x.id === sid);
  if (!s) return;
  curFSid = s.id;
  const cfg = getStudentFeeConfig(s.id);
  const c = s.cls;
  const struct = (DB.feeStructures && DB.feeStructures[c]) ? DB.feeStructures[c] : { tuition: 400, transport: 300, admission: 500, examFee: 200 };

  const curTuition = (cfg.customTuition !== null && cfg.customTuition !== undefined && cfg.customTuition !== '' && !isNaN(Number(cfg.customTuition)))
    ? Number(cfg.customTuition) : struct.tuition;
  const curTransport = (cfg.customTransport !== null && cfg.customTransport !== undefined && cfg.customTransport !== '' && !isNaN(Number(cfg.customTransport)))
    ? Number(cfg.customTransport) : (struct.transport || 300);
  const curExam = (cfg.examFee !== null && cfg.examFee !== undefined && cfg.examFee !== '' && !isNaN(Number(cfg.examFee)))
    ? Number(cfg.examFee) : (struct.examFee || 200);
  const curAdmission = (cfg.customAdmission !== null && cfg.customAdmission !== undefined && cfg.customAdmission !== '' && !isNaN(Number(cfg.customAdmission)))
    ? Number(cfg.customAdmission) : (struct.admission || 500);

  document.getElementById('feeSetupBody').innerHTML = `
    <div style="background:var(--bg);border-radius:8px;padding:10px 14px;margin-bottom:12px">
      <div style="font-weight:700;font-size:13.5px">${s.name} (Adm: ${s.admno})</div>
      <div style="font-size:11.5px;color:var(--txt2)">${clL(s.cls)} (Sec ${s.section || 'A'}) | Father: ${s.father}</div>
    </div>

    <!-- School Fee -->
    <div class="fee-toggle">
      <div class="fee-toggle-left">
        <div class="fee-toggle-name">School Fee</div>
        <div style="display:flex;align-items:center;gap:6px;margin-top:2px">
          <span style="font-size:11.5px;color:var(--txt2)">₹</span>
          <input type="number" id="fs_val_tuition" value="${curTuition}" style="width:90px;padding:3px 6px;font-size:12px;border:1px solid var(--bdr);border-radius:4px">
          <span style="font-size:11px;color:var(--txt2)">/ month (Default: ₹${struct.tuition})</span>
        </div>
      </div>
      <label class="switch"><input type="checkbox" id="tog_tuition" ${cfg.tuition !== false ? 'checked' : ''}><span class="slider"></span></label>
    </div>


    <!-- Exam Fee -->
    <div class="fee-toggle">
      <div class="fee-toggle-left">
        <div class="fee-toggle-name">Exam Fee (Sep, Dec, Mar)</div>
        <div style="display:flex;align-items:center;gap:6px;margin-top:2px">
          <span style="font-size:11.5px;color:var(--txt2)">₹</span>
          <input type="number" id="fs_val_exam" value="${curExam}" style="width:90px;padding:3px 6px;font-size:12px;border:1px solid var(--bdr);border-radius:4px">
          <span style="font-size:11px;color:var(--txt2)">per exam term (Default: ₹200)</span>
        </div>
      </div>
      <label class="switch"><input type="checkbox" id="tog_exam" ${cfg.examEnabled !== false ? 'checked' : ''}><span class="slider"></span></label>
    </div>

    <!-- Admission Fee -->
    <div class="fee-toggle">
      <div class="fee-toggle-left">
        <div class="fee-toggle-name">Admission Fee (Once per session)</div>
        <div style="display:flex;align-items:center;gap:6px;margin-top:2px">
          <span style="font-size:11.5px;color:var(--txt2)">₹</span>
          <input type="number" id="fs_val_admission" value="${curAdmission}" style="width:90px;padding:3px 6px;font-size:12px;border:1px solid var(--bdr);border-radius:4px">
          <span style="font-size:11px;color:var(--txt2)">(Default: ₹${struct.admission})</span>
        </div>
      </div>
      <label class="switch"><input type="checkbox" id="tog_admission" ${cfg.admission !== false ? 'checked' : ''}><span class="slider"></span></label>
    </div>

    <!-- Previous Session Arrears & Advance Credit -->
    <div class="g2" style="gap:10px;margin-top:10px">
      <div style="background:var(--bg);border-radius:8px;padding:10px;border:1px solid var(--bdr)">
        <label style="font-size:11px;font-weight:700;color:#d35400">Previous Session Arrears (₹)</label>
        <input type="number" id="fs_val_arrears" value="${cfg.previousArrears || 0}" style="width:100%;padding:4px 8px;font-size:12.5px;margin-top:3px;border:1px solid var(--bdr);border-radius:4px">
      </div>
      <div style="background:var(--bg);border-radius:8px;padding:10px;border:1px solid var(--bdr)">
        <label style="font-size:11px;font-weight:700;color:var(--grn)">Running Advance Credit Balance (₹)</label>
        <input type="number" id="fs_val_advance" value="${cfg.advanceBalance || 0}" style="width:100%;padding:4px 8px;font-size:12.5px;margin-top:3px;border:1px solid var(--bdr);border-radius:4px">
      </div>
    </div>`;

  document.getElementById('oe_d').value = '';
  document.getElementById('oe_a').value = '';
  openM('feeSetupM');
}

function addCustomFee() {
  const d = document.getElementById('oe_d').value.trim();
  const a = parseFloat(document.getElementById('oe_a').value);
  if (!d || isNaN(a) || a <= 0) {
    toast('Enter a valid charge description and positive amount', 'error');
    return;
  }
  const key = feK();
  if (!DB.fees[key]) {
    const s = DB.students.find(x => x.id === curFSid);
    initFeeLedger(s);
  }
  DB.fees[key].push({ type: d, amount: a, paid: false, date: '', receiptNo: '', enabled: true });
  saveDB(true);
  closeM('feeSetupM');
  renderFeD();
  logActivity('Custom Charge Added', `Added custom charge "${d}" of ₹${a} for student ID ${curFSid}`);
  toast(`Custom charge "${d}" added!`);
}

function saveFeeSetup() {
  if (!curFSid) return;
  const s = DB.students.find(x => x.id === curFSid);
  if (!s) return;
  const cfg = getStudentFeeConfig(s.id);
  const tVal = parseFloat(document.getElementById('fs_val_tuition')?.value);
  const exVal = parseFloat(document.getElementById('fs_val_exam')?.value);
  const adVal = parseFloat(document.getElementById('fs_val_admission')?.value);
  const arrVal = parseFloat(document.getElementById('fs_val_arrears')?.value);
  const advVal = parseFloat(document.getElementById('fs_val_advance')?.value);

  cfg.customTuition = !isNaN(tVal) ? tVal : null;
  cfg.tuition = document.getElementById('tog_tuition')?.checked ?? true;

  const trEl = document.getElementById('fs_val_transport');
  if (trEl) {
    const trVal = parseFloat(trEl.value);
    cfg.customTransport = !isNaN(trVal) ? trVal : null;
  }
  const togTrEl = document.getElementById('tog_transport');
  if (togTrEl) {
    cfg.transportEnabled = togTrEl.checked;
    cfg.transport = cfg.transportEnabled;
  }

  cfg.examEnabled = document.getElementById('tog_exam')?.checked ?? true;
  cfg.examFee = !isNaN(exVal) ? exVal : 200;

  cfg.admission = document.getElementById('tog_admission')?.checked ?? true;
  cfg.customAdmission = !isNaN(adVal) ? adVal : null;

  cfg.previousArrears = !isNaN(arrVal) ? Math.max(0, arrVal) : 0;
  cfg.advanceBalance = !isNaN(advVal) ? Math.max(0, advVal) : 0;

  // Re-synchronize current selected month fees while preserving paid items
  const mo = document.getElementById('fe_mo')?.value || 'April';
  const yr = document.getElementById('fe_yr')?.value || '2026';
  const key = `${s.id}_${mo}_${yr}`;

  const existing = DB.fees[key] || [];
  const paidFees = existing.filter(f => f.paid);
  const customFees = existing.filter(f => !['School Fee', 'Tuition Fee', 'Van Fee', 'Transport Fee', 'Admission Fee', 'Exam Fee'].includes(f.type));

  if (isPeriodValidForStudent(s, mo, yr) || paidFees.length > 0 || customFees.length > 0) {
    const effective = getEffectiveFeesForStudent(s, mo, yr).filter(f => f.enabled);
    const rebuiltEffective = effective.map(eff => {
      const already = paidFees.find(p => p.type === eff.type);
      if (already) return already;
      return { type: eff.type, amount: eff.amount, paid: false, date: '', receiptNo: '', enabled: true };
    });

    DB.fees[key] = [...rebuiltEffective, ...customFees];
  } else if (DB.fees[key]) {
    delete DB.fees[key];
  }

  saveDB(true);
  closeM('feeSetupM');
  renderFeD();
  logActivity('Fee Setup Updated', `Updated fee setup for ${s.name} (Adm: ${s.admno}): School=₹${tVal}, Exam=₹${exVal}`);
  toast('Fee settings saved successfully!');
}

// ============================================================
// 6B. LIVE ACADEMIC SESSION MONTH-WISE SUMMARY & COMBINED PAYMENT
// ============================================================

function onSummaryMonthSelect(val) {
  curSummaryMonthKey = val;
  renderMonthWiseSummary();
  // Automatically collapse the expanded monthly summary after month selection
  toggleMonthSummary(false);
}

function renderMonthWiseSummary() {
  const tb = document.getElementById('monthWiseSummaryTb');
  if (!tb) return;

  const curSess = (DB.settings && DB.settings.currentSession) || '2026–27';
  const [startY, endY] = parseSessionYears(curSess);
  const curSessLbl = document.getElementById('sumSessionLbl');
  if (curSessLbl) curSessLbl.textContent = 'Session ' + curSess;

  const today = new Date();
  const calMoName = SYS_MONTHS[today.getMonth()];
  const calYear = today.getFullYear();
  const curBdg = document.getElementById('sumCurMonthBdg');
  if (curBdg) curBdg.textContent = `Live Current: ${calMoName} ${calYear}`;

  // Populate dynamic month options in the #sumMonthSel dropdown if empty or session changed
  const sumMonthSel = document.getElementById('sumMonthSel');
  if (sumMonthSel) {
    const existingOptions = Array.from(sumMonthSel.options || []).map(o => o.value);
    const sessionMonthKeys = MONTHS_LIST.map((mo, idx) => `${mo}_${idx < 9 ? startY : endY}`);
    const needsRepopulate = existingOptions.length !== 12 || !sessionMonthKeys.every(k => existingOptions.includes(k));

    if (needsRepopulate) {
      sumMonthSel.innerHTML = MONTHS_LIST.map((mo, idx) => {
        const y = (idx < 9) ? startY : endY;
        return `<option value="${mo}_${y}">${mo} ${y}</option>`;
      }).join('');
    }

    // Default curSummaryMonthKey if not set or invalid for current session
    const validKeys = MONTHS_LIST.map((mo, idx) => `${mo}_${idx < 9 ? startY : endY}`);
    const liveKey = `${calMoName}_${calYear}`;
    if (!curSummaryMonthKey || !validKeys.includes(curSummaryMonthKey)) {
      if (validKeys.includes(liveKey)) {
        curSummaryMonthKey = liveKey;
      } else {
        curSummaryMonthKey = validKeys[0]; // Sensible default (April startY)
      }
    }
    sumMonthSel.value = curSummaryMonthKey;
  }

  // Parse currently selected summary month and year
  let selMo = calMoName;
  let selYr = calYear;
  if (curSummaryMonthKey) {
    const parts = curSummaryMonthKey.split('_');
    selMo = parts[0];
    selYr = parseInt(parts[1]);
  }

  const activeStudents = (DB.students || []).filter(s => s.status !== 'Inactive' && s.status !== 'Left School' && s.status !== 'Alumni');

  // Filter months list: Show ONLY the selected month in the summary table
  const monthsToRender = MONTHS_LIST
    .map((mo, mIdx) => ({ mo, yr: (mIdx < 9) ? startY : endY, mIdx }))
    .filter(item => item.mo === selMo && item.yr === selYr);

  let rowsHtml = '';

  monthsToRender.forEach(({ mo, yr, mIdx }) => {
    const isLiveCurrent = (mo === calMoName && yr === calYear);

    // 1. Total Expected for this month
    let expected = 0;
    let collected = 0;
    let outstanding = 0;

    activeStudents.forEach(st => {
      const key = `${st.id}_${mo}_${yr}`;
      const fees = DB.fees && DB.fees[key];
      if (Array.isArray(fees) && fees.length > 0) {
        fees.forEach(f => {
          if (f.enabled === false) return;
          const amt = Number(f.amount) || 0;
          expected += amt;
          if (f.paid) collected += amt;
          else if (isFeeRecordCurrentlyDue(mo, yr, curSess)) outstanding += amt;
        });
      } else {
        // Scheduled standard monthly fees
        const struct = (DB.feeStructures && DB.feeStructures[st.cls]) ? DB.feeStructures[st.cls] : { tuition: 400, admission: 500 };
        const cfg = (DB.feeConfig && DB.feeConfig[st.id]) ? DB.feeConfig[st.id] : {};
        if (cfg.tuition !== false) expected += struct.tuition;
        // Admission fee is only expected in April (start of session) if not already paid
        if (mIdx === 0 && cfg.admission !== false) {
          let admPaid = false;
          Object.entries(DB.fees || {}).forEach(([k, arr]) => {
            if (k.startsWith(st.id + '_') && Array.isArray(arr) && arr.some(f => f.type === 'Admission Fee' && f.paid)) {
              admPaid = true;
            }
          });
          if (!admPaid) expected += struct.admission;
        }

        // Implicit due if month has arrived
        if (isFeeRecordCurrentlyDue(mo, yr, curSess)) {
          if (cfg.tuition !== false) outstanding += struct.tuition;
          if (mIdx === 0 && cfg.admission !== false) {
            let admPaid = false;
            Object.entries(DB.fees || {}).forEach(([k, arr]) => {
              if (k.startsWith(st.id + '_') && Array.isArray(arr) && arr.some(f => f.type === 'Admission Fee' && f.paid)) admPaid = true;
            });
            if (!admPaid) outstanding += struct.admission;
          }
        }
      }
    });

    // Also account for any advance payments or fees recorded for students who may have transferred
    Object.entries(DB.fees || {}).forEach(([k, arr]) => {
      const parts = k.split('_');
      if (parts[1] === mo && parseInt(parts[2]) === yr && Array.isArray(arr)) {
        arr.forEach(f => {
          if (f.enabled !== false && f.paid) {
            const sid = parseInt(parts[0]);
            if (!activeStudents.some(st => st.id === sid)) {
              collected += (Number(f.amount) || 0);
              expected += (Number(f.amount) || 0);
            }
          }
        });
      }
    });

    // Collection rate & status
    let ratePct = 0;
    let statusLabel = 'N/A';
    let statusChipClass = 'cgr';

    if (expected > 0) {
      ratePct = Math.min(100, Math.round((collected / expected) * 100));
      if (ratePct >= 80) {
        statusLabel = 'Good';
        statusChipClass = 'cg';
      } else if (ratePct >= 50) {
        statusLabel = 'Average';
        statusChipClass = 'cy';
      } else {
        statusLabel = 'Needs Attention';
        statusChipClass = 'cr';
      }
    } else if (collected > 0) {
      ratePct = 100;
      statusLabel = 'Good';
      statusChipClass = 'cg';
    }

    const rowBg = 'background:#fef9e7;';

    rowsHtml += `
      <tr style="${rowBg}">
        <td style="padding:8px 12px">
          <div style="display:flex;align-items:center;gap:6px">
            <strong style="font-size:13px">${mo} ${yr}</strong>
            ${isLiveCurrent ? '<span class="chip cb2" style="font-size:10px">Live Current</span>' : ''}
            <span class="chip cy" style="font-size:10px">Selected</span>
          </div>
        </td>
        <td style="padding:8px 12px;font-weight:600">₹${expected.toLocaleString('en-IN')}</td>
        <td style="padding:8px 12px;font-weight:700;color:var(--grn)">₹${collected.toLocaleString('en-IN')}</td>
        <td style="padding:8px 12px;font-weight:700;color:${outstanding > 0 ? 'var(--red)' : 'var(--txt2)'}">₹${outstanding.toLocaleString('en-IN')}</td>
        <td style="padding:8px 12px">
          <div style="display:flex;align-items:center;gap:6px">
            <div style="flex:1;background:var(--bg);height:9px;border-radius:4px;overflow:hidden;min-width:55px">
              <div style="background:${ratePct >= 80 ? 'var(--grn)' : ratePct >= 50 ? 'var(--ylw)' : 'var(--red)'};height:100%;width:${ratePct}%"></div>
            </div>
            <span style="font-size:11.5px;font-weight:600;min-width:32px">${expected > 0 || collected > 0 ? ratePct + '%' : 'N/A'}</span>
          </div>
        </td>
        <td style="padding:8px 12px"><span class="chip ${statusChipClass}">${statusLabel}</span></td>
        <td style="padding:8px 12px">
          <button class="btn bo bsm" onclick="selectMonthForCollection('${mo}', ${yr})" title="Set fee collection form to this month">🔍 View Form</button>
        </td>
      </tr>`;
  });

  tb.innerHTML = rowsHtml;
}

function toggleMonthSummary(forceExpand = null) {
  const container = document.getElementById('monthSummaryContainer');
  const btn = document.getElementById('btnToggleMonthSummary');
  const icon = document.getElementById('sumToggleIcon');
  if (!container) return;

  const shouldExpand = (forceExpand !== null) ? forceExpand : (container.style.display === 'none' || container.style.display === '');
  if (shouldExpand) {
    container.style.display = 'block';
    if (btn) btn.innerHTML = '<span>✕ Hide Monthly Summary</span> <span id="sumToggleIcon">▲</span>';
  } else {
    container.style.display = 'none';
    if (btn) btn.innerHTML = '<span>👁 View Monthly Summary</span> <span id="sumToggleIcon">▼</span>';
  }
}

function selectMonthForCollection(mo, yr) {
  const mEl = document.getElementById('fe_mo');
  const yEl = document.getElementById('fe_yr');
  if (mEl) mEl.value = mo;
  if (yEl) yEl.value = yr;
  curSummaryMonthKey = `${mo}_${yr}`;

  // Keep summary synchronized and collapse the expanded table so user focuses on Fee Collection
  renderMonthWiseSummary();
  toggleMonthSummary(false);

  // Re-render fee collection form for the selected month and year
  renderFeD();

  // Smoothly focus or scroll down to the Fee Collection form controls
  const feeFormCard = document.getElementById('feesMainLayout')?.previousElementSibling || document.getElementById('fe_cl');
  if (feeFormCard && typeof feeFormCard.scrollIntoView === 'function') {
    feeFormCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // If student is not yet selected, guide the user to choose class and student
  if (!curFSid) {
    const clEl = document.getElementById('fe_cl');
    if (clEl && !clEl.value && clEl.options && clEl.options.length > 1) {
      clEl.focus?.();
    } else {
      const stEl = document.getElementById('fe_st');
      stEl?.focus?.();
    }
    toast(`Fee Collection loaded for ${mo} ${yr}. Select Class & Student to view monthly fee ledger.`, 'info');
  } else {
    const s = DB.students?.find(x => x.id === curFSid);
    const sName = s ? s.name : 'Selected student';
    toast(`Fee ledger updated for ${sName} for ${mo} ${yr}`, 'success');
  }
}

// ============================================================
// 6C. COMBINED PAYMENT (Multiple Months & Categories -> 1 Unique Receipt)
// ============================================================

function openCombinedPay(targetMonths = null, targetCategory = null) {
  if (!curFSid || curFSid === 'all') {
    toast('Please select an individual student to collect combined fee', 'info');
    return;
  }
  const s = DB.students.find(x => x.id === curFSid);
  if (!s) return;

  const c = s.cls;
  const struct = (DB.feeStructures && DB.feeStructures[c]) ? DB.feeStructures[c] : { tuition: 400, transport: 300, admission: 500, examFee: 200 };
  const cfg = getStudentFeeConfig(s.id);

  const curSess = (DB.settings && DB.settings.currentSession) || '2026–27';
  const [startY, endY] = parseSessionYears(curSess);

  const selMo = document.getElementById('fe_mo')?.value || 'April';
  const selYr = parseInt(document.getElementById('fe_yr')?.value) || startY;
  const selIdx = MONTHS_LIST.indexOf(selMo);

  // Check if admission fee already paid in active session
  const admAlreadyPaid = isAdmissionFeeAlreadyPaid(s.id, curSess);

  const schoolAmt = (cfg.customTuition !== null && cfg.customTuition !== undefined && cfg.customTuition !== '' && !isNaN(Number(cfg.customTuition)))
    ? Number(cfg.customTuition) : struct.tuition;
  const examAmt = (cfg.examFee !== null && cfg.examFee !== undefined && cfg.examFee !== '' && !isNaN(Number(cfg.examFee)))
    ? Number(cfg.examFee) : (struct.examFee || 200);
  const admAmt = (cfg.customAdmission !== null && cfg.customAdmission !== undefined && cfg.customAdmission !== '' && !isNaN(Number(cfg.customAdmission)))
    ? Number(cfg.customAdmission) : (struct.admission || 500);

  // Check how many unpaid months and categories exist for current session
  let eligibleUnpaidMonthsCount = 0;
  let monthsHtml = '';

  MONTHS_LIST.forEach((mo, mIdx) => {
    const yr = (mIdx < 9) ? startY : endY;
    const fees = initFeeLedger(s, mo, yr);

    const tuitionFee = fees.find(f => (f.type === 'School Fee' || f.type === 'Tuition Fee'));
    const isTuitionPaid = tuitionFee ? tuitionFee.paid : false;
    const schoolApplicable = cfg.tuition !== false;

    const isExamMonth = ['September', 'December', 'March'].includes(mo);
    const examFee = fees.find(f => f.type === 'Exam Fee');
    const isExamPaid = examFee ? examFee.paid : false;
    const examAlreadyPaid = isExamFeeAlreadyPaid(s.id, mo, yr);
    const examApplicable = isExamMonth && !examAlreadyPaid && (cfg.examEnabled !== false);

    const hasUnpaidSchool = schoolApplicable && !isTuitionPaid;
    const hasUnpaidExam = examApplicable && !isExamPaid;
    const allPaid = (!schoolApplicable || isTuitionPaid) && (!examApplicable || isExamPaid || examAlreadyPaid);

    if (hasUnpaidSchool || hasUnpaidExam) {
      eligibleUnpaidMonthsCount++;
    }

    const monthKey = `${mo}_${yr}`;
    let isChecked = false;
    if (targetMonths && Array.isArray(targetMonths)) {
      isChecked = targetMonths.includes(monthKey) && !allPaid;
    } else {
      // Preselect only currently due unpaid months up to selected month (inclusive)
      const isUpToSelected = (mIdx <= selIdx) && isFeeRecordCurrentlyDue(mo, yr, curSess);
      isChecked = isUpToSelected && !allPaid;
    }

    let moDuesText = [];
    if (hasUnpaidSchool) moDuesText.push(`School: ₹${schoolAmt}`);
    if (hasUnpaidExam) moDuesText.push(`Exam: ₹${examAmt}`);
    if (!moDuesText.length && (isTuitionPaid || isExamPaid || examAlreadyPaid)) moDuesText.push('Paid ✓');

    monthsHtml += `
      <label style="display:flex;align-items:center;gap:8px;padding:5px 8px;background:${allPaid ? '#fbfbfb' : '#fff'};border:1px solid ${allPaid ? '#e5e5e5' : 'var(--bdr)'};border-radius:5px;cursor:${allPaid ? 'default' : 'pointer'};margin-bottom:3px">
        <input type="checkbox" class="comb-month-chk" id="cm_${mIdx}" value="${monthKey}" ${allPaid ? 'disabled' : ''} ${isChecked ? 'checked' : ''} onchange="calcCombinedTotal()" style="width:14px;height:14px;accent-color:var(--red);flex-shrink:0">
        <div style="flex:1;display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <span style="font-weight:600;font-size:12px">${mo} ${yr}</span>
          ${isTuitionPaid ? '<span class="chip cg" style="font-size:9.5px;padding:1px 5px">✓ School Paid</span>' : ''}
          ${(isExamPaid || examAlreadyPaid) ? '<span class="chip cg" style="font-size:9.5px;padding:1px 5px">✓ Exam Paid</span>' : ''}
          ${allPaid ? '<span class="chip cgr" style="font-size:9.5px;padding:1px 5px">Fully Paid ✓</span>' : ''}
        </div>
        <div id="cm_dues_${mIdx}" style="font-size:11px;color:var(--txt2);font-weight:600;white-space:nowrap">
          ${moDuesText.join(' · ')}
        </div>
      </label>`;
  });

  const hasUnpaidAdmission = (!admAlreadyPaid && cfg.admission !== false);
  const prevArrearsList = getStudentPreviousArrearsBreakdown(s, curSess);
  const totalEligibleItems = eligibleUnpaidMonthsCount + (hasUnpaidAdmission ? 1 : 0) + prevArrearsList.length;

  // If student has NO eligible unpaid fees anywhere
  if (totalEligibleItems === 0) {
    document.getElementById('combPayB').innerHTML = `
      <div style="background:var(--gl);border:1px solid #a9dfbf;border-radius:8px;padding:16px;text-align:center;margin-bottom:12px">
        <div style="font-size:28px;margin-bottom:6px">🎉</div>
        <div style="font-weight:700;font-size:15px;color:var(--grn);margin-bottom:6px">All Applicable Fees Already Paid!</div>
        <div style="font-size:13px;color:var(--txt);line-height:1.5;max-width:540px;margin:0 auto">
          All applicable fees for <strong>${s.name}</strong> (Adm: ${s.admno}) are already fully paid for session <strong>${curSess}</strong>.
        </div>
        <div style="margin-top:12px;font-size:12px;color:var(--txt2)">
          To reprint an earlier receipt, open <strong>Student Payment History</strong> and click the <strong>🖨 A4</strong> button for the existing receipt.
        </div>
      </div>
      <div style="text-align:center;margin-top:10px">
        <button class="btn bo" onclick="closeM('combPayM')">Close</button>
      </div>`;

    const confirmBtn = document.getElementById('combPayConfirmBtn');
    if (confirmBtn) confirmBtn.style.display = 'none';
    const grandBadge = document.getElementById('combGrandTotalBadge');
    if (grandBadge) grandBadge.style.display = 'none';
    openM('combPayM');
    return;
  }

  // Restore confirm button and grand badge visibility
  const confirmBtn = document.getElementById('combPayConfirmBtn');
  if (confirmBtn) {
    confirmBtn.style.display = 'inline-flex';
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '✓ Confirm Combined Payment (1 Receipt)';
  }
  const grandBadge = document.getElementById('combGrandTotalBadge');
  if (grandBadge) grandBadge.style.display = 'block';

  const includeSchool = targetCategory ? (targetCategory === 'School Fee') : (cfg.tuition !== false);
  const includeExam = targetCategory ? (targetCategory === 'Exam Fee') : (cfg.examEnabled !== false);
  const includeAdm = targetCategory ? (targetCategory === 'Admission Fee') : (!admAlreadyPaid && cfg.admission !== false);

  // Previous arrears block (unselected by default)
  let prevArrearsHtml = '';
  if (prevArrearsList.length > 0) {
    prevArrearsHtml = `
      <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:6px;padding:6px 10px;margin-bottom:8px">
        <div style="font-size:11px;font-weight:700;color:#c2410c;margin-bottom:4px">📜 Carried-Forward Previous Session Arrears (Optional):</div>
        ${prevArrearsList.map((arrItem, idx) => `
          <label style="display:flex;align-items:center;gap:8px;padding:4px 6px;background:#fff;border:1px solid #fed7aa;border-radius:5px;cursor:pointer;margin-bottom:3px;font-size:11.5px">
            <input type="checkbox" class="comb-arrears-chk" id="cp_arr_${idx}" data-idx="${idx}" data-session="${arrItem.session}" data-cat="${arrItem.category}" data-period="${arrItem.period}" data-amount="${arrItem.remainingAmount}" data-source="${arrItem.source}" onchange="calcCombinedTotal()" style="accent-color:#c2410c;width:14px;height:14px">
            <div style="flex:1">
              <strong>Session ${arrItem.session}:</strong> ${arrItem.period} (${arrItem.category})
            </div>
            <div style="font-weight:700;color:#c2410c;white-space:nowrap">₹${arrItem.remainingAmount.toLocaleString('en-IN')}</div>
          </label>
        `).join('')}
      </div>`;
  }

  const advBalance = getStudentAdvanceBalance(s.id);
  let advBalHtml = '';
  if (advBalance > 0) {
    advBalHtml = `
      <div style="background:var(--gl);border:1px solid #a9dfbf;border-radius:6px;padding:5px 8px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:10.5px;color:var(--grn);font-weight:700">Available Advance Credit: ₹${advBalance.toLocaleString('en-IN')}</div>
          <div style="font-size:9.5px;color:var(--txt2)">Auto-adjust towards this combined payment</div>
        </div>
        <label style="display:flex;align-items:center;gap:6px;font-size:11px;font-weight:600;cursor:pointer">
          <input type="checkbox" id="cp_use_advance" checked onchange="calcCombinedTotal()" style="width:14px;height:14px;accent-color:var(--grn)"> Apply Advance
        </label>
      </div>`;
  }

  document.getElementById('combPayB').innerHTML = `
    <!-- SECTION A: Student Information -->
    <div style="background:var(--bg);border:1px solid var(--bdr);border-radius:7px;padding:7px 12px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-weight:700;font-size:13px;color:var(--txt)">
          ${s.name} <span style="font-weight:500;color:var(--txt2);font-size:11.5px">(Adm: ${s.admno}${s.roll ? ' · Roll: ' + s.roll : ''})</span>
        </div>
        <div style="font-size:11px;color:var(--txt2)">
          Class: <strong>${clL(s.cls)}</strong> (${s.section || 'A'}) · Active Session: <strong>${curSess}</strong>
        </div>
      </div>
      <div style="text-align:right">
        <span class="chip cb2" style="font-size:10.5px;font-weight:600">1 Unique Master Receipt</span>
      </div>
    </div>

    <!-- SECTION B: Fee Categories -->
    <div style="background:#fff;border:1px solid var(--bdr);border-radius:7px;padding:8px 12px;margin-bottom:8px">
      <div style="font-size:11px;font-weight:700;color:var(--txt);margin-bottom:5px;display:flex;justify-content:space-between;align-items:center">
        <span>Fee Categories to Include:</span>
        <span style="font-size:9.5px;color:var(--txt2);font-weight:500">Edit rates for this payment if required</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
        <div style="background:var(--bg);padding:5px 8px;border-radius:5px;border:1px solid var(--bdr)">
          <label style="display:flex;align-items:center;gap:6px;font-size:11.5px;font-weight:600;cursor:pointer">
            <input type="checkbox" id="cp_cat_school" ${includeSchool ? 'checked' : ''} onchange="updateCombCategoryStatus()" style="accent-color:var(--red)"> School Fee
          </label>
          <div style="margin-top:3px;display:flex;align-items:center;gap:4px">
            <span style="font-size:11px;color:var(--txt2)">₹</span>
            <input type="number" id="cp_amt_school" value="${schoolAmt}" min="0" oninput="calcCombinedTotal()" style="width:100%;border:1px solid var(--bdr);border-radius:4px;padding:2px 6px;font-size:11.5px;font-weight:600">
          </div>
          <div id="cp_school_hint" style="font-size:9.5px;color:var(--txt2);margin-top:2px">Monthly Tuition (Configured: ₹${schoolAmt})</div>
        </div>

        <div style="background:var(--bg);padding:5px 8px;border-radius:5px;border:1px solid var(--bdr)">
          <label style="display:flex;align-items:center;gap:6px;font-size:11.5px;font-weight:600;cursor:pointer">
            <input type="checkbox" id="cp_cat_exam" ${includeExam ? 'checked' : ''} onchange="updateCombCategoryStatus()" style="accent-color:var(--red)"> Exam Fee
          </label>
          <div style="margin-top:3px;display:flex;align-items:center;gap:4px">
            <span style="font-size:11px;color:var(--txt2)">₹</span>
            <input type="number" id="cp_amt_exam" value="${examAmt}" min="0" oninput="calcCombinedTotal()" style="width:100%;border:1px solid var(--bdr);border-radius:4px;padding:2px 6px;font-size:11.5px;font-weight:600">
          </div>
          <div style="font-size:9.5px;color:var(--txt2);margin-top:2px">Sep, Dec, Mar</div>
        </div>

        <div style="background:var(--bg);padding:5px 8px;border-radius:5px;border:1px solid var(--bdr);${admAlreadyPaid ? 'opacity:0.65' : ''}">
          <label style="display:flex;align-items:center;gap:6px;font-size:11.5px;font-weight:600;cursor:${admAlreadyPaid ? 'default' : 'pointer'}">
            <input type="checkbox" id="cp_cat_admission" ${includeAdm ? 'checked' : ''} ${admAlreadyPaid ? 'disabled' : ''} onchange="updateCombCategoryStatus()" style="accent-color:var(--red)"> Admission Fee (1x)
          </label>
          <div style="margin-top:3px;display:flex;align-items:center;gap:4px">
            <span style="font-size:11px;color:var(--txt2)">₹</span>
            <input type="number" id="cp_amt_admission" value="${admAmt}" min="0" ${admAlreadyPaid ? 'disabled' : ''} oninput="calcCombinedTotal()" style="width:100%;border:1px solid var(--bdr);border-radius:4px;padding:2px 6px;font-size:11.5px;font-weight:600">
          </div>
          <div style="font-size:9.5px;color:${admAlreadyPaid ? 'var(--grn)' : 'var(--txt2)'};margin-top:2px;font-weight:${admAlreadyPaid ? '600' : 'normal'}">
            ${admAlreadyPaid ? '✓ Paid in Session' : 'One-time fee'}
          </div>
        </div>
      </div>
    </div>

    <!-- SECTION C: Unpaid Months Selection -->
    <div style="margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <div style="font-size:11px;font-weight:700;color:var(--txt)">
          Unpaid Months (${eligibleUnpaidMonthsCount} Unpaid Month(s) Available):
        </div>
        <div style="display:flex;gap:6px">
          <button type="button" class="btn bo bsm" onclick="selectAllCombMonths()" style="font-size:10.5px;padding:2px 7px">Select All Unpaid</button>
          <button type="button" class="btn bo bsm" onclick="clearAllCombMonths()" style="font-size:10.5px;padding:2px 7px">Clear All</button>
        </div>
      </div>

      ${prevArrearsHtml}

      <div style="max-height:125px;overflow-y:auto;border:1px solid var(--bdr);border-radius:6px;padding:5px 8px;background:#fff">
        ${monthsHtml}
      </div>
    </div>

    <!-- SECTION D: Payment Details & Adjustments -->
    <div style="background:var(--bg);border:1px solid var(--bdr);border-radius:7px;padding:8px 12px;margin-bottom:4px">
      <div style="font-size:11px;font-weight:700;color:var(--txt);margin-bottom:5px">
        Payment Details & Adjustments:
      </div>

      <div style="background:#fff;border:1px solid var(--bdr);border-radius:5px;padding:5px 8px;margin-bottom:6px">
        <div style="font-size:10px;font-weight:700;color:var(--txt2);margin-bottom:2px;text-transform:uppercase">Itemized Allocation Preview:</div>
        <div id="combBreakdownPreview" style="font-size:11px;color:var(--txt2);max-height:50px;overflow-y:auto">Select unpaid months above to view itemized breakdown</div>
      </div>

      <div class="g2" style="gap:8px;margin-bottom:6px">
        <div class="fg" style="margin-bottom:0">
          <label style="font-size:10.5px;font-weight:600">Late Fee (₹)</label>
          <input type="number" id="cp_late_fee" value="0" min="0" oninput="calcCombinedTotal()" style="padding:3px 7px;font-size:11.5px;background:#fff">
        </div>
        <div class="fg" style="margin-bottom:0">
          <label style="font-size:10.5px;font-weight:600">Concession / Discount</label>
          <select id="cp_disc_type" onchange="calcCombinedTotal()" style="padding:3px 7px;font-size:11.5px;background:#fff">
            <option value="none">No Discount</option>
            <option value="fixed">Fixed Amount (₹)</option>
            <option value="percent">Percentage (%)</option>
          </select>
        </div>
      </div>

      <div id="cp_disc_details" style="display:none;background:#fff;border:1px solid var(--bdr);border-radius:6px;padding:6px 8px;margin-bottom:6px">
        <div class="g2" style="gap:8px;margin-bottom:4px">
          <div class="fg" style="margin-bottom:0">
            <label style="font-size:10px;font-weight:600">Discount Value</label>
            <input type="number" id="cp_disc_val" value="0" min="0" oninput="calcCombinedTotal()" style="padding:3px 6px;font-size:11.5px">
          </div>
          <div class="fg" style="margin-bottom:0">
            <label style="font-size:10px;font-weight:600">Concession Reason *</label>
            <input type="text" id="cp_disc_reason" placeholder="e.g. Sibling Discount / Staff" style="padding:3px 6px;font-size:11.5px">
          </div>
        </div>
        <label style="display:flex;align-items:center;gap:6px;font-size:10.5px;font-weight:600;cursor:pointer">
          <input type="checkbox" id="cp_disc_auth" checked style="accent-color:var(--grn)">
          Principal / Admin Authorized (${DB.settings?.principalName || 'Tanmay Soni'})
        </label>
      </div>

      ${advBalHtml}

      <div class="g2" style="gap:8px;margin-bottom:6px">
        <div class="fg" style="margin-bottom:0">
          <label style="font-size:10.5px;font-weight:600">Payment Date</label>
          <input type="date" id="cp_dt" value="${new Date().toISOString().split('T')[0]}" style="padding:3px 7px;font-size:11.5px;background:#fff">
        </div>
        <div class="fg" style="margin-bottom:0">
          <label style="font-size:10.5px;font-weight:600">Payment Mode</label>
          <select id="cp_md" style="padding:3px 7px;font-size:11.5px;background:#fff">
            <option>Cash</option>
            <option>UPI</option>
            <option>Bank Transfer</option>
            <option>Cheque</option>
            <option>Other</option>
          </select>
        </div>
      </div>

      <div style="background:#fff;border:1px solid var(--bdr);border-radius:6px;padding:6px 10px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-size:10px;font-weight:600;color:var(--txt2)">Net Payable Amount:</div>
            <div style="font-size:15px;font-weight:700;color:var(--red)" id="cp_net_payable">₹0</div>
          </div>
          <div style="text-align:right">
            <label style="font-size:10.5px;font-weight:700;display:block;margin-bottom:2px">Amount Received (₹):</label>
            <input type="number" id="cp_amt_received" value="0" min="0" oninput="calcCombinedTotal(true)" style="width:115px;padding:3px 6px;font-size:14px;font-weight:700;border:1.5px solid var(--grn);border-radius:4px;text-align:right;background:#f0fdf4">
          </div>
        </div>
        <div id="cp_feedback_banner" style="margin-top:4px;font-size:10.5px;font-weight:600;padding-top:3px;border-top:1px dashed var(--bdr)"></div>
      </div>
    </div>`;

  openM('combPayM');
  calcCombinedTotal();
}

function updateCombCategoryStatus() {
  calcCombinedTotal();
}

function selectAllCombMonths() {
  document.querySelectorAll('.comb-month-chk:not(:disabled)').forEach(el => {
    el.checked = true;
  });
  calcCombinedTotal();
}

function clearAllCombMonths() {
  document.querySelectorAll('.comb-month-chk:not(:disabled)').forEach(el => {
    el.checked = false;
  });
  document.querySelectorAll('.comb-arrears-chk').forEach(el => {
    el.checked = false;
  });
  calcCombinedTotal();
}

function calcCombinedTotal(manualReceived = false) {
  if (!curFSid || curFSid === 'all') return;
  const s = DB.students.find(x => x.id === curFSid);
  if (!s) return;

  const curSess = (DB.settings && DB.settings.currentSession) || '2026–27';
  const [startY, endY] = parseSessionYears(curSess);

  const incSchool = document.getElementById('cp_cat_school')?.checked || false;
  const incExam = document.getElementById('cp_cat_exam')?.checked || false;
  const incAdm = document.getElementById('cp_cat_admission')?.checked || false;

  const schoolAmt = Math.max(0, parseFloat(document.getElementById('cp_amt_school')?.value) || 0);
  const examAmt = Math.max(0, parseFloat(document.getElementById('cp_amt_exam')?.value) || 0);
  const admAmt = Math.max(0, parseFloat(document.getElementById('cp_amt_admission')?.value) || 0);

  // Update School Fee rate hint if edited
  const hintEl = document.getElementById('cp_school_hint');
  const origCfg = getStudentFeeConfig(s.id);
  const struct = (DB.feeStructures && DB.feeStructures[s.cls]) ? DB.feeStructures[s.cls] : { tuition: 400 };
  const origSchool = (origCfg.customTuition !== null && origCfg.customTuition !== undefined && origCfg.customTuition !== '' && !isNaN(Number(origCfg.customTuition)))
    ? Number(origCfg.customTuition) : struct.tuition;
  if (hintEl) {
    if (schoolAmt !== origSchool) {
      hintEl.innerHTML = `<span style="color:var(--blu);font-weight:700">Custom payment rate</span> (Configured: ₹${origSchool})`;
    } else {
      hintEl.textContent = `Monthly Tuition (Configured: ₹${origSchool})`;
    }
  }

  // Update dynamic dues text on each month row in Section C
  MONTHS_LIST.forEach((mo, mIdx) => {
    const yr = (mIdx < 9) ? startY : endY;
    const duesEl = document.getElementById(`cm_dues_${mIdx}`);
    if (!duesEl) return;

    const fees = initFeeLedger(s, mo, yr);
    const tuitionFee = fees.find(f => (f.type === 'School Fee' || f.type === 'Tuition Fee'));
    const isTuitionPaid = tuitionFee ? tuitionFee.paid : false;

    const isExamMonth = ['September', 'December', 'March'].includes(mo);
    const exFee = fees.find(f => f.type === 'Exam Fee');
    const isExamPaid = (exFee && exFee.paid) || isExamFeeAlreadyPaid(s.id, mo, yr);

    let moDuesText = [];
    if (!isTuitionPaid && incSchool) {
      moDuesText.push(`School: ₹${schoolAmt}`);
    }
    if (isExamMonth && !isExamPaid && incExam) {
      moDuesText.push(`Exam: ₹${examAmt}`);
    }

    if (!moDuesText.length) {
      if (isTuitionPaid || isExamPaid) {
        moDuesText.push('Paid ✓');
      } else {
        moDuesText.push('–');
      }
    }

    duesEl.textContent = moDuesText.join(' · ');
  });

  let selectedItems = [];
  let baseSubtotal = 0;

  // 1. Previous Session Arrears (if checked)
  const checkedArrearsBoxes = Array.from(document.querySelectorAll('.comb-arrears-chk:checked'));
  checkedArrearsBoxes.forEach(box => {
    const remAmt = parseFloat(box.getAttribute?.('data-amount')) || 0;
    if (remAmt > 0) {
      selectedItems.push({
        isPreviousArrears: true,
        source: box.getAttribute?.('data-source') || 'config',
        session: box.getAttribute?.('data-session') || '',
        month: box.getAttribute?.('data-period') || 'Arrears',
        year: 0,
        type: box.getAttribute?.('data-cat') || 'Previous Session Arrears',
        baseAmount: remAmt
      });
      baseSubtotal += remAmt;
    }
  });

  // 2. Selected Current Session Months
  const checkedMonthBoxes = Array.from(document.querySelectorAll('.comb-month-chk:checked:not(:disabled)'));
  checkedMonthBoxes.forEach(box => {
    const parts = box.value.split('_');
    const mo = parts[0], yr = parseInt(parts[1]);
    const fees = initFeeLedger(s, mo, yr);

    // School Fee
    if (incSchool) {
      const tuitionFee = fees.find(f => (f.type === 'School Fee' || f.type === 'Tuition Fee'));
      const isSchoolPaid = tuitionFee ? tuitionFee.paid : false;
      if (!isSchoolPaid) {
        const amt = tuitionFee
          ? (tuitionFee.partialRemaining !== undefined ? Number(tuitionFee.partialRemaining) : (schoolAmt - (Number(tuitionFee.partialPaid) || 0)))
          : schoolAmt;
        selectedItems.push({ month: mo, year: yr, type: 'School Fee', baseAmount: amt });
        baseSubtotal += amt;
      }
    }

    // Exam Fee (for September, December, March)
    if (incExam && ['September', 'December', 'March'].includes(mo)) {
      const exFee = fees.find(f => f.type === 'Exam Fee');
      const isExamPaid = (exFee && exFee.paid) || isExamFeeAlreadyPaid(s.id, mo, yr);
      if (!isExamPaid) {
        const amt = exFee
          ? (exFee.partialRemaining !== undefined ? Number(exFee.partialRemaining) : (examAmt - (Number(exFee.partialPaid) || 0)))
          : examAmt;
        selectedItems.push({ month: mo, year: yr, type: 'Exam Fee', baseAmount: amt });
        baseSubtotal += amt;
      }
    }
  });

  // 3. Admission Fee (One-Time per active session, mapped to April startY)
  if (incAdm) {
    const admFees = initFeeLedger(s, 'April', startY);
    const admObj = admFees.find(f => f.type === 'Admission Fee');
    const isPaid = admObj ? admObj.paid : false;
    if (!isPaid) {
      const amt = admObj
        ? (admObj.partialRemaining !== undefined ? Number(admObj.partialRemaining) : (admAmt - (Number(admObj.partialPaid) || 0)))
        : admAmt;
      selectedItems.push({ month: 'April', year: startY, type: 'Admission Fee', baseAmount: amt });
      baseSubtotal += amt;
    }
  }

  // Late Fee, Discount, Advance Credit
  const lateFee = Math.max(0, parseFloat(document.getElementById('cp_late_fee')?.value) || 0);
  const discType = document.getElementById('cp_disc_type')?.value || 'none';
  const discVal = Math.max(0, parseFloat(document.getElementById('cp_disc_val')?.value) || 0);
  const discDetailsEl = document.getElementById('cp_disc_details');
  if (discDetailsEl) {
    discDetailsEl.style.display = (discType !== 'none') ? 'block' : 'none';
  }

  let discAmt = 0;
  if (discType === 'fixed') {
    discAmt = Math.min(baseSubtotal, discVal);
  } else if (discType === 'percent') {
    discAmt = Math.min(baseSubtotal, Math.round((baseSubtotal * Math.min(100, discVal)) / 100));
  }

  let subtotal = baseSubtotal + lateFee - discAmt;
  let advBal = getStudentAdvanceBalance(s.id);
  let advApplied = 0;
  const useAdv = document.getElementById('cp_use_advance')?.checked || false;
  if (useAdv && advBal > 0) {
    advApplied = Math.min(advBal, subtotal);
  }

  const netPayable = Math.max(0, subtotal - advApplied);

  const netPayEl = document.getElementById('cp_net_payable');
  if (netPayEl) netPayEl.textContent = '₹' + netPayable.toLocaleString('en-IN');

  const amtReceivedInp = document.getElementById('cp_amt_received');
  if (amtReceivedInp && !manualReceived) {
    amtReceivedInp.value = netPayable;
  }

  const validReceived = amtReceivedInp ? (parseFloat(amtReceivedInp.value) || 0) : netPayable;
  const feedbackEl = document.getElementById('cp_feedback_banner');
  if (feedbackEl) {
    if (validReceived < netPayable) {
      feedbackEl.style.color = '#d35400';
      feedbackEl.textContent = `⚠️ Partial Payment: Remaining balance ₹${(netPayable - validReceived).toLocaleString('en-IN')} will stay due.`;
    } else if (validReceived > netPayable) {
      feedbackEl.style.color = 'var(--grn)';
      feedbackEl.textContent = `ℹ Overpayment: Excess ₹${(validReceived - netPayable).toLocaleString('en-IN')} will be credited to Student Advance Credit.`;
    } else {
      feedbackEl.style.color = 'var(--grn)';
      feedbackEl.textContent = '✓ Full payment confirmed.';
    }
  }

  // Update Footer UI
  const grandBadge = document.getElementById('combGrandTotalBadge');
  const previewEl = document.getElementById('combBreakdownPreview');
  const confirmBtn = document.getElementById('combPayConfirmBtn');

  if (grandBadge) {
    grandBadge.textContent = `Base Subtotal: ₹${baseSubtotal.toLocaleString('en-IN')} (${selectedItems.length} item${selectedItems.length !== 1 ? 's' : ''})`;
  }

  if (confirmBtn) {
    confirmBtn.disabled = (baseSubtotal === 0 || selectedItems.length === 0);
  }

  if (previewEl) {
    if (!selectedItems.length) {
      previewEl.innerHTML = '<span style="color:var(--txt2)">Select unpaid billing months above to see itemized breakdown</span>';
    } else {
      const monthsMap = {};
      selectedItems.forEach(it => {
        const k = it.isPreviousArrears ? `Arrears (${it.session})` : (it.type === 'Admission Fee' ? 'Admission Fee' : `${it.month} ${it.year}`);
        if (!monthsMap[k]) monthsMap[k] = [];
        monthsMap[k].push(it);
      });

      previewEl.innerHTML = Object.entries(monthsMap).map(([mName, arr]) => {
        const sub = arr.reduce((a, it) => a + it.baseAmount, 0);
        return `<div style="display:flex;justify-content:space-between;padding:2px 0;border-bottom:1px solid #f0f0f0">
          <span><strong>${mName}:</strong> ${arr.map(a => a.type).join(' + ')}</span>
          <span style="font-weight:600">₹${sub.toLocaleString('en-IN')}</span>
        </div>`;
      }).join('');
    }
  }
}

function procCombinedPay() {
  if (isCommittingPayment) return;
  if (!curFSid || curFSid === 'all') {
    toast('Please select an individual student first', 'warning');
    return;
  }
  const s = DB.students.find(x => x.id === curFSid);
  if (!s) return;

  const curSess = (DB.settings && DB.settings.currentSession) || '2026–27';
  const [startY] = parseSessionYears(curSess);

  const dt = document.getElementById('cp_dt')?.value || new Date().toISOString().split('T')[0];
  const md = document.getElementById('cp_md')?.value || 'Cash';

  const incSchool = document.getElementById('cp_cat_school')?.checked || false;
  const incExam = document.getElementById('cp_cat_exam')?.checked || false;
  const incAdm = document.getElementById('cp_cat_admission')?.checked || false;

  const schoolAmt = Math.max(0, parseFloat(document.getElementById('cp_amt_school')?.value) || 0);
  const examAmt = Math.max(0, parseFloat(document.getElementById('cp_amt_exam')?.value) || 0);
  const admAmt = Math.max(0, parseFloat(document.getElementById('cp_amt_admission')?.value) || 0);

  let selectedItems = [];
  let baseSubtotal = 0;

  // 1. Previous Arrears
  const checkedArrearsBoxes = Array.from(document.querySelectorAll('.comb-arrears-chk:checked'));
  checkedArrearsBoxes.forEach(box => {
    const remAmt = parseFloat(box.getAttribute?.('data-amount')) || 0;
    if (remAmt > 0) {
      selectedItems.push({
        isPreviousArrears: true,
        source: box.getAttribute?.('data-source') || 'config',
        session: box.getAttribute?.('data-session') || '',
        month: box.getAttribute?.('data-period') || 'Arrears',
        year: 0,
        type: box.getAttribute?.('data-cat') || 'Previous Session Arrears',
        baseAmount: remAmt
      });
      baseSubtotal += remAmt;
    }
  });

  // 2. Current Session Months
  const checkedMonthBoxes = Array.from(document.querySelectorAll('.comb-month-chk:checked:not(:disabled)'));
  checkedMonthBoxes.forEach(box => {
    const parts = box.value.split('_');
    const mo = parts[0], yr = parseInt(parts[1]);
    const fees = initFeeLedger(s, mo, yr);

    // School Fee
    if (incSchool) {
      const tuitionFee = fees.find(f => (f.type === 'School Fee' || f.type === 'Tuition Fee'));
      const isSchoolPaid = tuitionFee ? tuitionFee.paid : false;
      if (!isSchoolPaid) {
        const amt = tuitionFee
          ? (tuitionFee.partialRemaining !== undefined ? Number(tuitionFee.partialRemaining) : (schoolAmt - (Number(tuitionFee.partialPaid) || 0)))
          : schoolAmt;
        selectedItems.push({ month: mo, year: yr, type: 'School Fee', baseAmount: amt });
        baseSubtotal += amt;
      }
    }

    // Exam Fee (for September, December, March)
    if (incExam && ['September', 'December', 'March'].includes(mo)) {
      const exFee = fees.find(f => f.type === 'Exam Fee');
      const isExamPaid = (exFee && exFee.paid) || isExamFeeAlreadyPaid(s.id, mo, yr);
      if (!isExamPaid) {
        const amt = exFee
          ? (exFee.partialRemaining !== undefined ? Number(exFee.partialRemaining) : (examAmt - (Number(exFee.partialPaid) || 0)))
          : examAmt;
        selectedItems.push({ month: mo, year: yr, type: 'Exam Fee', baseAmount: amt });
        baseSubtotal += amt;
      }
    }
  });

  // 3. Admission Fee
  if (incAdm) {
    const admFees = initFeeLedger(s, 'April', startY);
    const admObj = admFees.find(f => f.type === 'Admission Fee');
    const isPaid = admObj ? admObj.paid : false;
    if (!isPaid) {
      const amt = admObj
        ? (admObj.partialRemaining !== undefined ? Number(admObj.partialRemaining) : (admAmt - (Number(admObj.partialPaid) || 0)))
        : admAmt;
      selectedItems.push({ month: 'April', year: startY, type: 'Admission Fee', baseAmount: amt });
      baseSubtotal += amt;
    }
  }

  if (selectedItems.length === 0 || baseSubtotal === 0) {
    toast('No unpaid fees were selected for payment!', 'warning');
    return;
  }

  // Late fee & Concession validation
  const lateFee = Math.max(0, parseFloat(document.getElementById('cp_late_fee')?.value) || 0);
  const discType = document.getElementById('cp_disc_type')?.value || 'none';
  const discVal = Math.max(0, parseFloat(document.getElementById('cp_disc_val')?.value) || 0);
  const discReason = document.getElementById('cp_disc_reason')?.value.trim() || '';
  const discAuth = document.getElementById('cp_disc_auth')?.checked || false;

  let discAmt = 0;
  if (discType === 'fixed') {
    discAmt = Math.min(baseSubtotal, discVal);
  } else if (discType === 'percent') {
    discAmt = Math.min(baseSubtotal, Math.round((baseSubtotal * Math.min(100, discVal)) / 100));
  }

  if (discAmt > 0 && !discReason) {
    toast('Please enter a concession / discount reason!', 'error');
    document.getElementById('cp_disc_reason')?.focus();
    return;
  }
  if (discAmt > 0 && !discAuth) {
    toast('Discount requires Principal / Admin authorization approval!', 'error');
    return;
  }

  let subtotal = baseSubtotal + lateFee - discAmt;
  let advBal = getStudentAdvanceBalance(s.id);
  let advApplied = 0;
  const useAdv = document.getElementById('cp_use_advance')?.checked || false;
  if (useAdv && advBal > 0) {
    advApplied = Math.min(advBal, subtotal);
  }

  const netPayable = Math.max(0, subtotal - advApplied);
  const amtReceivedVal = parseFloat(document.getElementById('cp_amt_received')?.value);
  const amtReceived = (!isNaN(amtReceivedVal) && amtReceivedVal >= 0) ? amtReceivedVal : netPayable;

  const confirmBtn = document.getElementById('combPayConfirmBtn');
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '⏳ Processing Payment...';
  }
  isCommittingPayment = true;

  try {
    const masterReceiptNo = getNextReceiptNumber();
    const cfg = getStudentFeeConfig(s.id);

    // 1. Sequentially allocate effective credit across selected items only
    let effectiveAllocatable = amtReceived + advApplied + discAmt;
    selectedItems.forEach(it => {
      if (it.isPreviousArrears) {
        const amtNeeded = it.baseAmount;
        const cov = Math.min(effectiveAllocatable, amtNeeded);
        effectiveAllocatable -= cov;
        if (it.source === 'config') {
          cfg.previousArrears = Math.max(0, (Number(cfg.previousArrears) || 0) - cov);
        } else if (it.source === 'fee_record') {
          Object.entries(DB.fees || {}).forEach(([k, arr]) => {
            if (!k.startsWith(s.id + '_') || !Array.isArray(arr)) return;
            arr.forEach(f => {
              if (f.type === it.type && !f.paid) {
                if (cov >= amtNeeded) {
                  f.paid = true;
                  f.partialPaid = f.amount;
                  f.partialRemaining = 0;
                  f.receiptNo = masterReceiptNo;
                } else if (cov > 0) {
                  f.paid = false;
                  f.partialPaid = (Number(f.partialPaid) || 0) + cov;
                  f.partialRemaining = (Number(f.amount) || 0) - f.partialPaid;
                  f.receiptNo = masterReceiptNo;
                }
              }
            });
          });
        }
      } else {
        const key = `${s.id}_${it.month}_${it.year}`;
        if (!DB.fees[key]) DB.fees[key] = [];
        let f = DB.fees[key].find(x => x.type === it.type);
        if (!f) {
          f = { type: it.type, amount: it.baseAmount, paid: false, date: '', receiptNo: '', enabled: true };
          DB.fees[key].push(f);
        }
        f.date = dt;
        f.mode = md;

        const fullFee = Number(f.amount) || Number(it.baseAmount) || 0;
        const priorPaid = (f.partialPaid !== undefined && f.partialPaid !== null) ? Number(f.partialPaid) : (f.paid ? fullFee : 0);
        const allocatedForThis = Math.min(it.baseAmount, effectiveAllocatable);
        const newTotalPaid = priorPaid + allocatedForThis;

        if (newTotalPaid >= fullFee && fullFee > 0) {
          f.paid = true;
          f.partialPaid = fullFee;
          f.partialRemaining = 0;
          f.receiptNo = masterReceiptNo;
          effectiveAllocatable -= allocatedForThis;
        } else if (allocatedForThis > 0) {
          f.paid = false;
          f.partialPaid = newTotalPaid;
          f.partialRemaining = Math.max(0, fullFee - newTotalPaid);
          f.receiptNo = masterReceiptNo;
          effectiveAllocatable -= allocatedForThis;
        } else {
          f.paid = false;
          f.partialPaid = priorPaid;
          f.partialRemaining = Math.max(0, fullFee - priorPaid);
        }
      }
    });

    // 2. Adjust Advance Credit Balance
    const excessAdvance = Math.max(0, amtReceived - netPayable);
    if (advApplied > 0) {
      cfg.advanceBalance = Math.max(0, (Number(cfg.advanceBalance) || 0) - advApplied);
    }
    if (excessAdvance > 0) {
      cfg.advanceBalance = (Number(cfg.advanceBalance) || 0) + excessAdvance;
    }

    // 3. Save exactly 1 master audit record in DB.payments with grouped period label
    if (!DB.payments) DB.payments = [];
    const groupedItems = groupReceiptItems(selectedItems);
    const distinctCategories = [...new Set(selectedItems.map(it => it.type))];
    const periodLabel = groupedItems.map(it => `${it.type} (${it.period})`).join(', ');

    DB.payments.push({
      receiptNo: masterReceiptNo,
      studentId: s.id,
      studentName: s.name,
      admno: s.admno,
      cls: s.cls,
      section: s.section || 'A',
      amount: amtReceived,
      baseSubtotal: baseSubtotal,
      lateFee: lateFee,
      discountAmt: discAmt,
      discountType: discType,
      discountReason: discReason,
      discountAuthorizedBy: discAmt > 0 ? (DB.settings?.principalName || 'Tanmay Soni') : '',
      advanceApplied: advApplied,
      excessAdvance: excessAdvance,
      mode: md,
      date: dt,
      category: distinctCategories.join(' + '),
      period: periodLabel,
      session: curSess,
      items: selectedItems,
      reversed: false,
      voidReason: '',
      voidDate: ''
    });

    saveDB(true);
    closeM('combPayM');

    renderFeD();
    logActivity('Payment Recorded', `Combined payment of ₹${amtReceived} for ${s.name} (Receipt #${masterReceiptNo})`);
    toast(`Payment confirmed successfully! Receipt #${masterReceiptNo}`, 'success');

    // Automatically open official receipt modal
    showReceiptModal(masterReceiptNo);
  } catch (err) {
    console.error('Combined payment commit error:', err);
    toast('Error recording combined payment: ' + (err.message || 'Unknown error'), 'error');
  } finally {
    isCommittingPayment = false;
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = '✓ Confirm Combined Payment (1 Receipt)';
    }
  }
}

function openAdvPay() {
  if (!curFSid) {
    toast('Select a student first', 'warning');
    return;
  }
  const s = DB.students.find(x => x.id === curFSid);
  const c = s.cls;
  const struct = (DB.feeStructures && DB.feeStructures[c]) ? DB.feeStructures[c] : { tuition: 400, transport: 300, admission: 500 };
  const cfg = getStudentFeeConfig(s.id);
  const curSess = s.session || (DB.settings && DB.settings.currentSession) || '2026–27';
  const tuitionAmt = (cfg.customTuition !== null && cfg.customTuition !== undefined && cfg.customTuition !== '' && !isNaN(Number(cfg.customTuition)))
    ? Number(cfg.customTuition) : struct.tuition;
  const admAmt = (cfg.customAdmission !== null && cfg.customAdmission !== undefined && cfg.customAdmission !== '' && !isNaN(Number(cfg.customAdmission)))
    ? Number(cfg.customAdmission) : (struct.admission || 500);
  const admAlreadyPaid = isAdmissionFeeAlreadyPaid(s.id, curSess);

  const curMo = document.getElementById('fe_mo')?.value || 'April';
  const curYr = parseInt(document.getElementById('fe_yr')?.value) || 2026;
  const startIdx = MONTHS_LIST.indexOf(curMo) >= 0 ? MONTHS_LIST.indexOf(curMo) : 0;

  // Build 12 months starting from selected month
  let monthsHtml = '';
  for (let i = 0; i < 12; i++) {
    const mIdx = (startIdx + i) % 12;
    const mo = MONTHS_LIST[mIdx];
    const yr = (mIdx < startIdx) ? curYr + 1 : curYr;
    const key = `${curFSid}_${mo}_${yr}`;
    const fees = DB.fees[key] || [];
    const tuitionPaid = fees.find(f => (f.type === 'School Fee' || f.type === 'Tuition Fee') && f.paid);

    monthsHtml += `
      <label style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:${tuitionPaid ? '#eafaf1' : '#fff'};border:1px solid ${tuitionPaid ? '#a9dfbf' : 'var(--bdr)'};border-radius:7px;cursor:${tuitionPaid ? 'default' : 'pointer'};margin-bottom:6px">
        <input type="checkbox" id="advm_${i}" value="${mo}_${yr}" ${tuitionPaid ? 'disabled checked' : ''} style="width:16px;height:16px;accent-color:var(--grn)" onchange="calcAdvTotal()">
        <div style="flex:1">
          <span style="font-weight:600;font-size:13px">${mo} ${yr}</span>
          ${tuitionPaid ? '<span style="margin-left:8px;font-size:11px;color:var(--grn);font-weight:600">✓ Already Paid</span>' : ''}
        </div>
        <span style="font-weight:600;color:var(--grn)">₹${tuitionAmt}</span>
      </label>`;
  }

  document.getElementById('advPayB').innerHTML = `
    <div style="background:var(--bg);border-radius:8px;padding:12px 14px;margin-bottom:12px">
      <div style="font-weight:600;font-size:14px">${s.name}</div>
      <div style="font-size:11.5px;color:var(--txt2)">${clL(s.cls)} (Sec ${s.section || 'A'}) | Adm: ${s.admno} | School Fee: ₹${tuitionAmt}/mo</div>
    </div>
    <div style="margin-bottom:10px;display:flex;gap:8px;align-items:center">
      <button class="btn bo bsm" onclick="selectAllAdvMonths()">Select All</button>
      <button class="btn bo bsm" onclick="clearAllAdvMonths()">Clear All</button>
      <span style="font-size:11.5px;color:var(--txt2)">Select the months you wish to pay in advance</span>
    </div>
    <div style="max-height:240px;overflow-y:auto;padding-right:4px">${monthsHtml}</div>
    <div style="background:var(--bg);border-radius:8px;padding:12px 14px;margin-top:12px">
      <div style="font-size:11.5px;font-weight:700;color:var(--txt2);margin-bottom:8px">Applicable Fee Categories & Amounts (Editable before payment):</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
        <div>
          <label style="display:flex;align-items:center;gap:4px;font-size:12px;font-weight:600;margin-bottom:4px">
            <input type="checkbox" id="adv_pay_tuition" ${cfg.tuition !== false ? 'checked' : ''} onchange="calcAdvTotal()"> School Fee
          </label>
          <input type="number" id="adv_amt_tuition" value="${tuitionAmt}" oninput="calcAdvTotal()" style="width:100%;border:1px solid var(--bdr);border-radius:4px;padding:4px 8px;font-size:12px">
        </div>
        <div>
          <label style="display:flex;align-items:center;gap:4px;font-size:12px;font-weight:600;margin-bottom:4px">
            <input type="checkbox" id="adv_pay_admission" ${!admAlreadyPaid && cfg.admission !== false ? 'checked' : ''} ${admAlreadyPaid ? 'disabled' : ''} onchange="calcAdvTotal()"> Admission Fee (1x) ${admAlreadyPaid ? '<span style="color:var(--grn);font-size:11px;font-weight:normal">(Already Paid)</span>' : ''}
          </label>
          <input type="number" id="adv_amt_admission" value="${admAmt}" ${admAlreadyPaid ? 'disabled' : ''} oninput="calcAdvTotal()" style="width:100%;border:1px solid var(--bdr);border-radius:4px;padding:4px 8px;font-size:12px">
        </div>
      </div>
      <div class="g2">
        <div class="fg"><label>Payment Date</label><input type="date" id="adv_dt" value="${new Date().toISOString().split('T')[0]}"></div>
        <div class="fg"><label>Payment Method</label><select id="adv_md"><option>Cash</option><option>UPI</option><option>Bank Transfer</option><option>Cheque</option><option>Other</option></select></div>
      </div>
    </div>
    <div style="background:var(--gl);border-radius:8px;padding:12px 14px;margin-top:10px;display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-size:11.5px;color:var(--grn)">Total Calculated Amount</div>
        <div style="font-size:22px;font-weight:700;color:var(--grn)" id="advTotalAmt">₹0</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:11.5px;color:var(--grn);font-weight:600" id="advMonthCount">0 months selected</div>
        <div style="font-size:11px;color:var(--txt2)" id="advMonthRange"></div>
      </div>
    </div>`;
  openM('advPayM');
  calcAdvTotal();
}

function calcAdvTotal() {
  const payTuition = document.getElementById('adv_pay_tuition')?.checked || false;
  const payAdmission = document.getElementById('adv_pay_admission')?.checked || false;

  const tAmt = parseFloat(document.getElementById('adv_amt_tuition')?.value) || 0;
  const adAmt = parseFloat(document.getElementById('adv_amt_admission')?.value) || 0;

  let count = 0, total = 0, selectedMonths = [];
  for (let i = 0; i < 12; i++) {
    const el = document.getElementById('advm_' + i);
    if (el && el.checked && !el.disabled) {
      count++;
      if (payTuition) total += tAmt;
      const parts = el.value.split('_');
      selectedMonths.push(parts[0] + ' ' + parts[1]);
    }
  }
  if (payAdmission) total += adAmt;

  const amtEl = document.getElementById('advTotalAmt');
  const cntEl = document.getElementById('advMonthCount');
  const rngEl = document.getElementById('advMonthRange');
  if (amtEl) amtEl.textContent = '₹' + total.toLocaleString('en-IN');
  if (cntEl) cntEl.textContent = count + ' month' + (count !== 1 ? 's' : '') + ' selected';
  if (rngEl) {
    if (selectedMonths.length > 0) {
      rngEl.textContent = selectedMonths[0] + (selectedMonths.length > 1 ? ' → ' + selectedMonths[selectedMonths.length - 1] : '');
    } else {
      rngEl.textContent = '';
    }
  }
}

function selectAllAdvMonths() {
  for (let i = 0; i < 12; i++) {
    const el = document.getElementById('advm_' + i);
    if (el && !el.disabled) el.checked = true;
  }
  calcAdvTotal();
}
function clearAllAdvMonths() {
  for (let i = 0; i < 12; i++) {
    const el = document.getElementById('advm_' + i);
    if (el && !el.disabled) el.checked = false;
  }
  calcAdvTotal();
}

let isProcessingAdv = false;
function procAdvPay() {
  if (isProcessingAdv || !curFSid) return;
  const btn = document.getElementById('advPayConfirmBtn');
  if (btn) btn.disabled = true;
  isProcessingAdv = true;

  try {
    const s = DB.students.find(x => x.id === curFSid);
    const dt = document.getElementById('adv_dt').value || new Date().toISOString().split('T')[0];
    const md = document.getElementById('adv_md').value;

    const payTuition = document.getElementById('adv_pay_tuition')?.checked || false;
    const payTransport = document.getElementById('adv_pay_transport')?.checked || false;
    const payAdmission = document.getElementById('adv_pay_admission')?.checked || false;

    const tAmt = parseFloat(document.getElementById('adv_amt_tuition')?.value) || 0;
    const trAmt = parseFloat(document.getElementById('adv_amt_transport')?.value) || 0;
    const adAmt = parseFloat(document.getElementById('adv_amt_admission')?.value) || 0;

    let total = 0, paidMonths = [];
    const masterReceiptNo = getNextReceiptNumber();

    for (let i = 0; i < 12; i++) {
      const el = document.getElementById('advm_' + i);
      if (el && el.checked && !el.disabled) {
        const parts = el.value.split('_');
        const mo = parts[0], yr = parts[1];
        const key = `${curFSid}_${mo}_${yr}`;
        if (!DB.fees[key]) DB.fees[key] = [];

        if (payTuition) {
          let f = DB.fees[key].find(x => x.type === 'School Fee' || x.type === 'Tuition Fee');
          if (!f) {
            f = { type: 'School Fee', amount: tAmt, paid: false, date: '', receiptNo: '', enabled: true };
            DB.fees[key].push(f);
          }
          if (!f.paid) {
            f.paid = true;
            f.amount = tAmt;
            f.date = dt;
            f.mode = md;
            f.receiptNo = masterReceiptNo;
            total += tAmt;
            paidMonths.push(mo + ' ' + yr);
          }
        }
      }
    }

    // One-time admission fee allocation in current month
    if (payAdmission) {
      const curKey = feK();
      if (!DB.fees[curKey]) DB.fees[curKey] = [];
      let admFee = DB.fees[curKey].find(x => x.type === 'Admission Fee');
      if (!admFee) {
        admFee = { type: 'Admission Fee', amount: adAmt, paid: false, date: '', receiptNo: '', enabled: true };
        DB.fees[curKey].push(admFee);
      }
      if (!admFee.paid) {
        admFee.paid = true;
        admFee.amount = adAmt;
        admFee.date = dt;
        admFee.mode = md;
        admFee.receiptNo = masterReceiptNo;
        total += adAmt;
      }
    }

    if (total === 0) {
      toast('No unpaid months or categories selected!', 'warning');
      return;
    }

    if (!DB.payments) DB.payments = [];
    DB.payments.push({
      receiptNo: masterReceiptNo,
      studentId: s.id,
      studentName: s.name,
      admno: s.admno,
      cls: s.cls,
      amount: total,
      mode: md,
      date: dt,
      category: 'Advance Fee (' + paidMonths.length + ' Months)',
      period: paidMonths.length > 0 ? (paidMonths[0] + ' → ' + paidMonths[paidMonths.length - 1]) : '',
      session: DB.settings.currentSession || '2026–27'
    });

    saveDB(true);
    closeM('advPayM');
    renderFeD();
    logActivity('Advance Fee Collected', `Collected ₹${total} advance fee for ${s.name} (${paidMonths.length} months) - Receipt #${masterReceiptNo}`);
    toast(`Advance fee of ₹${total.toLocaleString('en-IN')} collected successfully!`);
    showAdvReceipt(s, paidMonths, total, dt, md, masterReceiptNo, false, payAdmission, tAmt, 0, adAmt);
  } finally {
    isProcessingAdv = false;
    if (btn) btn.disabled = false;
  }
}

function showAdvReceipt(s, months, total, dt, md, receiptNo, withTransport, withAdmission, tAmt, trAmt, adAmt) {
  const rcB = document.getElementById('rcB');
  const settings = DB.settings || {};

  const perMonthBreak = months.map(m => `
    <div class="rr">
      <span style="color:var(--txt2)">${m}</span>
      <span>₹${tAmt.toLocaleString('en-IN')}</span>
    </div>`).join('');

  const admRow = withAdmission ? `
    <div class="rr">
      <span style="color:var(--txt2)">Admission Fee (One-Time)</span>
      <span>₹${adAmt.toLocaleString('en-IN')}</span>
    </div>` : '';

  const logoHtml = settings.schoolLogo
    ? `<img src="${settings.schoolLogo}" style="width:50px;height:50px;border-radius:50%;object-fit:cover;margin-bottom:6px" onerror="this.style.display='none'">`
    : '';

  rcB.innerHTML = `
    <div class="rcpt" id="pRcpt">
      <div class="rh">
        ${logoHtml}
        <div style="font-weight:700;font-size:14px;color:var(--red)">${settings.schoolName || 'School Management System'}</div>
        <div style="font-size:11px;color:var(--txt2)">${settings.schoolAddr || ''} | Phone: ${settings.schoolPhone || ''}</div>
        <div style="margin-top:7px"><span style="background:#fef3cd;color:#856404;padding:3px 12px;border-radius:20px;font-size:11.5px;font-weight:700">ADVANCE FEE RECEIPT</span></div>
      </div>
      <div class="rr"><span style="color:var(--txt2)">Receipt Number</span><span style="font-weight:700;color:var(--blu)">${receiptNo}</span></div>
      <div class="rr"><span style="color:var(--txt2)">Student Name</span><span style="font-weight:600">${s.name}</span></div>
      <div class="rr"><span style="color:var(--txt2)">Admission No</span><span>${s.admno}</span></div>
      <div class="rr"><span style="color:var(--txt2)">Class & Section</span><span>${clL(s.cls)} (Sec ${s.section || 'A'})</span></div>
      <div class="rr"><span style="color:var(--txt2)">Advance Period</span><span>${months[0]} → ${months[months.length - 1]}</span></div>
      <div class="rr"><span style="color:var(--txt2)">Months Paid</span><span style="font-weight:600">${months.length} Months</span></div>
      <div style="background:var(--bg);border-radius:6px;padding:8px 10px;margin:8px 0;font-size:12px">
        <div style="font-size:10.5px;color:var(--txt2);margin-bottom:4px">Month-wise Fee Allocation:</div>
        ${perMonthBreak}
      </div>
      ${admRow}
      <div class="rr"><span style="color:var(--txt2)">Payment Method</span><span>${md}</span></div>
      <div class="rr"><span style="color:var(--txt2)">Payment Date</span><span>${dt}</span></div>
      <div class="rt"><span>Total Amount Collected</span><span style="color:var(--grn)">₹${total.toLocaleString('en-IN')}</span></div>
      <div style="margin-top:14px;font-size:10.5px;color:var(--txt2);text-align:center">Principal: ${settings.principalName || ''}</div>
    </div>`;
  openM('rcC');
}

// 12-Month Paid Status Calendar
function showAdvStatus() {
  if (!curFSid) {
    toast('Select a student first', 'warning');
    return;
  }
  const s = DB.students.find(x => x.id === curFSid);
  const c = s.cls;
  const struct = (DB.feeStructures && DB.feeStructures[c]) ? DB.feeStructures[c] : { tuition: 400, transport: 300, admission: 500 };
  const cfg = (DB.feeConfig && DB.feeConfig[s.id]) ? DB.feeConfig[s.id] : {};

  const curYr = new Date().getFullYear();
  let statusRows = '';
  let paidCount = 0, dueCount = 0;

  for (let i = 0; i < 12; i++) {
    const mo = MONTHS_LIST[i];
    const yr = i >= 9 ? curYr + 1 : curYr;
    const key = `${curFSid}_${mo}_${yr}`;
    const fees = DB.fees[key] || [];

    const isNA = (cfg.tuition === false);
    const tuition = fees.find(f => (f.type === 'School Fee' || f.type === 'Tuition Fee'));
    const isPaid = tuition && tuition.paid;

    if (isPaid) paidCount++;
    else if (!isNA) dueCount++;

    statusRows += `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid var(--bdr);background:${isPaid ? '#eafaf1' : isNA ? '#f8f9fa' : '#fff'}">
        <div style="font-weight:600">${mo} ${yr}</div>
        <div style="display:flex;align-items:center;gap:8px">
          ${isPaid ? `<span style="font-size:11px;color:var(--txt2)">${tuition.mode || 'Cash'} (${tuition.date || ''})</span>` : ''}
          <span class="chip ${isPaid ? 'cg' : isNA ? 'cgr' : 'cr'}">${isPaid ? '✓ Paid' : isNA ? 'N/A' : 'Due'}</span>
          <span style="font-weight:600;color:${isPaid ? 'var(--grn)' : 'var(--red)'}">₹${struct.tuition}</span>
        </div>
      </div>`;
  }

  document.getElementById('advStatusBody').innerHTML = `
    <div style="background:var(--bg);border-radius:8px;padding:12px 14px;margin-bottom:12px">
      <div style="font-weight:600;font-size:14px">${s.name}</div>
      <div style="font-size:11.5px;color:var(--txt2)">${clL(s.cls)} (Sec ${s.section || 'A'}) | Adm: ${s.admno} | School Fee: ₹${struct.tuition}/month</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
      <div style="background:var(--gl);border-radius:8px;padding:10px;text-align:center">
        <div style="font-size:20px;font-weight:700;color:var(--grn)">${paidCount}</div>
        <div style="font-size:11px;color:var(--grn)">Months Paid ✓</div>
      </div>
      <div style="background:var(--rl);border-radius:8px;padding:10px;text-align:center">
        <div style="font-size:20px;font-weight:700;color:var(--red)">${dueCount}</div>
        <div style="font-size:11px;color:var(--red)">Months Outstanding</div>
      </div>
    </div>
    <div style="border:1px solid var(--bdr);border-radius:8px;overflow:hidden">${statusRows}</div>`;
  openM('advStatusM');
}

// ============================================================
// 8. FEE REMINDERS
// ============================================================
function fillRmSessions() {
  const sel = document.getElementById('rm_sess');
  if (!sel) return;
  const cur = sel.value || (DB.settings && DB.settings.currentSession) || '2026–27';
  sel.innerHTML = '';
  (DB.sessions || []).forEach(sess => {
    sel.innerHTML += `<option value="${sess.name}"${sess.name === cur ? ' selected' : ''}>${sess.name}</option>`;
  });
  if (!sel.value && DB.sessions && DB.sessions.length > 0) {
    sel.value = DB.sessions[0].name;
  }
}

function fillRmClasses() {
  const sel = document.getElementById('rm_cl');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">All Classes</option>';
  CLASSES.forEach(c => {
    sel.innerHTML += `<option value="${c}">${clL(c)}</option>`;
  });
  if (cur) sel.value = cur;
}

function onReminderViewTypeChange() {
  const vt = document.getElementById('rm_view_type')?.value || 'session';
  const wrap = document.getElementById('rm_month_year_wrap');
  const moEl = document.getElementById('rm_mo');
  const yrEl = document.getElementById('rm_yr');
  if (wrap) {
    if (vt === 'month') {
      wrap.style.display = 'inline-flex';
      if (moEl) moEl.disabled = false;
      if (yrEl) yrEl.disabled = false;
    } else {
      wrap.style.display = 'none';
      if (moEl) moEl.disabled = true;
      if (yrEl) yrEl.disabled = true;
    }
  }
  loadReminders();
}

function getRemindersDueList() {
  const cls = document.getElementById('rm_cl')?.value || '';
  const sess = (DB.settings && DB.settings.currentSession) || '2026–27';
  const viewType = document.getElementById('rm_view_type')?.value || 'session';
  const mo = document.getElementById('rm_mo')?.value || 'April';
  const yr = parseInt(document.getElementById('rm_yr')?.value) || 2026;
  const [startY, endY] = parseSessionYears(sess);

  let students = (DB.students || []).filter(s => s.status !== 'Inactive' && s.status !== 'Left School' && s.status !== 'Alumni');
  if (cls) students = students.filter(s => s.cls === cls);

  const dueList = [];

  if (viewType === 'month') {
    if (!isFeeRecordCurrentlyDue(mo, yr, sess)) {
      return { dueList: [], isFutureMonth: true, mo, yr, sess, viewType, cls };
    }

    students.forEach(s => {
      if (!isPeriodValidForStudent(s, mo, yr)) return;

      const key = `${s.id}_${mo}_${yr}`;
      const fees = (DB.fees && DB.fees[key]) ? DB.fees[key] : null;
      const breakdown = [];
      let currentDuesTotal = 0;

      // 1. School Fee for this month
      let schoolDue = 0;
      if (Array.isArray(fees) && fees.length > 0) {
        const sf = fees.find(f => f.enabled !== false && (f.type === 'School Fee' || f.type === 'Tuition Fee'));
        if (sf && !sf.paid) {
          const amt = Number(sf.amount) || 0;
          const pPaid = Number(sf.partialPaid) || 0;
          schoolDue = (sf.partialRemaining !== undefined && sf.partialRemaining !== null) ? Number(sf.partialRemaining) : (amt - pPaid);
        }
      } else {
        const struct = (DB.feeStructures && DB.feeStructures[s.cls]) ? DB.feeStructures[s.cls] : { tuition: 400 };
        const cfg = getStudentFeeConfig(s.id);
        if (cfg.tuition !== false) {
          const schoolAmt = (cfg.customTuition !== null && cfg.customTuition !== undefined && cfg.customTuition !== '' && !isNaN(Number(cfg.customTuition)))
            ? Number(cfg.customTuition) : struct.tuition;
          let paidAmt = 0;
          if (Array.isArray(DB.payments)) {
            DB.payments.forEach(p => {
              if (!p.reversed && String(p.studentId) === String(s.id)) {
                if (Array.isArray(p.items)) {
                  p.items.forEach(it => {
                    if (it.month === mo && Number(it.year) === Number(yr) && (it.type === 'School Fee' || it.type === 'Tuition')) {
                      paidAmt += (Number(it.baseAmount || it.amount) || 0);
                    }
                  });
                }
              }
            });
          }
          schoolDue = Math.max(0, schoolAmt - paidAmt);
        }
      }

      if (schoolDue > 0) {
        breakdown.push({
          category: 'School Fee',
          period: `${mo} ${yr}`,
          amount: schoolDue
        });
        currentDuesTotal += schoolDue;
      }

      // 2. Exam Fee (September, December, March only)
      if (['September', 'December', 'March'].includes(mo)) {
        const examAlreadyPaid = isExamFeeAlreadyPaid(s.id, mo, yr);
        if (!examAlreadyPaid) {
          let examDue = 0;
          if (Array.isArray(fees) && fees.length > 0) {
            const ef = fees.find(f => f.enabled !== false && f.type === 'Exam Fee');
            if (ef && !ef.paid) {
              const amt = Number(ef.amount) || 0;
              const pPaid = Number(ef.partialPaid) || 0;
              examDue = (ef.partialRemaining !== undefined && ef.partialRemaining !== null) ? Number(ef.partialRemaining) : (amt - pPaid);
            }
          } else {
            const struct = (DB.feeStructures && DB.feeStructures[s.cls]) ? DB.feeStructures[s.cls] : { examFee: 200 };
            const cfg = getStudentFeeConfig(s.id);
            if (cfg.examEnabled !== false) {
              examDue = (cfg.examFee !== null && cfg.examFee !== undefined && cfg.examFee !== '' && !isNaN(Number(cfg.examFee)))
                ? Number(cfg.examFee) : (struct.examFee || 200);
            }
          }
          if (examDue > 0) {
            breakdown.push({
              category: 'Exam Fee',
              period: `${mo} ${yr}`,
              amount: examDue
            });
            currentDuesTotal += examDue;
          }
        }
      }

      // 3. Admission Fee (April only)
      if (mo === 'April') {
        const admStat = getStudentAdmissionFeeStatus(s.id, sess);
        if (admStat.isDue && admStat.remainingAmount > 0) {
          breakdown.push({
            category: 'Admission Fee',
            period: `April ${yr}`,
            amount: admStat.remainingAmount
          });
          currentDuesTotal += admStat.remainingAmount;
        }
      }

      // In month view: fetch previous-session arrears for student
      const arrearsItems = getStudentPreviousArrearsBreakdown(s, sess);
      const previousArrearsTotal = arrearsItems.reduce((acc, it) => acc + (Number(it.remainingAmount) || 0), 0);

      // Total for this reminder entry
      const totalAmount = currentDuesTotal + previousArrearsTotal;

      if (currentDuesTotal > 0 || previousArrearsTotal > 0) {
        dueList.push({
          admno: s.admno,
          name: s.name,
          cls: s.cls,
          sec: s.sec || '',
          father: s.father || '–',
          phone: s.phone || '–',
          duePeriod: `${mo} ${yr}`,
          previousArrears: arrearsItems,
          previousArrearsTotal: previousArrearsTotal,
          breakdown: breakdown,
          currentDuesTotal: currentDuesTotal,
          totalAmount: totalAmount
        });
      }
    });

    return { dueList, isFutureMonth: false, mo, yr, sess, viewType, cls };
  }

  // viewType === 'session' (Full Session)
  students.forEach(s => {
    const breakdown = [];
    let currentDuesTotal = 0;
    const schoolRanges = [];

    // A. School Fee - gather all due months in session
    const unpaidSchoolMonths = [];
    MONTHS_LIST.forEach((m, idx) => {
      const y = (idx < 9) ? startY : endY;
      if (isFeeRecordCurrentlyDue(m, y, sess) && isPeriodValidForStudent(s, m, y)) {
        const key = `${s.id}_${m}_${y}`;
        const fees = (DB.fees && DB.fees[key]) ? DB.fees[key] : null;
        let rem = 0;
        if (Array.isArray(fees) && fees.length > 0) {
          const sf = fees.find(f => f.enabled !== false && (f.type === 'School Fee' || f.type === 'Tuition Fee'));
          if (sf && !sf.paid) {
            const amt = Number(sf.amount) || 0;
            const pPaid = Number(sf.partialPaid) || 0;
            rem = (sf.partialRemaining !== undefined && sf.partialRemaining !== null) ? Number(sf.partialRemaining) : (amt - pPaid);
          }
        } else {
          const struct = (DB.feeStructures && DB.feeStructures[s.cls]) ? DB.feeStructures[s.cls] : { tuition: 400 };
          const cfg = getStudentFeeConfig(s.id);
          if (cfg.tuition !== false) {
            const schoolAmt = (cfg.customTuition !== null && cfg.customTuition !== undefined && cfg.customTuition !== '' && !isNaN(Number(cfg.customTuition)))
              ? Number(cfg.customTuition) : struct.tuition;
            let paidAmt = 0;
            if (Array.isArray(DB.payments)) {
              DB.payments.forEach(p => {
                if (!p.reversed && String(p.studentId) === String(s.id)) {
                  if (Array.isArray(p.items)) {
                    p.items.forEach(it => {
                      if (it.month === m && Number(it.year) === Number(y) && (it.type === 'School Fee' || it.type === 'Tuition')) {
                        paidAmt += (Number(it.baseAmount || it.amount) || 0);
                      }
                    });
                  }
                }
              });
            }
            rem = Math.max(0, schoolAmt - paidAmt);
          }
        }

        if (rem > 0) {
          unpaidSchoolMonths.push({
            month: m,
            year: y,
            mIdx: idx,
            remaining: rem
          });
        }
      }
    });

    // Group consecutive unpaid School Fee months into ranges
    if (unpaidSchoolMonths.length > 0) {
      const groups = [];
      let curGroup = [unpaidSchoolMonths[0]];
      for (let i = 1; i < unpaidSchoolMonths.length; i++) {
        const prev = unpaidSchoolMonths[i - 1];
        const curr = unpaidSchoolMonths[i];
        if (curr.mIdx === prev.mIdx + 1) {
          curGroup.push(curr);
        } else {
          groups.push(curGroup);
          curGroup = [curr];
        }
      }
      groups.push(curGroup);

      groups.forEach(grp => {
        let periodText = '';
        if (grp.length === 1) {
          periodText = `${grp[0].month} ${grp[0].year}`;
        } else {
          const first = grp[0];
          const last = grp[grp.length - 1];
          if (first.year === last.year) {
            periodText = `${first.month}–${last.month} ${first.year}`;
          } else {
            periodText = `${first.month} ${first.year}–${last.month} ${last.year}`;
          }
        }
        const totalRem = grp.reduce((acc, it) => acc + it.remaining, 0);
        schoolRanges.push(periodText);
        breakdown.push({
          category: 'School Fee',
          period: periodText,
          amount: totalRem
        });
        currentDuesTotal += totalRem;
      });
    }

    // B. Exam Fee
    const examMonths = [
      { mo: 'September', yr: startY, label: 'Half-Yearly' },
      { mo: 'December', yr: startY, label: 'Periodic Test 2' },
      { mo: 'March', yr: endY, label: 'Annual Exam' }
    ];
    examMonths.forEach(em => {
      if (isFeeRecordCurrentlyDue(em.mo, em.yr, sess)) {
        const examPaid = isExamFeeAlreadyPaid(s.id, em.mo, em.yr);
        if (!examPaid) {
          const key = `${s.id}_${em.mo}_${em.yr}`;
          const fees = (DB.fees && DB.fees[key]) ? DB.fees[key] : null;
          let examDue = 0;
          if (Array.isArray(fees) && fees.length > 0) {
            const ef = fees.find(f => f.enabled !== false && f.type === 'Exam Fee');
            if (ef && !ef.paid) {
              const amt = Number(ef.amount) || 0;
              const pPaid = Number(ef.partialPaid) || 0;
              examDue = (ef.partialRemaining !== undefined && ef.partialRemaining !== null) ? Number(ef.partialRemaining) : (amt - pPaid);
            }
          } else {
            const struct = (DB.feeStructures && DB.feeStructures[s.cls]) ? DB.feeStructures[s.cls] : { examFee: 200 };
            const cfg = getStudentFeeConfig(s.id);
            if (cfg.examEnabled !== false) {
              examDue = (cfg.examFee !== null && cfg.examFee !== undefined && cfg.examFee !== '' && !isNaN(Number(cfg.examFee)))
                ? Number(cfg.examFee) : (struct.examFee || 200);
            }
          }
          if (examDue > 0) {
            breakdown.push({
              category: 'Exam Fee',
              period: `${em.mo} ${em.yr}`,
              amount: examDue
            });
            currentDuesTotal += examDue;
          }
        }
      }
    });

    // C. Admission Fee
    const admStat = getStudentAdmissionFeeStatus(s.id, sess);
    if (admStat.isDue && admStat.remainingAmount > 0) {
      breakdown.push({
        category: 'Admission Fee',
        period: `Session ${sess}`,
        amount: admStat.remainingAmount
      });
      currentDuesTotal += admStat.remainingAmount;
    }

    // D. Previous Session Arrears (Carried forward from academic sessions prior to current session)
    const arrearsItems = getStudentPreviousArrearsBreakdown(s, sess);
    const previousArrearsTotal = arrearsItems.reduce((acc, it) => acc + (Number(it.remainingAmount) || 0), 0);

    const totalAmount = currentDuesTotal + previousArrearsTotal;

    if (totalAmount > 0) {
      let mainPeriod = '';
      if (schoolRanges.length > 0) {
        mainPeriod = schoolRanges.join(', ');
      } else if (breakdown.some(b => b.category === 'Exam Fee')) {
        mainPeriod = breakdown.find(b => b.category === 'Exam Fee').period;
      } else if (breakdown.some(b => b.category === 'Admission Fee')) {
        mainPeriod = `Session ${sess}`;
      } else if (arrearsItems.length > 0) {
        mainPeriod = `Session ${arrearsItems[0].session}`;
      } else {
        mainPeriod = `Session ${sess}`;
      }

      dueList.push({
        admno: s.admno,
        name: s.name,
        cls: s.cls,
        sec: s.sec || '',
        father: s.father || '–',
        phone: s.phone || '–',
        duePeriod: mainPeriod,
        previousArrears: arrearsItems,
        previousArrearsTotal: previousArrearsTotal,
        breakdown: breakdown, // current-session dues ONLY!
        currentDuesTotal: currentDuesTotal,
        totalAmount: totalAmount
      });
    }
  });

  return { dueList, isFutureMonth: false, mo, yr, sess, viewType, cls };
}

function loadReminders() {
  const tb = document.getElementById('rmTb');
  const stats = document.getElementById('rmStats');
  if (!tb) return;

  const res = getRemindersDueList();
  const { dueList, isFutureMonth, mo, yr, sess, viewType } = res;

  if (isFutureMonth) {
    if (stats) {
      stats.innerHTML = `<div style="background:var(--bl);border-radius:8px;padding:10px 16px;text-align:center;flex:1;color:var(--blu);font-weight:600">
        ℹ ${mo} ${yr} is in a future period and not currently due for active session ${sess}.
      </div>`;
    }
    tb.innerHTML = `<tr><td colspan="8"><div class="empty" style="color:var(--txt2)">${mo} ${yr} is not yet due under the academic session schedule.</div></td></tr>`;
    return;
  }

  const totalDue = dueList.reduce((a, r) => a + r.totalAmount, 0);
  const studentCount = dueList.length;

  if (stats) {
    stats.innerHTML = `
      <div style="background:var(--rl);border-radius:8px;padding:10px 16px;text-align:center;flex:1">
        <div style="font-size:20px;font-weight:700;color:var(--red)">${dueList.length}</div>
        <div style="font-size:11px;color:var(--red)">Outstanding Entries</div>
      </div>
      <div style="background:var(--yl);border-radius:8px;padding:10px 16px;text-align:center;flex:1">
        <div style="font-size:20px;font-weight:700;color:#9a7d0a">${studentCount}</div>
        <div style="font-size:11px;color:#9a7d0a">Students with Dues</div>
      </div>
      <div style="background:var(--gl);border-radius:8px;padding:10px 16px;text-align:center;flex:1">
        <div style="font-size:20px;font-weight:700;color:var(--grn)">₹${totalDue.toLocaleString('en-IN')}</div>
        <div style="font-size:11px;color:var(--grn)">Total Outstanding Amount</div>
      </div>`;
  }

  if (!dueList.length) {
    const scopeLabel = viewType === 'session' ? `Academic Session ${sess}` : `${mo} ${yr}`;
    tb.innerHTML = `<tr><td colspan="8"><div class="empty" style="color:var(--grn)">✓ No outstanding dues found for ${scopeLabel}!</div></td></tr>`;
    return;
  }

  tb.innerHTML = dueList.map(r => {
    const arrearsHtml = (r.previousArrears && r.previousArrears.length > 0)
      ? `<div style="font-size:11.5px;line-height:1.45;color:var(--txt)">
          ${r.previousArrears.map(it => {
            const periodStr = (it.period && it.period !== 'Historical period unavailable') ? ` — ${it.period}` : '';
            return `<div style="margin-bottom:2px">• <strong>${it.category}</strong>: Session ${it.session}${periodStr} — <span style="font-weight:600">₹${Number(it.remainingAmount).toLocaleString('en-IN')}</span></div>`;
          }).join('')}
        </div>`
      : `<span style="color:var(--txt2);font-size:11.5px">No Arrears</span>`;

    const breakdownHtml = (r.breakdown && r.breakdown.length > 0)
      ? `<div style="font-size:11.5px;line-height:1.45;color:var(--txt)">
          ${r.breakdown.map(it => `<div style="margin-bottom:2px">• <strong>${it.category}</strong>: ${it.period} — <span style="font-weight:600">₹${Number(it.amount).toLocaleString('en-IN')}</span></div>`).join('')}
        </div>`
      : `<span style="color:var(--txt2);font-size:11.5px">No Current Dues</span>`;

    return `<tr>
      <td style="padding:7px 10px"><span class="chip cb2">${r.admno}</span></td>
      <td style="padding:7px 10px"><strong>${r.name}</strong></td>
      <td style="padding:7px 10px"><span class="chip cr">${clL(r.cls)}${r.sec ? ' (' + r.sec + ')' : ''}</span></td>
      <td style="padding:7px 10px">${r.father}</td>
      <td style="padding:7px 10px"><a href="tel:${r.phone}" style="color:var(--blu);font-weight:600;text-decoration:none">📞 ${r.phone}</a></td>
      <td style="padding:7px 10px">${arrearsHtml}</td>
      <td style="padding:7px 10px">${breakdownHtml}</td>
      <td style="padding:7px 10px;font-weight:700;color:var(--red);text-align:right;white-space:nowrap;font-size:13px">₹${Number(r.totalAmount).toLocaleString('en-IN')}</td>
    </tr>`;
  }).join('');
}

function printReminders() {
  const res = getRemindersDueList();
  const { dueList, isFutureMonth, mo, yr, sess, viewType, cls } = res;
  const clLabel = cls ? clL(cls) : 'All Classes';
  const s = DB.settings || {};

  if (isFutureMonth) {
    toast(`${mo} ${yr} is not currently due for session ${sess}!`, 'warning');
    return;
  }

  if (!dueList.length) {
    toast('No outstanding dues to print for the selected filter!', 'warning');
    return;
  }

  const totalDue = dueList.reduce((a, r) => a + r.totalAmount, 0);
  const studentCount = dueList.length;
  const rows = dueList.map((r, i) => {
    const arrearsText = (r.previousArrears && r.previousArrears.length > 0)
      ? `<div style="font-size:11px;line-height:1.4">
          ${r.previousArrears.map(it => {
            const periodStr = (it.period && it.period !== 'Historical period unavailable') ? ` — ${it.period}` : '';
            return `<div>• <strong>${it.category}</strong>: Session ${it.session}${periodStr} — ₹${Number(it.remainingAmount).toLocaleString('en-IN')}</div>`;
          }).join('')}
        </div>`
      : `<span style="color:#888;font-size:11px">No Arrears</span>`;

    const breakdownText = (r.breakdown && r.breakdown.length > 0)
      ? `<div style="font-size:11px;line-height:1.4">
          ${r.breakdown.map(it => `<div>• <strong>${it.category}</strong>: ${it.period} — ₹${Number(it.amount).toLocaleString('en-IN')}</div>`).join('')}
        </div>`
      : `<span style="color:#888;font-size:11px">No Current Dues</span>`;

    return `<tr>
      <td>${i + 1}</td>
      <td>${r.admno}</td>
      <td><strong>${r.name}</strong></td>
      <td>${clL(r.cls)}${r.sec ? ' (' + r.sec + ')' : ''}</td>
      <td>${r.father}</td>
      <td>${r.phone}</td>
      <td>${arrearsText}</td>
      <td>${breakdownText}</td>
      <td style="font-weight:700;color:#c0392b;text-align:right">₹${Number(r.totalAmount).toLocaleString('en-IN')}</td>
    </tr>`;
  }).join('');

  const filterNoticeTitle = viewType === 'session'
    ? `Fee Due Reminder Notice — Academic Session ${sess} (Full Session)`
    : `Fee Due Reminder Notice — ${mo} ${yr}`;

  const html = `<!DOCTYPE html><html><head><title>Fee Due Reminder List</title>
  <style>body{font-family:Arial,sans-serif;margin:20px;font-size:12px}table{width:100%;border-collapse:collapse}th{background:#c0392b;color:#fff;padding:7px 10px;text-align:left;font-size:11px}td{padding:6px 10px;border-bottom:1px solid #eee;vertical-align:top}tr:nth-child(even){background:#fafafa}.hdr{text-align:center;margin-bottom:14px;border-bottom:2px solid #c0392b;padding-bottom:10px}.total-row{background:#fdecea;font-weight:700}@media print{body{margin:0}}</style>
  </head><body>
  <div class="hdr">
    <div style="font-size:16px;font-weight:700;color:#c0392b">${s.schoolName || 'School Management System'}</div>
    <div style="font-size:11px;color:#666">${s.schoolAddr || ''} | Phone: ${s.schoolPhone || ''}</div>
    <div style="font-size:13px;font-weight:600;margin-top:5px">${filterNoticeTitle}</div>
    <div style="font-size:11px;color:#666">${clLabel} | View: ${viewType === 'session' ? 'Full Session' : 'Specific Month'} | Total Outstanding: ₹${totalDue.toLocaleString('en-IN')} | ${dueList.length} Due Entries (${studentCount} Students)</div>
  </div>
  <table>
    <thead><tr><th>#</th><th>Adm No</th><th>Student Name</th><th>Class/Sec</th><th>Father</th><th>Phone</th><th>Previous Arrears</th><th>Fee Breakdown</th><th style="text-align:right">Total Amount Due</th></tr></thead>
    <tbody>
      ${rows}
      <tr class="total-row"><td colspan="8" style="text-align:right;padding:8px 10px">Total Outstanding Balance:</td><td style="text-align:right">₹${totalDue.toLocaleString('en-IN')}</td></tr>
    </tbody>
  </table>
  <div style="margin-top:20px;display:flex;justify-content:space-between;font-size:11px;color:#666;border-top:1px solid #eee;padding-top:8px">
    <span>Authorized Signatory: ${s.principalName || ''}</span>
    <span>Date Generated: ${new Date().toLocaleDateString('en-IN')}</span>
  </div>
  </body></html>`;

  if (isEl) window.electronAPI.printContent(html);
  else { const w = window.open('','_blank'); w.document.write(html); w.document.close(); }
}

// 9. EXPENSE MANAGEMENT (UI Removed as requested; data preserved in DB.expenses)
// ============================================================

// ============================================================
// 10. REPORTS & EXPORTS
// ============================================================

let curDailyCollRows = [];

function openDailyCollectionReport() {
  const today = new Date().toISOString().split('T')[0];
  const fromEl = document.getElementById('dcr_from');
  const toEl = document.getElementById('dcr_to');
  if (fromEl && !fromEl.value) fromEl.value = today;
  if (toEl && !toEl.value) toEl.value = today;

  renderDailyCollectionData();
  openM('dailyCollM');
}

function setDailyFilterRange(type) {
  const todayObj = new Date();
  const today = todayObj.toISOString().split('T')[0];
  const fromEl = document.getElementById('dcr_from');
  const toEl = document.getElementById('dcr_to');
  if (!fromEl || !toEl) return;

  if (type === 'today') {
    fromEl.value = today;
    toEl.value = today;
  } else if (type === 'yesterday') {
    const yestObj = new Date(todayObj);
    yestObj.setDate(yestObj.getDate() - 1);
    const yest = yestObj.toISOString().split('T')[0];
    fromEl.value = yest;
    toEl.value = yest;
  } else if (type === 'thisMonth') {
    const y = todayObj.getFullYear();
    const m = String(todayObj.getMonth() + 1).padStart(2, '0');
    fromEl.value = `${y}-${m}-01`;
    toEl.value = today;
  }
  renderDailyCollectionData();
}

function renderDailyCollectionData() {
  const fromDate = document.getElementById('dcr_from')?.value || '';
  const toDate = document.getElementById('dcr_to')?.value || '';

  const allPayments = (DB.payments || []).filter(p => {
    if (!p.date) return false;
    if (fromDate && p.date < fromDate) return false;
    if (toDate && p.date > toDate) return false;
    return true;
  });

  // Sort chronologically descending
  allPayments.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.receiptNo || '').localeCompare(a.receiptNo || ''));
  curDailyCollRows = allPayments;

  // Calculate totals by payment mode (excluding reversed/voided payments)
  const modeTotals = { Cash: 0, UPI: 0, 'Bank Transfer': 0, Other: 0 };
  let grandTotal = 0;
  let voidCount = 0;

  allPayments.forEach(p => {
    if (p.reversed) {
      voidCount++;
      return;
    }
    const amt = Number(p.amount) || 0;
    const mode = p.mode || 'Cash';
    if (mode === 'Cash') modeTotals.Cash += amt;
    else if (mode === 'UPI') modeTotals.UPI += amt;
    else if (mode === 'Bank Transfer') modeTotals['Bank Transfer'] += amt;
    else modeTotals.Other += amt;
    grandTotal += amt;
  });

  // Render Mode Cards
  const cardsEl = document.getElementById('dcrSummaryCards');
  if (cardsEl) {
    cardsEl.innerHTML = `
      <div style="background:var(--bg);border-radius:8px;padding:10px 12px;border:1px solid var(--bdr)">
        <div style="font-size:11px;color:var(--txt2);font-weight:600">💵 Cash</div>
        <div style="font-size:16px;font-weight:700;color:var(--txt);margin-top:2px">₹${modeTotals.Cash.toLocaleString('en-IN')}</div>
      </div>
      <div style="background:var(--bg);border-radius:8px;padding:10px 12px;border:1px solid var(--bdr)">
        <div style="font-size:11px;color:var(--txt2);font-weight:600">📱 UPI / QR</div>
        <div style="font-size:16px;font-weight:700;color:var(--txt);margin-top:2px">₹${modeTotals.UPI.toLocaleString('en-IN')}</div>
      </div>
      <div style="background:var(--bg);border-radius:8px;padding:10px 12px;border:1px solid var(--bdr)">
        <div style="font-size:11px;color:var(--txt2);font-weight:600">🏦 Bank Transfer</div>
        <div style="font-size:16px;font-weight:700;color:var(--txt);margin-top:2px">₹${modeTotals['Bank Transfer'].toLocaleString('en-IN')}</div>
      </div>
      <div style="background:var(--bg);border-radius:8px;padding:10px 12px;border:1px solid var(--bdr)">
        <div style="font-size:11px;color:var(--txt2);font-weight:600">💳 Cheque / Other</div>
        <div style="font-size:16px;font-weight:700;color:var(--txt);margin-top:2px">₹${modeTotals.Other.toLocaleString('en-IN')}</div>
      </div>
      <div style="background:var(--gl);border-radius:8px;padding:10px 12px;border:1px solid #a9dfbf">
        <div style="font-size:11px;color:var(--grn);font-weight:700">💰 Grand Total</div>
        <div style="font-size:18px;font-weight:700;color:var(--grn);margin-top:2px">₹${grandTotal.toLocaleString('en-IN')}</div>
      </div>`;
  }

  // Render Table Rows
  const tbEl = document.getElementById('dcrTableBody');
  if (tbEl) {
    if (!allPayments.length) {
      tbEl.innerHTML = '<tr><td colspan="9" class="empty" style="padding:24px 0">No fee collection transactions found for selected date range.</td></tr>';
      return;
    }

    tbEl.innerHTML = allPayments.map(p => {
      const isVoid = p.reversed === true;
      return `<tr style="${isVoid ? 'background:#fdecea;opacity:0.75' : ''}">
        <td style="white-space:nowrap"><strong style="color:var(--blu)">${p.receiptNo}</strong></td>
        <td style="white-space:nowrap">${p.date || '–'}</td>
        <td style="font-weight:600">${p.studentName}</td>
        <td style="white-space:nowrap;text-align:center"><span class="chip cb2">${p.admno}</span></td>
        <td style="white-space:nowrap;text-align:center">${clL(p.cls)}</td>
        <td style="line-height:1.4">${p.category || 'Fee'} ${p.period ? `(${p.period})` : ''}</td>
        <td style="white-space:nowrap;text-align:center"><span class="chip cb2">${p.mode || 'Cash'}</span></td>
        <td style="white-space:nowrap;text-align:center">${isVoid ? `<span class="chip cr" title="Void reason: ${p.voidReason || 'Cancelled'}">VOID</span>` : '<span class="chip cg">Valid ✓</span>'}</td>
        <td style="white-space:nowrap;text-align:right;font-weight:700;color:${isVoid ? 'var(--txt2)' : 'var(--grn)'};${isVoid ? 'text-decoration:line-through' : ''}">₹${Number(p.amount).toLocaleString('en-IN')}</td>
      </tr>`;
    }).join('');
  }
}

async function expDailyCollectionCSV() {
  if (!curDailyCollRows.length) {
    toast('No collection transactions to export for the selected date range!', 'warning');
    return;
  }
  let csv = 'Receipt No,Date,Student Name,Admission No,Class,Section,Category,Period,Payment Mode,Status,Amount,Void Reason\n';
  curDailyCollRows.forEach(p => {
    const cName = (p.studentName || '').replace(/"/g, '""');
    const cCat = (p.category || '').replace(/"/g, '""');
    const cPeriod = (p.period || '').replace(/"/g, '""');
    const cReason = (p.voidReason || '').replace(/"/g, '""');
    csv += `"${p.receiptNo}","${p.date || ''}","${cName}","${p.admno}","${p.cls}","${p.section || 'A'}","${cCat}","${cPeriod}","${p.mode || 'Cash'}","${p.reversed ? 'VOID' : 'VALID'}",${p.amount},"${cReason}"\n`;
  });
  await expCSV('daily_collection_report.csv', csv);
}

function printDailyCollectionReport() {
  const fromDate = document.getElementById('dcr_from')?.value || '';
  const toDate = document.getElementById('dcr_to')?.value || '';
  const s = DB.settings || {};

  if (!curDailyCollRows.length) {
    toast('No collection transactions to print!', 'warning');
    return;
  }

  // Calculate totals by mode
  const modeTotals = { Cash: 0, UPI: 0, 'Bank Transfer': 0, Other: 0 };
  let grandTotal = 0;
  curDailyCollRows.forEach(p => {
    if (p.reversed) return;
    const amt = Number(p.amount) || 0;
    const mode = p.mode || 'Cash';
    if (mode === 'Cash') modeTotals.Cash += amt;
    else if (mode === 'UPI') modeTotals.UPI += amt;
    else if (mode === 'Bank Transfer') modeTotals['Bank Transfer'] += amt;
    else modeTotals.Other += amt;
    grandTotal += amt;
  });

  const rows = curDailyCollRows.map((p, i) => `
    <tr style="${p.reversed ? 'background:#fdecea;color:#888' : ''}">
      <td>${i + 1}</td>
      <td><strong>${p.receiptNo}</strong></td>
      <td>${p.date || '–'}</td>
      <td><strong>${p.studentName}</strong> (Adm: ${p.admno})</td>
      <td>${clL(p.cls)}</td>
      <td>${p.category || 'Fee'}</td>
      <td>${p.mode || 'Cash'}</td>
      <td>${p.reversed ? '<span style="color:#c0392b;font-weight:bold">VOID</span>' : 'VALID'}</td>
      <td style="text-align:right;font-weight:bold;${p.reversed ? 'text-decoration:line-through' : ''}">₹${Number(p.amount).toLocaleString('en-IN')}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html><head><title>Daily Fee Collection Report</title>
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    body { font-family: Arial, sans-serif; margin: 10px; font-size: 11.5px; color: #222; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th { background: #27ae60; color: #fff; padding: 6px 8px; text-align: left; font-size: 11px; }
    td { padding: 5px 8px; border-bottom: 1px solid #ddd; font-size: 11px; }
    .hdr { text-align: center; border-bottom: 2px solid #27ae60; padding-bottom: 8px; margin-bottom: 10px; }
    .summary-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-bottom: 12px; }
    .sum-card { background: #f9f9f9; border: 1px solid #ddd; border-radius: 6px; padding: 8px; text-align: center; }
    .sum-val { font-size: 14px; font-weight: bold; margin-top: 2px; }
    @media print { body { margin: 0; } }
  </style></head><body>
    <div class="hdr">
      <div style="font-size:17px;font-weight:bold;color:#27ae60">${s.schoolName || 'MD Convent Public School'}</div>
      <div style="font-size:11px;color:#555">${s.schoolAddr || ''} | Contact: ${s.schoolPhone || ''}</div>
      <div style="font-size:13px;font-weight:bold;margin-top:4px">DAILY FEE COLLECTION & AUDIT REPORT</div>
      <div style="font-size:11px;color:#666">Period: ${fromDate || '–'} to ${toDate || '–'} | Active Session: ${s.currentSession || '2026–27'}</div>
    </div>

    <div class="summary-grid">
      <div class="sum-card"><div>Cash</div><div class="sum-val">₹${modeTotals.Cash.toLocaleString('en-IN')}</div></div>
      <div class="sum-card"><div>UPI / QR</div><div class="sum-val">₹${modeTotals.UPI.toLocaleString('en-IN')}</div></div>
      <div class="sum-card"><div>Bank Transfer</div><div class="sum-val">₹${modeTotals['Bank Transfer'].toLocaleString('en-IN')}</div></div>
      <div class="sum-card"><div>Cheque / Other</div><div class="sum-val">₹${modeTotals.Other.toLocaleString('en-IN')}</div></div>
      <div class="sum-card" style="background:#eafaf1;border-color:#a9dfbf;color:#27ae60"><div>Total Collected</div><div class="sum-val">₹${grandTotal.toLocaleString('en-IN')}</div></div>
    </div>

    <table>
      <thead>
        <tr><th>#</th><th>Receipt #</th><th>Date</th><th>Student Name</th><th>Class</th><th>Category</th><th>Mode</th><th>Status</th><th style="text-align:right">Amount (₹)</th></tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>

    <div style="margin-top:24px;display:flex;justify-content:space-between;align-items:flex-end;border-top:1px dashed #ccc;padding-top:10px;font-size:10.5px;color:#666">
      <div>
        Official School Accounts Report<br>
        Authorized Signatory: <strong>${s.principalName || 'Principal'}</strong>
      </div>
      <div>Printed on: ${new Date().toLocaleString('en-IN')}</div>
    </div>
  </body></html>`;

  if (isEl) window.electronAPI.printContent(html);
  else { const w = window.open('','_blank'); w.document.write(html); w.document.close(); }
}
async function expSt() {
  const list = DB.students || [];
  if (!list.length) {
    toast('No students found to export', 'warning');
    return;
  }
  let csv = 'Admission No,SR No,Name,Father Name,Mother Name,DOB,Gender,Blood Group,Phone,Email,Class,Section,Session,Status,Address\n';
  list.forEach(s => {
    const cSrNo = (s.srNo || '').replace(/"/g, '""');
    const cName = (s.name || '').replace(/"/g, '""');
    const cFather = (s.father || '').replace(/"/g, '""');
    const cMother = (s.mother || '').replace(/"/g, '""');
    const cAddr = (s.address || '').replace(/"/g, '""');
    csv += `"${s.admno}","${cSrNo}","${cName}","${cFather}","${cMother}","${s.dob || ''}","${s.gender || ''}","${s.blood || ''}","${s.phone || ''}","${s.email || ''}","${s.cls}","${s.section || 'A'}","${s.session || ''}","${s.status || 'Active'}","${cAddr}"\n`;
  });
  await expCSV('students_master_report.csv', csv);
}

async function expFe() {
  let csv = 'Receipt No,Admission No,SR No,Student Name,Class,Section,Billing Period,Fee Category,Amount,Paid Status,Payment Date,Payment Mode\n';
  (DB.students || []).forEach(s => {
    Object.entries(DB.fees || {}).forEach(([k, arr]) => {
      if (!k.startsWith(s.id + '_') || !Array.isArray(arr)) return;
      const parts = k.split('_');
      const period = parts[1] + ' ' + parts[2];
      arr.filter(f => f.enabled !== false).forEach(f => {
        const cName = (s.name || '').replace(/"/g, '""');
        const cSrNo = (s.srNo || '').replace(/"/g, '""');
        csv += `"${f.receiptNo || ''}","${s.admno}","${cSrNo}","${cName}","${s.cls}","${s.section || 'A'}","${period}","${f.type}",${f.amount},"${f.paid ? 'Paid' : 'Due'}","${f.date || ''}","${f.mode || ''}"\n`;
      });
    });
  });
  await expCSV('fee_collection_master_report.csv', csv);
}

async function expCSV(filename, content) {
  if (isEl) {
    const res = await window.electronAPI.exportCSV(filename, content);
    if (res && res.success) toast('Exported CSV: ' + filename);
  } else {
    const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    toast('Downloaded: ' + filename);
  }
}

// ============================================================
// 11. BACKUP AND ATOMIC RESTORE
// ============================================================
async function doBackup() {
  if (isEl) {
    const res = await window.electronAPI.backupData(DB);
    if (res && res.success) {
      logActivity('Backup Created', 'Generated JSON data backup file at: ' + res.filePath);
      toast('Backup saved successfully!');
    }
  } else {
    const b = new Blob([JSON.stringify(DB, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = 'school_data_backup_' + Date.now() + '.json';
    a.click();
    toast('Backup downloaded!');
  }
}

async function doRestore() {
  if (isEl) {
    const res = await window.electronAPI.restoreData();
    if (!res) return;
    if (res.error) {
      toast('Malformed backup file: ' + res.error, 'error');
      return;
    }
    const incoming = res.data;
    if (!incoming || typeof incoming !== 'object' || !Array.isArray(incoming.students)) {
      toast('Invalid backup format: Must contain valid school data and students array!', 'error');
      return;
    }

    if (confirm('RESTORE CONFIRMATION:\n\nThis operation will restore your database from the selected backup.\nA safety snapshot of current data will be created automatically prior to restoration.\n\nDo you wish to proceed?')) {
      await window.electronAPI.createSafetyBackup();
      migrateExistingData(incoming);
      saveDB(true);
      applyBranding();
      renderDB();
      logActivity('Backup Restored', 'Restored complete database from: ' + res.filePath);
      toast('Data successfully restored from backup!');
    }
  } else {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json';
    inp.onchange = e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const parsed = JSON.parse(ev.target.result);
          if (!parsed || !Array.isArray(parsed.students)) {
            toast('Invalid backup file structure!', 'error');
            return;
          }
          if (confirm('Confirm restore from file? Current data will be replaced safely.')) {
            migrateExistingData(parsed);
            saveDB(true);
            applyBranding();
            renderDB();
            toast('Data restored from file!');
          }
        } catch(err) {
          toast('Failed to parse backup JSON file: ' + err.message, 'error');
        }
      };
      reader.readAsText(file);
    };
    inp.click();
  }
}

// ============================================================
// 12. ACTIVITY HISTORY / AUDIT LOG
// ============================================================
function renderHistory() {
  const tb = document.getElementById('histTb');
  if (!tb) return;
  const list = DB.history || [];
  if (!list.length) {
    tb.innerHTML = '<tr><td colspan="3" class="empty">No logged activity yet. System actions will be recorded here automatically.</td></tr>';
    return;
  }
  tb.innerHTML = list.map(item => {
    const dateFormatted = new Date(item.timestamp).toLocaleString('en-IN');
    return `<tr>
      <td style="white-space:nowrap;font-size:11.5px;color:var(--txt2)">${dateFormatted}</td>
      <td><span class="chip cb2">${item.actionType}</span></td>
      <td>${item.description}</td>
    </tr>`;
  }).join('');
}

// ============================================================
// 13. SETTINGS MANAGEMENT
// ============================================================
let pendingCustomLogo = undefined;

function onAdmissionPrefixChange() {
  const pfx = (document.getElementById('set_adm_prefix')?.value || '').trim();
  const maxIssued = getMaxIssuedAdmissionNumber(pfx);
  const configuredVal = parseInt(DB.nextAdm, 10);
  const effectiveNextSeq = (maxIssued === 0) 
    ? ((configuredVal && configuredVal > 0) ? configuredVal : 1)
    : ((configuredVal && configuredVal > maxIssued) ? configuredVal : (maxIssued + 1));

  const admInput = document.getElementById('set_next_adm');
  if (admInput) admInput.value = effectiveNextSeq;

  const noteEl = document.getElementById('set_next_adm_note');
  if (noteEl) {
    if (maxIssued > 0) {
      noteEl.innerHTML = `ℹ️ Highest issued number: <strong>${pfx}${maxIssued}</strong> (${(DB.students || []).length} total students). Existing numbers are preserved to prevent duplicates.`;
    } else {
      noteEl.innerHTML = `ℹ️ No student records exist yet for this prefix. Starting value will apply to the first enrolled student.`;
    }
  }
}

function loadSettingsForm() {
  fillDDs();
  pendingCustomLogo = undefined;
  const s = DB.settings || {};
  const nameEl = document.getElementById('set_school_name');
  if (nameEl) nameEl.value = s.schoolName || '';
  const addrEl = document.getElementById('set_school_addr');
  if (addrEl) addrEl.value = s.schoolAddr || '';
  const phEl = document.getElementById('set_school_phone');
  if (phEl) phEl.value = s.schoolPhone || '';
  const sessEl = document.getElementById('set_cur_session');
  if (sessEl) sessEl.value = s.currentSession || '2026–27';
  const admPfxEl = document.getElementById('set_adm_prefix');
  if (admPfxEl) admPfxEl.value = s.admissionPrefix || '';
  const rcptPfxEl = document.getElementById('set_rcpt_prefix');
  if (rcptPfxEl) rcptPfxEl.value = s.receiptPrefix || 'REC-';
  const princEl = document.getElementById('set_principal_name');
  if (princEl) princEl.value = s.principalName || '';

  const prefix = s.admissionPrefix || '';
  const maxIssued = getMaxIssuedAdmissionNumber(prefix);
  const configuredVal = parseInt(DB.nextAdm, 10);
  const effectiveNextSeq = (maxIssued === 0) 
    ? ((configuredVal && configuredVal > 0) ? configuredVal : 1)
    : ((configuredVal && configuredVal > maxIssued) ? configuredVal : (maxIssued + 1));

  const nextAdmEl = document.getElementById('set_next_adm');
  if (nextAdmEl) nextAdmEl.value = effectiveNextSeq;

  const noteEl = document.getElementById('set_next_adm_note');
  if (noteEl) {
    if (maxIssued > 0) {
      noteEl.innerHTML = `ℹ️ Highest issued: <strong>${prefix}${maxIssued}</strong> (${(DB.students || []).length} total students). Existing numbers are preserved to prevent duplicates.`;
    } else {
      noteEl.innerHTML = `ℹ️ No student records exist yet. Starting value will apply to the first enrolled student.`;
    }
  }

  const customLogo = (s.schoolLogo && s.schoolLogo !== 'logo.png') ? s.schoolLogo : '';
  const prevImg = document.getElementById('set_logo_preview');
  if (prevImg) {
    prevImg.src = customLogo || 'assets/default-school-logo.svg';
    prevImg.style.display = 'block';
  }
  const rmBtn = document.getElementById('btnRemoveLogo');
  if (rmBtn) {
    rmBtn.style.display = customLogo ? 'inline-block' : 'none';
  }
}

async function browseLogoFile() {
  if (isEl) {
    const dataUri = await window.electronAPI.selectLogo();
    if (dataUri) {
      pendingCustomLogo = dataUri;
      const prevImg = document.getElementById('set_logo_preview');
      if (prevImg) {
        prevImg.src = dataUri;
        prevImg.style.display = 'block';
      }
      const rmBtn = document.getElementById('btnRemoveLogo');
      if (rmBtn) rmBtn.style.display = 'inline-block';
      toast('New logo selected. Click "Save Settings" below to persist.');
    }
  } else {
    toast('Logo upload is supported in the desktop installed app', 'warning');
  }
}

function removeCustomLogo() {
  pendingCustomLogo = '';
  const prevImg = document.getElementById('set_logo_preview');
  if (prevImg) {
    prevImg.src = 'assets/default-school-logo.svg';
    prevImg.style.display = 'block';
  }
  const rmBtn = document.getElementById('btnRemoveLogo');
  if (rmBtn) rmBtn.style.display = 'none';
  toast('Custom logo removed. Default school emblem will be used. Click "Save Settings" to persist.');
}

async function saveSettingsForm() {
  try {
    if (isDataCorrupted) {
      toast('Cannot save settings: Database is in emergency recovery state. Please restore a backup first.', 'error');
      return;
    }

    const nameEl = document.getElementById('set_school_name');
    const name = (nameEl ? nameEl.value : '').trim();
    if (!name) {
      toast('School Name is required and cannot be empty!', 'error');
      if (nameEl) nameEl.focus();
      return;
    }

    if (!DB.settings) DB.settings = {};
    DB.settings.schoolName = name;
    DB.settings.schoolAddr = (document.getElementById('set_school_addr')?.value || '').trim();
    DB.settings.schoolPhone = (document.getElementById('set_school_phone')?.value || '').trim();
    
    const sessEl = document.getElementById('set_cur_session');
    if (sessEl && sessEl.value) {
      DB.settings.currentSession = sessEl.value;
    }
    
    const prefix = (document.getElementById('set_adm_prefix')?.value || '').trim();
    DB.settings.admissionPrefix = prefix;

    DB.settings.receiptPrefix = (document.getElementById('set_rcpt_prefix')?.value || '').trim() || 'REC-';
    DB.settings.principalName = (document.getElementById('set_principal_name')?.value || '').trim();

    // Staged logo changes:
    // Only alter DB.settings.schoolLogo if user selected or removed a logo.
    // Otherwise, preserve whatever logo currently exists (custom logo or empty string).
    if (pendingCustomLogo !== undefined) {
      DB.settings.schoolLogo = pendingCustomLogo;
      pendingCustomLogo = undefined;
    } else if (DB.settings.schoolLogo === 'logo.png') {
      DB.settings.schoolLogo = '';
    }

    // Handle Next Admission Sequence Configuration & Duplicate Protection
    const maxIssued = getMaxIssuedAdmissionNumber(prefix);
    const nextAdmEl = document.getElementById('set_next_adm');
    let enteredVal = parseInt(nextAdmEl ? nextAdmEl.value : '', 10);

    if (isNaN(enteredVal) || enteredVal <= 0) {
      enteredVal = (DB.nextAdm && DB.nextAdm > 0) ? DB.nextAdm : 1;
      if (nextAdmEl) nextAdmEl.value = enteredVal;
    }

    let finalNextAdm = enteredVal;
    if (maxIssued > 0 && enteredVal <= maxIssued) {
      finalNextAdm = maxIssued + 1;
      DB.nextAdm = finalNextAdm;
      if (nextAdmEl) nextAdmEl.value = finalNextAdm;
      toast(`Preserving existing student records (highest issued: ${prefix}${maxIssued}). Next admission number set to ${prefix}${finalNextAdm} to prevent duplicate records.`, 'warning', 7000);
    } else {
      DB.nextAdm = finalNextAdm;
    }

    const saveOk = await saveDB(true);
    if (saveOk) {
      applyBranding();
      logActivity('Settings Updated', `School configuration updated: ${name}`);
      toast('Application settings saved successfully!');
      const customLogo = (DB.settings.schoolLogo && DB.settings.schoolLogo !== 'logo.png') ? DB.settings.schoolLogo : '';
      const rmBtn = document.getElementById('btnRemoveLogo');
      if (rmBtn) {
        rmBtn.style.display = customLogo ? 'inline-block' : 'none';
      }
      const prevImg = document.getElementById('set_logo_preview');
      if (prevImg) {
        prevImg.src = customLogo || 'assets/default-school-logo.svg';
        prevImg.style.display = 'block';
      }
      onAdmissionPrefixChange();
    } else {
      toast('Failed to save settings: ' + (lastSaveError || 'Persistence error'), 'error');
    }
  } catch (err) {
    console.error('saveSettingsForm error:', err);
    toast('Error saving settings: ' + (err.message || 'Unknown error'), 'error');
  }
}

// ============================================================
// GLOBAL SEARCH IMPLEMENTATION
// ============================================================
let gSearchDebounceTimer = null;
let gSearchResults = [];
let gSearchActiveIdx = -1;

function onGlobalSearchInput(val) {
  clearTimeout(gSearchDebounceTimer);
  gSearchDebounceTimer = setTimeout(() => {
    performGlobalSearch(val);
  }, 150);
}

function onGlobalSearchFocus() {
  const inp = document.getElementById('gSch');
  if (inp && inp.value.trim().length > 0) {
    performGlobalSearch(inp.value);
  }
}

function closeGlobalSearchDropdown() {
  const dd = document.getElementById('gSchDropdown');
  if (dd) {
    dd.style.display = 'none';
    dd.innerHTML = '';
  }
  gSearchResults = [];
  gSearchActiveIdx = -1;
}

function performGlobalSearch(query) {
  const q = (query || '').trim().toLowerCase();
  const dd = document.getElementById('gSchDropdown');
  if (!dd) return;

  if (!q) {
    closeGlobalSearchDropdown();
    return;
  }

  const students = DB.students || [];
  gSearchResults = students.filter(s => {
    const name = (s.name || '').toLowerCase();
    const adm = (s.admno || '').toString().toLowerCase();
    const sr = (s.srNo || '').toString().toLowerCase();
    const fName = (s.father || '').toLowerCase();
    const mName = (s.mother || '').toLowerCase();
    const phone = (s.phone || '').toString().toLowerCase();
    return name.includes(q) || adm.includes(q) || sr.includes(q) || fName.includes(q) || mName.includes(q) || phone.includes(q);
  }).slice(0, 10); // top 10 matches

  gSearchActiveIdx = -1;

  if (gSearchResults.length === 0) {
    dd.innerHTML = `<div style="padding:14px;font-size:12px;color:var(--txt2);text-align:center">No students found matching "<strong>${escapeHtml(q)}</strong>"</div>`;
    dd.style.display = 'block';
    return;
  }

  dd.innerHTML = gSearchResults.map((s, idx) => {
    const isInactive = s.status === 'Inactive' || s.status === 'Left School';
    return `
      <div id="gs_item_${idx}" class="gs-res-item" onclick="selectGlobalSearchResult(${s.id})" onmouseover="highlightGlobalSearchItem(${idx})" style="padding:9px 12px;border-bottom:1px solid var(--bdr);cursor:pointer;display:flex;justify-content:space-between;align-items:center;transition:background 0.15s">
        <div>
          <div style="font-weight:700;font-size:13px;display:flex;align-items:center;gap:6px">
            <span>${escapeHtml(s.name)}</span>
            <span class="chip cb2" style="font-size:10px;padding:1px 6px">Adm: ${escapeHtml(s.admno)}</span>
            ${s.srNo ? `<span class="chip" style="background:var(--card);border:1px solid var(--bdr);font-size:10px;padding:1px 6px">SR: ${escapeHtml(s.srNo)}</span>` : ''}
            ${isInactive ? `<span class="chip cr" style="font-size:9.5px;padding:1px 5px">${escapeHtml(s.status)}</span>` : ''}
          </div>
          <div style="font-size:11px;color:var(--txt2);margin-top:2px">
            Class ${clL(s.cls)} (Sec ${escapeHtml(s.section || 'A')})${s.father ? ' • Father: ' + escapeHtml(s.father) : ''}${s.phone ? ' • 📞 ' + escapeHtml(s.phone) : ''}
          </div>
        </div>
        <div style="text-align:right">
          <button class="btn bp bsm" style="font-size:10.5px;padding:3px 8px;pointer-events:none">View Ledger ➔</button>
        </div>
      </div>
    `;
  }).join('');
  dd.style.display = 'block';
}

function highlightGlobalSearchItem(idx) {
  gSearchActiveIdx = idx;
  gSearchResults.forEach((_, i) => {
    const el = document.getElementById(`gs_item_${i}`);
    if (el) {
      if (i === idx) {
        el.style.background = '#eef6fc';
        el.style.borderLeft = '3px solid var(--blu)';
      } else {
        el.style.background = '#ffffff';
        el.style.borderLeft = 'none';
      }
    }
  });
}

function onGlobalSearchKeyDown(e) {
  const dd = document.getElementById('gSchDropdown');
  if (!dd || dd.style.display === 'none' || gSearchResults.length === 0) {
    if (e.key === 'Escape') closeGlobalSearchDropdown();
    return;
  }

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    gSearchActiveIdx = (gSearchActiveIdx + 1) % gSearchResults.length;
    highlightGlobalSearchItem(gSearchActiveIdx);
    const itemEl = document.getElementById(`gs_item_${gSearchActiveIdx}`);
    if (itemEl && typeof itemEl.scrollIntoView === 'function') itemEl.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    gSearchActiveIdx = (gSearchActiveIdx - 1 + gSearchResults.length) % gSearchResults.length;
    highlightGlobalSearchItem(gSearchActiveIdx);
    const itemEl = document.getElementById(`gs_item_${gSearchActiveIdx}`);
    if (itemEl && typeof itemEl.scrollIntoView === 'function') itemEl.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (gSearchActiveIdx >= 0 && gSearchActiveIdx < gSearchResults.length) {
      selectGlobalSearchResult(gSearchResults[gSearchActiveIdx].id);
    } else if (gSearchResults.length > 0) {
      selectGlobalSearchResult(gSearchResults[0].id);
    }
  } else if (e.key === 'Escape') {
    closeGlobalSearchDropdown();
    const inp = document.getElementById('gSch');
    if (inp && typeof inp.blur === 'function') inp.blur();
  }
}

function selectGlobalSearchResult(studentId) {
  closeGlobalSearchDropdown();
  const s = (DB.students || []).find(st => st.id === studentId);
  const inp = document.getElementById('gSch');
  if (inp && s) {
    inp.value = '';
  }
  curFSid = studentId;
  if (typeof selectStudentForPayment === 'function') {
    selectStudentForPayment(studentId);
  }
  if (typeof openStudentFeeDetailsModal === 'function') {
    openStudentFeeDetailsModal(studentId);
  }
}

// Global click-outside listener for search dropdown
if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('click', function(e) {
    const sb = e.target && e.target.closest ? e.target.closest('.sb') : null;
    if (!sb) {
      closeGlobalSearchDropdown();
    }
  });
}

function gSchFn(q) {
  onGlobalSearchInput(q);
}

// ============================================================
// TRANSPORT FEES MODULE (EXACT REFERENCE DESIGN)
// ============================================================

var transportState = {
  activeSession: '',
  activeMonth: '',
  activeClass: 'all',
  activeStatus: 'all',
  activeStop: 'all',
  quickSearch: '',
  selectedStudentForCollect: null,
  selectedStudentForAssign: null,
  selectedStudentForDetails: null,
  activeReceipt: null,
  isDefaultView: true,
  assignSearch: '',
  assignClassFilter: 'all',
  assignStatusFilter: 'all',
  collectSearch: '',
  collectClassFilter: 'all'
};

// ============================================================
// DATE & MONTH KEY HELPERS
// ============================================================

// Returns current local month key e.g. "2026-10"
function getCurrentMonthKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

// Convert "2026-10" -> "October 2026"
function monthKeyToDisplay(monthKey) {
  if (!monthKey || typeof monthKey !== 'string') return '';
  const s = monthKey.trim();
  if (!s.includes('-')) return s;
  const parts = s.split('-');
  if (parts.length < 2) return s;
  const yr = parts[0];
  const moNum = parseInt(parts[1], 10);
  const moName = SYS_MONTHS[moNum - 1] || '';
  return moName ? `${moName} ${yr}` : s;
}

// Convert "October 2026" -> "2026-10"
function displayToMonthKey(monthStr) {
  if (!monthStr || typeof monthStr !== 'string') return '';
  const s = monthStr.trim();
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  const parts = s.split(/\s+/);
  if (parts.length < 2) return s;
  const moName = parts[0];
  const yr = parts[1];
  const idx = SYS_MONTHS.indexOf(moName);
  if (idx >= 0) {
    return `${yr}-${String(idx + 1).padStart(2, '0')}`;
  }
  return s;
}

// Get academic months array for a given session string e.g. "2026–27" -> ['April 2026', ..., 'March 2027']
function getTransportAcademicMonths(sessionName) {
  const [startYear, endYear] = parseSessionYears(sessionName || (DB.settings && DB.settings.currentSession));
  return MONTHS_LIST.map((m, idx) => {
    const yr = idx < 9 ? startYear : endYear;
    return `${m} ${yr}`;
  });
}

// Chronological numeric sort key e.g. "October 2026" or "2026-10" -> 202610
function getFeeMonthSortKey(monthStrOrKey) {
  if (!monthStrOrKey) return 0;
  const key = displayToMonthKey(String(monthStrOrKey));
  if (/^\d{4}-\d{2}$/.test(key)) {
    const parts = key.split('-');
    return parseInt(parts[0], 10) * 100 + parseInt(parts[1], 10);
  }
  const parts = String(monthStrOrKey).trim().split(/\s+/);
  if (parts.length >= 2) {
    const mIdx = MONTHS_LIST.indexOf(parts[0]);
    const yr = parseInt(parts[1], 10) || 0;
    return yr * 100 + (mIdx >= 0 ? mIdx + 1 : 0);
  }
  return 0;
}

// Check if a month is within effective period
function isMonthInAssignmentPeriod(targetMonth, effectiveFrom, stoppedAt) {
  const targetKey = getFeeMonthSortKey(targetMonth);
  const fromKey = getFeeMonthSortKey(effectiveFrom);
  if (fromKey && targetKey < fromKey) return false;
  if (stoppedAt) {
    const toKey = getFeeMonthSortKey(stoppedAt);
    if (toKey && targetKey > toKey) return false;
  }
  return true;
}

// Get all active students from DB.students
function getActiveTransportStudents() {
  if (!DB || !Array.isArray(DB.students)) return [];
  return DB.students.filter(s => s && s.status === 'Active');
}

// Calculate total paid and discount for a student in a specific month
function getStudentMonthTransportAccounting(studentId, monthStrOrKey) {
  let paid = 0;
  let discount = 0;
  const targetKey = displayToMonthKey(monthStrOrKey);
  const targetDisplay = monthKeyToDisplay(monthStrOrKey);

  const payments = (DB.transport && Array.isArray(DB.transport.payments)) ? DB.transport.payments : [];
  payments.forEach(p => {
    if (p.studentId === studentId && !p.reversed && Array.isArray(p.allocations)) {
      p.allocations.forEach(al => {
        const alKey = displayToMonthKey(al.month);
        if (al.month === monthStrOrKey || al.month === targetDisplay || alKey === targetKey) {
          paid += (Number(al.paidAllocated) || 0);
          discount += (Number(al.discountAllocated) || 0);
        }
      });
    }
  });
  return { paid, discount };
}

// Calculate previous academic session dues for transport
function getStudentPreviousSessionTransportDues(studentId, activeSession) {
  if (!studentId) return 0;
  const assignments = (DB.transport && DB.transport.assignments) ? DB.transport.assignments : {};
  const assign = assignments[studentId];
  if (!assign) return 0;

  const [curStartYear] = parseSessionYears(activeSession || (DB.settings && DB.settings.currentSession) || '2026–27');
  const sessionStartSortKey = curStartYear * 100 + 4; // April of session start year e.g. 202604

  let prevDues = 0;
  const fromKey = getFeeMonthSortKey(assign.effectiveFrom);
  if (fromKey && fromKey < sessionStartSortKey) {
    const toKey = assign.stoppedAt ? Math.min(getFeeMonthSortKey(assign.stoppedAt), sessionStartSortKey - 1) : (sessionStartSortKey - 1);
    let curKey = fromKey;
    while (curKey <= toKey) {
      const yr = Math.floor(curKey / 100);
      const mo = curKey % 100;
      const moStr = `${SYS_MONTHS[mo - 1]} ${yr}`;
      const fee = Number(assign.monthlyFee) || 0;
      const { paid, discount } = getStudentMonthTransportAccounting(studentId, moStr);
      const bal = Math.max(0, fee - discount - paid);
      prevDues += bal;

      if (mo === 12) {
        curKey = (yr + 1) * 100 + 1;
      } else {
        curKey = yr * 100 + (mo + 1);
      }
    }
  }
  return prevDues;
}

// School Logo Data URI Helper (Neutral default SVG emblem)
const DEFAULT_SCHOOL_LOGO_DATA_URI = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMDAgMjAwIiB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIj4KICA8ZGVmcz4KICAgIDxsaW5lYXJHcmFkaWVudCBpZD0iY3Jlc3RHcmFkIiB4MT0iMCUiIHkxPSIwJSIgeDI9IjEwMCUiIHkyPSIxMDAlIj4KICAgICAgPHN0b3Agb2Zmc2V0PSIwJSIgc3RvcC1jb2xvcj0iIzFlM2E4YSIgLz4KICAgICAgPHN0b3Agb2Zmc2V0PSIxMDAlIiBzdG9wLWNvbG9yPSIjMGYxNzJhIiAvPgogICAgPC9saW5lYXJHcmFkaWVudD4KICAgIDxsaW5lYXJHcmFkaWVudCBpZD0iZ29sZEdyYWQiIHgxPSIwJSIgeTE9IjAlIiB4Mj0iMTAwJSIgeTI9IjEwMCUiPgogICAgICA8c3RvcCBvZmZzZXQ9IjAlIiBzdG9wLWNvbG9yPSIjZmJiZjI0IiAvPgogICAgICA8c3RvcCBvZmZzZXQ9IjEwMCUiIHN0b3AtY29sb3I9IiNkOTc3MDYiIC8+CiAgICA8L2xpbmVhckdyYWRpZW50PgogICAgPGZpbHRlciBpZD0ic2hhZG93IiB4PSItMTAlIiB5PSItMTAlIiB3aWR0aD0iMTIwJSIgaGVpZ2h0PSIxMjAlIj4KICAgICAgPGZlRHJvcFNoYWRvdyBkeD0iMCIgZHk9IjIiIHN0ZERldmlhdGlvbj0iMyIgZmxvb2Qtb3BhY2l0eT0iMC4yNSIvPgogICAgPC9maWx0ZXI+CiAgPC9kZWZzPgoKICA8IS0tIE91dGVyIFJpbmcgLS0+CiAgPGNpcmNsZSBjeD0iMTAwIiBjeT0iMTAwIiByPSI5NCIgZmlsbD0idXJsKCNjcmVzdEdyYWQpIiBzdHJva2U9InVybCgjZ29sZEdyYWQpIiBzdHJva2Utd2lkdGg9IjQiIGZpbHRlcj0idXJsKCNzaGFkb3cpIiAvPgogIDxjaXJjbGUgY3g9IjEwMCIgY3k9IjEwMCIgcj0iODYiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZmZmZiIgc3Ryb2tlLXdpZHRoPSIxLjUiIHN0cm9rZS1kYXNoYXJyYXk9IjMsMyIgb3BhY2l0eT0iMC42IiAvPgoKICA8IS0tIElubmVyIENpcmNsZSBTaGllbGQgLS0+CiAgPGNpcmNsZSBjeD0iMTAwIiBjeT0iMTAwIiByPSI3NiIgZmlsbD0iIzFlMjkzYiIgc3Ryb2tlPSJ1cmwoI2dvbGRHcmFkKSIgc3Ryb2tlLXdpZHRoPSIyIiAvPgoKICA8IS0tIFN0YXJzIG9mIEV4Y2VsbGVuY2UgLS0+CiAgPGcgZmlsbD0iI2ZiYmYyNCI+CiAgICA8IS0tIENlbnRlciBUb3AgU3RhciAtLT4KICAgIDxwYXRoIGQ9Ik0gMTAwIDMyIEwgMTAyIDM4IEwgMTA4IDM4IEwgMTAzIDQyIEwgMTA1IDQ4IEwgMTAwIDQ0IEwgOTUgNDggTCA5NyA0MiBMIDkyIDM4IEwgOTggMzggWiIgLz4KICAgIDwhLS0gTGVmdCBTdGFyIC0tPgogICAgPHBhdGggZD0iTSA2OCA0NCBMIDY5LjUgNDguNSBMIDc0IDQ4LjUgTCA3MC41IDUxLjUgTCA3MiA1NiBMIDY4IDUzIEwgNjQgNTYgTCA2NS41IDUxLjUgTCA2MiA0OC41IEwgNjYuNSA0OC41IFoiIC8+CiAgICA8IS0tIFJpZ2h0IFN0YXIgLS0+CiAgICA8cGF0aCBkPSJNIDEzMiA0NCBMIDEzMy41IDQ4LjUgTCAxMzggNDguNSBMIDEzNC41IDUxLjUgTCAxMzYgNTYgTCAxMzIgNTMgTCAxMjggNTYgTCAxMjkuNSA1MS41IEwgMTI2IDQ4LjUgTCAxMzAuNSA0OC41IFoiIC8+CiAgPC9nPgoKICA8IS0tIEdyYWR1YXRpb24gQ2FwIChNb3J0YXJib2FyZCkgLS0+CiAgPGcgaWQ9ImdyYWQtY2FwIiB0cmFuc2Zvcm09InRyYW5zbGF0ZSgxMDAsIDc4KSI+CiAgICA8IS0tIENhcCBEaWFtb25kIFRvcCAtLT4KICAgIDxwb2x5Z29uIHBvaW50cz0iMCwtMTggNDIsLTMgMCwxMiAtNDIsLTMiIGZpbGw9IiNmZmZmZmYiIHN0cm9rZT0iI2UyZThmMCIgc3Ryb2tlLXdpZHRoPSIxIiAvPgogICAgPCEtLSBDYXAgU2t1bGwgQmFzZSAtLT4KICAgIDxwYXRoIGQ9Ik0gLTIyLDQgTCAtMjIsMTQgQyAtMjIsMjMgMjIsMjMgMjIsMTQgTCAyMiw0IFoiIGZpbGw9IiNjYmQ1ZTEiIC8+CiAgICA8IS0tIFRhc3NlbCBCdXR0b24gLS0+CiAgICA8Y2lyY2xlIGN4PSIwIiBjeT0iLTMiIHI9IjMiIGZpbGw9IiNmYmJmMjQiIC8+CiAgICA8IS0tIFRhc3NlbCBSaWJib24gJiBGcmluZ2UgLS0+CiAgICA8cGF0aCBkPSJNIDAsLTMgQyAxOCwzIDI4LDEyIDMwLDIyIiBmaWxsPSJub25lIiBzdHJva2U9IiNmYmJmMjQiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiAvPgogICAgPHBvbHlnb24gcG9pbnRzPSIyOCwyMiAzMiwyMiAzMywzMCAyNywzMCIgZmlsbD0iI2ZiYmYyNCIgLz4KICA8L2c+CgogIDwhLS0gT3BlbiBCb29rIFN5bWJvbCBvZiBLbm93bGVkZ2UgLS0+CiAgPGcgaWQ9Im9wZW4tYm9vayIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMTAwLCAxMzQpIiBmaWxsPSIjZmZmZmZmIiBzdHJva2U9IiMwZjE3MmEiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPgogICAgPCEtLSBTcGluZSBDZW50cmFsIEJhc2UgLS0+CiAgICA8cGF0aCBkPSJNIDAsLTE4IEwgMCw4IiBzdHJva2U9IiNjYmQ1ZTEiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiAvPgogICAgPCEtLSBMZWZ0IFBhZ2UgLS0+CiAgICA8cGF0aCBkPSJNIDAsLTE2IEMgLTE4LC0yNCAtMzYsLTIyIC00NiwtMTYgTCAtNDYsNiBDIC0zNiwwIC0xOCwtMiAwLDYgWiIgZmlsbD0iI2Y4ZmFmYyIgc3Ryb2tlPSIjY2JkNWUxIiBzdHJva2Utd2lkdGg9IjEuNSIgLz4KICAgIDwhLS0gUmlnaHQgUGFnZSAtLT4KICAgIDxwYXRoIGQ9Ik0gMCwtMTYgQyAxOCwtMjQgMzYsLTIyIDQ2LC0xNiBMIDQ2LDYgQyAzNiwwIDE4LC0yIDAsNiBaIiBmaWxsPSIjZmZmZmZmIiBzdHJva2U9IiNjYmQ1ZTEiIHN0cm9rZS13aWR0aD0iMS41IiAvPgogICAgPCEtLSBQYWdlIFJ1bGluZyBMaW5lcyAoTGVmdCkgLS0+CiAgICA8bGluZSB4MT0iLTEwIiB5MT0iLTEwIiB4Mj0iLTM4IiB5Mj0iLTYiIHN0cm9rZT0iIzk0YTNiOCIgc3Ryb2tlLXdpZHRoPSIxLjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgLz4KICAgIDxsaW5lIHgxPSItMTAiIHkxPSItMyIgeDI9Ii0zOCIgeTI9IjEiIHN0cm9rZT0iIzk0YTNiOCIgc3Ryb2tlLXdpZHRoPSIxLjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgLz4KICAgIDxsaW5lIHgxPSItMTAiIHkxPSI0IiB4Mj0iLTM0IiB5Mj0iNyIgc3Ryb2tlPSIjOTRhM2I4IiBzdHJva2Utd2lkdGg9IjEuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiAvPgogICAgPCEtLSBQYWdlIFJ1bGluZyBMaW5lcyAoUmlnaHQpIC0tPgogICAgPGxpbmUgeDE9IjEwIiB5MT0iLTEwIiB4Mj0iMzgiIHkyPSItNiIgc3Ryb2tlPSIjOTRhM2I4IiBzdHJva2Utd2lkdGg9IjEuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiAvPgogICAgPGxpbmUgeDE9IjEwIiB5MT0iLTMiIHgyPSIzOCIgeTI9IjEiIHN0cm9rZT0iIzk0YTNiOCIgc3Ryb2tlLXdpZHRoPSIxLjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgLz4KICAgIDxsaW5lIHgxPSIxMCIgeTE9IjQiIHgyPSIzNCIgeTI9IjciIHN0cm9rZT0iIzk0YTNiOCIgc3Ryb2tlLXdpZHRoPSIxLjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgLz4KICA8L2c+CgogIDwhLS0gTGF1cmVsIC8gT2xpdmUgR2FybGFuZCBCYXNlIC0tPgogIDxnIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZiYmYyNCIgc3Ryb2tlLXdpZHRoPSIxLjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgb3BhY2l0eT0iMC44NSI+CiAgICA8cGF0aCBkPSJNIDQ1IDE0MCBDIDQwIDE1NiA1NSAxNjggNzUgMTcxIiAvPgogICAgPHBhdGggZD0iTSAxNTUgMTQwIEMgMTYwIDE1NiAxNDUgMTY4IDEyNSAxNzEiIC8+CiAgICA8Y2lyY2xlIGN4PSIxMDAiIGN5PSIxNzIiIHI9IjMiIGZpbGw9IiNmYmJmMjQiIC8+CiAgPC9nPgo8L3N2Zz4K';

function getSchoolLogoDataUri() {
  if (DB && DB.settings && DB.settings.schoolLogo && String(DB.settings.schoolLogo).startsWith('data:image/')) {
    return DB.settings.schoolLogo;
  }
  return DEFAULT_SCHOOL_LOGO_DATA_URI;
}

function getAuthoritativeActiveSession() {
  let sess = (typeof getActiveAcademicSession === 'function') ? getActiveAcademicSession() : '';
  if (!sess && typeof determineActiveAcademicSession === 'function') {
    const det = determineActiveAcademicSession();
    sess = (det && det.activeSessionName) || '';
  }
  return sess || '2026–27';
}

// ============================================================
// PAGE INITIALIZATION & FILTERS
// ============================================================

function initTransportPage() {
  if (!DB.transport) {
    DB.transport = { stops: [], assignments: {}, payments: [], nextReceiptSeq: 1 };
  }

  // Authoritative session detection (cannot be manually overridden)
  transportState.activeSession = getAuthoritativeActiveSession();

  // Set default month to current local date month (e.g. "October 2026")
  const sessionMonths = getTransportAcademicMonths(transportState.activeSession);
  if (!transportState.activeMonth || !sessionMonths.includes(transportState.activeMonth)) {
    const now = new Date();
    const curMoName = SYS_MONTHS[now.getMonth()];
    const curYr = now.getFullYear();
    const candidate = `${curMoName} ${curYr}`;
    transportState.activeMonth = sessionMonths.includes(candidate) ? candidate : sessionMonths[0];
  }

  populateTransportFilterDropdowns();
  populateStopEffectiveMonthDropdown();
  populateAssignModalDropdowns();
  renderTransportLedger();
}

function populateStopEffectiveMonthDropdown() {
  const effEl = document.getElementById('tr_effective_from');
  if (!effEl) return;
  effEl.innerHTML = '';
  const months = getTransportAcademicMonths(transportState.activeSession);
  months.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    if (m === transportState.activeMonth) opt.selected = true;
    effEl.appendChild(opt);
  });
}

function populateTransportFilterDropdowns() {
  // 1. Session Badge and Hidden Input (Authoritative Active Session)
  const sessBadge = document.getElementById('tr_active_session_badge');
  if (sessBadge) {
    sessBadge.textContent = transportState.activeSession;
  }
  const sessEl = document.getElementById('tr_f_session');
  if (sessEl) {
    sessEl.value = transportState.activeSession;
  }

  // 2. Month Dropdown
  const moEl = document.getElementById('tr_f_month');
  if (moEl) {
    moEl.innerHTML = '';
    const months = getTransportAcademicMonths(transportState.activeSession);
    months.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      if (m === transportState.activeMonth) opt.selected = true;
      moEl.appendChild(opt);
    });
  }

  // 3. Class Dropdown
  const clsEl = document.getElementById('tr_f_class');
  if (clsEl) {
    clsEl.innerHTML = '<option value="all">All Classes</option>';
    CLASSES.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = (c === 'NC' ? 'Nursery' : (c === 'LKG' || c === 'UKG' ? c : 'Class ' + c));
      if (c === transportState.activeClass) opt.selected = true;
      clsEl.appendChild(opt);
    });
  }

  // 4. Status Dropdown
  const stEl = document.getElementById('tr_f_status');
  if (stEl) {
    stEl.value = transportState.activeStatus;
  }

  // 5. Stop Dropdown
  const stopEl = document.getElementById('tr_f_stop');
  if (stopEl) {
    stopEl.innerHTML = '<option value="all">All Stops</option>';
    const stops = (DB.transport && Array.isArray(DB.transport.stops)) ? DB.transport.stops : [];
    stops.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.name;
      opt.textContent = s.name + (s.active === false ? ' (Inactive)' : '');
      if (s.name === transportState.activeStop) opt.selected = true;
      stopEl.appendChild(opt);
    });
  }
}

function applyTransportFilters() {
  const sessEl = document.getElementById('tr_f_session');
  const moEl = document.getElementById('tr_f_month');
  const clsEl = document.getElementById('tr_f_class');
  const stEl = document.getElementById('tr_f_status');
  const stopEl = document.getElementById('tr_f_stop');

  const oldSession = transportState.activeSession;
  if (sessEl) transportState.activeSession = sessEl.value;
  if (sessEl && sessEl.value !== oldSession) {
    const sessionMonths = getTransportAcademicMonths(transportState.activeSession);
    transportState.activeMonth = sessionMonths[0];
    populateTransportFilterDropdowns();
    populateStopEffectiveMonthDropdown();
  } else {
    if (moEl) transportState.activeMonth = moEl.value;
  }

  if (clsEl) transportState.activeClass = clsEl.value;
  if (stEl) transportState.activeStatus = stEl.value;
  if (stopEl) transportState.activeStop = stopEl.value;

  transportState.isDefaultView = (
    transportState.activeClass === 'all' &&
    transportState.activeStatus === 'all' &&
    transportState.activeStop === 'all' &&
    !transportState.quickSearch
  );

  renderTransportLedger();
}

function resetTransportFilters() {
  transportState.activeSession = getAuthoritativeActiveSession();
  const sessionMonths = getTransportAcademicMonths(transportState.activeSession);
  const now = new Date();
  const curMoName = SYS_MONTHS[now.getMonth()];
  const curYr = now.getFullYear();
  const candidate = `${curMoName} ${curYr}`;
  transportState.activeMonth = sessionMonths.includes(candidate) ? candidate : sessionMonths[0];

  transportState.activeClass = 'all';
  transportState.activeStatus = 'all';
  transportState.activeStop = 'all';
  transportState.quickSearch = '';
  transportState.isDefaultView = true;

  const qs = document.getElementById('tr_quick_search');
  if (qs) qs.value = '';

  populateTransportFilterDropdowns();
  populateStopEffectiveMonthDropdown();
  renderTransportLedger();
}

function onTransportQuickSearch(query) {
  transportState.quickSearch = (query || '').trim().toLowerCase();
  transportState.isDefaultView = !transportState.quickSearch && transportState.activeClass === 'all' && transportState.activeStatus === 'all' && transportState.activeStop === 'all';
  renderTransportLedger();
}

// Build transport ledger rows for active month
function buildTransportLedgerRows() {
  const assignments = (DB.transport && DB.transport.assignments) ? DB.transport.assignments : {};
  const activeStudents = getActiveTransportStudents();
  const rows = [];
  const curMonthSortKey = getFeeMonthSortKey(getCurrentMonthKey());
  const activeMonthSortKey = getFeeMonthSortKey(transportState.activeMonth);

  activeStudents.forEach(st => {
    const assign = assignments[st.id];
    if (!assign) return;

    // Check if assignment covers the active month
    const coversMonth = isMonthInAssignmentPeriod(transportState.activeMonth, assign.effectiveFrom, assign.stoppedAt);
    if (!coversMonth && !assign.active) return;

    const monthlyFee = Number(assign.monthlyFee) || 0;
    const { paid, discount } = getStudentMonthTransportAccounting(st.id, transportState.activeMonth);
    const due = Math.max(0, monthlyFee - discount - paid);
    const prevDues = getStudentPreviousSessionTransportDues(st.id, transportState.activeSession);

    let status = 'Due';
    if (!coversMonth) {
      status = 'Not Applicable';
    } else if (due === 0 && (paid > 0 || discount >= monthlyFee)) {
      status = 'Paid';
    } else if (activeMonthSortKey > curMonthSortKey && paid === 0) {
      status = 'Upcoming';
    } else if (paid > 0 && due > 0) {
      status = 'Partial';
    }

    const stClass = st.cls + (st.section ? ' ' + st.section : '');

    rows.push({
      id: st.id,
      studentId: st.id,
      name: st.name,
      admNo: st.admno,
      class: stClass,
      rawClass: st.cls,
      pickup: assign.pickupStopName || '-',
      drop: assign.dropStopName || '-',
      monthlyFee,
      paid,
      discount,
      prevDues,
      due,
      status,
      active: assign.active,
      effectiveFrom: assign.effectiveFrom,
      stoppedAt: assign.stoppedAt
    });
  });

  return rows;
}

function renderTransportLedger() {
  const titleEl = document.getElementById('tr_ledger_title');
  if (titleEl) {
    titleEl.textContent = `Student Transport Ledger (${transportState.activeMonth || 'October 2026'})`;
  }

  const tbody = document.getElementById('tr_ledger_tbody');
  if (!tbody) return;

  const allRows = buildTransportLedgerRows();

  // Filter rows
  const filtered = allRows.filter(row => {
    // Class filter
    if (transportState.activeClass !== 'all') {
      if (row.rawClass !== transportState.activeClass && row.class !== transportState.activeClass) {
        return false;
      }
    }

    // Status filter
    if (transportState.activeStatus !== 'all') {
      if (row.status.toLowerCase() !== transportState.activeStatus.toLowerCase()) {
        return false;
      }
    }

    // Stop filter
    if (transportState.activeStop !== 'all') {
      const stp = transportState.activeStop.toLowerCase();
      const pMatch = String(row.pickup || '').toLowerCase() === stp;
      const dMatch = String(row.drop || '').toLowerCase() === stp;
      if (!pMatch && !dMatch) return false;
    }

    // Quick search filter
    if (transportState.quickSearch) {
      const q = transportState.quickSearch;
      const nMatch = String(row.name || '').toLowerCase().includes(q);
      const aMatch = String(row.admNo || '').toLowerCase().includes(q);
      const cMatch = String(row.class || '').toLowerCase().includes(q);
      if (!nMatch && !aMatch && !cMatch) return false;
    }

    return true;
  });

  // Render rows
  if (allRows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:36px 20px;color:#64748b;font-size:13px">
      No students currently assigned to transport. Click "<strong>Assign / Update Student</strong>" to assign a student.
    </td></tr>`;
  } else if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:36px 20px;color:#64748b;font-size:13px">
      No student transport records match the selected filters.
    </td></tr>`;
  } else {
    tbody.innerHTML = filtered.map((row, idx) => {
      let badgeClass = 'tr-badge-due';
      if (row.status === 'Paid') badgeClass = 'tr-badge-paid';
      else if (row.status === 'Partial') badgeClass = 'tr-badge-partial';
      else if (row.status === 'Upcoming') badgeClass = 'tr-badge-upcoming';
      else if (row.status === 'Not Applicable') badgeClass = 'tr-badge-na';

      return `<tr>
        <td style="color:#64748b;font-weight:600">${idx + 1}</td>
        <td style="font-weight:700;color:#0f172a">${escapeHtml(row.name)}</td>
        <td style="color:#475569;font-weight:600">${escapeHtml(row.admNo)}</td>
        <td style="color:#475569">${escapeHtml(row.class)}</td>
        <td style="color:#1e293b">${escapeHtml(row.pickup || '-')}</td>
        <td class="text-right" style="font-weight:600">₹ ${Number(row.monthlyFee).toLocaleString('en-IN')}</td>
        <td class="text-right" style="font-weight:600;color:#16a34a">₹ ${Number(row.paid).toLocaleString('en-IN')}</td>
        <td class="text-right" style="font-weight:600;color:${row.prevDues > 0 ? '#c0392b' : '#64748b'}">₹ ${Number(row.prevDues).toLocaleString('en-IN')}</td>
        <td class="text-right" style="font-weight:700;color:${row.due > 0 ? '#c0392b' : '#1e293b'}">₹ ${Number(row.due).toLocaleString('en-IN')}</td>
        <td class="text-center"><span class="tr-badge ${badgeClass}">${row.status}</span></td>
        <td class="text-center">
          <div class="tr-actions-cell" style="justify-content:center">
            <button class="btn bp bsm" onclick="openCollectTransportModal(${row.id})" style="padding:4px 10px;font-size:11.5px">Collect Fee</button>
            <button class="btn bo bsm" onclick="openStudentTransportDetailsModal(${row.id})" title="Student Actions" style="padding:4px 8px;font-size:11.5px;font-weight:700">•••</button>
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  // Update Summary Cards
  renderTransportSummaryCards(filtered);
}

function renderTransportSummaryCards(filteredList) {
  const colEl = document.getElementById('tr_stat_collected');
  const colSubEl = document.getElementById('tr_stat_collected_sub');
  const dueEl = document.getElementById('tr_stat_pending');
  const dueSubEl = document.getElementById('tr_stat_pending_sub');
  const stEl = document.getElementById('tr_stat_students');
  const stopsEl = document.getElementById('tr_stat_stops');

  const moShort = (transportState.activeMonth || 'October 2026').replace(/(\w{3})\w*\s*(\d{4})/, '$1 $2');
  const clsLabel = transportState.activeClass === 'all' ? 'All Classes' : (transportState.activeClass === 'NC' ? 'Nursery' : 'Class ' + transportState.activeClass);
  const subText = `(${moShort} • ${clsLabel})`;

  const totalCollected = filteredList.reduce((acc, r) => acc + (Number(r.paid) || 0), 0);
  const totalDue = filteredList.reduce((acc, r) => acc + (Number(r.due) || 0), 0);
  const activeCount = filteredList.length;
  const activeStops = (DB.transport && Array.isArray(DB.transport.stops)) ? DB.transport.stops.filter(s => s.active !== false).length : 0;

  if (colEl) colEl.textContent = `₹ ${totalCollected.toLocaleString('en-IN')}`;
  if (colSubEl) colSubEl.textContent = subText;
  if (dueEl) dueEl.textContent = `₹ ${totalDue.toLocaleString('en-IN')}`;
  if (dueSubEl) dueSubEl.textContent = subText;
  if (stEl) stEl.textContent = String(activeCount);
  if (stopsEl) stopsEl.textContent = String(activeStops);
}

// ============================================================
// MODAL 1: MANAGE STOPS
// ============================================================

function openManageStopsModal() {
  populateStopEffectiveMonthDropdown();
  resetTransportStopForm();
  renderTransportStopsTable();
  openM('modalManageStops');
}

function renderTransportStopsTable() {
  const tbody = document.getElementById('tr_stops_tbody');
  const countEl = document.getElementById('tr_stops_list_count');
  const stops = (DB.transport && Array.isArray(DB.transport.stops)) ? DB.transport.stops : [];

  if (countEl) countEl.textContent = String(stops.length);
  if (!tbody) return;

  if (stops.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:#64748b;font-size:12px">No transport stops configured yet. Use the form above to add your first stop.</td></tr>`;
    return;
  }

  tbody.innerHTML = stops.map(s => {
    const isActive = s.active !== false;
    const statusBadge = isActive
      ? `<span class="tr-badge tr-badge-paid">Active</span>`
      : `<span class="tr-badge tr-badge-due">Inactive</span>`;
    const toggleLabel = isActive ? 'Deactivate' : 'Activate';

    return `<tr>
      <td style="font-weight:700;color:#0f172a">${escapeHtml(s.name)}</td>
      <td style="color:#475569">${escapeHtml(s.route || '-')}</td>
      <td class="text-right">${s.distance ? Number(s.distance) + ' km' : '-'}</td>
      <td class="text-right" style="font-weight:700;color:var(--red)">₹ ${Number(s.fee).toLocaleString('en-IN')}</td>
      <td style="color:#64748b">${escapeHtml(s.effectiveFrom || s.effective || '-')}</td>
      <td class="text-center">${statusBadge}</td>
      <td class="text-center">
        <div style="display:flex;align-items:center;justify-content:center;gap:6px">
          <button class="btn bo bsm" onclick="editTransportStop('${s.id}')" style="padding:2px 8px;font-size:11px">Edit</button>
          <button class="btn bo bsm" onclick="toggleTransportStop('${s.id}')" style="padding:2px 8px;font-size:11px">${toggleLabel}</button>
          <button class="btn bd bsm" onclick="deleteTransportStop('${s.id}')" style="padding:2px 8px;font-size:11px">Delete</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function resetTransportStopForm() {
  const nameEl = document.getElementById('tr_stop_name');
  const routeEl = document.getElementById('tr_route_name');
  const distEl = document.getElementById('tr_distance');
  const feeEl = document.getElementById('tr_monthly_fee');
  const effEl = document.getElementById('tr_effective_from');
  const actEl = document.getElementById('tr_stop_active');
  const actLbl = document.getElementById('tr_stop_active_label');
  const editIdEl = document.getElementById('tr_stop_edit_id');
  const titleEl = document.getElementById('tr_stop_form_title');
  const btnSave = document.getElementById('tr_btn_save_stop');
  const btnReset = document.getElementById('tr_btn_reset_stop_form');

  if (nameEl) nameEl.value = '';
  if (routeEl) routeEl.value = '';
  if (distEl) distEl.value = '';
  if (feeEl) feeEl.value = '';
  if (effEl) effEl.value = transportState.activeMonth || 'October 2026';
  if (actEl) actEl.checked = true;
  if (actLbl) actLbl.textContent = 'Active';
  if (editIdEl) editIdEl.value = '';
  if (titleEl) titleEl.textContent = 'Add New Transport Stop';
  if (btnSave) btnSave.textContent = 'Save Stop';
  if (btnReset) btnReset.style.display = 'none';
}

function editTransportStop(stopId) {
  const stops = (DB.transport && Array.isArray(DB.transport.stops)) ? DB.transport.stops : [];
  const s = stops.find(x => x.id === stopId);
  if (!s) return;

  const nameEl = document.getElementById('tr_stop_name');
  const routeEl = document.getElementById('tr_route_name');
  const distEl = document.getElementById('tr_distance');
  const feeEl = document.getElementById('tr_monthly_fee');
  const effEl = document.getElementById('tr_effective_from');
  const actEl = document.getElementById('tr_stop_active');
  const actLbl = document.getElementById('tr_stop_active_label');
  const editIdEl = document.getElementById('tr_stop_edit_id');
  const titleEl = document.getElementById('tr_stop_form_title');
  const btnSave = document.getElementById('tr_btn_save_stop');
  const btnReset = document.getElementById('tr_btn_reset_stop_form');

  if (nameEl) nameEl.value = s.name || '';
  if (routeEl) routeEl.value = s.route || '';
  if (distEl) distEl.value = s.distance || '';
  if (feeEl) feeEl.value = s.fee || '';
  if (effEl) effEl.value = s.effectiveFrom || s.effective || transportState.activeMonth;
  if (actEl) actEl.checked = s.active !== false;
  if (actLbl) actLbl.textContent = (s.active !== false) ? 'Active' : 'Inactive';
  if (editIdEl) editIdEl.value = s.id;
  if (titleEl) titleEl.textContent = `Edit Stop: ${s.name}`;
  if (btnSave) btnSave.textContent = 'Update Stop';
  if (btnReset) btnReset.style.display = 'inline-block';
}

function saveTransportStop() {
  const name = (document.getElementById('tr_stop_name')?.value || '').trim();
  const route = (document.getElementById('tr_route_name')?.value || '').trim();
  const distance = parseFloat(document.getElementById('tr_distance')?.value) || 0;
  const fee = parseFloat(document.getElementById('tr_monthly_fee')?.value) || 0;
  const effective = (document.getElementById('tr_effective_from')?.value || '').trim();
  const active = !!document.getElementById('tr_stop_active')?.checked;
  const editId = (document.getElementById('tr_stop_edit_id')?.value || '').trim();

  if (!name) {
    showToast('Stop Name is required.', 'error');
    return;
  }
  if (fee <= 0) {
    showToast('Monthly Fee must be greater than ₹ 0.', 'error');
    return;
  }

  if (!DB.transport) DB.transport = { stops: [], assignments: {}, payments: [], nextReceiptSeq: 1 };
  if (!Array.isArray(DB.transport.stops)) DB.transport.stops = [];

  // Check duplicate stop name (case-insensitive) excluding the stop currently being edited
  const isDuplicate = DB.transport.stops.some(s => s.id !== editId && s.name.trim().toLowerCase() === name.toLowerCase());
  if (isDuplicate) {
    showToast(`A stop with the name "${name}" already exists.`, 'error');
    return;
  }

  if (editId) {
    const idx = DB.transport.stops.findIndex(s => s.id === editId);
    if (idx >= 0) {
      DB.transport.stops[idx] = {
        ...DB.transport.stops[idx],
        name,
        route,
        distance,
        fee,
        effectiveFrom: effective,
        active
      };
    }
  } else {
    DB.transport.stops.push({
      id: 'stop_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      name,
      route,
      distance,
      fee,
      effectiveFrom: effective || transportState.activeMonth,
      active
    });
  }

  saveDB(true);
  resetTransportStopForm();
  renderTransportStopsTable();
  populateTransportFilterDropdowns();
  populateAssignModalDropdowns();
  renderTransportLedger();
  showToast(`Transport stop "${name}" saved successfully!`, 'success');
}

function toggleTransportStop(stopId) {
  if (!DB.transport || !Array.isArray(DB.transport.stops)) return;
  const stop = DB.transport.stops.find(s => s.id === stopId);
  if (!stop) return;

  stop.active = (stop.active === false);
  saveDB(true);
  renderTransportStopsTable();
  populateTransportFilterDropdowns();
  populateAssignModalDropdowns();
  renderTransportLedger();
  showToast(`Stop "${stop.name}" is now ${stop.active ? 'Active' : 'Inactive'}.`, 'success');
}

function deleteTransportStop(stopId) {
  if (!DB.transport || !Array.isArray(DB.transport.stops)) return;
  const stop = DB.transport.stops.find(s => s.id === stopId);
  if (!stop) return;

  // Deletion safety: Check student assignments
  const assignments = DB.transport.assignments || {};
  const assignedStudents = Object.values(assignments).filter(a =>
    a && (a.pickupStopId === stopId || a.dropStopId === stopId ||
    (a.pickupStopName && a.pickupStopName.toLowerCase() === stop.name.toLowerCase()) ||
    (a.dropStopName && a.dropStopName.toLowerCase() === stop.name.toLowerCase()))
  );

  // Deletion safety: Check payment history
  const payments = Array.isArray(DB.transport.payments) ? DB.transport.payments : [];
  const referencedPayments = payments.filter(p =>
    (p.pickup && p.pickup.toLowerCase() === stop.name.toLowerCase()) ||
    (p.drop && p.drop.toLowerCase() === stop.name.toLowerCase())
  );

  if (assignedStudents.length > 0 || referencedPayments.length > 0) {
    const reasons = [];
    if (assignedStudents.length > 0) reasons.push(`${assignedStudents.length} student(s)`);
    if (referencedPayments.length > 0) reasons.push(`${referencedPayments.length} payment record(s)`);
    alert(`Cannot delete stop "${stop.name}" because it is currently assigned to or referenced in: ${reasons.join(' and ')}.\n\nPlease deactivate the stop instead to prevent new assignments without corrupting existing records.`);
    return;
  }

  if (!confirm(`Are you sure you want to permanently delete stop "${stop.name}"?`)) {
    return;
  }

  DB.transport.stops = DB.transport.stops.filter(s => s.id !== stopId);
  saveDB(true);
  renderTransportStopsTable();
  populateTransportFilterDropdowns();
  populateAssignModalDropdowns();
  renderTransportLedger();
  showToast(`Transport stop "${stop.name}" deleted successfully.`, 'success');
}

// ============================================================
// MODAL 2: ASSIGN / UPDATE STUDENT TRANSPORT
// ============================================================

function populateAssignModalDropdowns() {
  // Populate class filter
  const clsFilter = document.getElementById('tr_assign_class_filter');
  if (clsFilter && clsFilter.options.length <= 1) {
    clsFilter.innerHTML = '<option value="all">All Classes</option>';
    CLASSES.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = (c === 'NC' ? 'Nursery' : (c === 'LKG' || c === 'UKG' ? c : 'Class ' + c));
      clsFilter.appendChild(opt);
    });
  }

  // Active stops for dropdowns
  const stops = (DB.transport && Array.isArray(DB.transport.stops)) ? DB.transport.stops : [];
  const activeStops = stops.filter(s => s.active !== false);

  const sSelect = document.getElementById('tr_assign_stop');
  const pSelect = document.getElementById('tr_assign_pickup_stop');
  const dSelect = document.getElementById('tr_assign_drop_stop');

  [sSelect, pSelect, dSelect].forEach(sel => {
    if (!sel) return;
    sel.innerHTML = '';
    if (activeStops.length === 0) {
      sel.innerHTML = '<option value="">No active stops configured</option>';
    } else {
      activeStops.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = `${s.name} (₹ ${s.fee}/month)`;
        sel.appendChild(opt);
      });
    }
  });

  // Effective Month dropdown
  const effSelect = document.getElementById('tr_assign_effective_from');
  if (effSelect) {
    effSelect.innerHTML = '';
    const sessionMonths = getTransportAcademicMonths(transportState.activeSession);
    sessionMonths.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      if (m === transportState.activeMonth) opt.selected = true;
      effSelect.appendChild(opt);
    });
  }

  // Hidden student select for backward compatibility
  const stSelect = document.getElementById('tr_assign_student');
  if (stSelect) {
    stSelect.innerHTML = '';
    const activeStudents = getActiveTransportStudents();
    activeStudents.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      const clsText = s.cls + (s.section ? ' ' + s.section : '');
      opt.textContent = `${s.name} (${s.admno}) - Class ${clsText}`;
      stSelect.appendChild(opt);
    });
  }

  renderAssignStudentList();
}

function onAssignStudentFilterInput() {
  transportState.assignSearch = (document.getElementById('tr_assign_search_input')?.value || '').trim().toLowerCase();
  transportState.assignClassFilter = (document.getElementById('tr_assign_class_filter')?.value || 'all').trim();
  transportState.assignStatusFilter = (document.getElementById('tr_assign_status_filter')?.value || 'all').trim();
  renderAssignStudentList();
}

function onAssignStudentSearchInput() {
  onAssignStudentFilterInput();
}

function onAssignStudentFilterChange() {
  onAssignStudentFilterInput();
}

function renderAssignStudentList() {
  const listEl = document.getElementById('tr_assign_student_list');
  const countEl = document.getElementById('tr_assign_student_list_count');
  if (!listEl) return;

  const activeStudents = getActiveTransportStudents();
  const assignments = (DB.transport && DB.transport.assignments) ? DB.transport.assignments : {};

  const filtered = activeStudents.filter(s => {
    // Class filter (strict normalized match)
    if (transportState.assignClassFilter && transportState.assignClassFilter !== 'all') {
      const sCls = String(s.cls || '').trim().toLowerCase();
      const fCls = String(transportState.assignClassFilter).trim().toLowerCase();
      if (sCls !== fCls) return false;
    }

    // Status filter
    const assign = assignments[s.id];
    const isAssigned = !!(assign && assign.active);
    if (transportState.assignStatusFilter === 'assigned' && !isAssigned) return false;
    if (transportState.assignStatusFilter === 'unassigned' && isAssigned) return false;

    // Search query
    if (transportState.assignSearch) {
      const q = transportState.assignSearch;
      const nMatch = String(s.name || '').toLowerCase().includes(q);
      const aMatch = String(s.admno || '').toLowerCase().includes(q);
      if (!nMatch && !aMatch) return false;
    }

    return true;
  });

  if (countEl) countEl.textContent = String(filtered.length);
  const totalCountEl = document.getElementById('tr_assign_student_count');
  if (totalCountEl && !countEl) totalCountEl.textContent = `${filtered.length} students`;

  if (filtered.length === 0) {
    listEl.innerHTML = `<div style="padding:20px;text-align:center;color:#64748b;font-size:12px">No matching students found</div>`;
    return;
  }

  const selectedId = transportState.selectedStudentForAssign;

  listEl.innerHTML = filtered.map(s => {
    const assign = assignments[s.id];
    const isAssigned = !!(assign && assign.active);
    const isSelected = selectedId === s.id;
    const badgeHtml = isAssigned
      ? `<span class="tr-badge tr-badge-paid" style="font-size:10.5px;padding:2px 6px">Assigned (₹${assign.monthlyFee})</span>`
      : `<span class="tr-badge tr-badge-due" style="font-size:10.5px;padding:2px 6px;background:#f1f5f9;color:#64748b">Not Assigned</span>`;

    return `
      <div class="tr-st-item ${isSelected ? 'active' : ''}" onclick="selectAssignStudent(${s.id})">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-weight:700;color:#0f172a;font-size:12.5px">${escapeHtml(s.name)}</span>
          ${badgeHtml}
        </div>
        <div style="font-size:11px;color:#64748b;margin-top:2px">
          Adm: <strong>${escapeHtml(s.admno)}</strong> • Class: <strong>${escapeHtml(s.cls + (s.section ? ' ' + s.section : ''))}</strong>
        </div>
      </div>
    `;
  }).join('');
}

function onAssignStudentSelected() {
  const sid = Number(document.getElementById('tr_assign_student_id')?.value) ||
    Number(document.getElementById('tr_assign_student')?.value) ||
    transportState.selectedStudentForAssign;
  if (sid) selectAssignStudent(sid);
}

function selectAssignStudent(studentId) {
  transportState.selectedStudentForAssign = Number(studentId);
  const student = (DB.students || []).find(s => s.id === Number(studentId));
  if (!student) return;

  // Update hidden inputs for backward compatibility and tests
  const idEl = document.getElementById('tr_assign_student_id');
  if (idEl) idEl.value = String(student.id);
  const stSelect = document.getElementById('tr_assign_student');
  if (stSelect) stSelect.value = String(student.id);

  // Update Left Column Selected Summary
  const nameEl = document.getElementById('tr_assign_selected_name');
  if (nameEl) nameEl.textContent = student.name;
  const metaEl = document.getElementById('tr_assign_selected_meta');
  if (metaEl) {
    const clsStr = student.cls + (student.section ? ' ' + student.section : '');
    const fatherInfo = student.father ? ` • Father: ${student.father}` : '';
    metaEl.textContent = `Adm No: ${student.admno} • Class: ${clsStr}${fatherInfo}`;
  }

  // Update selection UI in the list
  const listEl = document.getElementById('tr_assign_student_list');
  if (listEl) {
    listEl.querySelectorAll('.tr-st-item').forEach(el => el.classList.remove('active'));
    renderAssignStudentList();
  }

  // Render Selected Student Card
  const cardEl = document.getElementById('tr_assign_selected_card');
  const assignments = (DB.transport && DB.transport.assignments) ? DB.transport.assignments : {};
  const assign = assignments[student.id];
  const isAssigned = !!(assign && assign.active);

  if (cardEl) {
    cardEl.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <div style="font-size:14.5px;font-weight:700;color:#0f172a">${escapeHtml(student.name)}</div>
          <div style="font-size:11.5px;color:#475569;margin-top:2px">
            Adm No: <strong>${escapeHtml(student.admno)}</strong> • Class: <strong>${escapeHtml(student.cls + (student.section ? ' ' + student.section : ''))}</strong>
          </div>
          ${student.father ? `<div style="font-size:11px;color:#64748b">Father: ${escapeHtml(student.father)}</div>` : ''}
          ${student.contact ? `<div style="font-size:11px;color:#64748b">Contact: ${escapeHtml(student.contact)}</div>` : ''}
        </div>
        <div>
          ${isAssigned ? '<span class="tr-badge tr-badge-paid">Currently Assigned</span>' : '<span class="tr-badge tr-badge-due" style="background:#f1f5f9;color:#64748b">Not Assigned</span>'}
        </div>
      </div>
    `;
  }

  // Populate Right Column Form
  const statusBox = document.getElementById('tr_assign_status_box');
  const statusText = document.getElementById('tr_assign_status_text');
  const effSelect = document.getElementById('tr_assign_effective_from');
  const removeBtn = document.getElementById('tr_btn_remove_transport') || document.getElementById('tr_btn_assign_remove');

  if (isAssigned) {
    if (statusBox) statusBox.style.display = 'flex';
    const dropDisplay = (assign.dropStopName && assign.dropStopName !== '-') ? ` / ${assign.dropStopName}` : '';
    if (statusText) {
      statusText.textContent = `Assigned: ${assign.pickupStopName}${dropDisplay} • ₹${assign.monthlyFee}/month (Since ${assign.effectiveFrom || 'Start'})`;
      statusText.style.color = '#16a34a';
    }
    if (removeBtn) removeBtn.style.display = 'inline-block';

    if (assign.type === 'separate') {
      const sepRadio = document.querySelector('input[name="tr_assign_type"][value="separate"]');
      if (sepRadio) sepRadio.checked = true;
      onAssignTypeChanged();

      const pSel = document.getElementById('tr_assign_pickup_stop');
      const dSel = document.getElementById('tr_assign_drop_stop');
      if (pSel && assign.pickupStopId) pSel.value = assign.pickupStopId;
      if (dSel && assign.dropStopId) dSel.value = assign.dropStopId;
    } else {
      const singleRadio = document.querySelector('input[name="tr_assign_type"][value="single"]');
      if (singleRadio) singleRadio.checked = true;
      onAssignTypeChanged();

      const sSel = document.getElementById('tr_assign_stop');
      if (sSel && assign.pickupStopId) sSel.value = assign.pickupStopId;
    }

    if (effSelect && assign.effectiveFrom) {
      effSelect.value = assign.effectiveFrom;
    }
  } else {
    if (statusBox) statusBox.style.display = 'flex';
    if (statusText) {
      statusText.textContent = 'Not Assigned';
      statusText.style.color = '#64748b';
    }
    if (removeBtn) removeBtn.style.display = 'none';
    const singleRadio = document.querySelector('input[name="tr_assign_type"][value="single"]');
    if (singleRadio) singleRadio.checked = true;
    onAssignTypeChanged();
    if (effSelect) effSelect.value = transportState.activeMonth;
  }

  // Assignment History is ALWAYS visible in right column
  const historyBox = document.getElementById('tr_assign_history_box');
  if (historyBox) {
    if (assign && Array.isArray(assign.history) && assign.history.length > 0) {
      historyBox.innerHTML = `<ul style="margin:0 0 0 16px;padding:0;line-height:1.5">` +
        assign.history.slice(-5).reverse().map(h => {
          const dStr = new Date(h.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
          const dropTxt = (h.newDrop && h.newDrop !== '-') ? ` / ${h.newDrop}` : '';
          return `<li><strong>${dStr}</strong>: ${escapeHtml(h.action)} ${h.newPickup ? `(${escapeHtml(h.newPickup)}${dropTxt} - ₹${h.newFee || 0})` : ''}</li>`;
        }).join('') + `</ul>`;
    } else {
      historyBox.innerHTML = `<span style="color:#64748b;font-style:italic">No prior assignment history for this student.</span>`;
    }
  }

  onAssignStopSelected();
}

function openAssignTransportModal(studentId) {
  populateAssignModalDropdowns();

  if (!studentId) {
    const activeStudents = getActiveTransportStudents();
    if (activeStudents.length > 0) studentId = activeStudents[0].id;
  }

  if (studentId) {
    selectAssignStudent(studentId);
  }

  openM('modalAssignTransport');
}

function onAssignTypeChanged() {
  const isSingle = document.querySelector('input[name="tr_assign_type"]:checked')?.value === 'single';
  const singleWrap = document.getElementById('tr_single_stop_wrap');
  const sepWrap = document.getElementById('tr_separate_stops_wrap');

  if (singleWrap) singleWrap.style.display = isSingle ? 'flex' : 'none';
  if (sepWrap) sepWrap.style.display = isSingle ? 'none' : 'flex';

  onAssignStopSelected();
}

function onAssignStopSelected() {
  const isSingle = document.querySelector('input[name="tr_assign_type"]:checked')?.value === 'single';
  const stops = (DB.transport && Array.isArray(DB.transport.stops)) ? DB.transport.stops : [];
  let fee = 0;
  let noteText = '';

  if (isSingle) {
    const stopId = document.getElementById('tr_assign_stop')?.value;
    const s = stops.find(x => x.id === stopId);
    fee = s ? Number(s.fee) : 0;
    noteText = 'Standard single-stop rate applies.';
  } else {
    const pId = document.getElementById('tr_assign_pickup_stop')?.value;
    const dId = document.getElementById('tr_assign_drop_stop')?.value;
    const pStop = stops.find(x => x.id === pId);
    const dStop = stops.find(x => x.id === dId);
    const pFee = pStop ? Number(pStop.fee) : 0;
    const dFee = dStop ? Number(dStop.fee) : 0;

    if (pId && dId && pId === dId) {
      // Same stop selected for pickup & drop: charge single stop rate (no double charge)
      fee = pFee;
      noteText = 'Same stop selected for pickup & drop: single-stop rate applies (never double charged).';
    } else {
      fee = Math.max(pFee, dFee);
      noteText = `Different stops selected: higher stop rate applies (₹ ${pFee} vs ₹ ${dFee}).`;
    }
  }

  const feeDisp = document.getElementById('tr_assign_fee_display');
  if (feeDisp) {
    feeDisp.textContent = `₹ ${Number(fee).toLocaleString('en-IN')}`;
  }

  const noteEl = document.getElementById('tr_assign_fee_note');
  if (noteEl) {
    noteEl.textContent = noteText;
  }
}

function saveStudentTransportAssignment() {
  const sid = transportState.selectedStudentForAssign ||
    Number(document.getElementById('tr_assign_student_id')?.value) ||
    Number(document.getElementById('tr_assign_student')?.value);

  if (!sid) {
    showToast('Please select a student.', 'error');
    return;
  }

  const student = (DB.students || []).find(s => s.id === sid);
  if (!student) {
    showToast('Selected student record not found.', 'error');
    return;
  }

  const stops = (DB.transport && Array.isArray(DB.transport.stops)) ? DB.transport.stops : [];
  const isSingle = document.querySelector('input[name="tr_assign_type"]:checked')?.value === 'single';
  const effective = document.getElementById('tr_assign_effective_from')?.value || transportState.activeMonth;

  let pickupStop = null;
  let dropStop = null;
  let fee = 0;

  if (isSingle) {
    const sId = document.getElementById('tr_assign_stop')?.value;
    pickupStop = stops.find(x => x.id === sId);
    if (!pickupStop) {
      showToast('Please select a valid transport stop.', 'error');
      return;
    }
    fee = Number(pickupStop.fee);
  } else {
    const pId = document.getElementById('tr_assign_pickup_stop')?.value;
    const dId = document.getElementById('tr_assign_drop_stop')?.value;
    pickupStop = stops.find(x => x.id === pId);
    dropStop = stops.find(x => x.id === dId);
    if (!pickupStop || !dropStop) {
      showToast('Please select both pickup and drop stops.', 'error');
      return;
    }
    fee = (pickupStop.id === dropStop.id) ? Number(pickupStop.fee) : Math.max(Number(pickupStop.fee), Number(dropStop.fee));
  }

  if (!DB.transport) DB.transport = { stops: [], assignments: {}, payments: [], nextReceiptSeq: 1 };
  if (!DB.transport.assignments) DB.transport.assignments = {};

  const prev = DB.transport.assignments[sid] || null;
  const historyItem = {
    date: new Date().toISOString(),
    action: prev && prev.active ? 'Updated Assignment' : 'New Assignment',
    prevPickup: prev ? prev.pickupStopName : null,
    prevDrop: prev ? prev.dropStopName : null,
    prevFee: prev ? prev.monthlyFee : null,
    newPickup: pickupStop.name,
    newDrop: isSingle ? '-' : dropStop.name,
    newFee: fee,
    effectiveFrom: effective
  };

  const currentHist = (prev && Array.isArray(prev.history)) ? [...prev.history, historyItem] : [historyItem];

  DB.transport.assignments[sid] = {
    studentId: sid,
    admNo: student.admno,
    name: student.name,
    class: student.cls + (student.section ? ' ' + student.section : ''),
    active: true,
    type: isSingle ? 'single' : 'separate',
    pickupStopId: pickupStop.id,
    pickupStopName: pickupStop.name,
    dropStopId: isSingle ? null : dropStop.id,
    dropStopName: isSingle ? '-' : dropStop.name,
    monthlyFee: fee,
    effectiveFrom: effective,
    stoppedAt: null,
    history: currentHist
  };

  saveDB(true);
  closeM('modalAssignTransport');
  renderTransportLedger();
  showToast(`Transport assignment for ${student.name} saved successfully!`, 'success');
}

function promptRemoveTransport() {
  const sid = transportState.selectedStudentForAssign ||
    Number(document.getElementById('tr_assign_student_id')?.value) ||
    Number(document.getElementById('tr_assign_student')?.value);

  if (!sid) return;

  const student = (DB.students || []).find(s => s.id === sid);
  const stName = student ? student.name : 'this student';

  if (!confirm(`Are you sure you want to stop transport service for ${stName}?\n\nPast billing history and payments will remain safely preserved.`)) {
    return;
  }

  removeStudentTransport(sid, transportState.activeMonth);
}

function removeStudentTransport(studentId, effectiveMonth) {
  if (!DB.transport || !DB.transport.assignments || !DB.transport.assignments[studentId]) return;

  const assign = DB.transport.assignments[studentId];
  assign.active = false;
  assign.stoppedAt = effectiveMonth || transportState.activeMonth;

  if (!Array.isArray(assign.history)) assign.history = [];
  assign.history.push({
    date: new Date().toISOString(),
    action: 'Transport Service Removed',
    stoppedAt: assign.stoppedAt
  });

  saveDB(true);
  closeM('modalAssignTransport');
  closeM('modalStudentTransportDetails');
  renderTransportLedger();
  showToast(`Transport service removed for student. Historical records remain intact.`, 'success');
}

// ============================================================
// MODAL 3: COLLECT TRANSPORT FEE
// ============================================================

function openCollectTransportModal(studentId) {
  if (!studentId) {
    const activeRows = buildTransportLedgerRows();
    if (activeRows.length > 0) studentId = activeRows[0].id;
  }

  if (!studentId) {
    showToast('No students assigned to transport.', 'error');
    return;
  }

  selectCollectStudent(studentId);
  openM('modalCollectTransport');
}

function selectCollectStudent(studentId) {
  const student = (DB.students || []).find(s => s.id === Number(studentId));
  const assignments = (DB.transport && DB.transport.assignments) ? DB.transport.assignments : {};
  const assign = assignments[studentId];

  if (!student || !assign) {
    showToast('Transport assignment not found for this student.', 'error');
    return;
  }

  transportState.selectedStudentForCollect = {
    id: student.id,
    name: student.name,
    admNo: student.admno,
    class: student.cls + (student.section ? ' ' + student.section : ''),
    pickup: assign.pickupStopName || '-',
    drop: assign.dropStopName || '-',
    monthlyFee: Number(assign.monthlyFee) || 0,
    type: assign.type,
    effectiveFrom: assign.effectiveFrom,
    stoppedAt: assign.stoppedAt
  };

  // Populate Switcher Dropdown and Class filter
  populateCollectStudentSwitcher(student.id);

  // Student Details box
  const nameEl = document.getElementById('tr_col_student_name');
  const clsEl = document.getElementById('tr_col_student_class');
  const modeEl = document.getElementById('tr_col_student_mode');
  const stopEl = document.getElementById('tr_col_student_stop');
  const rateEl = document.getElementById('tr_col_student_rate');
  const statusEl = document.getElementById('tr_col_student_status');

  const isSeparate = assign.type === 'separate';
  if (nameEl) nameEl.textContent = `${student.name} (${student.admno})`;
  if (clsEl) clsEl.textContent = `Class: ${student.cls}${student.section ? ' ' + student.section : ''}`;
  if (modeEl) modeEl.textContent = isSeparate ? 'Pickup + Drop (Separate Stops)' : 'Single Stop';
  if (stopEl) stopEl.textContent = isSeparate ? `${assign.pickupStopName} / ${assign.dropStopName}` : assign.pickupStopName;
  if (rateEl) rateEl.textContent = `₹ ${Number(assign.monthlyFee).toLocaleString('en-IN')}`;
  if (statusEl) statusEl.textContent = assign.active ? 'Active' : 'Service Stopped';

  // Reset student-specific inputs when switching
  const discAmtInput = document.getElementById('tr_col_discount_amount');
  if (discAmtInput) discAmtInput.value = '0';
  const reasonInput = document.getElementById('tr_col_discount_reason');
  if (reasonInput) reasonInput.value = '';
  const discDisp = document.getElementById('tr_col_discount_display');
  if (discDisp) discDisp.textContent = '₹ 0';
  const modeSelect = document.getElementById('tr_col_payment_mode');
  if (modeSelect) modeSelect.value = 'Cash';

  const searchInput = document.getElementById('tr_col_search_input');
  if (searchInput) searchInput.value = '';
  const searchResults = document.getElementById('tr_col_search_results');
  if (searchResults) {
    searchResults.style.display = 'none';
    searchResults.innerHTML = '';
  }

  // Render month list with eligibility checks
  renderCollectMonthsList();
}

function onCollectSearchInput() {
  const query = (document.getElementById('tr_col_search_input')?.value || '').trim().toLowerCase();
  const resultsEl = document.getElementById('tr_col_search_results');
  if (!resultsEl) return;

  if (!query) {
    resultsEl.style.display = 'none';
    resultsEl.innerHTML = '';
    return;
  }

  const assignments = (DB.transport && DB.transport.assignments) ? DB.transport.assignments : {};
  const activeStudents = getActiveTransportStudents();
  const matches = activeStudents.filter(s => {
    if (!assignments[s.id]) return false;
    const n = String(s.name || '').toLowerCase();
    const a = String(s.admno || '').toLowerCase();
    return n.includes(query) || a.includes(query);
  });

  if (matches.length === 0) {
    resultsEl.innerHTML = '<div style="padding:8px 12px;font-size:12px;color:#64748b">No matching transport students</div>';
    resultsEl.style.display = 'block';
    return;
  }

  resultsEl.innerHTML = matches.map(s => {
    const assign = assignments[s.id];
    const clsText = s.cls + (s.section ? ' ' + s.section : '');
    return `
      <div style="padding:7px 12px;cursor:pointer;border-bottom:1px solid #f1f5f9;font-size:12px"
           onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='#fff'"
           onclick="selectCollectStudentFromSearch(${s.id})">
        <div style="font-weight:700;color:#0f172a">${escapeHtml(s.name)}</div>
        <div style="font-size:11px;color:#64748b">Adm: ${escapeHtml(s.admno)} • Class: ${clsText} • Stop: ${assign.pickupStopName}</div>
      </div>
    `;
  }).join('');
  resultsEl.style.display = 'block';
}

function selectCollectStudentFromSearch(studentId) {
  selectCollectStudent(studentId);
}

function onCollectClassFilterChange() {
  renderCollectStudentSwitcher(transportState.selectedStudentForCollect?.id);
}

function onCollectStudentFilterInput() {
  onCollectSearchInput();
}

function populateCollectStudentSwitcher(selectedId) {
  const clsEl = document.getElementById('tr_col_class_filter');
  if (clsEl && clsEl.options.length <= 1) {
    clsEl.innerHTML = '<option value="all">All Classes</option>';
    CLASSES.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = (c === 'NC' ? 'Nursery' : (c === 'LKG' || c === 'UKG' ? c : 'Class ' + c));
      clsEl.appendChild(opt);
    });
  }

  renderCollectStudentSwitcher(selectedId);
}

function renderCollectStudentSwitcher(selectedId) {
  const switcherEl = document.getElementById('tr_col_student_switcher');
  if (!switcherEl) return;

  const clsFilter = (document.getElementById('tr_col_class_filter')?.value || 'all').trim().toLowerCase();
  const assignments = (DB.transport && DB.transport.assignments) ? DB.transport.assignments : {};
  const activeStudents = getActiveTransportStudents();

  // Filter transport students by class filter only (search input has its own dropdown results)
  const transportStudents = activeStudents.filter(s => {
    if (!assignments[s.id]) return false;
    if (clsFilter !== 'all') {
      const sCls = String(s.cls || '').trim().toLowerCase();
      if (sCls !== clsFilter) return false;
    }
    return true;
  });

  switcherEl.innerHTML = '';
  if (transportStudents.length === 0) {
    switcherEl.innerHTML = '<option value="">No transport students in selected class</option>';
    return;
  }

  transportStudents.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    const clsText = s.cls + (s.section ? ' ' + s.section : '');
    opt.textContent = `${s.name} (${s.admno}) - Class ${clsText}`;
    if (s.id === Number(selectedId)) opt.selected = true;
    switcherEl.appendChild(opt);
  });
}

function onCollectStudentSwitcherChange(newStudentId) {
  if (newStudentId && Number(newStudentId) !== transportState.selectedStudentForCollect?.id) {
    selectCollectStudent(Number(newStudentId));
  }
}

function onCollectAdvanceToggle() {
  renderCollectMonthsList();
}

function onToggleSelectAllEligibleMonths() {
  const eligibleChecks = Array.from(document.querySelectorAll('.tr-due-mo-check:not(:disabled)'));
  if (eligibleChecks.length === 0) return;

  const allChecked = eligibleChecks.every(cb => cb.checked);
  eligibleChecks.forEach(cb => {
    cb.checked = !allChecked;
  });

  const btn = document.getElementById('tr_btn_select_all_months');
  if (btn) {
    btn.textContent = allChecked ? 'Select All' : 'Deselect All';
  }

  onTransportMonthToggle();
}

function renderCollectMonthsList() {
  const student = transportState.selectedStudentForCollect;
  if (!student) return;

  const assignments = (DB.transport && DB.transport.assignments) ? DB.transport.assignments : {};
  const assign = assignments[student.id];
  if (!assign) return;

  const sessionMonths = getTransportAcademicMonths(transportState.activeSession);
  const allowAdvance = !!document.getElementById('tr_col_allow_advance')?.checked;
  const curMonthSortKey = getFeeMonthSortKey(getCurrentMonthKey());

  const mListEl = document.getElementById('tr_col_months_list');
  if (!mListEl) return;

  const rowsHtml = [];
  let eligibleCount = 0;

  sessionMonths.forEach(m => {
    const isEnrolled = isMonthInAssignmentPeriod(m, assign.effectiveFrom, assign.stoppedAt);
    const mSortKey = getFeeMonthSortKey(m);
    const { paid, discount } = getStudentMonthTransportAccounting(student.id, m);
    const fee = Number(assign.monthlyFee) || 0;
    const balance = Math.max(0, fee - discount - paid);

    if (!isEnrolled) {
      // Not Applicable
      rowsHtml.push(`
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;opacity:0.6;font-size:12px">
          <div style="display:flex;align-items:center;gap:8px">
            <input type="checkbox" disabled>
            <span style="font-weight:600;color:#64748b">${m}</span>
          </div>
          <span class="tr-badge tr-badge-na">Not Applicable</span>
        </div>
      `);
      return;
    }

    if (balance === 0 && (paid > 0 || discount >= fee)) {
      // Paid
      rowsHtml.push(`
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;font-size:12px">
          <div style="display:flex;align-items:center;gap:8px">
            <input type="checkbox" disabled checked style="accent-color:#16a34a">
            <span style="font-weight:600;color:#166534">${m} (Paid: ₹${paid}${discount > 0 ? ' • Disc: ₹' + discount : ''})</span>
          </div>
          <span class="tr-badge tr-badge-paid">Paid</span>
        </div>
      `);
      return;
    }

    const isUpcoming = mSortKey > curMonthSortKey;

    if (isUpcoming && !allowAdvance) {
      // Upcoming but advance not enabled
      rowsHtml.push(`
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:6px;opacity:0.75;font-size:12px" title="Check 'Allow advance collection' above to collect for upcoming months">
          <div style="display:flex;align-items:center;gap:8px">
            <input type="checkbox" disabled>
            <span style="font-weight:600;color:#64748b">${m}</span>
          </div>
          <span class="tr-badge tr-badge-upcoming">Upcoming</span>
        </div>
      `);
      return;
    }

    // Due / Current Month OR Upcoming with advance enabled
    eligibleCount++;
    const isChecked = (m === transportState.activeMonth || eligibleCount === 1);
    const badgeHtml = isUpcoming
      ? `<span class="tr-badge tr-badge-upcoming">Advance</span>`
      : (paid > 0 ? `<span class="tr-badge tr-badge-partial">Partial</span>` : `<span class="tr-badge tr-badge-due">Due</span>`);

    rowsHtml.push(`
      <label style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:#ffffff;border:1px solid #e2e8f0;border-radius:6px;cursor:pointer;font-size:12.5px;box-shadow:0 1px 2px rgba(0,0,0,0.03)">
        <div style="display:flex;align-items:center;gap:8px">
          <input type="checkbox" class="tr-due-mo-check" value="${m}" data-fee="${fee}" data-balance="${balance}" data-paid="${paid}" ${isChecked ? 'checked' : ''} onchange="onTransportMonthToggle()">
          <span style="font-weight:600;color:#0f172a">${m}</span>
          ${paid > 0 ? `<span style="color:#16a34a;font-size:11px">(Paid: ₹${paid})</span>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          ${badgeHtml}
          <span style="font-weight:700;color:#c0392b">₹ ${Number(balance).toLocaleString('en-IN')}</span>
        </div>
      </label>
    `);
  });

  mListEl.innerHTML = rowsHtml.join('');

  const btn = document.getElementById('tr_btn_select_all_months');
  if (btn) {
    btn.style.display = eligibleCount > 0 ? 'inline-block' : 'none';
    btn.textContent = 'Select All';
  }

  onTransportMonthToggle();
}

function onTransportMonthToggle() {
  const checks = Array.from(document.querySelectorAll('.tr-due-mo-check:checked'));
  const totalDue = checks.reduce((acc, cb) => acc + (parseFloat(cb.getAttribute('data-balance')) || 0), 0);

  const totalEl = document.getElementById('tr_col_total_display');
  if (totalEl) totalEl.textContent = `₹ ${totalDue.toLocaleString('en-IN')}`;

  const discAmtInput = document.getElementById('tr_col_discount_amount');
  let discount = parseFloat(discAmtInput?.value) || 0;
  if (discount > totalDue) {
    discount = totalDue;
    if (discAmtInput) discAmtInput.value = discount;
  }

  const discDisp = document.getElementById('tr_col_discount_display');
  if (discDisp) discDisp.textContent = `₹ ${discount.toLocaleString('en-IN')}`;

  const amtInput = document.getElementById('tr_col_amount_input');
  if (amtInput) amtInput.value = Math.max(0, totalDue - discount);

  const eligibleChecks = Array.from(document.querySelectorAll('.tr-due-mo-check:not(:disabled)'));
  const btn = document.getElementById('tr_btn_select_all_months');
  if (btn && eligibleChecks.length > 0) {
    const allChecked = eligibleChecks.every(cb => cb.checked);
    btn.textContent = allChecked ? 'Deselect All' : 'Select All';
  }

  onTransportAmountInput();
}

function onTransportDiscountInput() {
  const checks = Array.from(document.querySelectorAll('.tr-due-mo-check:checked'));
  const totalDue = checks.reduce((acc, cb) => acc + (parseFloat(cb.getAttribute('data-balance')) || 0), 0);

  const discAmtInput = document.getElementById('tr_col_discount_amount');
  let discount = parseFloat(discAmtInput?.value) || 0;
  if (discount < 0) {
    discount = 0;
    if (discAmtInput) discAmtInput.value = '0';
  }
  if (discount > totalDue) {
    discount = totalDue;
    if (discAmtInput) discAmtInput.value = String(discount);
  }

  const discDisp = document.getElementById('tr_col_discount_display');
  if (discDisp) discDisp.textContent = `₹ ${discount.toLocaleString('en-IN')}`;

  const amtInput = document.getElementById('tr_col_amount_input');
  if (amtInput) amtInput.value = Math.max(0, totalDue - discount);

  onTransportAmountInput();
}

function onTransportAmountInput() {
  const checks = Array.from(document.querySelectorAll('.tr-due-mo-check:checked'));
  const totalDue = checks.reduce((acc, cb) => acc + (parseFloat(cb.getAttribute('data-balance')) || 0), 0);

  const discAmtInput = document.getElementById('tr_col_discount_amount');
  const discount = Math.min(totalDue, Math.max(0, parseFloat(discAmtInput?.value) || 0));

  const amtInput = document.getElementById('tr_col_amount_input');
  const received = Math.max(0, parseFloat(amtInput?.value) || 0);

  const balance = Math.max(0, totalDue - discount - received);
  const balEl = document.getElementById('tr_col_balance_display');
  if (balEl) {
    balEl.textContent = `₹ ${balance.toLocaleString('en-IN')}`;
  }

  // Update allocation preview
  renderTransportAllocationPreview(checks, received, discount);
}

function renderTransportAllocationPreview(checkedBoxes, received, discount) {
  const previewBox = document.getElementById('tr_col_allocation_preview');
  if (!previewBox) return;

  if (checkedBoxes.length === 0) {
    previewBox.innerHTML = '<span style="color:#64748b;font-style:italic">Select one or more fee months above to see allocation.</span>';
    return;
  }

  let unallocRecv = received;
  let unallocDisc = discount;

  const rows = checkedBoxes.map(cb => {
    const mo = cb.value;
    const moBal = parseFloat(cb.getAttribute('data-balance')) || 0;
    const moFee = parseFloat(cb.getAttribute('data-fee')) || 0;

    const discForMo = Math.min(unallocDisc, moBal);
    unallocDisc -= discForMo;

    const afterDisc = moBal - discForMo;
    const payForMo = Math.min(unallocRecv, afterDisc);
    unallocRecv -= payForMo;

    const remBal = Math.max(0, afterDisc - payForMo);

    return `
      <tr>
        <td style="font-weight:600;color:#0f172a">${mo}</td>
        <td class="text-right">₹ ${moFee.toLocaleString('en-IN')}</td>
        <td class="text-right" style="color:#d97706">${discForMo > 0 ? '₹ ' + discForMo.toLocaleString('en-IN') : '-'}</td>
        <td class="text-right" style="font-weight:700;color:#16a34a">₹ ${payForMo.toLocaleString('en-IN')}</td>
        <td class="text-right" style="font-weight:700;color:${remBal > 0 ? '#c0392b' : '#16a34a'}">₹ ${remBal.toLocaleString('en-IN')}</td>
      </tr>
    `;
  });

  previewBox.innerHTML = `
    <table class="tr-table" style="font-size:11.5px;width:100%">
      <thead>
        <tr>
          <th>Month</th>
          <th class="text-right">Fee</th>
          <th class="text-right">Discount</th>
          <th class="text-right">Paid</th>
          <th class="text-right">Remaining</th>
        </tr>
      </thead>
      <tbody>
        ${rows.join('')}
      </tbody>
    </table>
  `;
}

function saveTransportPayment() {
  const student = transportState.selectedStudentForCollect;
  if (!student) {
    showToast('No student selected for fee collection.', 'error');
    return;
  }

  const checkedBoxes = Array.from(document.querySelectorAll('.tr-due-mo-check:checked'));
  if (checkedBoxes.length === 0) {
    showToast('Please select at least one fee month to collect.', 'error');
    return;
  }

  const totalDueAcrossChecked = checkedBoxes.reduce((acc, cb) => acc + (parseFloat(cb.getAttribute('data-balance')) || 0), 0);
  const discAmtInput = document.getElementById('tr_col_discount_amount');
  const discount = Math.min(totalDueAcrossChecked, Math.max(0, parseFloat(discAmtInput?.value) || 0));
  const received = parseFloat(document.getElementById('tr_col_amount_input')?.value) || 0;
  const reason = (document.getElementById('tr_col_discount_reason')?.value || '').trim();
  const mode = document.getElementById('tr_col_payment_mode')?.value || 'Cash';

  if (received < 0) {
    showToast('Amount Received cannot be negative.', 'error');
    return;
  }

  if (discount > 0 && !reason) {
    showToast('Discount Reason is mandatory when discount is applied.', 'error');
    return;
  }

  const checkedMonths = checkedBoxes.map(cb => cb.value);

  // Month-keyed allocation algorithm:
  let unallocatedReceived = received;
  let unallocatedDiscount = discount;
  const allocations = [];

  checkedBoxes.forEach(cb => {
    const moName = cb.value;
    const moBalance = parseFloat(cb.getAttribute('data-balance')) || 0;
    const moFullFee = parseFloat(cb.getAttribute('data-fee')) || student.monthlyFee;
    const moAlreadyPaid = parseFloat(cb.getAttribute('data-paid')) || 0;

    const discForMo = Math.min(unallocatedDiscount, moBalance);
    unallocatedDiscount -= discForMo;

    const balAfterDisc = moBalance - discForMo;
    const payForMo = Math.min(unallocatedReceived, balAfterDisc);
    unallocatedReceived -= payForMo;

    const remainingForMo = Math.max(0, balAfterDisc - payForMo);

    allocations.push({
      month: moName,
      monthKey: displayToMonthKey(moName),
      fee: moFullFee,
      previousPaid: moAlreadyPaid,
      discountAllocated: discForMo,
      paidAllocated: payForMo,
      balanceRemaining: remainingForMo
    });
  });

  // If excess payment remains, apply it to the last month
  if (unallocatedReceived > 0 && allocations.length > 0) {
    allocations[allocations.length - 1].paidAllocated += unallocatedReceived;
    allocations[allocations.length - 1].balanceRemaining = Math.max(0, allocations[allocations.length - 1].balanceRemaining - unallocatedReceived);
  }

  if (!DB.transport) DB.transport = { stops: [], assignments: {}, payments: [], nextReceiptSeq: 1 };
  if (!Array.isArray(DB.transport.payments)) DB.transport.payments = [];

  // Generate independent transport receipt number (TR-YYYY-SEQ)
  const seq = DB.transport.nextReceiptSeq || 1;
  const yr = new Date().getFullYear();
  const receiptNo = `TR-${yr}-${String(seq).padStart(4, '0')}`;
  DB.transport.nextReceiptSeq = seq + 1;

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const remaining = Math.max(0, totalDueAcrossChecked - discount - received);

  const paymentRecord = {
    id: 'trp_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    receiptNo,
    date: dateStr,
    timestamp: now.toISOString(),
    studentId: student.id,
    studentName: student.name,
    admNo: student.admNo,
    class: student.class,
    pickup: student.pickup,
    drop: student.drop,
    months: checkedMonths,
    allocations,
    totalFee: totalDueAcrossChecked,
    discount,
    discountReason: reason,
    amountReceived: received,
    remainingBalance: remaining,
    paymentMode: mode,
    reversed: false
  };

  DB.transport.payments.push(paymentRecord);
  transportState.activeReceipt = paymentRecord;

  saveDB(true);

  closeM('modalCollectTransport');
  populateTransportReceiptModal(paymentRecord);
  openM('modalTransportReceipt');
  renderTransportLedger();
  showToast(`Transport fee payment of ₹ ${received} recorded successfully!`, 'success');
}

// ============================================================
// MODAL 4: TRANSPORT FEE RECEIPT PREVIEW
// ============================================================

// Helper: Format consecutive transport months into compact date range (e.g. "April 2026 - October 2026")
function formatCompactTransportMonthRange(months) {
  if (!months) return '-';
  if (typeof months === 'string') {
    months = months.split(',').map(m => m.trim()).filter(Boolean);
  }
  if (!Array.isArray(months) || months.length === 0) return '-';

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const parsed = [];
  const seen = new Set();

  for (const mStr of months) {
    if (!mStr || typeof mStr !== 'string') continue;
    const trimmed = mStr.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) {
      parsed.push({ raw: trimmed, val: -1 });
      continue;
    }
    const mName = parts[0];
    const yr = parseInt(parts[1], 10);
    const mIdx = monthNames.findIndex(m => m.toLowerCase() === mName.toLowerCase());
    if (mIdx === -1 || isNaN(yr)) {
      parsed.push({ raw: trimmed, val: -1 });
      continue;
    }
    const val = yr * 12 + mIdx;
    if (!seen.has(val)) {
      seen.add(val);
      parsed.push({
        raw: trimmed,
        name: monthNames[mIdx],
        year: yr,
        val: val
      });
    }
  }

  if (parsed.length === 0) return '-';
  if (parsed.some(p => p.val === -1)) {
    return months.join(', ');
  }

  // Sort chronologically regardless of selection order
  parsed.sort((a, b) => a.val - b.val);

  const runs = [];
  let currentRun = [];

  parsed.forEach(item => {
    if (currentRun.length === 0) {
      currentRun.push(item);
    } else {
      const prev = currentRun[currentRun.length - 1];
      if (item.val === prev.val + 1) {
        currentRun.push(item);
      } else {
        runs.push(currentRun);
        currentRun = [item];
      }
    }
  });
  if (currentRun.length > 0) {
    runs.push(currentRun);
  }

  return runs.map(run => {
    if (run.length === 1) {
      return `${run[0].name} ${run[0].year}`;
    } else {
      return `${run[0].name} ${run[0].year} - ${run[run.length - 1].name} ${run[run.length - 1].year}`;
    }
  }).join(', ');
}

function populateTransportReceiptModal(rcpt) {
  const schoolName = (DB && DB.settings && DB.settings.schoolName) || 'MD CONVENT PUBLIC SCHOOL';
  const scNameEl = document.getElementById('tr_rcpt_school_name');
  if (scNameEl) scNameEl.textContent = schoolName;

  const logoImg = document.getElementById('tr_rcpt_logo_img');
  const logoUri = getSchoolLogoDataUri();
  if (logoImg) {
    logoImg.src = logoUri;
    if (logoImg.style) {
      logoImg.style.display = logoUri ? 'inline-block' : 'none';
    }
  }

  const noEl = document.getElementById('tr_rcpt_no');
  const dtEl = document.getElementById('tr_rcpt_date');
  const stNameEl = document.getElementById('tr_rcpt_st_name');
  const stAdmEl = document.getElementById('tr_rcpt_st_adm');
  const stClsEl = document.getElementById('tr_rcpt_st_class');
  const pickEl = document.getElementById('tr_rcpt_pickup');
  const dropEl = document.getElementById('tr_rcpt_drop');

  if (noEl) noEl.textContent = rcpt.receiptNo;
  if (dtEl) dtEl.textContent = rcpt.date;
  if (stNameEl) stNameEl.textContent = rcpt.studentName;
  if (stAdmEl) stAdmEl.textContent = rcpt.admNo;
  if (stClsEl) stClsEl.textContent = rcpt.class;
  if (pickEl) pickEl.textContent = rcpt.pickup || '-';
  if (dropEl) dropEl.textContent = rcpt.drop || '-';

  const moText = formatCompactTransportMonthRange(rcpt.months);
  const mEl = document.getElementById('tr_rcpt_month');
  if (mEl) mEl.textContent = moText;
  const feeEl = document.getElementById('tr_rcpt_fee');
  if (feeEl) feeEl.textContent = Number(rcpt.totalFee).toFixed(2);
  const discEl = document.getElementById('tr_rcpt_disc');
  if (discEl) discEl.textContent = Number(rcpt.discount).toFixed(2);
  const recEl = document.getElementById('tr_rcpt_received');
  if (recEl) recEl.textContent = Number(rcpt.amountReceived).toFixed(2);
  const balEl = document.getElementById('tr_rcpt_bal');
  if (balEl) balEl.textContent = Number(rcpt.remainingBalance).toFixed(2);

  const discLabel = (rcpt.discount > 0 && rcpt.discountReason)
    ? `Discount <span style="font-size:10.5px;color:#64748b;font-weight:normal">(${escapeHtml(rcpt.discountReason)})</span>`
    : 'Discount';

  const tbody = document.getElementById('tr_rcpt_items_tbody');
  if (tbody) {
    tbody.innerHTML = `
      <tr><td>Fee Month</td><td class="text-right" id="tr_rcpt_month">${escapeHtml(moText)}</td></tr>
      <tr><td>Transport Fee</td><td class="text-right" id="tr_rcpt_fee">${Number(rcpt.totalFee).toFixed(2)}</td></tr>
      <tr><td>${discLabel}</td><td class="text-right" id="tr_rcpt_disc">${Number(rcpt.discount).toFixed(2)}</td></tr>
      <tr style="font-weight:700"><td>Amount Received</td><td class="text-right" id="tr_rcpt_received">${Number(rcpt.amountReceived).toFixed(2)}</td></tr>
      <tr style="font-weight:700;color:${rcpt.remainingBalance > 0 ? '#c0392b' : '#0f172a'}"><td>Remaining Balance</td><td class="text-right" id="tr_rcpt_bal">${Number(rcpt.remainingBalance).toFixed(2)}</td></tr>
    `;
  }

  const modeEl = document.getElementById('tr_rcpt_mode');
  if (modeEl) modeEl.textContent = rcpt.paymentMode;
}

function printTransportReceipt() {
  const printArea = document.getElementById('tr_receipt_print_area');
  if (!printArea) return;

  const logoUri = getSchoolLogoDataUri();
  const printClone = printArea.cloneNode(true);
  const cloneLogo = printClone.querySelector('#tr_rcpt_logo_img') || printClone.querySelector('img');
  if (cloneLogo) {
    cloneLogo.src = logoUri;
    cloneLogo.style.display = logoUri ? 'inline-block' : 'none';
  }

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Transport Fee Receipt</title>
<style>
  body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; margin: 20px; color: #0f172a; background: #fff; }
  .tr-receipt-container { width: 100%; max-width: 480px; margin: 0 auto; border: 1px solid #cbd5e1; border-radius: 6px; padding: 18px; background: #fff; box-sizing: border-box; }
  .tr-rcpt-header { text-align: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 10px; }
  .tr-rcpt-school { font-size: 15px; font-weight: 800; color: #c0392b; letter-spacing: 0.3px; }
  .tr-rcpt-subtitle { font-size: 11px; font-weight: 700; color: #475569; margin-top: 2px; letter-spacing: 0.5px; }
  .tr-rcpt-meta-row { display: flex; justify-content: space-between; font-size: 11.5px; font-weight: 600; color: #64748b; margin-bottom: 10px; border-bottom: 1px dashed #cbd5e1; padding-bottom: 6px; }
  .tr-rcpt-student-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 12px; font-size: 11.5px; margin-bottom: 10px; display: flex; flex-direction: column; gap: 4px; }
  .tr-rcpt-table { width: 100%; border-collapse: collapse; font-size: 11.5px; margin-bottom: 10px; }
  .tr-rcpt-table th { background: #f1f5f9; padding: 6px 8px; border: 1px solid #cbd5e1; text-align: left; font-weight: 700; }
  .tr-rcpt-table td { padding: 6px 8px; border: 1px solid #cbd5e1; text-align: left; }
  .tr-rcpt-table td.text-right, .tr-rcpt-table th.text-right { text-align: right; }
  .tr-rcpt-sig-area { margin-top: 20px; display: flex; justify-content: flex-end; text-align: center; }
  .tr-rcpt-sig-line { border-top: 1px solid #0f172a; width: 140px; padding-top: 4px; font-size: 10.5px; font-weight: 600; }
</style>
</head>
<body>
  ${printClone.outerHTML}
</body>
</html>`;

  if (isEl && window.electronAPI && window.electronAPI.printContent) {
    window.electronAPI.printContent(html);
  } else {
    window.print();
  }
}

// ============================================================
// MODAL 5: STUDENT TRANSPORT DETAILS & ACTIONS
// ============================================================

function openStudentTransportDetailsModal(studentId) {
  const student = (DB.students || []).find(s => s.id === Number(studentId));
  const assignments = (DB.transport && DB.transport.assignments) ? DB.transport.assignments : {};
  const assign = assignments[studentId];

  if (!student || !assign) {
    showToast('Student transport record not found.', 'error');
    return;
  }

  transportState.selectedStudentForDetails = studentId;

  const titleEl = document.getElementById('tr_details_modal_title');
  if (titleEl) {
    titleEl.textContent = `${student.name} (${student.admno}) — Transport Details`;
  }

  const sessLabel = document.getElementById('tr_details_session_label');
  if (sessLabel) {
    sessLabel.textContent = `Session: ${transportState.activeSession || '2026–27'}`;
  }

  const detailsCard = document.getElementById('tr_details_card');
  if (detailsCard) {
    const isSeparate = assign.type === 'separate';
    const statusText = assign.active ? '<span class="tr-badge tr-badge-paid">Active</span>' : '<span class="tr-badge tr-badge-due">Service Stopped</span>';
    detailsCard.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:15px;font-weight:700;color:#0f172a">${escapeHtml(student.name)} (${escapeHtml(student.admno)})</span>
        <span>${statusText}</span>
      </div>
      <div style="font-size:12px;color:#475569">Class: <strong>${escapeHtml(student.cls + (student.section ? ' ' + student.section : ''))}</strong></div>
      <div style="font-size:12px;color:#475569">Transport Mode: <strong>${isSeparate ? 'Pickup + Drop (Separate Stops)' : 'Single Stop'}</strong></div>
      <div style="font-size:12px;color:#475569">
        Pickup Stop: <strong>${escapeHtml(assign.pickupStopName || '-')}</strong>
        ${isSeparate ? ` | Drop Stop: <strong>${escapeHtml(assign.dropStopName || '-')}</strong>` : ''}
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px;padding-top:4px;border-top:1px dashed #cbd5e1">
        <span style="font-size:12px;font-weight:600;color:#475569">Monthly Transport Fee</span>
        <span style="font-size:15px;font-weight:800;color:var(--red)">₹ ${Number(assign.monthlyFee).toLocaleString('en-IN')}</span>
      </div>
      <div style="font-size:11px;color:#64748b;margin-top:2px">
        Effective From: ${escapeHtml(assign.effectiveFrom || 'Start')} ${assign.stoppedAt ? ' • Stopped At: ' + escapeHtml(assign.stoppedAt) : ''}
      </div>
    `;
  }

  // 1. Month-wise Transport Usage & Fee History Section
  const usageTbody = document.getElementById('tr_details_usage_tbody');
  if (usageTbody) {
    const sessionMonths = getTransportAcademicMonths(transportState.activeSession);
    const curMonthSortKey = getFeeMonthSortKey(getCurrentMonthKey());

    usageTbody.innerHTML = sessionMonths.map(m => {
      const isEnrolled = isMonthInAssignmentPeriod(m, assign.effectiveFrom, assign.stoppedAt);
      const mSortKey = getFeeMonthSortKey(m);
      const fee = isEnrolled ? (Number(assign.monthlyFee) || 0) : 0;
      const { paid, discount } = getStudentMonthTransportAccounting(studentId, m);
      const balance = isEnrolled ? Math.max(0, fee - discount - paid) : 0;

      let enrollmentStatus = 'Enrolled';
      if (!isEnrolled) {
        if (assign.stoppedAt && mSortKey > getFeeMonthSortKey(assign.stoppedAt)) {
          enrollmentStatus = 'Cancelled';
        } else {
          enrollmentStatus = 'Not Enrolled';
        }
      }

      let typeStr = '-';
      let pickupStr = '-';
      let dropStr = '-';
      if (isEnrolled) {
        typeStr = assign.type === 'separate' ? 'Both Ways' : 'Single Stop';
        pickupStr = assign.pickupStopName || '-';
        dropStr = (assign.type === 'separate' && assign.dropStopName) ? assign.dropStopName : '-';
      }

      let monthBadge = '';
      if (!isEnrolled) {
        monthBadge = `<span class="tr-badge tr-badge-na">Not Applicable</span>`;
      } else if (balance === 0 && (paid > 0 || discount >= fee)) {
        monthBadge = `<span class="tr-badge tr-badge-paid">Paid</span>`;
      } else if (mSortKey > curMonthSortKey && paid === 0) {
        monthBadge = `<span class="tr-badge tr-badge-upcoming">Upcoming</span>`;
      } else if (paid > 0 && balance > 0) {
        monthBadge = `<span class="tr-badge tr-badge-partial">Partial</span>`;
      } else {
        monthBadge = `<span class="tr-badge tr-badge-due">Due</span>`;
      }

      return `
        <tr>
          <td style="color:#64748b">${escapeHtml(transportState.activeSession)}</td>
          <td style="font-weight:600;color:#0f172a">${escapeHtml(m)}</td>
          <td style="color:#475569">${escapeHtml(enrollmentStatus)}</td>
          <td style="color:#475569">${escapeHtml(typeStr)}</td>
          <td style="color:#1e293b">${escapeHtml(pickupStr)}</td>
          <td style="color:#1e293b">${escapeHtml(dropStr)}</td>
          <td class="text-right" style="font-weight:600">₹ ${fee.toLocaleString('en-IN')}</td>
          <td class="text-right" style="color:#16a34a;font-weight:600">₹ ${paid.toLocaleString('en-IN')}</td>
          <td class="text-right" style="color:#d97706">${discount > 0 ? '₹ ' + discount.toLocaleString('en-IN') : '-'}</td>
          <td class="text-right" style="font-weight:700;color:${balance > 0 ? '#c0392b' : '#0f172a'}">₹ ${balance.toLocaleString('en-IN')}</td>
          <td class="text-center">${monthBadge}</td>
        </tr>
      `;
    }).join('');
  }

  // 2. Payment Receipts Section
  const tbody = document.getElementById('tr_details_history_tbody');
  const countEl = document.getElementById('tr_details_payments_count');
  const payments = (DB.transport && Array.isArray(DB.transport.payments)) ? DB.transport.payments.filter(p => p.studentId === studentId && !p.reversed) : [];

  if (countEl) countEl.textContent = String(payments.length);

  if (tbody) {
    if (payments.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:20px;color:#64748b;font-size:11.5px">No payments recorded for this student yet.</td></tr>`;
    } else {
      tbody.innerHTML = payments.slice().reverse().map(p => {
        const moStr = formatCompactTransportMonthRange(p.months);
        return `<tr>
          <td style="font-weight:700;color:#0f172a">${escapeHtml(p.receiptNo)}</td>
          <td style="color:#475569">${escapeHtml(p.date)}</td>
          <td style="color:#1e293b">${escapeHtml(moStr)}</td>
          <td class="text-right" style="font-weight:700;color:#16a34a">₹ ${Number(p.amountReceived).toLocaleString('en-IN')}</td>
          <td class="text-right">${Number(p.discount || 0) > 0 ? '₹ ' + Number(p.discount).toLocaleString('en-IN') : '-'}</td>
          <td style="color:#475569">${escapeHtml(p.paymentMode || 'Cash')}</td>
          <td class="text-center">
            <button class="btn bo bsm" onclick="viewTransportReceiptByNo('${p.receiptNo}')" style="padding:2px 8px;font-size:11px">View</button>
          </td>
        </tr>`;
      }).join('');
    }
  }

  // Update button states
  const btnRemove = document.getElementById('tr_btn_details_remove');
  if (btnRemove) {
    btnRemove.style.display = assign.active ? 'inline-block' : 'none';
  }

  openM('modalStudentTransportDetails');
}

function onDetailsCollectClick() {
  const sid = transportState.selectedStudentForDetails;
  closeM('modalStudentTransportDetails');
  if (sid) openCollectTransportModal(sid);
}

function onDetailsEditClick() {
  const sid = transportState.selectedStudentForDetails;
  closeM('modalStudentTransportDetails');
  if (sid) openAssignTransportModal(sid);
}

function onDetailsRemoveClick() {
  const sid = transportState.selectedStudentForDetails;
  if (!sid) return;
  const student = (DB.students || []).find(s => s.id === Number(sid));
  const stName = student ? student.name : 'this student';

  if (!confirm(`Are you sure you want to stop transport service for ${stName}?\n\nPast billing history and payments will remain safely preserved.`)) {
    return;
  }
  removeStudentTransport(sid, transportState.activeMonth);
}

function viewTransportReceiptByNo(receiptNo) {
  const payments = (DB.transport && Array.isArray(DB.transport.payments)) ? DB.transport.payments : [];
  const rcpt = payments.find(p => p.receiptNo === receiptNo);
  if (!rcpt) return;

  closeM('modalStudentTransportDetails');
  populateTransportReceiptModal(rcpt);
  openM('modalTransportReceipt');
}

// ============================================================
// INITIALIZATION
// ============================================================
async function init() {
  await loadDB();
  fillDDs();
  renderDB();
}

init();
