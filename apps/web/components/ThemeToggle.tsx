'use client';

import { useEffect, useState } from 'react';

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
      className="ml-1 rounded-pill border border-glass-border bg-glass-bg px-3 py-1 text-xs text-fg hover:border-accent"
    >
      {dark ? '☀ Light' : '☾ Dark'}
    </button>
  );
};