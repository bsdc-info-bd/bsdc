/**
 * BSDC — src/pages/design-system/tokenGroups.ts
 * Purpose : The token catalogue rendered by the design-system lab (PART 08.09, 08.10).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Values are read from the document at runtime; only the token NAMES live here. That is
 *           what makes it impossible for this page to display a token the product does not use.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */

/** A single token entry. */
export interface TokenEntry {
  readonly name: string;
}

/** A group of tokens rendered as one card. */
export interface TokenGroup {
  readonly id: string;
  /** Translation key under the `design-system` namespace. */
  readonly titleKey: string;
  readonly tokens: readonly TokenEntry[];
}

const t = (...names: string[]): readonly TokenEntry[] => names.map((name) => ({ name }));

/** The catalogue. */
export const TOKEN_GROUPS: readonly TokenGroup[] = [
  {
    id: 'brand',
    titleKey: 'colorsTitle',
    tokens: t(
      '--bsdc-green-50',
      '--bsdc-green-100',
      '--bsdc-green-200',
      '--bsdc-green-300',
      '--bsdc-green-400',
      '--bsdc-green-500',
      '--bsdc-green-600',
      '--bsdc-green-700',
      '--bsdc-green-800',
      '--bsdc-green-900',
      '--bsdc-blue-500',
    ),
  },
  {
    id: 'surfaces',
    titleKey: 'colorsTitle',
    tokens: t(
      '--bsdc-bg',
      '--bsdc-surface',
      '--bsdc-surface-2',
      '--bsdc-surface-3',
      '--bsdc-border',
      '--bsdc-text',
      '--bsdc-text-2',
      '--bsdc-text-3',
    ),
  },
  {
    id: 'semantic',
    titleKey: 'colorsTitle',
    tokens: t(
      '--bsdc-success',
      '--bsdc-warning',
      '--bsdc-danger',
      '--bsdc-info',
      '--bsdc-verified',
      '--bsdc-admin',
      '--bsdc-moderator',
      '--bsdc-vendor',
      '--bsdc-money',
      '--bsdc-focus',
    ),
  },
  {
    id: 'spacing',
    titleKey: 'spacingTitle',
    tokens: t(
      '--bsdc-space-1',
      '--bsdc-space-2',
      '--bsdc-space-3',
      '--bsdc-space-4',
      '--bsdc-space-6',
      '--bsdc-space-8',
      '--bsdc-space-12',
      '--bsdc-space-16',
      '--bsdc-space-24',
      '--bsdc-density',
    ),
  },
  {
    id: 'radii',
    titleKey: 'radiiTitle',
    tokens: t(
      '--radius-xs',
      '--radius-sm',
      '--radius-md',
      '--radius-lg',
      '--radius-xl',
      '--radius-2xl',
    ),
  },
  {
    id: 'elevation',
    titleKey: 'elevationTitle',
    tokens: t('--shadow-1', '--shadow-3', '--shadow-5', '--blur-glass'),
  },
  {
    id: 'motion',
    titleKey: 'motionTitle',
    tokens: t(
      '--motion-instant',
      '--motion-fast',
      '--motion-base',
      '--motion-slow',
      '--ease-standard',
      '--ease-emphasised',
    ),
  },
  {
    id: 'layering',
    titleKey: 'zIndexTitle',
    tokens: t(
      '--z-sticky-header',
      '--z-mobile-nav',
      '--z-dropdown',
      '--z-modal',
      '--z-toast',
      '--z-command-palette',
    ),
  },
];

/** Solid hex tokens usable by the contrast checker's quick presets. */
export const HEX_TOKENS: readonly string[] = [
  '#0B1220',
  '#FFFFFF',
  '#2D6A4F',
  '#52B788',
  '#1877F2',
  '#DC2626',
  '#F59E0B',
  '#16A34A',
];
