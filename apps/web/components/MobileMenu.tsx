'use client';

import { useEffect, useRef, useState } from 'react';
import { NavLink } from '@/components/NavLink';
import { ThemeToggle } from '@/components/ThemeToggle';
import { UserMenu } from '@/components/UserMenu';
import { navItems } from '@/components/ui/navItems';

export const MobileMenu = () => {
  const [open, setOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        aria-controls="mobile-drawer"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-pill border border-glass-border bg-glass-bg text-fg hover:border-accent"
      >
        {open ? '✕' : '☰'}
      </button>
      {open && (
        <div
          id="mobile-drawer"
          ref={drawerRef}
          className="glass absolute left-3 right-3 top-[calc(100%+0.5rem)] z-40 flex flex-col gap-1 rounded-glass p-3 sm:left-6 sm:right-auto sm:w-72"
        >
          {navItems.map((it) => (
            <NavLink key={it.href} href={it.href}>
              <span className="block px-2 py-3 text-base" onClick={() => setOpen(false)}>{it.label}</span>
            </NavLink>
          ))}
          <div className="mt-1 flex items-center justify-between border-t border-glass-border pt-2">
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      )}
    </div>
  );
};