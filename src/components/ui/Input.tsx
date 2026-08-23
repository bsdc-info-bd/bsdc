/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import TextareaAutosize, { type TextareaAutosizeProps } from 'react-textarea-autosize';
import { cn } from '@/lib/utils';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, leftIcon, className, id, ...props },
  ref,
) {
  const inputId = id || props.name;
  return (
    <div className="w-full">
      {label ? (
        <label htmlFor={inputId} className="bsdc-label">
          {label}
        </label>
      ) : null}
      <div className="relative">
        {leftIcon ? (
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-neutral-400">{leftIcon}</span>
        ) : null}
        <input
          ref={ref}
          id={inputId}
          className={cn('bsdc-input', leftIcon && 'pl-10', error && 'border-red-500 focus:ring-red-500/30', className)}
          aria-invalid={Boolean(error)}
          {...props}
        />
      </div>
      {hint && !error ? <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{hint}</p> : null}
      {error ? (
        <p className="bsdc-error-text" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  minRows?: number;
  maxRows?: number;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, hint, className, minRows = 3, maxRows = 16, id, ...props },
  ref,
) {
  const inputId = id || props.name;
  return (
    <div className="w-full">
      {label ? (
        <label htmlFor={inputId} className="bsdc-label">
          {label}
        </label>
      ) : null}
      <TextareaAutosize
        ref={ref}
        id={inputId}
        minRows={minRows}
        maxRows={maxRows}
        className={cn('bsdc-input resize-none leading-relaxed', error && 'border-red-500', className)}
        aria-invalid={Boolean(error)}
        {...(props as TextareaAutosizeProps)}
      />
      {hint && !error ? <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{hint}</p> : null}
      {error ? (
        <p className="bsdc-error-text" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, options, className, id, ...props },
  ref,
) {
  const inputId = id || props.name;
  return (
    <div className="w-full">
      {label ? (
        <label htmlFor={inputId} className="bsdc-label">
          {label}
        </label>
      ) : null}
      <select ref={ref} id={inputId} className={cn('bsdc-input cursor-pointer', className)} {...props}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error ? (
        <p className="bsdc-error-text" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
});
