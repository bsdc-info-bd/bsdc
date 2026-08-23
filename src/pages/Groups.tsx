/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Users, Lock, Eye, Plus, Globe2 } from 'lucide-react';
import { createGroup, fetchGroups, getGroupBySlug } from '@/lib/data';
import type { Group } from '@/types/domain';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { ImageUploader } from '@/components/ui/ImageUploader';
import { Modal } from '@/components/ui/Modal';
import { SEOHead, Breadcrumbs } from '@/components/seo/SEOHead';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { GROUP_CATEGORIES } from '@/config/constants';
import { formatNumber } from '@/lib/utils';

export default function Groups() {
  const { t } = useTranslation();
  const [groups, setGroups] = useState<(Group & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchGroups()
      .then((list) => !cancelled && setGroups(list))
      .catch(() => !cancelled && setGroups([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <SEOHead title="Developer Groups — BSDC" description="Join Bangladeshi developer communities by technology, city and interest." path="/groups" />
      <div className="mx-auto max-w-4xl">
        <Breadcrumbs items={[{ name: 'BSDC', path: '/' }, { name: t('groups.title'), path: '/groups' }]} />
        <div className="mb-4 flex items-center justify-between gap-2">
          <h1 className="flex items-center gap-2 text-xl font-extrabold sm:text-2xl">
            <Users className="h-6 w-6 text-brand-600" aria-hidden />
            {t('groups.title')}
          </h1>
          <Button size="sm" icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setCreateOpen(true)}>
            <span className="hidden min-[420px]:inline">{t('groups.create')}</span>
          </Button>
        </div>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-44" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <EmptyState title={t('groups.empty')} body={t('groups.emptyBody')} icon={<Users className="h-16 w-16" aria-hidden />} action={<Button onClick={() => setCreateOpen(true)}>{t('groups.create')}</Button>} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {groups.map((group) => (
              <Link key={group.id} to={`/g/${group.slug}`} className="bsdc-surface bsdc-fabric-card-hover group overflow-hidden">
                <div className="h-24 bg-brand-gradient bsdc-fabric-grid">
                  {group.coverPhoto ? <img src={group.coverPhoto} alt={`${group.name} cover`} className="h-full w-full object-cover" loading="lazy" /> : null}
                </div>
                <div className="p-4">
                  <p className="flex items-center gap-2 font-bold">
                    <span className="truncate">{group.name}</span>
                    <span className="shrink-0">
                      {group.type === 'public' ? <Globe2 className="h-3.5 w-3.5 text-brand-600" aria-label="Public group" /> : group.type === 'closed' ? <Lock className="h-3.5 w-3.5 text-amber-500" aria-label="Closed group" /> : <Eye className="h-3.5 w-3.5 text-neutral-400" aria-label="Secret group" />}
                    </span>
                  </p>
                  <p className="mt-1 line-clamp-2 text-sm text-neutral-500 dark:text-neutral-400">{group.description}</p>
                  <p className="mt-2 text-xs font-semibold text-neutral-400">
                    {formatNumber(group.memberCount)} {t('groups.members')} · {group.category}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
      <CreateGroupModal open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}

function CreateGroupModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'public' | 'closed' | 'secret'>('public');
  const [category, setCategory] = useState<string>(GROUP_CATEGORIES[0]);
  const [cover, setCover] = useState<{ url: string; name: string }[]>([]);
  const [rules, setRules] = useState('');
  const [saving, setSaving] = useState(false);

  async function create() {
    if (!profile) {
      navigate('/login');
      return;
    }
    if (name.trim().length < 3) {
      toast.error('Group name must be at least 3 characters');
      return;
    }
    setSaving(true);
    try {
      const id = await createGroup(profile, name.trim(), description, type, category, cover[0]?.url || '', rules.split('\n').map((r) => r.trim()).filter(Boolean));
      toast.success('Group created');
      onOpenChange(false);
      const created = await getGroupBySlug(`${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`);
      if (created || id) navigate(`/g/${created?.slug || id}`);
    } catch {
      toast.error('Could not create group');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t('groups.create')}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button loading={saving} onClick={() => void create()}>{t('common.create')}</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input label={t('groups.name')} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        <Textarea label={t('groups.description')} value={description} onChange={(e) => setDescription(e.target.value)} maxRows={4} />
        <Select
          label={t('groups.type')}
          value={type}
          onChange={(e) => setType(e.target.value as 'public' | 'closed' | 'secret')}
          options={[
            { value: 'public', label: t('groups.public') },
            { value: 'closed', label: t('groups.closed') },
            { value: 'secret', label: t('groups.secret') },
          ]}
        />
        <Select label={t('groups.category')} value={category} onChange={(e) => setCategory(e.target.value)} options={GROUP_CATEGORIES.map((c) => ({ value: c, label: c }))} />
        <Textarea label={t('groups.rules')} value={rules} onChange={(e) => setRules(e.target.value)} hint="One rule per line" maxRows={4} />
        <ImageUploader single images={cover} onChange={setCover} folder="bsdc/groups" compact />
      </div>
    </Modal>
  );
}
