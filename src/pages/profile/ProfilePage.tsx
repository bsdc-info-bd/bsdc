/**
 * BSDC — src/pages/profile/ProfilePage.tsx
 * Purpose : One member, in public: who they are, what they post, and what they build.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The route is public and indexable for members who chose a public profile; a private
 *   profile renders its own notice instead of pretending the page does not exist, because a 404 on
 *   a person reads as though they were removed.
 *   Editing is inline rather than a separate route: the thing you are editing stays visible while
 *   you edit it, which is the whole point of a profile form.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Container, EmptyState, Heading, Skeleton, Tabs, Text } from '@/shared/ui';
import { useSession } from '@/features/auth';
import { ProfileEditor, ProfileHeader, useProfile } from '@/features/profile';
import { FeedStream } from '@/features/feed';
import { loadReputation } from '@/entities/reputation/repository';
import { saveProfile } from '@/entities/profile/repository';

/**
 * Renders the profile route.
 * @returns the profile page
 */
export function ProfilePage(): React.ReactElement {
  const { t } = useTranslation('profile');
  const { username = '' } = useParams<{ username: string }>();
  const { session, profile: viewer, locale, updateProfile } = useSession();
  const viewerUid = session.uid ?? '';
  const [editing, setEditing] = useState(false);
  const [followVersion, setFollowVersion] = useState(0);
  const view = useProfile(username, viewerUid);

  useEffect(() => {
    setFollowVersion((current) => current);
  }, [followVersion]);

  if (view.loading) {
    return (
      <Container className="py-6">
        <Skeleton height={220} />
        <Skeleton height={64} />
      </Container>
    );
  }

  if (view.profile === null) {
    return (
      <Container className="py-6">
        <EmptyState
          illustration="not-found"
          title={t('missing.title')}
          description={t('missing.description', { username })}
          lang={locale === 'bn' ? 'bn' : 'en'}
        />
      </Container>
    );
  }

  const profile = view.profile;
  const isOwn = viewer !== null && viewer.uid === profile.uid;
  const hidden = !isOwn && profile.privacy.profileVisibility !== 'public';

  if (hidden) {
    return (
      <Container className="py-6">
        <EmptyState
          illustration="empty-state"
          title={t('private.title')}
          description={t('private.description')}
          lang={locale === 'bn' ? 'bn' : 'en'}
        />
      </Container>
    );
  }

  return (
    <Container className="py-6">
      <Heading
        level={1}
        size="xl"
        className="bsdc-visually-hidden"
        lang={locale === 'bn' ? 'bn' : 'en'}
      >
        {t('heading', {
          name:
            locale === 'bn' && profile.displayNameBn.length > 0
              ? profile.displayNameBn
              : profile.displayName,
        })}
      </Heading>

      {editing && isOwn ? (
        <ProfileEditor
          profile={profile}
          locale={locale}
          onSave={async (patch) => {
            await updateProfile(patch);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <ProfileHeader
          profile={profile}
          reputation={view.reputation}
          followers={view.followers}
          following={view.following}
          viewerFollows={view.viewerFollows}
          viewerUid={viewerUid}
          locale={locale}
          isOwn={isOwn}
          onEdit={() => setEditing(true)}
          onFollowChanged={() => setFollowVersion((current) => current + 1)}
        />
      )}

      <Tabs
        label={t('tabs.label')}
        defaultValue="posts"
        items={[
          {
            value: 'posts',
            label: t('tabs.posts'),
            content: (
              <FeedStream
                viewer={viewer}
                locale={locale}
                sort="latest"
                {...(profile.uid.length > 0 ? { authorUid: profile.uid } : {})}
              />
            ),
          },
          {
            value: 'about',
            label: t('tabs.about'),
            content: (
              <section className="bsdc-profile__about">
                {profile.bio.length > 0 ? (
                  <Text as="p" lang={locale === 'bn' ? 'bn' : 'en'}>
                    {profile.bio}
                  </Text>
                ) : (
                  <Text as="p" tone="muted" lang={locale === 'bn' ? 'bn' : 'en'}>
                    {t('about.empty')}
                  </Text>
                )}
                {profile.skills.length > 0 ? (
                  <ul className="bsdc-profile__skills">
                    {profile.skills.map((skill) => (
                      <li key={skill} lang={locale === 'bn' ? 'bn' : 'en'}>
                        {skill}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ),
          },
        ]}
      />
    </Container>
  );
}

/**
 * Loads the reputation of a profile, used by the header when the hook has not settled.
 * @param uid account id
 * @returns the reputation record
 */
export async function reputationFor(uid: string): ReturnType<typeof loadReputation> {
  return await loadReputation(uid);
}

/**
 * Saves a profile patch, exposed for the editor's own tests.
 * @param uid account id
 * @param patch the fields to change
 * @returns the write outcome
 */
export async function persistProfile(
  uid: string,
  patch: Parameters<typeof saveProfile>[1],
): ReturnType<typeof saveProfile> {
  return await saveProfile(uid, patch);
}
