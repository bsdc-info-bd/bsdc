import { Hash, Lock, Users } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { MediaImage } from '@/components/media/MediaImage';
import { ChannelManager, ChannelRowControls } from '@/components/communities/ChannelManager';
import { GroupEditDialog } from '@/components/communities/CommunityEditForm';
import { OwnerActions } from '@/components/listings/OwnerActions';
import { ShareLinkButton } from '@/components/share/ShareLinkButton';
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
import { useGroup, useGroupOwnerActions } from '@/hooks/use-communities';
import {
  closeChannel,
  createChannel,
  openChannel,
  updateChannel,
} from '@/lib/communities/community-repository';
import {
  canAdministerGroup,
  canModerateGroup,
  joinAction,
  sortMembers,
  type GroupMemberEntry,
} from '@/lib/communities/community-types';
import { formatAbsoluteDate, formatNumber } from '@/lib/format';
import { ROUTES, channelPath, groupPath, profilePath, SITE } from '@/lib/site';
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
  const ownerActions = useGroupOwnerActions();
  const isStaff = useAuthStore((state) => state.claims?.staff ?? false);
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [channelSaving, setChannelSaving] = useState(false);
  const group = detail.group;

  if (detail.isLoading) {
    return <PageSkeleton label={t('common.loading')} />;
  }

  if (detail.isError || group === null) {
    return (
      <>
        <Seo
          title={`${t('groups.notFoundTitle')} — ${t('common.brand')}`}
          description={t('groups.notFoundBody')}
          path={groupPath(slug)}
          noindex
        />
        <div className="fab-container py-10">
          <EmptyState
            icon={<Users size={22} />}
            title={t('groups.notFoundTitle')}
            description={t('groups.notFoundBody')}
          />
        </div>
      </>
    );
  }

  const action = joinAction(group, isSignedIn);
  const moderator = canModerateGroup(group.myRole);
  // What `update_group` and `delete_group` will actually allow: a moderator may
  // correct, only the owner or staff may delete. Offering edit to a moderator
  // matches the routine; `OwnerActions` still gates the delete dialog on the
  // same rule the routine applies.
  const isOwner = canAdministerGroup(group.myRole) || isStaff;
  const canEdit = canModerateGroup(group.myRole) || isStaff;
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

  async function withChannelSave(run: () => Promise<void>): Promise<void> {
    setChannelSaving(true);
    try {
      await run();
      detail.refresh();
    } catch (error) {
      toast.error(t(dataErrorKey(error)));
    } finally {
      setChannelSaving(false);
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
          <div className="flex flex-col gap-2">
            {moderator ? (
              <div className="flex justify-end">
                <ChannelManager
                  isSaving={channelSaving}
                  onCreate={(draft) =>
                    withChannelSave(() =>
                      createChannel(group.id, draft.slug, draft.name, draft.topic),
                    )
                  }
                />
              </div>
            ) : null}
            <ul className="flex flex-col gap-2">
              {detail.channels.map((channel, index) => (
                <Card as="li" key={channel.id} padded={false} className="p-3">
                  <p className="flex items-center gap-1 text-sm font-semibold">
                    <Hash size={14} aria-hidden="true" />
                    <Link to={channelPath(group.slug, channel.slug)}>{channel.name}</Link>
                    {channel.isReadOnly ? (
                      <Badge tone="neutral">{t('groups.readOnly')}</Badge>
                    ) : null}
                  </p>
                  {channel.topic.length > 0 ? (
                    <p className="mt-1 text-xs text-muted">{channel.topic}</p>
                  ) : null}
                  <p className="mt-0.5 text-xs text-muted">
                    {t('channels.posts', { count: channel.postCount })}
                  </p>
                  {moderator ? (
                    <div className="mt-2">
                      <ChannelRowControls
                        channel={channel}
                        index={index}
                        total={detail.channels.length}
                        isSaving={channelSaving}
                        onRename={(channelId, name, topic) =>
                          withChannelSave(() => updateChannel(channelId, { name, topic }))
                        }
                        onMove={(channelId, position) =>
                          withChannelSave(() => updateChannel(channelId, { position }))
                        }
                        onToggleReadOnly={(ch) =>
                          withChannelSave(() =>
                            ch.isReadOnly ? openChannel(ch.id) : closeChannel(ch.id),
                          )
                        }
                      />
                    </div>
                  ) : null}
                </Card>
              ))}
            </ul>
          </div>
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

  const isNoindex = group.privacy !== 'public' || group.isArchived;
  const groupImage =
    group.coverUrl.trim().length > 0
      ? group.coverUrl.trim()
      : group.avatarUrl.trim().length > 0
        ? group.avatarUrl.trim()
        : '';

  return (
    <>
      <Seo
        title={`${group.name} — ${t('common.brand')}`}
        description={group.description.length > 0 ? group.description : t('groups.metaDescription')}
        path={groupPath(group.slug)}
        {...(groupImage.length > 0 ? { image: groupImage } : {})}
        noindex={isNoindex}
        jsonLd={
          isNoindex
            ? []
            : [
                {
                  '@type': 'Organization',
                  name: group.name,
                  description: group.description,
                  url: `${SITE.url}${groupPath(group.slug)}`,
                  ...(groupImage.length > 0 ? { image: groupImage } : {}),
                },
              ]
        }
      />

      <div className="fab-container py-6 sm:py-10">
        <Card padded={false} className="overflow-hidden">
          {group.coverUrl.trim().length > 0 ? (
            <div className="aspect-[16/5] w-full bg-surface-2">
              <MediaImage
                src={group.coverUrl}
                alt={group.name}
                slotWidth={960}
                priority
                decoding="async"
                className="h-full w-full object-cover"
              />
            </div>
          ) : null}
          <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:p-6">
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
            <ShareLinkButton
              title={group.name}
              url={`${SITE.url}${groupPath(group.slug)}`}
              size="md"
            />
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

          {/* Correcting a group is a moderator's job on the same rule the
              routine applies; deleting it belongs to the owner. The routine
              re-checks both, so hiding is a courtesy and not the boundary. */}
          {canEdit ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 pb-4 pt-3 sm:px-6">
              <OwnerActions
                labels={{
                  edit: t('groups.manage.edit'),
                  delete: t('groups.manage.delete'),
                  deleteTitle: t('groups.manage.deleteTitle'),
                  deleteBody: t('groups.manage.deleteBody'),
                  deleteConfirm: t('groups.manage.deleteConfirm'),
                  cancel: t('common.cancel'),
                }}
                onEdit={() => {
                  setEditing(true);
                }}
                {...(isOwner
                  ? {
                      onDelete: async () => {
                        try {
                          await ownerActions.remove(group.id);
                          toast.success(t('groups.manage.deleted'));
                          navigate(ROUTES.groups);
                        } catch (error) {
                          toast.error(t(dataErrorKey(error)));
                        }
                      },
                    }
                  : {})}
                isDeleting={ownerActions.isRemoving}
              />
            </div>
          ) : null}
        </Card>

        <div className="mt-5">
          <Tabs items={items} activeId={tab} onChange={setTab} label={group.name} />
        </div>

        {canEdit ? (
          <GroupEditDialog
            open={editing}
            group={group}
            isSaving={ownerActions.isSaving}
            onClose={() => {
              setEditing(false);
            }}
            onSave={async (draft) => {
              try {
                await ownerActions.save(group.id, draft);
                setEditing(false);
                toast.success(t('groups.manage.saved'));
              } catch (error) {
                toast.error(t(dataErrorKey(error)));
              }
            }}
          />
        ) : null}
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
