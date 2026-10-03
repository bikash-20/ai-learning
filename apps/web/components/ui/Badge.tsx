import type { ReactNode } from 'react';

const CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
type Cefr = (typeof CEFR)[number];

const cefrBg: Record<Cefr, string> = {
  A1: 'bg-cefr-a1-bg text-cefr-a1-fg',
  A2: 'bg-cefr-a2-bg text-cefr-a2-fg',
  B1: 'bg-cefr-b1-bg text-cefr-b1-fg',
  B2: 'bg-cefr-b2-bg text-cefr-b2-fg',
  C1: 'bg-cefr-c1-bg text-cefr-c1-fg',
  C2: 'bg-cefr-c2-bg text-cefr-c2-fg',
};

const base = 'inline-flex items-center gap-1 rounded-pill border border-glass-border px-2.5 py-0.5 text-[0.7rem] font-semibold tracking-wide';

export type BadgeProps = {
  children: ReactNode;
  variant?: 'glass' | 'cefr';
  level?: string;
  className?: string;
};

export const Badge = ({ children, variant = 'glass', level, className }: BadgeProps) => {
  if (variant === 'cefr' && level && (CEFR as readonly string[]).includes(level)) {
    const cefr = level as Cefr;
    return <span className={`${base} ${cefrBg[cefr]} ${className ?? ''}`.trim()}>{level}</span>;
  }
  return (
    <span className={`${base} bg-glass-bg text-muted ${className ?? ''}`.trim()}>
      {children}
    </span>
  );
};