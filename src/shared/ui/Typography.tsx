/**
 * BSDC — src/shared/ui/Typography.tsx
 * Purpose : Text and heading primitives with the fluid type scale (PART 08.02).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : `lang` is forwarded so Bangla text can carry its own line-height and font stack;
 *           this is what stops conjunct-heavy Bangla from clipping (PART 09.01).
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { createElement, type ElementType, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

/** Fluid type scale steps. */
export type TextSize =
  '2xs' | 'xs' | 'sm' | 'base' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | 'hero';

/** Text tone. */
export type TextTone = 'default' | 'muted' | 'subtle' | 'danger' | 'success' | 'brand';

const SIZE_CLASS: Readonly<Record<TextSize, string>> = {
  '2xs': 'text-2xs',
  xs: 'text-xs',
  sm: 'text-sm',
  base: 'text-base',
  md: 'text-md',
  lg: 'text-lg',
  xl: 'text-xl',
  '2xl': 'text-2xl',
  '3xl': 'text-3xl',
  '4xl': 'text-4xl',
  hero: 'text-hero',
};

const TONE_CLASS: Readonly<Record<TextTone, string>> = {
  default: 'text-ink',
  muted: 'text-ink-2',
  subtle: 'text-ink-3',
  danger: 'text-[var(--bsdc-danger)]',
  success: 'text-[var(--bsdc-success)]',
  brand: 'text-[var(--bsdc-green-600)]',
};

/** Props for the Text component. */
export interface TextProps {
  readonly children?: ReactNode | undefined;
  readonly as?: ElementType | undefined;
  readonly size?: TextSize | undefined;
  readonly tone?: TextTone | undefined;
  readonly weight?: (400 | 500 | 600 | 700 | 800) | undefined;
  readonly lang?: string | undefined;
  readonly truncate?: boolean | undefined;
  readonly numeric?: boolean | undefined;
  readonly className?: string | undefined;
  readonly id?: string | undefined;
  /** ARIA role, for text that announces a status or an error. */
  readonly role?: string | undefined;
  /** Live-region politeness, when the text is a status message. */
  readonly ariaLive?: ('off' | 'polite' | 'assertive') | undefined;
}

/**
 * Renders styled text.
 * @param props component props
 * @returns a text element
 */
export function Text({
  children,
  as = 'p',
  size = 'base',
  tone = 'default',
  weight,
  lang,
  truncate = false,
  numeric = false,
  className,
  id,
  role,
  ariaLive,
}: TextProps): React.ReactElement {
  return createElement(
    as,
    {
      id,
      lang,
      role,
      ...(ariaLive !== undefined ? { 'aria-live': ariaLive } : {}),
      className: cn(
        SIZE_CLASS[size],
        TONE_CLASS[tone],
        weight !== undefined && `font-[${weight}]`,
        truncate && 'bsdc-truncate',
        numeric && 'bsdc-numeric',
        className,
      ),
      style: weight !== undefined ? { fontWeight: weight } : undefined,
    },
    children,
  );
}

/** Props for the Heading component. */
export interface HeadingProps {
  readonly children?: ReactNode | undefined;
  /** Heading level. The visual size is independent of the semantics. */
  readonly level?: (1 | 2 | 3 | 4 | 5 | 6) | undefined;
  readonly size?: TextSize | undefined;
  readonly tone?: TextTone | undefined;
  readonly lang?: string | undefined;
  readonly className?: string | undefined;
  readonly id?: string | undefined;
}

/**
 * Renders a heading with an explicit semantic level.
 * @param props component props
 * @returns a heading element
 */
export function Heading({
  children,
  level = 2,
  size,
  tone = 'default',
  lang,
  className,
  id,
}: HeadingProps): React.ReactElement {
  return createElement(
    `h${level}`,
    {
      id,
      lang,
      className: cn(size !== undefined ? SIZE_CLASS[size] : undefined, TONE_CLASS[tone], className),
    },
    children,
  );
}
