'use client';

import { useCallback, useEffect, useState } from 'react';

export type ThemeChoice = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'theme-choice';

const systemPrefersDark = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;

const applyTheme = (choice: ThemeChoice) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const resolved = choice === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : choice;
  root.classList.toggle('dark', resolved === 'dark');
  // localStorage stores the user's *intent* (not the resolved value), so a
  // later reload + OS theme flip is respected.
  try {
    if (choice === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    /* localStorage disabled — silently fall back to no persistence */
  }
};

/**
 * Read the persisted choice synchronously. Falls back to 'system'.
 */
const readChoice = (): ThemeChoice => {
  if (typeof window === 'undefined') return 'system';
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    /* ignore */
  }
  return 'system';
};

/**
 * Theme hook. Returns the user's *choice* (system/light/dark) — the
 * resolved DOM class is applied as a side-effect. Listening to OS theme
 * flips while in 'system' mode is intentionally not done in v1.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<ThemeChoice>('system');

  useEffect(() => {
    setThemeState(readChoice());
  }, []);

  const setTheme = useCallback((next: ThemeChoice) => {
    setThemeState(next);
    applyTheme(next);
  }, []);

  return { theme, setTheme };
}