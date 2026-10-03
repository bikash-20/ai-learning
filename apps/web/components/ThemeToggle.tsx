'use client';

import { useEffect, useState } from 'react';
import { SunIcon, MoonIcon } from '@/components/ui/icons';

export const ThemeToggle = () => {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
  };

  return (
    <button
      onClick={toggle}
      aria-label="Toggle dark mode"
      className="ml-1 inline-flex items-center gap-1.5 rounded-pill border border-glass-border bg-glass-bg px-3 py-1 text-xs text-fg hover:border-accent"
    >
      {dark ? (
        <>
          <SunIcon size={12} decorative />
          Light
        </>
      ) : (
        <>
          <MoonIcon size={12} decorative />
          Dark
        </>
      )}
    </button>
  );
};