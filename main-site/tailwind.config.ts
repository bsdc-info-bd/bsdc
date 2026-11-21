import type { Config } from 'tailwindcss';

/**
 * BSDC design system — Tailwind theme.
 * Colors are declared as CSS custom properties in src/styles/base.css so that
 * light and dark themes swap without re-rendering. Components must only use the
 * semantic token names below, never raw hex values.
 *
 * Every token is therefore a *whole* colour behind a var(), which Tailwind's
 * `<alpha-value>` pattern has no channel to inject into. Declaring the colours
 * as plain strings made every `bg-x/NN` utility a silent no-op: Tailwind could
 * not build a translucent variant of `var(--bsdc-green-700)`, emitted no rule
 * at all, and 67 washes across the interface — selected tabs, hover tints,
 * alert backgrounds, scrim borders — rendered as nothing. A colour written as a
 * function is asked for its value on both paths, so alpha is resolved here with
 * `color-mix()`, which takes a whole colour and is already relied on by
 * `.fab-glass` in styles/fabric.css.
 */
type ColorValue = string | ((props: { opacityValue?: string | number }) => string);

/**
 * A colour as Tailwind wants it: a string, or a function the theme calls with
 * the opacity value.
 *
 * The function form is not a nicety. A colour declared as the bare string
 * `var(--bsdc-x)` cannot receive an opacity modifier — Tailwind v3 has to parse
 * the colour to blend it, and a custom property is opaque at build time — so
 * every `bg-x/10`, `border-x/70` and `from-x/85` in the app compiled to no rule
 * at all. No warning, no fallback: the utility is simply absent from the
 * stylesheet, and a card with no background looks like a design choice.
 *
 * `opacityValue` arrives in three shapes, and all three have to be answered.
 * Falling through on any of them is how a base utility ships `color-mix(… NaN%
 * …)` — an invalid declaration that paints nothing, which is worse than the bug
 * being fixed because it takes the opaque `bg-surface` with it:
 *
 *   • `undefined` — the class carried no modifier. Emit the token itself, so
 *     `.bg-surface` stays `background-color: var(--bsdc-surface)`.
 *   • a number — the class carried `/NN`.
 *   • the literal `<alpha-value>`, or the string `var(--tw-bg-opacity)` —
 *     Tailwind's own opacity-variable path, where the substitution happens after
 *     this call.
 *
 * Both alpha paths blend through `calc(… * 100%)` rather than writing the number
 * straight into `color-mix()`: the second argument of `color-mix()` must be a
 * *percentage*, so `color-mix(… 0.7 …)` is invalid CSS even though it looks
 * plausible in a diff, and `calc(0.7 * 100%)` is not.
 */
const token = (name: string): ColorValue =>
  function ({ opacityValue }: { opacityValue?: string | number } = {}): string {
    const value = `var(--bsdc-${name})`;
    if (opacityValue === undefined || opacityValue === null) return value;
    if (typeof opacityValue === 'string') {
      return `color-mix(in srgb, ${value} calc(${opacityValue} * 100%), transparent)`;
    }
    const percent = Math.round(opacityValue * 100);
    return percent >= 100 ? value : `color-mix(in srgb, ${value} ${percent}%, transparent)`;
  };

/** A colour map this config can be checked against; nested one level, as the palette is. */
type ColorMap = Record<string, ColorValue | Record<string, ColorValue>>;

/**
 * Tailwind's declared type for `theme.extend.colors` permits strings and nested
 * maps but not the per-colour function the runtime calls with `opacityValue`, so
 * the map is checked against ColorMap above and adapted once at the use site.
 */
type ThemeColors = NonNullable<Config['theme']>['extend'] extends infer E
  ? E extends { colors?: infer C }
    ? C
    : never
  : never;

/**
 * The palette, as one object. `satisfies ColorMap` keeps this literal checked
 * — a misnested group or a token name typed wrong is a type error here — while
 * the cast at the use site is where Tailwind's own bundled types fall short:
 * `ThemeConfig['colors']` is declared as strings and nested maps only, so a
 * per-colour function, which the runtime calls with `opacityValue`, is rejected
 * on paper. `scripts/contrast-audit.mjs` is what actually guarantees every name
 * below resolves to a token that exists in both themes, and it is a CI gate.
 */
const themeColors = {
  bg: token('bg'),
  surface: token('surface'),
  'surface-2': token('surface-2'),
  border: token('border'),
  text: token('text'),
  muted: token('text-muted'),

  /* A brand fill, and the ink that stays legible on it in both themes.
           White on --bsdc-green-700 is 6.4:1 in light and 2.0:1 in dark,
           because the green ramp inverts with the theme. A fill that carries
           words has to carry its own ink; that is what these are for. */
  primary: token('primary'),
  'primary-hover': token('primary-hover'),
  'primary-active': token('primary-active'),
  'on-primary': token('on-primary'),
  'on-danger': token('on-danger'),
  'blue-fill': token('blue-fill'),
  'on-blue': token('on-blue'),
  /* Highlighted text, shared by ::selection and the search-result mark,
           so the two cannot drift into two different greens. */
  selection: token('selection-bg'),
  'selection-ink': token('selection-ink'),
  scrim: token('scrim'),
  rating: token('rating'),

  green: {
    900: token('green-900'),
    800: token('green-800'),
    700: token('green-700'),
    500: token('green-500'),
    300: token('green-300'),
    200: token('green-200'),
  },
  blue: {
    DEFAULT: token('blue'),
    soft: token('blue-soft'),
    // Readable text blue. `text-blue` is a fill colour and fails
    // contrast on our surfaces; anything that renders words uses this.
    text: token('blue-text'),
  },
  danger: token('danger'),
  'danger-text': token('danger-text'),
  'danger-soft': token('danger-soft'),
  warn: token('warn'),
  'warn-text': token('warn-text'),
  'warn-soft': token('warn-soft'),
  success: token('success'),
  'success-soft': token('success-soft'),
  'hero-from': token('hero-from'),
  'hero-via': token('hero-via'),
  'hero-to': token('hero-to'),
  'on-hero': token('on-hero'),
  online: token('online'),
  'chat-outgoing': token('chat-outgoing'),
  'chat-outgoing-hover': token('chat-outgoing-hover'),
} satisfies ColorMap;

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
      colors: themeColors as unknown as ThemeColors,
      fontFamily: {
        sans: [
          'Inter',
          'BSDC Bengali',
          'Noto Sans Bengali',
          'Hind Siliguri',
          'Segoe UI',
          'Arial',
          'sans-serif',
        ],
        bangla: ['BSDC Bengali', 'Noto Sans Bengali', 'Hind Siliguri', 'Inter', 'sans-serif'],
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
