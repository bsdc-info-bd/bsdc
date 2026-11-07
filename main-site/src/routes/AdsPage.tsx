import { Megaphone } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Seo } from '@/components/seo/Seo';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  LinkButton,
  PageSkeleton,
  ProgressBar,
  SectionHeading,
  StatCard,
  TextField,
  TextareaField,
} from '@/design-system';
import { useCampaignDetail, useCampaigns } from '@/hooks/use-ads';
import {
  budgetProgress,
  budgetRemaining,
  canEdit,
  canPause,
  canResume,
  clickThroughRate,
  effectiveCostPerClick,
  pauseReasonKey,
  validateCopy,
  type CampaignCreative,
  type CreativeCopy,
} from '@/lib/ads/ads-types';
import { formatNumber } from '@/lib/format';
import { formatMoney } from '@/lib/market/market-types';
import { ROUTES } from '@/lib/site';
import { dataErrorKey } from '@/lib/supabase/errors';
import { selectIsSignedIn, useAuthStore } from '@/store/auth-store';

/** A private performance page, not a self-service campaign builder. */
export default function AdsPage() {
  const { t } = useTranslation();
  const signedIn = useAuthStore(selectIsSignedIn);
  const uid = useAuthStore((state) => state.user?.uid ?? null);

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
        {!signedIn || uid === null ? (
          <Alert tone="info" title={t('ads.signInTitle')} className="mt-4">
            <LinkButton to={ROUTES.login} size="sm" className="mt-2">
              {t('ads.signInAction')}
            </LinkButton>
          </Alert>
        ) : (
          // Unmount the selected campaign and any unsaved copy when users switch.
          <Dashboard key={uid} />
        )}
      </div>
    </>
  );
}

