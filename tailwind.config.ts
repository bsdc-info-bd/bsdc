/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import type { Config } from 'tailwindcss';
import defaultTheme from 'tailwindcss/defaultTheme';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  future: {
    hoverOnlyWhenNeeded: true,
    minimalPolyfills: true,
  },
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#EDFBF2',
          100: '#D5F5E1',
          200: '#AEEAC6',
          300: '#77DAA5',
          400: '#3FC57F',
          500: '#17A75D',
          600: '#0A8F3F',
          700: '#097335',
          800: '#0A5B2C',
          900: '#094C27',
          950: '#042A14',
        },
        fb: {
          50: '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          300: '#93C5FD',
          400: '#60A5FA',
          500: '#3B82F6',
          600: '#1877F2',
          700: '#1D4ED8',
          800: '#1E40AF',
          900: '#1E3A8A',
        },
        surface: {
          light: '#FFFFFF',
          'light-muted': '#F3F6F4',
          'light-border': '#E4EAE6',
          dark: '#0F0F0F',
          'dark-muted': '#1A1A1A',
          'dark-raised': '#222222',
          'dark-border': '#2E2E2E',
        },
        accent: {
          teal: '#14B8A6',
          emerald: '#10B981',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Hind Siliguri', ...defaultTheme.fontFamily.sans],
        mono: ['JetBrains Mono', 'Fira Code', ...defaultTheme.fontFamily.mono],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 3px 0 rgb(0 0 0 / 0.06)',
        raised: '0 4px 16px -2px rgb(0 0 0 / 0.10), 0 2px 6px -2px rgb(0 0 0 / 0.06)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #0A8F3F 0%, #10B981 55%, #14B8A6 100%)',
        'hero-gradient': 'radial-gradient(1200px 500px at 50% -10%, rgba(10,143,63,0.18), transparent), radial-gradient(900px 420px at 90% 10%, rgba(24,119,242,0.10), transparent)',
      },
      animation: {
        'fade-in': 'fadeIn 0.25s ease-out',
        'slide-up': 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in-right': 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        shimmer: 'shimmer 1.6s infinite linear',
        'pulse-ring': 'pulseRing 1.8s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'countdown-tick': 'countdownTick 1s steps(1) infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: { from: { opacity: '0', transform: 'translateY(12px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        slideInRight: { from: { opacity: '0', transform: 'translateX(24px)' }, to: { opacity: '1', transform: 'translateX(0)' } },
        shimmer: { '0%': { backgroundPosition: '-400px 0' }, '100%': { backgroundPosition: '400px 0' } },
        pulseRing: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.4' } },
        countdownTick: { '0%': { transform: 'scale(1.06)' }, '100%': { transform: 'scale(1)' } },
      },
      minHeight: {
        screen: '100dvh',
      },
    },
  },
  plugins: [],
} satisfies Config;
