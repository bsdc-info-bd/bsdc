/**
 * BSDC — src/features/freelancer/GigForm.tsx
 * Purpose : Publishing a service: what you do, and what it costs.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : A gig needs at least one package with a price and a delivery time, and the floor on a
 *   package price exists so the hub does not become a race to the bottom where the cheapest listing
 *   wins by being worth nothing. Packages are added one at a time and each is removable, because a
 *   three-tier offering is a decision a freelancer should be able to change their mind about.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Chip, Input, Select, Textarea, showToast } from '@/shared/ui';
import { TEXT_LIMITS } from '@/core/config/limits';
import { AppError } from '@/core/errors/AppError';
import type { Locale } from '@/core/config/app';
import { GIG_CATEGORIES, GIG_CATEGORY_LABELS, type GigCategory } from '@/core/config/opportunities';
import {
  MIN_PACKAGE_PRICE_BDT,
  newGig,
  validateGig,
  type Gig,
  type GigPackage,
} from '@/entities/gig/model';

/** Props for the gig form. */
export interface GigFormProps {
  readonly freelancerUid: string;
  readonly freelancerName: string;
  readonly freelancerPhotoUrl: string;
  readonly locale: Locale;
  readonly onSubmit: (gig: Gig) => Promise<void>;
  readonly onCancel: () => void;
}

/**
 * Renders the gig form.
 * @param props component props
 * @returns the form element
 */
export function GigForm({
  freelancerUid,
  freelancerName,
  freelancerPhotoUrl,
  locale,
  onSubmit,
  onCancel,
}: GigFormProps): React.ReactElement {
  const { t } = useTranslation('freelancer');
  const bn = locale === 'bn';
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<GigCategory>('web');
  const [description, setDescription] = useState('');
  const [skills, setSkills] = useState('');
  const [packages, setPackages] = useState<readonly GigPackage[]>([]);
  const [packageName, setPackageName] = useState('');
  const [packagePrice, setPackagePrice] = useState(MIN_PACKAGE_PRICE_BDT);
  const [packageDays, setPackageDays] = useState(7);
  const [packageRevisions, setPackageRevisions] = useState(1);
  const [packageDescription, setPackageDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const addPackage = (): void => {
    if (packageName.trim().length === 0 || packages.length >= 3) return;
    setPackages((current) => [
      ...current,
      {
        name: packageName.trim(),
        description: packageDescription.trim(),
        priceBdt: packagePrice,
        deliveryDays: packageDays,
        revisions: packageRevisions,
      },
    ]);
    setPackageName('');
    setPackageDescription('');
  };

  const submit = (): void => {
    const draft = {
      freelancerUid,
      freelancerName,
      freelancerPhotoUrl,
      title,
      category,
      description,
      packages,
      skills: skills
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
        .slice(0, 20),
    };
    const validation = validateGig(draft);
    if (validation !== null) {
      setProblem(validation);
      return;
    }
    setProblem(null);
    setBusy(true);
    void onSubmit(newGig(draft))
      .then(() =>
        showToast(locale, { titleBn: t('created.bn'), titleEn: t('created.en'), tone: 'success' }),
      )
      .catch((error: unknown) => {
        const code = error instanceof AppError ? error.code : 'BSDC-DATA-007';
        showToast(locale, {
          tone: 'error',
          titleBn: t(`error.${code}.bn`, { defaultValue: t('error.default.bn') }),
          titleEn: t(`error.${code}.en`, { defaultValue: t('error.default.en') }),
        });
      })
      .finally(() => setBusy(false));
  };

  return (
    <form
      className="bsdc-gigForm"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Input
        label={t('form.title')}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        required
        maxLength={100}
      />
      <Select<GigCategory>
        label={t('form.category')}
        value={category}
        onValueChange={setCategory}
        options={GIG_CATEGORIES.map((entry) => ({
          value: entry,
          label: GIG_CATEGORY_LABELS[entry][bn ? 'bn' : 'en'],
        }))}
      />
      <Textarea
        label={t('form.description')}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        maxLength={TEXT_LIMITS.productDescription}
        counter={{ value: description.length, max: TEXT_LIMITS.productDescription }}
      />
      <Input
        label={t('form.skills')}
        value={skills}
        onChange={(event) => setSkills(event.target.value)}
        hint={t('form.skillsHint')}
        maxLength={240}
      />

      <fieldset className="bsdc-gigForm__packages">
        <legend lang={locale === 'bn' ? 'bn' : 'en'}>{t('form.packages')}</legend>
        <div className="bsdc-gigForm__packageRow">
          <Input
            label={t('form.packageName')}
            value={packageName}
            onChange={(event) => setPackageName(event.target.value)}
            maxLength={40}
          />
          <Input
            label={t('form.packagePrice')}
            value={String(packagePrice)}
            onChange={(event) =>
              setPackagePrice(Number(event.target.value.replace(/[^0-9]/g, '')) || 0)
            }
            inputMode="numeric"
            maxLength={10}
          />
        </div>
        <div className="bsdc-gigForm__packageRow">
          <Input
            label={t('form.packageDays')}
            value={String(packageDays)}
            onChange={(event) =>
              setPackageDays(Number(event.target.value.replace(/[^0-9]/g, '')) || 1)
            }
            type="number"
            inputMode="numeric"
            min={1}
            max={180}
          />
          <Input
            label={t('form.packageRevisions')}
            value={String(packageRevisions)}
            onChange={(event) =>
              setPackageRevisions(Number(event.target.value.replace(/[^0-9]/g, '')) || 0)
            }
            type="number"
            inputMode="numeric"
            min={0}
            max={20}
          />
        </div>
        <Textarea
          label={t('form.packageDescription')}
          value={packageDescription}
          onChange={(event) => setPackageDescription(event.target.value)}
          maxLength={400}
        />
        <Button
          type="button"
          variant="secondary"
          onClick={addPackage}
          disabled={packageName.trim().length === 0 || packages.length >= 3}
        >
          {t('form.addPackage')}
        </Button>
        <ul className="bsdc-gigForm__packageList">
          {packages.map((pack, index) => (
            <li key={`${pack.name}-${index}`}>
              <Chip
                onRemove={() =>
                  setPackages((current) => current.filter((_, position) => position !== index))
                }
                removeLabel={t('form.removePackage')}
              >
                {pack.name} · ৳{pack.priceBdt.toLocaleString(bn ? 'bn-BD' : 'en-US')} ·{' '}
                {pack.deliveryDays}d
              </Chip>
            </li>
          ))}
        </ul>
      </fieldset>

      {problem !== null ? (
        <p className="bsdc-gigForm__error" role="alert" lang={locale === 'bn' ? 'bn' : 'en'}>
          {t(`error.${problem}.${bn ? 'bn' : 'en'}`)}
        </p>
      ) : null}

      <div className="bsdc-gigForm__actions">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('form.cancel')}
        </Button>
        <Button type="submit" variant="primary" loading={busy}>
          {t('form.publish')}
        </Button>
      </div>
    </form>
  );
}
