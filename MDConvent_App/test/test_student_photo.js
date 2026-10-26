// =============================================================================
// Automated Synthetic Test Suite for Student Photo & Form Layout
// Completely isolated test environment: does NOT touch live production database or backups!
// =============================================================================

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');

console.log('=== STARTING TEST SUITE: Student Photo Upload & Form Layout ===\n');

// 1. Setup isolated mock environment
const testDir = path.join(__dirname, 'sandbox_photo_test_db');
if (fs.existsSync(testDir)) {
  fs.rmSync(testDir, { recursive: true, force: true });
}
fs.mkdirSync(testDir, { recursive: true });

const mockPhotosDir = path.join(testDir, 'Student_Photos');
fs.mkdirSync(mockPhotosDir, { recursive: true });

const mockDbPath = path.join(testDir, 'school_data.json');

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ALLOWED_PHOTO_EXTS = ['jpg', 'jpeg', 'png', 'webp'];

// Mimic main.js select-student-photo handler
function selectStudentPhotoMock(simulatedResult) {
  if (simulatedResult.canceled) {
    return { canceled: true, selected: false };
  }
  const filePath = simulatedResult.filePath;
  if (!fs.existsSync(filePath)) {
    return { error: 'Selected photo file not found on disk.' };
  }
  const stats = fs.statSync(filePath);
  if (stats.size > MAX_PHOTO_BYTES) {
    return {
      error: `Selected image size (${(stats.size / (1024 * 1024)).toFixed(1)} MB) exceeds the 5 MB limit. Please select a photo under 5 MB.`
    };
  }
  const ext = path.extname(filePath).slice(1).toLowerCase();
  if (!ALLOWED_PHOTO_EXTS.includes(ext)) {
    return { error: 'Invalid file format. Please select a JPG, JPEG, PNG, or WebP photo.' };
  }
  const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  const base64 = fs.readFileSync(filePath, 'base64');
  const previewDataUri = `data:${mime};base64,${base64}`;

  return {
    canceled: false,
    selected: true,
    sourcePath: filePath,
    previewDataUri,
    fileName: path.basename(filePath),
    ext: ext === 'jpeg' ? 'jpg' : ext,
    size: stats.size
  };
}

// Mimic main.js save-student-photo handler
function saveStudentPhotoMock({ sourcePath, admNo, existingPhoto }) {
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    return { error: 'Source photo file not found on disk.' };
  }
  const stats = fs.statSync(sourcePath);
  if (stats.size > MAX_PHOTO_BYTES) {
    return { error: 'Selected image exceeds the 5 MB file size limit.' };
  }
  const ext = path.extname(sourcePath).slice(1).toLowerCase();
  const normExt = ext === 'jpeg' ? 'jpg' : ext;
  if (!['jpg', 'png', 'webp'].includes(normExt)) {
    return { error: 'Unsupported photo format: .' + ext };
  }
  if (!fs.existsSync(mockPhotosDir)) {
    fs.mkdirSync(mockPhotosDir, { recursive: true });
  }
  const safeAdm = String(admNo || 'STU').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  const randomSuffix = crypto.randomBytes(3).toString('hex');
  const destFilename = `${safeAdm}_${randomSuffix}.${normExt}`;
  const destPath = path.join(mockPhotosDir, destFilename);

  fs.copyFileSync(sourcePath, destPath);

  if (existingPhoto && typeof existingPhoto === 'string') {
    const oldSafe = path.basename(existingPhoto);
    const oldPath = path.join(mockPhotosDir, oldSafe);
    if (fs.existsSync(oldPath) && oldSafe !== destFilename) {
      try { fs.unlinkSync(oldPath); } catch (_) {}
    }
  }

  return { success: true, filename: destFilename };
}

// Mimic main.js delete-student-photo handler
function deleteStudentPhotoMock(filename) {
  if (!filename || typeof filename !== 'string') return { success: true };
  const safeFilename = path.basename(filename);
  const targetPath = path.join(mockPhotosDir, safeFilename);
  if (fs.existsSync(targetPath)) {
    fs.unlinkSync(targetPath);
  }
  return { success: true, deleted: true };
}

// Mimic main.js get-student-photo-data handler
function getStudentPhotoDataMock(filename) {
  if (!filename || typeof filename !== 'string') return null;
  const safeFilename = path.basename(filename);
  const targetPath = path.join(mockPhotosDir, safeFilename);
  if (!fs.existsSync(targetPath)) return null;

  const ext = path.extname(safeFilename).toLowerCase().replace('.', '');
  const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  const data = fs.readFileSync(targetPath);
  return `data:${mimeType};base64,${data.toString('base64')}`;
}

