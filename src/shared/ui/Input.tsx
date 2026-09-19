/**
 * BSDC — src/shared/ui/Input.tsx
 * Purpose : Field, input, textarea and input group with label, hint, error and counter
 *           (PART 08.09, F-121).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Error and hint text are associated with the control through aria-describedby, and the
 *           error is announced through role="alert" so a screen reader hears it on submit.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
  type ReactNode,
} from 'react';
import { cn } from '@/shared/lib/cn';

/** Common field props. */
interface FieldBaseProps {
  readonly label?: string | undefined;
  readonly hint?: string | undefined;
  readonly error?: string | undefined;
  readonly required?: boolean | undefined;
  /** Current length and limit, rendered as a live counter. */
  readonly counter?: { readonly value: number; readonly max: number } | undefined;
  readonly className?: string | undefined;
}

/** Props for the Input component. */
export type InputProps = FieldBaseProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> & {
    readonly leading?: ReactNode | undefined;
    readonly trailing?: ReactNode | undefined;
  };

/**
 * Renders a labelled text input.
 * @param props component props
 * @returns a field element
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, required, counter, className, leading, trailing, id, ...rest },
  ref,
): React.ReactElement {
  const generated = useId();
  const fieldId = id ?? generated;
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;
  const describedBy = [hint !== undefined ? hintId : null, error !== undefined ? errorId : null]
    .filter((value): value is string => value !== null)
    .join(' ');

  const control = (
    <input
      ref={ref}
      id={fieldId}
      className="bsdc-input"
      aria-invalid={error !== undefined ? true : undefined}
      aria-describedby={describedBy.length > 0 ? describedBy : undefined}
      required={required}
      {...rest}
    />
  );

  return (
    <div className={cn('bsdc-field', className)}>
      {label !== undefined && (
        <label className="bsdc-field__label" htmlFor={fieldId}>
          {label}
          {required === true && (
            <span className="bsdc-field__required" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}
      {leading !== undefined || trailing !== undefined ? (
        <div className="bsdc-input-group">
          {leading !== undefined && <span className="bsdc-input-group__affix">{leading}</span>}
          {control}
          {trailing !== undefined && <span className="bsdc-input-group__affix">{trailing}</span>}
        </div>
      ) : (
        control
      )}
      {hint !== undefined && (
        <span className="bsdc-field__hint" id={hintId}>
          {hint}
        </span>
      )}
      {error !== undefined && (
        <span className="bsdc-field__error" id={errorId} role="alert">
          {error}
        </span>
      )}
      {counter !== undefined && (
        <span
          className="bsdc-field__counter"
          data-over={counter.value > counter.max ? 'true' : 'false'}
        >
          {counter.value} / {counter.max}
        </span>
      )}
    </div>
  );
});

/** Props for the Textarea component. */
export type TextareaProps = FieldBaseProps &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'>;

/**
 * Renders a labelled textarea.
 * @param props component props
 * @returns a field element
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, required, counter, className, id, ...rest },
  ref,
): React.ReactElement {
  const generated = useId();
  const fieldId = id ?? generated;
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;
  const describedBy = [hint !== undefined ? hintId : null, error !== undefined ? errorId : null]
    .filter((value): value is string => value !== null)
    .join(' ');

  return (
    <div className={cn('bsdc-field', className)}>
      {label !== undefined && (
        <label className="bsdc-field__label" htmlFor={fieldId}>
          {label}
          {required === true && (
            <span className="bsdc-field__required" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}
      <textarea
        ref={ref}
        id={fieldId}
        className="bsdc-textarea"
        aria-invalid={error !== undefined ? true : undefined}
        aria-describedby={describedBy.length > 0 ? describedBy : undefined}
        required={required}
        {...rest}
      />
      {hint !== undefined && (
        <span className="bsdc-field__hint" id={hintId}>
          {hint}
        </span>
      )}
      {error !== undefined && (
        <span className="bsdc-field__error" id={errorId} role="alert">
          {error}
        </span>
      )}
      {counter !== undefined && (
        <span
          className="bsdc-field__counter"
          data-over={counter.value > counter.max ? 'true' : 'false'}
        >
          {counter.value} / {counter.max}
        </span>
      )}
    </div>
  );
});
