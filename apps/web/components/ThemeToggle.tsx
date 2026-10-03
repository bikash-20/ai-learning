'use client';

import { useEffect, useState } from 'react';
import { SunIcon, MoonIcon } from '@/components/ui/icons';
import { useTheme } from '@/lib/useTheme';

/**
 * Full-bleed navbar pill that flips between light and dark mode. Kept as
 * a standalone export for any consumer that wants a self-contained
 * toggle (it's currently unused — the avatar menus own the theme now
 * — but we keep it exported so external links / tests / future
 * surfaces still work).
 *
 * Avatar menu rows now use the shared body in
 * `components/ui/AvatarMenu.tsx` instead of this pill.
 */
export const ThemeToggle = () => {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Until mount, the resolved class isn't known — render the neutral
  // shell so SSR and CSR match.
  const dark = mounted && theme === 'dark';

  const toggle = () => {
    setTheme(dark ? 'light' : 'dark');
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
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