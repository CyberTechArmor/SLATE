import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import path from 'path';
import fs from 'fs';

const databasePath = process.env.DATABASE_PATH || './data/inquiry.db';

// Ensure directory exists
const dbDir = path.dirname(databasePath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const sqlite = new Database(databasePath);
export const db = drizzle(sqlite, { schema });

// Initialize database tables
export function initDatabase(): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      first_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      revoked_at INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS inquiries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS resources (
      id TEXT PRIMARY KEY,
      inquiry_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('link', 'file')),
      title TEXT NOT NULL,
      url TEXT,
      filename TEXT,
      mime_type TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (inquiry_id) REFERENCES inquiries(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_inquiries_user_id ON inquiries(user_id);
    CREATE INDEX IF NOT EXISTS idx_resources_inquiry_id ON resources(inquiry_id);
  `);

  // Enable foreign keys
  sqlite.pragma('foreign_keys = ON');
}

export { sqlite };
