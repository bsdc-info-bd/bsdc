import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Alert, Button, Card, SelectField, TextField, TextareaField } from '@/design-system';
import { useAdBuilder } from '@/hooks/use-ad-builder';
import {
  BUILDER_LIMITS,
  EMPTY_BUILDER,
  toCreatePayload,
  validateNewCampaign,
  type BuilderErrorKey,
  type BuilderErrors,
  type NewCampaignInput,
} from '@/lib/ads/ads-builder';
import type { AdPlacement, AdPlatform, AdPricing } from '@/lib/ads/ads-types';
import { dataErrorKey } from '@/lib/supabase/errors';

const PLACEMENTS: readonly AdPlacement[] = ['feed', 'sidebar', 'shop', 'search', 'article'];
const PLATFORMS: readonly AdPlatform[] = ['web', 'android'];

interface CreateCampaignFormProps {
  onCreated: (campaignId: string) => void;
  onCancel: () => void;
}

/**
 * The campaign form: campaign terms, the one creative that will run, and the
 * schedule. Saving creates a draft. The budget is paid for on the next step.
 */
export function CreateCampaignForm({ onCreated, onCancel }: CreateCampaignFormProps) {
  const { t } = useTranslation();
  const { createCampaign, isCreating } = useAdBuilder();
  const [values, setValues] = useState<NewCampaignInput>(EMPTY_BUILDER);
  const [errors, setErrors] = useState<BuilderErrors>({});
  const [failed, setFailed] = useState(false);

  function set<K extends keyof NewCampaignInput>(key: K, value: NewCampaignInput[K]): void {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function togglePlatform(platform: AdPlatform, on: boolean): void {
    const next = on
      ? [...values.platforms, platform]
      : values.platforms.filter((item) => item !== platform);
    set(
      'platforms',
      PLATFORMS.filter((item) => next.includes(item)),
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFailed(false);
    const found = validateNewCampaign(values, new Date());
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    try {
      const id = await createCampaign(toCreatePayload(values, new Date()));
      toast.success(t('ads.builder.saved'));
      onCreated(id);
    } catch (error) {
      setFailed(true);
      toast.error(t(dataErrorKey(error)));
    }
  }

  const errorText = (key: BuilderErrorKey): string | undefined =>
    errors[key] ? t(`ads.builder.errors.${key}`) : undefined;

  return (
    <Card as="section" aria-labelledby="ad-builder-title" className="grid gap-5">
      <div>
        <h2 id="ad-builder-title" className="text-lg font-semibold">
          {t('ads.builder.formTitle')}
        </h2>
        <p className="mt-1 text-sm text-muted">{t('ads.builder.formIntro')}</p>
      </div>

      <form className="grid gap-5" onSubmit={onSubmit} noValidate>
        <fieldset className="grid gap-4">
          <legend className="text-sm font-semibold">{t('ads.builder.sectionCampaign')}</legend>
          <TextField
            label={t('ads.builder.name')}
            value={values.name}
            maxLength={BUILDER_LIMITS.nameMax}
            onChange={(event) => set('name', event.target.value)}
            error={errorText('name')}
            required
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label={t('ads.builder.pricing')}
              value={values.pricing}
              onChange={(event) => set('pricing', event.target.value as AdPricing)}
              options={[
                { value: 'cpc', label: t('ads.builder.pricingCpc') },
                { value: 'cpm', label: t('ads.builder.pricingCpm') },
              ]}
            />
            <TextField
              label={t('ads.builder.bid')}
              inputMode="decimal"
              value={values.bidTaka}
              hint={t('ads.builder.bidHint')}
              onChange={(event) => set('bidTaka', event.target.value)}
              error={errorText('bid')}
              required
            />
          </div>
        </fieldset>

        <fieldset className="grid gap-4">
          <legend className="text-sm font-semibold">{t('ads.builder.sectionSchedule')}</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label={t('ads.builder.budget')}
              inputMode="decimal"
              value={values.budgetTaka}
              hint={t('ads.builder.budgetHint')}
              onChange={(event) => set('budgetTaka', event.target.value)}
              error={errorText('budget')}
              required
            />
            <TextField
              label={t('ads.builder.dailyCap')}
              inputMode="decimal"
              value={values.dailyCapTaka}
              hint={t('ads.builder.dailyCapHint')}
              onChange={(event) => set('dailyCapTaka', event.target.value)}
              error={errorText('dailyCap')}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label={t('ads.builder.startsOn')}
              type="date"
              value={values.startsOn}
              hint={t('ads.builder.startsHint')}
              onChange={(event) => set('startsOn', event.target.value)}
              error={errorText('schedule')}
            />
            <TextField
              label={t('ads.builder.endsOn')}
              type="date"
              value={values.endsOn}
              onChange={(event) => set('endsOn', event.target.value)}
            />
          </div>
          <SelectField
            label={t('ads.builder.language')}
            value={values.language}
            onChange={(event) =>
              set('language', event.target.value as NewCampaignInput['language'])
            }
            options={[
              { value: 'any', label: t('ads.builder.languageAny') },
              { value: 'bn', label: t('ads.builder.languageBn') },
              { value: 'en', label: t('ads.builder.languageEn') },
            ]}
          />
        </fieldset>

        <fieldset className="grid gap-4">
          <legend className="text-sm font-semibold">{t('ads.builder.sectionCreative')}</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label={t('ads.builder.placement')}
              value={values.placement}
              onChange={(event) => set('placement', event.target.value as AdPlacement)}
              options={PLACEMENTS.map((placement) => ({
                value: placement,
                label: t(`ads.builder.placements.${placement}`),
              }))}
            />
            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium">{t('ads.builder.platforms')}</legend>
              {PLATFORMS.map((platform) => (
                <label key={platform} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={values.platforms.includes(platform)}
                    onChange={(event) => togglePlatform(platform, event.target.checked)}
                  />
                  {t(`ads.builder.platform.${platform}`)}
                </label>
              ))}
              {errorText('platforms') ? (
                <p className="text-xs text-danger">{errorText('platforms')}</p>
              ) : null}
            </fieldset>
          </div>
          <TextField
            label={t('ads.builder.headline')}
            value={values.headline}
            maxLength={BUILDER_LIMITS.headlineMax}
            onChange={(event) => set('headline', event.target.value)}
            error={errorText('headline')}
            required
          />
          <TextareaField
            label={t('ads.builder.body')}
            value={values.body}
            hint={t('ads.builder.bodyHint')}
            counterMax={BUILDER_LIMITS.bodyMax}
            onChange={(event) => set('body', event.target.value)}
            error={errorText('body')}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label={t('ads.builder.ctaLabel')}
              value={values.ctaLabel}
              maxLength={BUILDER_LIMITS.ctaMax}
              onChange={(event) => set('ctaLabel', event.target.value)}
              error={errorText('cta')}
            />
            <TextField
              label={t('ads.builder.targetUrl')}
              type="url"
              inputMode="url"
              value={values.targetUrl}
              onChange={(event) => set('targetUrl', event.target.value)}
              error={errorText('targetUrl')}
              required
            />
          </div>
          <TextField
            label={t('ads.builder.imageUrl')}
            type="url"
            inputMode="url"
            value={values.imageUrl}
            hint={t('ads.builder.imageHint')}
            onChange={(event) => set('imageUrl', event.target.value)}
            error={errorText('imageUrl')}
          />
        </fieldset>

        {failed ? <Alert tone="danger" title={t('ads.builder.genericError')} /> : null}

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t('ads.builder.cancel')}
          </Button>
          <Button type="submit" loading={isCreating} disabled={isCreating}>
            {isCreating ? t('ads.builder.saving') : t('ads.builder.save')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
