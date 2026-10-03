import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { fontVariables } from '@/lib/fonts';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Quantara',
  description: 'AI-powered English practice — IELTS, grammar, vocabulary.',
};

/**
 * Root layout. Intentionally bare: no navbar, no padding — each route group
 * ((app) and (auth)) is responsible for its own chrome. This lets the
 * sign-in screen be full-screen without any app links bleeding through, and
 * lets every protected page share a single guarded layout.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${fontVariables} font-body`} suppressHydrationWarning>
      <body className="min-h-dvh bg-bg antialiased text-fg">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}