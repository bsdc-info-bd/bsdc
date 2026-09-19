/**
 * BSDC — tailwind.config.ts
 * Purpose : Maps every Tailwind utility onto the BSDC design tokens (CSS custom properties)
 *           so the nine themes swap without rebuilding class names (ADR-008, PART 08.06).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Breakpoints are imported from the single source of truth
 *           (src/core/config/breakpoints.ts) so CSS, Tailwind and JS can never drift (ADR-009).
 *           Custom utilities are exposed through the plugin below: bsdc-surface, bsdc-card,
 *           bsdc-focus-ring, bsdc-glass, bsdc-scroll, bsdc-truncate-2/3, bsdc-safe-*, bsdc-tap.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import type { Config } from 'tailwindcss';
import plugin from 'tailwindcss/plugin';
import { BREAKPOINTS, SCREENS } from './src/core/config/breakpoints';

/**
 * Builds the spacing scale from --bsdc-space-* tokens so density modes
 * (comfortable 1.0 / compact 0.8 / spacious 1.25) scale everything at once.
 * @returns {Record<string, string>} spacing scale keyed by step
 */
const spacingScale = (): Record<string, string> =>
  Object.fromEntries(
    Array.from({ length: 25 }, (_, step) => [String(step), `var(--bsdc-space-${step})`]),
  );

