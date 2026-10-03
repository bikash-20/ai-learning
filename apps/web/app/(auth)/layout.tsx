import type { ReactNode } from 'react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Bootstrap } from '@/components/Bootstrap';

/**
 * Public auth-area layout. Renders only the brand wordmark and the theme
 * toggle in the top corners — no app navbar, no app links. Centered content
 * fills the viewport. The `Bootstrap` client component handles dark-mode
 * class application before first paint.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <Bootstrap />
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
        <Link
          href="/sign-in"
          className="whitespace-nowrap font-display text-lg text-fg sm:text-xl"
        >
          AI LEARNING
        </Link>
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-center justify-center px-3 pb-12 sm:px-4 sm:pb-16">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}