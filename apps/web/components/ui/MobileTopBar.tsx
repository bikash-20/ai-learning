'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from '@/lib/useSession';
import { HomeIcon, ChevronDownIcon } from '@/components/ui/icons';
import { MobileAvatarMenu } from '@/components/ui/MobileAvatarMenu';
import { BRAND } from '@/lib/brand';

/**
 * Mobile top bar — slim, only on screens < md.
 *
 *   - Left:
 *       • On `/explore` → small **brand wordmark** (non-interactive).
 *       • On every other page → 44px **Explore** home button that always
 *         navigates to `/explore` (the hub). We intentionally do NOT use
 *         `router.back()` here — the user explicitly asked for a deterministic
 *         "go to hub" affordance on every page.
 *   - Center: current section title (derived from the first URL segment).
 *   - Right: 44px avatar button with initials. Opens `<MobileAvatarMenu>`.
 *
 * The avatar menu is the single home for theme switching on phones.
 */
export const MobileTopBar = () => {
  const { user } = useSession();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  // `/explore` (and `/`) — hub. Show wordmark on the left, no nav action.
  const isHub = pathname === '/' || pathname === '/explore';

  // Section title — first URL segment, capitalized.
  const section =
    pathname && !isHub ? pathname.replace(/^\//, '').split('/')[0] : 'explore';
  const label = section ? section.charAt(0).toUpperCase() + section.slice(1) : 'Home';

  const initials = user?.name || user?.email
    ? (user!.name || user!.email).slice(0, 1).toUpperCase()
    : '·';

  return (
    <header className="sticky top-2 z-40 mx-3 md:hidden">
      <div className="glass flex min-h-[44px] items-center justify-between gap-2 rounded-pill border border-glass-border px-2 py-1">
        {isHub ? (
          <span
            aria-label={BRAND.appName}
            className="inline-flex h-11 min-h-[44px] items-center px-2 font-display text-sm font-semibold uppercase tracking-display text-fg"
          >
            {BRAND.wordmark}
          </span>
        ) : (
          <Link
            href="/explore"
            aria-label="Go to Explore"
            className="inline-flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-fg hover:bg-glass-bg/40 active:bg-glass-bg/60"
          >
            <HomeIcon size={18} />
            <span className="sr-only">Explore</span>
          </Link>
        )}

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