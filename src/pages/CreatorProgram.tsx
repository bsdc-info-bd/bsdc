/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { collection, doc, getDoc, addDoc } from 'firebase/firestore';
import { Crown, Star, TrendingUp, Users, Zap, Sparkles, CheckCircle2 } from 'lucide-react';
import { COL, fsDb } from '@/lib/firestore';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { SEOHead, Breadcrumbs } from '@/components/seo/SEOHead';
import { CreatorBadge } from '@/components/ui/Badge';
import { formatNumber, percent, formatDate } from '@/lib/utils';
import type { CreatorApplication, CreatorTier } from '@/types/domain';

const MILESTONES = [
  { tier: 'standard' as CreatorTier, followers: 100_000, label: '100K' },
  { tier: 'enhanced' as CreatorTier, followers: 1_000_000, label: '1M' },
  { tier: 'elite' as CreatorTier, followers: 10_000_000, label: '10M' },
];

export default function CreatorProgram() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const [application, setApplication] = useState<CreatorApplication | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) {
      setLoading(false);
      return;
    }
    getDoc(doc(fsDb(), COL.creatorApplications, profile.uid))
      .then((snap) => setApplication(snap.exists() ? ({ ...snap.data(), uid: profile.uid } as CreatorApplication) : null))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [profile]);

  const followers = profile?.followerCount || 0;
  const nextMilestone = MILESTONES.find((m) => followers < m.followers) || null;
  const eligible = nextMilestone ? false : followers >= 100_000;
  const tier: CreatorTier = followers >= 10_000_000 ? 'elite' : followers >= 1_000_000 ? 'enhanced' : followers >= 100_000 ? 'standard' : 'none';

  return (
    <>
      <SEOHead title="BSDC Creator Program" description="Reach 100,000 followers and join the BSDC Creator Program — enhanced tools, priority feed placement and creator analytics." path="/creator-program" />
      <div className="mx-auto max-w-2xl">
        <Breadcrumbs items={[{ name: 'BSDC', path: '/' }, { name: t('creator.title'), path: '/creator-program' }]} />

        <div className="bsdc-surface bsdc-fabric-hero overflow-hidden p-6 text-center sm:p-8">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-raised">
            <Crown className="h-8 w-8" aria-hidden />
          </span>
          <h1 className="mt-4 text-2xl font-extrabold">{t('creator.title')}</h1>
          <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">{t('creator.subtitle')}</p>

          <div className="mx-auto mt-6 max-w-md">
            <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-neutral-400">
              <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" aria-hidden />{formatNumber(followers)} {t('profile.followers')}</span>
              <span>{t('creator.progress')} {nextMilestone ? `${percent(followers, nextMilestone.followers)}% → ${nextMilestone.label}` : '100%'}</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800" role="progressbar" aria-valuenow={percent(followers, 100_000)} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500" style={{ width: `${Math.min(100, percent(followers, nextMilestone?.followers || 100_000))}%` }} />
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-neutral-400">
              {MILESTONES.map((m) => (
                <span key={m.tier} className={followers >= m.followers ? 'font-bold text-amber-500' : ''}>
                  {m.label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Status card */}
        {profile ? (
          <div className="bsdc-surface mt-4 p-5">
            {loading ? (
              <p className="text-sm text-neutral-400">{t('common.loading')}</p>
            ) : application?.status === 'approved' || profile.isCreator ? (
              <div className="flex items-center gap-3">
                <CreatorBadge />
                <div>
                  <p className="font-bold">{t('creator.approvedTitle')}</p>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    {tier === 'elite' ? t('creator.tierElite') : tier === 'enhanced' ? t('creator.tierEnhanced') : t('creator.tierStandard')} · 2x feed ranking boost
                  </p>
                </div>
              </div>
            ) : application?.status === 'applied' ? (
              <p className="flex items-center gap-2 text-sm font-semibold text-amber-600 dark:text-amber-400">
                <Sparkles className="h-4 w-4" aria-hidden />
                {t('creator.underReview')} — applied {formatDate(application.createdAt)}
              </p>
            ) : eligible ? (
              <div className="text-center">
                <p className="font-bold text-brand-600 dark:text-brand-400">{t('creator.eligible')}</p>
                <Button className="mt-3" icon={<Star className="h-4 w-4" aria-hidden />} onClick={() => setApplyOpen(true)}>
                  {t('creator.apply')}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                {t('creator.subtitle')}
              </p>
            )}
          </div>
        ) : (
          <div className="bsdc-surface mt-4 p-5 text-center">
            <Button onClick={() => navigate('/login')}>{t('common.login')}</Button>
          </div>
        )}

        {/* Perks */}
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {[
            { icon: TrendingUp, title: 'Priority in feed', body: 'Creator posts receive a 2x ranking multiplier in the For You algorithm.' },
            { icon: Zap, title: 'Creator dashboard', body: 'Content performance analytics, follower growth charts and reach metrics.' },
            { icon: Star, title: 'Verified-style badge', body: 'A distinctive gold Creator badge across the platform.' },
            { icon: CheckCircle2, title: 'Direct channel', body: 'A direct communication line with the BSDC management team.' },
          ].map((perk) => (
            <div key={perk.title} className="bsdc-surface p-4">
              <perk.icon className="h-5 w-5 text-amber-500" aria-hidden />
              <p className="mt-2 font-bold">{perk.title}</p>
              <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{perk.body}</p>
            </div>
          ))}
        </div>
      </div>

      <ApplyModal open={applyOpen} onOpenChange={setApplyOpen} />
    </>
  );
}

function ApplyModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const [legalName, setLegalName] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [reason, setReason] = useState('');
  const [agree, setAgree] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!profile) {
      navigate('/login');
      return;
    }
    if (!legalName.trim() || !nationalId.trim() || !phone.trim() || !address.trim() || !agree) {
      toast.error('Please complete all required fields and accept the terms');
      return;
    }
    setSaving(true);
    try {
      const now = Date.now();
      await addDoc(collection(fsDb(), COL.creatorApplications), {
        uid: profile.uid,
        displayName: profile.displayName,
        username: profile.username,
        email: profile.email,
        legalName,
        nationalId,
        phone,
        address,
        portfolioUrl,
        reason,
        followerCount: profile.followerCount,
        tier: 'standard',
        status: 'applied',
        reviewNote: '',
        reviewedBy: '',
        reviewedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      toast.success(t('creator.submitted'));
      onOpenChange(false);
      window.location.reload();
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
      title={t('creator.apply')}
      description="The BSDC management team reviews every application."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button loading={saving} onClick={() => void submit()}>{t('common.submit')}</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input label={t('creator.legalName')} value={legalName} onChange={(e) => setLegalName(e.target.value)} />
        <Input label={t('creator.nationalId')} value={nationalId} onChange={(e) => setNationalId(e.target.value)} />
        <Input label={t('creator.phone')} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+880…" />
        <Textarea label={t('creator.address')} value={address} onChange={(e) => setAddress(e.target.value)} minRows={2} />
        <Input label={t('creator.portfolio')} value={portfolioUrl} onChange={(e) => setPortfolioUrl(e.target.value)} placeholder="https://…" />
        <Textarea label={t('creator.reason')} value={reason} onChange={(e) => setReason(e.target.value)} minRows={3} />
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-600" />
          {t('creator.agree')}
        </label>
      </div>
    </Modal>
  );
}
