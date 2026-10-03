'use client';

import { ButtonHTMLAttributes, ReactNode } from 'react';
import { CheckIcon, XIcon } from './icons';

/**
 * Visual state of an MCQ option. Drives the colors, border, and icon. We
 * never rely on color alone — every state has a distinct icon and/or border
 * so the meaning reads in both light and dark mode and for color-blind
 * learners.
 *
 *   idle       – not selected, no result yet
 *   selected   – user picked this option before Check
 *   correct    – post-check, this is the right answer (whether or not it
 *                was picked)
 *   wrong      – post-check, this was the user's wrong pick
 *   disabled   – post-check, some other option
 */
export type OptionState = 'idle' | 'selected' | 'correct' | 'wrong' | 'disabled';

type OptionButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  state: OptionState;
  letter: string; // 'A', 'B', 'C', 'D'
  children: ReactNode;
};

/**
 * Map state → Tailwind classes. The colour values come from CSS tokens so
 * dark mode Just Works. The accent border in `selected` is solid + tinted
 * background so it can't blend into the glass surface (the bug Phase 0
 * exists to fix).
 */
const STATE_CLASSES: Record<OptionState, string> = {
  idle:
    'glass border-glass-border hover:border-accent text-fg bg-glass-bg',
  selected:
    'border-2 border-accent text-primary-fg shadow-glow ' +
    'bg-[color-mix(in_oklab,var(--accent)_85%,white_0%)] ' +
    'hover:bg-[color-mix(in_oklab,var(--accent)_90%,white_0%)]',
  correct:
    'border-2 border-success text-[#06222D] bg-success ' +
    'shadow-[0_0_0_3px_color-mix(in_oklab,var(--success)_30%,transparent)]',
  wrong:
    'border-2 border-danger text-[#FFFFFF] bg-danger ' +
    'shadow-[0_0_0_3px_color-mix(in_oklab,var(--danger)_30%,transparent)]',
  disabled:
    'glass border-glass-border text-muted opacity-60 cursor-default',
};

const LETTER_BG: Record<OptionState, string> = {
  idle: 'bg-glass-bg border border-glass-border text-fg',
  selected: 'bg-primary-fg/20 border border-primary-fg/40 text-primary-fg',
  correct: 'bg-[#06222D]/20 border border-[#06222D]/30 text-[#06222D]',
  wrong: 'bg-white/20 border border-white/40 text-white',
  disabled: 'bg-glass-bg border border-glass-border text-muted',
};

export const OptionButton = ({
  state,
  letter,
  children,
  className = '',
  disabled,
  ...rest
}: OptionButtonProps) => {
  const finalDisabled = disabled || state === 'disabled' || state === 'correct' || state === 'wrong';
  return (
    <button
      type="button"
      {...rest}
      disabled={finalDisabled}
      aria-pressed={state === 'selected'}
      data-state={state}
      className={`group relative flex min-h-[44px] w-full items-center gap-3 rounded-card px-4 py-3 text-left text-sm font-medium transition-[background-color,border-color,box-shadow,transform] duration-150 focus-visible:outline-none ${STATE_CLASSES[state]} ${className}`.trim()}
    >
      <span
        aria-hidden="true"
        className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold uppercase tracking-wide ${LETTER_BG[state]}`}
      >
        {letter}
      </span>
      <span className="flex-1 leading-snug">{children}</span>
      {state === 'selected' && <CheckIcon aria-hidden className="shrink-0" />}
      {state === 'correct' && <CheckIcon aria-hidden className="shrink-0" />}
      {state === 'wrong' && <XIcon aria-hidden className="shrink-0" />}
    </button>
  );
};