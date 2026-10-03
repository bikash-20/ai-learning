import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ---------- Better Auth tables ----------
export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  /** 'user' (default) or 'admin'. Gated server-side; see requireAdmin. */
  role: text('role', { enum: ['user', 'admin'] }).notNull().default('user'),
  /** Total XP earned across all interactions. */
  xp: integer('xp').notNull().default(0),
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
  /** Optional: linked to a pre-deployed template. Null for ad-hoc exams
   *  generated from the MCQ bank on the fly. */
  templateId: text('template_id').references(() => examTemplate.id),
  /** Ad-hoc exam items — list of mcqBank ids drawn when /api/exam/run
   *  was called. The server-side verdict on submit uses this list. */
  itemIds: text('item_ids', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
  /** Server-verified answer key per item id. NEVER sent to the client
   *  until /api/exam/submit is called. */
  answerKey: text('answer_key', { mode: 'json' })
    .$type<Record<string, { answerIdx: number; explanation: string }>>()
    .notNull()
    .default(sql`'{}'`),
  kind: text('kind', { enum: ['ielts-mini-mock'] }).notNull().default('ielts-mini-mock'),
  level: text('level').notNull().default('B2'),
  difficulty: text('difficulty', { enum: ['easy', 'hard'] }).notNull().default('hard'),
  score: integer('score'),
  /** Total seconds the client should countdown. Persisted so the
   *  /api/exam/submit path can detect "expired but submitted" cases. */
  durationSec: integer('duration_sec').notNull().default(0),
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

// ---------- Conversations (per-user chat threads) ----------
// Groups messages under a single thread for the history sidebar.
// Created lazily on the first POST /api/chat that omits conversationId.
export const conversation = sqliteTable('conversation', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  mode: text('mode', { enum: ['general', 'code', 'math', 'theory', 'explain'] }).notNull().default('general'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export const conversationMessage = sqliteTable('conversation_message', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull().references(() => conversation.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
  content: text('content').notNull(),
  provider: text('provider', { enum: ['workers', 'openrouter'] }),
  model: text('model'),
  tokens: integer('tokens'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// ---------- AI result cache ----------
// Same prompt + same model parameters = same answer. Dedup across users so
// free-tier quota isn't burned twice on the same (topic, level, n) quiz
// generation, or the same (question, chosen answer, level) explanation.
export const aiCache = sqliteTable('ai_cache', {
  cacheKey: text('cache_key').primaryKey(),
  kind: text('kind', { enum: ['text', 'json', 'explanation'] }).notNull(),
  payload: text('payload').notNull(),
  expiresAt: integer('expires_at').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// ---------- User preferences ----------
// Per-user toggles. Created lazily on first GET /api/me/prefs; one row
// per user. Theme + AI explain for now — keep additive.
export const userPrefs = sqliteTable('user_prefs', {
  userId: text('user_id').primaryKey().references(() => user.id, { onDelete: 'cascade' }),
  /** Show AI explanation alongside the static one on quiz reveal. Off =
   *  static only — saves free-tier AI quota. Default true. */
  aiExplain: integer('ai_explain', { mode: 'boolean' }).notNull().default(true),
  /** 'system' = follow OS, 'light' | 'dark' override. */
  theme: text('theme', { enum: ['system', 'light', 'dark'] }).notNull().default('system'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// ---------- MCQ bank ----------
// Authored multiple-choice questions, keyed by topic + CEFR level. The quiz
// route consults this table before falling back to AI generation. The
// `topic` column is a short, lowercased slug (e.g. 'conditionals',
// 'articles', 'prepositions', 'phrasal-verbs', 'vocabulary-ielts') that
// the /quiz UI can preselect from the chip row.
export const mcqBank = sqliteTable('mcq_bank', {
  id: text('id').primaryKey(),
  topic: text('topic').notNull(),
  level: text('level').notNull(),
  difficulty: text('difficulty', { enum: ['easy', 'hard'] }).notNull(),
  prompt: text('prompt').notNull(),
  options: text('options', { mode: 'json' }).$type<string[]>().notNull(),
  answerIdx: integer('answer_idx').notNull(),
  explanation: text('explanation').notNull(),
  tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});