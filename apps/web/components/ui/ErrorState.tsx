import type { ReactNode } from 'react';

export const ErrorState = ({ title = 'Something went wrong', detail, children }: { title?: string; detail?: string; children?: ReactNode }) => (
  <div role="alert" className="glass rounded-glass border border-danger/40 p-4">
    <div className="font-display text-lg tracking-display text-danger">{title}</div>
    {detail && <div className="mt-1 text-sm text-muted">{detail}</div>}
    {children}
  </div>
);