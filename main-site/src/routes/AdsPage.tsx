import { Megaphone } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Seo } from '@/components/seo/Seo';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  PageSkeleton,
  ProgressBar,
  SectionHeading,
  SelectField,
  StatCard,
  TagInput,
  TextField,
  TextareaField,
} from '@/design-system';
import { useCampaignDetail, useCampaigns } from '@/hooks/use-ads';
import {
  AD_PLACEMENTS,
  budgetProgress,
  budgetRemaining,
  canPause,
  canResume,
  canSubmit,
  clickThroughRate,
  forecastEvents,
  pauseReasonKey,
  takaToPoisha,
  validateCampaign,
  validateCreative,
  type AdPlacement,
  type AdPricing,
  type CampaignDraft,
  type CreativeDraft,
} from '@/lib/ads/ads-types';
import { formatNumber } from '@/lib/format';
import { formatMoney } from '@/lib/market/market-types';
import { ROUTES } from '@/lib/site';
import { dataErrorKey } from '@/lib/supabase/errors';
import { selectIsSignedIn, useAuthStore } from '@/store/auth-store';

const EMPTY_CREATIVE: CreativeDraft = {
  placement: 'feed',
  headline: '',
  body: '',
  imageUrl: '',
  ctaLabel: '',
  targetUrl: '',
};

