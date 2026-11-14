import { CreditCard, ImageUp, Save, ShieldCheck, Store } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert, Badge, Button, Card, TextField, TextareaField } from '@/design-system';
import { useBuyCredits, usePaymentInstructions, useUpdateShopProfile } from '@/hooks/use-mk';
import { formatTaka, isBdMobile, isHttpsUrl, isTxnId, normaliseBdMobile, type Language } from '@/lib/mk/mk-logic';
import type { MkCopy } from '@/lib/mk/mk-copy';
import type { MkVendorShop, MkPurchase } from '@/lib/mk/mk-types';

interface ShopProps {
  copy: MkCopy;
  shop: MkVendorShop;
}

export function ShopProfilePanel({ copy, shop }: ShopProps) {
  const update = useUpdateShopProfile();
  const [description, setDescription] = useState(shop.description);
  const [logo, setLogo] = useState(shop.logo_url);
  const [cover, setCover] = useState(shop.cover_url);
  const [mobile, setMobile] = useState(shop.mobile);
  const [uploading, setUploading] = useState<'logo' | 'cover' | null>(null);

  async function upload(file: File | undefined, which: 'logo' | 'cover'): Promise<void> {
    if (!file) return;
    setUploading(which);
    try {
      const { uploadMedia } = await import('@/lib/storage/upload');
      const result = await uploadMedia(file, { purpose: which === 'logo' ? 'avatar' : 'cover' });
      if (which === 'logo') setLogo(result.url);
      else setCover(result.url);
    } catch {
      toast.error(copy.errorGeneric);
    } finally {
      setUploading(null);
    }
  }

  async function save(): Promise<void> {
    if (!isBdMobile(mobile)) {
      toast.error(copy.fieldErrors.mobile_invalid);
      return;
    }
    if ((logo && !isHttpsUrl(logo)) || (cover && !isHttpsUrl(cover))) {
      toast.error(copy.fieldErrors.required);
      return;
    }
    try {
      await update.mutateAsync({
        description: description.trim(),
        logo_url: logo,
        cover_url: cover,
        mobile: normaliseBdMobile(mobile),
      });
      toast.success(copy.saved);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : copy.errorGeneric);
    }
  }

  return (
    <section aria-labelledby="shop-h" className="space-y-5">
      <h2 id="shop-h" className="text-lg font-semibold text-text">{copy.shopProfile}</h2>

      <div className="overflow-hidden rounded-3xl border border-border bg-surface shadow-sm">
        <div className="relative h-40 bg-gradient-to-br from-green-700 to-green-500 sm:h-52">
          {cover ? <img src={cover} alt="" className="h-full w-full object-cover" /> : null}
          <label className="absolute right-3 top-3 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-black/50 px-3 py-1.5 text-xs font-medium text-white backdrop-blur hover:bg-black/70">
            <ImageUp size={14} aria-hidden /> {copy.coverUrl}
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => void upload(e.target.files?.[0], 'cover')} />
          </label>
          {uploading === 'cover' ? <div className="absolute inset-0 animate-pulse bg-black/20" aria-hidden /> : null}
        </div>
        <div className="flex items-end gap-4 px-5 pb-5">
          <div className="-mt-12 relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl border-4 border-surface bg-surface-2 shadow-md">
            {logo ? <img src={logo} alt="" className="h-full w-full object-cover" /> : <Store className="m-6 text-muted" aria-hidden />}
            <label className="absolute inset-x-0 bottom-0 cursor-pointer bg-black/50 py-1 text-center text-[10px] font-medium text-white">
              {copy.logoUrl}
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => void upload(e.target.files?.[0], 'logo')} />
            </label>
          </div>
          <div className="min-w-0 pb-1">
            <p className="truncate text-lg font-bold text-text">{shop.name}</p>
            <Badge tone={shop.status === 'active' ? 'green' : 'warn'}>{shop.place_label || shop.slug}</Badge>
          </div>
        </div>
      </div>

      <Card padded className="space-y-4">
        <TextareaField label={copy.description} value={description} onChange={(e) => setDescription(e.target.value)} />
        <TextField label={copy.mobile} inputMode="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label={copy.logoUrl} value={logo} onChange={(e) => setLogo(e.target.value)} />
          <TextField label={copy.coverUrl} value={cover} onChange={(e) => setCover(e.target.value)} />
        </div>
        <div className="flex justify-end">
          <Button type="button" iconStart={<Save size={16} />} loading={update.isPending} onClick={() => void save()}>
            {copy.save}
          </Button>
        </div>
      </Card>
    </section>
  );
}

