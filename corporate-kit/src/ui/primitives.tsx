import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactElement,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { useId } from 'react';

/**
 * The small set of controls every console is built from. They are plain
 * elements with class names: an operations console should stay legible to
 * whoever maintains it next, and that is easier when a button is a button.
 */

type Tone = 'neutral' | 'ok' | 'warn' | 'bad';

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
          style={{ justifyContent: 'space-between', marginBottom: 'var(--sp-3)' }}
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
      <select id={id} aria-describedby={`${id}-note`} {...rest}>
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
