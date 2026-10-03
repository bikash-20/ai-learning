import type { ReactNode } from 'react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Bootstrap } from '@/components/Bootstrap';
import { BrandMark, BrandWordmark, FounderCredit } from '@/components/Brand';
import { BRAND } from '@/lib/brand';
import { SparkleIcon, BrainIcon, ExamIcon } from '@/components/ui/icons';

/**
 * Public auth-area layout.
 *
 * Visual recipe (token-driven; see globals.css for the colors):
 *  - Layer 0: solid `surface` paint → no flash while the image decodes.
 *  - Layer 1: bg-login WebP image, full-viewport, fixed, cover.
 *  - Layer 2: token gradient overlay, stronger toward the right
 *    (where the sign-in card lives) so text stays WCAG AA readable.
 *  - Layer 3: the actual page chrome (header, brand panel, card).
 *
 * Desktop (≥1024px): two-column split — brand panel on the left
 * (logo + tagline + three short value points + founder credit), and
 * the sign-in card on the right. Mobile (<1024px): single centered
 * card, brand stays in the header.
 *
 * The founder block is rendered once (here) so it stays in sync with
 * `BRAND.founder` regardless of which auth screen mounts.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-dvh">
      {/* Background layers — fixed, behind everything. Note: the wrapper
          MUST NOT paint an opaque background here, otherwise it covers
          the fixed -z-20 image layer (the wrapper paints at z-index 0).
          The html element carries the canvas color via globals.css so the
          surface never goes white even before the image decodes. */}
      <div
        aria-hidden="true"
        className="bg-img-login fixed inset-0 -z-20"
      />
      <div
        aria-hidden="true"
        className="bg-overlay-login fixed inset-0 -z-10"
      />

      <Bootstrap />
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Link
          href="/sign-in"
          className="flex items-center gap-2 whitespace-nowrap text-fg"
          aria-label="Quantara"
        >
          <BrandMark size={28} />
          <BrandWordmark size="md" />
        </Link>
        <ThemeToggle />
      </header>

      {/* Main grid: brand panel + form panel.
           - mobile: single column, brand panel hidden.
           - desktop: brand panel visible, form panel on the right. */}
      <main className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-6 px-4 pb-12 pt-2 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,440px)] lg:items-center lg:px-8 lg:py-10">
        <BrandPanel />
        <div className="space-y-5">
          {children}
          <FounderCredit />
        </div>
      </main>

      <footer className="mx-auto w-full max-w-6xl px-4 pb-6 text-center text-xs text-muted">
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
    </div>
  );
}

/**
 * Desktop-only brand panel. Hidden below lg. Uses only design tokens —
 * no hardcoded colors. The logo is larger and gets a token-driven glow
 * (var(--glow)).
 */
const BrandPanel = () => (
  <section
    aria-hidden="false"
    aria-label="Why Quantara"
    className="hidden flex-col gap-7 lg:flex"
  >
    <div className="flex items-center gap-3">
      <BrandMark
        size={72}
        className="drop-shadow-[0_0_24px_color-mix(in_oklab,var(--glow)_55%,transparent)]"
      />
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-muted">
          {BRAND.founder.title}
        </p>
        <h1
          className="mt-1 text-4xl font-semibold leading-tight text-fg sm:text-5xl"
          style={{ fontFamily: 'var(--font-hero), serif' }}
        >
          {BRAND.heroTagline}
        </h1>
      </div>
    </div>

    <p className="max-w-md text-base text-muted">
      {BRAND.tagline}
    </p>

    <ul className="grid gap-3 sm:max-w-md">
      {BRAND.valuePoints.map((vp) => (
        <li
          key={vp.text}
          className="flex items-start gap-3 rounded-card border border-glass-border bg-glass-bg p-3"
        >
          <span
            aria-hidden="true"
            className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-card border border-accent/30 bg-accent/10 text-accent"
          >
            {vp.iconId === 'sparkle' && <SparkleIcon size={18} className="text-current" decorative />}
            {vp.iconId === 'brain' && <BrainIcon size={18} className="text-current" decorative />}
            {vp.iconId === 'exam' && <ExamIcon size={18} className="text-current" decorative />}
          </span>
          <span className="text-sm leading-snug text-fg">{vp.text}</span>
        </li>
      ))}
    </ul>
  </section>
);