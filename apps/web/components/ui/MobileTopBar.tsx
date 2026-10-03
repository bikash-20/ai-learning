'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from '@/lib/useSession';
import { ArrowLeftIcon, ChevronDownIcon } from '@/components/ui/icons';
import { MobileAvatarMenu } from '@/components/ui/MobileAvatarMenu';

/**
 * Mobile top bar — slim, only on screens < md.
 *
 *  - Left: real **Back** arrow. Calls `router.back()` if there's
 *    history; otherwise pushes `/explore` (the hub).
 *  - Center: current section title (derived from the first URL segment).
 *  - Right: 44px avatar button with initials. Opens
 *    `<MobileAvatarMenu>` — a bottom sheet containing the shared
 *    `<AvatarMenuBody>` (name/email + Theme + Logout).
 *
 * The avatar menu is the single home for theme switching on phones.
 * There is no theme pill on the top bar anymore.
 */
export const MobileTopBar = () => {
  const { user } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  // Section title — first URL segment, capitalized.
  const section = pathname && pathname !== '/' && pathname !== '/explore'
    ? pathname.replace(/^\//, '').split('/')[0]
    : 'explore';
  const label = section ? section.charAt(0).toUpperCase() + section.slice(1) : 'Home';

  const initials = user?.name || user?.email
    ? (user!.name || user!.email).slice(0, 1).toUpperCase()
    : '·';

  const onBack = () => {
    // router.back() is a no-op when there's no history — fall back to
    // the hub so the user always has somewhere to go.
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.replace('/explore');
    }
  };

  return (
    <header className="sticky top-2 z-40 mx-3 md:hidden">
      <div className="glass flex min-h-[44px] items-center justify-between gap-2 rounded-pill border border-glass-border px-2 py-1">
        <button
          type="button"
          onClick={onBack}
          aria-label="Go back"
          className="inline-flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-fg hover:bg-glass-bg/40 active:bg-glass-bg/60"
        >
          <ArrowLeftIcon size={18} />
        </button>

        <span className="truncate text-sm font-medium text-fg">{label}</span>

        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="Open account menu"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="inline-flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-glass-border bg-glass-bg text-sm font-semibold text-fg hover:border-accent"
        >
          {user?.image ? (
            <img src={user.image} alt="" className="h-full w-full rounded-full object-cover" />
          ) : (
            <span className="flex items-center gap-0.5">
              <span aria-hidden="true">{initials}</span>
              <ChevronDownIcon size={10} decorative />
            </span>
          )}
        </button>
      </div>

      <MobileAvatarMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </header>
  );
};