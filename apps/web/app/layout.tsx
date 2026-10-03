import './globals.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { fontVariables } from '@/lib/fonts';
import { Providers } from './providers';

const TITLE = 'Quantara · Learn smarter';
const DESCRIPTION =
  'AI-powered English practice — IELTS, grammar, vocabulary, and spaced-repetition flashcards. Built by Bikash Talukder.';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://quantara.app'),
  title: {
    default: TITLE,
    template: '%s · Quantara',
  },
  description: DESCRIPTION,
  applicationName: 'Quantara',
  keywords: [
    'IELTS',
    'English',
    'AI tutor',
    'grammar',
    'vocabulary',
    'flashcards',
    'spaced repetition',
    'Bikash Talukder',
  ],
  authors: [{ name: 'Bikash Talukder', url: 'https://quantara.app' }],
  creator: 'Bikash Talukder',
  publisher: 'Quantara',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/brand-mark.svg', type: 'image/svg+xml' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    shortcut: '/favicon.ico',
  },
  manifest: '/manifest.webmanifest',
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'Quantara',
    title: TITLE,
    description: DESCRIPTION,
    images: [
      {
        url: '/og-card.jpg',
        width: 1200,
        height: 630,
        alt: 'Quantara — Learn the universe of knowledge.',
      },
    ],
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: [
      {
        url: '/og-card.webp',
        width: 1200,
        height: 630,
        alt: 'Quantara — Learn the universe of knowledge.',
      },
    ],
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#D9F3F7' },
    { media: '(prefers-color-scheme: dark)', color: '#0B2A3D' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
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