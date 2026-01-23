import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

// Users table
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  firstName: text('first_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// Refresh tokens table
export const refreshTokens = sqliteTable('refresh_tokens', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  revokedAt: integer('revoked_at', { mode: 'timestamp' }),
});

// Inquiries table
export const inquiries = sqliteTable('inquiries', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  content: text('content').notNull().default(''),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// Resources table
export const resources = sqliteTable('resources', {
  id: text('id').primaryKey(),
  inquiryId: text('inquiry_id').notNull().references(() => inquiries.id, { onDelete: 'cascade' }),
  type: text('type', { enum: ['link', 'file'] }).notNull(),
  title: text('title').notNull(),
  url: text('url'),
  filename: text('filename'),
  mimeType: text('mime_type'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  inquiries: many(inquiries),
  refreshTokens: many(refreshTokens),
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
    references: [users.id],
  }),
}));

export const inquiriesRelations = relations(inquiries, ({ one, many }) => ({
  user: one(users, {
    fields: [inquiries.userId],
    references: [users.id],
  }),
  resources: many(resources),
}));

export const resourcesRelations = relations(resources, ({ one }) => ({
  inquiry: one(inquiries, {
    fields: [resources.inquiryId],
    references: [inquiries.id],
  }),
}));

// Types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type RefreshToken = typeof refreshTokens.$inferSelect;
export type NewRefreshToken = typeof refreshTokens.$inferInsert;
export type Inquiry = typeof inquiries.$inferSelect;
export type NewInquiry = typeof inquiries.$inferInsert;
export type Resource = typeof resources.$inferSelect;
export type NewResource = typeof resources.$inferInsert;
