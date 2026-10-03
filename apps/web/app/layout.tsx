import './globals.css';
import type { Metadata } from 'next';
import { ReactNode } from 'react';
import { Providers } from './providers';
import { ThemeToggle } from '@/components/ThemeToggle';
import Link from 'next/link';

export const metadata: Metadata = { title: 'AI Learning', description: 'AI-powered English practice' };

const ThemeBootScript = () => (
  <script
    dangerouslySetInnerHTML={{
      __html: `(function(){try{var s=localStorage.getItem('theme');var d=s?s==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);}catch(e){}})();`,
    }}
  />
);

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><ThemeBootScript /></head>
      <body className="min-h-dvh antialiased">
        <Providers>
          <header className="border-b divider bg-surface">
            <nav className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-3">
              <Link href="/" className="text-lg font-bold text-fg">AI Learning</Link>
              <div className="flex items-center gap-1 text-sm">
                <Link href="/chat" className="rounded-lg px-3 py-1.5 text-muted hover:text-fg hover:bg-surface-2">Chat</Link>
                <Link href="/quiz" className="rounded-lg px-3 py-1.5 text-muted hover:text-fg hover:bg-surface-2">Quiz</Link>
                <Link href="/vocab" className="rounded-lg px-3 py-1.5 text-muted hover:text-fg hover:bg-surface-2">Vocab</Link>
                <Link href="/grammar" className="rounded-lg px-3 py-1.5 text-muted hover:text-fg hover:bg-surface-2">Grammar</Link>
                <Link href="/sign-in" className="rounded-lg px-3 py-1.5 text-muted hover:text-fg hover:bg-surface-2">Sign in</Link>
                <ThemeToggle />
              </div>
            </nav>
          </header>
          {children}
        </Providers>
      </body>
    </html>
  );
}