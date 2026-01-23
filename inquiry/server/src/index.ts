import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';

import { initDatabase } from './db/index.js';
import { verifyAccessToken } from './lib/jwt.js';
import authRoutes from './routes/auth.js';
import inquiriesRoutes, { setSocketEmitter } from './routes/inquiries.js';
import uploadsRoutes from './routes/uploads.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// Initialize database
initDatabase();
console.log('Database initialized');

// Create Express app
const app = express();
const httpServer = createServer(app);

// Create Socket.io server
const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_URL,
    credentials: true,
  },
});

// Socket.io authentication middleware
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;

  if (!token) {
    return next(new Error('Authentication required'));
  }

  const payload = verifyAccessToken(token);
  if (!payload) {
    return next(new Error('Invalid or expired token'));
  }

  // Attach user info to socket
  socket.data.userId = payload.userId;
  socket.data.email = payload.email;
  next();
});

// Socket.io connection handler
io.on('connection', (socket) => {
  const userId = socket.data.userId;

  // Join user's private room
  socket.join(`user:${userId}`);
  console.log(`User ${userId} connected via WebSocket`);

  socket.on('disconnect', () => {
    console.log(`User ${userId} disconnected from WebSocket`);
  });
});

// Set up socket emitter for routes
setSocketEmitter((userId: string, event: string, data: unknown) => {
  io.to(`user:${userId}`).emit(event, data);
});

// Middleware
app.use(cors({
  origin: CLIENT_URL,
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/inquiries', inquiriesRoutes);
app.use('/api/uploads', uploadsRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  const clientDistPath = path.resolve('../client/dist');
  if (fs.existsSync(clientDistPath)) {
    app.use(express.static(clientDistPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(clientDistPath, 'index.html'));
    });
  }
}

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
