import type { Level } from '@ai-learning/shared';

const CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

export const CefrBadge = ({ level }: { level: Level | string }) => {
  const ok = (CEFR as readonly string[]).includes(level);
  if (!ok) return <span className="cefr-badge bg-surface-2 text-muted">{level}</span>;
  return <span className={`cefr-badge cefr-${level}`}>{level}</span>;
};