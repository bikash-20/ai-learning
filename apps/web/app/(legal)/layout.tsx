import type { ReactNode } from 'react';
import Link from 'next/link';
import { BrandMark, BrandWordmark } from '@/components/Brand';
import { BRAND } from '@/lib/brand';

/**
 * Layout for the static legal pages (Privacy, Terms). Lives outside the
 * (app) and (auth) route groups so it doesn't trigger the auth guard
 * and doesn't pull in the branded imagery chrome.
 */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 pb-12 pt-6 sm:px-6">
      <header className="mb-6 flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-2 whitespace-nowrap text-fg"
          aria-label="Quantara home"
        >
          <BrandMark size={28} />
          <BrandWordmark size="md" />
        </Link>
        <Link href="/" className="text-sm text-accent hover:underline">
          ← Back to {BRAND.appName}
        </Link>
      </header>
      <article className="prose-quantara glass flex-1 rounded-glass p-6 text-fg sm:p-8">
        {children}
      </article>
      <footer className="mt-6 flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
        <span>© {new Date().getFullYear()} {BRAND.appName}</span>
        <nav className="flex gap-3">
          <Link href="/privacy" className="hover:text-fg hover:underline">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-fg hover:underline">
            Terms
          </Link>
        </nav>
      </footer>
    </div>
  );
}