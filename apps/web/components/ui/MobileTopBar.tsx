'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from '@/lib/useSession';
import { BrandMark } from '@/components/Brand';
import { ThemeToggle } from '@/components/ThemeToggle';

/**
 * Mobile top bar — slim, only on screens < md. Shows the brand mark on
 * the left (links back to /explore), the current section name in the
 * middle, and the avatar on the right. Replaces the previous hamburger
 * drawer so every protected page has a single fixed top bar on mobile.
 */
export const MobileTopBar = () => {
  const { user } = useSession();
  const pathname = usePathname();
  const section = pathname && pathname !== '/' && pathname !== '/explore'
    ? pathname.replace(/^\//, '').split('/')[0]
    : 'explore';
  const label = section ? section.charAt(0).toUpperCase() + section.slice(1) : 'Home';

  const initials = user?.name || user?.email ? (user!.name || user!.email).slice(0, 1).toUpperCase() : '·';

  return (
    <header className="sticky top-2 z-40 mx-3 md:hidden">
      <div className="glass flex min-h-[44px] items-center justify-between rounded-pill border border-glass-border px-2 py-1">
        <Link
          href="/explore"
          aria-label="Back to Explore"
          className="flex h-9 w-9 min-h-[36px] min-w-[36px] items-center justify-center rounded-full text-fg"
        >
          <BrandMark size={26} />
        </Link>
        <span className="text-sm font-medium text-fg">{label}</span>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <span
            aria-hidden="true"
            className="inline-flex h-9 w-9 min-h-[36px] min-w-[36px] items-center justify-center rounded-full border border-glass-border bg-glass-bg text-sm font-semibold text-fg"
          >
            {initials}
          </span>
        </div>
      </div>
    </header>
  );
};