/** The advertiser console: wallet, campaigns, creatives and what they earned. */
export default function AdsPage() {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const isSignedIn = useAuthStore(selectIsSignedIn);
  const {
    campaigns,
    balance,
    isLoading,
    isError,
    create,
    addCreative,
    submit,
    setPaused,
    isSaving,
  } = useCampaigns();

  const [name, setName] = useState('');
  const [pricing, setPricing] = useState<AdPricing>('cpm');
  const [bidTaka, setBidTaka] = useState('');
  const [budgetTaka, setBudgetTaka] = useState('');
  const [dailyTaka, setDailyTaka] = useState('');
  const [cities, setCities] = useState<string[]>([]);
  const [topics, setTopics] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creative, setCreative] = useState<CreativeDraft>(EMPTY_CREATIVE);

  const detail = useCampaignDetail(openId);

  const draft: CampaignDraft = useMemo(
    () => ({
      name,
      pricing,
      bid: takaToPoisha(bidTaka),
      totalBudget: takaToPoisha(budgetTaka),
      dailyBudget: dailyTaka.trim().length === 0 ? 0 : takaToPoisha(dailyTaka),
      cities,
      topics,
      language: 'any',
    }),
    [name, pricing, bidTaka, budgetTaka, dailyTaka, cities, topics],
  );

  const problems = useMemo(() => validateCampaign(draft), [draft]);
  const creativeProblems = useMemo(() => validateCreative(creative), [creative]);
  const forecast = useMemo(
    () => forecastEvents(draft.pricing, Math.max(0, draft.bid), Math.max(0, draft.totalBudget)),
    [draft],
  );

  const problemFor = (field: string): string | undefined => {
    const problem = problems.find((item) => item.field === field);
    return problem ? t(problem.key) : undefined;
  };

  async function submitDraft(): Promise<void> {
    try {
      await create(draft);
      toast.success(t('ads.created'));
      setName('');
      setBidTaka('');
      setBudgetTaka('');
      setDailyTaka('');
      setCities([]);
      setTopics([]);
    } catch (error) {
      toast.error(t(dataErrorKey(error)));
    }
  }

  async function submitCreative(campaignId: string): Promise<void> {
    try {
      await addCreative(campaignId, creative);
      toast.success(t('ads.creativeAdded'));
      setCreative(EMPTY_CREATIVE);
    } catch (error) {
      toast.error(t(dataErrorKey(error)));
    }
  }

  async function review(campaignId: string): Promise<void> {
    try {
      await submit(campaignId);
      toast.success(t('ads.submitted'));
    } catch (error) {
      toast.error(t(dataErrorKey(error)));
    }
  }

  async function pause(campaignId: string, paused: boolean): Promise<void> {
    try {
      await setPaused(campaignId, paused);
      toast.success(paused ? t('ads.paused') : t('ads.resumed'));
    } catch (error) {
      toast.error(t(dataErrorKey(error)));
    }
  }

  return (
    <>
      <Seo
        title={t('ads.metaTitle')}
        description={t('ads.metaDescription')}
        path={ROUTES.ads}
        noindex
      />

      <div className="fab-container max-w-4xl py-6 sm:py-10">
        <SectionHeading title={t('ads.title')} description={t('ads.description')} />

        {!isSignedIn ? <Alert tone="info" title={t('ads.signInTitle')} className="mt-4" /> : null}
        {isError ? <Alert tone="danger" title={t('ads.failed')} className="mt-4" /> : null}

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <StatCard
            icon={<Megaphone size={16} />}
            label={t('ads.walletBalance')}
            value={formatMoney(balance, 'BDT', language)}
            hint={t('ads.walletHint')}
          />
          <StatCard
            icon={<Megaphone size={16} />}
            label={t('ads.liveCampaigns')}
            value={formatNumber(
              campaigns.filter((campaign) => campaign.status === 'active').length,
              language,
            )}
          />
          <StatCard
            icon={<Megaphone size={16} />}
            label={t('ads.totalSpend')}
            value={formatMoney(
              campaigns.reduce((total, campaign) => total + campaign.spent, 0),
              'BDT',
              language,
            )}
          />
        </div>

        <Card className="mt-4">
          <h2 className="text-lg font-semibold">{t('ads.newTitle')}</h2>
          <p className="mt-1 text-sm text-muted">{t('ads.newBody')}</p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <TextField
              label={t('ads.fieldName')}
              value={name}
              error={name.length > 0 ? problemFor('name') : undefined}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
            <SelectField
              label={t('ads.fieldPricing')}
              value={pricing}
              options={[
                { value: 'cpm', label: t('ads.pricings.cpm') },
                { value: 'cpc', label: t('ads.pricings.cpc') },
              ]}
              onChange={(event) => {
                setPricing(event.target.value === 'cpc' ? 'cpc' : 'cpm');
              }}
            />
            <TextField
              label={pricing === 'cpm' ? t('ads.fieldBidCpm') : t('ads.fieldBidCpc')}
              inputMode="decimal"
              value={bidTaka}
              error={bidTaka.length > 0 ? problemFor('bid') : undefined}
              onChange={(event) => {
                setBidTaka(event.target.value);
              }}
            />
            <TextField
              label={t('ads.fieldBudget')}
              inputMode="decimal"
              value={budgetTaka}
              error={budgetTaka.length > 0 ? problemFor('totalBudget') : undefined}
              onChange={(event) => {
                setBudgetTaka(event.target.value);
              }}
            />
            <TextField
              label={t('ads.fieldDaily')}
              inputMode="decimal"
              value={dailyTaka}
              hint={t('ads.dailyHint')}
              error={dailyTaka.length > 0 ? problemFor('dailyBudget') : undefined}
              onChange={(event) => {
                setDailyTaka(event.target.value);
              }}
            />
            <TagInput label={t('ads.fieldCities')} value={cities} onChange={setCities} max={10} />
            <TagInput label={t('ads.fieldTopics')} value={topics} onChange={setTopics} max={10} />
          </div>

          {draft.bid > 0 && draft.totalBudget > 0 ? (
            <p className="mt-3 text-sm text-muted">
              {pricing === 'cpm'
                ? t('ads.forecastImpressions', {
                    total: formatNumber(forecast.impressions, language),
                  })
                : t('ads.forecastClicks', { total: formatNumber(forecast.clicks, language) })}
            </p>
          ) : null}

          <Button
            className="mt-4"
            disabled={isSaving || problems.length > 0}
            onClick={() => {
              void submitDraft();
            }}
          >
            {t('ads.create')}
          </Button>
        </Card>

        {isLoading ? <PageSkeleton label={t('common.loading')} /> : null}

        {!isLoading && isSignedIn && campaigns.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={<Megaphone size={22} />}
              title={t('ads.emptyTitle')}
              description={t('ads.emptyBody')}
            />
          </div>
        ) : null}

        <ul className="mt-4 grid gap-3">
          {campaigns.map((campaign) => {
            const reason = pauseReasonKey(campaign);
            const isOpen = openId === campaign.id;
            return (
              <Card as="li" key={campaign.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">{campaign.name}</p>
                    <p className="mt-1 text-xs text-muted">
                      {t(`ads.pricings.${campaign.pricing}`)} ·{' '}
                      {formatMoney(campaign.bid, 'BDT', language)} ·{' '}
                      {t('ads.ctr', {
                        value: clickThroughRate(campaign.impressions, campaign.clicks),
                      })}
                    </p>
                  </div>
                  <Badge
                    tone={
                      campaign.status === 'active'
                        ? 'green'
                        : campaign.status === 'rejected'
                          ? 'danger'
                          : 'neutral'
                    }
                  >
                    {t(`ads.statuses.${campaign.status}`)}
                  </Badge>
                </div>

                <div className="mt-3">
                  <ProgressBar
                    value={budgetProgress(campaign) * 100}
                    label={t('ads.budgetUsed', {
                      spent: formatMoney(campaign.spent, 'BDT', language),
                      total: formatMoney(campaign.totalBudget, 'BDT', language),
                    })}
                  />
                  <p className="mt-1 text-xs text-muted">
                    {t('ads.remaining', {
                      amount: formatMoney(budgetRemaining(campaign), 'BDT', language),
                    })}{' '}
                    ·{' '}
                    {t('ads.counted', {
                      impressions: formatNumber(campaign.impressions, language),
                      clicks: formatNumber(campaign.clicks, language),
                    })}
                  </p>
                </div>

                {campaign.reviewNote.length > 0 ? (
                  <Alert tone="warning" title={t('ads.reviewNote')} className="mt-3">
                    {campaign.reviewNote}
                  </Alert>
                ) : null}
                {reason !== null && campaign.status === 'active' ? (
                  <p className="mt-2 text-xs text-muted">{t(reason)}</p>
                ) : null}

                <div className="mt-3 flex flex-wrap gap-2">
                  {canSubmit(campaign.status) ? (
                    <Button
                      size="sm"
                      disabled={isSaving || campaign.creativeCount === 0}
                      onClick={() => {
                        void review(campaign.id);
                      }}
                    >
                      {t('ads.submit')}
                    </Button>
                  ) : null}
                  {canPause(campaign.status) ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isSaving}
                      onClick={() => {
                        void pause(campaign.id, true);
                      }}
                    >
                      {t('ads.pause')}
                    </Button>
                  ) : null}
                  {canResume(campaign.status) ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={isSaving}
                      onClick={() => {
                        void pause(campaign.id, false);
                      }}
                    >
                      {t('ads.resume')}
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setOpenId(isOpen ? null : campaign.id);
                    }}
                  >
                    {t('ads.creatives', {
                      total: formatNumber(campaign.creativeCount, language),
                    })}
                  </Button>
                </div>

                {isOpen ? (
                  <div className="mt-4 border-t border-border pt-4">
                    <ul className="grid gap-2">
                      {detail.creatives.map((item) => (
                        <li key={item.id} className="rounded-card border border-border p-3">
                          <p className="font-medium">{item.headline}</p>
                          <p className="mt-1 text-xs text-muted">
                            {t(`ads.placements.${item.placement}`)} ·{' '}
                            {t('ads.counted', {
                              impressions: formatNumber(item.impressions, language),
                              clicks: formatNumber(item.clicks, language),
                            })}{' '}
                            · {formatMoney(item.spend, 'BDT', language)}
                          </p>
                        </li>
                      ))}
                    </ul>

                    <h3 className="mt-4 text-sm font-semibold">{t('ads.addCreative')}</h3>
                    <div className="mt-2 grid gap-3 sm:grid-cols-2">
                      <TextField
                        label={t('ads.fieldHeadline')}
                        value={creative.headline}
                        onChange={(event) => {
                          setCreative({ ...creative, headline: event.target.value });
                        }}
                      />
                      <SelectField
                        label={t('ads.fieldPlacement')}
                        value={creative.placement}
                        options={AD_PLACEMENTS.map((placement) => ({
                          value: placement,
                          label: t(`ads.placements.${placement}`),
                        }))}
                        onChange={(event) => {
                          setCreative({
                            ...creative,
                            placement: event.target.value as AdPlacement,
                          });
                        }}
                      />
                      <TextField
                        label={t('ads.fieldUrl')}
                        value={creative.targetUrl}
                        hint={t('ads.urlHint')}
                        onChange={(event) => {
                          setCreative({ ...creative, targetUrl: event.target.value });
                        }}
                      />
                      <TextField
                        label={t('ads.fieldCta')}
                        value={creative.ctaLabel}
                        onChange={(event) => {
                          setCreative({ ...creative, ctaLabel: event.target.value });
                        }}
                      />
                    </div>
                    <TextareaField
                      className="mt-3"
                      label={t('ads.fieldBody')}
                      rows={2}
                      counterMax={200}
                      value={creative.body}
                      onChange={(event) => {
                        setCreative({ ...creative, body: event.target.value });
                      }}
                    />
                    <Button
                      className="mt-3"
                      size="sm"
                      disabled={isSaving || creativeProblems.length > 0}
                      onClick={() => {
                        void submitCreative(campaign.id);
                      }}
                    >
                      {t('ads.addCreative')}
                    </Button>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </ul>
      </div>
    </>
  );
}
