import { z } from 'zod';

// ---------- Error codes (single source of truth) ----------
export const ErrorCode = {
  Unauthorized: 'UNAUTHORIZED',
  Forbidden: 'FORBIDDEN',
  NotFound: 'NOT_FOUND',
  BadRequest: 'BAD_REQUEST',
  ValidationError: 'VALIDATION_ERROR',
  RateLimited: 'RATE_LIMITED',
  UpstreamUnavailable: 'UPSTREAM_UNAVAILABLE',
  UpstreamAuth: 'UPSTREAM_AUTH',
  AIInvalid: 'AI_INVALID_OUTPUT',
  Internal: 'INTERNAL',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const ApiError = z.object({
  code: z.enum([
    'UNAUTHORIZED',
    'FORBIDDEN',
    'NOT_FOUND',
    'BAD_REQUEST',
    'VALIDATION_ERROR',
    'RATE_LIMITED',
    'UPSTREAM_UNAVAILABLE',
    'UPSTREAM_AUTH',
    'AI_INVALID_OUTPUT',
    'INTERNAL',
  ]),
  message: z.string(),
  details: z.unknown().optional(),
});
export type ApiErrorT = z.infer<typeof ApiError>;

// ---------- Levels & topics (English-only MVP) ----------
export const Level = z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
export type Level = z.infer<typeof Level>;

export const Topic = z.string().min(1).max(80);
export type Topic = z.infer<typeof Topic>;

// ---------- Chat ----------
export const Role = z.enum(['user', 'assistant', 'system']);
export type Role = z.infer<typeof Role>;

export const ChatMessage = z.object({
  role: Role,
  content: z.string().min(1).max(8000),
});
export type ChatMessage = z.infer<typeof ChatMessage>;

export const ChatRequest = z.object({
  messages: z.array(ChatMessage).min(1).max(40),
  stream: z.boolean().default(true),
  // optional client-side id for idempotency
  clientMsgId: z.string().uuid().optional(),
});
export type ChatRequest = z.infer<typeof ChatRequest>;

// SSE event shapes (server -> client)
export const SseEvent =
  z.discriminatedUnion('event', [
    z.object({ event: z.literal('token'), data: z.object({ text: z.string() }) }),
    z.object({ event: z.literal('done'), data: z.object({ provider: z.string(), model: z.string(), tokens: z.number() }) }),
    z.object({ event: z.literal('error'), data: ApiError }),
  ]);
export type SseEvent = z.infer<typeof SseEvent>;

// ---------- Quiz ----------
export const QuizSource = z.enum(['manual', 'pdf', 'ai']);
export type QuizSource = z.infer<typeof QuizSource>;

export const QuizItem = z.object({
  id: z.string().uuid().optional(),     // present when returned by the server
  prompt: z.string().min(3),
  options: z.array(z.string().min(1)).min(2).max(6),
  answerIdx: z.number().int().nonnegative(),
  explanation: z.string().min(1),
});
export type QuizItem = z.infer<typeof QuizItem>;

export const QuizFromTopicRequest = z.object({
  topic: Topic,
  level: Level,
  n: z.number().int().min(1).max(20).default(5),
  /** 'easy' (default) keeps the existing AI generation. 'hard' pulls from
   *  the curated bank only — every item is hand-picked, no obvious
   *  giveaways, multi-clause reasoning required. */
  difficulty: z.enum(['easy', 'hard']).default('easy'),
  /** Optional client-side knob. Currently 'mcq' (default). Reserved for
   *  future 'cloze' / 'reorder' modes. */
  mode: z.enum(['mcq']).default('mcq'),
});
export type QuizFromTopicRequest = z.infer<typeof QuizFromTopicRequest>;

export const QuizFromTopicResponse = z.object({
  quizId: z.string().uuid(),
  items: z.array(QuizItem).min(1).max(20),
  provider: z.string().optional(),
  model: z.string().optional(),
});
export type QuizFromTopicResponse = z.infer<typeof QuizFromTopicResponse>;

// Strict schema for the AI's JSON output (used by provider's Zod validation)
export const QuizItemsJson = z.object({
  items: z.array(QuizItem).min(1).max(20),
});
export type QuizItemsJson = z.infer<typeof QuizItemsJson>;

export const QuizAttemptItem = z.object({
  itemId: z.string().uuid(),
  picked: z.number().int().nonnegative(),
});
export type QuizAttemptItem = z.infer<typeof QuizAttemptItem>;

export const QuizAttemptRequest = z.object({
  quizId: z.string().uuid(),
  answers: z.array(QuizAttemptItem).min(1),
});
export type QuizAttemptRequest = z.infer<typeof QuizAttemptRequest>;

export const QuizAttemptResultItem = z.object({
  itemId: z.string().uuid(),
  correct: z.boolean(),
  correctIdx: z.number().int().nonnegative(),
  aiExplanation: z.string().optional(),
});
export type QuizAttemptResultItem = z.infer<typeof QuizAttemptResultItem>;

export const QuizAttemptResponse = z.object({
  attemptId: z.string().uuid(),
  score: z.number().int().nonnegative(),
  total: z.number().int().positive(),
  results: z.array(QuizAttemptResultItem),
});
export type QuizAttemptResponse = z.infer<typeof QuizAttemptResponse>;

// Per-question AI explain (called by the quiz reveal in Phase 0).
export const QuizExplainRequest = z.object({
  quizId: z.string().uuid(),
  itemId: z.string().uuid(),
  pickedIdx: z.number().int().nonnegative(),
  level: Level,
});
export type QuizExplainRequest = z.infer<typeof QuizExplainRequest>;

/**
 * Quiz from a passage: the user supplies a block of text (article,
 * dialogue, report) and the AI generates n comprehension MCQs against it.
 * Passage length is bounded to keep the prompt + output under control.
 */
export const QuizFromPassageRequest = z.object({
  passage: z.string().min(80).max(8000),
  level: Level,
  n: z.number().int().min(1).max(10).default(5),
  /** Optional hint to focus generation (vocab / inference / tone / fact) */
  focus: z.enum(['mixed', 'vocab', 'inference', 'detail', 'tone']).default('mixed'),
});
export type QuizFromPassageRequest = z.infer<typeof QuizFromPassageRequest>;

export const QuizExplainResponse = z.object({
  explanation: z.string(),
  model: z.string(),
  provider: z.enum(['workers', 'openrouter']),
  cached: z.boolean().optional(),
});
export type QuizExplainResponse = z.infer<typeof QuizExplainResponse>;

// ---------- Vocab / Grammar (authored content) ----------
export const Vocab = z.object({
  word: z.string().min(1),
  pos: z.enum(['noun', 'verb', 'adj', 'adv', 'prep', 'conj', 'pron', 'det', 'interj']),
  definition: z.string().min(1),
  examples: z.array(z.string()).min(1).max(5),
  tags: z.array(z.string()).default([]),
  level: Level,
});
export type Vocab = z.infer<typeof Vocab>;

export const Grammar = z.object({
  topic: z.string().min(1),
  level: Level,
  explanation: z.string().min(1),
  examples: z.array(z.string()).min(1).max(5),
});
export type Grammar = z.infer<typeof Grammar>;

// ---------- Exam (full timed mock) ----------
export const ExamKind = z.enum(['ielts-mini-mock']);
export type ExamKind = z.infer<typeof ExamKind>;

export const ExamSection = z.object({
  name: z.string(),
  durationMin: z.number().int().positive(),
  questionIds: z.array(z.string().uuid()).min(1),
});
export type ExamSection = z.infer<typeof ExamSection>;

export const ExamTemplate = z.object({
  id: z.string().uuid(),
  kind: ExamKind,
  title: z.string(),
  totalDurationMin: z.number().int().positive(),
  sections: z.array(ExamSection).min(1),
});

/**
 * Start an exam session. Returns items WITHOUT answerIdx or explanation so
 * the client can't peek. Verdict + explanations are server-side only and
 * revealed on submit. Items are drawn from the curated MCQ bank for now;
 * AI generation can plug in later behind the same surface.
 */
export const ExamStartRequest = z.object({
  kind: ExamKind.default('ielts-mini-mock'),
  level: Level,
  /** Total items. Capped server-side to keep D1 queries cheap. */
  n: z.number().int().min(5).max(40).default(20),
  /** Difficulty: easy = MCQ bank easy; hard = MCQ bank hard. */
  difficulty: z.enum(['easy', 'hard']).default('hard'),
});
export type ExamStartRequest = z.infer<typeof ExamStartRequest>;

/** Items are returned WITHOUT answerIdx / explanation. */
export const ExamItem = z.object({
  id: z.string().uuid(),
  prompt: z.string().min(3),
  options: z.array(z.string().min(1)).min(2).max(6),
});
export type ExamItem = z.infer<typeof ExamItem>;

export const ExamStartResponse = z.object({
  examId: z.string().uuid(),
  /** Total seconds the client should countdown. Computed from the
   *  template + n. 60s/question is a reasonable default. */
  durationSec: z.number().int().positive(),
  items: z.array(ExamItem).min(1),
  /** Free-form source label for the chip ("bank" for now). */
  provider: z.string(),
  model: z.string(),
});
export type ExamStartResponse = z.infer<typeof ExamStartResponse>;

export const ExamAnswer = z.object({
  itemId: z.string().uuid(),
  picked: z.number().int().nonnegative(),
});
export type ExamAnswer = z.infer<typeof ExamAnswer>;

export const ExamSubmitRequest = z.object({
  examId: z.string().uuid(),
  answers: z.array(ExamAnswer),
});
export type ExamSubmitRequest = z.infer<typeof ExamSubmitRequest>;

export const ExamResultItem = z.object({
  itemId: z.string().uuid(),
  picked: z.number().int().nonnegative().nullable(),
  correct: z.boolean(),
  correctIdx: z.number().int().nonnegative(),
  explanation: z.string(),
});
export type ExamResultItem = z.infer<typeof ExamResultItem>;

export const ExamSubmitResponse = z.object({
  examId: z.string().uuid(),
  score: z.number().int().nonnegative(),
  total: z.number().int().positive(),
  /** CEFR-band mapping for this score. Coarse heuristic. */
  band: z.enum(['a1', 'a2', 'b1', 'b2', 'c1', 'c2']),
  results: z.array(ExamResultItem),
});
export type ExamSubmitResponse = z.infer<typeof ExamSubmitResponse>;

// ---------- User prefs (per-feature toggles) ----------
export const UserPrefs = z.object({
  aiExplain: z.boolean().default(true),
  theme: z.enum(['system', 'light', 'dark']).default('system'),
});
export type UserPrefsT = z.infer<typeof UserPrefs>;

export const UserPrefsPatch = UserPrefs.partial();
export type UserPrefsPatchT = z.infer<typeof UserPrefsPatch>;

// ---------- Progress (per-user analytics) ----------
export const ProgressByLevel = z.record(
  z.string(), // 'A2' | 'B1' | 'B2' | 'C1'
  z.object({ correct: z.number().int().nonnegative(), total: z.number().int().nonnegative() }),
);
export type ProgressByLevelT = z.infer<typeof ProgressByLevel>;

export const ProgressTopicStat = z.object({
  topic: z.string(),
  correct: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  pct: z.number(),
});
export type ProgressTopicStatT = z.infer<typeof ProgressTopicStat>;

export const ProgressRecent = z.object({
  quizId: z.string().uuid(),
  topic: z.string(),
  level: Level,
  score: z.number().int().nonnegative(),
  total: z.number().int().positive(),
  finishedAt: z.number().nullable(),
});
export type ProgressRecentT = z.infer<typeof ProgressRecent>;

export const Progress = z.object({
  totalAttempts: z.number().int().nonnegative(),
  totalItems: z.number().int().nonnegative(),
  totalCorrect: z.number().int().nonnegative(),
  accuracy: z.number(), // 0..1
  byLevel: ProgressByLevel,
  weak: z.array(ProgressTopicStat),
  best: z.array(ProgressTopicStat),
  recent: z.array(ProgressRecent),
});
export type ProgressT = z.infer<typeof Progress>;
export type ExamTemplate = z.infer<typeof ExamTemplate>;