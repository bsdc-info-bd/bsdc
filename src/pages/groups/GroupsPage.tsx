/**
 * BSDC — src/pages/groups/GroupsPage.tsx
 * Purpose : The groups route: discover communities, join them, or start one.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Secret groups never appear here for someone who is not a member, which is a rules-level
 *   guarantee rather than a filter in this file. Creating a group is gated on an active session so
 *   the form is never shown to someone who could not submit it.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/Button';
import { Container } from '@/shared/ui/Container';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Heading, Text } from '@/shared/ui/Typography';
import { Spinner } from '@/shared/ui/Spinner';
import { useSession } from '@/features/auth';
import { GroupCard, CreateGroupDialog } from '@/features/groups';
import { listGroups, listMyGroups } from '@/entities/group/repository';
import type { Group } from '@/entities/group/model';

/**
 * Renders the groups route.
 * @returns the groups page
 */
export function GroupsPage(): React.ReactElement {
  const { t } = useTranslation('groups');
  const { session, profile, locale } = useSession();
  const [groups, setGroups] = useState<readonly Group[]>([]);
  const [mine, setMine] = useState<readonly string[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    const page = await listGroups();
    setGroups(page.items);
    setOffline(page.source === 'local');
    if (session.uid !== null) {
      const joined = await listMyGroups(session.uid);
      setMine(joined.map((group) => group.id));
    }
    setLoading(false);
  }, [session.uid]);

  useEffect(() => {
    void load();
  }, [load]);

  const signedIn = session.status === 'signed-in';

  return (
    <Container className="py-6">
      <header className="bsdc-page__head">
        <Heading level={1} size="xl" lang={locale === 'bn' ? 'bn' : 'en'}>
          {t('title')}
        </Heading>
        <Text as="p" tone="muted" lang={locale === 'bn' ? 'bn' : 'en'}>
          {t('subtitle')}
        </Text>
        {signedIn ? (
          <Button
            type="button"
            variant={creating ? 'outline' : 'primary'}
            onClick={() => setCreating((open) => !open)}
          >
            {creating ? t('cancel') : t('startCreating')}
          </Button>
        ) : null}
      </header>

      {creating && session.uid !== null ? (
        <div className="bsdc-page__panel">
          <CreateGroupDialog
            ownerUid={session.uid}
            locale={locale}
            onCancel={() => setCreating(false)}
            onCreated={() => {
              setCreating(false);
              void load();
            }}
          />
        </div>
      ) : null}

      {offline ? (
        <Text as="p" role="status" className="bsdc-page__note">
          {t('deviceOnly')}
        </Text>
      ) : null}

      {loading ? (
        <div className="bsdc-page__loading" role="status">
          <Spinner size={24} label={t('loading')} />
        </div>
      ) : groups.length === 0 ? (
        <EmptyState
          illustration="welcome"
          title={t('emptyTitle')}
          description={t('emptyBody')}
          {...(signedIn
            ? {
                action: (
                  <Button type="button" onClick={() => setCreating(true)}>
                    {t('startCreating')}
                  </Button>
                ),
              }
            : {})}
        />
      ) : (
        <ul className="bsdc-groups__grid">
          {groups.map((group) => (
            <li key={group.id}>
              <GroupCard
                group={group}
                locale={locale}
                joined={mine.includes(group.id) || group.ownerUid === session.uid}
                viewerUid={session.uid}
                onChanged={() => void load()}
              />
            </li>
          ))}
        </ul>
      )}

      {profile === null && !signedIn ? (
        <Text as="p" tone="muted" className="bsdc-page__note">
          {t('signInToJoin')}
        </Text>
      ) : null}
    </Container>
  );
}
