const express = require('express');
const router = express.Router();
const db = require('../config/database');
const {
    hashPassword,
    verifyPassword,
    createSession,
    deleteSession,
    requireAuth,
    checkRateLimit,
    recordAttempt,
    clearAttempts
} = require('../middleware/auth');
const { validateBody } = require('../middleware/validation');

// User login
router.post('/login', validateBody('login'), async (req, res) => {
    try {
        const { email, password, remember } = req.body;

        // Check rate limit
        const rateCheck = checkRateLimit(email);
        if (!rateCheck.allowed) {
            return res.status(429).json({
                error: `Too many login attempts. Please try again in ${rateCheck.timeLeft} seconds.`
            });
        }

        // Find user
        const result = await db.query(
            'SELECT * FROM users WHERE email = $1',
            [email.toLowerCase()]
        );

        const user = result.rows[0];

        if (!user) {
            recordAttempt(email);
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // Verify password
        const validPassword = await verifyPassword(password, user.password_hash);

        if (!validPassword) {
            recordAttempt(email);
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // Clear rate limit on successful login
        clearAttempts(email);

        // Create session
        const { sessionId, expiresAt } = await createSession(
            user.id,
            null,
            'user',
            remember
        );

        // Set cookie
        res.cookie('session', sessionId, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            expires: expiresAt
        });

        res.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                name: user.name
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'An error occurred during login' });
    }
});

// User logout
router.post('/logout', async (req, res) => {
    try {
        const sessionId = req.cookies?.session;

        if (sessionId) {
            await deleteSession(sessionId);
        }

        res.clearCookie('session');
        res.json({ success: true });
    } catch (err) {
        console.error('Logout error:', err);
        res.status(500).json({ error: 'An error occurred during logout' });
    }
});

// Get current user
router.get('/me', requireAuth, async (req, res) => {
    try {
        if (req.userType === 'user') {
            const result = await db.query(
                'SELECT id, email, name, created_at FROM users WHERE id = $1',
                [req.userId]
            );

            if (!result.rows[0]) {
                return res.status(404).json({ error: 'User not found' });
            }

            res.json({
                type: 'user',
                user: result.rows[0]
            });
        } else if (req.userType === 'client') {
            const result = await db.query(
                'SELECT id, name, contact_name, email, created_at FROM clients WHERE id = $1',
                [req.clientId]
            );

            if (!result.rows[0]) {
                return res.status(404).json({ error: 'Client not found' });
            }

            res.json({
                type: 'client',
                client: result.rows[0]
            });
        }
    } catch (err) {
        console.error('Get current user error:', err);
        res.status(500).json({ error: 'An error occurred' });
    }
});

// Client login
router.post('/client/login', validateBody('login'), async (req, res) => {
    try {
        const { email, password, remember } = req.body;

        // Check rate limit
        const rateCheck = checkRateLimit(`client:${email}`);
        if (!rateCheck.allowed) {
            return res.status(429).json({
                error: `Too many login attempts. Please try again in ${rateCheck.timeLeft} seconds.`
            });
        }

        // Find client
        const result = await db.query(
            'SELECT * FROM clients WHERE email = $1 AND status = $2',
            [email.toLowerCase(), 'active']
        );

        const client = result.rows[0];

        if (!client) {
            recordAttempt(`client:${email}`);
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // Verify password
        const validPassword = await verifyPassword(password, client.password_hash);

        if (!validPassword) {
            recordAttempt(`client:${email}`);
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // Clear rate limit on successful login
        clearAttempts(`client:${email}`);

        // Create session
        const { sessionId, expiresAt } = await createSession(
            null,
            client.id,
            'client',
            remember
        );

        // Set cookie
        res.cookie('session', sessionId, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            expires: expiresAt
        });

        res.json({
            success: true,
            client: {
                id: client.id,
                name: client.name,
                email: client.email
            }
        });
    } catch (err) {
        console.error('Client login error:', err);
        res.status(500).json({ error: 'An error occurred during login' });
    }
});

// Client logout
router.post('/client/logout', async (req, res) => {
    try {
        const sessionId = req.cookies?.session;

        if (sessionId) {
            await deleteSession(sessionId);
        }

        res.clearCookie('session');
        res.json({ success: true });
    } catch (err) {
        console.error('Client logout error:', err);
        res.status(500).json({ error: 'An error occurred during logout' });
    }
});

// User signup
router.post('/signup', validateBody('signup'), async (req, res) => {
    try {
        const { email, password, name } = req.body;

        // Check if email already exists
        const existing = await db.query(
            'SELECT id FROM users WHERE email = $1',
            [email.toLowerCase()]
        );

        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        // Check if this is the first user (will be admin)
        const userCount = await db.query('SELECT COUNT(*) as count FROM users');
        const isFirstUser = parseInt(userCount.rows[0].count, 10) === 0;

        // Hash password
        const passwordHash = await hashPassword(password);

        // Create user
        const result = await db.query(
            'INSERT INTO users (email, password_hash, name, is_admin) VALUES ($1, $2, $3, $4) RETURNING id, email, name, is_admin',
            [email.toLowerCase(), passwordHash, name, isFirstUser]
        );

        const user = result.rows[0];

        // Create session
        const { sessionId, expiresAt } = await createSession(
            user.id,
            null,
            'user',
            false
        );

        // Set cookie
        res.cookie('session', sessionId, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            expires: expiresAt
        });

        res.status(201).json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                isAdmin: user.is_admin
            },
            isFirstUser
        });
    } catch (err) {
        console.error('Signup error:', err);
        res.status(500).json({ error: 'An error occurred during signup' });
    }
});

// Check if any users exist (for showing signup vs login)
router.get('/has-users', async (req, res) => {
    try {
        const result = await db.query('SELECT COUNT(*) as count FROM users');
        const hasUsers = parseInt(result.rows[0].count, 10) > 0;
        res.json({ hasUsers });
    } catch (err) {
        console.error('Check users error:', err);
        res.status(500).json({ error: 'An error occurred' });
    }
});

// Change password (for logged in user)
router.post('/change-password', requireAuth, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Current and new passwords are required' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'New password must be at least 6 characters' });
        }

        // Get current user/client
        let result;
        if (req.userType === 'user') {
            result = await db.query('SELECT password_hash FROM users WHERE id = $1', [req.userId]);
        } else {
            result = await db.query('SELECT password_hash FROM clients WHERE id = $1', [req.clientId]);
        }

        if (!result.rows[0]) {
            return res.status(404).json({ error: 'Account not found' });
        }

        // Verify current password
        const validPassword = await verifyPassword(currentPassword, result.rows[0].password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }

        // Hash new password
        const newHash = await hashPassword(newPassword);

        // Update password
        if (req.userType === 'user') {
            await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, req.userId]);
        } else {
            await db.query('UPDATE clients SET password_hash = $1 WHERE id = $2', [newHash, req.clientId]);
        }

        res.json({ success: true, message: 'Password changed successfully' });
    } catch (err) {
        console.error('Change password error:', err);
        res.status(500).json({ error: 'An error occurred' });
    }
});

module.exports = router;
