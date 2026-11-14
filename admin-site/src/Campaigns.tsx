import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactElement,
} from 'react';
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
import { AdImageField } from './AdImageField';
import {
  DEFAULT_CREATIVE_PLATFORMS,
  LAYOUTS,
  LAYOUT_LABELS,
  LIMITS,
  PLACEMENTS,
  PLACEMENT_LABELS,
  PLATFORMS,
  PLATFORM_LABELS,
  STATUS_LABELS,
  STATUS_TONES,
  activationRefusal,
  count,
  creativeArgs,
  dateToIso,
  eventCost,
  forecastEvents,
  isImgbbUrl,
  money,
  needsAttention,
  percent,
  poishaToTaka,
  setupArgs,
  takaToPoisha,
  updateCampaignArgs,
  updateCreativeArgs,
  validateCreative,
  validateDraft,
  type AdLayout,
  type AdPlacement,
  type AdPlatform,
  type AdPricing,
  type CampaignDetailRow,
  type CampaignRow,
  type CreativeDraft,
  type CreativePerformanceRow,
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
  thumbUrl: '',
  imageAlt: '',
  layout: 'card',
  accentColor: '',
  badgeLabel: '',
  platforms: [...DEFAULT_CREATIVE_PLATFORMS],
  isEnabled: true,
};

const ACCENT_PRESETS: readonly string[] = ['', '#15803d', '#0f766e', '#1d4ed8', '#b45309'];

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
 */
