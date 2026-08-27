import type { Config } from 'tailwindcss';

/**
 * BSDC design tokens.
 *
 * Breakpoints are named per docs/VERIFICATION.md — every screen is built
 * starting at 250px (xs) and scales up. Never use ad-hoc media queries.
 * `ultrawide` and beyond must cap content width and center, not stretch.
 */
const config = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    screens: {
      xs: '250px',
      sm: '320px',
      md: '375px',
      lg: '480px',
      tablet: '768px',
      laptop: '1024px',
      desktop: '1280px',
      wide: '1440px',
      ultrawide: '1920px',
    },
    extend: {
      colors: {
        // Semantic surface tokens — swap between light/dark via CSS vars.
        background: 'hsl(var(--background) / <alpha-value>)',
        foreground: 'hsl(var(--foreground) / <alpha-value>)',
        card: 'hsl(var(--card) / <alpha-value>)',
        'card-foreground': 'hsl(var(--card-foreground) / <alpha-value>)',
        muted: 'hsl(var(--muted) / <alpha-value>)',
        'muted-foreground': 'hsl(var(--muted-foreground) / <alpha-value>)',
        accent: 'hsl(var(--accent) / <alpha-value>)',
        border: 'hsl(var(--border) / <alpha-value>)',
        ring: 'hsl(var(--ring) / <alpha-value>)',
        // Primary — BSDC green (distinct from any consumer-social blue).
        primary: {
          50: '#ECFDF3',
          100: '#D1FADF',
          200: '#A6F4C5',
          300: '#6CE9A6',
          400: '#32D583',
          500: '#12B76A',
          600: '#039855',
          700: '#027A48',
          800: '#05603A',
          900: '#054F31',
          DEFAULT: '#039855',
          foreground: '#FFFFFF',
        },
        // Secondary — BSDC blue (indigo-leaning, deliberately distinct
        // from Facebook blue #1877F2).
        secondary: {
          50: '#F0F4FF',
          100: '#E1E9FE',
          200: '#C5D4FD',
          300: '#9FB6FB',
          400: '#7590F7',
          500: '#4F6BEC',
          600: '#3A52D4',
          700: '#2F41A8',
          800: '#2A3A85',
          900: '#28366B',
          DEFAULT: '#3A52D4',
          foreground: '#FFFFFF',
        },
      },
      fontFamily: {
        sans: [
          'InterVariable',
          'Inter',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Hind Siliguri',
          'Noto Sans Bengali',
          'sans-serif',
        ],
        bangla: ['Hind Siliguri', 'Noto Sans Bengali', 'InterVariable', 'sans-serif'],
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Consolas',
          'Liberation Mono',
          'monospace',
        ],
      },
      maxWidth: {
        content: '72rem', // 1152px — global content cap; centered on ultrawide
        prose: '65ch',
      },
    },
  },
  plugins: [],
} satisfies Config;

export default config;
