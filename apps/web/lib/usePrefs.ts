'use client';

import { useEffect, useState } from 'react';
import type { UserPrefsT } from '@quantara/shared';

/**
 * Read-only client view of the user's preferences. Returns `null` while
 * loading and a sensible default (`{aiExplain: true}`) so consumers can
 * render before the request finishes. Fetches once per mount; the user
 * can refresh the page after toggling in /settings to re-read.
 *
 * We deliberately don't expose a setter here — the Settings page is the
 * one canonical place that mutates prefs, and that flow does its own
 * fetch + UI state.
 */
export function usePrefs(): UserPrefsT | null {
  const [prefs, setPrefs] = useState<UserPrefsT | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/me/prefs`, {
          credentials: 'include',
        });
        if (!res.ok) return;
        const j = (await res.json()) as UserPrefsT;
        if (!cancelled) setPrefs(j);
      } catch {
        /* swallow — quiz/exam surfaces still work with the default */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return prefs;
}