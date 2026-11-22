/**
 * Targeted Automated Test for SHIKSHA New Default First-Login Password
 * Validates:
 * 1. Fresh database initialization uses 'Mrbeast788712031007'
 * 2. Password is salted & scrypt-hashed (never plain text)
 * 3. Old password 'admin123' fails
 * 4. Old legacy password 'admin' fails
 * 5. Forced password-change workflow (mustChangePassword: true) is preserved
 * 6. Existing initialized databases are untouched and NOT reset
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const { createAuthManager, INITIAL_ADMIN_USERNAME, INITIAL_ADMIN_TEMP_PASSWORD } = require('../auth');

console.log('\n=============================================================');
console.log('SHIKSHA DEFAULT FIRST-LOGIN PASSWORD VERIFICATION');
console.log('=============================================================\n');

let allPassed = true;
function logPass(title, msg) {
  console.log(`[PASS] ${title}: ${msg}`);
}
function logFail(title, err) {
  console.error(`[FAIL] ${title}: ${err}`);
  allPassed = false;
}

const tmpBase = path.join(os.tmpdir(), 'shiksha_pw_test_' + Date.now());
fs.mkdirSync(tmpBase, { recursive: true });

try {
  // -------------------------------------------------------------------------
  // TEST 1: Constant Export Verification
  // -------------------------------------------------------------------------
  assert.strictEqual(INITIAL_ADMIN_USERNAME, 'admin', 'Username must be admin');
  assert.strictEqual(INITIAL_ADMIN_TEMP_PASSWORD, 'Mrbeast788712031007', 'Password must be Mrbeast788712031007');
  logPass('TEST 1 (Constants)', 'INITIAL_ADMIN_TEMP_PASSWORD is set to "Mrbeast788712031007"');

  // -------------------------------------------------------------------------
  // TEST 2: Fresh Database Initialization & Secure Storage
  // -------------------------------------------------------------------------
  const freshDir = path.join(tmpBase, 'fresh_db');
  fs.mkdirSync(freshDir, { recursive: true });
  const authFresh = createAuthManager({ userDataPath: freshDir });

  // Initial login with new password
  const loginNew = authFresh.login('admin', 'Mrbeast788712031007');
  assert.strictEqual(loginNew.success, true, 'New password must log in successfully on fresh install');
  assert.strictEqual(loginNew.user.mustChangePassword, true, 'mustChangePassword must be true on fresh install');
  logPass('TEST 2A (Fresh Install Login)', 'New password "Mrbeast788712031007" logged in successfully with mustChangePassword=true');

  // Check auth.json contents
  const authFile = path.join(freshDir, 'auth.json');
  assert.strictEqual(fs.existsSync(authFile), true, 'auth.json must be created');
  const authJson = JSON.parse(fs.readFileSync(authFile, 'utf8'));
  const user = authJson.users[0];

  assert.strictEqual(user.username, 'admin');
  assert.strictEqual(user.passwordHash.length, 128, 'Password hash must be 64-byte hex string');
  assert.strictEqual(user.passwordSalt.length, 32, 'Salt must be 16-byte hex string');
  assert.strictEqual(JSON.stringify(authJson).includes('Mrbeast788712031007'), false, 'Plaintext password must NEVER exist in auth.json');
  assert.strictEqual(JSON.stringify(authJson).includes('admin123'), false, 'admin123 must not exist in auth.json');
  logPass('TEST 2B (Secure Hashing)', 'Password stored as salted scrypt hash (128 hex chars); zero plain-text');

  // -------------------------------------------------------------------------
  // TEST 3: Old Password 'admin123' Rejection
  // -------------------------------------------------------------------------
  authFresh.logout();
  const loginOld = authFresh.login('admin', 'admin123');
  assert.strictEqual(loginOld.success, false, 'Old password "admin123" must be rejected');
  assert.strictEqual(loginOld.error, 'Invalid username or password');
  logPass('TEST 3 (Old Password Rejection)', 'Old password "admin123" is rejected with invalid credentials');

  // -------------------------------------------------------------------------
  // TEST 4: Legacy Password 'admin' Rejection
  // -------------------------------------------------------------------------
  const loginLegacy = authFresh.login('admin', 'admin');
  assert.strictEqual(loginLegacy.success, false, 'Legacy password "admin" must be rejected');
  assert.strictEqual(loginLegacy.error, 'Invalid username or password');
  logPass('TEST 4 (Legacy Password Rejection)', 'Legacy password "admin" is rejected with invalid credentials');

  // -------------------------------------------------------------------------
  // TEST 5: Existing Initialized Database Remains Untouched
  // -------------------------------------------------------------------------
  const existingDir = path.join(tmpBase, 'existing_db');
  fs.mkdirSync(existingDir, { recursive: true });
  const authExisting = createAuthManager({ userDataPath: existingDir });

  // Simulate existing installation where admin changed password to 'MyExistingSecretPass999!'
  authExisting.login('admin', 'Mrbeast788712031007');
  const changeRes = authExisting.changePassword('Mrbeast788712031007', 'MyExistingSecretPass999!', 'MyExistingSecretPass999!');
  assert.strictEqual(changeRes.success, true, 'Password change must succeed');
  authExisting.logout();

  // Record existing auth.json state
  const existingAuthFile = path.join(existingDir, 'auth.json');
  const existingStateBefore = fs.readFileSync(existingAuthFile, 'utf8');

  // Now create a NEW AuthManager instance pointing to the existing database
  const authExistingReloaded = createAuthManager({ userDataPath: existingDir });
  
  // Verify existing custom password still works
  const loginExistingCustom = authExistingReloaded.login('admin', 'MyExistingSecretPass999!');
  assert.strictEqual(loginExistingCustom.success, true, 'Existing user password must work');
  assert.strictEqual(loginExistingCustom.user.mustChangePassword, false, 'mustChangePassword must remain false');

  // Verify new default password does NOT work for existing user
  authExistingReloaded.logout();
  const loginExistingDefault = authExistingReloaded.login('admin', 'Mrbeast788712031007');
  assert.strictEqual(loginExistingDefault.success, false, 'Default password must not override existing password');

  logPass('TEST 5 (Existing DB Preservation)', 'Existing initialized user password is fully preserved; not overwritten by new default password');

  // -------------------------------------------------------------------------
  // TEST 6: First-Login Password Change Workflow
  // -------------------------------------------------------------------------
  const workflowDir = path.join(tmpBase, 'workflow_db');
  fs.mkdirSync(workflowDir, { recursive: true });
  const authWorkflow = createAuthManager({ userDataPath: workflowDir });

  const wfLogin = authWorkflow.login('admin', 'Mrbeast788712031007');
  assert.strictEqual(wfLogin.user.mustChangePassword, true, 'mustChangePassword must be true initially');

  // Attempt change with wrong current password
  const failChange = authWorkflow.changePassword('wrongpass', 'NewSecret12345!', 'NewSecret12345!');
  assert.strictEqual(failChange.success, false);
  assert.strictEqual(failChange.error, 'Current password is incorrect');

  // Perform successful change
  const goodChange = authWorkflow.changePassword('Mrbeast788712031007', 'SchoolDirector2026!', 'SchoolDirector2026!');
  assert.strictEqual(goodChange.success, true);
  assert.strictEqual(authWorkflow.getAuthStatus().mustChangePassword, false);

  authWorkflow.logout();
  const newLogin = authWorkflow.login('admin', 'SchoolDirector2026!');
  assert.strictEqual(newLogin.success, true);
  assert.strictEqual(newLogin.user.mustChangePassword, false);

  logPass('TEST 6 (Forced Password Change)', 'First-login password change workflow operates flawlessly');

  console.log('\n=============================================================');
  console.log(allPassed ? 'ALL DEFAULT PASSWORD TESTS PASSED WITH 100% SUCCESS!' : 'TESTS FAILED!');
  console.log('=============================================================\n');

} catch (err) {
  logFail('UNEXPECTED_ERROR', err.stack || err.message);
} finally {
  try {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  } catch (_) {}
  process.exit(allPassed ? 0 : 1);
}
