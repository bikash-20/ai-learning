'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from '@/lib/useSession';
import { BRAND } from '@/lib/brand';
import { Navbar } from '@/components/ui/Navbar';
import { MobileTopBar } from '@/components/ui/MobileTopBar';
import { GlassCard } from '@/components/ui/GlassCard';

/**
 * Protected area layout. All pages under (app) — Home, Chat, Quiz, Vocab,
 * Grammar, Explore, Flashcards, Progress, Exam, Admin — require a signed-in
 * user. Signed-out visitors are redirected to /sign-in?returnTo=<current
 * path>, where returnTo is honored after a successful sign-in.
 *
 * Visual recipe (token-driven; see globals.css):
 *  - Layer 0: solid `surface` paint → no flash while the image decodes.
 *  - Layer 1: bg-explore WebP image, full-viewport, fixed, cover, with a
 *    very slow drift animation under prefers-reduced-motion: no-preference.
 *  - Layer 2: token overlay. The overlay is stronger on chat/quiz/exam
 *    so cards and content stay focused; lighter on the hub/admin pages
 *    where the brand feel is the point.
 *
 * On mobile we mount a slim MobileTopBar (back + section title +
 * avatar menu). The bottom tab bar was deleted in the mobile-first
 * pass — hub tiles on /explore are how users move between sections,
 * and the Back button takes them back to wherever they came from.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  const { loading, user } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  // Stronger overlay on focus-heavy screens so chat bubbles, quiz
  // options, and exam prompts don't compete with the constellation.
  const focusHeavy =
    pathname?.startsWith('/chat') ||
    pathname?.startsWith('/quiz') ||
    pathname?.startsWith('/exam');

  // Detect low-power mode (data saver / low power). If true we kill
  // the slow drift animation so we don't burn battery on phones that
  // have asked us not to.
  const reducedMotionRef = useRef<boolean>(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotionRef.current = mq.matches;
    const onChange = (e: MediaQueryListEvent) => {
      reducedMotionRef.current = e.matches;
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      const ret = pathname ? `?returnTo=${encodeURIComponent(pathname)}` : '';
      router.replace(`/sign-in${ret}`);
    }
  }, [loading, user, pathname, router]);

  if (loading || !user) {
    return (
      <>
        <Navbar />
        <div className="mx-auto w-full max-w-5xl px-3 pb-24 pt-4 sm:px-4 sm:pb-16 sm:pt-6">
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

  const overlayClass = focusHeavy ? 'bg-overlay-app-strong' : 'bg-overlay-app';

  return (
    <>
      {/* Background layers — fixed, behind everything. Same as auth:
          solid paint first, image next, gradient overlay on top. */}
      <div
        aria-hidden="true"
        className="bg-img-explore fixed inset-0 -z-20"
      />
      <div
        aria-hidden="true"
        className={`${overlayClass} fixed inset-0 -z-10`}
      />

      <Navbar />
      <MobileTopBar />
      <div className="mx-auto w-full max-w-5xl px-3 pb-24 pt-2 sm:px-4 sm:pb-16 sm:pt-6">
        {children}
      </div>
      <footer className="mx-auto w-full max-w-5xl px-4 pb-6 pt-4 text-center text-xs text-muted">
        <span>© {new Date().getFullYear()} {BRAND.appName}</span>
        <span aria-hidden="true"> · </span>
        <Link href="/privacy" className="hover:text-fg hover:underline">
          Privacy
        </Link>
        <span aria-hidden="true"> · </span>
        <Link href="/terms" className="hover:text-fg hover:underline">
          Terms
        </Link>
      </footer>
    </>
  );
}