interface CreditsProps {
  copy: MkCopy;
  language: Language;
  credits: number;
  purchases: MkPurchase[];
}

export function CreditsPanel({ copy, language, credits, purchases }: CreditsProps) {
  const payment = usePaymentInstructions();
  const buy = useBuyCredits();
  const [picked, setPicked] = useState<'10' | '50' | '100' | null>(null);
  const [sender, setSender] = useState('');
  const [holder, setHolder] = useState('');
  const [txn, setTxn] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (picked === null) next.pkg = copy.fieldErrors.package_missing;
    if (!isBdMobile(sender)) next.sender = copy.fieldErrors.sender_invalid;
    if (holder.trim().length < 2) next.holder = copy.fieldErrors.holder_short;
    if (!isTxnId(txn)) next.txn = copy.fieldErrors.txn_invalid;
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(): Promise<void> {
    if (!validate() || picked === null) return;
    try {
      await buy.mutateAsync({ packageCode: picked, sender: normaliseBdMobile(sender), holder: holder.trim(), txnId: txn.trim() });
      toast.success(copy.submitted);
      setPicked(null);
      setSender('');
      setHolder('');
      setTxn('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : copy.errorGeneric);
    }
  }

  const bikash = payment.data?.bikash_number ?? '';

  return (
    <section aria-labelledby="credits-h" className="space-y-5">
      <h2 id="credits-h" className="text-lg font-semibold text-text">{copy.tabs.credits}</h2>
      <Card padded className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted">{copy.creditsLeft}</p>
          <p className="text-4xl font-extrabold tabular-nums text-text">{credits}</p>
        </div>
        <ShieldCheck className="text-green-700" size={40} aria-hidden />
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        {(payment.data?.packages ?? []).map((pkg) => {
          const active = picked === pkg.code;
          return (
            <button
              key={pkg.code}
              type="button"
              aria-pressed={active}
              onClick={() => setPicked(pkg.code)}
              className={`rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 ${
                active ? 'border-green-700 bg-green-700/10 ring-2 ring-green-700/30' : 'border-border bg-surface'
              }`}
            >
              <p className="text-2xl font-bold text-text">{pkg.orders} <span className="text-sm text-muted">{copy.orders}</span></p>
              <p className="text-lg font-semibold text-green-700">{formatTaka(pkg.price_poisha, language)}</p>
            </button>
          );
        })}
      </div>
      {errors.pkg ? <p className="text-sm text-danger">{errors.pkg}</p> : null}

      {picked !== null ? (
        <Card padded className="space-y-4">
          <Alert tone="info" title={copy.paymentTitle}>
            <p className="text-sm">{copy.paymentStep2}</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span className="rounded-lg bg-surface px-3 py-1 font-mono text-lg font-bold">{bikash || '—'}</span>
              <Button type="button" variant="outline" size="sm" disabled={!bikash} onClick={() => { void navigator.clipboard?.writeText(bikash); toast.success(copy.copied); }}>
                {copy.copyNumber}
              </Button>
            </div>
          </Alert>
          <div className="grid gap-3 sm:grid-cols-3">
            <TextField label={copy.sender} inputMode="tel" value={sender} error={errors.sender} onChange={(e) => setSender(e.target.value)} />
            <TextField label={copy.holder} value={holder} error={errors.holder} onChange={(e) => setHolder(e.target.value)} />
            <TextField label={copy.txnId} value={txn} error={errors.txn} onChange={(e) => setTxn(e.target.value)} />
          </div>
          <div className="flex justify-end">
            <Button type="button" iconStart={<CreditCard size={16} />} loading={buy.isPending} onClick={() => void submit()}>
              {copy.buyCredits}
            </Button>
          </div>
        </Card>
      ) : null}

      {purchases.length > 0 ? (
        <Card padded>
          <p className="mb-3 font-semibold text-text">{copy.purchases}</p>
          <ul className="divide-y divide-border text-sm">
            {purchases.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                <span>{p.orders} {copy.orders}</span>
                <span className="text-muted">{new Date(p.created_at).toLocaleDateString(language === 'bn' ? 'bn-BD' : 'en-GB')}</span>
                <Badge tone={p.status === 'approved' ? 'green' : p.status === 'rejected' ? 'danger' : 'warn'}>
                  {copy.purchaseStatus[p.status]}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </section>
  );
}
