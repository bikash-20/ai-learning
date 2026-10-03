import { Bebas_Neue, Poppins, Playfair_Display } from 'next/font/google';

const display = Bebas_Neue({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const body = Poppins({
  weight: ['300', '400', '500', '600'],
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

/**
 * Serif font used ONLY for hero / display headings (the "Explore Quantara"
 * title etc). The rest of the app stays on Bebas Neue (display) + Poppins
 * (body) to keep contrast and avoid flooding the user's network.
 */
const heroSerif = Playfair_Display({
  weight: ['500', '600', '700'],
  subsets: ['latin'],
  variable: '--font-hero',
  display: 'swap',
});

export const fontVariables = `${display.variable} ${body.variable} ${heroSerif.variable}`;