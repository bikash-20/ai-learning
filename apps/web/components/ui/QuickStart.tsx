'use client';

import type { ChatMode } from './ModeChips';

/**
 * Suggestion chips shown above the empty state on /chat. Each mode has
 * its own short list — tapping a chip fills the input AND submits it
 * (the parent decides what to do with `onPick`).
 */
const SUGGESTIONS: Record<ChatMode, string[]> = {
  general: [
    'Explain bubble sort with Python code',
    'What is the time complexity of a hash table?',
    "What's the difference between SQL and NoSQL?",
  ],
  code: [
    'Write a Python function to reverse a linked list',
    'Fix this JavaScript: const x = [1,2,3] x.map(n => n*2)',
    'Show me a recursive Fibonacci in C++ with memoization',
  ],
  math: [
    'Solve 2x + 3 = 11 step by step',
    'Prove the Pythagorean identity with a unit circle',
    'Differentiate f(x) = ln(sin(x)²)',
  ],
  theory: [
    "Explain Big-O notation in plain English",
    'What is a closure? Why does it matter?',
    'Describe the CAP theorem with a concrete example',
  ],
  explain: [
    "Explain recursion like I'm 12",
    "What's a derivative, in everyday language?",
    'Why does Wi-Fi slow down with more devices?',
  ],
};

export type QuickStartProps = {
  mode: ChatMode;
  onPick: (prompt: string) => void;
};

export const QuickStart = ({ mode, onPick }: QuickStartProps) => {
  const items = SUGGESTIONS[mode];
  return (
    <div className="flex flex-col items-center gap-3" role="group" aria-label="Quick start suggestions">
      <p className="text-xs uppercase tracking-wide text-muted">Try one of these</p>
      <div className="flex flex-wrap justify-center gap-2">
        {items.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="rounded-pill border border-glass-border bg-glass-bg/60 px-3 py-1.5 text-xs text-fg hover:border-accent hover:text-accent"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
};