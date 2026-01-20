const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const http = require('http');
const { setupWebSocket } = require('./websocket/handler');
const { sessionMiddleware, cleanupSessions, generateCSRFToken } = require('./middleware/auth');

// Import routes
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const clientsRoutes = require('./routes/clients');
const projectsRoutes = require('./routes/projects');
const timeEntriesRoutes = require('./routes/time-entries');
const invoicesRoutes = require('./routes/invoices');
const clientPortalRoutes = require('./routes/client-portal');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Session middleware
app.use(sessionMiddleware);

// CSRF token setup - set token in cookie for forms
app.use((req, res, next) => {
    if (!req.cookies.csrf) {
        const token = generateCSRFToken();
        res.cookie('csrf', token, {
            httpOnly: false, // Frontend needs to read this
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        });
    }
    next();
});

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/time-entries', timeEntriesRoutes);
app.use('/api/invoices', invoicesRoutes);
app.use('/api/client', clientPortalRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root redirect
app.get('/', (req, res) => {
    if (req.session) {
        if (req.session.user_type === 'user') {
            return res.redirect('/user/dashboard.html');
        } else if (req.session.user_type === 'client') {
            return res.redirect('/client/dashboard.html');
        }
    }
    res.redirect('/login.html');
});

// Serve HTML pages
app.get('/login.html', (req, res) => {
    if (req.session?.user_type === 'user') {
        return res.redirect('/user/dashboard.html');
    }
    res.sendFile(path.join(__dirname, '../public/login.html'));
});

app.get('/client/login.html', (req, res) => {
    if (req.session?.user_type === 'client') {
        return res.redirect('/client/dashboard.html');
    }
    res.sendFile(path.join(__dirname, '../public/client/login.html'));
});

// User portal pages - require user auth
app.get('/user/*', (req, res, next) => {
    if (!req.session || req.session.user_type !== 'user') {
        return res.redirect('/login.html');
    }
    next();
});

// Client portal pages - require client auth
app.get('/client/dashboard.html', (req, res, next) => {
    if (!req.session || req.session.user_type !== 'client') {
        return res.redirect('/client/login.html');
    }
    next();
});

app.get('/client/entries.html', (req, res, next) => {
    if (!req.session || req.session.user_type !== 'client') {
        return res.redirect('/client/login.html');
    }
    next();
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);

    const status = err.status || 500;
    const message = process.env.NODE_ENV === 'production'
        ? 'An error occurred'
        : err.message;

    res.status(status).json({
        error: message,
        ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
    });
});

// 404 handler
app.use((req, res) => {
    if (req.accepts('html')) {
        res.status(404).sendFile(path.join(__dirname, '../public/404.html'));
    } else {
        res.status(404).json({ error: 'Not found' });
    }
});

// Setup WebSocket
const wss = setupWebSocket(server);

// Periodic session cleanup (every hour)
setInterval(async () => {
    try {
        const deleted = await cleanupSessions();
        if (deleted > 0) {
            console.log(`Cleaned up ${deleted} expired sessions`);
        }
    } catch (err) {
        console.error('Session cleanup error:', err);
    }
}, 60 * 60 * 1000);

// Start server
server.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════╗
║         Slate Server                ║
╠═══════════════════════════════════════════╣
║  Server running on port ${PORT}             ║
║  Environment: ${process.env.NODE_ENV || 'development'}            ║
╚═══════════════════════════════════════════╝
    `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

module.exports = { app, server, wss };
