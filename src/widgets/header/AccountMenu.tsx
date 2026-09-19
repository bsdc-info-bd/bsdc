/**
 * BSDC — src/widgets/header/AccountMenu.tsx
 * Purpose : The header's account control: who you are, your unread count, and how to sign out.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The control states the truth about the session. A device-local session says so, because
 *   a person who believes they are signed in when they are not will eventually lose something.
 *   The disclosure is a plain expandable region, not a popper: it cannot be clipped at 250px, it
 *   needs no positioning library, and it is fully keyboard operable.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Avatar } from '@/shared/ui/Avatar';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { Text } from '@/shared/ui/Typography';
import { ROLE_LABELS } from '@/core/config/permissions';
import { displayNameFor, profileHref } from '@/entities/profile/model';
import { useSession } from '@/features/auth';
import { useBadgeStore } from '@/shared/stores/badges';

/**
 * Renders the account control.
 * @returns the account menu
 */
export function AccountMenu(): React.ReactElement {
  const { t } = useTranslation(['nav', 'auth']);
  const { session, profile, locale, signOut } = useSession();
  const [open, setOpen] = useState(false);
  const unread = useBadgeStore((state) => state.notifications);
  const signedIn = session.status === 'signed-in';

  if (!signedIn || profile === null) {
    return (
      <Link className="bsdc-account bsdc-account--guest" to="/feed">
        <Icon name="user" size={18} />
        <span className="bsdc-account__label">{t('account', { ns: 'nav' })}</span>
      </Link>
    );
  }

  const name = displayNameFor(profile, locale);
  const roleLabel = ROLE_LABELS[session.claims.role][locale === 'bn' ? 'bn' : 'en'];

  return (
    <div className="bsdc-account">
      <button
        type="button"
        className="bsdc-account__trigger"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Avatar
          name={name}
          src={profile.photoUrl === '' ? null : profile.photoUrl}
          size="sm"
          decorative
        />
        <span className="bsdc-account__label">{name}</span>
        {unread > 0 ? (
          <Badge tone="brand" variant="count" count={unread} banglaNumerals={locale === 'bn'} />
        ) : null}
      </button>

      {open ? (
        <div className="bsdc-account__panel">
          <Text as="p" size="sm" tone="muted">
            {roleLabel}
          </Text>
          {session.source === 'device' ? (
            <Text as="p" size="sm" tone="brand">
              {t('device.explanation', { ns: 'auth' })}
            </Text>
          ) : null}
          <Link
            className="bsdc-account__link"
            to={profileHref(profile.username)}
            onClick={() => setOpen(false)}
          >
            {t('account', { ns: 'nav' })}
          </Link>
          <Link className="bsdc-account__link" to="/notifications" onClick={() => setOpen(false)}>
            {`${t('notifications', { ns: 'nav' })} ${unread > 0 ? `(${unread})` : ''}`}
          </Link>
          <Link className="bsdc-account__link" to="/settings" onClick={() => setOpen(false)}>
            {t('settings', { ns: 'nav' })}
          </Link>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setOpen(false);
              void signOut();
            }}
          >
            {t('signOut', { defaultValue: 'Sign out' })}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