const config: Config = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  future: { hoverOnlyWhenSupported: true },
  theme: {
    // Breakpoints come from code, never from a second hand-written list (ADR-009).
    screens: SCREENS,
    extend: {
      colors: {
        green: Object.fromEntries(
          [50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((step) => [
            step,
            `var(--bsdc-green-${step})`,
          ]),
        ),
        blue: Object.fromEntries(
          [50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((step) => [
            step,
            `var(--bsdc-blue-${step})`,
          ]),
        ),
        surface: {
          DEFAULT: 'var(--bsdc-surface)',
          2: 'var(--bsdc-surface-2)',
          3: 'var(--bsdc-surface-3)',
        },
        canvas: 'var(--bsdc-bg)',
        line: 'var(--bsdc-border)',
        ink: {
          DEFAULT: 'var(--bsdc-text)',
          2: 'var(--bsdc-text-2)',
          3: 'var(--bsdc-text-3)',
        },
        success: 'var(--bsdc-success)',
        warning: 'var(--bsdc-warning)',
        danger: 'var(--bsdc-danger)',
        info: 'var(--bsdc-info)',
        verified: 'var(--bsdc-verified)',
        money: 'var(--bsdc-money)',
        brand: {
          DEFAULT: 'var(--bsdc-green-500)',
          deep: 'var(--bsdc-green-700)',
        },
      },
      fontFamily: {
        sans: 'var(--bsdc-font-ui)',
        bn: 'var(--bsdc-font-bn)',
        code: 'var(--bsdc-font-code)',
      },
      fontSize: {
        '2xs': 'var(--fs-2xs)',
        xs: 'var(--fs-xs)',
        sm: 'var(--fs-sm)',
        base: 'var(--fs-base)',
        md: 'var(--fs-md)',
        lg: 'var(--fs-lg)',
        xl: 'var(--fs-xl)',
        '2xl': 'var(--fs-2xl)',
        '3xl': 'var(--fs-3xl)',
        '4xl': 'var(--fs-4xl)',
        hero: 'var(--fs-hero)',
      },
      spacing: { ...spacingScale(), px: '1px', hairline: 'var(--bsdc-hairline)' },
      borderRadius: {
        xs: 'var(--radius-xs)',
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)',
        bubble: 'var(--radius-bubble-chat)',
      },
      boxShadow: {
        1: 'var(--shadow-1)',
        2: 'var(--shadow-2)',
        3: 'var(--shadow-3)',
        4: 'var(--shadow-4)',
        5: 'var(--shadow-5)',
      },
      zIndex: {
        base: '0',
        'sticky-header': '100',
        sidebar: '150',
        'mobile-nav': '180',
        dropdown: '200',
        'chat-dock': '250',
        sheet: '300',
        modal: '400',
        lightbox: '500',
        'command-palette': '600',
        toast: '700',
        'call-overlay': '800',
        'critical-banner': '900',
        'dev-overlay': '9999',
      },
      transitionTimingFunction: {
        standard: 'var(--ease-standard)',
        emphasised: 'var(--ease-emphasised)',
      },
      transitionDuration: {
        instant: 'var(--motion-instant)',
        fast: 'var(--motion-fast)',
        base: 'var(--motion-base)',
        slow: 'var(--motion-slow)',
      },
      backdropBlur: { glass: 'var(--blur-glass)' },
      aspectRatio: { '4x6': '4 / 6' },
      keyframes: {
        'bsdc-rise': {
          from: { opacity: '0', transform: 'translateY(12px) scale(0.96)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'bsdc-shimmer': {
          from: { backgroundPosition: '-200% 0' },
          to: { backgroundPosition: '200% 0' },
        },
        'bsdc-pulse-ring': {
          '0%': { transform: 'scale(0.9)', opacity: '0.7' },
          '70%': { transform: 'scale(1.25)', opacity: '0' },
          '100%': { transform: 'scale(1.25)', opacity: '0' },
        },
      },
      animation: {
        rise: 'bsdc-rise var(--motion-base) var(--ease-standard) both',
        shimmer: 'bsdc-shimmer 1.4s linear infinite',
        'pulse-ring': 'bsdc-pulse-ring var(--motion-slow) var(--ease-standard) infinite',
      },
    },
  },
  plugins: [
    // Tailwind hands the plugin bound helpers; destructuring is the documented pattern.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    plugin(({ addUtilities, addVariant }) => {
      addUtilities({
        '.bsdc-surface': {
          backgroundColor: 'var(--bsdc-surface)',
          borderColor: 'var(--bsdc-border)',
        },
        '.bsdc-card': {
          backgroundColor: 'var(--bsdc-surface)',
          border: 'var(--bsdc-hairline) solid var(--bsdc-border)',
          borderRadius: 'var(--radius-lg)',
        },
        '.bsdc-focus-ring': {
          outline: '2px solid var(--bsdc-focus)',
          outlineOffset: '2px',
        },
        '.bsdc-glass': {
          backgroundColor: 'var(--bsdc-glass-bg)',
          backdropFilter: 'blur(var(--blur-glass))',
          WebkitBackdropFilter: 'blur(var(--blur-glass))',
        },
        '.bsdc-scroll': {
          scrollbarWidth: 'thin',
          scrollbarColor: 'var(--bsdc-border) transparent',
          overscrollBehavior: 'contain',
        },
        '.bsdc-truncate-2': {
          display: '-webkit-box',
          WebkitLineClamp: '2',
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        },
        '.bsdc-truncate-3': {
          display: '-webkit-box',
          WebkitLineClamp: '3',
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        },
        '.bsdc-tap': {
          minHeight: 'var(--bsdc-tap-target)',
          minWidth: 'var(--bsdc-tap-target)',
        },
        '.bsdc-safe-x': {
          paddingInline: 'max(var(--bsdc-space-4), env(safe-area-inset-left))',
          paddingInlineEnd: 'max(var(--bsdc-space-4), env(safe-area-inset-right))',
        },
        '.bsdc-safe-bottom': {
          paddingBottom: 'max(var(--bsdc-space-2), env(safe-area-inset-bottom))',
        },
        '.bsdc-safe-top': {
          paddingTop: 'max(var(--bsdc-space-2), env(safe-area-inset-top))',
        },
        '.bsdc-no-select': { userSelect: 'none', WebkitUserSelect: 'none' },
      });
      // Pointer/hover variants: hover affordances only where hovering exists (R-15).
      addVariant('pointer-fine', '@media (hover: hover) and (pointer: fine)');
      addVariant('pointer-coarse', '@media (hover: none), (pointer: coarse)');
      addVariant('touch', '@media (hover: none) and (pointer: coarse)');
      addVariant('foldable', '@media (horizontal-viewport-segments: 2)');
      addVariant('reduced-motion', '@media (prefers-reduced-motion: reduce)');
      addVariant('high-contrast', '@media (prefers-contrast: more)');
      // Container-query helper: used by widgets that must adapt to their box, not the viewport.
      addVariant('@container-md', '@container (min-width: 30rem)');
    }),
  ],
  corePlugins: { preflight: false },
};

export default config;
export { BREAKPOINTS };
