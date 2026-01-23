import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { inquiries, resources } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Apply auth middleware to all routes
router.use(requireAuth);

// Validation schemas
const createInquirySchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().optional().default(''),
});

const updateInquirySchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().optional(),
});

const createResourceSchema = z.object({
  type: z.enum(['link', 'file']),
  title: z.string().min(1),
  url: z.string().url().optional().nullable(),
  filename: z.string().optional().nullable(),
  mimeType: z.string().optional().nullable(),
});

// Socket.io emitter (set from main server)
let emitToUser: ((userId: string, event: string, data: unknown) => void) | null = null;

export function setSocketEmitter(
  emitter: (userId: string, event: string, data: unknown) => void
): void {
  emitToUser = emitter;
}

// GET /api/inquiries - List all user's inquiries
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;

    const userInquiries = await db.query.inquiries.findMany({
      where: eq(inquiries.userId, userId),
      with: {
        resources: true,
      },
      orderBy: [desc(inquiries.updatedAt)],
    });

    res.json({ inquiries: userInquiries });
  } catch (error) {
    console.error('Get inquiries error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/inquiries/:id - Get single inquiry
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    const inquiry = await db.query.inquiries.findFirst({
      where: and(eq(inquiries.id, id), eq(inquiries.userId, userId)),
      with: {
        resources: true,
      },
    });

    if (!inquiry) {
      res.status(404).json({
        error: 'Not found',
        message: 'Inquiry not found',
      });
      return;
    }

    res.json({ inquiry });
  } catch (error) {
    console.error('Get inquiry error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/inquiries - Create inquiry
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;

    const result = createInquirySchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: 'Validation error',
        details: result.error.flatten().fieldErrors,
      });
      return;
    }

    const { title, content } = result.data;
    const now = new Date();
    const id = uuidv4();

    await db.insert(inquiries).values({
      id,
      userId,
      title,
      content,
      createdAt: now,
      updatedAt: now,
    });

    const inquiry = await db.query.inquiries.findFirst({
      where: eq(inquiries.id, id),
      with: {
        resources: true,
      },
    });

    // Emit WebSocket event
    if (emitToUser && inquiry) {
      emitToUser(userId, 'inquiry:created', inquiry);
    }

    res.status(201).json({ inquiry });
  } catch (error) {
    console.error('Create inquiry error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/inquiries/:id - Update inquiry
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    const result = updateInquirySchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: 'Validation error',
        details: result.error.flatten().fieldErrors,
      });
      return;
    }

    // Check if inquiry exists and belongs to user
    const existing = await db.query.inquiries.findFirst({
      where: and(eq(inquiries.id, id), eq(inquiries.userId, userId)),
    });

    if (!existing) {
      res.status(404).json({
        error: 'Not found',
        message: 'Inquiry not found',
      });
      return;
    }

    const { title, content } = result.data;
    const now = new Date();

    // Build update object
    const updateData: { title?: string; content?: string; updatedAt: Date } = {
      updatedAt: now,
    };
    if (title !== undefined) updateData.title = title;
    if (content !== undefined) updateData.content = content;

    await db.update(inquiries).set(updateData).where(eq(inquiries.id, id));

    const inquiry = await db.query.inquiries.findFirst({
      where: eq(inquiries.id, id),
      with: {
        resources: true,
      },
    });

    // Emit WebSocket event
    if (emitToUser && inquiry) {
      emitToUser(userId, 'inquiry:updated', inquiry);
    }

    res.json({ inquiry });
  } catch (error) {
    console.error('Update inquiry error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/inquiries/:id - Delete inquiry
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    // Check if inquiry exists and belongs to user
    const existing = await db.query.inquiries.findFirst({
      where: and(eq(inquiries.id, id), eq(inquiries.userId, userId)),
    });

    if (!existing) {
      res.status(404).json({
        error: 'Not found',
        message: 'Inquiry not found',
      });
      return;
    }

    // Delete inquiry (cascades to resources)
    await db.delete(inquiries).where(eq(inquiries.id, id));

    // Emit WebSocket event
    if (emitToUser) {
      emitToUser(userId, 'inquiry:deleted', { id });
    }

    res.json({ message: 'Inquiry deleted successfully' });
  } catch (error) {
    console.error('Delete inquiry error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/inquiries/:id/resources - Add resource
router.post('/:id/resources', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id: inquiryId } = req.params;

    // Check if inquiry exists and belongs to user
    const existing = await db.query.inquiries.findFirst({
      where: and(eq(inquiries.id, inquiryId), eq(inquiries.userId, userId)),
    });

    if (!existing) {
      res.status(404).json({
        error: 'Not found',
        message: 'Inquiry not found',
      });
      return;
    }

    const result = createResourceSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: 'Validation error',
        details: result.error.flatten().fieldErrors,
      });
      return;
    }

    const { type, title, url, filename, mimeType } = result.data;
    const now = new Date();
    const resourceId = uuidv4();

    await db.insert(resources).values({
      id: resourceId,
      inquiryId,
      type,
      title,
      url: url || null,
      filename: filename || null,
      mimeType: mimeType || null,
      createdAt: now,
    });

    const resource = await db.query.resources.findFirst({
      where: eq(resources.id, resourceId),
    });

    // Emit WebSocket event
    if (emitToUser && resource) {
      emitToUser(userId, 'resource:created', { inquiryId, resource });
    }

    res.status(201).json({ resource });
  } catch (error) {
    console.error('Create resource error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/inquiries/:id/resources/:resourceId - Delete resource
router.delete('/:id/resources/:resourceId', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id: inquiryId, resourceId } = req.params;

    // Check if inquiry exists and belongs to user
    const existing = await db.query.inquiries.findFirst({
      where: and(eq(inquiries.id, inquiryId), eq(inquiries.userId, userId)),
    });

    if (!existing) {
      res.status(404).json({
        error: 'Not found',
        message: 'Inquiry not found',
      });
      return;
    }

    // Check if resource exists and belongs to inquiry
    const resource = await db.query.resources.findFirst({
      where: and(
        eq(resources.id, resourceId),
        eq(resources.inquiryId, inquiryId)
      ),
    });

    if (!resource) {
      res.status(404).json({
        error: 'Not found',
        message: 'Resource not found',
      });
      return;
    }

    // Delete resource
    await db.delete(resources).where(eq(resources.id, resourceId));

    // Emit WebSocket event
    if (emitToUser) {
      emitToUser(userId, 'resource:deleted', { inquiryId, resourceId });
    }

    res.json({ message: 'Resource deleted successfully' });
  } catch (error) {
    console.error('Delete resource error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
