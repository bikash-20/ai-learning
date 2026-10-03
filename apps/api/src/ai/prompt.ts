import type { Level, Topic } from '@quantara/shared';

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

export const QUIZ_FROM_PASSAGE_PROMPT = (
  passage: string,
  level: Level,
  n: number,
  focus: 'mixed' | 'vocab' | 'inference' | 'detail' | 'tone',
) => {
  const focusLine =
    focus === 'mixed'
      ? 'Mix detail, inference, and vocabulary questions.'
      : focus === 'vocab'
        ? 'Focus on vocabulary in context — pick the closest synonym or collocate from the passage.'
        : focus === 'inference'
          ? 'Focus on inference — what the author implies, does NOT say directly.'
          : focus === 'detail'
            ? 'Focus on explicit detail — answerable by pointing to a specific sentence.'
            : 'Focus on tone / authorial attitude — pick the option that best characterises the author.';
  return `Read the passage below and generate exactly ${n} multiple-choice comprehension questions at CEFR level ${level}.\n` +
    `${focusLine}\n` +
    `Rules:\n` +
    `- Every question must reference a real part of the passage; no outside facts.\n` +
    `- 4 options each, answerIdx in [0,3], explanation ≤ 25 words citing the relevant phrase.\n` +
    `- Avoid obvious giveaways ("because the passage says…", "all of the above").\n\n` +
    `Passage:\n"""${passage}"""\n\n` +
    `Return ONLY JSON of the form {"items":[{"prompt":"...","options":["A","B","C","D"],"answerIdx":0,"explanation":"..."}]}.`;
};