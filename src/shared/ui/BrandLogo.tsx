/**
 * BSDC — src/shared/ui/BrandLogo.tsx
 * Purpose : The BSDC brand marks: horizontal lockup, stacked lockup, shield and the app icon
 *           (PART 28.1, PART 28.1b).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Every mark is generated from the single SVG master in assets/brand. Images always ship
 *           with explicit width, height and alt text (LAW-21, LAW-24).
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import logoHorizontal from '#assets/brand/bsdc-logo.svg';
import logoLight from '#assets/brand/bsdc-logo-light.svg';
import logoStacked from '#assets/brand/bsdc-logo-stacked.svg';
import shield from '#assets/brand/bsdc-shield.svg';
import appIcon from '#assets/brand/bsdc-icon.svg';

/** Visual variants of the lockup. */
export type LogoVariant = 'horizontal' | 'light' | 'stacked' | 'shield' | 'icon';

/** Props for the BrandLogo component. */
export interface BrandLogoProps {
  readonly variant?: LogoVariant | undefined;
  /** Rendered height in CSS pixels; width follows the artwork ratio. */
  readonly height?: number | undefined;
  readonly className?: string | undefined;
  /** Accessible label. Omit only when an adjacent text label already names the brand. */
  readonly alt?: string | undefined;
}

const SOURCE: Readonly<Record<LogoVariant, string>> = {
  horizontal: logoHorizontal,
  light: logoLight,
  stacked: logoStacked,
  shield: shield,
  icon: appIcon,
};

/** Intrinsic aspect ratios (width / height) used to reserve space and prevent CLS. */
const RATIO: Readonly<Record<LogoVariant, number>> = {
  horizontal: 320 / 80,
  light: 320 / 80,
  stacked: 200 / 240,
  shield: 1,
  icon: 1,
};

/**
 * Renders a BSDC brand mark.
 * @param props component props
 * @returns an image element with reserved dimensions
 */
export function BrandLogo({
  variant = 'horizontal',
  height = 32,
  className,
  alt = 'BSDC — Bangladesh Software Development Community',
}: BrandLogoProps): React.ReactElement {
  const width = Math.round(height * RATIO[variant]);
  return (
    <img
      src={SOURCE[variant]}
      width={width}
      height={height}
      alt={alt}
      className={className}
      decoding="async"
      data-no-dim="true"
    />
  );
}
