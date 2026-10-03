import type { ReactNode } from 'react';

export const EmptyState = ({ title, hint, children }: { title: string; hint?: string; children?: ReactNode }) => (
  <div className="glass flex flex-col items-center gap-2 rounded-glass px-6 py-10 text-center">
    <div className="font-display text-2xl tracking-display text-fg">{title}</div>
    {hint && <div className="text-sm text-muted">{hint}</div>}
    {children}
  </div>
);