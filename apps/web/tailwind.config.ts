import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'hsl(220 20% 98%)',
        fg: 'hsl(220 20% 12%)',
        accent: 'hsl(220 90% 56%)',
      },
    },
  },
  plugins: [],
} satisfies Config;