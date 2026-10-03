'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from '@/lib/useSession';
import { Navbar } from '@/components/ui/Navbar';
import { GlassCard } from '@/components/ui/GlassCard';

/**
 * Protected area layout. All pages under (app) — Home, Chat, Quiz, Vocab,
 * Grammar, Explore — require a signed-in user. Signed-out visitors are
 * redirected to /sign-in?returnTo=<current path>, where returnTo is honored
 * after a successful sign-in.
 *
 * A single guard lives here so no individual page has to repeat the check.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  const { loading, user } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      const ret = pathname ? `?returnTo=${encodeURIComponent(pathname)}` : '';
      router.replace(`/sign-in${ret}`);
    }
  }, [loading, user, pathname, router]);

  if (loading || !user) {
    // Glass skeleton so the page doesn't flicker on hard navigations.
    return (
      <>
        <Navbar />
        <div className="mx-auto w-full max-w-5xl px-3 pb-12 pt-4 sm:px-4 sm:pb-16 sm:pt-6">
          <GlassCard>
            <div className="space-y-3">
              <div className="h-6 w-2/3 animate-pulse rounded-glass bg-glass-bg" />
              <div className="h-3 w-1/2 animate-pulse rounded-glass bg-glass-bg" />
              <div className="h-3 w-3/4 animate-pulse rounded-glass bg-glass-bg" />
            </div>
          </GlassCard>
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="mx-auto w-full max-w-5xl px-3 pb-12 pt-4 sm:px-4 sm:pb-16 sm:pt-6">{children}</div>
    </>
  );
}