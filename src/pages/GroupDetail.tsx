/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Users, Globe2, Lock, Eye, Crown, Shield, User as UserIcon, Check, LogOut, ScrollText } from 'lucide-react';
import { fetchGroupMembers, getGroupBySlug, isGroupMember, joinGroup, leaveGroup } from '@/lib/data';
import { useAuthStore } from '@/stores/authStore';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { SEOHead, Breadcrumbs } from '@/components/seo/SEOHead';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { PostList } from '@/components/feed/PostList';
import { PostComposer } from '@/components/post/PostComposer';
import { formatNumber } from '@/lib/utils';
import type { Group } from '@/types/domain';

export default function GroupDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const [group, setGroup] = useState<(Group & { id: string }) | null>(null);
  const [members, setMembers] = useState<{ userId: string; role: string; displayName: string; username: string; avatar: string }[]>([]);
  const [isMember, setIsMember] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const g = await getGroupBySlug(slug).catch(() => null);
      if (cancelled) return;
      setGroup(g);
      if (g) {
        const [list, member] = await Promise.all([
          fetchGroupMembers(g.id).catch(() => []),
          profile ? isGroupMember(g.id, profile.uid).catch(() => false) : Promise.resolve(false),
        ]);
        if (cancelled) return;
        setMembers(list);
        setIsMember(member);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, profile]);

  async function toggleMembership() {
    if (!profile) {
      navigate('/login');
      return;
    }
    if (!group) return;
    try {
      if (group.type === 'closed' && !isMember) {
        toast.success(t('groups.requestSent'));
        return;
      }
      if (isMember) {
        await leaveGroup(group.id, profile.uid);
        setIsMember(false);
        setMembers((prev) => prev.filter((m) => m.userId !== profile.uid));
        toast.success('Left the group');
      } else {
        await joinGroup(group, profile);
        setIsMember(true);
        setMembers((prev) => [...prev, { userId: profile.uid, role: 'member', displayName: profile.displayName, username: profile.username, avatar: profile.avatar }]);
        toast.success('Joined');
      }
    } catch {
      toast.error('Could not update membership');
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Skeleton className="h-44 w-full rounded-2xl" />
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (!group) {
    return <EmptyState title={t('common.notFound')} body={t('notFound.body')} action={<Link to="/groups">{t('groups.title')}</Link>} />;
  }

  const owner = members.find((m) => m.role === 'owner');

  return (
    <>
      <SEOHead
        title={`${group.name} — BSDC Groups`}
        description={group.description || `Join ${group.name} on BSDC — the Bangladesh Software Development Community.`}
        path={`/g/${group.slug}`}
      />
      <Breadcrumbs items={[{ name: 'BSDC', path: '/' }, { name: t('groups.title'), path: '/groups' }, { name: group.name, path: `/g/${group.slug}` }]} />
      <div className="mx-auto max-w-4xl">
        <div className="relative h-36 overflow-hidden rounded-2xl bg-brand-gradient bsdc-fabric-grid sm:h-48">
          {group.coverPhoto ? <img src={group.coverPhoto} alt={`${group.name} cover`} className="h-full w-full object-cover" loading="lazy" /> : null}
        </div>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-3 px-1">
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-2 text-xl font-extrabold sm:text-2xl">
              {group.name}
              {group.type === 'public' ? <Globe2 className="h-5 w-5 text-brand-600" aria-label="Public" /> : group.type === 'closed' ? <Lock className="h-5 w-5 text-amber-500" aria-label="Closed" /> : <Eye className="h-5 w-5 text-neutral-400" aria-label="Secret" />}
            </h1>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              {formatNumber(group.memberCount)} {t('groups.members')} · {group.category} · {t('common.by')} {owner?.displayName || group.createdByName}
            </p>
            {group.description ? <p className="mt-2 max-w-xl text-sm">{group.description}</p> : null}
          </div>
          <Button variant={isMember ? 'outline' : 'primary'} onClick={() => void toggleMembership()} icon={isMember ? <LogOut className="h-4 w-4" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}>
            {isMember ? t('common.leave') : group.type === 'closed' ? t('groups.joinRequest') : t('common.join')}
          </Button>
        </div>

        {group.rules?.length > 0 ? (
          <div className="bsdc-surface mt-4 p-4">
            <p className="mb-2 flex items-center gap-2 text-sm font-bold">
              <ScrollText className="h-4 w-4 text-brand-600" aria-hidden />
              {t('groups.rules')}
            </p>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-neutral-600 dark:text-neutral-300">
              {group.rules.map((rule, i) => (
                <li key={i}>{rule}</li>
              ))}
            </ol>
          </div>
        ) : null}

        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_260px]">
          <div className="min-w-0">
            {isMember ? <div className="mb-4"><PostComposer initialType="text" groupId={group.id} groupName={group.name} /></div> : null}
            <h2 className="mb-3 text-base font-bold">{t('groups.posts')}</h2>
            <PostList filterType={undefined} emptyTitle={t('common.empty')} emptyBody="No group posts yet." />
          </div>
          <aside aria-label={t('groups.members')}>
            <div className="bsdc-surface p-4">
              <p className="mb-3 flex items-center gap-2 text-sm font-bold">
                <Users className="h-4 w-4 text-brand-600" aria-hidden />
                {t('groups.members')}
              </p>
              <ul className="space-y-2">
                {members.slice(0, 15).map((m) => (
                  <li key={m.userId}>
                    <Link to={`/p/${m.username}`} className="flex items-center gap-2.5 rounded-lg p-1.5 hover:bg-neutral-50 dark:hover:bg-surface-dark-raised">
                      <Avatar src={m.avatar} name={m.displayName} size={32} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{m.displayName}</span>
                        <span className="block text-[11px] text-neutral-400">@{m.username}</span>
                      </span>
                      {m.role === 'owner' ? <Crown className="h-4 w-4 shrink-0 text-amber-500" aria-label={t('groups.owner')} /> : m.role === 'admin' ? <Shield className="h-4 w-4 shrink-0 text-red-500" aria-label={t('groups.admin')} /> : m.role === 'moderator' ? <Shield className="h-4 w-4 shrink-0 text-amber-500" aria-label={t('groups.moderator')} /> : <UserIcon className="h-4 w-4 shrink-0 text-neutral-300" aria-hidden />}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
