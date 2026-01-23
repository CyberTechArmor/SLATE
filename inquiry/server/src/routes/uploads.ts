import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const uploadsPath = process.env.UPLOADS_PATH || './uploads';

// Ensure uploads directory exists
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}

// Allowed file types
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Configure multer storage
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsPath);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `${uuidv4()}${ext}`;
    cb(null, filename);
  },
});

// File filter
const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type not allowed: ${file.mimetype}`));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
});

// POST /api/uploads - Upload file
router.post(
  '/',
  requireAuth,
  upload.single('file'),
  (req: Request, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({
          error: 'Bad request',
          message: 'No file uploaded',
        });
        return;
      }

      res.json({
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
      });
    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Error handler for multer errors
router.use((err: Error, _req: Request, res: Response, next: Function) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({
        error: 'Bad request',
        message: 'File too large. Maximum size is 10MB.',
      });
      return;
    }
    res.status(400).json({
      error: 'Bad request',
      message: err.message,
    });
    return;
  }
  if (err.message.startsWith('File type not allowed')) {
    res.status(400).json({
      error: 'Bad request',
      message: err.message,
    });
    return;
  }
  next(err);
});

// GET /api/uploads/:filename - Serve uploaded file
router.get('/:filename', (req: Request, res: Response) => {
  try {
    const { filename } = req.params;

    // Sanitize filename to prevent directory traversal
    const sanitizedFilename = path.basename(filename);
    const filePath = path.join(uploadsPath, sanitizedFilename);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      res.status(404).json({
        error: 'Not found',
        message: 'File not found',
      });
      return;
    }

    // Send file
    res.sendFile(path.resolve(filePath));
  } catch (error) {
    console.error('Get file error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
