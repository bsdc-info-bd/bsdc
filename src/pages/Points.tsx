/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowDownLeft, ArrowUpRight, QrCode, ScanLine, Send, Zap, Sparkles } from 'lucide-react';
import { getPointsHistory, levelOf, transferPoints, LEVELS } from '@/lib/points';
import { generateQrDataUrl, encodeTransferPayload } from '@/lib/qr-generator';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Avatar } from '@/components/ui/Avatar';
import { SEOHead } from '@/components/seo/SEOHead';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatNumber, timeAgo, cn } from '@/lib/utils';
import type { PointTransaction } from '@/types/domain';
import type { UserProfile } from '@/types/user';

export default function PointsWallet() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const patchProfile = useAuthStore((s) => s.patchProfile);
  const language = useUIStore((s) => s.language);
  const [history, setHistory] = useState<(PointTransaction & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [transferOpen, setTransferOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  useEffect(() => {
    if (!profile) {
      navigate('/login');
      return;
    }
    getPointsHistory(profile.uid)
      .then(setHistory)
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, [profile, navigate]);

  if (!profile) return null;
  const level = levelOf(profile.bsdcPoints);

  return (
    <>
      <SEOHead title="Points Wallet — BSDC" description="Your BSDC points balance, transfers, QR transfers and history." path="/points" noindex />
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-4 flex items-center gap-2 text-xl font-extrabold sm:text-2xl">
          <Zap className="h-6 w-6 text-brand-600" aria-hidden />
          {t('points.title')}
        </h1>

        <div className="bsdc-surface bsdc-fabric-hero overflow-hidden p-6">
          <p className="text-xs font-bold uppercase tracking-wider text-neutral-400">{t('points.balance')}</p>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="text-4xl font-extrabold tabular-nums text-brand-700 dark:text-brand-300">{formatNumber(profile.bsdcPoints, language)}</span>
            <span className="text-sm font-semibold text-neutral-400">{t('common.points')}</span>
          </p>
          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-xs font-semibold text-neutral-400">
              <span className="inline-flex items-center gap-1">
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                {level.name}
              </span>
              {level.next ? <span>{formatNumber(level.next - profile.bsdcPoints, language)} to next level</span> : <span>Max level</span>}
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800" role="progressbar" aria-valuenow={level.progress} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-brand-gradient transition-all" style={{ width: `${level.progress}%` }} />
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button size="sm" icon={<Send className="h-4 w-4" aria-hidden />} onClick={() => setTransferOpen(true)}>
              {t('points.transfer')}
            </Button>
            <Button size="sm" variant="outline" icon={<QrCode className="h-4 w-4" aria-hidden />} onClick={() => setQrOpen(true)}>
              {t('points.qr')}
            </Button>
          </div>
        </div>

        <div className="bsdc-surface mt-4 p-5">
          <p className="mb-3 text-sm font-bold">{t('points.howToEarn')}</p>
          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            {[
              [t('points.dailyLogin'), 5],
              [t('points.publishPost'), 10],
              [t('points.firstPost'), 20],
              [t('points.receiveReaction'), 2],
              [t('points.receiveComment'), 3],
              [t('points.acceptedAnswer'), 25],
              [t('points.completeProfile'), 50],
              [t('points.referral'), 100],
            ].map(([label, amount]) => (
              <li key={label as string} className="flex items-center justify-between gap-2 rounded-lg bg-neutral-50 px-3 py-2 dark:bg-surface-dark-raised">
                <span className="text-neutral-600 dark:text-neutral-300">{label}</span>
                <span className="flex shrink-0 items-center gap-1 font-bold text-brand-600 dark:text-brand-400">
                  <Zap className="h-3.5 w-3.5" aria-hidden />+{amount}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-neutral-400">
            Levels: {LEVELS.map((l) => l.name).join(' → ')}
          </p>
        </div>

        <div className="bsdc-surface mt-4 overflow-hidden">
          <p className="border-b border-surface-light-border p-4 text-sm font-bold dark:border-surface-dark-border">{t('points.history')}</p>
          {loading ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : history.length === 0 ? (
            <p className="p-8 text-center text-sm text-neutral-400">{t('common.empty')}</p>
          ) : (
            <ul className="divide-y divide-surface-light-border dark:divide-surface-dark-border">
              {history.map((tx) => {
                const incoming = tx.to === profile.uid;
                return (
                  <li key={tx.id} className="flex items-center gap-3 p-3.5">
                    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', incoming ? 'bg-green-50 text-green-600 dark:bg-green-950/50 dark:text-green-400' : 'bg-red-50 text-red-500 dark:bg-red-950/50 dark:text-red-400')}>
                      {incoming ? <ArrowDownLeft className="h-4 w-4" aria-hidden /> : <ArrowUpRight className="h-4 w-4" aria-hidden />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{tx.reason}</span>
                      <span className="block truncate text-xs text-neutral-400">
                        {incoming ? `${t('points.received')} from ${tx.fromName || 'BSDC'}` : `${t('points.sent')} to ${tx.toName || tx.to === 'platform' ? 'platform' : tx.to}`}
                        {' · '}{timeAgo(tx.createdAt, language)}
                        {tx.qrCodeUsed ? ' · QR' : ''}
                      </span>
                    </span>
                    <span className={cn('shrink-0 text-sm font-extrabold', incoming ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400')}>
                      {incoming ? '+' : '−'}{formatNumber(tx.amount, language)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <TransferModal open={transferOpen} onOpenChange={setTransferOpen} profile={profile} onSent={(amount) => patchProfile({ bsdcPoints: profile.bsdcPoints - amount })} />
      <QrTransferModal open={qrOpen} onOpenChange={setQrOpen} profile={profile} />
    </>
  );
}

function TransferModal({
  open,
  onOpenChange,
  profile,
  onSent,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  profile: UserProfile;
  onSent: (amount: number) => void;
}) {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [amount, setAmount] = useState('10');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [resolved, setResolved] = useState<{ uid: string; displayName: string; avatar: string; username: string; bsdcPoints: number } | null>(null);

  useEffect(() => {
    if (!username.trim()) {
      setResolved(null);
      return;
    }
    const timer = setTimeout(async () => {
      const { getUserByUsername } = await import('@/lib/data');
      const user = await getUserByUsername(username.replace('@', '').toLowerCase()).catch(() => null);
      setResolved(user ? { uid: user.uid, displayName: user.displayName, avatar: user.avatar, username: user.username, bsdcPoints: user.bsdcPoints } : null);
    }, 400);
    return () => clearTimeout(timer);
  }, [username]);

  async function send() {
    const value = Number(amount);
    if (!resolved) {
      toast.error('Recipient not found');
      return;
    }
    if (!Number.isInteger(value) || value <= 0) {
      toast.error(t('common.error'));
      return;
    }
    setSending(true);
    const result = await transferPoints(profile.uid, profile.displayName, resolved.uid, resolved.displayName, value, note);
    setSending(false);
    if (result.ok) {
      toast.success(t('points.transferSuccess'));
      onSent(value);
      onOpenChange(false);
      setUsername('');
      setNote('');
    } else {
      toast.error(result.error === 'Insufficient BSDC points balance' ? t('points.insufficient') : result.error);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t('points.transfer')}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button loading={sending} disabled={!resolved} icon={<Send className="h-4 w-4" aria-hidden />} onClick={() => void send()}>
            {t('points.send')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input label={t('points.transferTo')} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="@username" />
        {resolved ? (
          <div className="flex items-center gap-2.5 rounded-xl border border-brand-200 bg-brand-50/60 p-2.5 dark:border-brand-900 dark:bg-brand-950/30">
            <Avatar src={resolved.avatar} name={resolved.displayName} size={36} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold">{resolved.displayName}</span>
              <span className="block text-xs text-neutral-400">@{resolved.username} · {formatNumber(resolved.bsdcPoints)} pts</span>
            </span>
          </div>
        ) : username ? (
          <p className="text-xs text-neutral-400">Searching…</p>
        ) : null}
        <Input label={t('points.amount')} type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} hint={`Your balance: ${formatNumber(profile.bsdcPoints)}`} />
        <Input label={`${t('points.note')} (${t('common.optional')})`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={100} />
      </div>
    </Modal>
  );
}

function QrTransferModal({ open, onOpenChange, profile }: { open: boolean; onOpenChange: (o: boolean) => void; profile: UserProfile }) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState('10');
  const [note, setNote] = useState('');
  const [qr, setQr] = useState('');
  const qrRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const payload = encodeTransferPayload({
      v: 1,
      app: 'BSDC',
      type: 'points_transfer',
      fromUid: profile.uid,
      fromUsername: profile.username,
      amount: Number(amount) || 0,
      note,
      issuedAt: Date.now(),
    });
    void generateQrDataUrl(payload, 320).then(setQr);
  }, [open, amount, note, profile.uid, profile.username]);

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={t('points.qr')} description={t('points.qrDesc')}>
      <div className="flex flex-col items-center gap-4">
        <div ref={qrRef} className="rounded-2xl border-4 border-brand-100 bg-white p-3 dark:border-brand-900">
          {qr ? <img src={qr} alt="BSDC points transfer QR code" width={220} height={220} className="h-55 w-55" style={{ width: 220, height: 220 }} /> : <div className="h-55 w-55 animate-pulse bg-neutral-100" style={{ width: 220, height: 220 }} />}
        </div>
        <div className="w-full space-y-2">
          <Input label={t('points.amount')} type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Input label={`${t('points.note')} (${t('common.optional')})`} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <p className="flex items-center gap-2 text-xs text-neutral-400">
          <ScanLine className="h-4 w-4" aria-hidden />
          {t('points.scan')}
        </p>
      </div>
    </Modal>
  );
}
