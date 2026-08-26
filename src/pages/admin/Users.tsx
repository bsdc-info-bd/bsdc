/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  createColumnHelper, flexRender, getCoreRowModel, getPaginationRowModel, getSortedRowModel,
  useReactTable, type SortingState,
} from '@tanstack/react-table';
import { doc, updateDoc, addDoc, collection } from 'firebase/firestore';
import {
  ArrowUpDown, ChevronLeft, ChevronRight, Search, Ban, BadgeCheck, Zap, Radio,
  KeyRound, Download,
} from 'lucide-react';
import { COL, fsDb } from '@/lib/firestore';
import { grantPoints } from '@/lib/points';
import { useAdminData } from '@/hooks/useAdminData';
import { useAuthStore } from '@/stores/authStore';
import { Avatar } from '@/components/ui/Avatar';
import { VerifiedBadge, RoleBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/EmptyState';
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from '@/components/ui/Dropdown';
import { Modal } from '@/components/ui/Modal';
import { formatDate, formatNumber, downloadBlob } from '@/lib/utils';
import type { UserProfile, UserRole } from '@/types/user';

const columnHelper = createColumnHelper<UserProfile>();

const ROLES: UserRole[] = ['superadmin', 'admin', 'manager', 'moderator', 'verified', 'user', 'restricted', 'banned'];

export default function AdminUsers() {
  const { t } = useTranslation();
  const me = useAuthStore((s) => s.profile);
  const data = useAdminData();
  const [filter, setFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pointsTarget, setPointsTarget] = useState<UserProfile | null>(null);
  const [pointsAmount, setPointsAmount] = useState('100');
  const [pointsReason, setPointsReason] = useState('Bonus for community contribution');
  const [notifyTarget, setNotifyTarget] = useState<UserProfile | null>(null);
  const [notifyTitle, setNotifyTitle] = useState('');
  const [notifyBody, setNotifyBody] = useState('');

  const users = useMemo(
    () =>
      data.users
        .filter((u) => (roleFilter === 'all' ? true : u.role === roleFilter))
        .filter((u) => (filter ? `${u.displayName} ${u.username} ${u.email}`.toLowerCase().includes(filter.toLowerCase()) : true)),
    [data.users, filter, roleFilter],
  );

  async function logAdmin(action: string, targetType: string, targetId: string, preview: string) {
    if (!me) return;
    await addDoc(collection(fsDb(), COL.adminLogs), {
      actorId: me.uid,
      actorName: me.displayName,
      action,
      targetType,
      targetId,
      targetPreview: preview,
      reason: '',
      severity: 'warning',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }).catch(() => undefined);
  }

  async function setRole(user: UserProfile, role: UserRole) {
    await updateDoc(doc(fsDb(), COL.users, user.uid), { role, updatedAt: Date.now() });
    await logAdmin('role_change', 'user', user.uid, `${user.username} → ${role}`);
    toast.success(`@${user.username} is now ${role}`);
    data.refresh();
  }

  async function toggleVerify(user: UserProfile) {
    await updateDoc(doc(fsDb(), COL.users, user.uid), { isVerified: !user.isVerified, updatedAt: Date.now() });
    await logAdmin('verify_toggle', 'user', user.uid, `${user.username} ${user.isVerified ? 'unverified' : 'verified'}`);
    toast.success(user.isVerified ? 'Verification removed' : 'User verified');
    data.refresh();
  }

  async function banUser(user: UserProfile) {
    const ban = user.role !== 'banned';
    await updateDoc(doc(fsDb(), COL.users, user.uid), { role: ban ? 'banned' : 'user', updatedAt: Date.now() });
    await logAdmin(ban ? 'ban' : 'unban', 'user', user.uid, user.username);
    toast.success(ban ? `@${user.username} banned` : `@${user.username} unbanned`);
    data.refresh();
  }

  async function sendGrant() {
    if (!me || !pointsTarget) return;
    await grantPoints(me.uid, me.displayName, pointsTarget.uid, Number(pointsAmount) || 0, pointsReason);
    await logAdmin('points_grant', 'user', pointsTarget.uid, `${pointsAmount} pts`);
    toast.success('Points granted');
    setPointsTarget(null);
    data.refresh();
  }

  async function sendNotification() {
    if (!me || !notifyTarget || !notifyTitle.trim()) return;
    const { pushNotification } = await import('@/lib/firestore');
    await pushNotification(notifyTarget.uid, {
      userId: notifyTarget.uid,
      type: 'admin_announcement',
      actorId: me.uid,
      actorName: me.displayName,
      actorAvatar: me.avatar,
      title: notifyTitle,
      body: notifyBody,
      link: '/',
      read: false,
    });
    toast.success('Notification sent');
    setNotifyTarget(null);
    setNotifyTitle('');
    setNotifyBody('');
  }

  function exportCsv() {
    const rows = users.map((u) => ({
      uid: u.uid, username: u.username, displayName: u.displayName, email: u.email, role: u.role,
      verified: u.isVerified, followers: u.followerCount, posts: u.postCount, points: u.bsdcPoints,
      joined: new Date(u.joinedAt).toISOString(), provider: u.provider,
    }));
    const header = Object.keys(rows[0] || { uid: '' }).join(',');
    const csv = [header, ...rows.map((r) => Object.values(r).map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
    downloadBlob(new Blob([csv], { type: 'text/csv' }), 'bsdc-users.csv');
    toast.success('CSV exported');
  }

  const columns = useMemo(
    () => [
      columnHelper.accessor('displayName', {
        header: 'Member',
        cell: (info) => (
          <Link to={`/p/${info.row.original.username}`} className="flex items-center gap-2.5 hover:underline">
            <Avatar src={info.row.original.avatar} name={info.getValue()} size={32} />
            <span className="min-w-0">
              <span className="flex items-center gap-1">
                <span className="truncate font-semibold">{info.getValue()}</span>
                {info.row.original.isVerified ? <VerifiedBadge size={12} /> : null}
              </span>
              <span className="block truncate text-xs text-neutral-400">@{info.row.original.username}</span>
            </span>
          </Link>
        ),
      }),
      columnHelper.accessor('role', {
        header: 'Role',
        cell: (info) => <RoleBadge role={info.getValue()} />,
      }),
      columnHelper.accessor('followerCount', {
        header: 'Followers',
        cell: (info) => <span className="tabular-nums">{formatNumber(info.getValue())}</span>,
      }),
      columnHelper.accessor('postCount', {
        header: 'Posts',
        cell: (info) => <span className="tabular-nums">{formatNumber(info.getValue())}</span>,
      }),
      columnHelper.accessor('bsdcPoints', {
        header: 'Points',
        cell: (info) => <span className="tabular-nums font-bold text-brand-600 dark:text-brand-400">{formatNumber(info.getValue())}</span>,
      }),
      columnHelper.accessor('joinedAt', {
        header: 'Joined',
        cell: (info) => <span className="text-xs text-neutral-400">{formatDate(info.getValue(), 'MMM D, YYYY')}</span>,
      }),
      columnHelper.display({
        id: 'actions',
        header: '',
        cell: (info) => {
          const user = info.row.original;
          return (
            <Dropdown>
              <DropdownTrigger asChild>
                <button type="button" aria-label={`${t('common.more')} ${user.username}`} className="bsdc-tap rounded-lg px-2 py-1.5 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-surface-dark-raised">
                  <KeyRound className="h-4 w-4" aria-hidden />
                </button>
              </DropdownTrigger>
              <DropdownContent>
                <DropdownLabelRow user={user} />
                <DropdownItem icon={<BadgeCheck className="h-4 w-4" aria-hidden />} onSelect={() => void toggleVerify(user)}>
                  {user.isVerified ? t('admin.unverify') : t('admin.verify')}
                </DropdownItem>
                <DropdownItem icon={<Zap className="h-4 w-4" aria-hidden />} onSelect={() => setPointsTarget(user)}>
                  {t('admin.grantPoints')}
                </DropdownItem>
                <DropdownItem icon={<Radio className="h-4 w-4" aria-hidden />} onSelect={() => setNotifyTarget(user)}>
                  {t('admin.sendNotification')}
                </DropdownItem>
                <DropdownSeparator />
                <div className="px-3 py-1">
                  <p className="mb-1 text-[10px] font-bold uppercase text-neutral-400">{t('admin.changeRole')}</p>
                  <div className="flex flex-wrap gap-1">
                    {ROLES.map((role) => (
                      <button
                        key={role}
                        type="button"
                        onClick={() => void setRole(user, role)}
                        disabled={role === 'superadmin' && me?.role !== 'superadmin'}
                        className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${user.role === role ? 'bg-brand-600 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 disabled:opacity-40 dark:bg-neutral-800 dark:text-neutral-300'}`}
                      >
                        {role}
                      </button>
                    ))}
                  </div>
                </div>
                <DropdownSeparator />
                <DropdownItem danger icon={<Ban className="h-4 w-4" aria-hidden />} onSelect={() => void banUser(user)}>
                  {user.role === 'banned' ? 'Unban' : t('admin.ban')}
                </DropdownItem>
              </DropdownContent>
            </Dropdown>
          );
        },
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [me?.role, data],
  );

  const table = useReactTable({
    data: users,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 15 } },
  });

  if (data.loading) return <Skeleton className="h-96" />;
  if (data.error) return <ErrorState message={data.error} onRetry={data.refresh} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-extrabold sm:text-xl">{t('admin.users')} <span className="text-sm font-medium text-neutral-400">({formatNumber(users.length)})</span></h1>
        <Button size="sm" variant="outline" icon={<Download className="h-4 w-4" aria-hidden />} onClick={exportCsv}>
          {t('admin.exportCsv')}
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" aria-hidden />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search by name, username, email…" aria-label={t('common.search')} className="bsdc-input pl-9" />
        </div>
        <Select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          options={[{ value: 'all', label: `${t('common.all')} ${t('admin.users')}` }, ...ROLES.map((r) => ({ value: r, label: r }))]}
          className="sm:w-44"
        />
      </div>

      <div className="bsdc-surface overflow-hidden">
        <div className="bsdc-table-card">
          <table className="w-full text-sm">
            <thead className="border-b border-surface-light-border bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500 dark:border-surface-dark-border dark:bg-surface-dark-raised">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((header) => (
                    <th key={header.id} className="whitespace-nowrap px-3 py-3 font-bold">
                      {header.isPlaceholder ? null : (
                        <button type="button" className="inline-flex items-center gap-1" onClick={header.column.getToggleSortingHandler()}>
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getCanSort() ? <ArrowUpDown className="h-3 w-3 opacity-50" aria-hidden /> : null}
                        </button>
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-surface-light-border dark:divide-surface-dark-border">
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="p-8 text-center text-neutral-400">
                    {t('common.noResults')}
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="hover:bg-neutral-50 dark:hover:bg-surface-dark-raised/50">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-3 py-2.5">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-surface-light-border p-3 text-sm dark:border-surface-dark-border">
          <span className="text-xs text-neutral-400">
            Page {table.getState().pagination.pageIndex + 1} of {Math.max(1, table.getPageCount())}
          </span>
          <div className="flex gap-1.5">
            <Button size="xs" variant="outline" icon={<ChevronLeft className="h-3.5 w-3.5" aria-hidden />} onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
              Prev
            </Button>
            <Button size="xs" variant="outline" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
              Next <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </div>
        </div>
      </div>

      {/* Grant points modal */}
      <Modal
        open={pointsTarget !== null}
        onOpenChange={(o) => !o && setPointsTarget(null)}
        title={`${t('admin.grantPoints')} — @${pointsTarget?.username || ''}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPointsTarget(null)}>{t('common.cancel')}</Button>
            <Button onClick={() => void sendGrant()}>{t('common.submit')}</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input label={t('points.amount')} type="number" value={pointsAmount} onChange={(e) => setPointsAmount(e.target.value)} />
          <Input label="Reason" value={pointsReason} onChange={(e) => setPointsReason(e.target.value)} />
        </div>
      </Modal>

      {/* Direct notification modal */}
      <Modal
        open={notifyTarget !== null}
        onOpenChange={(o) => !o && setNotifyTarget(null)}
        title={`${t('admin.sendNotification')} — @${notifyTarget?.username || ''}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setNotifyTarget(null)}>{t('common.cancel')}</Button>
            <Button onClick={() => void sendNotification()}>{t('common.send')}</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input label={t('common.title')} value={notifyTitle} onChange={(e) => setNotifyTitle(e.target.value)} />
          <Input label="Body" value={notifyBody} onChange={(e) => setNotifyBody(e.target.value)} />
        </div>
      </Modal>
    </div>
  );
}

function DropdownLabelRow({ user }: { user: UserProfile }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <Avatar src={user.avatar} name={user.displayName} size={32} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold">{user.displayName}</span>
        <span className="block truncate text-xs text-neutral-400">{user.email}</span>
      </span>
    </div>
  );
}
