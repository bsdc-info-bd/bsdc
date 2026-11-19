import { useCallback, useState, type ReactElement } from 'react';
import {
  Badge,
  Banner,
  Button,
  Card,
  Empty,
  Loading,
  TextArea,
  callRpc,
  listRpc,
  messageOf,
  useAsync,
  useCorporateEnv,
} from '@kit';
import {
  EMPTY_DECISION,
  confirmDecision,
  decisionLabel,
  decisionProblems,
  emptyQueueMessage,
  money,
  oldestFirst,
  waitingFor,
  type DecisionDraft,
  type PendingCampaignRow,
  type PendingShopRow,
} from './approvals';
import {
  LAYOUT_LABELS,
  PLACEMENT_LABELS,
  PLATFORM_LABELS,
  type AdLayout,
  type AdPlacement,
  type AdPlatform,
} from './campaigns';

interface PendingCreativePreviewRow {
  readonly creative_id: string;
  readonly placement: AdPlacement;
  readonly headline: string;
  readonly body: string;
  readonly image_url: string;
  readonly thumb_url: string;
  readonly image_alt: string;
  readonly cta_label: string;
  readonly target_url: string;
  readonly is_enabled: boolean;
  readonly layout: AdLayout;
  readonly badge_label: string;
  readonly platforms: readonly AdPlatform[];
}

/**
 * The two review queues.
 *
 * The dashboard has always counted pending shops and pending campaigns, and until
 * now that count had nowhere to go: an owner could see "2 waiting" and no screen
 * in any console could act on it. This is that screen — the read models existed
 * (`admin_pending_shops`, `admin_pending_campaigns`) and the decisions existed
 * (`decide_shop`, `decide_campaign`); only the room they belonged in was missing.
 *
 * The design principle is that a decision is deliberate: it is confirmed with the
 * name of the thing in the sentence, a refusal must carry a reason the applicant
 * will read, and the queue is worked oldest first because that is the only order
 * that is fair to the people waiting in it.
 */
export function Approvals(): ReactElement {
  return (
    <div className="kit-stack">
      <Banner tone="neutral" title="Two queues, one screen">
        <p className="kit-small">
          A shop becomes public when it is approved. An advertisement starts spending when its
          campaign is approved. Both decisions notify the owner, and both are recorded in the audit
          log with your name on them.
        </p>
      </Banner>
      <Shops />
      <Campaigns />
      <AdCreditPurchases />
      <MarketplaceCreditPurchases />
      <AdPayments />
    </div>
  );
}

