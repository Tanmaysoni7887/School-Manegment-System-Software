const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ==============================================================================
// VENDOR CREDENTIAL SPECIFICATION (OFFLINE HASHED VERIFICATION)
// Stored as scrypt hash + salt only. Plaintext password is NEVER stored.
// ==============================================================================
const VENDOR_USERNAME = 'mdc_vendor';
const VENDOR_SALT = 'a815db69c5144da474c8947ebb3b23f0';
const VENDOR_HASH = 'cb80000bad78244db384145d0f127c5e7a70465fe9bf7ce9c3e679cbc459654b2f2b15599a3f2a5666ee6221f6bbd34b8bb6a0d5fcc608bb6793ad9f24c2a520';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 60 * 1000; // 60-second cooldown

function createAuthManager(options = {}) {
  const userDataPath = options.userDataPath || path.join(process.cwd(), 'test-data');
  const authFilePath = path.join(userDataPath, 'auth.json');
  const schoolDataPath = path.join(userDataPath, 'school_data.json');

  let activeSession = null;
  let bruteForceState = {
    failedAttempts: 0,
    lockUntil: 0
  };

  // Safe atomic file write
  function safeAtomicWriteSync(targetPath, content) {
    const tempFile = targetPath + '.tmp';
    fs.writeFileSync(tempFile, content, 'utf8');
    let attempts = 0;
    const maxAttempts = 5;
    while (attempts < maxAttempts) {
      try {
        fs.renameSync(tempFile, targetPath);
        return;
      } catch (err) {
        attempts++;
        if (attempts >= maxAttempts) {
          try { fs.unlinkSync(tempFile); } catch (_) {}
          throw err;
        }
        const waitTill = Date.now() + 50;
        while (Date.now() < waitTill) {}
      }
    }
  }

  function hashPassword(password, salt) {
    return crypto.scryptSync(password, salt, 64).toString('hex');
  }

  function verifyPassword(password, salt, storedHashHex) {
    try {
      const calculated = crypto.scryptSync(password, salt, 64);
      const stored = Buffer.from(storedHashHex, 'hex');
      if (calculated.length !== stored.length) return false;
      return crypto.timingSafeEqual(calculated, stored);
    } catch (_) {
      return false;
    }
  }

  function loadAuthData() {
    try {
      if (fs.existsSync(authFilePath)) {
        const raw = fs.readFileSync(authFilePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return parsed;
        }
      }
      // Check school_data.json for existing auth data migration
      if (fs.existsSync(schoolDataPath)) {
        try {
          const rawDb = fs.readFileSync(schoolDataPath, 'utf8');
          const parsedDb = JSON.parse(rawDb);
          if (parsedDb && parsedDb.auth && typeof parsedDb.auth === 'object') {
            saveAuthData(parsedDb.auth);
            return parsedDb.auth;
          }
        } catch (_) {}
      }
    } catch (e) {
      console.error('[AuthManager] Error reading auth file:', e.message);
    }
    return {
      version: '1.0.0',
      isSetupComplete: false,
      users: []
    };
  }

  function saveAuthData(data) {
    try {
      if (!fs.existsSync(userDataPath)) {
        fs.mkdirSync(userDataPath, { recursive: true });
      }
      const serialized = JSON.stringify(data, null, 2);
      safeAtomicWriteSync(authFilePath, serialized);

      // Optional backward-compatibility sync into school_data.json if present
      if (fs.existsSync(schoolDataPath)) {
        try {
          const rawDb = fs.readFileSync(schoolDataPath, 'utf8');
          const parsedDb = JSON.parse(rawDb);
          if (parsedDb && typeof parsedDb === 'object') {
            parsedDb.auth = {
              isSetupComplete: data.isSetupComplete,
              users: data.users
            };
            safeAtomicWriteSync(schoolDataPath, JSON.stringify(parsedDb));
          }
        } catch (_) {}
      }
      return true;
    } catch (e) {
      console.error('[AuthManager] Error saving auth data:', e.message);
      return false;
    }
  }

  function isSetupComplete() {
    const authData = loadAuthData();
    return Boolean(authData.isSetupComplete && Array.isArray(authData.users) && authData.users.length > 0);
  }

  function getAuthStatus() {
    return {
      isSetupComplete: isSetupComplete(),
      isAuthenticated: Boolean(activeSession && activeSession.role === 'admin')
    };
  }

  function verifyVendorSetup(username, password) {
    if (isSetupComplete()) {
      return { success: false, error: 'Invalid username or password' };
    }
    const trimmedUser = String(username || '').trim();
    if (trimmedUser !== VENDOR_USERNAME) {
      return { success: false, error: 'Invalid username or password' };
    }
    const isMatch = verifyPassword(password, VENDOR_SALT, VENDOR_HASH);
    if (!isMatch) {
      return { success: false, error: 'Invalid username or password' };
    }

    activeSession = {
      role: 'vendor_setup',
      token: crypto.randomBytes(32).toString('hex'),
      loginTime: Date.now()
    };
    return { success: true, isVendorSetup: true };
  }

  function createSchoolAdmin({ name, username, password, confirmPassword }) {
    if (!activeSession || activeSession.role !== 'vendor_setup') {
      return { success: false, error: 'Unauthorized: Vendor initial setup session required' };
    }
    if (isSetupComplete()) {
      return { success: false, error: 'Initial setup has already been completed' };
    }
    const trimmedName = String(name || '').trim();
    const trimmedUser = String(username || '').trim().toLowerCase();
    if (!trimmedName || !trimmedUser || !password || !confirmPassword) {
      return { success: false, error: 'All fields are required' };
    }
    if (password.length < 8) {
      return { success: false, error: 'Password must be at least 8 characters long' };
    }
    if (password !== confirmPassword) {
      return { success: false, error: 'Passwords do not match' };
    }

    const authData = loadAuthData();
    if (authData.users && authData.users.some(u => u.username.toLowerCase() === trimmedUser)) {
      return { success: false, error: 'Username is already taken' };
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPassword(password, salt);
    const newUser = {
      id: 'usr_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex'),
      name: trimmedName,
      username: trimmedUser,
      passwordHash: hash,
      passwordSalt: salt,
      role: 'admin',
      createdAt: new Date().toISOString()
    };

    authData.users = [newUser];
    authData.isSetupComplete = true;
    saveAuthData(authData);

    // End vendor setup session
    activeSession = null;
    return { success: true, message: 'Administrator account created successfully' };
  }

  function login(username, password) {
    if (!isSetupComplete()) {
      return { success: false, error: 'Initial setup required' };
    }

    if (Date.now() < bruteForceState.lockUntil) {
      const remaining = Math.ceil((bruteForceState.lockUntil - Date.now()) / 1000);
      return {
        success: false,
        error: `Too many failed attempts. Account temporarily locked for ${remaining} seconds.`,
        lockoutSeconds: remaining
      };
    }

    const trimmedUser = String(username || '').trim().toLowerCase();
    const authData = loadAuthData();
    const user = (authData.users || []).find(u => u.username.toLowerCase() === trimmedUser);

    if (!user) {
      bruteForceState.failedAttempts++;
      if (bruteForceState.failedAttempts >= MAX_FAILED_ATTEMPTS) {
        bruteForceState.lockUntil = Date.now() + LOCKOUT_DURATION_MS;
        return {
          success: false,
          error: 'Too many failed login attempts. Account temporarily locked for 60 seconds.',
          lockoutSeconds: 60
        };
      }
      return { success: false, error: 'Invalid username or password' };
    }

    const isMatch = verifyPassword(password, user.passwordSalt, user.passwordHash);
    if (!isMatch) {
      bruteForceState.failedAttempts++;
      if (bruteForceState.failedAttempts >= MAX_FAILED_ATTEMPTS) {
        bruteForceState.lockUntil = Date.now() + LOCKOUT_DURATION_MS;
        return {
          success: false,
          error: 'Too many failed login attempts. Account temporarily locked for 60 seconds.',
          lockoutSeconds: 60
        };
      }
      return { success: false, error: 'Invalid username or password' };
    }

    // Login successful
    bruteForceState.failedAttempts = 0;
    bruteForceState.lockUntil = 0;

    user.lastLogin = new Date().toISOString();
    saveAuthData(authData);

    activeSession = {
      token: crypto.randomBytes(32).toString('hex'),
      userId: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      loginTime: Date.now()
    };

    return {
      success: true,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role
      }
    };
  }

  function changePassword(currentPassword, newPassword, confirmPassword) {
    if (!isAuthenticated()) {
      return { success: false, error: 'Authentication required' };
    }
    if (!newPassword || newPassword.length < 8) {
      return { success: false, error: 'New password must be at least 8 characters long' };
    }
    if (confirmPassword && newPassword !== confirmPassword) {
      return { success: false, error: 'Passwords do not match' };
    }

    const authData = loadAuthData();
    const user = (authData.users || []).find(u => u.id === activeSession.userId);
    if (!user) {
      return { success: false, error: 'Active user not found in database' };
    }

    const isMatch = verifyPassword(currentPassword, user.passwordSalt, user.passwordHash);
    if (!isMatch) {
      return { success: false, error: 'Current password is incorrect' };
    }

    const newSalt = crypto.randomBytes(16).toString('hex');
    user.passwordSalt = newSalt;
    user.passwordHash = hashPassword(newPassword, newSalt);
    user.passwordUpdatedAt = new Date().toISOString();
    saveAuthData(authData);

    return { success: true, message: 'Password updated successfully' };
  }

  function logout() {
    activeSession = null;
    return { success: true };
  }

  function isAuthenticated() {
    return Boolean(activeSession && activeSession.role === 'admin' && activeSession.token);
  }

  function getCurrentUser() {
    if (!isAuthenticated()) return null;
    return {
      id: activeSession.userId,
      username: activeSession.username,
      name: activeSession.name,
      role: activeSession.role
    };
  }

  function getActiveSession() {
    return activeSession;
  }

  // Middleware to wrap protected IPC handlers
  function requireAuth(handler) {
    return async (event, ...args) => {
      if (!isAuthenticated()) {
        console.warn('[Security] Unauthorized IPC invocation blocked. No active session.');
        return { error: 'UNAUTHORIZED', message: 'Authentication required. Session is not active.' };
      }
      return handler(event, ...args);
    };
  }

  return {
    isSetupComplete,
    getAuthStatus,
    verifyVendorSetup,
    createSchoolAdmin,
    login,
    changePassword,
    logout,
    isAuthenticated,
    getCurrentUser,
    getActiveSession,
    requireAuth,
    hashPassword,
    verifyPassword
  };
}

module.exports = {
  createAuthManager,
  VENDOR_USERNAME
};
