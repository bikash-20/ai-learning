'use client';

import { useLayoutEffect } from 'react';

/**
 * Runs before paint on the client. Reads the saved theme from localStorage
 * (or system preference) and applies the `dark` class to <html>. Done in
 * useLayoutEffect to avoid the flash-of-wrong-theme and any hydration
 * mismatch with the SSR markup (no class on first paint -> server matches).
 */
export const Bootstrap = () => {
  useLayoutEffect(() => {
    try {
      const saved = localStorage.getItem('theme');
      const dark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.classList.toggle('dark', dark);
    } catch {
      /* localStorage unavailable */
    }
  }, []);
  return null;
};