import { useEffect, useState } from 'react';
import { Building2, BriefcaseBusiness, Plus, Users, Globe2 } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/Button';
import { Input, Textarea, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { SEOHead } from '@/components/seo/SEOHead';
import { createOrganization, listOrganizationsForUser, type CreateOrganizationInput } from '@/lib/organizations';
import type { Organization, OrganizationType } from '@/types/domain';
import { toast } from 'sonner';

const EMPTY_FORM: CreateOrganizationInput = { name: '', type: 'organization', description: '', website: '', industry: '', size: 'small' };

export default function Organizations() {
  const profile = useAuthStore((s) => s.profile);
  const [organizations, setOrganizations] = useState<{ organization: Organization; membership: { role: string } }[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    void listOrganizationsForUser(profile.uid).then(setOrganizations).catch(() => toast.error('Could not load your workspaces')).finally(() => setLoading(false));
  }, [profile]);

  async function submit() {
    if (!profile || form.name.trim().length < 2) return;
    setSaving(true);
    try {
      const organization = await createOrganization(form, profile);
      setOrganizations((current) => [...current, { organization, membership: { role: 'owner' } }]);
      setForm(EMPTY_FORM);
      setOpen(false);
      toast.success(`${organization.name} created`);
    } catch {
      toast.error('Could not create this workspace');
    } finally {
      setSaving(false);
    }
  }

  function update<K extends keyof CreateOrganizationInput>(key: K, value: CreateOrganizationInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <>
      <SEOHead title="Organizations — BSDC" description="Manage your organization and business workspaces." path="/organizations" noindex />
      <div className="mx-auto max-w-5xl px-3 sm:px-5">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-surface-light-border pb-5 dark:border-surface-dark-border">
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-wider text-brand-600 dark:text-brand-400">Workspaces</p>
            <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Organizations & businesses</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">Create a shared home for your team, company profile, opportunities, and community presence.</p>
          </div>
          <Button icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setOpen(true)}>Create workspace</Button>
        </div>

        {loading ? <p className="py-12 text-center text-sm text-neutral-500">Loading workspaces...</p> : organizations.length === 0 ? (
          <div className="mt-8 border border-dashed border-surface-light-border px-6 py-12 text-center dark:border-surface-dark-border">
            <Building2 className="mx-auto h-9 w-9 text-brand-500" aria-hidden />
            <h2 className="mt-3 text-lg font-bold">Your team starts here</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-neutral-500">Set up an organization or business account, then invite people as admins or members.</p>
            <Button className="mt-5" variant="outline" onClick={() => setOpen(true)}>Create your first workspace</Button>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {organizations.map(({ organization, membership }) => (
              <article key={organization.id} className="border border-surface-light-border bg-white p-5 shadow-sm dark:border-surface-dark-border dark:bg-surface-dark-muted">
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-950/50 dark:text-brand-300">
                    {organization.type === 'business' ? <BriefcaseBusiness className="h-5 w-5" aria-hidden /> : <Building2 className="h-5 w-5" aria-hidden />}
                  </span>
                  <div className="min-w-0 flex-1"><h2 className="truncate text-lg font-bold">{organization.name}</h2><p className="text-xs capitalize text-neutral-500">{organization.type} · {membership.role}</p></div>
                </div>
                <p className="mt-4 min-h-10 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">{organization.description || 'No description added yet.'}</p>
                <div className="mt-5 flex flex-wrap gap-3 border-t border-surface-light-border pt-4 text-xs font-semibold text-neutral-500 dark:border-surface-dark-border dark:text-neutral-400">
                  <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" aria-hidden /> {organization.memberCount} member{organization.memberCount === 1 ? '' : 's'}</span>
                  {organization.website ? <span className="inline-flex min-w-0 items-center gap-1 truncate"><Globe2 className="h-3.5 w-3.5 shrink-0" aria-hidden /> {organization.website}</span> : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <Modal open={open} onOpenChange={setOpen} title="Create a workspace" description="Choose the account type that best describes your team.">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {(['organization', 'business'] as OrganizationType[]).map((type) => <button key={type} type="button" onClick={() => update('type', type)} className={`flex min-h-20 flex-col items-center justify-center gap-1 border p-3 text-sm font-bold ${form.type === type ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300' : 'border-surface-light-border dark:border-surface-dark-border'}`}><span className="capitalize">{type}</span><span className="text-[11px] font-normal text-neutral-500">{type === 'business' ? 'Company and services' : 'Community or nonprofit'}</span></button>)}
          </div>
          <Input label="Name" value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="e.g. BSDC Labs" required />
          <Textarea label="Description" value={form.description} onChange={(e) => update('description', e.target.value)} placeholder="What does your team do?" maxLength={500} />
          <div className="grid gap-4 sm:grid-cols-2"><Input label="Industry" value={form.industry} onChange={(e) => update('industry', e.target.value)} placeholder="Software development" /><Input label="Website" value={form.website} onChange={(e) => update('website', e.target.value)} placeholder="https://example.com" type="url" /></div>
          <Select label="Team size" value={form.size} onChange={(e) => update('size', e.target.value as CreateOrganizationInput['size'])} options={[{ value: 'solo', label: 'Solo' }, { value: 'small', label: '2-10 people' }, { value: 'medium', label: '11-50 people' }, { value: 'large', label: '51-250 people' }, { value: 'enterprise', label: '251+ people' }]} />
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button loading={saving} disabled={form.name.trim().length < 2} onClick={() => void submit()}>Create workspace</Button></div>
        </div>
      </Modal>
    </>
  );
}