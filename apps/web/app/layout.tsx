import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { fontVariables } from '@/lib/fonts';
import { Providers } from './providers';
import { Bootstrap } from '@/components/Bootstrap';
import { Navbar } from '@/components/ui/Navbar';

export const metadata: Metadata = {
  title: 'AI Learning',
  description: 'AI-powered English practice — IELTS, grammar, vocabulary.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${fontVariables} font-body`} suppressHydrationWarning>
      <body className="min-h-dvh bg-bg antialiased text-fg">
        <Providers>
          <Bootstrap />
          <Navbar />
          <div className="mx-auto w-full max-w-5xl px-3 pb-12 pt-4 sm:px-4 sm:pb-16 sm:pt-6">{children}</div>
        </Providers>
      </body>
    </html>
  );
}