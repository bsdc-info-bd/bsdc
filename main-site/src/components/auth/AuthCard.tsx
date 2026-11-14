import { Globe2, ShieldCheck, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Logo } from '@/design-system';

export interface AuthCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Shows the editorial community highlight panel on larger viewports. */
  showcase?: boolean;
}

/** Elevated, responsive card shared by every authentication screen. */
export function AuthCard({ title, subtitle, children, footer, showcase = false }: AuthCardProps) {
  const { t } = useTranslation();

  const highlights = [
    { icon: Globe2, text: t('auth.highlights.bilingual') },
    { icon: Sparkles, text: t('auth.highlights.free') },
    { icon: ShieldCheck, text: t('auth.highlights.secure') },
  ];

  return (
    <div className="bsdc-auth-stage min-h-[calc(100dvh-var(--bsdc-app-bar-h))] py-6 sm:py-10 lg:flex lg:items-center">
      <div
        className={
          showcase
            ? 'fab-container grid items-center gap-8 lg:max-w-4xl lg:grid-cols-[1fr_minmax(0,27rem)] lg:gap-12'
            : 'fab-container flex justify-center'
        }
      >
        {showcase ? (
          <div className="hidden lg:block lg:animate-fade-up">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-green-700">
              <span className="h-2 w-2 rounded-full bg-green-500" aria-hidden="true" />
              {t('auth.heroEyebrow')}
            </div>
            <div className="mt-5">
              <Logo variant="full" className="h-11" title={title} />
            </div>
            <p className="mt-4 max-w-md text-base leading-relaxed text-muted">
              {t('home.subheading')}
            </p>
            <ul className="mt-6 grid gap-3">
              {highlights.map((item) => {
                const Icon = item.icon;
                return (
                  <li
                    key={item.text}
                    className="flex items-center gap-3 rounded-card border border-border/80 bg-surface/80 px-3.5 py-2.5 text-sm font-medium text-text"
                  >
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-500/12 text-green-700">
                      <Icon size={17} aria-hidden="true" />
                    </span>
                    <span>{item.text}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        <div className="mx-auto w-full max-w-md">
          <div
            className={showcase ? 'mb-5 flex justify-center lg:hidden' : 'mb-5 flex justify-center'}
          >
            <Logo variant="full" className="h-10" title={title} />
          </div>

          <div className="bsdc-auth-card relative overflow-hidden rounded-sheet border border-border bg-surface p-5 sm:p-7">
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-green-500 via-green-300 to-blue"
              aria-hidden="true"
            />
            <div className="pt-1">
              <h1 className="text-2xl font-semibold tracking-tight text-text">{title}</h1>
              {subtitle ? (
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{subtitle}</p>
              ) : null}
            </div>
            <div className="mt-5">{children}</div>
          </div>

          {footer ? <div className="mt-4 text-center text-sm text-muted">{footer}</div> : null}
        </div>
      </div>
    </div>
  );
}
