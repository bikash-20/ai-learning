import type { ReactNode } from 'react';

const Skeleton = ({ className = '' }: { className?: string }) => (
  <div className={`h-3 rounded-glass bg-glass-bg ${className}`.trim()} aria-hidden="true" />
);

export const LoadingState = ({ children }: { children?: ReactNode }) => (
  <div className="space-y-3" role="status" aria-live="polite">
    {children ?? (
      <>
        <Skeleton className="w-2/3" />
        <Skeleton className="w-1/2" />
        <Skeleton className="w-3/4" />
      </>
    )}
  </div>
);

export const TypingDots = () => (
  <div className="glass inline-flex items-center gap-1.5 rounded-pill px-4 py-2.5" aria-label="Tutor is typing">
    <span className="dot-pulse h-2 w-2 rounded-full bg-accent" />
    <span className="dot-pulse h-2 w-2 rounded-full bg-accent" />
    <span className="dot-pulse h-2 w-2 rounded-full bg-accent" />
  </div>
);