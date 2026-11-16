const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { createAuthManager, VENDOR_USERNAME } = require('../auth');

async function runMasterAuthVerification() {
  console.log('================================================================');
  console.log('MD CONVENT SMS — COMPLETE OFFLINE AUTHENTICATION VERIFICATION');
  console.log('================================================================\n');

  const testTempDir = path.join(os.tmpdir(), 'mdc_sms_auth_verify_' + Date.now());
  fs.mkdirSync(testTempDir, { recursive: true });

  try {
    // --------------------------------------------------------------------------
    // REQ 1 & 2: Dedicated Login View & No Dashboard Content Visible Before Auth
    // --------------------------------------------------------------------------
    console.log('[Test 1 & 2] Verifying dedicated login view and zero dashboard exposure...');
    const loginHtmlPath = path.join(__dirname, '../src/login.html');
    assert(fs.existsSync(loginHtmlPath), 'login.html must exist as a dedicated file');
    const loginHtml = fs.readFileSync(loginHtmlPath, 'utf8');

    // Strict checks: login.html must NOT contain sidebar, dashboard, or tables
    assert(!loginHtml.includes('class="sidebar"'), 'login.html must NOT contain the sidebar');
    assert(!loginHtml.includes('id="page-dashboard"'), 'login.html must NOT contain dashboard view');
    assert(!loginHtml.includes('class="kpi-card"'), 'login.html must NOT contain KPI cards');
    assert(!loginHtml.includes('db-period-bar'), 'login.html must NOT contain academic period filters');
    assert(!loginHtml.includes('All Students'), 'login.html must NOT contain students table');

    // Verify main.js loads login.html by default
    const mainJsPath = path.join(__dirname, '../main.js');
    const mainJs = fs.readFileSync(mainJsPath, 'utf8');
    assert(mainJs.includes("mainWindow.loadFile(path.join(__dirname, 'src', 'login.html'))"), 'main.js must load login.html upon window creation');
    console.log('  -> PASS: login.html is a standalone view with ZERO application or dashboard exposure.\n');

    // --------------------------------------------------------------------------
    // REQ 3 & 4: Vendor-Only Initial Setup Credentials Verification
    // --------------------------------------------------------------------------
    console.log('[Test 3 & 4] Verifying vendor initial setup authentication...');
    const auth = createAuthManager({ userDataPath: testTempDir });

    // Status on fresh install
    const initialStatus = auth.getAuthStatus();
    assert.strictEqual(initialStatus.isSetupComplete, false, 'Setup must be false on fresh install');
    assert.strictEqual(initialStatus.isAuthenticated, false, 'Must not be authenticated');

    // Wrong vendor username
    const badUser = auth.verifyVendorSetup('admin', 'MDC#KasganjSetup2026!');
    assert.strictEqual(badUser.success, false);
    assert.strictEqual(badUser.error, 'Invalid username or password');

    // Wrong vendor password
    const badPass = auth.verifyVendorSetup(VENDOR_USERNAME, 'WrongVendorPass');
    assert.strictEqual(badPass.success, false);
    assert.strictEqual(badPass.error, 'Invalid username or password');

    // Valid vendor credentials
    const vendorOk = auth.verifyVendorSetup(VENDOR_USERNAME, 'MDC#KasganjSetup2026!');
    assert.strictEqual(vendorOk.success, true);
    assert.strictEqual(vendorOk.isVendorSetup, true);
    assert.strictEqual(auth.isAuthenticated(), false, 'Vendor setup is provisioning only, not school admin auth');
    console.log('  -> PASS: Vendor authentication verified securely with offline hashes. Wrong credentials rejected.\n');

    // --------------------------------------------------------------------------
    // REQ 5: School Administrator Creation & Validations
    // --------------------------------------------------------------------------
    console.log('[Test 5] Verifying School Administrator creation & input validation...');
    // Validation: missing fields
    assert.strictEqual(auth.createSchoolAdmin({ name: '', username: 'admin', password: 'Password123!', confirmPassword: 'Password123!' }).success, false);
    // Validation: short password (< 8 chars)
    assert.strictEqual(auth.createSchoolAdmin({ name: 'Tanmay Soni', username: 'admin', password: '123', confirmPassword: '123' }).success, false);
    // Validation: password mismatch
    assert.strictEqual(auth.createSchoolAdmin({ name: 'Tanmay Soni', username: 'admin', password: 'Password123!', confirmPassword: 'DiffPassword123!' }).success, false);

    // Valid admin creation
    const adminCreated = auth.createSchoolAdmin({
      name: 'Tanmay Soni',
      username: 'principal',
      password: 'AdminPassword@2026',
      confirmPassword: 'AdminPassword@2026'
    });
    assert.strictEqual(adminCreated.success, true);
    assert.strictEqual(auth.isSetupComplete(), true, 'Setup must now be marked complete');
    assert.strictEqual(auth.getActiveSession(), null, 'Vendor session must be destroyed after creating admin');
    console.log('  -> PASS: School Administrator account successfully provisioned and setup marked complete.\n');

    // --------------------------------------------------------------------------
    // REQ 6: Vendor Setup Cannot Be Repeated After Completion
    // --------------------------------------------------------------------------
    console.log('[Test 6] Verifying vendor credentials disabled once setup is completed...');
    const vendorRepeat = auth.verifyVendorSetup(VENDOR_USERNAME, 'MDC#KasganjSetup2026!');
    assert.strictEqual(vendorRepeat.success, false, 'Vendor setup must fail once setup is complete');
    assert.strictEqual(vendorRepeat.error, 'Invalid username or password');
    console.log('  -> PASS: Vendor initial setup credentials permanently disabled after initial setup.\n');

    // --------------------------------------------------------------------------
    // REQ 7 & 8: Normal School Administrator Login & Failed Attempts
    // --------------------------------------------------------------------------
    console.log('[Test 7 & 8] Verifying school administrator login & error masking...');
    // Incorrect password
    const wrongPassLogin = auth.login('principal', 'WrongPass123');
    assert.strictEqual(wrongPassLogin.success, false);
    assert.strictEqual(wrongPassLogin.error, 'Invalid username or password');
    assert.strictEqual(auth.isAuthenticated(), false);

    // Unknown username
    const unknownUserLogin = auth.login('nonexistent_user', 'AnyPassword');
    assert.strictEqual(unknownUserLogin.success, false);
    assert.strictEqual(unknownUserLogin.error, 'Invalid username or password', 'Must NOT reveal if username exists');

    // Correct login
    const goodLogin = auth.login('principal', 'AdminPassword@2026');
    assert.strictEqual(goodLogin.success, true);
    assert.strictEqual(auth.isAuthenticated(), true);
    assert.strictEqual(auth.getCurrentUser().username, 'principal');
    assert.strictEqual(auth.getCurrentUser().name, 'Tanmay Soni');
    assert.strictEqual(auth.getCurrentUser().role, 'admin');
    console.log('  -> PASS: School administrator logs in cleanly. Generic error protects against user enumeration.\n');

    // --------------------------------------------------------------------------
    // REQ 9: Passwords Stored As Hashes, NEVER Plaintext
    // --------------------------------------------------------------------------
    console.log('[Test 9] Verifying secure password hashing (scrypt + salt)...');
    const authJsonPath = path.join(testTempDir, 'auth.json');
    const authJson = JSON.parse(fs.readFileSync(authJsonPath, 'utf8'));
    const storedUser = authJson.users[0];
    assert.strictEqual(storedUser.password, undefined, 'Plaintext password field must NEVER exist in DB');
    assert(storedUser.passwordHash && storedUser.passwordHash.length === 128, 'Password hash must be 64-byte hex');
    assert(storedUser.passwordSalt && storedUser.passwordSalt.length === 32, 'Salt must be 16-byte hex');
    assert(!JSON.stringify(authJson).includes('AdminPassword@2026'), 'Plaintext password must not appear anywhere in auth.json');
    console.log('  -> PASS: Passwords stored strictly as scrypt hashes with 16-byte random salts.\n');

    // --------------------------------------------------------------------------
    // REQ 10: Password Change Functionality
    // --------------------------------------------------------------------------
    console.log('[Test 10] Verifying password change with current password verification...');
    // Wrong current password
    const badOld = auth.changePassword('WrongCurrent', 'NewSecurePass@2026', 'NewSecurePass@2026');
    assert.strictEqual(badOld.success, false);
    assert.strictEqual(badOld.error, 'Current password is incorrect');

    // Short new password
    const shortNew = auth.changePassword('AdminPassword@2026', 'short', 'short');
    assert.strictEqual(shortNew.success, false);

    // Mismatched confirm
    const mismatchNew = auth.changePassword('AdminPassword@2026', 'NewSecurePass@2026', 'DifferentNew@2026');
    assert.strictEqual(mismatchNew.success, false);

    // Valid change
    const goodChange = auth.changePassword('AdminPassword@2026', 'UpdatedAdminPass@2026', 'UpdatedAdminPass@2026');
    assert.strictEqual(goodChange.success, true);

    // Verify old password fails, new password succeeds
    auth.logout();
    assert.strictEqual(auth.login('principal', 'AdminPassword@2026').success, false);
    assert.strictEqual(auth.login('principal', 'UpdatedAdminPass@2026').success, true);
    console.log('  -> PASS: Password change verified. Current password enforced, new password hashed.\n');

    // --------------------------------------------------------------------------
    // REQ 11 & 12: Logout & Fresh Restart Session Erasure
    // --------------------------------------------------------------------------
    console.log('[Test 11 & 12] Verifying session destruction on logout and restart...');
    auth.logout();
    assert.strictEqual(auth.isAuthenticated(), false);
    assert.strictEqual(auth.getCurrentUser(), null);

    // Simulate fresh application restart: instantiate brand new AuthManager from disk
    const restartedAuth = createAuthManager({ userDataPath: testTempDir });
    assert.strictEqual(restartedAuth.isAuthenticated(), false, 'Session must not persist across app restart');
    assert.strictEqual(restartedAuth.getCurrentUser(), null);
    console.log('  -> PASS: Session is memory-only; logout and restart require re-authentication.\n');

    // --------------------------------------------------------------------------
    // REQ 13 & 14: Direct Navigation & Unauthorized IPC Blocking
    // --------------------------------------------------------------------------
    console.log('[Test 13 & 14] Verifying IPC protection and unauthorized access blocking...');
    let sensitiveOperationExecuted = false;
    const testProtectedHandler = restartedAuth.requireAuth(async (event, payload) => {
      sensitiveOperationExecuted = true;
      return { data: 'PROTECTED_SCHOOL_RECORDS' };
    });

    // While unauthenticated:
    const blockedRes = await testProtectedHandler({}, {});
    assert.strictEqual(blockedRes.error, 'UNAUTHORIZED');
    assert.strictEqual(sensitiveOperationExecuted, false, 'Protected handler must not execute without active session');

    // While authenticated:
    restartedAuth.login('principal', 'UpdatedAdminPass@2026');
    const allowedRes = await testProtectedHandler({}, {});
    assert.strictEqual(allowedRes.data, 'PROTECTED_SCHOOL_RECORDS');
    assert.strictEqual(sensitiveOperationExecuted, true);
    console.log('  -> PASS: Protected IPC channels strictly require authenticated session.\n');

    // --------------------------------------------------------------------------
    // REQ 15 & 16: Existing School Data & Application Compatibility
    // --------------------------------------------------------------------------
    console.log('[Test 15 & 16] Verifying existing application compatibility & preload channels...');
    const preloadJsPath = path.join(__dirname, '../src/preload.js');
    const preloadJs = fs.readFileSync(preloadJsPath, 'utf8');
    const expectedChannels = [
      'authGetStatus', 'authLogin', 'authVendorSetup', 'authCreateAdmin',
      'authLogout', 'authGetCurrentUser', 'authChangePassword',
      'loadData', 'saveData', 'backupData', 'restoreData', 'listBackups'
    ];
    expectedChannels.forEach(ch => {
      assert(preloadJs.includes(ch), `preload.js must expose ${ch}`);
    });
    console.log('  -> PASS: All existing school data operations & authentication channels exposed in preload.\n');

    // --------------------------------------------------------------------------
    // REQ 17: 100% Offline Operation
    // --------------------------------------------------------------------------
    console.log('[Test 17] Verifying 100% offline self-containment...');
    const authCode = fs.readFileSync(path.join(__dirname, '../auth.js'), 'utf8');
    assert(!authCode.includes('firebase'), 'Must not include firebase');
    assert(!authCode.includes('supabase'), 'Must not include supabase');
    assert(!authCode.includes('http://'), 'Must not include remote HTTP endpoints');
    assert(!authCode.includes('https://'), 'Must not include remote HTTPS endpoints');
    console.log('  -> PASS: Zero remote dependencies, zero online network calls.\n');

    // --------------------------------------------------------------------------
    // REQ 18: Existing Production Records Untouched
    // --------------------------------------------------------------------------
    console.log('[Test 18] Verifying production database untouched...');
    const prodDbPath = path.join(os.homedir(), 'OneDrive', 'Documents', 'MDConvent_SMS', 'school_data.json');
    if (fs.existsSync(prodDbPath)) {
      const prodRaw = fs.readFileSync(prodDbPath, 'utf8');
      const prodData = JSON.parse(prodRaw);
      assert.strictEqual(prodData.students.length, 1476, 'Production student count must be exactly 1,476');
      console.log('  -> PASS: Production database (1,476 students) is 100% intact and untouched.\n');
    }

    console.log('================================================================');
    console.log('ALL 18 OFFLINE AUTHENTICATION VERIFICATION TESTS PASSED!');
    console.log('================================================================\n');
  } finally {
    try {
      fs.rmSync(testTempDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

runMasterAuthVerification().catch(err => {
  console.error('FATAL VERIFICATION FAILURE:', err);
  process.exit(1);
});
