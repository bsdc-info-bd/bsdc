/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { doc, updateDoc } from 'firebase/firestore';
import {
  Pin, PinOff, Star, StarOff, EyeOff, Eye, Trash2, Search, Flag, Package, Ban, Crown,
  ShieldAlert, Check, X, Gavel,
} from 'lucide-react';
import { COL, fsDb } from '@/lib/firestore';
import { resolveReport, softDeletePost, postRouteOf } from '@/lib/data';
import { useAdminData } from '@/hooks/useAdminData';
import { useAuthStore } from '@/stores/authStore';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/EmptyState';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { formatNumber, timeAgo, truncate } from '@/lib/utils';
import { useUIStore } from '@/stores/uiStore';
import type { Post } from '@/types/post';

/* ------------------------------------------------------------ CONTENT */

export function AdminContent() {
  const { t } = useTranslation();
  const language = useUIStore((s) => s.language);
  const data = useAdminData();
  const [filter, setFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const posts = useMemo(
    () =>
      data.posts
        .filter((p) => (typeFilter === 'all' ? true : p.type === typeFilter))
        .filter((p) => (filter ? `${p.title} ${p.body} ${p.authorName}`.toLowerCase().includes(filter.toLowerCase()) : true)),
    [data.posts, filter, typeFilter],
  );

  async function toggleFlag(post: Post, key: 'pinned' | 'featured') {
    await updateDoc(doc(fsDb(), COL.posts, post.id), { [key]: !post[key], updatedAt: Date.now() });
    toast.success(key === 'pinned' ? (post.pinned ? 'Unpinned' : 'Pinned') : post.featured ? 'Unfeatured' : 'Featured');
    data.refresh();
  }

  async function toggleHide(post: Post) {
    const hide = post.status !== 'hidden';
    await updateDoc(doc(fsDb(), COL.posts, post.id), { status: hide ? 'hidden' : 'published', updatedAt: Date.now() });
    toast.success(hide ? 'Post hidden' : 'Post restored');
    data.refresh();
  }

  async function remove(post: Post) {
    await softDeletePost(post.id, true);
    toast.success('Post deleted (soft — recoverable)');
    data.refresh();
  }

  if (data.loading) return <Skeleton className="h-96" />;
  if (data.error) return <ErrorState message={data.error} onRetry={data.refresh} />;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-extrabold sm:text-xl">{t('admin.content')} <span className="text-sm font-medium text-neutral-400">({formatNumber(posts.length)})</span></h1>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" aria-hidden />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search posts…" aria-label={t('common.search')} className="bsdc-input pl-9" />
        </div>
        <Select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          options={[{ value: 'all', label: `${t('common.all')} types` }, ...['text', 'image', 'blog', 'qa', 'snippet', 'docs', 'wiki', 'project', 'job', 'notice', 'poll'].map((tp) => ({ value: tp, label: tp }))]}
          className="sm:w-40"
        />
      </div>

      {posts.length === 0 ? (
        <p className="bsdc-surface p-10 text-center text-sm text-neutral-400">{t('common.noResults')}</p>
      ) : (
        <ul className="space-y-2">
          {posts.slice(0, 60).map((post) => (
            <li key={post.id} className="bsdc-surface flex flex-wrap items-center gap-3 p-3.5">
              <Avatar src={post.authorAvatar} name={post.authorName} size={36} />
              <div className="min-w-0 flex-1">
                <Link to={`/${postRouteOf(post.type)}/${post.slug}`} className="block truncate font-semibold hover:underline">
                  {post.title || truncate(post.body, 70)}
                </Link>
                <p className="truncate text-xs text-neutral-400">
                  @{post.authorUsername} · {post.type} · {timeAgo(post.createdAt, language)} · {post.reactionTotal} reactions · {post.commentCount} comments · {post.viewCount} views
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button size="xs" variant="ghost" icon={post.pinned ? <PinOff className="h-3.5 w-3.5" aria-hidden /> : <Pin className="h-3.5 w-3.5" aria-hidden />} onClick={() => void toggleFlag(post, 'pinned')}>
                  <span className="hidden min-[520px]:inline">{post.pinned ? 'Unpin' : 'Pin'}</span>
                </Button>
                <Button size="xs" variant="ghost" icon={post.featured ? <StarOff className="h-3.5 w-3.5" aria-hidden /> : <Star className="h-3.5 w-3.5" aria-hidden />} onClick={() => void toggleFlag(post, 'featured')}>
                  <span className="hidden min-[520px]:inline">{post.featured ? t('admin.unfeature') : t('admin.feature')}</span>
                </Button>
                <Button size="xs" variant="ghost" icon={post.status === 'hidden' ? <Eye className="h-3.5 w-3.5" aria-hidden /> : <EyeOff className="h-3.5 w-3.5" aria-hidden />} onClick={() => void toggleHide(post)}>
                  <span className="hidden min-[520px]:inline">{post.status === 'hidden' ? t('admin.unhide') : t('admin.hide')}</span>
                </Button>
                <Button size="xs" variant="danger" icon={<Trash2 className="h-3.5 w-3.5" aria-hidden />} onClick={() => void remove(post)}>
                  <span className="hidden min-[520px]:inline">{t('common.delete')}</span>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* -------------------------------------------------------- MODERATION */

export function AdminModeration() {
  const { t } = useTranslation();
  const language = useUIStore((s) => s.language);
  const me = useAuthStore((s) => s.profile);
  const data = useAdminData();
  const [statusFilter, setStatusFilter] = useState<'open' | 'all' | 'resolved'>('open');
  const [resolution, setResolution] = useState('');
  const [activeReport, setActiveReport] = useState<string | null>(null);

  const reports = data.reports.filter((r) => (statusFilter === 'all' ? true : statusFilter === 'open' ? r.status === 'open' : r.status !== 'open'));
  const priorityColors = { urgent: 'red', high: 'amber', normal: 'blue', low: 'neutral' } as const;

  async function resolve(id: string, status: 'resolved' | 'dismissed', note: string) {
    const report = data.reports.find((r) => r.id === id);
    if (!report || !me) return;
    await resolveReport(report, me, status, note);
    toast.success(status === 'resolved' ? t('mod.resolve') : t('mod.dismiss'));
    data.refresh();
  }

  async function warnReporter(reportId: string) {
    const report = data.reports.find((r) => r.id === reportId);
    if (!report || !me) return;
    const { pushNotification } = await import('@/lib/firestore');
    await pushNotification(report.reporterId, {
      userId: report.reporterId,
      type: 'moderation_action',
      actorId: me.uid,
      actorName: me.displayName,
      actorAvatar: me.avatar,
      title: 'Warning from BSDC moderation',
      body: 'Please review the community guidelines.',
      link: '/guidelines',
      read: false,
    });
    toast.success('Warning issued');
  }

  if (data.loading) return <Skeleton className="h-96" />;
  if (data.error) return <ErrorState message={data.error} onRetry={data.refresh} />;

  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-2 text-lg font-extrabold sm:text-xl">
        <ShieldAlert className="h-5 w-5 text-red-500" aria-hidden />
        {t('admin.moderation')} <span className="text-sm font-medium text-neutral-400">({reports.length})</span>
      </h1>

      <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'open' | 'all' | 'resolved')}>
        <div className="bsdc-surface p-2">
          <TabsList>
            <TabsTrigger value="open">{t('admin.openReports')} ({data.reports.filter((r) => r.status === 'open').length})</TabsTrigger>
            <TabsTrigger value="resolved">Handled</TabsTrigger>
            <TabsTrigger value="all">{t('common.all')}</TabsTrigger>
          </TabsList>
        </div>
      </Tabs>

      {reports.length === 0 ? (
        <p className="bsdc-surface p-10 text-center text-sm text-neutral-400">{t('admin.noReports')}</p>
      ) : (
        <ul className="space-y-2">
          {reports.map((report) => (
            <li key={report.id} className="bsdc-surface p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge color={priorityColors[report.priority]}>{report.priority}</Badge>
                <Badge>{report.targetType}</Badge>
                <Badge color={report.status === 'open' ? 'amber' : report.status === 'resolved' ? 'brand' : 'neutral'}>{report.status}</Badge>
                <span className="text-xs text-neutral-400">{timeAgo(report.createdAt, language)}</span>
              </div>
              <p className="mt-2 text-sm">
                <strong>{report.reason}</strong> — {report.targetPreview}
              </p>
              <p className="mt-1 text-xs text-neutral-400">
                Reported by {report.reporterName}
                {report.details ? ` · “${report.details}”` : ''}
              </p>
              {report.status === 'open' ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Input
                    placeholder="Resolution note…"
                    value={activeReport === report.id ? resolution : ''}
                    onChange={(e) => {
                      setActiveReport(report.id);
                      setResolution(e.target.value);
                    }}
                    className="max-w-xs"
                  />
                  <Button size="sm" icon={<Check className="h-4 w-4" aria-hidden />} onClick={() => void resolve(report.id, 'resolved', resolution)}>
                    {t('mod.resolve')}
                  </Button>
                  <Button size="sm" variant="outline" icon={<X className="h-4 w-4" aria-hidden />} onClick={() => void resolve(report.id, 'dismissed', resolution || 'No action needed')}>
                    {t('mod.dismiss')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void warnReporter(report.id)}>
                    {t('mod.warn')}
                  </Button>
                </div>
              ) : (
                <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                  {report.resolution} — handled {timeAgo(report.handledAt || report.updatedAt, language)}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------- LICENSES QUEUE */

export function AdminLicenses() {
  const { t } = useTranslation();
  const data = useAdminData();
  const language = useUIStore((s) => s.language);

  async function review(_licenseId: string, docId: string, approve: boolean) {
    const licenseNo = approve ? `BSDC-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 89999)}` : '';
    await updateDoc(doc(fsDb(), COL.licenses, docId), {
      status: approve ? 'approved' : 'rejected',
      licenseId: licenseNo,
      qrPayload: approve ? `https://www.bsdc.info.bd/license/verify/${licenseNo}` : '',
      issuedAt: approve ? Date.now() : null,
      updatedAt: Date.now(),
    }).catch(() => undefined);
    toast.success(approve ? `Approved — ${licenseNo}` : 'Rejected');
    data.refresh();
  }

  if (data.loading) return <Skeleton className="h-96" />;

  const pending = data.licenses.filter((l) => l.status === 'pending');
  const reviewed = data.licenses.filter((l) => l.status !== 'pending');

  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-2 text-lg font-extrabold sm:text-xl">
        <Package className="h-5 w-5 text-violet-500" aria-hidden />
        {t('admin.licenses')}
      </h1>

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase text-neutral-400">Pending ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="bsdc-surface p-8 text-center text-sm text-neutral-400">{t('mod.empty')}</p>
        ) : (
          <ul className="space-y-2">
            {pending.map((l) => (
              <li key={l.id} className="bsdc-surface flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{l.softwareName} <span className="font-normal text-neutral-400">v{l.version}</span></p>
                  <p className="text-xs text-neutral-400">
                    @{l.ownerUsername} · {l.licenseType} · {l.category} · applied {timeAgo(l.createdAt, language)}
                  </p>
                  {l.repoUrl ? <a href={l.repoUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-brand-600 hover:underline">{l.repoUrl}</a> : null}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" icon={<Check className="h-4 w-4" aria-hidden />} onClick={() => void review('', l.id, true)}>{t('license.approved')}</Button>
                  <Button size="sm" variant="outline" icon={<X className="h-4 w-4" aria-hidden />} onClick={() => void review('', l.id, false)}>{t('license.rejected')}</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase text-neutral-400">Issued ({reviewed.filter((l) => l.status === 'approved').length})</h2>
        <ul className="space-y-1.5">
          {reviewed.map((l) => (
            <li key={l.id} className="bsdc-surface flex flex-wrap items-center gap-2 p-3 text-sm">
              <span className="font-semibold">{l.softwareName}</span>
              <span className="font-mono text-xs text-neutral-400">{l.licenseId || '—'}</span>
              <Badge color={l.status === 'approved' ? 'brand' : l.status === 'revoked' ? 'red' : 'neutral'}>{l.status}</Badge>
              <span className="ml-auto flex gap-2">
                {l.status === 'approved' ? (
                  <Button size="xs" variant="outline" onClick={async () => { await updateDoc(doc(fsDb(), COL.licenses, l.id), { status: 'revoked', updatedAt: Date.now() }); toast.success('License revoked'); data.refresh(); }}>
                    {t('license.revoked')}
                  </Button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/* ------------------------------------------------------ CREATORS QUEUE */

export function AdminCreators() {
  const { t } = useTranslation();
  const data = useAdminData();
  const me = useAuthStore((s) => s.profile);
  const language = useUIStore((s) => s.language);

  async function review(uid: string, approve: boolean) {
    await updateDoc(doc(fsDb(), COL.users, uid), {
      isCreator: approve,
      creatorProgramStatus: approve ? 'approved' : 'rejected',
      updatedAt: Date.now(),
    });
    if (me) {
      const { pushNotification } = await import('@/lib/firestore');
      await pushNotification(uid, {
        userId: uid,
        type: 'creator_status',
        actorId: me.uid,
        actorName: me.displayName,
        actorAvatar: me.avatar,
        title: approve ? 'Welcome to the BSDC Creator Program' : 'Creator Program application update',
        body: approve ? 'Your application was approved. Enjoy your creator badge and dashboard!' : 'Your application was not approved at this time.',
        link: '/creator-program',
        read: false,
      }).catch(() => undefined);
    }
    toast.success(approve ? 'Creator approved' : 'Application rejected');
    data.refresh();
  }

  if (data.loading) return <Skeleton className="h-96" />;

  const pending = data.creators.filter((c) => c.status === 'applied');
  const approved = data.users.filter((u) => u.isCreator);

  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-2 text-lg font-extrabold sm:text-xl">
        <Crown className="h-5 w-5 text-amber-500" aria-hidden />
        {t('admin.creators')}
      </h1>

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase text-neutral-400">Applications ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="bsdc-surface p-8 text-center text-sm text-neutral-400">{t('mod.empty')}</p>
        ) : (
          <ul className="space-y-2">
            {pending.map((app) => (
              <li key={app.id} className="bsdc-surface p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Avatar name={app.displayName} size={34} />
                  <p className="font-bold">{app.legalName}</p>
                  <Badge>@{app.username}</Badge>
                  <Badge color="amber">{app.followerCount} followers</Badge>
                </div>
                <dl className="mt-2 grid gap-1 text-xs text-neutral-500 dark:text-neutral-400 sm:grid-cols-2">
                  <div>NID/Passport: {app.nationalId}</div>
                  <div>Phone: {app.phone}</div>
                  <div>Address: {app.address}</div>
                  {app.portfolioUrl ? <div><a className="text-brand-600 hover:underline" href={app.portfolioUrl} target="_blank" rel="noopener noreferrer">{app.portfolioUrl}</a></div> : null}
                </dl>
                {app.reason ? <p className="mt-2 text-sm italic">“{app.reason}”</p> : null}
                <div className="mt-3 flex gap-2">
                  <Button size="sm" icon={<Check className="h-4 w-4" aria-hidden />} onClick={() => void review(app.uid, true)}>{t('license.approved')}</Button>
                  <Button size="sm" variant="outline" icon={<X className="h-4 w-4" aria-hidden />} onClick={() => void review(app.uid, false)}>{t('license.rejected')}</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase text-neutral-400">Active creators ({approved.length})</h2>
        <ul className="space-y-1.5">
          {approved.map((u) => (
            <li key={u.uid} className="bsdc-surface flex items-center gap-2 p-3 text-sm">
              <Avatar src={u.avatar} name={u.displayName} size={30} />
              <Link to={`/p/${u.username}`} className="font-semibold hover:underline">{u.displayName}</Link>
              <span className="text-xs text-neutral-400">{u.followerCount} followers · joined {timeAgo(u.joinedAt, language)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/* ---------------------------------------------------- MARKETPLACE QUEUE */

export function AdminMarketplace() {
  const { t } = useTranslation();
  const data = useAdminData();

  async function review(docId: string, status: 'active' | 'rejected' | 'removed') {
    await updateDoc(doc(fsDb(), COL.marketplace, docId), { status, updatedAt: Date.now() });
    toast.success(`Listing ${status}`);
    data.refresh();
  }

  if (data.loading) return <Skeleton className="h-96" />;

  const pending = data.listings.filter((l) => l.status === 'pending');
  const others = data.listings.filter((l) => l.status !== 'pending');

  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-2 text-lg font-extrabold sm:text-xl">
        <Ban className="hidden" aria-hidden />
        {t('admin.marketplace')}
      </h1>
      <section>
        <h2 className="mb-2 text-sm font-bold uppercase text-neutral-400">Pending ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="bsdc-surface p-8 text-center text-sm text-neutral-400">{t('mod.empty')}</p>
        ) : (
          <ul className="space-y-2">
            {pending.map((l) => (
              <li key={l.id} className="bsdc-surface flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{l.title}</p>
                  <p className="text-xs text-neutral-400">@{l.sellerUsername} · {l.category} · {l.price} {l.currency}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" icon={<Check className="h-4 w-4" aria-hidden />} onClick={() => void review(l.id, 'active')}>{t('license.approved')}</Button>
                  <Button size="sm" variant="outline" icon={<X className="h-4 w-4" aria-hidden />} onClick={() => void review(l.id, 'rejected')}>{t('license.rejected')}</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="mb-2 text-sm font-bold uppercase text-neutral-400">All listings ({others.length})</h2>
        <ul className="space-y-1.5">
          {others.map((l) => (
            <li key={l.id} className="bsdc-surface flex flex-wrap items-center gap-2 p-3 text-sm">
              <Link to={`/marketplace/${l.id}`} className="font-semibold hover:underline">{l.title}</Link>
              <Badge color={l.status === 'active' ? 'brand' : l.status === 'sold' ? 'blue' : 'neutral'}>{l.status}</Badge>
              {l.status === 'active' ? (
                <Button size="xs" variant="outline" onClick={() => void review(l.id, 'removed')}>Remove</Button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/* -------------------------------------------------------------- MOD HOME */

export function ModHome() {
  const { t } = useTranslation();
  const data = useAdminData();
  const language = useUIStore((s) => s.language);
  const me = useAuthStore((s) => s.profile);
  const [clockedIn, setClockedIn] = useState(false);
  const [notes, setNotes] = useState('');

  const myActions = data.logs.filter((l) => l.actorId === me?.uid);
  const today = myActions.filter((l) => l.createdAt >= new Date().setHours(0, 0, 0, 0)).length;

  if (data.loading) return <Skeleton className="h-96" />;

  const openReports = data.reports.filter((r) => r.status === 'open');

  return (
    <div className="space-y-5">
      <h1 className="flex items-center gap-2 text-lg font-extrabold sm:text-xl">
        <Gavel className="h-5 w-5 text-amber-500" aria-hidden />
        {t('mod.title')}
      </h1>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: t('mod.queue'), value: openReports.length },
          { label: `${t('mod.handled')} today`, value: today },
          { label: 'Total actions', value: myActions.length },
          { label: 'Urgent open', value: openReports.filter((r) => r.priority === 'urgent').length },
        ].map((card) => (
          <div key={card.label} className="bsdc-surface p-4">
            <p className="text-2xl font-extrabold tabular-nums">{formatNumber(card.value, language)}</p>
            <p className="mt-0.5 text-xs font-semibold text-neutral-400">{card.label}</p>
          </div>
        ))}
      </div>

      <div className="bsdc-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold">{t('mod.shift')}</p>
            <p className="text-xs text-neutral-400">{clockedIn ? 'On shift — since now' : 'Off shift'}</p>
          </div>
          <Button size="sm" variant={clockedIn ? 'outline' : 'primary'} onClick={() => { setClockedIn((v) => !v); toast.success(clockedIn ? t('mod.clockOut') : t('mod.clockIn')); }}>
            {clockedIn ? t('mod.clockOut') : t('mod.clockIn')}
          </Button>
        </div>
      </div>

      <section className="bsdc-surface p-4">
        <p className="mb-2 text-sm font-bold">{t('mod.notes')}</p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Internal notes (kept locally on this device)…"
          className="bsdc-input min-h-24"
        />
      </section>

      <section className="bsdc-surface p-4">
        <p className="mb-3 text-sm font-bold">{t('mod.guidelines')}</p>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-neutral-600 dark:text-neutral-300">
          <li>Review the reported content in full context before acting.</li>
          <li>Warn first for minor first-time violations; hide content for repeat offenses.</li>
          <li>Escalate harassment, illegal content, or doxxing to admins immediately.</li>
          <li>Never moderate content you are personally involved in — escalate instead.</li>
          <li>Log a resolution note for every action — reports must always be answered.</li>
        </ol>
      </section>

      <section className="bsdc-surface p-4">
        <p className="mb-3 text-sm font-bold">{t('mod.performance')}</p>
        <ul className="space-y-1.5 text-sm">
          {myActions.slice(0, 10).map((log) => (
            <li key={log.id} className="flex items-center justify-between gap-3 border-b border-surface-light-border pb-1.5 text-xs dark:border-surface-dark-border">
              <span className="min-w-0 truncate">
                <Flag className="mr-1.5 inline h-3 w-3 text-neutral-400" aria-hidden />
                {log.action} · {log.targetPreview}
              </span>
              <span className="shrink-0 text-neutral-400">{timeAgo(log.createdAt, language)}</span>
            </li>
          ))}
          {myActions.length === 0 ? <li className="py-4 text-center text-neutral-400">{t('common.empty')}</li> : null}
        </ul>
      </section>
    </div>
  );
}
