import type { Level, Topic } from '@ai-learning/shared';

export const SYSTEM_TUTOR = (level: Level) =>
  `You are a concise English tutor. Adapt explanations to CEFR level ${level}. ` +
  `Rules: short paragraphs, concrete examples, no "as an AI" preambles, no hedging. ` +
  `When asked for JSON, return ONLY valid JSON, no prose.`;

export const QUIZ_GEN_PROMPT = (topic: Topic, level: Level, n: number) =>
  `Generate exactly ${n} multiple-choice questions on the topic "${topic}" for CEFR level ${level}. ` +
  `Return ONLY JSON of the form {"items":[{"prompt":"...","options":["A","B","C","D"],"answerIdx":0,"explanation":"..."}]}. ` +
  `Constraints: 4 options per item, answerIdx in [0,3], explanation ≤ 25 words, items must be unambiguous.`;

export const EXPLAIN_PROMPT = (prompt: string, correctAnswer: string) =>
  `A learner answered a quiz question wrong.\nQuestion: ${prompt}\nCorrect answer: ${correctAnswer}\n` +
  `Explain in ≤ 40 words why the correct answer is correct and the typical mistake. English only, no hedging.`;