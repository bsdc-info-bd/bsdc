import { ExternalLink, Github, Mail } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BsdcLogo } from '@/components/brand/bsdc-logo';

export const BSDC_EMAILS = ['hello@bsdc.info.bd', 'bsdc.rrc@gmail.com'] as const;
export const BSDC_GITHUB_URL = 'https://github.com/bsdc-info-bd/bsdc';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

export function SiteFooter() {
  const { t } = useTranslation();
  return (
    <footer className="border-t border-border bg-muted/40">
      <div className="mx-auto w-full max-w-content px-4 py-10">
        <div className="grid gap-8 sm:grid-cols-2 laptop:grid-cols-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <BsdcLogo className="h-8 w-8" />
              <span className="text-base font-semibold">{t('brand.name')}</span>
            </div>
            <p className="max-w-xs text-sm text-muted-foreground">{t('footer.tagline')}</p>
            <p className="text-xs text-muted-foreground">{t('brand.parent')}</p>
          </div>

          <div>
            <h2 className="text-sm font-semibold">{t('footer.platform')}</h2>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <a
                  href="#roadmap"
                  className={`${focusRing} rounded text-muted-foreground hover:text-foreground`}
                >
                  {t('nav.roadmap')}
                </a>
              </li>
              <li>
                <a
                  href="#about"
                  className={`${focusRing} rounded text-muted-foreground hover:text-foreground`}
                >
                  {t('nav.about')}
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="text-sm font-semibold">{t('footer.project')}</h2>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <a
                  href={BSDC_GITHUB_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${focusRing} inline-flex items-center gap-1.5 rounded text-muted-foreground hover:text-foreground`}
                >
                  <Github className="h-4 w-4" aria-hidden="true" />
                  {t('landing.viewOnGithub')}
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="text-sm font-semibold">{t('footer.contact')}</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {BSDC_EMAILS.map((email) => (
                <li key={email}>
                  <a
                    href={`mailto:${email}`}
                    className={`${focusRing} inline-flex items-center gap-1.5 break-all rounded text-muted-foreground hover:text-foreground`}
                  >
                    <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {email}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-10 space-y-1 border-t border-border pt-4 text-xs text-muted-foreground">
          <p>{t('footer.rights')}</p>
          <p>{t('footer.license')}</p>
          <p>
            {t('landing.founderLabel')}: {t('brand.founderName')}
          </p>
        </div>
      </div>
    </footer>
  );
}
