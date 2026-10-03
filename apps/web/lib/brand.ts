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
  tagline: 'AI-powered English practice — IELTS, grammar, vocabulary.',
  /** Sub-line under the sign-in card. */
  signInTagline: 'Practice English with an AI tutor.',
  /** Hero tagline on the sign-in brand panel. */
  heroTagline: 'Learn the universe of knowledge.',
  /** Three short value points shown on the sign-in brand panel (desktop). */
  valuePoints: [
    { icon: '✨', text: 'Adaptive AI tutor that meets you where you are.' },
    { icon: '🧠', text: 'Spaced-repetition so words and grammar actually stick.' },
    { icon: '🛰️', text: 'Timed mini-mocks that feel like the real exam.' },
  ] as const,
  /** Founder credit used on the home hero, hub, and sign-in footer. */
  founder: {
    name: 'Bikash Talukder',
    title: 'Founder & CEO',
    role: 'CS & AI Engineer',
  },
  /** Short study tips rotated daily on the hub hero. Keep tone friendly. */
  studyTips: [
    "Review 10 new words every morning — your brain remembers what it sees first.",
    "Speak aloud when you practise: hearing yourself builds confidence faster than silent reading.",
    "Mistakes are proof you're trying. Re-read your last quiz, then try the same topic again.",
    "Set a 5-minute timer for grammar drills. Short, focused bursts beat long, distracted sessions.",
    "Watch one short English clip a day with subtitles on, then off. Notice what changes.",
    "Write 3 sentences using today's new vocab. Use them in a real context — your future self will thank you.",
    "Don't translate whole sentences in your head. Think in chunks: subject + verb + object.",
    "Sleep on it. Your brain consolidates vocabulary while you rest, not while you cram.",
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