function Shops(): ReactElement {
  const env = useCorporateEnv();
  const load = useCallback(
    async () =>
      oldestFirst(await listRpc<PendingShopRow>(env, 'admin_pending_shops', { p_limit: 100 })),
    [env],
  );
  const { state, reload } = useAsync(load, [env]);

  return (
    <Card
      title="Vendor applications waiting for review"
      description="Check the bKash payment before approving. Approval unlocks the shop, its products and its order credits."
      actions={
        <Button variant="quiet" size="small" onClick={reload}>
          Refresh
        </Button>
      }
    >
      {state.status === 'loading' ? <Loading label="Loading shops." /> : null}
      {state.status === 'error' ? (
        <Banner tone="bad" title="The shop queue did not load">
          <p className="kit-small">{state.message}</p>
        </Banner>
      ) : null}
      {state.status === 'ready' && state.data.length === 0 ? (
        <Empty>{emptyQueueMessage('shop')}</Empty>
      ) : null}
      {state.status === 'ready' && state.data.length > 0 ? (
        <div className="kit-stack">
          {state.data.map((shop) => (
            <ShopRow key={shop.id} shop={shop} onDecided={reload} />
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function ShopRow({
  shop,
  onDecided,
}: {
  shop: PendingShopRow;
  onDecided: () => void;
}): ReactElement {
  const env = useCorporateEnv();
  const [draft, setDraft] = useState<DecisionDraft>(EMPTY_DECISION);
  const [confirming, setConfirming] = useState<'approve' | 'refuse' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = (approve: boolean): void => {
    const problems = decisionProblems(approve, draft);
    if (problems.length > 0) {
      setError(problems[0] ?? '');
      return;
    }
    setBusy(true);
    setError('');
    callRpc(env, 'decide_shop', {
      p_shop_id: shop.id,
      p_approve: approve,
      p_reason: approve ? '' : draft.note.trim(),
    })
      .then(() => {
        setConfirming(null);
        setDraft(EMPTY_DECISION);
        onDecided();
      })
      .catch((failure: unknown) => {
        setError(messageOf(failure));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <div className="kit-card" style={{ padding: 'var(--sp-3)' }}>
      <div className="kit-row" style={{ justifyContent: 'space-between' }}>
        <div>
          <strong>{shop.name}</strong>
          <div className="kit-small kit-muted">
            {shop.tagline.length > 0 ? `${shop.tagline} · ` : ''}
            {shop.city.length > 0 ? `${shop.city} · ` : ''}
            {shop.owner_name}
            {shop.slug.length > 0 ? ` · /shop/${shop.slug}` : ''}
          </div>
          <dl
            className="kit-small"
            style={{
              margin: 'var(--sp-2) 0 0',
              display: 'grid',
              gridTemplateColumns: 'max-content 1fr',
              gap: '2px var(--sp-2)',
            }}
          >
            <dt className="kit-muted">Mobile</dt>
            <dd style={{ margin: 0 }}>{shop.mobile}</dd>
            <dt className="kit-muted">Address</dt>
            <dd style={{ margin: 0 }}>{shop.address_line}</dd>
            {shop.trade_license_no.length > 0 ? (
              <>
                <dt className="kit-muted">Trade licence</dt>
                <dd style={{ margin: 0 }}>{shop.trade_license_no}</dd>
              </>
            ) : null}
            <dt className="kit-muted">Credit package</dt>
            <dd style={{ margin: 0 }}>{shop.package_code} orders</dd>
            <dt className="kit-muted">bKash sender</dt>
            <dd style={{ margin: 0 }}>
              {shop.payment_sender} · {shop.payment_holder}
            </dd>
            <dt className="kit-muted">Transaction ID</dt>
            <dd style={{ margin: 0 }}>{shop.payment_txn_id}</dd>
          </dl>
        </div>
        <Badge tone={waitingTone(shop.created_at)}>waiting {waitingFor(shop.created_at)}</Badge>
      </div>

      {error.length > 0 ? (
        <Banner tone="bad" title="That did not work">
          <p className="kit-small">{error}</p>
        </Banner>
      ) : null}

      {confirming === null ? (
        <div className="kit-row" style={{ gap: 'var(--sp-2)' }}>
          <Button size="small" onClick={() => setConfirming('approve')}>
            Approve
          </Button>
          <Button size="small" variant="quiet" onClick={() => setConfirming('refuse')}>
            Refuse
          </Button>
        </div>
      ) : (
        <div className="kit-stack">
          <Banner tone={confirming === 'approve' ? 'warn' : 'bad'} title="Confirm">
            <p className="kit-small">
              {confirmDecision('shop', confirming === 'approve', shop.name)}
            </p>
          </Banner>
          {confirming === 'refuse' ? (
            <TextArea
              label="Why (the owner reads this)"
              value={draft.note}
              onChange={(event) => setDraft({ note: event.target.value })}
            />
          ) : null}
          <div className="kit-row" style={{ gap: 'var(--sp-2)' }}>
            <Button
              size="small"
              variant={confirming === 'approve' ? 'primary' : 'danger'}
              disabled={busy}
              onClick={() => submit(confirming === 'approve')}
            >
              {busy ? 'Working' : decisionLabel(confirming === 'approve')}
            </Button>
            <Button
              size="small"
              variant="quiet"
              disabled={busy}
              onClick={() => {
                setConfirming(null);
                setError('');
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Campaigns(): ReactElement {
  const env = useCorporateEnv();
  const load = useCallback(
    async () =>
      oldestFirst(
        await listRpc<PendingCampaignRow>(env, 'admin_pending_campaigns', { p_limit: 100 }),
      ),
    [env],
  );
  const { state, reload } = useAsync(load, [env]);

  return (
    <Card
      title="Advertisements waiting for review"
      description="A campaign cannot spend until it is approved, however it was funded."
      actions={
        <Button variant="quiet" size="small" onClick={reload}>
          Refresh
        </Button>
      }
    >
      {state.status === 'loading' ? <Loading label="Loading campaigns." /> : null}
      {state.status === 'error' ? (
        <Banner tone="bad" title="The campaign queue did not load">
          <p className="kit-small">{state.message}</p>
        </Banner>
      ) : null}
      {state.status === 'ready' && state.data.length === 0 ? (
        <Empty>{emptyQueueMessage('campaign')}</Empty>
      ) : null}
      {state.status === 'ready' && state.data.length > 0 ? (
        <div className="kit-stack">
          {state.data.map((campaign) => (
            <CampaignRow key={campaign.id} campaign={campaign} onDecided={reload} />
          ))}
        </div>
      ) : null}
    </Card>
  );
}

interface PendingAdCreditPurchaseRow {
  readonly id: string;
  readonly uid: string;
  readonly display_name: string | null;
  readonly username: string | null;
  readonly credits: number;
  readonly price_poisha: number;
  readonly sender_number: string;
  readonly txn_id: string;
  readonly status: string;
  readonly created_at: string;
}

interface PendingMarketplaceCreditPurchaseRow {
  readonly id: string;
  readonly owner_uid: string;
  readonly owner_name: string;
  readonly vendor_id: string;
  readonly vendor_name: string;
  readonly vendor_slug: string;
  readonly package_code: string;
  readonly orders: number;
  readonly price_poisha: number;
  readonly sender_number: string;
  readonly account_holder: string;
  readonly txn_id: string;
  readonly status: string;
  readonly created_at: string;
}

interface PendingAdPaymentRow {
  readonly id: string;
  readonly owner_uid: string;
  readonly campaign_id: string;
  readonly amount_poisha: number;
  readonly sender_number: string;
  readonly account_holder: string;
  readonly txn_id: string;
  readonly status: string;
  readonly created_at: string;
}

/**
 * Advertisers pay BSDC by bKash, as vendors do. Staff check the transaction
 * against the bKash statement. Approving credits the advertiser's wallet with
 * the amount paid; rejecting asks for the reason, which the advertiser sees.
 */
function AdCreditPurchases(): ReactElement {
  const env = useCorporateEnv();
  const load = useCallback(
    async () =>
      oldestFirst(
        await listRpc<PendingAdCreditPurchaseRow>(env, 'ad_credit_queue', {
          p_status: 'pending',
          p_limit: 100,
        }),
      ),
    [env],
  );
  const { state, reload } = useAsync(load, [env]);

  return (
    <Card
      title="Advertising credit purchases waiting for approval"
      description="Check the bKash transaction. Approval adds the purchased amount to the advertiser’s wallet; rejection requires a reason."
      actions={
        <Button variant="quiet" size="small" onClick={reload}>
          Refresh
        </Button>
      }
    >
      {state.status === 'loading' ? (
        <Loading label="Loading advertising credit purchases." />
      ) : null}
      {state.status === 'error' ? (
        <Banner tone="bad" title="The advertising credit queue did not load">
          <p className="kit-small">{state.message}</p>
        </Banner>
      ) : null}
      {state.status === 'ready' && state.data.length === 0 ? (
        <Empty>No advertising credit purchases are waiting for review.</Empty>
      ) : null}
      {state.status === 'ready' && state.data.length > 0 ? (
        <div className="kit-stack">
          {state.data.map((purchase) => (
            <AdCreditPurchaseRow key={purchase.id} purchase={purchase} onDecided={reload} />
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function AdCreditPurchaseRow({
  purchase,
  onDecided,
}: {
  purchase: PendingAdCreditPurchaseRow;
  onDecided: () => void;
}): ReactElement {
  const env = useCorporateEnv();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const name = purchase.display_name?.trim() || purchase.username || purchase.uid;

  const decide = (decision: 'approve' | 'reject'): void => {
    if (decision === 'reject' && note.trim().length < 5) {
      setError('Write a rejection reason of at least five characters; the advertiser will see it.');
      return;
    }
    setBusy(true);
    setError('');
    callRpc(env, 'decide_ad_credit_request', {
      p_purchase_id: purchase.id,
      p_decision: decision,
      p_note: decision === 'reject' ? note.trim() : '',
    })
      .then(() => {
        setNote('');
        onDecided();
      })
      .catch((failure: unknown) => setError(messageOf(failure)))
      .finally(() => setBusy(false));
  };

  return (
    <div className="kit-card" style={{ padding: 'var(--sp-3)' }}>
      <div className="kit-row" style={{ justifyContent: 'space-between' }}>
        <div>
          <strong>{name}</strong> · {purchase.credits.toLocaleString()} advertising credits ·{' '}
          {money(purchase.price_poisha)}
          <div className="kit-small kit-muted">
            From {purchase.sender_number} · transaction <code>{purchase.txn_id}</code>
          </div>
        </div>
        <Badge tone={waitingTone(purchase.created_at)}>
          waiting {waitingFor(purchase.created_at)}
        </Badge>
      </div>
      <div className="kit-stack" style={{ marginTop: 'var(--sp-2)' }}>
        <TextArea
          label="Reason, if you refuse"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="For example: transaction not found on the statement."
        />
        {error ? (
          <Banner tone="bad" title="Not saved">
            <p className="kit-small">{error}</p>
          </Banner>
        ) : null}
        <div className="kit-row" style={{ justifyContent: 'flex-end' }}>
          <Button variant="danger" size="small" disabled={busy} onClick={() => decide('reject')}>
            Refuse
          </Button>
          <Button size="small" disabled={busy} onClick={() => decide('approve')}>
            Approve and credit wallet
          </Button>
        </div>
      </div>
    </div>
  );
}

function MarketplaceCreditPurchases(): ReactElement {
  const env = useCorporateEnv();
  const load = useCallback(
    async () =>
      oldestFirst(
        await listRpc<PendingMarketplaceCreditPurchaseRow>(env, 'mk_admin_list_credit_purchases', {
          p_status: 'pending',
          p_limit: 100,
        }),
      ),
    [env],
  );
  const { state, reload } = useAsync(load, [env]);

  return (
    <Card
      title="Vendor order-credit purchases waiting for approval"
      description="Post-approval vendor top-ups appear here. The first package submitted with a vendor application is reviewed in the shop queue above."
      actions={
        <Button variant="quiet" size="small" onClick={reload}>
          Refresh
        </Button>
      }
    >
      {state.status === 'loading' ? (
        <Loading label="Loading vendor order-credit purchases." />
      ) : null}
      {state.status === 'error' ? (
        <Banner tone="bad" title="The vendor credit queue did not load">
          <p className="kit-small">{state.message}</p>
        </Banner>
      ) : null}
      {state.status === 'ready' && state.data.length === 0 ? (
        <Empty>No vendor order-credit purchases are waiting for review.</Empty>
      ) : null}
      {state.status === 'ready' && state.data.length > 0 ? (
        <div className="kit-stack">
          {state.data.map((purchase) => (
            <MarketplaceCreditPurchaseRow
              key={purchase.id}
              purchase={purchase}
              onDecided={reload}
            />
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function MarketplaceCreditPurchaseRow({
  purchase,
  onDecided,
}: {
  purchase: PendingMarketplaceCreditPurchaseRow;
  onDecided: () => void;
}): ReactElement {
  const env = useCorporateEnv();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const decide = (decision: 'approve' | 'reject'): void => {
    if (decision === 'reject' && note.trim().length < 5) {
      setError('Write a rejection reason of at least five characters; the vendor will see it.');
      return;
    }
    setBusy(true);
    setError('');
    callRpc(env, 'mk_admin_decide_credit_purchase', {
      p_purchase_id: purchase.id,
      p_decision: decision,
      p_note: decision === 'reject' ? note.trim() : '',
    })
      .then(() => {
        setNote('');
        onDecided();
      })
      .catch((failure: unknown) => setError(messageOf(failure)))
      .finally(() => setBusy(false));
  };

  return (
    <div className="kit-card" style={{ padding: 'var(--sp-3)' }}>
      <div className="kit-row" style={{ justifyContent: 'space-between' }}>
        <div>
          <strong>{purchase.vendor_name}</strong> · {purchase.owner_name} · {purchase.orders} order
          credits · {money(purchase.price_poisha)}
          <div className="kit-small kit-muted">
            Package {purchase.package_code} · From {purchase.sender_number} · account{' '}
            {purchase.account_holder} · transaction <code>{purchase.txn_id}</code>
          </div>
          <div className="kit-small kit-muted">Vendor /{purchase.vendor_slug}</div>
        </div>
        <Badge tone={waitingTone(purchase.created_at)}>
          waiting {waitingFor(purchase.created_at)}
        </Badge>
      </div>
      <div className="kit-stack" style={{ marginTop: 'var(--sp-2)' }}>
        <TextArea
          label="Reason, if you refuse"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="For example: transaction not found on the statement."
        />
        {error ? (
          <Banner tone="bad" title="Not saved">
            <p className="kit-small">{error}</p>
          </Banner>
        ) : null}
        <div className="kit-row" style={{ justifyContent: 'flex-end' }}>
          <Button variant="danger" size="small" disabled={busy} onClick={() => decide('reject')}>
            Refuse
          </Button>
          <Button size="small" disabled={busy} onClick={() => decide('approve')}>
            Approve and credit vendor
          </Button>
        </div>
      </div>
    </div>
  );
}

function AdPayments(): ReactElement {
  const env = useCorporateEnv();
  const load = useCallback(
    async () =>
      oldestFirst(
        await listRpc<PendingAdPaymentRow>(env, 'ad_admin_list_payment_requests', {
          p_status: 'pending',
          p_limit: 100,
        }),
      ),
    [env],
  );
  const { state, reload } = useAsync(load, [env]);

  return (
    <Card
      title="Advertising payments waiting for approval"
      description="Check each transaction on the bKash statement. Approving adds the amount to the advertiser's wallet."
      actions={
        <Button variant="quiet" size="small" onClick={reload}>
          Refresh
        </Button>
      }
    >
      {state.status === 'loading' ? <Loading label="Loading advertising payments." /> : null}
      {state.status === 'error' ? (
        <Banner tone="bad" title="The payment queue did not load">
          <p className="kit-small">{state.message}</p>
        </Banner>
      ) : null}
      {state.status === 'ready' && state.data.length === 0 ? (
        <Empty>
          No advertising payments are waiting. A payment appears here once an advertiser reports it.
        </Empty>
      ) : null}
      {state.status === 'ready' && state.data.length > 0 ? (
        <div className="kit-stack">
          {state.data.map((payment) => (
            <AdPaymentRow key={payment.id} payment={payment} onDecided={reload} />
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function AdPaymentRow({
  payment,
  onDecided,
}: {
  payment: PendingAdPaymentRow;
  onDecided: () => void;
}): ReactElement {
  const env = useCorporateEnv();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const decide = (decision: 'approve' | 'reject'): void => {
    if (decision === 'reject' && note.trim().length < 5) {
      setError('Write the reason the advertiser will see, at least five characters.');
      return;
    }
    setBusy(true);
    setError('');
    callRpc(env, 'ad_admin_decide_payment_request', {
      p_request_id: payment.id,
      p_decision: decision,
      p_note: decision === 'reject' ? note.trim() : '',
    })
      .then(() => {
        setNote('');
        onDecided();
      })
      .catch((failure: unknown) => setError(messageOf(failure)))
      .finally(() => setBusy(false));
  };

  return (
    <div className="kit-card" style={{ padding: 'var(--sp-3)' }}>
      <div className="kit-row" style={{ justifyContent: 'space-between' }}>
        <div>
          <strong>{money(payment.amount_poisha)}</strong> paid by bKash
          <div className="kit-small kit-muted">
            From {payment.sender_number} · account {payment.account_holder} · transaction{' '}
            <code>{payment.txn_id}</code>
          </div>
          <div className="kit-small kit-muted">Campaign {payment.campaign_id.slice(0, 8)}</div>
        </div>
        <Badge tone={waitingTone(payment.created_at)}>
          waiting {waitingFor(payment.created_at)}
        </Badge>
      </div>
      <div className="kit-stack" style={{ marginTop: 'var(--sp-2)' }}>
        <TextArea
          label="Reason, if you refuse"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="For example: transaction not found on the statement."
        />
        {error ? (
          <Banner tone="bad" title="Not saved">
            <p className="kit-small">{error}</p>
          </Banner>
        ) : null}
        <div className="kit-row" style={{ justifyContent: 'flex-end' }}>
          <Button variant="danger" size="small" disabled={busy} onClick={() => decide('reject')}>
            Refuse
          </Button>
          <Button size="small" disabled={busy} onClick={() => decide('approve')}>
            Approve and credit wallet
          </Button>
        </div>
      </div>
    </div>
  );
}

function CampaignRow({
  campaign,
  onDecided,
}: {
  campaign: PendingCampaignRow;
  onDecided: () => void;
}): ReactElement {
  const env = useCorporateEnv();
  const [draft, setDraft] = useState<DecisionDraft>(EMPTY_DECISION);
  const [confirming, setConfirming] = useState<'approve' | 'refuse' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showCreatives, setShowCreatives] = useState(false);
  const [creatives, setCreatives] = useState<readonly PendingCreativePreviewRow[] | null>(null);
  const [creativesError, setCreativesError] = useState('');

  const toggleCreatives = (): void => {
    const next = !showCreatives;
    setShowCreatives(next);
    if (next && creatives === null) {
      setCreativesError('');
      listRpc<PendingCreativePreviewRow>(env, 'campaign_creative_details', {
        p_campaign_id: campaign.id,
      })
        .then((rows) => setCreatives(rows))
        .catch((failure: unknown) => setCreativesError(messageOf(failure)));
    }
  };

  const submit = (approve: boolean): void => {
    const problems = decisionProblems(approve, draft);
    if (problems.length > 0) {
      setError(problems[0] ?? '');
      return;
    }
    setBusy(true);
    setError('');
    callRpc(env, 'decide_campaign', {
      p_campaign_id: campaign.id,
      p_approve: approve,
      p_note: approve ? '' : draft.note.trim(),
    })
      .then(() => {
        setConfirming(null);
        setDraft(EMPTY_DECISION);
        onDecided();
      })
      .catch((failure: unknown) => {
        setError(messageOf(failure));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <div className="kit-card" style={{ padding: 'var(--sp-3)' }}>
      <div className="kit-row" style={{ justifyContent: 'space-between' }}>
        <div>
          <strong>{campaign.name}</strong>
          <div className="kit-small kit-muted">
            {campaign.owner_name} · total {money(campaign.total_budget)}
            {campaign.daily_budget > 0 ? ` · daily cap ${money(campaign.daily_budget)}` : ''}
            {` · ${String(campaign.creative_count)} creative${campaign.creative_count === 1 ? '' : 's'}`}
          </div>
        </div>
        <Badge tone={waitingTone(campaign.created_at)}>
          waiting {waitingFor(campaign.created_at)}
        </Badge>
      </div>

      {campaign.creative_count === 0 ? (
        <Banner tone="warn" title="No creative">
          <p className="kit-small">
            This campaign has nothing to show. Approving it starts spending on an empty slot, so
            refuse it and ask the advertiser to add a creative first.
          </p>
        </Banner>
      ) : null}

      {showCreatives ? (
        <div className="kit-stack">
          {creativesError !== '' ? (
            <Banner tone="bad" title="Could not load creatives">
              <p className="kit-small">{creativesError}</p>
            </Banner>
          ) : creatives === null ? (
            <Loading label="Loading creatives." />
          ) : (
            creatives.map((item) => (
              <div key={item.creative_id} className="kit-adpreview">
                <div className="kit-adpreview-head">
                  <span className="kit-badge">
                    {item.badge_label || 'Sponsored'} · {PLACEMENT_LABELS[item.placement]} ·{' '}
                    {LAYOUT_LABELS[item.layout] ?? item.layout}
                  </span>
                  <span className="kit-small kit-muted">
                    {(item.platforms ?? ['web', 'android'])
                      .map((p) => PLATFORM_LABELS[p])
                      .join(' + ')}
                  </span>
                </div>
                <div className="kit-adpreview-body">
                  {item.image_url !== '' ? (
                    <img
                      src={item.thumb_url || item.image_url}
                      alt={item.image_alt || item.headline}
                      className="kit-adpreview-media"
                    />
                  ) : null}
                  <div className="kit-stack" style={{ gap: '4px' }}>
                    <strong>{item.headline}</strong>
                    {item.body !== '' ? <p className="kit-small">{item.body}</p> : null}
                    <span className="kit-small kit-muted">
                      {item.cta_label ? `[${item.cta_label}] → ` : ''}
                      {item.target_url}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : null}

      {error.length > 0 ? (
        <Banner tone="bad" title="That did not work">
          <p className="kit-small">{error}</p>
        </Banner>
      ) : null}

      {confirming === null ? (
        <div className="kit-row" style={{ gap: 'var(--sp-2)' }}>
          <Button
            size="small"
            disabled={campaign.creative_count === 0}
            onClick={() => setConfirming('approve')}
          >
            Approve
          </Button>
          <Button size="small" variant="quiet" onClick={() => setConfirming('refuse')}>
            Refuse
          </Button>
          {campaign.creative_count > 0 ? (
            <Button size="small" variant="quiet" onClick={toggleCreatives}>
              {showCreatives ? 'Hide creatives' : 'Preview creatives'}
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="kit-stack">
          <Banner tone={confirming === 'approve' ? 'warn' : 'bad'} title="Confirm">
            <p className="kit-small">
              {confirmDecision('campaign', confirming === 'approve', campaign.name)}
            </p>
          </Banner>
          {confirming === 'refuse' ? (
            <TextArea
              label="Why (the advertiser reads this)"
              value={draft.note}
              onChange={(event) => setDraft({ note: event.target.value })}
            />
          ) : null}
          <div className="kit-row" style={{ gap: 'var(--sp-2)' }}>
            <Button
              size="small"
              variant={confirming === 'approve' ? 'primary' : 'danger'}
              disabled={busy}
              onClick={() => submit(confirming === 'approve')}
            >
              {busy ? 'Working' : decisionLabel(confirming === 'approve')}
            </Button>
            <Button
              size="small"
              variant="quiet"
              disabled={busy}
              onClick={() => {
                setConfirming(null);
                setError('');
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * How urgent a wait is, as a colour.
 *
 * A day is the threshold because it is the point at which an applicant starts
 * asking whether anybody is there. Nothing in this queue is an emergency; a
 * console that paints everything red teaches an operator to ignore red.
 */
function waitingTone(createdAt: string): 'ok' | 'warn' | 'bad' {
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return 'warn';
  const hours = (Date.now() - created) / 3_600_000;
  if (hours >= 72) return 'bad';
  if (hours >= 24) return 'warn';
  return 'ok';
}
