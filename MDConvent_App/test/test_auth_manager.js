const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { createAuthManager } = require('../auth');

console.log('=== RUNNING AUTH MANAGER COMPREHENSIVE TESTS ===\n');

const testDir = path.join(os.tmpdir(), 'mdc_auth_test_' + Date.now());
fs.mkdirSync(testDir, { recursive: true });

async function runTests() {
  try {
    const auth = createAuthManager({ userDataPath: testDir });

  // 1. Initial State
  console.log('1. Testing initial unconfigured state...');
  assert.strictEqual(auth.isSetupComplete(), false, 'Setup must be false on fresh install');
  assert.strictEqual(auth.isAuthenticated(), false, 'Must not be authenticated initially');
  assert.strictEqual(auth.getCurrentUser(), null, 'Current user must be null');

  // 2. Normal login attempted before setup
  console.log('2. Testing normal login attempted before setup...');
  const preLogin = auth.login('admin', 'password123');
  assert.strictEqual(preLogin.success, false);
  assert.strictEqual(preLogin.error, 'Initial setup required');

  // 3. Invalid vendor credentials rejected
  console.log('3. Testing invalid vendor credentials...');
  const badVendorUser = auth.verifyVendorSetup('wrong_vendor', 'MDC#KasganjSetup2026!');
  assert.strictEqual(badVendorUser.success, false);
  assert.strictEqual(badVendorUser.error, 'Invalid username or password');

  const badVendorPass = auth.verifyVendorSetup('mdc_vendor', 'WrongPassword123');
  assert.strictEqual(badVendorPass.success, false);
  assert.strictEqual(badVendorPass.error, 'Invalid username or password');

  // 4. Valid vendor credentials accepted
  console.log('4. Testing valid vendor credentials...');
  const goodVendor = auth.verifyVendorSetup('mdc_vendor', 'MDC#KasganjSetup2026!');
  assert.strictEqual(goodVendor.success, true);
  assert.strictEqual(goodVendor.isVendorSetup, true);
  assert.strictEqual(auth.isAuthenticated(), false, 'Vendor setup session is not school admin authentication');
  assert.strictEqual(auth.getActiveSession().role, 'vendor_setup');

  // 5. Creating school admin validations
  console.log('5. Testing admin creation validations...');
  // Short password
  const shortPass = auth.createSchoolAdmin({ name: 'Tanmay Soni', username: 'admin', password: '123', confirmPassword: '123' });
  assert.strictEqual(shortPass.success, false);
  assert(shortPass.error.includes('8 characters'));

  // Password mismatch
  const mismatch = auth.createSchoolAdmin({ name: 'Tanmay Soni', username: 'admin', password: 'Password123!', confirmPassword: 'DifferentPassword123!' });
  assert.strictEqual(mismatch.success, false);
  assert(mismatch.error.includes('do not match'));

  // Missing fields
  const missing = auth.createSchoolAdmin({ name: '', username: 'admin', password: 'Password123!', confirmPassword: 'Password123!' });
  assert.strictEqual(missing.success, false);

  // 6. Valid admin account creation
  console.log('6. Testing valid admin account creation...');
  const createRes = auth.createSchoolAdmin({
    name: 'Tanmay Soni',
    username: 'admin',
    password: 'SchoolAdmin@2026',
    confirmPassword: 'SchoolAdmin@2026'
  });
  assert.strictEqual(createRes.success, true);
  assert.strictEqual(auth.getActiveSession(), null, 'Vendor session must be destroyed after creating admin');
  assert.strictEqual(auth.isSetupComplete(), true, 'Setup must now be complete');

  // Verify auth.json on disk contains hash, not plaintext
  const authFile = path.join(testDir, 'auth.json');
  assert(fs.existsSync(authFile), 'auth.json must exist');
  const diskData = JSON.parse(fs.readFileSync(authFile, 'utf8'));
  assert.strictEqual(diskData.isSetupComplete, true);
  assert.strictEqual(diskData.users.length, 1);
  const adminUser = diskData.users[0];
  assert.strictEqual(adminUser.username, 'admin');
  assert.strictEqual(adminUser.name, 'Tanmay Soni');
  assert.strictEqual(adminUser.password, undefined, 'Plaintext password must NEVER exist in DB');
  assert(adminUser.passwordHash && adminUser.passwordHash.length === 128, 'Password hash must be 64-byte hex');
  assert(adminUser.passwordSalt && adminUser.passwordSalt.length === 32, 'Salt must be 16-byte hex');

  // 7. Vendor credentials cannot be re-used after setup is complete
  console.log('7. Testing vendor credentials rejection after setup complete...');
  const vendorReuse = auth.verifyVendorSetup('mdc_vendor', 'MDC#KasganjSetup2026!');
  assert.strictEqual(vendorReuse.success, false, 'Vendor credentials must be disabled after setup');

  // 8. Normal school admin login
  console.log('8. Testing school administrator login...');
  // Bad password
  const badLogin = auth.login('admin', 'WrongPass123');
  assert.strictEqual(badLogin.success, false);
  assert.strictEqual(badLogin.error, 'Invalid username or password');
  assert.strictEqual(auth.isAuthenticated(), false);

  // Good password
  const goodLogin = auth.login('admin', 'SchoolAdmin@2026');
  assert.strictEqual(goodLogin.success, true);
  assert.strictEqual(auth.isAuthenticated(), true);
  assert.strictEqual(auth.getCurrentUser().username, 'admin');
  assert.strictEqual(auth.getCurrentUser().name, 'Tanmay Soni');
  assert.strictEqual(auth.getCurrentUser().role, 'admin');

  // 9. Password change
  console.log('9. Testing password change...');
  // Wrong current password
  const badChange = auth.changePassword('WrongOld', 'NewPassword@2026', 'NewPassword@2026');
  assert.strictEqual(badChange.success, false);
  assert.strictEqual(badChange.error, 'Current password is incorrect');

  // Short new password
  const shortNew = auth.changePassword('SchoolAdmin@2026', 'short', 'short');
  assert.strictEqual(shortNew.success, false);

  // Valid change
  const goodChange = auth.changePassword('SchoolAdmin@2026', 'NewSchoolAdmin@2026', 'NewSchoolAdmin@2026');
  assert.strictEqual(goodChange.success, true);

  // Logout
  console.log('10. Testing logout...');
  auth.logout();
  assert.strictEqual(auth.isAuthenticated(), false);
  assert.strictEqual(auth.getCurrentUser(), null);

  // Old password should now fail
  const oldLogin = auth.login('admin', 'SchoolAdmin@2026');
  assert.strictEqual(oldLogin.success, false);

  // New password works
  const newLogin = auth.login('admin', 'NewSchoolAdmin@2026');
  assert.strictEqual(newLogin.success, true);
  assert.strictEqual(auth.isAuthenticated(), true);

  // 11. Test Brute Force Rate Limiting
  console.log('11. Testing brute force protection...');
  auth.logout();
  for (let i = 0; i < 4; i++) {
    const res = auth.login('admin', 'BadPassword');
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.error, 'Invalid username or password');
  }
  // 5th attempt triggers lockout
  const lockAttempt = auth.login('admin', 'BadPassword');
  assert.strictEqual(lockAttempt.success, false);
  assert(lockAttempt.error.includes('locked'));
  assert(lockAttempt.lockoutSeconds > 0);

  // Subsequent attempt is blocked by lockout
  const blockedAttempt = auth.login('admin', 'NewSchoolAdmin@2026');
  assert.strictEqual(blockedAttempt.success, false);
  assert(blockedAttempt.error.includes('locked'));

  // 12. IPC middleware test
  console.log('12. Testing requireAuth middleware...');
  let secretHandlerExecuted = false;
  const protectedHandler = auth.requireAuth(async (event, data) => {
    secretHandlerExecuted = true;
    return { data: 'secret school data' };
  });

  // When unauthenticated:
  const unauthResult = await protectedHandler({}, {});
  assert.strictEqual(unauthResult.error, 'UNAUTHORIZED');
  assert.strictEqual(secretHandlerExecuted, false, 'Handler must not execute when unauthenticated');

    console.log('\n=== ALL AUTH MANAGER TESTS PASSED SUCCESSFULLY! ===');
  } finally {
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

runTests().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
