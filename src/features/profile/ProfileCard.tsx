/**
 * BSDC — src/features/profile/ProfileCard.tsx
 * Purpose : One person, in one row, wherever a list of people is needed.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Used by search results, follower lists and the leaderboard's compact mode. The whole
 *   row is one link to the profile, and the follow button sits inside it as a real button — a
 *   nested interactive element is a real accessibility hazard, so the row link stops before the
 *   button instead of wrapping it.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { Link } from 'react-router-dom';
import { Avatar, Badge, Text } from '@/shared/ui';
import type { Locale } from '@/core/config/app';
import type { Profile } from '@/entities/profile/model';
import { profileHref } from '@/entities/profile/model';
import { FollowButton } from './FollowButton';

/** Props for the profile card. */
export interface ProfileCardProps {
  readonly profile: Profile;
  readonly locale: Locale;
  readonly viewerUid: string;
  readonly following?: boolean | undefined;
  /** Compact rows drop the bio and the follow control, for dense lists. */
  readonly compact?: boolean | undefined;
  /** Right-hand slot, used by the leaderboard for a rank or a score. */
  readonly trailing?: React.ReactNode | undefined;
}

/**
 * Renders a person row.
 * @param props component props
 * @returns the row element
 */
export function ProfileCard({
  profile,
  locale,
  viewerUid,
  following = false,
  compact = false,
  trailing,
}: ProfileCardProps): React.ReactElement {
  const lang = locale === 'bn' ? 'bn' : 'en';
  const name =
    locale === 'bn' && profile.displayNameBn.length > 0
      ? profile.displayNameBn
      : profile.displayName;

  return (
    <article className="bsdc-person">
      <Link className="bsdc-person__link" to={profileHref(profile.username)} lang={lang}>
        <Avatar
          name={name}
          src={profile.photoUrl.length > 0 ? profile.photoUrl : null}
          size={compact ? 'sm' : 'md'}
          decorative
        />
        <span className="bsdc-person__text">
          <span className="bsdc-person__name" lang={lang}>
            {name}
          </span>
          <Text as="span" size="sm" tone="muted" lang={lang}>
            @{profile.username}
          </Text>
          {!compact && profile.headline.length > 0 ? (
            <Text as="span" size="sm" lang={lang} truncate>
              {profile.headline}
            </Text>
          ) : null}
        </span>
        {profile.verifiedCreator ? <Badge tone="brand" variant="dot" aria-hidden="true" /> : null}
      </Link>
      {trailing !== undefined ? <div className="bsdc-person__trailing">{trailing}</div> : null}
      {!compact && viewerUid.length > 0 && viewerUid !== profile.uid ? (
        <div className="bsdc-person__action">
          <FollowButton
            viewerUid={viewerUid}
            targetUid={profile.uid}
            following={following}
            locale={locale}
            size="sm"
          />
        </div>
      ) : null}
    </article>
  );
}
