import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { CheckCircle2, Store, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Seo } from '@/components/seo/Seo';
import { Badge, Button, Card, EmptyState, PageSkeleton, TextField } from '@/design-system';
import { usePermissions } from '@/hooks/use-admin';
import { formatTaka, SHOP_TYPE_EMOJI, type Language } from '@/lib/mk/mk-logic';
import { mkCopy } from '@/lib/mk/mk-copy';
import * as repo from '@/lib/mk/mk-repository';
import type { MkAdminApplication, MkAdminPurchase } from '@/lib/mk/mk-types';
import { ROUTES } from '@/lib/site';
import { useAuthStore } from '@/store/auth-store';

type Queue = 'applications' | 'purchases';

/**
 * Staff review for vendor applications and credit purchases. Every decision
 * is a server-checked RPC that needs `marketplace.review`; the page only hides
 * itself from people who lack it.
 */
export default function AdminMarketplacePage() {
  const { i18n } = useTranslation();
  const language: Language = i18n.language === 'en' ? 'en' : 'bn';
  const copy = mkCopy(language);
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const { permissions, isLoading: permissionsLoading } = usePermissions();
  const canReview = permissions.includes('marketplace.review');
  const [queue, setQueue] = useState<Queue>('applications');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();

  const applications = useQuery({
    queryKey: ['mk', 'admin', 'applications', uid],
    queryFn: () => repo.listAdminApplications('submitted'),
    enabled: uid !== null && canReview && queue === 'applications',
  });
  const purchases = useQuery({
    queryKey: ['mk', 'admin', 'purchases', uid],
    queryFn: () => repo.listAdminPurchases('pending'),
    enabled: uid !== null && canReview && queue === 'purchases',
  });

  const decideApp = useMutation({
    mutationFn: (input: { id: string; decision: 'approve' | 'reject'; note: string }) =>
      repo.decideApplication(input.id, input.decision, input.note),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['mk', 'admin', 'applications'] }),
  });
  const decideBuy = useMutation({
    mutationFn: (input: { id: string; decision: 'approve' | 'reject'; note: string }) =>
      repo.decidePurchase(input.id, input.decision, input.note),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['mk', 'admin', 'purchases'] }),
  });

  if (permissionsLoading) return <PageSkeleton label={copy.loading} />;
  if (!canReview) {
    return (
      <div className="fab-container py-12">
        <EmptyState
          icon={<Store size={28} />}
          title="Access denied"
          description="You need the marketplace review permission."
        />
      </div>
    );
  }

  async function act(kind: Queue, id: string, decision: 'approve' | 'reject'): Promise<void> {
    const note = (notes[id] ?? '').trim();
    if (decision === 'reject' && note.length < 5) {
      toast.error(copy.fieldErrors.required);
      return;
    }
    try {
      if (kind === 'applications') await decideApp.mutateAsync({ id, decision, note });
      else await decideBuy.mutateAsync({ id, decision, note });
      toast.success(
        decision === 'approve' ? copy.purchaseStatus.approved : copy.purchaseStatus.rejected,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : copy.errorGeneric);
    }
  }

  const apps: MkAdminApplication[] = applications.data ?? [];
  const buys: MkAdminPurchase[] = purchases.data ?? [];

  return (
    <div className="fab-container max-w-6xl space-y-6 py-6">
      <Seo
        title="Marketplace review"
        description="Review vendor applications and credit purchases."
        path={ROUTES.admin}
        noindex
      />
      <header>
        <h1 className="text-2xl font-bold text-text">Marketplace review</h1>
        <p className="text-sm text-muted">
          Check each bKash transaction before you approve. Approving a shop makes it eligible to
          list; approving a purchase adds its orders.
        </p>
      </header>

      <div role="tablist" className="flex gap-2">
        {(['applications', 'purchases'] as const).map((id) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={queue === id}
            onClick={() => setQueue(id)}
            className={`rounded-xl border px-4 py-2 text-sm font-semibold ${queue === id ? 'border-green-700 bg-green-700 text-white' : 'border-border bg-surface'}`}
          >
            {id === 'applications'
              ? `Applications (${apps.length})`
              : `Credit purchases (${buys.length})`}
          </button>
        ))}
      </div>

      {queue === 'applications' ? (
        <ul className="grid gap-4 lg:grid-cols-2">
          {apps.length === 0 ? (
            <EmptyState
              icon={<Store size={28} />}
              title="Nothing waiting"
              description="No vendor applications are waiting for review."
            />
          ) : null}
          {apps.map((a) => (
            <li key={a.id}>
              <Card padded className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-lg font-semibold">
                      {SHOP_TYPE_EMOJI[a.vendor_type]} {a.shop_name}
                    </p>
                    <p className="text-sm text-muted">
                      {a.full_name} · {a.mobile}
                    </p>
                  </div>
                  <Badge tone="warn">{copy.underReview}</Badge>
                </div>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-xs text-muted">{copy.nid}</dt>
                    <dd className="font-mono">{a.nid_number}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">{copy.tradeLicence}</dt>
                    <dd>{a.trade_license_no || '—'}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-xs text-muted">{copy.addressLine}</dt>
                    <dd>{a.address_line}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">{copy.sender}</dt>
                    <dd className="font-mono">{a.payment_sender}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">{copy.txnId}</dt>
                    <dd className="font-mono">{a.payment_txn_id}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">{copy.holder}</dt>
                    <dd>{a.payment_holder}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">{copy.packageTitle}</dt>
                    <dd>{a.package_code}</dd>
                  </div>
                </dl>
                <a
                  className="text-xs text-green-700 hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                  href={`https://www.openstreetmap.org/?mlat=${a.lat}&mlon=${a.lng}#map=17/${a.lat}/${a.lng}`}
                >
                  {copy.openMap} · {a.place_label || `${a.lat.toFixed(4)}, ${a.lng.toFixed(4)}`}
                </a>
                <TextField
                  label="Note (required to reject)"
                  value={notes[a.id] ?? ''}
                  onChange={(e) => setNotes({ ...notes, [a.id]: e.target.value })}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    iconStart={<XCircle size={14} />}
                    onClick={() => void act('applications', a.id, 'reject')}
                  >
                    Reject
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    iconStart={<CheckCircle2 size={14} />}
                    onClick={() => void act('applications', a.id, 'approve')}
                  >
                    Approve
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {buys.length === 0 ? (
            <EmptyState
              icon={<Store size={28} />}
              title="Nothing waiting"
              description="No credit purchases are waiting for review."
            />
          ) : null}
          {buys.map((p) => (
            <li key={p.id}>
              <Card padded className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">
                    {p.orders} {copy.orders} · {formatTaka(p.price_poisha, language)}
                  </p>
                  <Badge tone="warn">{copy.purchaseStatus.pending}</Badge>
                </div>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-xs text-muted">{copy.sender}</dt>
                    <dd className="font-mono">{p.sender_number}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">{copy.txnId}</dt>
                    <dd className="font-mono">{p.txn_id}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">{copy.holder}</dt>
                    <dd>{p.account_holder}</dd>
                  </div>
                </dl>
                <TextField
                  label="Note (required to reject)"
                  value={notes[p.id] ?? ''}
                  onChange={(e) => setNotes({ ...notes, [p.id]: e.target.value })}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => void act('purchases', p.id, 'reject')}
                  >
                    Reject
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void act('purchases', p.id, 'approve')}
                  >
                    Approve
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