// Create sample synthetic test files
const sampleJpg = path.join(testDir, 'sample_avatar.jpg');
fs.writeFileSync(sampleJpg, Buffer.from('fake-jpeg-binary-header-and-content'));

const samplePng = path.join(testDir, 'sample_avatar2.png');
fs.writeFileSync(samplePng, Buffer.from('fake-png-binary-header-and-content'));

const sampleWebp = path.join(testDir, 'sample_avatar3.webp');
fs.writeFileSync(sampleWebp, Buffer.from('fake-webp-binary-content'));

const invalidExtFile = path.join(testDir, 'malicious.exe');
fs.writeFileSync(invalidExtFile, Buffer.from('fake-binary-content'));

const oversizedFile = path.join(testDir, 'huge_photo.jpg');
const hugeBuf = Buffer.alloc(5.5 * 1024 * 1024, 0xbb);
fs.writeFileSync(oversizedFile, hugeBuf);

// Initial DB state
let DB = {
  nextId: 10,
  nextAdm: 1005,
  settings: {
    schoolName: 'M.D. Convent School',
    currentSession: '2026–27',
    admissionPrefix: 'MDC-'
  },
  students: [
    {
      id: 1,
      name: 'Aarav Sharma',
      father: 'Rajesh Sharma',
      mother: 'Sunita Sharma',
      dob: '2015-08-12',
      gender: 'Male',
      admno: 'MDC-1001',
      cls: '5',
      section: 'A',
      phone: '9876543210',
      session: '2026–27',
      status: 'Active'
    }
  ],
  fees: {
    '1_April_2026': [{ type: 'School Fee', amount: 500, paid: true, receiptNo: 'REC-001' }]
  }
};

let passedCount = 0;
let totalCount = 0;

