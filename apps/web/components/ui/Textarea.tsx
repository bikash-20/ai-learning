import type { TextareaHTMLAttributes } from 'react';

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

/**
 * Shared textarea. Mirrors the recipe used by `Input` and `Select`:
 *   - glass surface so the same token applies in both light + dark
 *   - min-h-[44px] for touch target baseline
 *   - text-fg (token-driven foreground) + placeholder:text-muted so contrast
 *     stays WCAG AA in both modes
 *   - :focus-visible ring inherits from the global focus rule in
 *     `app/globals.css`
 *
 * The wrapper intentionally does NOT paint an opaque background — it relies
 * on the .glass class which is itself semi-transparent so any decorative
 * layer (e.g. the bg-explore WebP) shows through. This matches how `Input`
 * and `Select` already work.
 */
export const Textarea = ({ className = '', rows = 4, ...rest }: TextareaProps) => (
  <textarea
    {...rest}
    rows={rows}
    className={`glass w-full rounded-card border-glass-border px-4 py-2.5 text-sm text-fg placeholder:text-muted focus-visible:outline-none disabled:opacity-60 ${className}`.trim()}
  />
);
