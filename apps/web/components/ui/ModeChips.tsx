'use client';

export type ChatMode = 'general' | 'code' | 'math' | 'theory' | 'explain';

export type ModeChipsProps = {
  value: ChatMode;
  onChange: (m: ChatMode) => void;
  disabled?: boolean;
};

const MODES: Array<{ id: ChatMode; label: string; hint: string }> = [
  { id: 'general', label: 'General', hint: 'Pick the right tool.' },
  { id: 'code', label: 'Code', hint: 'Idiomatic, runnable examples.' },
  { id: 'math', label: 'Math', hint: 'Step-by-step with equations.' },
  { id: 'theory', label: 'Theory', hint: 'Define terms, then explain.' },
  { id: 'explain', label: 'Explain', hint: 'Plain English, no jargon.' },
];

/**
 * Mode chip group. Lifts state up to the chat page — the page owns the
 * current mode and persists it in conversation metadata. Disabled while
 * streaming so the user can't switch mid-flight.
 */
export const ModeChips = ({ value, onChange, disabled }: ModeChipsProps) => (
  <div
    role="radiogroup"
    aria-label="Tutor mode"
    className="flex flex-wrap gap-1.5"
  >
    {MODES.map((m) => {
      const active = m.id === value;
      return (
        <button
          key={m.id}
          type="button"
          role="radio"
          aria-checked={active}
          aria-label={`${m.label} mode: ${m.hint}`}
          disabled={disabled}
          onClick={() => onChange(m.id)}
          className={`rounded-pill border px-3 py-1 text-xs font-semibold uppercase tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
            active
              ? 'border-accent bg-accent/15 text-accent'
              : 'border-glass-border bg-glass-bg/60 text-muted hover:border-accent hover:text-fg'
          }`}
        >
          {m.label}
        </button>
      );
    })}
  </div>
);