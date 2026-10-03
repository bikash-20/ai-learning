'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TAB_TILES } from '@/lib/hubConfig';
import { useSession } from '@/lib/useSession';
import { useRole } from '@/lib/useRole';

/**
 * Mobile bottom tab bar. Shown on screens < md, fixed to the bottom of
 * the viewport with safe-area padding so the iOS home indicator never
 * covers a tab. Pages that need scroll-to-bottom content (e.g. /chat
 * with its input) MUST reserve space with `pb-[calc(theme(spacing.16)+env(safe-area-inset-bottom))]`
 * (the `Layout` shell does this).
 */
export const BottomTabBar = () => {
  const pathname = usePathname();
  useSession(); // ensures session cookie present
  const role = useRole();
  const tiles = TAB_TILES(role === 'admin').slice(0, 5);

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 md:hidden"
    >
      <div className="mx-3 mb-[calc(env(safe-area-inset-bottom)+0.5rem)] rounded-glass border border-glass-border bg-glass-bg/85 px-2 py-1 backdrop-blur-xl">
        <ul className="flex items-stretch justify-between">
          {tiles.map((t) => {
            const active = pathname === t.href || (t.href !== '/' && pathname?.startsWith(t.href + '/')) || pathname === t.href;
            return (
              <li key={t.id} className="flex-1">
                <Link
                  href={t.href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-card px-1 py-1.5 text-[10px] font-medium transition-colors ${
                    active ? 'text-accent' : 'text-muted hover:text-fg'
                  }`}
                >
                  <span aria-hidden="true" className="text-base leading-none">{t.icon}</span>
                  <span className="leading-none">{t.title}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
};