function Dashboard() {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const { campaigns, balance, isLoading, isError, setPaused, editCopy, isSaving } = useCampaigns();
  const [openId, setOpenId] = useState<string | null>(null);
  const detail = useCampaignDetail(openId);

  async function pause(campaignId: string, paused: boolean): Promise<void> {
    try {
      await setPaused(campaignId, paused);
      toast.success(paused ? t('ads.paused') : t('ads.resumed'));
    } catch (error) {
      toast.error(t(dataErrorKey(error)));
    }
  }

  if (isLoading) return <PageSkeleton label={t('common.loading')} />;
  if (isError) return <Alert tone="danger" title={t('ads.failed')} className="mt-4" />;

  return (
    <>
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
          hint={t('ads.shownCampaignsHint')}
        />
      </div>

      {campaigns.length === 0 ? (
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
          const reason = pauseReasonKey(campaign, new Date(), balance);
          const isOpen = openId === campaign.id;
          return (
            <Card as="li" key={campaign.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="font-semibold">{campaign.name}</h2>
                  <p className="mt-1 text-xs text-muted">
                    {t('ads.counted', {
                      impressions: formatNumber(campaign.impressions, language),
                      clicks: formatNumber(campaign.clicks, language),
                    })}{' '}
                    ·{' '}
                    {t('ads.ctr', {
                      value: clickThroughRate(campaign.impressions, campaign.clicks),
                    })}
                    {' · '}
                    {campaign.clicks > 0
                      ? t('ads.costPerClick', {
                          amount: formatMoney(
                            effectiveCostPerClick(campaign.spent, campaign.clicks),
                            'BDT',
                            language,
                          ),
                        })
                      : t('ads.costPerClickUnknown')}
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
                {canPause(campaign.status) ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={isSaving}
                    onClick={() => void pause(campaign.id, true)}
                  >
                    {t('ads.pause')}
                  </Button>
                ) : null}
                {canResume(campaign.status) ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={isSaving}
                    onClick={() => void pause(campaign.id, false)}
                  >
                    {t('ads.resume')}
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="secondary"
                  aria-expanded={isOpen}
                  onClick={() => setOpenId(isOpen ? null : campaign.id)}
                >
                  {isOpen ? t('ads.closeDetails') : t('ads.viewDetails')}
                </Button>
              </div>

              {isOpen ? (
                <div className="mt-4 border-t border-border pt-4">
                  {detail.isLoading ? <PageSkeleton label={t('common.loading')} /> : null}
                  {detail.isError ? <Alert tone="danger" title={t('ads.detailsFailed')} /> : null}
                  {!detail.isLoading && !detail.isError ? (
                    <>
                      <h3 className="text-sm font-semibold">{t('ads.dailyTitle')}</h3>
                      {detail.daily.length === 0 ? (
                        <p className="mt-2 text-sm text-muted">{t('ads.noDaily')}</p>
                      ) : (
                        <div className="mt-2 overflow-x-auto">
                          <table className="w-full text-left text-sm">
                            <thead>
                              <tr>
                                <th>{t('ads.day')}</th>
                                <th>{t('ads.views')}</th>
                                <th>{t('ads.clicks')}</th>
                                <th>{t('ads.spend')}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {detail.daily.map((day) => (
                                <tr key={day.day} className="border-t border-border">
                                  <td className="py-2">{day.day}</td>
                                  <td>{formatNumber(day.impressions, language)}</td>
                                  <td>{formatNumber(day.clicks, language)}</td>
                                  <td>{formatMoney(day.spend, 'BDT', language)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      <h3 className="mt-4 text-sm font-semibold">
                        {t('ads.creatives', {
                          total: formatNumber(campaign.creativeCount, language),
                        })}
                      </h3>
                      <ul className="mt-2 grid gap-2">
                        {detail.creatives.map((creative) => (
                          <Creative
                            key={creative.id}
                            creative={creative}
                            editable={canEdit(campaign.status)}
                            isSaving={isSaving}
                            editCopy={editCopy}
                            language={language}
                          />
                        ))}
                      </ul>
                    </>
                  ) : null}
                </div>
              ) : null}
            </Card>
          );
        })}
      </ul>
    </>
  );
}

function Creative({
  creative,
  editable,
  isSaving,
  editCopy,
  language,
}: {
  creative: CampaignCreative;
  editable: boolean;
  isSaving: boolean;
  editCopy: (creativeId: string, copy: CreativeCopy) => Promise<void>;
  language: 'bn' | 'en';
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [copy, setCopy] = useState<CreativeCopy>({
    headline: creative.headline,
    body: creative.body,
    ctaLabel: creative.ctaLabel,
  });
  const problems = validateCopy(copy);
  const errorFor = (field: string): string | undefined => {
    const problem = problems.find((item) => item.field === field);
    return problem ? t(problem.key) : undefined;
  };

  async function save(): Promise<void> {
    try {
      await editCopy(creative.id, copy);
      setEditing(false);
      toast.success(t('ads.copySaved'));
    } catch (error) {
      toast.error(t(dataErrorKey(error)));
    }
  }

  return (
    <li className="rounded-card border border-border p-3">
      <p className="font-medium">{creative.headline}</p>
      {creative.body ? <p className="mt-1 text-sm">{creative.body}</p> : null}
      <p className="mt-1 text-xs text-muted">
        {t(`ads.placements.${creative.placement}`)} ·{' '}
        {t('ads.counted', {
          impressions: formatNumber(creative.impressions, language),
          clicks: formatNumber(creative.clicks, language),
        })}{' '}
        · {formatMoney(creative.spend, 'BDT', language)}
      </p>
      {editable && !editing ? (
        <Button
          size="sm"
          variant="secondary"
          className="mt-3"
          onClick={() => {
            setCopy({
              headline: creative.headline,
              body: creative.body,
              ctaLabel: creative.ctaLabel,
            });
            setEditing(true);
          }}
        >
          {t('ads.editCopy')}
        </Button>
      ) : null}
      {editing ? (
        <div className="mt-3 grid gap-3">
          <Alert tone="warning" title={t('ads.copyReviewTitle')}>
            {t('ads.copyReviewBody')}
          </Alert>
          <TextField
            label={t('ads.fieldHeadline')}
            value={copy.headline}
            error={errorFor('headline')}
            onChange={(event) => setCopy({ ...copy, headline: event.target.value })}
          />
          <TextareaField
            label={t('ads.fieldBody')}
            value={copy.body}
            rows={2}
            counterMax={200}
            error={errorFor('body')}
            onChange={(event) => setCopy({ ...copy, body: event.target.value })}
          />
          <TextField
            label={t('ads.fieldCta')}
            value={copy.ctaLabel}
            error={errorFor('ctaLabel')}
            onChange={(event) => setCopy({ ...copy, ctaLabel: event.target.value })}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={isSaving || problems.length > 0}
              onClick={() => void save()}
            >
              {t('ads.saveCopy')}
            </Button>
            <Button size="sm" variant="ghost" disabled={isSaving} onClick={() => setEditing(false)}>
              {t('ads.cancelCopy')}
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
