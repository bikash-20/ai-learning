/**
 * Brand constants — single source of truth for the Quantara identity.
 *
 * Everything in the app that touches the brand wordmark, founder credit,
 * or app name should pull from here. Edit this file to rename anything.
 */
export const BRAND = {
  /** Display name shown in the hero and navbar. */
  appName: 'Quantara',
  /** App name as it should appear in the wordmark (uppercase, no trailing periods). */
  wordmark: 'QUANTARA',
  /** One-line marketing tagline under the hero heading. */
  tagline: 'An AI tutor for CS, math, physics, and code.',
  /** Sub-line under the sign-in card. */
  signInTagline: 'A STEM tutor in your pocket — chat, quiz, flashcards.',
  /** Hero tagline on the sign-in brand panel. */
  heroTagline: 'Learn the universe of knowledge.',
  /** Three short value points shown on the sign-in brand panel (desktop).
   *  `iconId` is resolved to an inline SVG by the consumer. */
  valuePoints: [
    { iconId: 'sparkle', text: 'Streaming answers to CS, math, and code questions.' },
    { iconId: 'brain',   text: 'Flashcards with spaced repetition so concepts stick.' },
    { iconId: 'exam',    text: 'Timed mini-mocks across every STEM subject.' },
  ] as const,
  /** Founder credit used on the home hero, hub, and sign-in footer. */
  founder: {
    name: 'Bikash Talukder',
    title: 'Founder & CEO',
    role: 'CS & AI Engineer',
  },
  /** Short study tips rotated daily on the hub hero. Keep tone friendly. */
  studyTips: [
    'Use Code mode for bug fixes and full snippets — the tutor formats, highlights, and explains each line.',
    'For math problems, paste the equation and ask for a step-by-step. Numbers beat vibes.',
    'When a concept lands, send yourself a 2-line summary. It doubles as a flashcard.',
    'Set a 5-minute timer for drills. Short, focused bursts beat long, distracted sessions.',
    "Re-derive what you memorized last week. If you can't, you don't actually know it yet.",
    'Read errors top-to-bottom — the first line is usually the actual cause.',
    'Sleep on it. Your brain consolidates what you studied while you rest, not while you cram.',
    'Ship something tiny every day. Ten lines of working code beats fifty lines of pseudo-code.',
  ],
} as const;

/**
 * Pick today's study tip deterministically from the date. Same tip for all
 * users on the same day — feels shared, not random. Re-rolls at midnight UTC.
 */
export const todaysTip = (now: Date = new Date()): string => {
  const tips = BRAND.studyTips;
  // Day-of-year as index. Cheap and stable.
  const start = Date.UTC(now.getUTCFullYear(), 0, 0);
  const diff = now.getTime() - start;
  const dayOfYear = Math.floor(diff / 86_400_000);
  return tips[dayOfYear % tips.length]!;
};