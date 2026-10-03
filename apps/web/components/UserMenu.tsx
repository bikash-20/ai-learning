'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession } from '@/lib/useSession';
import { AvatarMenuBody } from '@/components/ui/AvatarMenu';

/**
 * Compact user menu shown in the navbar once the session resolves.
 *
 * - Loading: placeholder pill, no menu.
 * - Signed out: "Sign in" link to /sign-in.
 * - Signed in: avatar / initials button → dropdown anchored under it
 *   that shows name/email + Theme + Logout.
 *
 * The dropdown body is `<AvatarMenuBody>`, shared with
 * `<MobileAvatarMenu>` so desktop and mobile stay in lockstep.
 */
export const UserMenu = () => {
  const { loading, user } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

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
          className="glass absolute right-0 top-[calc(100%+0.5rem)] z-40 w-64 rounded-glass p-3 text-sm"
        >
          <AvatarMenuBody onAfterAction={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
};