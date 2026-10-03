import type { Config } from 'tailwindcss';

const palette = {
  'c-950': '#001D39',
  'c-800': '#0A4174',
  'c-600': '#49769F',
  'c-500': '#4E8EA2',
  'c-400': '#6EA2B3',
  'c-300': '#7BBDE8',
  'c-100': '#BDD8E9',
} as const;

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Raw palette
        ...palette,
        // Semantic tokens — light mode defaults; dark variant defined in `app/globals.css`
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        fg: 'var(--fg)',
        muted: 'var(--muted)',
        primary: 'var(--primary)',
        'primary-fg': 'var(--primary-fg)',
        secondary: 'var(--secondary)',
        accent: 'var(--accent)',
        ring: 'var(--ring)',
        border: 'var(--border)',
        danger: 'var(--danger)',
        warning: 'var(--warning)',
        // CEFR gradient stops for badges
        'cefr-a1': palette['c-100'],
        'cefr-a2': palette['c-300'],
        'cefr-b1': palette['c-400'],
        'cefr-b2': palette['c-500'],
        'cefr-c1': palette['c-600'],
        'cefr-c2': palette['c-800'],
      },
    },
  },
  plugins: [],
} satisfies Config;