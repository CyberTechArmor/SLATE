import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { eq, and, isNull, gt } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users, refreshTokens } from '../db/schema.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { signAccessToken } from '../lib/jwt.js';
import {
  generateRefreshToken,
  hashRefreshToken,
  verifyRefreshToken,
  getRefreshTokenExpiry,
} from '../lib/refresh-token.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Validation schemas
const signupSchema = z.object({
  email: z.string().email().transform((e) => e.toLowerCase()),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().min(1, 'First name is required'),
});

const loginSchema = z.object({
  email: z.string().email().transform((e) => e.toLowerCase()),
  password: z.string().min(1, 'Password is required'),
});

// Cookie options for refresh token
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/api/auth',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

// POST /api/auth/signup
router.post('/signup', async (req: Request, res: Response) => {
  try {
    const result = signupSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: 'Validation error',
        details: result.error.flatten().fieldErrors,
      });
      return;
    }

    const { email, password, firstName } = result.data;

    // Check if user already exists
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (existingUser) {
      res.status(409).json({
        error: 'Conflict',
        message: 'An account with this email already exists',
      });
      return;
    }

    // Create user
    const now = new Date();
    const userId = uuidv4();
    const passwordHash = await hashPassword(password);

    await db.insert(users).values({
      id: userId,
      email,
      firstName,
      passwordHash,
      createdAt: now,
      updatedAt: now,
    });

    // Generate tokens
    const accessToken = signAccessToken({ userId, email });
    const refreshToken = generateRefreshToken();
    const refreshTokenHash = await hashRefreshToken(refreshToken);
    const refreshTokenExpiry = getRefreshTokenExpiry();

    // Store refresh token
    await db.insert(refreshTokens).values({
      id: uuidv4(),
      userId,
      tokenHash: refreshTokenHash,
      expiresAt: refreshTokenExpiry,
      createdAt: now,
    });

    // Set refresh token cookie
    res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS);

    res.status(201).json({
      accessToken,
      user: {
        id: userId,
        email,
        firstName,
      },
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const result = loginSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: 'Validation error',
        details: result.error.flatten().fieldErrors,
      });
      return;
    }

    const { email, password } = result.data;

    // Find user
    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!user) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid email or password',
      });
      return;
    }

    // Verify password
    const isValidPassword = await verifyPassword(user.passwordHash, password);
    if (!isValidPassword) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid email or password',
      });
      return;
    }

    // Generate tokens
    const accessToken = signAccessToken({ userId: user.id, email: user.email });
    const refreshToken = generateRefreshToken();
    const refreshTokenHash = await hashRefreshToken(refreshToken);
    const refreshTokenExpiry = getRefreshTokenExpiry();
    const now = new Date();

    // Store refresh token
    await db.insert(refreshTokens).values({
      id: uuidv4(),
      userId: user.id,
      tokenHash: refreshTokenHash,
      expiresAt: refreshTokenExpiry,
      createdAt: now,
    });

    // Set refresh token cookie
    res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS);

    res.json({
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const token = req.cookies?.refreshToken;

    if (!token) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'No refresh token provided',
      });
      return;
    }

    // Find valid (non-revoked, non-expired) refresh tokens
    const now = new Date();
    const validTokens = await db.query.refreshTokens.findMany({
      where: and(
        isNull(refreshTokens.revokedAt),
        gt(refreshTokens.expiresAt, now)
      ),
      with: {
        user: true,
      },
    });

    // Find the matching token
    let matchingToken = null;
    for (const tokenRecord of validTokens) {
      const isValid = await verifyRefreshToken(tokenRecord.tokenHash, token);
      if (isValid) {
        matchingToken = tokenRecord;
        break;
      }
    }

    if (!matchingToken || !matchingToken.user) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired refresh token',
      });
      return;
    }

    const user = matchingToken.user;

    // Revoke the old token (token rotation)
    await db
      .update(refreshTokens)
      .set({ revokedAt: now })
      .where(eq(refreshTokens.id, matchingToken.id));

    // Generate new tokens
    const accessToken = signAccessToken({ userId: user.id, email: user.email });
    const newRefreshToken = generateRefreshToken();
    const refreshTokenHash = await hashRefreshToken(newRefreshToken);
    const refreshTokenExpiry = getRefreshTokenExpiry();

    // Store new refresh token
    await db.insert(refreshTokens).values({
      id: uuidv4(),
      userId: user.id,
      tokenHash: refreshTokenHash,
      expiresAt: refreshTokenExpiry,
      createdAt: now,
    });

    // Set new refresh token cookie
    res.cookie('refreshToken', newRefreshToken, REFRESH_COOKIE_OPTIONS);

    res.json({
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
      },
    });
  } catch (error) {
    console.error('Refresh error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/logout
router.post('/logout', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const now = new Date();

    // Revoke all user's refresh tokens
    await db
      .update(refreshTokens)
      .set({ revokedAt: now })
      .where(
        and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt))
      );

    // Clear the refresh token cookie
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/auth',
    });

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;

    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      res.status(404).json({
        error: 'Not found',
        message: 'User not found',
      });
      return;
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
      },
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
