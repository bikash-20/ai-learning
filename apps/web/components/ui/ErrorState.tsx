import type { ReactNode } from 'react';

export const ErrorState = ({
  title = 'Something went wrong',
  detail,
  children,
  onRetry,
  retryLabel = 'Retry',
}: {
  title?: string;
  detail?: string;
  children?: ReactNode;
  /** When provided, renders a Retry button next to the title. */
  onRetry?: () => void;
  retryLabel?: string;
}) => (
  <div role="alert" className="glass rounded-glass border border-danger/40 p-4">
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="font-display text-lg tracking-display text-danger">{title}</div>
        {detail && <div className="mt-1 text-sm text-muted">{detail}</div>}
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded-pill border border-danger/40 bg-danger/10 px-3 py-1.5 text-sm font-medium text-danger transition hover:bg-danger/20"
        >
          {retryLabel}
        </button>
      )}
    </div>
    {children}
  </div>
);