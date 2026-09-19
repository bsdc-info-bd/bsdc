/**
 * BSDC — src/features/profile/ProfileHeader.tsx
 * Purpose : The top of a profile: who the person is, and what they have done here.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The header shows a person, not a scoreboard. Points and level are present because the
 *   community asked for them, but they sit beside the headline rather than above the name, because
 *   the thing worth reading first is what somebody builds.
 *   Every optional field is absent when it is empty rather than shown as a dash: a profile with no
 *   location is a person who did not say, not a person from nowhere.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useTranslation } from 'react-i18next';
import { Avatar, Badge, Button, Card, Heading, Icon, Text } from '@/shared/ui';
import type { Locale } from '@/core/config/app';
import type { Profile } from '@/entities/profile/model';
import type { Reputation } from '@/entities/reputation/model';
import { levelPercentage } from '@/entities/reputation/model';
import { FollowButton } from './FollowButton';

/** Props for the profile header. */
export interface ProfileHeaderProps {
  readonly profile: Profile;
  readonly reputation: Reputation | null;
  readonly followers: number;
  readonly following: number;
  readonly viewerFollows: boolean;
  readonly viewerUid: string;
  readonly locale: Locale;
  /** True when the viewer is looking at their own profile. */
  readonly isOwn: boolean;
  readonly onEdit?: (() => void) | undefined;
  readonly onFollowChanged?: ((following: boolean) => void) | undefined;
}

/**
 * Renders the profile header.
 * @param props component props
 * @returns the header element
 */
export function ProfileHeader({
  profile,
  reputation,
  followers,
  following,
  viewerFollows,
  viewerUid,
  locale,
  isOwn,
  onEdit,
  onFollowChanged,
}: ProfileHeaderProps): React.ReactElement {
  const { t } = useTranslation('profile');
  const lang = locale === 'bn' ? 'bn' : 'en';
  const name =
    locale === 'bn' && profile.displayNameBn.length > 0
      ? profile.displayNameBn
      : profile.displayName;
  const place = [profile.district, profile.region].filter((part) => part.length > 0).join(', ');
  const bangla = locale === 'bn';

  return (
    <Card as="section" className="bsdc-profile__card" padding="none">
      <div className="bsdc-profile__cover" aria-hidden="true" />
      <div className="bsdc-profile__identity">
        <Avatar
          name={name}
          src={profile.photoUrl.length > 0 ? profile.photoUrl : null}
          size="xl"
          ring={reputation !== null && reputation.level >= 10 ? 'creator' : undefined}
          className="bsdc-profile__avatar"
        />
        <div className="bsdc-profile__names">
          <Heading level={1} size="lg" lang={lang} className="bsdc-profile__name">
            {name}
          </Heading>
          <Text as="p" tone="muted" size="sm" lang={lang}>
            @{profile.username}
          </Text>
          {profile.headline.length > 0 ? (
            <Text as="p" size="md" lang={lang} className="bsdc-profile__headline">
              {profile.headline}
            </Text>
          ) : null}
          <div className="bsdc-profile__meta" lang={lang}>
            {place.length > 0 ? (
              <span className="bsdc-profile__metaItem">
                <Icon name="mapPin" size={14} />
                {place}
              </span>
            ) : null}
            {profile.website.length > 0 ? (
              <a
                className="bsdc-profile__metaItem"
                href={profile.website}
                target="_blank"
                rel="noopener noreferrer nofollow"
              >
                <Icon name="link" size={14} />
                {profile.website.replace(/^https?:\/\//, '')}
              </a>
            ) : null}
            {profile.verifiedCreator ? (
              <Badge tone="brand" variant="outline">
                {t('verified')}
              </Badge>
            ) : null}
            {profile.role !== 'member' ? (
              <Badge tone="neutral" variant="outline">
                {t(`role.${profile.role}`)}
              </Badge>
            ) : null}
          </div>
        </div>
        <div className="bsdc-profile__actions">
          {isOwn ? (
            <Button variant="secondary" iconLeft="pencil" onClick={() => onEdit?.()}>
              {t('editProfile')}
            </Button>
          ) : (
            <FollowButton
              viewerUid={viewerUid}
              targetUid={profile.uid}
              following={viewerFollows}
              locale={locale}
              onChanged={onFollowChanged}
            />
          )}
        </div>
      </div>

      {profile.bio.length > 0 ? (
        <Text as="p" className="bsdc-profile__bio" lang={lang}>
          {profile.bio}
        </Text>
      ) : null}

      <dl className="bsdc-profile__stats">
        <div className="bsdc-profile__stat">
          <dt lang={lang}>{t('followers')}</dt>
          <dd>{bangla ? String(followers) : String(followers)}</dd>
        </div>
        <div className="bsdc-profile__stat">
          <dt lang={lang}>{t('following')}</dt>
          <dd>{bangla ? String(following) : String(following)}</dd>
        </div>
        {reputation !== null ? (
          <>
            <div className="bsdc-profile__stat">
              <dt lang={lang}>{t('points')}</dt>
              <dd>{String(reputation.points)}</dd>
            </div>
            <div className="bsdc-profile__stat">
              <dt lang={lang}>{t('level')}</dt>
              <dd>{String(reputation.level)}</dd>
            </div>
            <div className="bsdc-profile__stat">
              <dt lang={lang}>{t('streak')}</dt>
              <dd>{String(reputation.streakDays)}</dd>
            </div>
          </>
        ) : null}
      </dl>

      {reputation !== null ? (
        <div className="bsdc-profile__progress">
          <div
            className="bsdc-profile__progressBar"
            role="img"
            aria-label={t('levelProgress', { percent: levelPercentage(reputation) })}
          >
            <span style={{ inlineSize: `${levelPercentage(reputation)}%` }} />
          </div>
          <Text as="p" size="xs" tone="muted" lang={lang}>
            {t('levelProgress', { percent: levelPercentage(reputation) })}
          </Text>
        </div>
      ) : null}
    </Card>
  );
}