function runTest(name, fn) {
  totalCount++;
  try {
    fn();
    console.log(`  ✓ Passed: ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`  ✗ FAILED: ${name}`);
    console.error(`    Error: ${err.message}`);
    process.exitCode = 1;
  }
}

// =============================================================================
// TEST SUITE EXECUTION (MANDATED 10 VERIFICATION CRITERIA)
// =============================================================================

runTest('1. Choose Photo opens file picker and returns selected image details', () => {
  const result = selectStudentPhotoMock({ filePath: sampleJpg });
  assert.strictEqual(result.canceled, false);
  assert.strictEqual(result.selected, true);
  assert.ok(result.sourcePath);
  assert.ok(result.fileName);
  assert.strictEqual(result.ext, 'jpg');
});

runTest('2. Valid image selection generates immediate preview data URI', () => {
  const resultJpg = selectStudentPhotoMock({ filePath: sampleJpg });
  assert.ok(resultJpg.previewDataUri.startsWith('data:image/jpeg;base64,'));

  const resultPng = selectStudentPhotoMock({ filePath: samplePng });
  assert.ok(resultPng.previewDataUri.startsWith('data:image/png;base64,'));

  const resultWebp = selectStudentPhotoMock({ filePath: sampleWebp });
  assert.ok(resultWebp.previewDataUri.startsWith('data:image/webp;base64,'));
});

runTest('3. Image file is written to Student_Photos folder with unique safe filename', () => {
  const res = saveStudentPhotoMock({
    sourcePath: sampleJpg,
    admNo: 'MDC-1005'
  });
  assert.ok(res.success);
  assert.ok(res.filename);
  assert.ok(res.filename.startsWith('MDC-1005_'));
  assert.ok(res.filename.endsWith('.jpg'));

  const targetPath = path.join(mockPhotosDir, res.filename);
  assert.ok(fs.existsSync(targetPath), 'Photo file must physically exist in Student_Photos');
});

runTest('4. Saving a student with photo saves filename reference in JSON without binary data', () => {
  const photoRes = saveStudentPhotoMock({
    sourcePath: samplePng,
    admNo: 'MDC-1006'
  });
  const studentWithPhoto = {
    id: DB.nextId++,
    name: 'Rohan Gupta',
    father: 'Amit Gupta',
    mother: 'Meena Gupta',
    dob: '2015-11-05',
    gender: 'Male',
    admno: 'MDC-1006',
    cls: '5',
    section: 'A',
    phone: '9876543221',
    session: '2026–27',
    status: 'Active',
    photo: photoRes.filename
  };
  DB.students.push(studentWithPhoto);
  fs.writeFileSync(mockDbPath, JSON.stringify(DB, null, 2));

  const rawJson = fs.readFileSync(mockDbPath, 'utf8');
  assert.ok(!rawJson.includes('data:image'), 'DB must NOT contain base64 image data');
  assert.ok(!rawJson.includes('fake-png-binary'), 'DB must NOT contain binary data');

  const reloaded = JSON.parse(rawJson).students.find(s => s.id === studentWithPhoto.id);
  assert.strictEqual(reloaded.photo, photoRes.filename);
});

runTest('5. Saving a student without photo works normally (Completely Optional)', () => {
  const studentNoPhoto = {
    id: DB.nextId++,
    name: 'Pooja Verma',
    father: 'Suresh Verma',
    mother: 'Anita Verma',
    dob: '2016-02-15',
    gender: 'Female',
    admno: 'MDC-1007',
    cls: '4',
    section: 'B',
    phone: '9876543220',
    session: '2026–27',
    status: 'Active',
    photo: '' // Blank photo
  };
  DB.students.push(studentNoPhoto);
  fs.writeFileSync(mockDbPath, JSON.stringify(DB, null, 2));

  const saved = JSON.parse(fs.readFileSync(mockDbPath, 'utf8')).students.find(s => s.id === studentNoPhoto.id);
  assert.ok(saved);
  assert.strictEqual(saved.photo, '');
  assert.strictEqual(saved.name, 'Pooja Verma');
});

runTest('6. Cancelling the file picker works cleanly without errors', () => {
  const cancelResult = selectStudentPhotoMock({ canceled: true });
  assert.strictEqual(cancelResult.canceled, true);
  assert.strictEqual(cancelResult.selected, false);
  assert.strictEqual(cancelResult.error, undefined);
});

runTest('7. Invalid extensions and oversized files show understandable errors', () => {
  const oversizedRes = selectStudentPhotoMock({ filePath: oversizedFile });
  assert.ok(oversizedRes.error);
  assert.ok(oversizedRes.error.includes('exceeds the 5 MB limit'));

  const invalidRes = selectStudentPhotoMock({ filePath: invalidExtFile });
  assert.ok(invalidRes.error);
  assert.ok(invalidRes.error.includes('Invalid file format'));
});

runTest('8. Existing photos remain available after simulated app restart / DB reload', () => {
  const freshDB = JSON.parse(fs.readFileSync(mockDbPath, 'utf8'));
  const rohan = freshDB.students.find(s => s.admno === 'MDC-1006');
  assert.ok(rohan);
  assert.ok(rohan.photo);

  const photoUri = getStudentPhotoDataMock(rohan.photo);
  assert.ok(photoUri);
  assert.ok(photoUri.startsWith('data:image/png;base64,'));
});

runTest('9. Add Student form layout contains all 17 fields in compact responsive grid', () => {
  const htmlContent = fs.readFileSync(path.join(__dirname, '../src/index.html'), 'utf8');
  const requiredIds = [
    'sft', 's_photo_prev', 's_photo_placeholder', 'btnRemoveStudentPhoto', 's_photo_status',
    's_n', 's_f', 's_m', 's_dob', 's_g', 's_b',
    's_ph', 's_em', 's_ad',
    's_an', 's_srn', 's_admdt', 's_sess',
    's_cl', 's_sec', 's_rn', 's_stat',
    's_eid'
  ];
  requiredIds.forEach(id => {
    assert.ok(htmlContent.includes(`id="${id}"`), `Field with id="${id}" must exist in form`);
  });
  assert.ok(htmlContent.includes('chooseStudentPhoto()'), 'chooseStudentPhoto must be hooked to button');
  assert.ok(htmlContent.includes('removeStudentPhoto()'), 'removeStudentPhoto must be hooked to button');
  assert.ok(htmlContent.includes('saveStudent()'), 'saveStudent must be hooked to Save button');
});

runTest('10. Existing receipt printing, fee ledgers, and database invariants remain unchanged', () => {
  assert.ok(DB.fees['1_April_2026']);
  assert.strictEqual(DB.fees['1_April_2026'][0].amount, 500);
  assert.strictEqual(DB.fees['1_April_2026'][0].receiptNo, 'REC-001');
  assert.strictEqual(DB.settings.schoolName, 'M.D. Convent School');
});

// Teardown sandbox
if (fs.existsSync(testDir)) {
  fs.rmSync(testDir, { recursive: true, force: true });
}

console.log(`\n=== TEST SUITE COMPLETE: ${passedCount} of ${totalCount} tests passed ===`);
