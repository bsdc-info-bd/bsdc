import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  Badge,
  Banner,
  Button,
  Card,
  Empty,
  Field,
  Loading,
  Select,
  Table,
  TextArea,
  callRpc,
  listRpc,
  messageOf,
  useAsync,
  useCorporateEnv,
} from '@kit';
import {
  LIMITS,
  PLACEMENTS,
  PLACEMENT_LABELS,
  STATUS_LABELS,
  STATUS_TONES,
  activationRefusal,
  count,
  creativeArgs,
  setupArgs,
  dateToIso,
  eventCost,
  forecastEvents,
  money,
  needsAttention,
  percent,
  poishaToTaka,
  takaToPoisha,
  validateCreative,
  validateDraft,
  type AdPlacement,
  type AdPricing,
  type CampaignRow,
  type CreativeDraft,
  type OwnerRow,
  type PlacementRow,
} from './campaigns';
import { settleCampaignWorkspace, type CampaignWorkspace } from './campaign-loader';

const EMPTY_CREATIVE: CreativeDraft = {
  placement: 'feed',
  headline: '',
  body: '',
  targetUrl: '',
  imageUrl: '',
  ctaLabel: '',
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The campaign builder.
 *
 * Staff create a campaign here, for a named advertiser, and add its first
 * creative in the same visit — because a campaign without a creative is a
 * campaign that cannot serve and therefore one an operator will forget. Nothing
 * on this screen is a form for "my" campaign: every field belongs to somebody
 * else, which is why the owner is chosen first and shown on every row.
 *
 * The forecast is the part worth reading carefully. It is computed with the
 * same truncation the wallet uses (see `campaigns.ts`), so the number an
 * operator reads before pressing Create is the number of impressions the budget
 * will actually pay for.
 */
export function Campaigns(): ReactElement {
  const env = useCorporateEnv();

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [version, setVersion] = useState(0);
  const [data, setData] = useState<CampaignWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(() => setVersion((value) => value + 1), []);

  // Refresh without unmounting the controls: an acknowledgement must not
  // disappear while the updated wallet balance is being loaded.
  useEffect(() => {
    let active = true;
    setLoading(true);
    void settleCampaignWorkspace(search, {
      campaigns: listRpc<CampaignRow>(env, 'campaign_book', { p_limit: 100 }),
      owners: listRpc<OwnerRow>(env, 'campaign_owners', { p_search: search, p_limit: 100 }),
      inventory: listRpc<PlacementRow>(env, 'ad_inventory'),
    }).then((workspace) => {
      if (active) {
        setData(workspace);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [env, search, version]);

  return (
    <div className="kit-stack">
      <Banner tone="neutral" title="A campaign is set up here, not by the advertiser">
        <p className="kit-small">
          You choose the owner, the bid, the budget and the dates. The advertiser signs in to an
          account you issue them and sees their performance — they do not create campaigns, change a
          bid, or top up a wallet. Nothing spends until it is funded and running.
        </p>
      </Banner>

      <Card
        title="Find an advertiser"
        description="Search by name, handle or Firebase UID, including newly issued accounts."
      >
        <div className="kit-row">
          <Field
            label="Advertiser search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
          <Button onClick={() => setSearch(searchInput.trim())}>Search</Button>
        </div>
      </Card>
      {loading ? <Loading label="Refreshing the campaign book." /> : null}
      {data !== null && data.search === search ? (
        <>
          {[data.campaigns, data.owners, data.inventory].some((section) => !section.ok) ? (
            <Banner tone="bad" title="Some campaign data did not load">
              <ul className="kit-small">
                {[data.campaigns, data.owners, data.inventory].map((section, index) =>
                  section.ok ? null : <li key={index}>{section.message}</li>,
                )}
              </ul>
              <Button size="small" variant="quiet" disabled={loading} onClick={reload}>
                Retry
              </Button>
            </Banner>
          ) : null}
          {data.owners.ok ? (
            <WalletCredit key={`wallet-${search}`} owners={data.owners.data} onChanged={reload} />
          ) : null}
          {data.owners.ok && data.inventory.ok ? (
            <Builder
              key={`builder-${search}`}
              owners={data.owners.data}
              inventory={data.inventory.data}
              onCreated={reload}
            />
          ) : null}
          {data.campaigns.ok ? <Book campaigns={data.campaigns.data} onChanged={reload} /> : null}
        </>
      ) : null}
    </div>
  );
}

/** Staff record received payments, not advertiser self-service credits. */
function WalletCredit({
  owners,
  onChanged,
}: {
  owners: readonly OwnerRow[];
  onChanged: () => void;
}): ReactElement {
  const env = useCorporateEnv();
  const [ownerUid, setOwnerUid] = useState(owners[0]?.uid ?? '');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const poisha = takaToPoisha(amount);

  async function credit(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const balance = await callRpc<number>(env, 'topup_ad_wallet', {
        p_owner_uid: ownerUid,
        p_amount: poisha,
        p_reference: reference.trim(),
      });
      setFailed(false);
      setMessage(
        `Payment recorded. Wallet balance: ${money(balance)}. Retrying the same reference does not credit it twice.`,
      );
      setAmount('');
      setReference('');
      onChanged();
    } catch (error) {
      setFailed(true);
      setMessage(messageOf(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card
      title="Record a received payment"
      description="Only credit money that finance has received. The payment reference protects retries for this wallet."
    >
      {owners.length === 0 ? (
        <Empty>No advertiser matched. Issue an account or try a different search.</Empty>
      ) : (
        <>
          <div className="kit-grid kit-grid--2">
            <Select
              label="Advertiser"
              value={ownerUid}
              options={owners.map((owner) => ({
                value: owner.uid,
                label: `${owner.display_name} (@${owner.username}) · ${money(owner.wallet_balance)}`,
              }))}
              onChange={(event) => setOwnerUid(event.target.value)}
            />
            <Field
              label="Amount received (৳)"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
            <Field
              label="Payment reference"
              value={reference}
              maxLength={100}
              hint="Use the bank or payment-provider reference."
              onChange={(event) => setReference(event.target.value)}
            />
          </div>
          {message !== null ? (
            <Banner
              tone={failed ? 'bad' : 'ok'}
              title={failed ? 'Payment not recorded' : 'Recorded'}
            >
              <p className="kit-small">{message}</p>
            </Banner>
          ) : null}
          <Button
            disabled={
              busy ||
              ownerUid === '' ||
              poisha <= 0 ||
              poisha > 1_000_000_000 ||
              reference.trim().length === 0
            }
            onClick={() => void credit()}
          >
            {busy ? 'Recording…' : 'Credit wallet'}
          </Button>
        </>
      )}
    </Card>
  );
}

function Builder({
  owners,
  inventory,
  onCreated,
}: {
  owners: readonly OwnerRow[];
  inventory: readonly PlacementRow[];
  onCreated: () => void;
}): ReactElement {
  const env = useCorporateEnv();

  const [ownerUid, setOwnerUid] = useState(owners[0]?.uid ?? '');
  const [name, setName] = useState('');
  const [pricing, setPricing] = useState<AdPricing>('cpm');
  const [bidTakaText, setBidTaka] = useState('');
  const [budgetTakaText, setBudgetTaka] = useState('');
  const [dailyTakaText, setDailyTaka] = useState('');
  const [startsAt, setStartsAt] = useState(today());
  const [endsAt, setEndsAt] = useState('');
  const [cities, setCities] = useState('');
  const [topics, setTopics] = useState('');
  const [activate, setActivate] = useState(false);
  const [creative, setCreative] = useState<CreativeDraft>(EMPTY_CREATIVE);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const owner = owners.find((entry) => entry.uid === ownerUid);
  const floorBid = inventory[0]?.floor_bid ?? LIMITS.bidMin;

  const draft = useMemo(
    () => ({
      ownerUid,
      name,
      pricing,
      bid: takaToPoisha(bidTakaText),
      totalBudget: takaToPoisha(budgetTakaText),
      dailyBudget: dailyTakaText.trim() === '' ? 0 : takaToPoisha(dailyTakaText),
      startsAt,
      endsAt,
      cities: splitTags(cities),
      topics: splitTags(topics),
      language: 'any',
      activate,
    }),
    [
      ownerUid,
      name,
      pricing,
      bidTakaText,
      budgetTakaText,
      dailyTakaText,
      startsAt,
      endsAt,
      cities,
      topics,
      activate,
    ],
  );

  const problems = useMemo(() => validateDraft(draft, floorBid), [draft, floorBid]);
  const creativeProblems = useMemo(() => validateCreative(creative), [creative]);
  const funding = activationRefusal(draft, owner?.wallet_balance ?? 0);

  // The forecast only means something once the bid and the budget are real
  // numbers, so it is shown then and not before.
  const forecast = useMemo(
    () => forecastEvents(draft.pricing, draft.bid, draft.totalBudget),
    [draft.pricing, draft.bid, draft.totalBudget],
  );

  const problemFor = (field: string): string | undefined =>
    problems.find((problem) => problem.field === field)?.message;

  const hasCreative = [
    creative.headline,
    creative.body,
    creative.targetUrl,
    creative.imageUrl,
    creative.ctaLabel,
  ].some((value) => value.trim().length > 0);
  const needsCreative = activate || hasCreative;

  async function create(): Promise<void> {
    setBusy(true);
    setFailure(null);
    setDone(null);
    try {
      await callRpc<string>(env, 'staff_setup_campaign', setupArgs(draft, creative));
      setDone(
        `${name.trim()} is created${hasCreative ? ' with its first creative' : ''}. It is ${activate ? 'running' : 'a draft'}.`,
      );
      setName('');
      setBidTaka('');
      setBudgetTaka('');
      setDailyTaka('');
      setEndsAt('');
      setCities('');
      setTopics('');
      setCreative(EMPTY_CREATIVE);
      setActivate(false);
      onCreated();
    } catch (error) {
      setFailure(messageOf(error));
    } finally {
      setBusy(false);
    }
  }

  const blocked =
    busy ||
    problems.length > 0 ||
    funding !== null ||
    (needsCreative && creativeProblems.length > 0);

  return (
    <Card
      title="Set up a campaign"
      description="Everything here is billed to the owner you choose. The bid floor is what the platform is charging today."
    >
      {owners.length === 0 ? (
        <Empty>
          No advertiser matched. Issue an account or try a different search; a campaign must be
          billed to somebody with an account.
        </Empty>
      ) : (
        <>
          <div className="kit-grid kit-grid--2">
            <Select
              label="Owner"
              value={ownerUid}
              hint={
                owner
                  ? `Wallet ${money(owner.wallet_balance)} · ${count(owner.campaigns)} ${
                      owner.campaigns === 1 ? 'campaign' : 'campaigns'
                    } so far`
                  : 'Choose whose campaign this is.'
              }
              options={owners.map((entry) => ({
                value: entry.uid,
                label: `${entry.display_name} (@${entry.username})`,
              }))}
              onChange={(event) => {
                setOwnerUid(event.target.value);
              }}
            />
            <Field
              label="Campaign name"
              value={name}
              hint="The owner sees this in their console. It never appears to a reader."
              error={problemFor('name')}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
            <Select
              label="Charged per"
              value={pricing}
              hint={
                pricing === 'cpm'
                  ? 'A thousand impressions, divided down to whole poisha per impression.'
                  : 'A click. The price is the bid itself.'
              }
              options={[
                { value: 'cpm', label: 'Thousand impressions (CPM)' },
                { value: 'cpc', label: 'Click (CPC)' },
              ]}
              onChange={(event) => {
                setPricing(event.target.value === 'cpc' ? 'cpc' : 'cpm');
              }}
            />
            <Field
              label={pricing === 'cpm' ? 'Bid per thousand (৳)' : 'Bid per click (৳)'}
              inputMode="decimal"
              value={bidTakaText}
              hint={`Floor ${money(floorBid)} · one ${pricing === 'cpm' ? 'impression' : 'click'} costs ${money(
                eventCost(pricing, draft.bid, pricing === 'cpm' ? 'impression' : 'click'),
              )}`}
              error={problemFor('bid')}
              onChange={(event) => {
                setBidTaka(event.target.value);
              }}
            />
            <Field
              label="Total budget (৳)"
              inputMode="decimal"
              value={budgetTakaText}
              hint={`At least ${money(LIMITS.budgetMin)}.`}
              error={problemFor('totalBudget')}
              onChange={(event) => {
                setBudgetTaka(event.target.value);
              }}
            />
            <Field
              label="Daily cap (৳)"
              inputMode="decimal"
              value={dailyTakaText}
              hint="Leave empty for no cap. A cap larger than the budget never applies."
              error={problemFor('dailyBudget')}
              onChange={(event) => {
                setDailyTaka(event.target.value);
              }}
            />
            <Field
              label="Starts"
              type="date"
              value={startsAt}
              error={problemFor('startsAt')}
              onChange={(event) => {
                setStartsAt(event.target.value);
              }}
            />
            <Field
              label="Ends"
              type="date"
              value={endsAt}
              hint="Leave empty to run until the budget is spent."
              error={problemFor('endsAt')}
              onChange={(event) => {
                setEndsAt(event.target.value);
              }}
            />
            <Field
              label="Cities"
              value={cities}
              hint="Comma separated. Empty means every city."
              onChange={(event) => {
                setCities(event.target.value);
              }}
            />
            <Field
              label="Topics"
              value={topics}
              hint="Comma separated. Empty means every topic."
              onChange={(event) => {
                setTopics(event.target.value);
              }}
            />
          </div>

          {draft.bid > 0 && draft.totalBudget > 0 ? (
            <p className="kit-small kit-muted">
              {forecast.count === 0
                ? 'At this bid the budget buys nothing: the bid cannot pay for a single event.'
                : `${money(draft.totalBudget)} at this bid buys about ${count(
                    forecast.count,
                  )} ${forecast.kind === 'impression' ? 'impressions' : 'clicks'}, in whole poisha.`}
            </p>
          ) : null}

          <label className="kit-check">
            <input
              type="checkbox"
              checked={activate}
              onChange={(event) => {
                setActivate(event.target.checked);
              }}
            />
            <span>
              Start it immediately after staff approval. A creative and enough wallet credit to
              cover the full budget are required.
            </span>
          </label>

          {funding !== null ? (
            <Banner tone="warn" title="Not funded">
              <p className="kit-small">{funding}</p>
            </Banner>
          ) : null}

          <h3>First creative</h3>
          <p className="kit-small kit-muted">
            Optional here, required before the campaign can run. Copy is the one part the advertiser
            may change later — doing so sends the campaign back for review.
          </p>
          <div className="kit-grid kit-grid--2">
            <Field
              label="Headline"
              value={creative.headline}
              hint={`${LIMITS.headlineMin}–${LIMITS.headlineMax} characters.`}
              error={creativeProblems.find((problem) => problem.field === 'headline')?.message}
              onChange={(event) => {
                setCreative({ ...creative, headline: event.target.value });
              }}
            />
            <Select
              label="Placement"
              value={creative.placement}
              options={PLACEMENTS.map((placement) => ({
                value: placement,
                label: placementHint(placement, inventory),
              }))}
              onChange={(event) => {
                setCreative({ ...creative, placement: event.target.value as AdPlacement });
              }}
            />
            <Field
              label="Destination"
              value={creative.targetUrl}
              hint="https only: a click is a promise about where the reader lands."
              error={creativeProblems.find((problem) => problem.field === 'targetUrl')?.message}
              onChange={(event) => {
                setCreative({ ...creative, targetUrl: event.target.value });
              }}
            />
            <Field
              label="Button label"
              value={creative.ctaLabel}
              hint={`Optional, up to ${LIMITS.ctaMax} characters.`}
              error={creativeProblems.find((problem) => problem.field === 'cta')?.message}
              onChange={(event) => {
                setCreative({ ...creative, ctaLabel: event.target.value });
              }}
            />
          </div>
          <TextArea
            label="Body"
            rows={2}
            value={creative.body}
            hint={`Up to ${LIMITS.bodyMax} characters. ${creative.body.length} used.`}
            error={creativeProblems.find((problem) => problem.field === 'body')?.message}
            onChange={(event) => {
              setCreative({ ...creative, body: event.target.value });
            }}
          />

          <h3>What the reader sees</h3>
          <CreativePreview draft={creative} />

          {failure !== null ? (
            <Banner tone="bad" title="The campaign was not created">
              <p className="kit-small">{failure}</p>
            </Banner>
          ) : null}
          {done !== null ? (
            <Banner tone="ok" title="Created">
              <p className="kit-small">{done}</p>
            </Banner>
          ) : null}

          <div className="kit-row">
            <Button disabled={blocked} onClick={() => void create()}>
              {busy ? 'Creating…' : 'Create campaign'}
            </Button>
            {problems.length > 0 ? (
              <span className="kit-small kit-muted">{problems[0]?.message}</span>
            ) : needsCreative && creativeProblems.length > 0 ? (
              <span className="kit-small kit-muted">{creativeProblems[0]?.message}</span>
            ) : null}
          </div>
        </>
      )}
    </Card>
  );
}

function placementHint(placement: AdPlacement, inventory: readonly PlacementRow[]): string {
  const live = inventory.find((row) => row.placement === placement);
  if (!live) return PLACEMENT_LABELS[placement];
  return `${PLACEMENT_LABELS[placement]} — ${count(live.live_campaigns)} live, ${count(
    live.impressions_today,
  )} impressions today`;
}

/** "dhaka, sylhet" into the array the function wants, without empty entries. */
function splitTags(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function Book({
  campaigns,
  onChanged,
}: {
  campaigns: readonly CampaignRow[];
  onChanged: () => void;
}): ReactElement {
  const env = useCorporateEnv();
  const [openId, setOpenId] = useState<string | null>(null);
  const attention = needsAttention(campaigns);

  return (
    <>
      <Card
        title="Every campaign"
        description="Oldest first, because that is the order they were promised in."
        actions={
          <Button variant="quiet" size="small" onClick={onChanged}>
            Refresh
          </Button>
        }
      >
        {campaigns.length === 0 ? (
          <Empty>No campaign has been set up yet.</Empty>
        ) : (
          <Table
            caption={`${count(campaigns.length)} campaign${campaigns.length === 1 ? '' : 's'}`}
            head={['Campaign', 'Owner', 'Status', 'Bid', 'Spent', 'Shown', 'Clicked', 'CTR', '']}
          >
            {campaigns.map((row) => (
              <tr key={row.campaign_id}>
                <td>
                  <strong>{row.name}</strong>
                  <div className="kit-small kit-muted">
                    {row.starts_at.slice(0, 10)}
                    {row.ends_at ? ` → ${row.ends_at.slice(0, 10)}` : ' → open'}
                  </div>
                </td>
                <td>{row.owner_name}</td>
                <td>
                  <Badge tone={STATUS_TONES[row.status]}>{STATUS_LABELS[row.status]}</Badge>
                </td>
                <td>
                  {money(row.bid)}
                  <div className="kit-small kit-muted">
                    {row.pricing === 'cpm' ? 'per thousand' : 'per click'}
                  </div>
                </td>
                <td>
                  {money(row.spent)}
                  <div className="kit-small kit-muted">
                    of {money(row.total_budget)} · {percent(row.budget_used_pct, 1)}
                  </div>
                </td>
                <td>{count(row.impressions)}</td>
                <td>{count(row.clicks)}</td>
                <td>{percent(row.ctr)}</td>
                <td>
                  <Button
                    variant="quiet"
                    size="small"
                    onClick={() => {
                      setOpenId(openId === row.campaign_id ? null : row.campaign_id);
                    }}
                  >
                    {openId === row.campaign_id ? 'Close' : 'Open'}
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {attention.length > 0 ? (
        <Banner tone="warn" title={`${attention.length} campaign needs a person`}>
          <ul className="kit-small">
            {attention.map((row) => (
              <li key={row.campaign_id}>
                <strong>{row.name}</strong> —{' '}
                {row.status === 'pending_review'
                  ? 'waiting for review in Approvals.'
                  : 'running with no creative, so it is serving nothing.'}
              </li>
            ))}
          </ul>
        </Banner>
      ) : null}

      {openId !== null ? (
        <CampaignDetail campaignId={openId} env={env} onChanged={onChanged} />
      ) : null}
    </>
  );
}

function CampaignDetail({
  campaignId,
  env,
  onChanged,
}: {
  campaignId: string;
  env: ReturnType<typeof useCorporateEnv>;
  onChanged: () => void;
}): ReactElement {
  const load = useCallback(
    async () =>
      await callRpc<Record<string, unknown>[]>(env, 'campaign_performance', {
        p_campaign_id: campaignId,
      }),
    [env, campaignId],
  );
  const { state, reload } = useAsync(load, [campaignId]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [creative, setCreative] = useState<CreativeDraft>(EMPTY_CREATIVE);

  if (state.status === 'loading') return <Loading label="Loading the campaign." />;
  if (state.status === 'error') {
    return (
      <Banner tone="bad" title="The campaign did not load">
        <p className="kit-small">{state.message}</p>
      </Banner>
    );
  }

  const row = state.data[0] as
    | {
        name: string;
        status: keyof typeof STATUS_LABELS;
        bid: number;
        pricing: AdPricing;
        daily_budget: number;
        wallet_balance: number;
        cost_per_click: number;
        cost_per_mille: number;
        review_note: string;
        active_creatives: number;
        creative_count: number;
        days_running: number;
      }
    | undefined;

  if (!row) return <Empty>The campaign answered with nothing.</Empty>;

  async function setRunning(running: boolean): Promise<void> {
    setBusy(true);
    setNote(null);
    try {
      await callRpc<string>(env, 'set_campaign_paused', {
        p_campaign_id: campaignId,
        p_paused: !running,
      });
      setNote(running ? 'Running again.' : 'Paused. It serves nothing until resumed.');
      reload();
      onChanged();
    } catch (error) {
      setNote(messageOf(error));
    } finally {
      setBusy(false);
    }
  }

  async function addFirstCreative(): Promise<void> {
    setBusy(true);
    setNote(null);
    try {
      await callRpc<string>(env, 'staff_add_creative', creativeArgs(campaignId, creative));
      setCreative(EMPTY_CREATIVE);
      setNote('Creative added. Submit the campaign for staff review when ready.');
      reload();
      onChanged();
    } catch (error) {
      setNote(messageOf(error));
    } finally {
      setBusy(false);
    }
  }

  async function submitDraft(): Promise<void> {
    setBusy(true);
    setNote(null);
    try {
      await callRpc<string>(env, 'submit_campaign', { p_campaign_id: campaignId });
      setNote('Sent for review. Approve it in Approvals.');
      reload();
      onChanged();
    } catch (error) {
      setNote(messageOf(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title={row.name}
      description={`${STATUS_LABELS[row.status]} · running ${count(row.days_running)} day${
        row.days_running === 1 ? '' : 's'
      } · ${count(row.active_creatives)} of ${count(row.creative_count)} creative${
        row.creative_count === 1 ? '' : 's'
      } live`}
    >
      <Table caption="How it is doing" head={['Measure', 'Value', 'What it means']}>
        <tr>
          <td>Cost per click</td>
          <td>{money(row.cost_per_click)}</td>
          <td className="kit-small">What a click has actually cost, not what it was bid.</td>
        </tr>
        <tr>
          <td>Cost per thousand</td>
          <td>{money(row.cost_per_mille)}</td>
          <td className="kit-small">Spend divided by impressions, times a thousand.</td>
        </tr>
        <tr>
          <td>Daily cap</td>
          <td>{row.daily_budget === 0 ? 'none' : money(row.daily_budget)}</td>
          <td className="kit-small">A cap is not a guarantee: a quiet day underspends.</td>
        </tr>
        <tr>
          <td>Wallet</td>
          <td>{money(row.wallet_balance)}</td>
          <td className="kit-small">
            {row.wallet_balance > 0
              ? 'The owner sees this same figure, next to what has been spent from it.'
              : 'The wallet is empty, so nothing more can serve until it is credited.'}
          </td>
        </tr>
      </Table>

      {row.review_note.trim().length > 0 ? (
        <Banner tone="warn" title="The review note the owner reads">
          <p className="kit-small">{row.review_note}</p>
        </Banner>
      ) : null}

      {note !== null ? (
        <Banner tone="neutral" title="Last action">
          <p className="kit-small">{note}</p>
        </Banner>
      ) : null}

      {row.status === 'draft' || row.status === 'rejected' ? (
        <>
          <h3>Add a creative</h3>
          <div className="kit-grid kit-grid--2">
            <Field
              label="Headline"
              value={creative.headline}
              onChange={(event) => setCreative({ ...creative, headline: event.target.value })}
            />
            <Select
              label="Placement"
              value={creative.placement}
              options={PLACEMENTS.map((placement) => ({
                value: placement,
                label: PLACEMENT_LABELS[placement],
              }))}
              onChange={(event) =>
                setCreative({ ...creative, placement: event.target.value as AdPlacement })
              }
            />
            <Field
              label="Destination"
              value={creative.targetUrl}
              onChange={(event) => setCreative({ ...creative, targetUrl: event.target.value })}
            />
            <Field
              label="Button label"
              value={creative.ctaLabel}
              onChange={(event) => setCreative({ ...creative, ctaLabel: event.target.value })}
            />
          </div>
          <TextArea
            label="Body"
            rows={2}
            value={creative.body}
            onChange={(event) => setCreative({ ...creative, body: event.target.value })}
          />
          <div className="kit-row">
            <Button
              variant="quiet"
              disabled={busy || validateCreative(creative).length > 0}
              onClick={() => void addFirstCreative()}
            >
              Add creative
            </Button>
            <Button
              disabled={busy || row.active_creatives === 0}
              onClick={() => void submitDraft()}
            >
              Send for review
            </Button>
          </div>
          <p className="kit-small kit-muted">
            A funded wallet and an enabled creative are required. Staff approve it from Approvals.
          </p>
        </>
      ) : null}

      <div className="kit-row">
        {row.status === 'active' ? (
          <Button variant="quiet" disabled={busy} onClick={() => void setRunning(false)}>
            Pause
          </Button>
        ) : null}
        {row.status === 'paused' ? (
          <Button disabled={busy} onClick={() => void setRunning(true)}>
            Resume
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

/**
 * A preview of what the advertiser will read. It is the same numbers the
 * performance call returns, rendered by the same formatting, so an operator
 * can answer "what will they see?" without signing in as them.
 */
export function CreativePreview({ draft }: { draft: CreativeDraft }): ReactElement {
  return (
    <div className="kit-adpreview">
      <span className="kit-badge">Sponsored · {PLACEMENT_LABELS[draft.placement]}</span>
      <strong>{draft.headline.trim() === '' ? 'Headline' : draft.headline}</strong>
      <p className="kit-small">{draft.body.trim() === '' ? 'Body copy.' : draft.body}</p>
      {draft.ctaLabel.trim().length > 0 ? (
        <span className="kit-btn kit-btn--small">{draft.ctaLabel}</span>
      ) : null}
      <span className="kit-small kit-muted">{draft.targetUrl || 'https://…'}</span>
    </div>
  );
}

/** Exported for the tests that check a saved bid round-trips through the form. */
export const roundTrip = (poisha: number): number => takaToPoisha(poishaToTaka(poisha));

/** Exported so a screen can say when a campaign is started but not yet reviewed. */
export const startsOn = (value: string): string => dateToIso(value).slice(0, 10);
