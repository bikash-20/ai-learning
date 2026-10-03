import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: 'var(--background)',
        surface: 'var(--surface)',
        'surface-muted': 'var(--surface-muted)',
        fg: 'var(--foreground)',
        muted: 'var(--muted-foreground)',
        border: 'var(--border)',
        primary: 'var(--primary)',
        'primary-fg': 'var(--primary-fg)',
        'primary-hover': 'var(--primary-hover)',
        accent: 'var(--accent)',
        'accent-fg': 'var(--accent-fg)',
        glow: 'var(--glow)',
        success: 'var(--success)',
        danger: 'var(--danger)',
        warning: 'var(--warning)',
        // CEFR badge tokens (per-level bg + fg, WCAG AA in both modes)
        'cefr-a1-bg': 'var(--cefr-a1-bg)', 'cefr-a1-fg': 'var(--cefr-a1-fg)',
        'cefr-a2-bg': 'var(--cefr-a2-bg)', 'cefr-a2-fg': 'var(--cefr-a2-fg)',
        'cefr-b1-bg': 'var(--cefr-b1-bg)', 'cefr-b1-fg': 'var(--cefr-b1-fg)',
        'cefr-b2-bg': 'var(--cefr-b2-bg)', 'cefr-b2-fg': 'var(--cefr-b2-fg)',
        'cefr-c1-bg': 'var(--cefr-c1-bg)', 'cefr-c1-fg': 'var(--cefr-c1-fg)',
        'cefr-c2-bg': 'var(--cefr-c2-bg)', 'cefr-c2-fg': 'var(--cefr-c2-fg)',
      },
      fontFamily: {
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        body: ['var(--font-body)', 'system-ui', 'sans-serif'],
      },
      letterSpacing: {
        display: '0.02em',
      },
      borderRadius: {
        glass: 'var(--radius-lg)',
        pill: 'var(--radius-pill)',
        card: 'var(--radius-md)',
      },
      boxShadow: {
        glass: 'var(--shadow-glass)',
        glow: 'var(--shadow-glow)',
      },
    },
  },
  plugins: [],
} satisfies Config;