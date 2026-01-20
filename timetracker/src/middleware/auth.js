const db = require('../config/database');
const { generateSessionId } = require('../utils/helpers');
const bcrypt = require('bcrypt');

const SALT_ROUNDS = 12;
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days
const REMEMBER_ME_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 days

// Simple in-memory rate limiting
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCKOUT_TIME = 15 * 60 * 1000; // 15 minutes

// Rate limiting check
function checkRateLimit(identifier) {
    const now = Date.now();
    const attempts = loginAttempts.get(identifier);

    if (!attempts) {
        return { allowed: true };
    }

    // Clean up old attempts
    const recentAttempts = attempts.filter(time => now - time < LOCKOUT_TIME);
    loginAttempts.set(identifier, recentAttempts);

    if (recentAttempts.length >= MAX_ATTEMPTS) {
        const oldestAttempt = recentAttempts[0];
        const timeLeft = Math.ceil((LOCKOUT_TIME - (now - oldestAttempt)) / 1000);
        return { allowed: false, timeLeft };
    }

    return { allowed: true };
}

// Record login attempt
function recordAttempt(identifier) {
    const attempts = loginAttempts.get(identifier) || [];
    attempts.push(Date.now());
    loginAttempts.set(identifier, attempts);
}

// Clear attempts on successful login
function clearAttempts(identifier) {
    loginAttempts.delete(identifier);
}

// Hash password
async function hashPassword(password) {
    return bcrypt.hash(password, SALT_ROUNDS);
}

// Verify password
async function verifyPassword(password, hash) {
    return bcrypt.compare(password, hash);
}

// Create session
async function createSession(userId, clientId, userType, rememberMe = false) {
    const sessionId = generateSessionId();
    const duration = rememberMe ? REMEMBER_ME_DURATION : SESSION_DURATION;
    const expiresAt = new Date(Date.now() + duration);

    await db.query(
        `INSERT INTO sessions (id, user_id, client_id, user_type, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [sessionId, userId, clientId, userType, expiresAt]
    );

    return { sessionId, expiresAt };
}

// Get session
async function getSession(sessionId) {
    const result = await db.query(
        `SELECT s.*, u.name as user_name, u.email as user_email,
                c.name as client_name, c.email as client_email
         FROM sessions s
         LEFT JOIN users u ON s.user_id = u.id
         LEFT JOIN clients c ON s.client_id = c.id
         WHERE s.id = $1 AND s.expires_at > NOW()`,
        [sessionId]
    );

    return result.rows[0] || null;
}

// Delete session
async function deleteSession(sessionId) {
    await db.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
}

// Clean up expired sessions
async function cleanupSessions() {
    const result = await db.query(
        'DELETE FROM sessions WHERE expires_at < NOW()'
    );
    return result.rowCount;
}

// Authentication middleware for user routes
function requireUser(req, res, next) {
    if (!req.session || req.session.user_type !== 'user') {
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        return res.redirect('/login.html');
    }
    next();
}

// Authentication middleware for client routes
function requireClient(req, res, next) {
    if (!req.session || req.session.user_type !== 'client') {
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        return res.redirect('/client/login.html');
    }
    next();
}

// Authentication middleware - either user or client
function requireAuth(req, res, next) {
    if (!req.session) {
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        return res.redirect('/login.html');
    }
    next();
}

// Session middleware - attaches session to request
async function sessionMiddleware(req, res, next) {
    const sessionId = req.cookies?.session;

    if (sessionId) {
        try {
            const session = await getSession(sessionId);
            if (session) {
                req.session = session;
                req.userId = session.user_id;
                req.clientId = session.client_id;
                req.userType = session.user_type;
            }
        } catch (err) {
            console.error('Session lookup error:', err);
        }
    }

    next();
}

// CSRF token generation and validation
function generateCSRFToken() {
    return require('crypto').randomBytes(32).toString('hex');
}

function csrfMiddleware(req, res, next) {
    // Skip CSRF for GET, HEAD, OPTIONS
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next();
    }

    const token = req.headers['x-csrf-token'] || req.body?._csrf;
    const sessionToken = req.cookies?.csrf;

    if (!token || !sessionToken || token !== sessionToken) {
        return res.status(403).json({ error: 'Invalid CSRF token' });
    }

    next();
}

module.exports = {
    hashPassword,
    verifyPassword,
    createSession,
    getSession,
    deleteSession,
    cleanupSessions,
    requireUser,
    requireClient,
    requireAuth,
    sessionMiddleware,
    generateCSRFToken,
    csrfMiddleware,
    checkRateLimit,
    recordAttempt,
    clearAttempts
};
