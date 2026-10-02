import { Lock, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Seo } from '@/components/seo/Seo';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  PageSkeleton,
  SectionHeading,
} from '@/design-system';
import { useGroupDirectory } from '@/hooks/use-communities';
import { joinAction, type GroupSummary } from '@/lib/communities/community-types';
import { formatNumber } from '@/lib/format';
import { groupPath, ROUTES, SITE } from '@/lib/site';
import { dataErrorKey } from '@/lib/supabase/errors';
import { selectIsSignedIn, useAuthStore } from '@/store/auth-store';

/** Discovery: every group this member is allowed to know exists. */
export default function GroupsPage() {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const isSignedIn = useAuthStore(selectIsSignedIn);
  const directory = useGroupDirectory();

  async function join(group: GroupSummary) {
    try {
      const status = await directory.join(group.id);
      toast.success(status === 'approved' ? t('groups.joined') : t('groups.requested'));
    } catch (error) {
      toast.error(t(dataErrorKey(error)));
    }
  }

  return (
    <>
      <Seo
        title={t('groups.metaTitle')}
        description={t('groups.metaDescription')}
        path={ROUTES.groups}
        jsonLd={[
          {
            '@type': 'CollectionPage',
            name: t('groups.title'),
            url: `${SITE.url}${ROUTES.groups}`,
          },
        ]}
      />
      <div className="fab-container py-6 sm:py-10">
        <SectionHeading title={t('groups.title')} description={t('groups.description')} />

        {directory.isLoading ? <PageSkeleton label={t('common.loading')} /> : null}
        {directory.isError ? <Alert tone="danger" title={t('groups.failed')} /> : null}

        {!directory.isLoading && !directory.isError && directory.groups.length === 0 ? (
          <EmptyState
            icon={<Users size={22} />}
            title={t('groups.emptyTitle')}
            description={t('groups.emptyBody')}
          />
        ) : null}

        <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {directory.groups.map((group) => {
            const action = joinAction(group, isSignedIn);
            return (
              <Card as="li" key={group.id}>
                <div className="flex items-start gap-3">
                  <Avatar src={group.avatarUrl} name={group.name} size="md" />
                  <div className="min-w-0 flex-1">
                    <Link to={groupPath(group.slug)} className="block">
                      <h2 className="fab-truncate text-lg font-semibold hover:underline">
                        {group.name}
                      </h2>
                    </Link>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                      <span>
                        {t('groups.memberCount', {
                          total: formatNumber(group.members, language),
                        })}
                      </span>
                      {group.privacy !== 'public' ? (
                        <Badge tone="neutral">
                          <Lock size={11} aria-hidden="true" />
                          {t(`groups.privacy.${group.privacy}`)}
                        </Badge>
                      ) : null}
                      {group.myRole !== null ? (
                        <Badge tone="green">{t(`groups.roles.${group.myRole}`)}</Badge>
                      ) : null}
                    </p>
                  </div>
                </div>

                {group.description.length > 0 ? (
                  <p className="mt-3 line-clamp-3 text-sm text-muted">{group.description}</p>
                ) : null}

                <div className="mt-3">
                  {action === 'open' ? (
                    <Link to={groupPath(group.slug)}>
                      <Button variant="secondary" size="sm">
                        {t('groups.open')}
                      </Button>
                    </Link>
                  ) : action === 'pending' ? (
                    <Button variant="ghost" size="sm" disabled>
                      {t('groups.pending')}
                    </Button>
                  ) : action === 'closed' ? (
                    <p className="text-xs text-muted">{t('groups.inviteOnly')}</p>
                  ) : (
                    <Button
                      size="sm"
                      disabled={directory.isJoining}
                      onClick={() => {
                        void join(group);
                      }}
                    >
                      {action === 'join' ? t('groups.join') : t('groups.request')}
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </ul>
      </div>
    </>
  );
}
