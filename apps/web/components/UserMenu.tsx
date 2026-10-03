'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession } from '@/lib/useSession';

/**
 * Compact user menu shown in the navbar once the session resolves.
 * Renders a "Sign in" link when the user is not logged in (no auto-redirect
 * from the navbar — that's the sign-in page's job), or the email + a dropdown
 * with "Sign out" when logged in.
 */
export const UserMenu = () => {
  const { loading, user, signOut } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (loading) {
    return <div className="ml-1 h-8 w-24 rounded-pill bg-glass-bg/50" aria-hidden="true" />;
  }

  if (!user) {
    return (
      <a
        href="/sign-in"
        className="ml-1 rounded-pill border border-glass-border bg-glass-bg px-3 py-1 text-xs text-fg hover:border-accent"
      >
        Sign in
      </a>
    );
  }

  const initials = (user.name || user.email).slice(0, 1).toUpperCase();

  return (
    <div ref={ref} className="relative ml-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="inline-flex h-9 w-9 min-h-[36px] min-w-[36px] items-center justify-center rounded-full border border-glass-border bg-glass-bg text-sm font-semibold text-fg hover:border-accent"
      >
        {user.image ? (
          <img src={user.image} alt="" className="h-full w-full rounded-full object-cover" />
        ) : (
          initials
        )}
      </button>
      {open && (
        <div
          role="menu"
          className="glass absolute right-0 top-[calc(100%+0.5rem)] z-40 w-56 rounded-glass p-2 text-sm"
        >
          <div className="px-2 py-1.5 text-xs text-muted">Signed in as</div>
          <div className="px-2 pb-2 text-sm text-fg break-all">{user.email}</div>
          <div className="border-t border-glass-border" />
          <a
            href="/explore"
            role="menuitem"
            className="block rounded-md px-2 py-2 text-fg hover:bg-glass-bg/40"
            onClick={() => setOpen(false)}
          >
            Explore
          </a>
          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              setOpen(false);
              await signOut();
            }}
            className="block w-full rounded-md px-2 py-2 text-left text-fg hover:bg-glass-bg/40"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
};