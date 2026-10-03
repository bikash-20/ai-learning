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

/** STEM-tutor chat mode. Drives the system prompt. Defaults to 'general'. */
export const ChatMode = z.enum(['general', 'code', 'math', 'theory', 'explain']);
export type ChatMode = z.infer<typeof ChatMode>;

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
  /** STEM-tutor mode. Drives the system prompt. Defaults to 'general'. */
  mode: ChatMode.default('general'),
  /** Optional conversation id — used to thread messages for history /
   *  auto-title. If absent, the server creates one and returns it in the
   *  `done` SSE event. */
  conversationId: z.string().uuid().optional(),
});
export type ChatRequest = z.infer<typeof ChatRequest>;

// SSE event shapes (server -> client)
export const SseEvent =
  z.discriminatedUnion('event', [
    z.object({ event: z.literal('token'), data: z.object({ text: z.string() }) }),
    z.object({
      event: z.literal('done'),
      data: z.object({
        provider: z.string(),
        model: z.string(),
        tokens: z.number(),
        /** Optional conversation id — present when the server created one. */
        conversationId: z.string().uuid().optional(),
        /** Mode echoed back so the client can keep its UI in sync. */
        mode: ChatMode.optional(),
      }),
    }),
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

// ---------- Flashcards (SRS) ----------
export const SrsState = z.object({
  intervalDays: z.number(),
  ease: z.number(),
  /** ms epoch — when the card is due next. */
  dueAt: z.number(),
});
export type SrsStateT = z.infer<typeof SrsState>;

export const FlashCard = z.object({
  id: z.string().uuid(),
  front: z.string().min(1),
  back: z.string().min(1),
  /** Optional hint that nudges without revealing the answer. */
  hint: z.string().max(200).optional(),
  /** Optional short AI explanation shown on the back / via AI Explain. */
  explanation: z.string().max(600).optional(),
  tags: z.array(z.string().min(1).max(40)).max(8).default([]),
  difficulty: z.enum(['easy', 'hard']).optional(),
  srsState: SrsState,
});
export type FlashCardT = z.infer<typeof FlashCard>;

export const FlashDeck = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  topic: z.string().min(1),
  source: z.enum(['manual', 'ai']),
  cardCount: z.number().int().nonnegative(),
  /** Number of cards currently due (now >= dueAt). Computed by the API. */
  dueCount: z.number().int().nonnegative(),
  createdAt: z.number(),
});
export type FlashDeckT = z.infer<typeof FlashDeck>;

export const FlashDeckCreate = z.object({
  title: z.string().min(1).max(80),
  topic: z.string().min(1).max(80),
  cards: z.array(z.object({
    front: z.string().min(1).max(200),
    back: z.string().min(1).max(400),
    hint: z.string().max(200).optional(),
    explanation: z.string().max(600).optional(),
    tags: z.array(z.string().min(1).max(40)).max(8).default([]),
    difficulty: z.enum(['easy', 'hard']).default('easy'),
  })).min(1).max(50),
  /** 'manual' (default) or 'ai'. Distinguishes the source on the deck list. */
  source: z.enum(['manual', 'ai']).default('manual'),
  /** Optional AI metadata: {provider, model, generatedAt}. Only set when
   *  source === 'ai'. Stored verbatim on the deck as JSON for traceability. */
  aiMeta: z.object({
    provider: z.enum(['workers', 'openrouter']),
    model: z.string(),
    generatedAt: z.number().int().positive(),
  }).optional(),
});
export type FlashDeckCreateT = z.infer<typeof FlashDeckCreate>;

// ---------- AI deck generation (preview before save) ----------

/** One card shape returned by the AI. Front/back + optional helpers. */
export const FlashCardGen = z.object({
  front: z.string().min(1).max(200),
  back: z.string().min(1).max(400),
  /** Nudge that does NOT reveal the answer. */
  hint: z.string().max(200).optional(),
  /** One-sentence plain explanation of the back. */
  explanation: z.string().max(600).optional(),
  tags: z.array(z.string().min(1).max(40)).max(8).default([]),
  difficulty: z.enum(['easy', 'hard']).default('easy'),
});
export type FlashCardGenT = z.infer<typeof FlashCardGen>;

