/**
 * BSDC — src/features/admin/AdminScope.tsx
 * Purpose : The wrapper that decides whether an administration screen is shown at all.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : One guard, used by every administration screen, so the rule about who may see them is
 *   written once. It checks the role the session holds — the same value the server will check — and
 *   renders a real explanation when the answer is no, rather than a blank screen or a redirect that
 *   leaves somebody wondering whether the page is broken.
 *   This is a courtesy, not the control. firestore.rules refuses the audit read and the Cloud
 *   Function refuses the write for anybody without the standing, so a client that skipped this
 *   guard entirely would gain nothing but an empty screen.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/shared/ui';
import type { Locale } from '@/core/config/app';
import type { Role } from '@/core/config/permissions';
import { isAdmin } from '@/core/config/permissions';

/** Props for the administration scope. */
export interface AdminScopeProps {
  readonly role: Role;
  readonly root: boolean;
  readonly locale: Locale;
  readonly children: React.ReactNode;
}

/**
 * Renders an administration screen only for an administrator.
 * @param props component props
 * @returns the screen, or the explanation of why it is not available
 */
export function AdminScope({ role, root, locale, children }: AdminScopeProps): React.ReactElement {
  const { t } = useTranslation('admin');
  const lang = locale === 'bn' ? 'bn' : 'en';
  if (!root && !isAdmin(role)) {
    return (
      <EmptyState
        illustration="not-found"
        title={t('denied.title')}
        description={t('denied.description')}
        lang={lang}
      />
    );
  }
  return <>{children}</>;
}
