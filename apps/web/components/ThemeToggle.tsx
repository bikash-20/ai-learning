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
      className="ml-2 rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm text-fg hover:border-secondary"
    >
      {dark ? 'Light' : 'Dark'}
    </button>
  );
};