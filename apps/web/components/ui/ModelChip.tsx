'use client';

import { useEffect, useState } from 'react';

/**
 * Tiny glass chip that shows which model served a reply.
 *
 * Examples: `via llama-3.3-70b`, `via nemotron-3-super`, `via gemma-4-31b`.
 * Trims long provider IDs to the form `vendor/name` or just `name` if
 * there's no slash. Hidden when the user toggles it (state in localStorage).
 */
export const ModelChip = ({ modelId }: { modelId: string | undefined }) => {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    try {
      setHidden(localStorage.getItem('hideModelChip') === '1');
    } catch {
      /* noop */
    }
  }, []);

  if (!modelId || hidden) return null;
  const label = shortLabel(modelId);
  return (
    <span className="glass-pill ml-2 inline-flex items-center gap-1 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">
      <span aria-hidden="true">via</span>
      <span className="text-fg">{label}</span>
      <button
        type="button"
        onClick={() => {
          try {
            localStorage.setItem('hideModelChip', '1');
            setHidden(true);
          } catch {
            /* noop */
          }
        }}
        aria-label="Hide model chip"
        className="ml-1 text-muted hover:text-fg"
      >
        ×
      </button>
    </span>
  );
};

const shortLabel = (id: string): string => {
  const noVer = id.replace(/:free$/, '');
  const slash = noVer.indexOf('/');
  if (slash >= 0) {
    const name = noVer.slice(slash + 1);
    return name.length > 24 ? `${name.slice(0, 22)}…` : name;
  }
  return noVer;
};

/**
 * Toggle component placed in the chat toolbar — re-shows the chip after
 * the user has hidden it.
 */
export const ModelChipToggle = () => {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try {
      setHidden(localStorage.getItem('hideModelChip') === '1');
    } catch {
      /* noop */
    }
  }, []);
  if (!hidden) return null;
  return (
    <button
      type="button"
      onClick={() => {
        try {
          localStorage.removeItem('hideModelChip');
          setHidden(false);
        } catch {
          /* noop */
        }
      }}
      className="text-[10px] uppercase tracking-wide text-muted hover:text-fg"
    >
      Show model chip
    </button>
  );
};