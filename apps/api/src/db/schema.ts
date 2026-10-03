import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ---------- Better Auth tables ----------
export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
});

export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp' }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp' }),
  scope: text('scope'),
  password: text('password'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

// ---------- Authored content ----------
export const vocab = sqliteTable('vocab', {
  id: text('id').primaryKey(),
  word: text('word').notNull(),
  pos: text('pos').notNull(),
  definition: text('definition').notNull(),
  examples: text('examples', { mode: 'json' }).$type<string[]>().notNull(),
  tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
  level: text('level').notNull(),
  createdBy: text('created_by').references(() => user.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export const grammar = sqliteTable('grammar', {
  id: text('id').primaryKey(),
  topic: text('topic').notNull(),
  level: text('level').notNull(),
  explanation: text('explanation').notNull(),
  examples: text('examples', { mode: 'json' }).$type<string[]>().notNull(),
  createdBy: text('created_by').references(() => user.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// ---------- Quiz ----------
export const quiz = sqliteTable('quiz', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').references(() => user.id, { onDelete: 'set null' }),
  source: text('source', { enum: ['manual', 'pdf', 'ai'] }).notNull(),
  topic: text('topic').notNull(),
  level: text('level').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export const quizItem = sqliteTable('quiz_item', {
  id: text('id').primaryKey(),
  quizId: text('quiz_id').notNull().references(() => quiz.id, { onDelete: 'cascade' }),
  prompt: text('prompt').notNull(),
  options: text('options', { mode: 'json' }).$type<string[]>().notNull(),
  answerIdx: integer('answer_idx').notNull(),
  explanation: text('explanation').notNull(),
});

export const quizAttempt = sqliteTable('quiz_attempt', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  quizId: text('quiz_id').notNull().references(() => quiz.id, { onDelete: 'cascade' }),
  score: integer('score').notNull(),
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  finishedAt: integer('finished_at', { mode: 'timestamp' }),
});

export const attemptItem = sqliteTable('attempt_item', {
  id: text('id').primaryKey(),
  attemptId: text('attempt_id').notNull().references(() => quizAttempt.id, { onDelete: 'cascade' }),
  itemId: text('item_id').notNull().references(() => quizItem.id, { onDelete: 'cascade' }),
  picked: integer('picked').notNull(),
  correct: integer('correct', { mode: 'boolean' }).notNull(),
  aiExplanation: text('ai_explanation'),
});

// ---------- Flashcards (schema only in v1, route in v2) ----------
export const flashDeck = sqliteTable('flash_deck', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').references(() => user.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  source: text('source', { enum: ['manual', 'ai'] }).notNull(),
  topic: text('topic').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export const flashCard = sqliteTable('flash_card', {
  id: text('id').primaryKey(),
  deckId: text('deck_id').notNull().references(() => flashDeck.id, { onDelete: 'cascade' }),
  front: text('front').notNull(),
  back: text('back').notNull(),
  srsState: text('srs_state', { mode: 'json' })
    .$type<{ intervalDays: number; ease: number; dueAt: number }>()
    .notNull(),
});

export const review = sqliteTable('review', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  cardId: text('card_id').notNull().references(() => flashCard.id, { onDelete: 'cascade' }),
  grade: integer('grade').notNull(),
  reviewedAt: integer('reviewed_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// ---------- Exam ----------
export const examTemplate = sqliteTable('exam_template', {
  id: text('id').primaryKey(),
  kind: text('kind', { enum: ['ielts-mini-mock'] }).notNull(),
  title: text('title').notNull(),
  totalDurationMin: integer('total_duration_min').notNull(),
  sections: text('sections', { mode: 'json' }).$type<Array<{ name: string; durationMin: number; questionIds: string[] }>>().notNull(),
});

export const examAttempt = sqliteTable('exam_attempt', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  templateId: text('template_id').notNull().references(() => examTemplate.id),
  score: integer('score'),
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  finishedAt: integer('finished_at', { mode: 'timestamp' }),
});

// ---------- Chat (for history + cost) ----------
export const chatMessage = sqliteTable('chat_message', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
  content: text('content').notNull(),
  provider: text('provider', { enum: ['workers', 'openrouter'] }),
  model: text('model'),
  tokens: integer('tokens'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});