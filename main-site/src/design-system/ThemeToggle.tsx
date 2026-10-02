import { Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useThemeStore } from '@/store/theme-store';
import { IconButton } from './IconButton';

/** Light/dark switch. The choice is persisted per device. */
export function ThemeToggle({ className }: { className?: string }) {
  const { t } = useTranslation();
  const resolved = useThemeStore((state) => state.resolved);
  const toggle = useThemeStore((state) => state.toggle);

  return (
    <IconButton
      label={t('a11y.toggleTheme')}
      onClick={toggle}
      className={className}
      icon={resolved === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
    />
  );
}
