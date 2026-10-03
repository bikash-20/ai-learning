'use client';

import { useEffect, useRef, type KeyboardEvent } from 'react';

export type ChatInputProps = {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop?: () => void;
  streaming?: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** Max characters accepted by the underlying field. */
  maxLength?: number;
};

/**
 * Auto-growing textarea. Enter sends, Shift+Enter inserts a newline.
 * When `streaming` is true the send button is replaced with a Stop button
 * that calls `onStop` (the parent should abort the in-flight stream).
 *
 * Sits on top of the shared `Textarea` recipe for visual consistency
 * but uses `fieldSizing=content` for the auto-grow so we don't have
 * to hand-tune a `rows` prop while the user types.
 */
export const ChatInput = ({
  value,
  onChange,
  onSend,
  onStop,
  streaming,
  disabled,
  placeholder = 'Ask anything — CS, math, code, theory…',
  maxLength = 4000,
}: ChatInputProps) => {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Auto-grow the textarea so the user never has to scroll inside the field.
  useEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 240)}px`;
  }, [value]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (!streaming && !disabled && value.trim()) onSend();
    }
  };

  const canSend = !streaming && !disabled && value.trim().length > 0;

  return (
    <div className="flex items-end gap-2">
      <div className="relative flex-1">
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          rows={1}
          aria-label="Message"
          className="glass min-h-[44px] w-full resize-none rounded-card border-glass-border px-4 py-2.5 pb-7 text-sm text-fg placeholder:text-muted focus-visible:outline-none disabled:opacity-60"
        />
        <span className="pointer-events-none absolute bottom-2 right-3 text-[10px] text-muted">
          {value.length}/{maxLength}
        </span>
      </div>

      {streaming ? (
        <button
          type="button"
          onClick={onStop}
          aria-label="Stop generating"
          className="inline-flex h-[44px] shrink-0 items-center justify-center gap-2 rounded-pill border border-danger/40 bg-danger/10 px-4 text-sm font-medium text-danger transition-colors hover:bg-danger/20"
        >
          <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-sm bg-danger" />
          Stop
        </button>
      ) : (
        <button
          type="button"
          onClick={onSend}
          disabled={!canSend}
          aria-label="Send message"
          className="inline-flex h-[44px] shrink-0 items-center justify-center gap-2 rounded-pill bg-primary px-5 text-sm font-medium text-primary-fg shadow-[0_0_18px_-2px_color-mix(in_oklab,var(--glow)_55%,transparent)] transition-[background-color,box-shadow] hover:bg-primary-hover hover:shadow-[0_0_22px_-2px_color-mix(in_oklab,var(--glow)_75%,transparent)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Send
        </button>
      )}
    </div>
  );
};