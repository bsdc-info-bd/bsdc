/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { collection, addDoc, getDocs, limit as fsLimit, query as fsQuery, where as fsWhere } from 'firebase/firestore';
import {
  FileBadge, BadgeCheck, Download, ShieldCheck, Package,
} from 'lucide-react';
import { COL, fsDb } from '@/lib/firestore';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { ImageUploader } from '@/components/ui/ImageUploader';
import { Modal } from '@/components/ui/Modal';
import { SEOHead, Breadcrumbs } from '@/components/seo/SEOHead';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { LICENSE_CATEGORIES, LICENSE_TYPES, APP_URL } from '@/config/constants';
import { generateLicenseCertificate } from '@/lib/pdf-generator';
import { generateQrDataUrl } from '@/lib/qr-generator';
import { downloadBlob, formatDate } from '@/lib/utils';
import type { SoftwareLicense } from '@/types/domain';

export function LicenseHome() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const [mine, setMine] = useState<(SoftwareLicense & { id: string })[]>([]);
  const [all, setAll] = useState<(SoftwareLicense & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [registerOpen, setRegisterOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      profile
        ? getDocs(fsQuery(collection(fsDb(), COL.licenses), fsWhere('ownerId', '==', profile.uid), fsLimit(50)))
        : Promise.resolve({ docs: [] as { id: string; data: () => SoftwareLicense }[] }),
      getDocs(fsQuery(collection(fsDb(), COL.licenses), fsLimit(100))),
    ])
      .then(([mineSnap, allSnap]) => {
        if (cancelled) return;
        setMine(mineSnap.docs.map((d) => ({ ...(d.data() as Omit<SoftwareLicense, 'id'>), id: d.id })));
        setAll(allSnap.docs.map((d) => ({ ...(d.data() as Omit<SoftwareLicense, 'id'>), id: d.id })).filter((l) => l.status === 'approved'));
      })
      .catch(() => undefined)
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [profile]);

  return (
    <>
      <SEOHead title="Software License Registration — BSDC" description="Register your software and receive an official BSDC digital license certificate with QR verification." path="/license" />
      <div className="mx-auto max-w-4xl">
        <Breadcrumbs items={[{ name: 'BSDC', path: '/' }, { name: t('license.title'), path: '/license' }]} />
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h1 className="flex items-center gap-2 text-xl font-extrabold sm:text-2xl">
            <FileBadge className="h-6 w-6 text-brand-600" aria-hidden />
            {t('license.title')}
          </h1>
          <div className="flex gap-2">
            <Link to="/license/verify" className="inline-flex">
              <Button size="sm" variant="outline" icon={<ShieldCheck className="h-4 w-4" aria-hidden />}>
                {t('license.verify')}
              </Button>
            </Link>
            <Button size="sm" onClick={() => (profile ? setRegisterOpen(true) : navigate('/login'))}>
              {t('license.register')}
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        ) : (
          <>
            {profile ? (
              <section className="mb-8" aria-label="My licenses">
                <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-neutral-400">My registrations</h2>
                {mine.length === 0 ? (
                  <EmptyState title={t('license.empty')} body={t('license.emptyBody')} icon={<FileBadge className="h-14 w-14" aria-hidden />} />
                ) : (
                  <ul className="space-y-3">
                    {mine.map((license) => (
                      <LicenseRow key={license.id} license={license} />
                    ))}
                  </ul>
                )}
              </section>
            ) : null}

            <section aria-label={t('license.directory')}>
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-neutral-400">{t('license.directory')}</h2>
              {all.length === 0 ? (
                <EmptyState title={t('license.empty')} body={t('license.emptyBody')} />
              ) : (
                <ul className="space-y-3">
                  {all.map((license) => (
                    <LicenseRow key={license.id} license={license} />
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
      <RegisterLicenseModal open={registerOpen} onOpenChange={setRegisterOpen} />
    </>
  );
}

function LicenseRow({ license }: { license: SoftwareLicense & { id: string } }) {
  const { t } = useTranslation();
  const statusColors: Record<string, string> = {
    approved: 'bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-300',
    pending: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
    rejected: 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300',
    revoked: 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300',
    expired: 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400',
  };

  async function downloadCert() {
    if (license.status !== 'approved') return;
    const blob = await generateLicenseCertificate({
      licenseNo: license.licenseId,
      softwareName: license.softwareName,
      version: license.version,
      ownerName: license.ownerName,
      licenseType: license.licenseType,
      issuedAt: license.issuedAt || license.createdAt,
      verifyUrl: `${APP_URL}/license/verify/${license.licenseId}`,
      status: license.status,
    });
    downloadBlob(blob, `BSDC-License-${license.licenseId}.pdf`);
  }

  return (
    <li className="bsdc-surface flex flex-wrap items-center gap-3 p-4">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-400">
        <Package className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2">
          <Link to={`/license/verify/${license.licenseId}`} className="font-bold hover:underline">
            {license.softwareName}
          </Link>
          <span className="text-xs text-neutral-400">v{license.version}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statusColors[license.status] || ''}`}>
            {t(`license.${license.status}`)}
          </span>
        </span>
        <span className="mt-0.5 block truncate text-xs text-neutral-400">
          {license.licenseId ? `${license.licenseId} · ` : ''}
          {license.licenseType} · {license.category} · {license.ownerName}
        </span>
      </span>
      {license.status === 'approved' ? (
        <Button size="xs" variant="outline" icon={<Download className="h-3.5 w-3.5" aria-hidden />} onClick={() => void downloadCert()}>
          {t('license.downloadCert')}
        </Button>
      ) : null}
    </li>
  );
}

function RegisterLicenseModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const [softwareName, setSoftwareName] = useState('');
  const [version, setVersion] = useState('1.0.0');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>(LICENSE_CATEGORIES[0]);
  const [repoUrl, setRepoUrl] = useState('');
  const [liveUrl, setLiveUrl] = useState('');
  const [techStack, setTechStack] = useState('');
  const [licenseType, setLicenseType] = useState<string>(LICENSE_TYPES[0]);
  const [screenshots, setScreenshots] = useState<{ url: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!profile) {
      navigate('/login');
      return;
    }
    if (!softwareName.trim()) {
      toast.error(t('license.softwareName') + ' ' + t('common.required'));
      return;
    }
    setSaving(true);
    try {
      const now = Date.now();
      await addDoc(collection(fsDb(), COL.licenses), {
        ownerId: profile.uid,
        ownerName: profile.displayName,
        ownerUsername: profile.username,
        softwareName: softwareName.trim(),
        version,
        description,
        category,
        repoUrl,
        liveUrl,
        screenshots: screenshots.map((s) => s.url),
        techStack: techStack.split(',').map((s) => s.trim()).filter(Boolean),
        licenseType,
        status: 'pending',
        licenseId: '',
        qrPayload: '',
        issuedAt: null,
        reviewNote: '',
        createdAt: now,
        updatedAt: now,
      });
      toast.success(t('license.submitted'));
      onOpenChange(false);
    } catch {
      toast.error('Could not submit application');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t('license.register')}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button loading={saving} onClick={() => void submit()}>{t('license.submit')}</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input label={t('license.softwareName')} value={softwareName} onChange={(e) => setSoftwareName(e.target.value)} maxLength={80} />
        <div className="grid grid-cols-2 gap-3">
          <Input label={t('license.version')} value={version} onChange={(e) => setVersion(e.target.value)} />
          <Select label={t('license.licenseType')} value={licenseType} onChange={(e) => setLicenseType(e.target.value)} options={LICENSE_TYPES.map((l) => ({ value: l, label: l }))} />
        </div>
        <Select label={t('license.category')} value={category} onChange={(e) => setCategory(e.target.value)} options={LICENSE_CATEGORIES.map((c) => ({ value: c, label: c }))} />
        <Textarea label={t('common.description')} value={description} onChange={(e) => setDescription(e.target.value)} maxRows={4} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label={t('license.repoUrl')} value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} placeholder="https://github.com/…" />
          <Input label={t('license.liveUrl')} value={liveUrl} onChange={(e) => setLiveUrl(e.target.value)} placeholder="https://…" />
        </div>
        <Input label={t('license.techStack')} value={techStack} onChange={(e) => setTechStack(e.target.value)} hint="Comma separated" />
        <ImageUploader images={screenshots} onChange={setScreenshots} max={4} folder="bsdc/licenses" />
      </div>
    </Modal>
  );
}

export function LicenseVerify() {
  const { licenseId } = useParams<{ licenseId?: string }>();
  const { t } = useTranslation();
  const [query, setQuery] = useState(licenseId || '');
  const [result, setResult] = useState<(SoftwareLicense & { id: string }) | null | 'notfound' | null>(null);
  const [searching, setSearching] = useState(false);
  const [qr, setQr] = useState('');

  async function verify(id: string) {
    if (!id.trim()) return;
    setSearching(true);
    setResult(null);
    const snap = await getDocs(fsQuery(collection(fsDb(), COL.licenses), fsWhere('licenseId', '==', id.trim()), fsLimit(2))).catch(() => null);
    if (snap && !snap.empty) {
      const d = snap.docs[0];
      const license = { ...(d.data() as Omit<SoftwareLicense, 'id'>), id: d.id };
      setResult(license);
      void generateQrDataUrl(`${window.location.origin}/license/verify/${license.licenseId}`, 180).then(setQr);
    } else {
      setResult('notfound');
    }
    setSearching(false);
  }

  useEffect(() => {
    if (licenseId) void verify(licenseId);
  }, [licenseId]);

  return (
    <>
      <SEOHead title={`${t('license.verifyTitle')} — BSDC`} description="Verify the authenticity of a BSDC-issued software license." path="/license/verify" />
      <div className="mx-auto max-w-xl">
        <Breadcrumbs items={[{ name: 'BSDC', path: '/' }, { name: t('license.title'), path: '/license' }, { name: t('license.verify'), path: '/license/verify' }]} />
        <h1 className="mb-4 flex items-center gap-2 text-xl font-extrabold sm:text-2xl">
          <ShieldCheck className="h-6 w-6 text-brand-600" aria-hidden />
          {t('license.verifyTitle')}
        </h1>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void verify(query);
          }}
          className="bsdc-surface flex flex-col gap-2 p-4 sm:flex-row"
        >
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="BSDC-2026-XXXXX" aria-label={t('license.licenseNo')} className="flex-1" />
          <Button type="submit" loading={searching}>{t('license.verify')}</Button>
        </form>

        {searching ? <Skeleton className="mt-4 h-40" /> : null}

        {result === 'notfound' ? (
          <div className="bsdc-surface mt-4 p-6 text-center">
            <p className="text-sm font-semibold text-red-600 dark:text-red-400">{t('license.invalid')}</p>
          </div>
        ) : null}

        {result && result !== 'notfound' ? (
          <div className="bsdc-surface mt-4 overflow-hidden">
            <div className="flex items-center gap-2 bg-brand-600 px-5 py-3 text-white">
              <BadgeCheck className="h-5 w-5" aria-hidden />
              <p className="font-bold">{result.status === 'approved' ? t('license.valid') : `Status: ${result.status}`}</p>
            </div>
            <div className="grid gap-4 p-5 sm:grid-cols-[1fr_auto]">
              <dl className="space-y-2 text-sm">
                <div><dt className="text-xs font-bold uppercase text-neutral-400">{t('license.softwareName')}</dt><dd className="font-bold">{result.softwareName} <span className="font-normal text-neutral-400">v{result.version}</span></dd></div>
                <div><dt className="text-xs font-bold uppercase text-neutral-400">{t('license.owner')}</dt><dd>{result.ownerName} <Link className="text-brand-600 hover:underline" to={`/p/${result.ownerUsername}`}>@{result.ownerUsername}</Link></dd></div>
                <div><dt className="text-xs font-bold uppercase text-neutral-400">{t('license.licenseNo')}</dt><dd className="font-mono">{result.licenseId}</dd></div>
                <div><dt className="text-xs font-bold uppercase text-neutral-400">{t('license.licenseType')}</dt><dd>{result.licenseType} · {result.category}</dd></div>
                <div><dt className="text-xs font-bold uppercase text-neutral-400">{t('license.issued')}</dt><dd>{formatDate(result.issuedAt)}</dd></div>
              </dl>
              {qr ? <img src={qr} alt={`QR code for license ${result.licenseId}`} className="mx-auto h-36 w-36 rounded-xl border border-surface-light-border dark:border-surface-dark-border" /> : null}
            </div>
            <p className="border-t border-surface-light-border px-5 py-3 text-center text-xs font-semibold text-brand-600 dark:border-surface-dark-border dark:text-brand-400">
              {t('license.verifiedBy')}
            </p>
          </div>
        ) : null}
      </div>
    </>
  );
}