export function Campaigns(): ReactElement {
  const env = useCorporateEnv();

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [version, setVersion] = useState(0);
  const [data, setData] = useState<CampaignWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(() => setVersion((value) => value + 1), []);

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
          You choose the owner, the bid, the budget, targeting, and the creative. The advertiser
          signs in to an account you issue them and sees their performance — they do not create
          campaigns, change a bid, or top up a wallet. Nothing spends until it is funded and
          running.
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
          {data.campaigns.ok ? (
            <Book
              campaigns={data.campaigns.data}
              inventory={data.inventory.ok ? data.inventory.data : []}
              onChanged={reload}
            />
          ) : null}
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
  const [language, setLanguage] = useState<'any' | 'bn' | 'en'>('any');
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
      language,
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
      language,
      activate,
    ],
  );

  const problems = useMemo(() => validateDraft(draft, floorBid), [draft, floorBid]);
  const creativeProblems = useMemo(() => validateCreative(creative), [creative]);
  const funding = activationRefusal(draft, owner?.wallet_balance ?? 0);
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
    creative.thumbUrl ?? '',
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
      setLanguage('any');
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
            <Select
              label="Target language"
              value={language}
              options={[
                { value: 'any', label: 'All languages (Bangla & English)' },
                { value: 'bn', label: 'Bangla readers only' },
                { value: 'en', label: 'English readers only' },
              ]}
              onChange={(event) => {
                const next = event.target.value;
                setLanguage(next === 'bn' || next === 'en' ? next : 'any');
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
            Optional here, required before the campaign can run. Upload or crop an ImgBB visual,
            pick placement layout and platform reach, and preview below.
          </p>

          <CreativeFormFields
            draft={creative}
            inventory={inventory}
            problems={creativeProblems}
            onChange={setCreative}
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

function CreativeFormFields({
  draft,
  inventory,
  problems,
  onChange,
}: {
  draft: CreativeDraft;
  inventory: readonly PlacementRow[];
  problems: readonly { readonly field: string; readonly message: string }[];
  onChange: (next: CreativeDraft) => void;
}): ReactElement {
  const err = (field: string): string | undefined =>
    problems.find((problem) => problem.field === field)?.message;
  const platforms = draft.platforms ?? DEFAULT_CREATIVE_PLATFORMS;
  const layout = draft.layout ?? 'card';

  function togglePlatform(platform: AdPlatform): void {
    const exists = platforms.includes(platform);
    const next = exists ? platforms.filter((item) => item !== platform) : [...platforms, platform];
    onChange({ ...draft, platforms: next });
  }

  return (
    <div className="kit-stack" style={{ gap: 'var(--sp-3)' }}>
      <div className="kit-grid kit-grid--2">
        <Field
          label="Headline"
          value={draft.headline}
          hint={`${LIMITS.headlineMin}–${LIMITS.headlineMax} characters.`}
          error={err('headline')}
          onChange={(event) => onChange({ ...draft, headline: event.target.value })}
        />
        <Select
          label="Placement"
          value={draft.placement}
          options={PLACEMENTS.map((placement) => ({
            value: placement,
            label:
              inventory.length > 0
                ? placementHint(placement, inventory)
                : PLACEMENT_LABELS[placement],
          }))}
          onChange={(event) => onChange({ ...draft, placement: event.target.value as AdPlacement })}
        />
        <Field
          label="Destination"
          value={draft.targetUrl}
          hint="https only: a click is a promise about where the reader lands."
          error={err('targetUrl')}
          onChange={(event) => onChange({ ...draft, targetUrl: event.target.value })}
        />
        <Field
          label="Button label"
          value={draft.ctaLabel}
          hint={`Optional, up to ${LIMITS.ctaMax} characters.`}
          error={err('cta')}
          onChange={(event) => onChange({ ...draft, ctaLabel: event.target.value })}
        />
        <Select
          label="Layout style"
          value={layout}
          options={LAYOUTS.map((item) => ({ value: item, label: LAYOUT_LABELS[item] }))}
          onChange={(event) => onChange({ ...draft, layout: event.target.value as AdLayout })}
        />
        <Field
          label="Badge label"
          value={draft.badgeLabel ?? ''}
          maxLength={LIMITS.badgeMax}
          hint="Optional short tag next to Sponsored (e.g. Hiring, Event, Offer)."
          error={err('badgeLabel')}
          onChange={(event) => onChange({ ...draft, badgeLabel: event.target.value })}
        />
        <Field
          label="Accent color (hex)"
          value={draft.accentColor ?? ''}
          maxLength={7}
          hint="Optional border & CTA accent like #15803d. Empty uses platform green."
          error={err('accentColor')}
          onChange={(event) => onChange({ ...draft, accentColor: event.target.value })}
        />
        <div className="kit-stack" style={{ gap: '6px' }}>
          <span className="kit-small">
            <strong>Quick colors &amp; platforms</strong>
          </span>
          <div className="kit-row" style={{ gap: '6px', alignItems: 'center' }}>
            {ACCENT_PRESETS.map((hex) => (
              <Button
                key={hex || 'default'}
                type="button"
                size="small"
                variant={(draft.accentColor ?? '') === hex ? 'primary' : 'quiet'}
                onClick={() => onChange({ ...draft, accentColor: hex })}
              >
                {hex === '' ? 'Default' : hex}
              </Button>
            ))}
          </div>
          <div className="kit-row" style={{ gap: 'var(--sp-3)' }}>
            {PLATFORMS.map((platform) => (
              <label key={platform} className="kit-check" style={{ margin: 0 }}>
                <input
                  type="checkbox"
                  checked={platforms.includes(platform)}
                  onChange={() => togglePlatform(platform)}
                />
                <span>{PLATFORM_LABELS[platform]}</span>
              </label>
            ))}
          </div>
          {err('platforms') ? (
            <span className="kit-small kit-error">{err('platforms')}</span>
          ) : null}
        </div>
      </div>

      <TextArea
        label="Body"
        rows={2}
        value={draft.body}
        hint={`Up to ${LIMITS.bodyMax} characters. ${draft.body.length} used.`}
        error={err('body')}
        onChange={(event) => onChange({ ...draft, body: event.target.value })}
      />

      <AdImageField
        imageUrl={draft.imageUrl}
        thumbUrl={draft.thumbUrl ?? ''}
        imageAlt={draft.imageAlt ?? ''}
        error={err('imageUrl') ?? err('thumbUrl') ?? err('imageAlt')}
        onChange={(next) =>
          onChange({
            ...draft,
            imageUrl: next.imageUrl,
            thumbUrl: next.thumbUrl,
            imageAlt: next.imageAlt,
          })
        }
      />
    </div>
  );
}

function placementHint(placement: AdPlacement, inventory: readonly PlacementRow[]): string {
  const live = inventory.find((row) => row.placement === placement);
  if (!live) return PLACEMENT_LABELS[placement];
  return `${PLACEMENT_LABELS[placement]} — ${count(live.live_campaigns)} live, ${count(
    live.impressions_today,
  )} impressions today`;
}

function splitTags(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function Book({
  campaigns,
  inventory,
  onChanged,
}: {
  campaigns: readonly CampaignRow[];
  inventory: readonly PlacementRow[];
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
        <CampaignDetail campaignId={openId} env={env} inventory={inventory} onChanged={onChanged} />
      ) : null}
    </>
  );
}

interface LoadedCampaignDetail {
  readonly perf: {
    name: string;
    status: keyof typeof STATUS_LABELS;
    bid: number;
    pricing: AdPricing;
    daily_budget: number;
    total_budget: number;
    spent: number;
    wallet_balance: number;
    cost_per_click: number;
    cost_per_mille: number;
    review_note: string;
    active_creatives: number;
    creative_count: number;
    days_running: number;
  };
  readonly settings: CampaignDetailRow | null;
  readonly creatives: readonly CreativePerformanceRow[];
}

function CampaignDetail({
  campaignId,
  env,
  inventory,
  onChanged,
}: {
  campaignId: string;
  env: ReturnType<typeof useCorporateEnv>;
  inventory: readonly PlacementRow[];
  onChanged: () => void;
}): ReactElement {
  const load = useCallback(async (): Promise<LoadedCampaignDetail | null> => {
    const [perfRows, detailRows, creativeRows] = await Promise.all([
      callRpc<LoadedCampaignDetail['perf'][]>(env, 'campaign_performance', {
        p_campaign_id: campaignId,
      }),
      callRpc<CampaignDetailRow[]>(env, 'campaign_details', { p_campaign_id: campaignId }),
      callRpc<CreativePerformanceRow[]>(env, 'campaign_creative_details', {
        p_campaign_id: campaignId,
      }),
    ]);
    const perf = perfRows[0];
    if (!perf) return null;
    return {
      perf,
      settings: detailRows[0] ?? null,
      creatives: creativeRows ?? [],
    };
  }, [env, campaignId]);

  const { state, reload } = useAsync(load, [campaignId]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [noteFailed, setNoteFailed] = useState(false);
  const [editingSettings, setEditingSettings] = useState(false);
  const [editingCreativeId, setEditingCreativeId] = useState<string | null>(null);
  const [creative, setCreative] = useState<CreativeDraft>(EMPTY_CREATIVE);

  if (state.status === 'loading') return <Loading label="Loading the campaign." />;
  if (state.status === 'error') {
    return (
      <Banner tone="bad" title="The campaign did not load">
        <p className="kit-small">{state.message}</p>
      </Banner>
    );
  }
  if (state.data === null) return <Empty>The campaign answered with nothing.</Empty>;

  const { perf: row, settings, creatives } = state.data;
  const finished = row.status === 'completed';
  const creativeProblems = validateCreative(creative);

  async function runAction(fn: () => Promise<void>, successMessage: string): Promise<void> {
    setBusy(true);
    setNote(null);
    setNoteFailed(false);
    try {
      await fn();
      setNote(successMessage);
      reload();
      onChanged();
    } catch (error) {
      setNoteFailed(true);
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
        <Banner
          tone={noteFailed ? 'bad' : 'neutral'}
          title={noteFailed ? 'Action refused' : 'Last action'}
        >
          <p className="kit-small">{note}</p>
        </Banner>
      ) : null}

      <div className="kit-row">
        {row.status === 'draft' ||
        row.status === 'rejected' ||
        row.status === 'paused' ||
        row.status === 'pending_review' ? (
          <Button
            disabled={busy || row.active_creatives === 0}
            onClick={() =>
              void runAction(async () => {
                await callRpc(env, 'staff_activate_campaign', { p_campaign_id: campaignId });
              }, 'Campaign is now live and eligible to serve.')
            }
          >
            Activate now
          </Button>
        ) : null}
        {row.status === 'draft' || row.status === 'rejected' ? (
          <Button
            variant="quiet"
            disabled={busy || row.active_creatives === 0}
            onClick={() =>
              void runAction(async () => {
                await callRpc(env, 'submit_campaign', { p_campaign_id: campaignId });
              }, 'Sent for review. Approve it in Approvals.')
            }
          >
            Send for review
          </Button>
        ) : null}
        {row.status === 'active' ? (
          <Button
            variant="quiet"
            disabled={busy}
            onClick={() =>
              void runAction(async () => {
                await callRpc(env, 'set_campaign_paused', {
                  p_campaign_id: campaignId,
                  p_paused: true,
                });
              }, 'Paused. It serves nothing until resumed.')
            }
          >
            Pause
          </Button>
        ) : null}
        {row.status === 'paused' ? (
          <Button
            variant="quiet"
            disabled={busy}
            onClick={() =>
              void runAction(async () => {
                await callRpc(env, 'set_campaign_paused', {
                  p_campaign_id: campaignId,
                  p_paused: false,
                });
              }, 'Running again.')
            }
          >
            Resume
          </Button>
        ) : null}
        {!finished && settings !== null ? (
          <Button
            variant="quiet"
            disabled={busy}
            onClick={() => setEditingSettings((prev) => !prev)}
          >
            {editingSettings ? 'Hide campaign editor' : 'Edit campaign settings'}
          </Button>
        ) : null}
      </div>

      {editingSettings && settings !== null ? (
        <EditCampaignSettingsForm
          settings={settings}
          floorBid={inventory[0]?.floor_bid ?? LIMITS.bidMin}
          busy={busy}
          onSave={(payload) =>
            void runAction(async () => {
              await callRpc(env, 'staff_update_campaign', payload);
              setEditingSettings(false);
            }, 'Campaign settings updated.')
          }
        />
      ) : null}

      <h3>Creatives ({count(creatives.length)})</h3>
      {creatives.length === 0 ? (
        <Empty>No creative has been attached to this campaign yet.</Empty>
      ) : (
        <div className="kit-stack">
          {creatives.map((item) => (
            <div key={item.creative_id} className="kit-card" style={{ padding: 'var(--sp-3)' }}>
              <div
                className="kit-row"
                style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}
              >
                <div className="kit-row" style={{ alignItems: 'flex-start', flex: '1 1 240px' }}>
                  {item.image_url !== '' ? (
                    <img
                      src={item.thumb_url || item.image_url}
                      alt={item.image_alt || item.headline}
                      className="kit-ad-thumb"
                    />
                  ) : null}
                  <div>
                    <strong>{item.headline}</strong>
                    <div className="kit-small kit-muted">
                      {PLACEMENT_LABELS[item.placement]} ·{' '}
                      {LAYOUT_LABELS[item.layout] ?? item.layout} ·{' '}
                      {(item.platforms ?? DEFAULT_CREATIVE_PLATFORMS)
                        .map((p) => PLATFORM_LABELS[p])
                        .join(' + ')}
                    </div>
                    {item.body !== '' ? <p className="kit-small">{item.body}</p> : null}
                    <div className="kit-small kit-muted">
                      {count(item.impressions)} shown · {count(item.clicks)} clicked (
                      {percent(item.ctr)}) · {money(item.spend)} spent
                    </div>
                  </div>
                </div>
                <div className="kit-row">
                  <Badge tone={item.is_enabled ? 'ok' : 'neutral'}>
                    {item.is_enabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                  {!finished ? (
                    <>
                      <Button
                        size="small"
                        variant="quiet"
                        disabled={busy}
                        onClick={() =>
                          void runAction(
                            async () => {
                              await callRpc(env, 'staff_set_creative_enabled', {
                                p_creative_id: item.creative_id,
                                p_enabled: !item.is_enabled,
                              });
                            },
                            item.is_enabled ? 'Creative disabled.' : 'Creative enabled.',
                          )
                        }
                      >
                        {item.is_enabled ? 'Disable' : 'Enable'}
                      </Button>
                      <Button
                        size="small"
                        variant="quiet"
                        disabled={busy}
                        onClick={() =>
                          setEditingCreativeId(
                            editingCreativeId === item.creative_id ? null : item.creative_id,
                          )
                        }
                      >
                        {editingCreativeId === item.creative_id ? 'Close editor' : 'Edit'}
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>

              {editingCreativeId === item.creative_id && !finished ? (
                <EditCreativeForm
                  initial={item}
                  inventory={inventory}
                  busy={busy}
                  onCancel={() => setEditingCreativeId(null)}
                  onSave={(nextDraft) =>
                    void runAction(async () => {
                      await callRpc(
                        env,
                        'staff_update_creative',
                        updateCreativeArgs(item.creative_id, nextDraft),
                      );
                      setEditingCreativeId(null);
                    }, 'Creative updated.')
                  }
                />
              ) : null}
            </div>
          ))}
        </div>
      )}

      {!finished ? (
        <>
          <h3>Add another creative</h3>
          <CreativeFormFields
            draft={creative}
            inventory={inventory}
            problems={creativeProblems}
            onChange={setCreative}
          />
          <CreativePreview draft={creative} />
          <div className="kit-row">
            <Button
              variant="quiet"
              disabled={busy || creativeProblems.length > 0}
              onClick={() =>
                void runAction(async () => {
                  await callRpc<string>(
                    env,
                    'staff_add_creative',
                    creativeArgs(campaignId, creative),
                  );
                  setCreative(EMPTY_CREATIVE);
                }, 'Creative added.')
              }
            >
              Add creative
            </Button>
          </div>
        </>
      ) : null}
    </Card>
  );
}

function EditCampaignSettingsForm({
  settings,
  floorBid,
  busy,
  onSave,
}: {
  settings: CampaignDetailRow;
  floorBid: number;
  busy: boolean;
  onSave: (payload: Record<string, unknown>) => void;
}): ReactElement {
  const [name, setName] = useState(settings.name);
  const [pricing, setPricing] = useState<AdPricing>(settings.pricing);
  const [bidTaka, setBidTaka] = useState(poishaToTaka(settings.bid));
  const [budgetTaka, setBudgetTaka] = useState(poishaToTaka(settings.total_budget));
  const [dailyTaka, setDailyTaka] = useState(
    settings.daily_budget > 0 ? poishaToTaka(settings.daily_budget) : '',
  );
  const [startsAt, setStartsAt] = useState(settings.starts_at.slice(0, 10));
  const [endsAt, setEndsAt] = useState(settings.ends_at ? settings.ends_at.slice(0, 10) : '');
  const [cities, setCities] = useState((settings.target_cities ?? []).join(', '));
  const [topics, setTopics] = useState((settings.target_topics ?? []).join(', '));
  const [language, setLanguage] = useState<'any' | 'bn' | 'en'>(settings.target_language ?? 'any');

  const draft = useMemo(
    () => ({
      ownerUid: settings.owner_uid,
      name,
      pricing,
      bid: takaToPoisha(bidTaka),
      totalBudget: takaToPoisha(budgetTaka),
      dailyBudget: dailyTaka.trim() === '' ? 0 : takaToPoisha(dailyTaka),
      startsAt,
      endsAt,
      cities: splitTags(cities),
      topics: splitTags(topics),
      language,
      activate: false,
    }),
    [
      settings.owner_uid,
      name,
      pricing,
      bidTaka,
      budgetTaka,
      dailyTaka,
      startsAt,
      endsAt,
      cities,
      topics,
      language,
    ],
  );
  const problems = useMemo(() => validateDraft(draft, floorBid), [draft, floorBid]);
  const spendProblem =
    draft.totalBudget < settings.spent
      ? `Budget cannot be lower than already spent (${money(settings.spent)}).`
      : null;

  return (
    <div className="kit-card" style={{ padding: 'var(--sp-3)' }}>
      <h4>Edit campaign settings</h4>
      <div className="kit-grid kit-grid--2">
        <Field label="Campaign name" value={name} onChange={(e) => setName(e.target.value)} />
        <Select
          label="Charged per"
          value={pricing}
          options={[
            { value: 'cpm', label: 'Thousand impressions (CPM)' },
            { value: 'cpc', label: 'Click (CPC)' },
          ]}
          onChange={(e) => setPricing(e.target.value === 'cpc' ? 'cpc' : 'cpm')}
        />
        <Field
          label={pricing === 'cpm' ? 'Bid per thousand (৳)' : 'Bid per click (৳)'}
          inputMode="decimal"
          value={bidTaka}
          onChange={(e) => setBidTaka(e.target.value)}
        />
        <Field
          label="Total budget (৳)"
          inputMode="decimal"
          value={budgetTaka}
          onChange={(e) => setBudgetTaka(e.target.value)}
        />
        <Field
          label="Daily cap (৳)"
          inputMode="decimal"
          value={dailyTaka}
          onChange={(e) => setDailyTaka(e.target.value)}
        />
        <Select
          label="Target language"
          value={language}
          options={[
            { value: 'any', label: 'All languages' },
            { value: 'bn', label: 'Bangla only' },
            { value: 'en', label: 'English only' },
          ]}
          onChange={(e) => {
            const val = e.target.value;
            setLanguage(val === 'bn' || val === 'en' ? val : 'any');
          }}
        />
        <Field
          label="Starts"
          type="date"
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
        />
        <Field
          label="Ends"
          type="date"
          value={endsAt}
          onChange={(e) => setEndsAt(e.target.value)}
        />
        <Field label="Cities" value={cities} onChange={(e) => setCities(e.target.value)} />
        <Field label="Topics" value={topics} onChange={(e) => setTopics(e.target.value)} />
      </div>
      {(spendProblem ?? problems[0]?.message) ? (
        <p className="kit-small kit-error">{spendProblem ?? problems[0]?.message}</p>
      ) : null}
      <Button
        size="small"
        disabled={busy || problems.length > 0 || spendProblem !== null}
        onClick={() => onSave(updateCampaignArgs(settings.campaign_id, draft))}
      >
        Save campaign changes
      </Button>
    </div>
  );
}

function EditCreativeForm({
  initial,
  inventory,
  busy,
  onCancel,
  onSave,
}: {
  initial: CreativePerformanceRow;
  inventory: readonly PlacementRow[];
  busy: boolean;
  onCancel: () => void;
  onSave: (draft: CreativeDraft) => void;
}): ReactElement {
  const [draft, setDraft] = useState<CreativeDraft>({
    placement: initial.placement,
    headline: initial.headline,
    body: initial.body,
    targetUrl: initial.target_url,
    imageUrl: initial.image_url,
    ctaLabel: initial.cta_label,
    thumbUrl: initial.thumb_url,
    imageAlt: initial.image_alt,
    layout: initial.layout ?? 'card',
    accentColor: initial.accent_color,
    badgeLabel: initial.badge_label,
    platforms: initial.platforms?.length ? initial.platforms : [...DEFAULT_CREATIVE_PLATFORMS],
    isEnabled: initial.is_enabled,
  });
  const problems = validateCreative(draft);

  return (
    <div
      className="kit-stack"
      style={{
        marginTop: 'var(--sp-3)',
        paddingTop: 'var(--sp-3)',
        borderTop: '1px solid var(--c-line)',
      }}
    >
      <CreativeFormFields
        draft={draft}
        inventory={inventory}
        problems={problems}
        onChange={setDraft}
      />
      <CreativePreview draft={draft} />
      <div className="kit-row">
        <Button size="small" disabled={busy || problems.length > 0} onClick={() => onSave(draft)}>
          Save creative
        </Button>
        <Button size="small" variant="quiet" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/**
 * Live visual preview of the creative in its chosen placement, layout, accent
 * color, badge label, and ImgBB artwork.
 */
export function CreativePreview({ draft }: { draft: CreativeDraft }): ReactElement {
  const layout = draft.layout ?? 'card';
  const badge = draft.badgeLabel?.trim() || 'Sponsored';
  const platforms = draft.platforms ?? DEFAULT_CREATIVE_PLATFORMS;
  const mediaSrc = (draft.thumbUrl ?? '').trim() || draft.imageUrl.trim();
  const hasMedia = mediaSrc !== '' && isImgbbUrl(mediaSrc);
  const accentStyle =
    draft.accentColor && /^#[0-9a-fA-F]{6}$/.test(draft.accentColor.trim())
      ? ({ '--ad-accent': draft.accentColor.trim() } as CSSProperties)
      : undefined;

  return (
    <div className={`kit-adpreview kit-adpreview--${layout}`} style={accentStyle}>
      <div className="kit-adpreview-head">
        <span className="kit-badge">
          {badge} · {PLACEMENT_LABELS[draft.placement]} · {LAYOUT_LABELS[layout]}
        </span>
        <div className="kit-adpreview-chips">
          {platforms.map((platform) => (
            <span key={platform} className="kit-badge">
              {PLATFORM_LABELS[platform]}
            </span>
          ))}
        </div>
      </div>

      <div className="kit-adpreview-body">
        {hasMedia ? (
          <img
            src={mediaSrc}
            alt={draft.imageAlt?.trim() || draft.headline || 'Ad creative preview'}
            className="kit-adpreview-media"
          />
        ) : null}
        <div className="kit-stack" style={{ gap: 'var(--sp-1)' }}>
          <strong>{draft.headline.trim() === '' ? 'Headline' : draft.headline}</strong>
          <p className="kit-small">{draft.body.trim() === '' ? 'Body copy.' : draft.body}</p>
          {draft.ctaLabel.trim().length > 0 ? (
            <span
              className="kit-btn kit-btn--small"
              style={
                draft.accentColor && /^#[0-9a-fA-F]{6}$/.test(draft.accentColor.trim())
                  ? {
                      backgroundColor: draft.accentColor.trim(),
                      borderColor: draft.accentColor.trim(),
                    }
                  : undefined
              }
            >
              {draft.ctaLabel}
            </span>
          ) : null}
          <span className="kit-small kit-muted">{draft.targetUrl || 'https://…'}</span>
        </div>
      </div>
    </div>
  );
}

/** Exported for the tests that check a saved bid round-trips through the form. */
export const roundTrip = (poisha: number): number => takaToPoisha(poishaToTaka(poisha));

/** Exported so a screen can say when a campaign is started but not yet reviewed. */
export const startsOn = (value: string): string => dateToIso(value).slice(0, 10);
