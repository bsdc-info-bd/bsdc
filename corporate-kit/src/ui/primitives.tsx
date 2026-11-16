import {
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

export type Tone = 'neutral' | 'ok' | 'warn' | 'bad';

const toneClass = (tone: Tone, base: string): string =>
  tone === 'neutral'
    ? base
    : `${base} ${base}--${tone === 'ok' ? 'ok' : tone === 'warn' ? 'warn' : 'bad'}`;

export function Card({
  title,
  description,
  actions,
  children,
}: {
  title?: string | undefined;
  description?: string | undefined;
  actions?: ReactNode | undefined;
  children: ReactNode;
}): ReactElement {
  return (
    <section className="kit-card">
      {(title || actions) && (
        <div
          className="kit-row"
          style={{ justifyContent: 'space-between', marginBottom: 'var(--sp-2)' }}
        >
          {title ? <h2 style={{ margin: 0 }}>{title}</h2> : <span />}
          {actions}
        </div>
      )}
      {description && <p className="kit-muted kit-small">{description}</p>}
      {children}
    </section>
  );
}

export function KpiTile({
  label,
  value,
  tone = 'neutral',
  badge,
  detail,
  action,
}: {
  readonly label: string;
  readonly value: string | number;
  readonly tone?: Tone | undefined;
  readonly badge?: string | undefined;
  readonly detail?: string | undefined;
  readonly action?: ReactNode | undefined;
}): ReactElement {
  return (
    <div className={`kit-kpi kit-kpi--${tone}`}>
      <div className="kit-row" style={{ justifyContent: 'space-between' }}>
        <span className="kit-small kit-muted">{label}</span>
        {badge && <Badge tone={tone}>{badge}</Badge>}
      </div>
      <div className="kit-kpi-value">{value}</div>
      {detail && (
        <p className="kit-small kit-muted" style={{ margin: 0 }}>
          {detail}
        </p>
      )}
      {action && <div className="kit-kpi-foot">{action}</div>}
    </div>
  );
}

export function SplitPane({
  primary,
  secondary,
}: {
  readonly primary: ReactNode;
  readonly secondary: ReactNode;
}): ReactElement {
  return (
    <div className="kit-split">
      <div className="kit-split-main">{primary}</div>
      <div className="kit-split-side">{secondary}</div>
    </div>
  );
}

export function Drawer({
  open,
  title,
  subtitle,
  onClose,
  children,
}: {
  readonly open: boolean;
  readonly title: string;
  readonly subtitle?: string | undefined;
  readonly onClose: () => void;
  readonly children: ReactNode;
}): ReactElement | null {
  if (!open) return null;
  return (
    <div
      className="kit-drawer-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="kit-drawer">
        <div className="kit-drawer-head">
          <div>
            <h2 style={{ margin: 0 }}>{title}</h2>
            {subtitle && (
              <p className="kit-small kit-muted" style={{ margin: 0 }}>
                {subtitle}
              </p>
            )}
          </div>
          <Button size="small" variant="quiet" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="kit-drawer-body">{children}</div>
      </div>
    </div>
  );
}

export function BulkBar({
  selectedCount,
  label = 'selected',
  onClear,
  children,
}: {
  readonly selectedCount: number;
  readonly label?: string | undefined;
  readonly onClear: () => void;
  readonly children: ReactNode;
}): ReactElement | null {
  if (selectedCount === 0) return null;
  return (
    <div className="kit-bulkbar" role="region" aria-label="Bulk actions">
      <div className="kit-row">
        <Badge tone="ok">
          {selectedCount} {label}
        </Badge>
        <Button size="small" variant="quiet" onClick={onClear}>
          Clear selection
        </Button>
      </div>
      <div className="kit-row">{children}</div>
    </div>
  );
}

export function CopyButton({
  value,
  label = 'Copy',
}: {
  readonly value: string;
  readonly label?: string | undefined;
}): ReactElement {
  return (
    <Button
      size="small"
      variant="quiet"
      onClick={() => {
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
          void navigator.clipboard.writeText(value);
        }
      }}
    >
      {label}
    </Button>
  );
}

export function Button({
  variant = 'primary',
  size = 'medium',
  className = '',
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'quiet' | 'danger';
  size?: 'medium' | 'small';
}): ReactElement {
  const classes = [
    'kit-btn',
    variant === 'quiet' ? 'kit-btn--quiet' : '',
    variant === 'danger' ? 'kit-btn--danger' : '',
    size === 'small' ? 'kit-btn--small' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return <button type={type} className={classes} {...rest} />;
}

export function Field({
  label,
  hint,
  error,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
}): ReactElement {
  const id = useId();
  return (
    <label className={`kit-field${error ? ' kit-field--invalid' : ''}`} htmlFor={id}>
      <span>{label}</span>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-note`}
        {...rest}
      />
      <span id={`${id}-note`} className={error ? 'kit-error' : 'kit-hint'}>
        {error ?? hint ?? ''}
      </span>
    </label>
  );
}

export function TextArea({
  label,
  hint,
  error,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
}): ReactElement {
  const id = useId();
  return (
    <label className={`kit-field${error ? ' kit-field--invalid' : ''}`} htmlFor={id}>
      <span>{label}</span>
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-note`}
        {...rest}
      />
      <span id={`${id}-note`} className={error ? 'kit-error' : 'kit-hint'}>
        {error ?? hint ?? ''}
      </span>
    </label>
  );
}

export function Select({
  label,
  hint,
  options,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  hint?: string | undefined;
  options: ReadonlyArray<{ readonly value: string; readonly label: string }>;
}): ReactElement {
  const id = useId();
  return (
    <label className="kit-field" htmlFor={id}>
      <span>{label}</span>
      <select id={id} aria-label={label} aria-describedby={`${id}-note`} {...rest}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span id={`${id}-note`} className="kit-hint">
        {hint ?? ''}
      </span>
    </label>
  );
}

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}): ReactElement {
  return <span className={toneClass(tone, 'kit-badge')}>{children}</span>;
}

export function Banner({
  tone = 'neutral',
  title,
  children,
}: {
  tone?: Tone;
  title: string;
  children?: ReactNode;
}): ReactElement {
  return (
    <div className={toneClass(tone, 'kit-banner')} role={tone === 'bad' ? 'alert' : 'status'}>
      <strong>{title}</strong>
      {children}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }): ReactElement {
  return <p className="kit-empty">{children}</p>;
}

export function Table({
  caption,
  head,
  children,
}: {
  caption: string;
  head: readonly string[];
  children: ReactNode;
}): ReactElement {
  return (
    <div className="kit-tablewrap">
      <table className="kit-table">
        <caption
          className="kit-small kit-muted"
          style={{ captionSide: 'top', padding: 'var(--sp-2)' }}
        >
          {caption}
        </caption>
        <thead>
          <tr>
            {head.map((cell) => (
              <th key={cell} scope="col">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Loading({ label }: { label: string }): ReactElement {
  return (
    <p className="kit-muted" role="status">
      {label}
    </p>
  );
}
