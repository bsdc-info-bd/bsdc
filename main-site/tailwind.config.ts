import type { Config } from 'tailwindcss';

/**
 * BSDC design system — Tailwind theme.
 * Colors are declared as CSS custom properties in src/styles/base.css so that
 * light and dark themes swap without re-rendering. Components must only use the
 * semantic token names below, never raw hex values.
 */
const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    screens: {
      nano: '250px',
      xs: '320px',
      sm: '480px',
      md: '768px',
      lg: '1024px',
      xl: '1440px',
      '2xl': '1920px',
      '3xl': '2560px',
      '4xl': '3840px',
    },
    extend: {
      colors: {
        bg: 'var(--bsdc-bg)',
        surface: 'var(--bsdc-surface)',
        'surface-2': 'var(--bsdc-surface-2)',
        border: 'var(--bsdc-border)',
        text: 'var(--bsdc-text)',
        muted: 'var(--bsdc-text-muted)',
        green: {
          900: 'var(--bsdc-green-900)',
          800: 'var(--bsdc-green-800)',
          700: 'var(--bsdc-green-700)',
          500: 'var(--bsdc-green-500)',
          300: 'var(--bsdc-green-300)',
          200: 'var(--bsdc-green-200)',
        },
        blue: {
          DEFAULT: 'var(--bsdc-blue)',
          soft: 'var(--bsdc-blue-soft)',
        },
        danger: 'var(--bsdc-danger)',
        warn: 'var(--bsdc-warn)',
        online: 'var(--bsdc-online)',
      },
      fontFamily: {
        sans: ['Inter', 'Noto Sans Bengali', 'Hind Siliguri', 'Segoe UI', 'Arial', 'sans-serif'],
        bangla: ['Noto Sans Bengali', 'Hind Siliguri', 'Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        '2xs': ['clamp(0.6875rem, 0.66rem + 0.14vw, 0.75rem)', { lineHeight: '1.45' }],
        xs: ['clamp(0.75rem, 0.72rem + 0.15vw, 0.8125rem)', { lineHeight: '1.5' }],
        sm: ['clamp(0.8125rem, 0.78rem + 0.17vw, 0.9375rem)', { lineHeight: '1.55' }],
        base: ['clamp(0.875rem, 0.83rem + 0.22vw, 1.125rem)', { lineHeight: '1.65' }],
        lg: ['clamp(1rem, 0.94rem + 0.3vw, 1.25rem)', { lineHeight: '1.55' }],
        xl: ['clamp(1.125rem, 1.04rem + 0.42vw, 1.5rem)', { lineHeight: '1.4' }],
        '2xl': ['clamp(1.25rem, 1.1rem + 0.75vw, 1.875rem)', { lineHeight: '1.3' }],
        '3xl': ['clamp(1.5rem, 1.25rem + 1.2vw, 2.5rem)', { lineHeight: '1.2' }],
        '4xl': ['clamp(1.875rem, 1.4rem + 2vw, 3rem)', { lineHeight: '1.12' }],
      },
      spacing: {
        'app-bar': 'var(--bsdc-app-bar-h)',
        'bottom-nav': 'var(--bsdc-bottom-nav-h)',
        'safe-top': 'env(safe-area-inset-top, 0px)',
        'safe-bottom': 'env(safe-area-inset-bottom, 0px)',
      },
      maxWidth: {
        content: 'var(--bsdc-content-max)',
        feed: '42rem',
      },
      borderRadius: {
        card: '14px',
        sheet: '20px',
      },
      boxShadow: {
        card: '0 1px 2px rgb(16 36 27 / 0.06), 0 1px 3px rgb(16 36 27 / 0.08)',
        raised: '0 4px 16px rgb(16 36 27 / 0.10)',
        sheet: '0 -8px 32px rgb(16 36 27 / 0.16)',
      },
      transitionTimingFunction: {
        app: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.6s linear infinite',
        'fade-up': 'fade-up 0.2s cubic-bezier(0.22, 1, 0.36, 1) both',
      },
    },
  },
  plugins: [],
};

export default config;
