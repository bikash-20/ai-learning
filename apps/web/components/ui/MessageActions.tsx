'use client';

import { useState } from 'react';

export type MessageActionsProps = {
  /** Text to copy. For user messages this is the user's content; for
   *  assistant messages it's the rendered reply. */
  text: string;
  /** Show a Regenerate button — only meaningful for the last assistant
   *  message (we don't regenerate historical replies). */
  onRegenerate?: () => void;
  regenerating?: boolean;
  /** Show an Edit button — only meaningful for the last user message (we
   *  don't edit historical user prompts). */
  onEdit?: () => void;
};

/**
 * Per-message action row. Sits under the bubble. Copy / Regenerate /
 * Edit. Buttons fade in on hover/focus for a less busy read; they're
 * still visible on touch (where hover doesn't exist).
 */
export const MessageActions = ({ text, onRegenerate, regenerating, onEdit }: MessageActionsProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard denied */
    }
  };

  return (
    <div className="mt-1 flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
      <button
        type="button"
        onClick={handleCopy}
        aria-label="Copy message"
        className="rounded-pill border border-glass-border bg-glass-bg px-2 py-0.5 hover:text-fg"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          aria-label="Edit message"
          className="rounded-pill border border-glass-border bg-glass-bg px-2 py-0.5 hover:text-fg"
        >
          Edit
        </button>
      )}
      {onRegenerate && (
        <button
          type="button"
          onClick={onRegenerate}
          disabled={regenerating}
          aria-label="Regenerate reply"
          className="rounded-pill border border-glass-border bg-glass-bg px-2 py-0.5 hover:text-fg disabled:opacity-50"
        >
          {regenerating ? 'Regenerating…' : 'Regenerate'}
        </button>
      )}
    </div>
  );
};