/** Request body for POST /api/flashcards/decks/generate and add-more. */
export const FlashDeckGenRequest = z.object({
  topic: z.string().min(1).max(80),
  level: Level,
  n: z.number().int().min(1).max(30),
  language: z.enum(['en', 'bn', 'bn-en']).default('en'),
  /** Optional source text — every card MUST be derived from this text only. */
  sourceText: z.string().min(80).max(3000).optional(),
  difficulty: z.enum(['easy', 'hard']).default('easy'),
});
export type FlashDeckGenRequestT = z.infer<typeof FlashDeckGenRequest>;

/** Strict schema for the AI's JSON output. Used by chatJson parse step. */
export const FlashDeckGenJson = z.object({
  title: z.string().min(1).max(80),
  cards: z.array(FlashCardGen).min(1).max(30),
});
export type FlashDeckGenJsonT = z.infer<typeof FlashDeckGenJson>;

/** Response from the generate endpoint — preview only, nothing persisted. */
export const FlashDeckGenResponse = FlashDeckGenJson.extend({
  provider: z.enum(['workers', 'openrouter']),
  model: z.string(),
  cached: z.boolean(),
});
export type FlashDeckGenResponseT = z.infer<typeof FlashDeckGenResponse>;

/** Add more cards to an existing deck (excludes cards already present). */
export const FlashDeckAddMoreRequest = FlashDeckGenRequest.extend({
  /** Optional fronts to de-dupe against (case-insensitive, trimmed). */
  excludeFronts: z.array(z.string().min(1).max(200)).max(50).optional(),
});
export type FlashDeckAddMoreRequestT = z.infer<typeof FlashDeckAddMoreRequest>;

/** Rename / re-topic a deck. */
export const FlashDeckPatch = z.object({
  title: z.string().min(1).max(80).optional(),
  topic: z.string().min(1).max(80).optional(),
}).refine((v) => v.title !== undefined || v.topic !== undefined, {
  message: 'Provide at least one of title or topic',
});
export type FlashDeckPatchT = z.infer<typeof FlashDeckPatch>;

/** Import a deck from JSON or CSV. The data field is the raw string. */
export const FlashDeckImportRequest = z.object({
  format: z.enum(['json', 'csv']),
  data: z.string().min(1).max(200_000),
  title: z.string().min(1).max(80).optional(),
  topic: z.string().min(1).max(80).optional(),
  source: z.enum(['manual', 'ai']).default('manual'),
});
export type FlashDeckImportRequestT = z.infer<typeof FlashDeckImportRequest>;

// ---------- Card-level AI helpers (hint + explain) ----------

export const FlashHintRequest = z.object({
  level: Level.optional(),
});
export type FlashHintRequestT = z.infer<typeof FlashHintRequest>;

export const FlashHintResponse = z.object({
  hint: z.string(),
  cached: z.boolean(),
  model: z.string(),
});
export type FlashHintResponseT = z.infer<typeof FlashHintResponse>;

export const FlashExplainRequest = z.object({
  depth: z.enum(['normal', 'simpler', 'deeper']).default('normal'),
  level: Level.default('B2'),
});
export type FlashExplainRequestT = z.infer<typeof FlashExplainRequest>;

export const FlashExplainResponse = z.object({
  explanation: z.string(),
  model: z.string(),
  provider: z.enum(['workers', 'openrouter']),
  cached: z.boolean(),
  depth: z.enum(['normal', 'simpler', 'deeper']),
});
export type FlashExplainResponseT = z.infer<typeof FlashExplainResponse>;

export const FlashReview = z.object({
  /** 0=Again, 1=Hard, 2=Good, 3=Easy */
  grade: z.number().int().min(0).max(3),
});
export type FlashReviewT = z.infer<typeof FlashReview>;

export const FlashReviewResult = z.object({
  card: FlashCard,
  xpDelta: z.number().int(),
});
export type FlashReviewResultT = z.infer<typeof FlashReviewResult>;

export const XpTotal = z.object({ xp: z.number().int().nonnegative() });
export type XpTotalT = z.infer<typeof XpTotal>;
export type ExamTemplate = z.infer<typeof ExamTemplate>;