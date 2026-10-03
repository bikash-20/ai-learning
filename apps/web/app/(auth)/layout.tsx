import type { ReactNode } from 'react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Bootstrap } from '@/components/Bootstrap';
import { BrandMark, BrandWordmark, FounderCredit } from '@/components/Brand';
import { BRAND } from '@/lib/brand';

/**
 * Public auth-area layout. Renders only the brand wordmark and the theme
 * toggle in the top corners — no app navbar, no app links. Centered content
 * fills the viewport. The `Bootstrap` client component handles dark-mode
 * class application before first paint.
 *
 * The founder block under the card is part of the layout (rendered once, in
 * one place) so it stays in sync with `BRAND.founder`.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <Bootstrap />
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/sign-in" className="flex items-center gap-2 whitespace-nowrap text-fg" aria-label="Quantara">
          <BrandMark size={28} />
          <BrandWordmark size="md" />
        </Link>
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-center justify-center px-3 pb-8 pt-2 sm:px-4 sm:pb-12">
        <div className="w-full max-w-md space-y-5">
          {children}
          <FounderCredit />
        </div>
      </main>
      <footer className="mx-auto w-full max-w-5xl px-4 pb-6 text-center text-xs text-muted">
        © {new Date().getFullYear()} {BRAND.appName}
      </footer>
    </div>
  );
}