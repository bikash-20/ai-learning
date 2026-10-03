import { z } from 'zod';

// ---------- Error codes (single source of truth) ----------
export const ErrorCode = {
  Unauthorized: 'UNAUTHORIZED',
  Forbidden: 'FORBIDDEN',
  NotFound: 'NOT_FOUND',
  BadRequest: 'BAD_REQUEST',
  RateLimited: 'RATE_LIMITED',
  UpstreamUnavailable: 'UPSTREAM_UNAVAILABLE',
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
    'RATE_LIMITED',
    'UPSTREAM_UNAVAILABLE',
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
export type ExamTemplate = z.infer<typeof ExamTemplate>;