import { useTranslation } from 'react-i18next';
import { scorePassword } from '@/lib/auth/password-strength';
import { cn } from '@/lib/cn';

const LABEL_KEYS = [
  'auth.strength.veryWeak',
  'auth.strength.weak',
  'auth.strength.fair',
  'auth.strength.good',
  'auth.strength.strong',
] as const;

const BAR_COLORS = ['bg-danger', 'bg-danger', 'bg-warn', 'bg-green-500', 'bg-green-700'] as const;

export function PasswordStrength({ password }: { password: string }) {
  const { t } = useTranslation();
  const level = scorePassword(password);
  if (password.length === 0) return null;

  return (
    <div className="mt-1.5">
      <div className="flex gap-1" aria-hidden="true">
        {[0, 1, 2, 3].map((index) => (
          <span
            key={index}
            className={cn(
              'h-1 flex-1 rounded-full',
              index < level ? BAR_COLORS[level] : 'bg-surface-2',
            )}
          />
        ))}
      </div>
      <p role="status" className="mt-1 text-xs text-muted">
        {t(LABEL_KEYS[level])}
      </p>
    </div>
  );
}
