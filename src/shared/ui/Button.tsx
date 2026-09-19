/**
 * BSDC — src/shared/ui/Button.tsx
 * Purpose : The platform button: 12 variants, 4 sizes, 3 tones, with loading and full-width modes
 *           (PART 08.09).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Renders as a real <a> when `href` is supplied so internal links stay crawlable —
 *           no JS-only navigation anywhere (PART 10.10 rule 3).
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type AnchorHTMLAttributes,
  type ReactNode,
} from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/shared/lib/cn';
import { Icon, type IconProps } from './Icon';

/** Variant union mirroring src/styles/components/button.css. */
export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'link'
  | 'danger'
  | 'success'
  | 'brand-blue'
  | 'subtle'
  | 'glass'
  | 'inverse';

export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';
export type ButtonTone = 'default' | 'soft' | 'strong' | 'quiet';

/** Shared props for every render mode. */
interface ButtonBaseProps {
  readonly variant?: ButtonVariant | undefined;
  readonly size?: ButtonSize | undefined;
  readonly tone?: ButtonTone | undefined;
  readonly fullWidth?: boolean | undefined;
  readonly loading?: boolean | undefined;
  readonly iconLeft?: IconProps['name'] | undefined;
  readonly iconRight?: IconProps['name'] | undefined;
  readonly children?: ReactNode | undefined;
  readonly className?: string | undefined;
}

/** Button rendered as a native button. */
type NativeButtonProps = ButtonBaseProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
    readonly href?: undefined;
    readonly to?: undefined;
  };

/** Button rendered as an internal router link. */
type LinkButtonProps = ButtonBaseProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'children' | 'href'> & {
    readonly to: string;
    readonly href?: undefined;
  };

/** Button rendered as an external anchor. */
type ExternalButtonProps = ButtonBaseProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'children'> & {
    readonly href: string;
    readonly to?: undefined;
  };

export type ButtonProps = NativeButtonProps | LinkButtonProps | ExternalButtonProps;

/**
 * Renders the button body (spinner, icons, label).
 * @param props button props
 * @returns the inner content
 */
function ButtonContent(props: ButtonProps): React.ReactElement {
  const { loading = false, iconLeft, iconRight, children, size = 'md' } = props;
  const iconSize = size === 'lg' ? 20 : size === 'xs' ? 14 : 18;
  return (
    <>
      {loading ? (
        <span className="bsdc-button__spinner" aria-hidden="true" />
      ) : (
        iconLeft !== undefined && <Icon name={iconLeft} size={iconSize} />
      )}
      {children !== undefined && <span>{children}</span>}
      {iconRight !== undefined && <Icon name={iconRight} size={iconSize} />}
    </>
  );
}

/** Widened view of a button's presentation props, safe across all three render modes. */
interface PresentationProps {
  readonly className?: string | undefined;
  readonly disabled?: boolean | undefined;
}

/**
 * The BSDC button.
 * @param props button props
 * @returns a button, a router link or an anchor, depending on the props
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(props, ref) {
  const { className, disabled } = props as PresentationProps;
  const {
    variant = 'primary',
    size = 'md',
    tone = 'default',
    fullWidth = false,
    loading = false,
    iconLeft: _iconLeft,
    iconRight: _iconRight,
    children: _children,
    type = 'button',
    ...rest
  } = props as PresentationProps & NativeButtonProps;

  const classes = cn('bsdc-button', className);
  const dataAttributes = {
    'data-variant': variant,
    'data-size': size,
    'data-tone': tone,
    'data-full-width': fullWidth ? 'true' : 'false',
    'data-loading': loading ? 'true' : 'false',
    'data-disabled': disabled === true || loading ? 'true' : 'false',
  };

  if (typeof rest.to === 'string') {
    const { to, ...anchorRest } = rest as unknown as LinkButtonProps;
    return (
      <Link ref={undefined} to={to} className={classes} {...dataAttributes} {...anchorRest}>
        <ButtonContent {...props} />
      </Link>
    );
  }

  if (typeof rest.href === 'string') {
    const { href, ...anchorRest } = rest as unknown as ExternalButtonProps;
    const external = /^https?:\/\//i.test(href);
    return (
      <a
        href={href}
        className={classes}
        {...dataAttributes}
        {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        {...anchorRest}
      >
        <ButtonContent {...props} />
      </a>
    );
  }

  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      disabled={disabled === true || loading}
      {...dataAttributes}
      {...rest}
    >
      <ButtonContent {...props} />
    </button>
  );
});
