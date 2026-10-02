import { Eye, EyeOff } from 'lucide-react';
import { forwardRef, useState, type InputHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import { TextField } from './TextField';

export interface PasswordFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string | undefined;
}

export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(
  function PasswordField({ label, hint, error, ...rest }, ref) {
    const { t } = useTranslation();
    const [visible, setVisible] = useState(false);

    return (
      <TextField
        ref={ref}
        label={label}
        {...(hint === undefined ? {} : { hint })}
        error={error}
        type={visible ? 'text' : 'password'}
        autoComplete={rest.autoComplete ?? 'current-password'}
        addonEnd={
          <button
            type="button"
            onClick={() => setVisible((value) => !value)}
            aria-label={visible ? t('auth.hidePassword') : t('auth.showPassword')}
            className="fab-tap inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2"
          >
            {visible ? (
              <EyeOff size={16} aria-hidden="true" />
            ) : (
              <Eye size={16} aria-hidden="true" />
            )}
          </button>
        }
        {...rest}
      />
    );
  },
);
