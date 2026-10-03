'use client';

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';

export type TabItem<K extends string> = {
  id: K;
  label: ReactNode;
  /** Optional badge content shown next to the label (e.g. "AI"). */
  badge?: ReactNode;
};

export type TabsProps<K extends string> = {
  items: TabItem<K>[];
  value: K;
  onChange: (next: K) => void;
  /** Optional aria-label for the tablist. */
  ariaLabel?: string;
};

/**
 * Chip-style tabs (matching the look of <ModeChips> / <LevelFilter>).
 * Implements the WAI-ARIA tabs pattern with roving `tabIndex`, ←/→
 * keyboard navigation, and Home/End jumps.
 */
export const Tabs = <K extends string>({ items, value, onChange, ariaLabel }: TabsProps<K>) => {
  const listRef = useRef<HTMLDivElement | null>(null);
  const currentIdx = Math.max(0, items.findIndex((i) => i.id === value));

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    let idx = currentIdx;
    if (e.key === 'ArrowLeft') idx = (currentIdx - 1 + items.length) % items.length;
    else if (e.key === 'ArrowRight') idx = (currentIdx + 1) % items.length;
    else if (e.key === 'Home') idx = 0;
    else if (e.key === 'End') idx = items.length - 1;
    const next = items[idx];
    if (!next) return;
    onChange(next.id);
    // Move focus to the newly selected tab.
    const list = listRef.current;
    if (list) {
      const btn = list.querySelectorAll<HTMLButtonElement>('[role="tab"]')[idx];
      btn?.focus();
    }
  };

  // Keep focus on the selected tab when value changes via mouse.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const btns = list.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    btns.forEach((b, i) => b.setAttribute('tabindex', i === currentIdx ? '0' : '-1'));
  }, [currentIdx]);

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
      className="inline-flex flex-wrap items-center gap-1 rounded-pill border border-glass-border bg-glass-bg/40 p-1"
    >
      {items.map((item) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`tab-${String(item.id)}`}
            aria-selected={selected}
            aria-controls={`tabpanel-${String(item.id)}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.id)}
            className={`inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-xs font-medium transition ${
              selected
                ? 'bg-primary text-primary-fg shadow-[0_0_14px_-2px_color-mix(in_oklab,var(--glow)_55%,transparent)]'
                : 'text-muted hover:text-fg'
            }`}
          >
            {item.label}
            {item.badge && (
              <span
                className={`rounded-pill px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
                  selected ? 'bg-primary-fg/15 text-primary-fg' : 'bg-glass-bg text-muted'
                }`}
              >
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};