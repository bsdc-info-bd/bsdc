import { Hash, Lock, Users } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Seo } from '@/components/seo/Seo';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  PageSkeleton,
  Tabs,
  type TabItem,
} from '@/design-system';
import { useGroup } from '@/hooks/use-communities';
import {
  canModerateGroup,
  joinAction,
  sortMembers,
  type GroupMemberEntry,
} from '@/lib/communities/community-types';
import { formatAbsoluteDate, formatNumber } from '@/lib/format';
import { groupPath, profilePath, SITE } from '@/lib/site';
import { dataErrorKey } from '@/lib/supabase/errors';
import { selectIsSignedIn, useAuthStore } from '@/store/auth-store';

/** A single group: channels, members, rules and the moderation queue. */
export default function GroupPage() {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const { slug = '' } = useParams<{ slug: string }>();
  const isSignedIn = useAuthStore(selectIsSignedIn);
  const [tab, setTab] = useState('channels');
  const detail = useGroup(slug);
  const group = detail.group;

  if (detail.isLoading) {
    return <PageSkeleton label={t('common.loading')} />;
  }

  if (detail.isError || group === null) {
    return (
      <div className="fab-container py-10">
        <EmptyState
          icon={<Users size={22} />}
          title={t('groups.notFoundTitle')}
          description={t('groups.notFoundBody')}
        />
      </div>
    );
  }

  const action = joinAction(group, isSignedIn);
  const moderator = canModerateGroup(group.myRole);
  const members = sortMembers(detail.members);

  async function act() {
    if (group === null) return;
    try {
      if (group.myRole !== null) {
        await detail.leave();
        toast.success(t('groups.left'));
      } else {
        const status = await detail.join();
        toast.success(status === 'approved' ? t('groups.joined') : t('groups.requested'));
      }
    } catch (error) {
      toast.error(t(dataErrorKey(error)));
    }
  }

  const items: TabItem[] = [
    {
      id: 'channels',
      label: t('groups.tabs.channels'),
      content:
        detail.channels.length === 0 ? (
          <EmptyState
            icon={<Hash size={22} />}
            title={t('groups.noChannels')}
            description={t('groups.noChannelsBody')}
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {detail.channels.map((channel) => (
              <Card as="li" key={channel.id} padded={false} className="p-3">
                <p className="flex items-center gap-1 text-sm font-semibold">
                  <Hash size={14} aria-hidden="true" />
                  {channel.name}
                  {channel.isReadOnly ? <Badge tone="neutral">{t('groups.readOnly')}</Badge> : null}
                </p>
                {channel.topic.length > 0 ? (
                  <p className="mt-1 text-xs text-muted">{channel.topic}</p>
                ) : null}
              </Card>
            ))}
          </ul>
        ),
    },
    {
      id: 'members',
      label: t('groups.tabs.members'),
      content: <MemberList members={members} />,
    },
    {
      id: 'about',
      label: t('groups.tabs.about'),
      content: (
        <Card>
          <p className="whitespace-pre-wrap text-sm">
            {group.description.length > 0 ? group.description : t('groups.noDescription')}
          </p>
          {group.rules.length > 0 ? (
            <>
              <h3 className="mt-4 text-sm font-semibold">{t('groups.rules')}</h3>
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{group.rules}</p>
            </>
          ) : null}
          <p className="mt-4 text-xs text-muted">
            {t('groups.created', {
              date: formatAbsoluteDate(new Date(group.createdAt), language),
            })}
          </p>
        </Card>
      ),
    },
  ];

  if (moderator) {
    items.push({
      id: 'requests',
      label: t('groups.tabs.requests'),
      content:
        detail.requests.length === 0 ? (
          <EmptyState
            icon={<Users size={22} />}
            title={t('groups.noRequests')}
            description={t('groups.noRequestsBody')}
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {detail.requests.map((request) => (
              <Card
                as="li"
                key={request.uid}
                padded={false}
                className="flex items-center gap-2 p-3"
              >
                <Avatar src={request.avatarUrl} name={request.displayName} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="fab-truncate text-sm font-semibold">{request.displayName}</p>
                  {request.message.length > 0 ? (
                    <p className="fab-truncate text-xs text-muted">{request.message}</p>
                  ) : null}
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    void detail.decide(request.uid, true);
                  }}
                >
                  {t('groups.approve')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    void detail.decide(request.uid, false);
                  }}
                >
                  {t('groups.reject')}
                </Button>
              </Card>
            ))}
          </ul>
        ),
    });
  }

  return (
    <>
      <Seo
        title={`${group.name} — ${t('common.brand')}`}
        description={group.description.length > 0 ? group.description : t('groups.metaDescription')}
        path={groupPath(group.slug)}
        noindex={group.privacy !== 'public'}
        jsonLd={[
          {
            '@type': 'Organization',
            name: group.name,
            description: group.description,
            url: `${SITE.url}${groupPath(group.slug)}`,
          },
        ]}
      />

      <div className="fab-container py-6 sm:py-10">
        <Card>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <Avatar src={group.avatarUrl} name={group.name} size="xl" />
            <div className="min-w-0 flex-1">
              <h1 className="fab-truncate text-2xl">{group.name}</h1>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                <span>
                  {t('groups.memberCount', { total: formatNumber(group.members, language) })}
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
            {action === 'closed' && group.myRole === null ? null : (
              <Button
                variant={group.myRole === null ? 'primary' : 'secondary'}
                className="shrink-0"
                onClick={() => {
                  void act();
                }}
                disabled={action === 'pending'}
              >
                {group.myRole !== null
                  ? t('groups.leave')
                  : action === 'pending'
                    ? t('groups.pending')
                    : action === 'request'
                      ? t('groups.request')
                      : t('groups.join')}
              </Button>
            )}
          </div>
        </Card>

        <div className="mt-5">
          <Tabs items={items} activeId={tab} onChange={setTab} label={group.name} />
        </div>
      </div>
    </>
  );
}

function MemberList({ members }: { members: GroupMemberEntry[] }) {
  const { t } = useTranslation();

  if (members.length === 0) {
    return (
      <EmptyState
        icon={<Users size={22} />}
        title={t('groups.noMembers')}
        description={t('groups.noMembersBody')}
      />
    );
  }

  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {members.map((member) => (
        <Card as="li" key={member.uid} padded={false} className="flex items-center gap-2 p-3">
          <Avatar src={member.avatarUrl} name={member.displayName} size="sm" />
          <Link to={profilePath(member.username)} className="min-w-0 flex-1">
            <span className="fab-truncate block text-sm font-semibold hover:underline">
              {member.displayName}
            </span>
          </Link>
          <Badge tone={member.role === 'member' ? 'neutral' : 'green'}>
            {t(`groups.roles.${member.role}`)}
          </Badge>
        </Card>
      ))}
    </ul>
  );
}
