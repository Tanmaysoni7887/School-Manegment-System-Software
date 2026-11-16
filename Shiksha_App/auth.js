const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 60 * 1000; // 60-second cooldown

// Initial administrator credentials seeded in local database on first run
const INITIAL_ADMIN_USERNAME = 'admin';
const INITIAL_ADMIN_TEMP_PASSWORD = 'admin123';

function createAuthManager(options = {}) {
  const userDataPath = options.userDataPath || path.join(process.cwd(), 'test-data');
  const authFilePath = path.join(userDataPath, 'auth.json');

  let activeSession = null;
  let bruteForceState = {
    failedAttempts: 0,
    lockUntil: 0
  };

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

  function seedInitialAdmin() {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPassword(INITIAL_ADMIN_TEMP_PASSWORD, salt);
    const initialUser = {
      id: 'usr_admin_master',
      name: 'Administrator',
      username: INITIAL_ADMIN_USERNAME,
      passwordHash: hash,
      passwordSalt: salt,
      role: 'admin',
      mustChangePassword: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const authData = {
      version: '2.0.0',
      isSetupComplete: true,
      users: [initialUser]
    };
    saveAuthData(authData);
    return authData;
  }

  function loadAuthData() {
    try {
      if (fs.existsSync(authFilePath)) {
        const raw = fs.readFileSync(authFilePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.users) && parsed.users.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.error('[AuthManager] Error reading auth file:', e.message);
    }
    // If auth file does not exist or has no users, seed initial administrator
    return seedInitialAdmin();
  }

  function saveAuthData(data) {
    try {
      if (!fs.existsSync(userDataPath)) {
        fs.mkdirSync(userDataPath, { recursive: true });
      }
      const serialized = JSON.stringify(data, null, 2);
      safeAtomicWriteSync(authFilePath, serialized);
      return true;
    } catch (e) {
      console.error('[AuthManager] Error saving auth data:', e.message);
      return false;
    }
  }

  function getAuthStatus() {
    return {
      isAuthenticated: Boolean(activeSession && activeSession.role === 'admin'),
      mustChangePassword: activeSession ? Boolean(activeSession.mustChangePassword) : false,
      user: getCurrentUser()
    };
  }

  function login(username, password) {
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

    // Support both INITIAL_ADMIN_TEMP_PASSWORD ('admin123') and 'admin' on initial login
    let isMatch = verifyPassword(password, user.passwordSalt, user.passwordHash);
    if (!isMatch && user.mustChangePassword && password === 'admin') {
      isMatch = true;
    }

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

    // Successful login
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
      mustChangePassword: Boolean(user.mustChangePassword),
      loginTime: Date.now()
    };

    return {
      success: true,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        mustChangePassword: Boolean(user.mustChangePassword)
      }
    };
  }

  function logout() {
    activeSession = null;
    return { success: true };
  }

  function changePassword(currentPassword, newPassword, confirmPassword) {
    if (!isAuthenticated()) {
      return { success: false, error: 'Authentication required' };
    }
    if (!currentPassword) {
      return { success: false, error: 'Please enter your current password' };
    }
    if (!newPassword || newPassword.length < 8) {
      return { success: false, error: 'New password must be at least 8 characters long' };
    }
    if (newPassword !== confirmPassword) {
      return { success: false, error: 'New passwords do not match' };
    }

    const authData = loadAuthData();
    const user = (authData.users || []).find(u => u.id === activeSession.userId);
    if (!user) {
      return { success: false, error: 'User account not found' };
    }

    let isMatch = verifyPassword(currentPassword, user.passwordSalt, user.passwordHash);
    if (!isMatch && user.mustChangePassword && currentPassword === 'admin') {
      isMatch = true;
    }

    if (!isMatch) {
      return { success: false, error: 'Current password is incorrect' };
    }

    if (newPassword === currentPassword) {
      return { success: false, error: 'New password must be different from current password' };
    }

    // Hash and store the new password
    const newSalt = crypto.randomBytes(16).toString('hex');
    user.passwordSalt = newSalt;
    user.passwordHash = hashPassword(newPassword, newSalt);
    user.mustChangePassword = false;
    user.updatedAt = new Date().toISOString();

    saveAuthData(authData);

    // Update active session
    activeSession.mustChangePassword = false;

    return {
      success: true,
      message: 'Password updated successfully'
    };
  }

  function isAuthenticated() {
    return Boolean(activeSession && activeSession.role === 'admin');
  }

  function getCurrentUser() {
    if (!isAuthenticated()) return null;
    return {
      id: activeSession.userId,
      username: activeSession.username,
      name: activeSession.name,
      role: activeSession.role,
      mustChangePassword: Boolean(activeSession.mustChangePassword)
    };
  }

  function getActiveSession() {
    return activeSession;
  }

  function requireAuth(handler) {
    return async function(event, ...args) {
      if (!isAuthenticated()) {
        console.warn('[Security] Unauthorized IPC call blocked:', event?.channel || 'unknown');
        throw new Error('Authentication required: Access denied.');
      }
      return handler(event, ...args);
    };
  }

  return {
    getAuthStatus,
    login,
    logout,
    changePassword,
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
  INITIAL_ADMIN_USERNAME,
  INITIAL_ADMIN_TEMP_PASSWORD
};
