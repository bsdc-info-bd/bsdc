import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, ArrowRight, CheckCircle2, Clock3, Copy, Send, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Seo } from '@/components/seo/Seo';
import { LocationPicker, type PinnedLocation } from '@/components/mk/LocationPicker';
import { Alert, Badge, Button, Card, PageSkeleton, Stepper, TextField } from '@/design-system';
import { useMyApplication, usePaymentInstructions, useSubmitApplication } from '@/hooks/use-mk';
import {
  AGREEMENT_KEYS,
  canAdvance,
  type Language,
  EMPTY_APPLICATION,
  formatTaka,
  normaliseBdMobile,
  SHOP_TYPE_EMOJI,
  SHOP_TYPES,
  stepErrors,
  WIZARD_STEPS,
  type ApplicationDraft,
  type WizardStep,
} from '@/lib/mk/mk-logic';
import { mkCopy } from '@/lib/mk/mk-copy';
import type { ApplicationSubmission } from '@/lib/mk/mk-repository';
import { ROUTES } from '@/lib/site';

const APPLY_PATH = ROUTES.vendorApply;

const DRAFT_KEY = 'bsdc:mk:apply-draft';

/**
 * Only non-sensitive answers survive a reload. NID and payment details are
 * never written to storage: they are typed again if the page is left.
 */
function readDraft(): ApplicationDraft {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (raw === null) return EMPTY_APPLICATION;
    const saved = JSON.parse(raw) as Partial<ApplicationDraft>;
    return {
      ...EMPTY_APPLICATION,
      ...saved,
      nid: '',
      paymentSender: '',
      paymentHolder: '',
      paymentTxnId: '',
    };
  } catch {
    return EMPTY_APPLICATION;
  }
}

function saveDraft(draft: ApplicationDraft): void {
  const safe = {
    fullName: draft.fullName,
    mobile: draft.mobile,
    shopName: draft.shopName,
    shopType: draft.shopType,
    addressLine: draft.addressLine,
    lat: draft.lat,
    lng: draft.lng,
    placeLabel: draft.placeLabel,
    tradeLicenceNo: draft.tradeLicenceNo,
    agreements: draft.agreements,
    packageCode: draft.packageCode,
  };
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(safe));
  } catch {
    // Storage can be full or disabled; the wizard still works without a draft.
  }
}

export default function ShopApplyPage() {
  const { i18n } = useTranslation();
  const language: Language = i18n.language === 'en' ? 'en' : 'bn';
  const copy = mkCopy(language);
  const reduceMotion = useReducedMotion() ?? false;

  const application = useMyApplication();
  const payment = usePaymentInstructions();
  const submit = useSubmitApplication();

  const [draft, setDraft] = useState<ApplicationDraft>(readDraft);
  const [index, setIndex] = useState(0);
  const [showErrors, setShowErrors] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    saveDraft(draft);
  }, [draft]);

  const step: WizardStep = WIZARD_STEPS[index] ?? 'identity';
  const errors = useMemo(() => stepErrors(step, draft), [step, draft]);
  const stepLabels = WIZARD_STEPS.map((key) => copy.steps[key]);

  if (application.isLoading || payment.isLoading) {
    return <PageSkeleton label={copy.loading} />;
  }

  const existing = application.data ?? null;
  if (existing !== null && existing.status === 'submitted') {
    return (
      <Shell copy={copy}>
        <StatusCard
          tone="info"
          icon={<Clock3 size={28} />}
          title={copy.underReview}
          body={copy.submittedBody}
        />
      </Shell>
    );
  }
  if (existing !== null && existing.status === 'approved') {
    return (
      <Shell copy={copy}>
        <StatusCard
          tone="success"
          icon={<CheckCircle2 size={28} />}
          title={copy.submitted}
          body={copy.approvedBody}
        >
          <Button className="mt-4" onClick={() => (window.location.href = ROUTES.vendor)}>
            {copy.openApply}
          </Button>
        </StatusCard>
      </Shell>
    );
  }

  if (submitted) {
    return (
      <Shell copy={copy}>
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 220, damping: 18 }}
        >
          <StatusCard
            tone="success"
            icon={<CheckCircle2 size={28} />}
            title={copy.submitted}
            body={copy.submittedBody}
          />
        </motion.div>
      </Shell>
    );
  }

  const rejectedNote = existing?.status === 'rejected' ? existing.review_note : '';

  function go(delta: number): void {
    if (delta > 0 && !canAdvance(step, draft)) {
      setShowErrors(true);
      return;
    }
    setShowErrors(false);
    setIndex((current) => Math.min(WIZARD_STEPS.length - 1, Math.max(0, current + delta)));
  }

  async function onSubmit(): Promise<void> {
    if (!canAdvance('review', draft)) {
      setShowErrors(true);
      return;
    }
    const payload: ApplicationSubmission = {
      full_name: draft.fullName.trim(),
      shop_name: draft.shopName.trim(),
      nid_number: draft.nid.trim(),
      mobile: normaliseBdMobile(draft.mobile),
      vendor_type: draft.shopType,
      address_line: draft.addressLine.trim(),
      lat: draft.lat ?? 0,
      lng: draft.lng ?? 0,
      place_label: draft.placeLabel,
      trade_license_no: draft.tradeLicenceNo.trim(),
      package_code: draft.packageCode,
      agreements: draft.agreements,
      payment_sender: normaliseBdMobile(draft.paymentSender),
      payment_holder: draft.paymentHolder.trim(),
      payment_txn_id: draft.paymentTxnId.trim(),
    };
    try {
      await submit.mutateAsync(payload);
      sessionStorage.removeItem(DRAFT_KEY);
      setSubmitted(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : copy.errorGeneric);
    }
  }

  const fieldError = (key: string): string | undefined => {
    if (!showErrors) return undefined;
    const code = errors[key];
    return code === undefined ? undefined : copy.fieldErrors[code];
  };

  const selectedPackage = payment.data?.packages.find((p) => p.code === draft.packageCode);

  return (
    <Shell copy={copy}>
      <Seo title={copy.applyTitle} description={copy.applyLead} path={APPLY_PATH} noindex />

      {rejectedNote !== '' ? (
        <Alert tone="warning" title={copy.rejectedBody} className="mb-4">
          <p className="text-sm">{`${copy.reviewerNote}: ${rejectedNote}`}</p>
        </Alert>
      ) : null}

      <Stepper steps={stepLabels} current={index} label={copy.applyTitle} className="mb-6" />

      <Card padded className="overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={reduceMotion ? false : { opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduceMotion ? {} : { opacity: 0, x: -24 }}
            transition={{ duration: 0.22 }}
            className="space-y-5"
          >
            {step === 'identity' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label={copy.fullName}
                  value={draft.fullName}
                  error={fieldError('fullName')}
                  onChange={(e) => setDraft({ ...draft, fullName: e.target.value })}
                />
                <TextField
                  label={copy.nid}
                  inputMode="numeric"
                  value={draft.nid}
                  error={fieldError('nid')}
                  onChange={(e) => setDraft({ ...draft, nid: e.target.value })}
                />
                <TextField
                  label={copy.mobile}
                  inputMode="tel"
                  autoComplete="tel"
                  value={draft.mobile}
                  error={fieldError('mobile')}
                  onChange={(e) => setDraft({ ...draft, mobile: e.target.value })}
                  className="sm:col-span-2"
                />
              </div>
            ) : null}

            {step === 'shop' ? (
              <div className="space-y-4">
                <TextField
                  label={copy.shopName}
                  value={draft.shopName}
                  error={fieldError('shopName')}
                  onChange={(e) => setDraft({ ...draft, shopName: e.target.value })}
                />
                <fieldset>
                  <legend className="mb-2 text-sm font-semibold text-text">{copy.shopType}</legend>
                  {showErrors && errors.shopType ? (
                    <p className="mb-2 text-sm text-danger">{copy.fieldErrors.type_missing}</p>
                  ) : null}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {SHOP_TYPES.map((type) => {
                      const selected = draft.shopType === type;
                      return (
                        <button
                          key={type}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => setDraft({ ...draft, shopType: type })}
                          className={`flex items-center gap-2 rounded-xl border p-3 text-left text-sm transition ${
                            selected
                              ? 'border-green-700 bg-green-700/10 text-green-700'
                              : 'border-border bg-surface hover:bg-surface-2'
                          }`}
                        >
                          <span aria-hidden className="text-lg">
                            {SHOP_TYPE_EMOJI[type]}
                          </span>
                          <span>{copy.typeLabels[type]}</span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
                <TextField
                  label={copy.tradeLicence}
                  value={draft.tradeLicenceNo}
                  error={fieldError('tradeLicenceNo')}
                  onChange={(e) => setDraft({ ...draft, tradeLicenceNo: e.target.value })}
                />
              </div>
            ) : null}

            {step === 'location' ? (
              <div className="space-y-4">
                <LocationPicker
                  language={language}
                  value={
                    draft.lat !== null && draft.lng !== null
                      ? { lat: draft.lat, lng: draft.lng, label: draft.placeLabel }
                      : null
                  }
                  onChange={(pin: PinnedLocation) =>
                    setDraft({
                      ...draft,
                      lat: pin.lat,
                      lng: pin.lng,
                      placeLabel: pin.label,
                      addressLine:
                        draft.addressLine.trim() === '' && pin.label !== ''
                          ? pin.label
                          : draft.addressLine,
                    })
                  }
                  labels={{
                    title: copy.pinTitle,
                    hint: copy.pinHint,
                    search: copy.searchPlaceholder,
                    useCurrent: copy.useCurrent,
                    outside: copy.fieldErrors.location_outside_bd,
                  }}
                />
                {showErrors && errors.location ? (
                  <p className="text-sm text-danger">{copy.fieldErrors.location_outside_bd}</p>
                ) : null}
                <TextField
                  label={copy.addressLine}
                  value={draft.addressLine}
                  error={fieldError('addressLine')}
                  onChange={(e) => setDraft({ ...draft, addressLine: e.target.value })}
                />
              </div>
            ) : null}

            {step === 'agreements' ? (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-text">{copy.agreementsTitle}</p>
                {AGREEMENT_KEYS.map((key) => (
                  <label
                    key={key}
                    className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 text-sm hover:bg-surface-2"
                  >
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 accent-green-700"
                      checked={draft.agreements[key]}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          agreements: { ...draft.agreements, [key]: e.target.checked },
                        })
                      }
                    />
                    <span>{copy.agreementLabels[key]}</span>
                  </label>
                ))}
                {showErrors && Object.keys(errors).length > 0 ? (
                  <p className="text-sm text-danger">{copy.fieldErrors.agreement_missing}</p>
                ) : null}
              </div>
            ) : null}

            {step === 'package' ? (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-semibold text-text">{copy.packageTitle}</p>
                  <p className="text-xs text-muted">{copy.packageHint}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {(payment.data?.packages ?? []).map((pkg) => {
                    const selected = draft.packageCode === pkg.code;
                    const perOrder = pkg.price_poisha / pkg.orders;
                    return (
                      <motion.button
                        key={pkg.code}
                        type="button"
                        whileHover={reduceMotion ? {} : { y: -3 }}
                        whileTap={reduceMotion ? {} : { scale: 0.98 }}
                        aria-pressed={selected}
                        onClick={() => setDraft({ ...draft, packageCode: pkg.code })}
                        className={`rounded-2xl border p-4 text-left transition ${
                          selected
                            ? 'border-green-700 bg-green-700/10 ring-2 ring-green-700/30'
                            : 'border-border bg-surface'
                        }`}
                      >
                        <p className="text-2xl font-bold text-text">
                          {pkg.orders}{' '}
                          <span className="text-sm font-medium text-muted">{copy.orders}</span>
                        </p>
                        <p className="mt-1 text-lg font-semibold text-green-700">
                          {formatTaka(pkg.price_poisha, language)}
                        </p>
                        <p className="text-xs text-muted">
                          {formatTaka(perOrder, language)} {copy.perOrder}
                        </p>
                      </motion.button>
                    );
                  })}
                </div>
                {showErrors && errors.packageCode ? (
                  <p className="text-sm text-danger">{copy.fieldErrors.package_missing}</p>
                ) : null}
              </div>
            ) : null}

            {step === 'payment' ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-green-700/30 bg-green-700/5 p-4">
                  <p className="text-sm font-semibold text-text">{copy.paymentTitle}</p>
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-text">
                    <li>{copy.paymentStep1}</li>
                    <li>{copy.paymentStep2}</li>
                    <li>{copy.paymentStep3}</li>
                  </ol>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <span className="rounded-xl bg-surface px-4 py-2 font-mono text-lg font-bold tracking-wider text-text">
                      {payment.data?.bikash_number || '—'}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      iconStart={<Copy size={16} />}
                      disabled={!payment.data?.bikash_number}
                      onClick={() => {
                        void navigator.clipboard?.writeText(payment.data?.bikash_number ?? '');
                        toast.success(copy.copied);
                      }}
                    >
                      {copy.copyNumber}
                    </Button>
                  </div>
                  {selectedPackage ? (
                    <p className="mt-3 text-sm text-muted">
                      {copy.packageTitle}: {selectedPackage.orders} {copy.orders} ·{' '}
                      <strong className="text-text">
                        {formatTaka(selectedPackage.price_poisha, language)}
                      </strong>
                    </p>
                  ) : null}
                </div>
                <TextField
                  label={copy.sender}
                  inputMode="tel"
                  value={draft.paymentSender}
                  error={fieldError('paymentSender')}
                  onChange={(e) => setDraft({ ...draft, paymentSender: e.target.value })}
                />
                <TextField
                  label={copy.holder}
                  value={draft.paymentHolder}
                  error={fieldError('paymentHolder')}
                  onChange={(e) => setDraft({ ...draft, paymentHolder: e.target.value })}
                />
                <TextField
                  label={copy.txnId}
                  value={draft.paymentTxnId}
                  error={fieldError('paymentTxnId')}
                  onChange={(e) => setDraft({ ...draft, paymentTxnId: e.target.value })}
                />
              </div>
            ) : null}

            {step === 'review' ? (
              <div className="space-y-4">
                <p className="text-sm font-semibold text-text">{copy.reviewTitle}</p>
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <Row label={copy.fullName} value={draft.fullName} />
                  <Row label={copy.shopName} value={draft.shopName} />
                  <Row
                    label={copy.shopType}
                    value={draft.shopType ? copy.typeLabels[draft.shopType] : '—'}
                  />
                  <Row label={copy.addressLine} value={draft.addressLine} />
                  <Row label={copy.mobile} value={normaliseBdMobile(draft.mobile)} />
                  <Row label={copy.sender} value={normaliseBdMobile(draft.paymentSender)} />
                  <Row label={copy.txnId} value={draft.paymentTxnId} />
                  <Row
                    label={copy.packageTitle}
                    value={
                      selectedPackage
                        ? `${selectedPackage.orders} ${copy.orders} · ${formatTaka(selectedPackage.price_poisha, language)}`
                        : '—'
                    }
                  />
                </dl>
                <Badge tone="green" icon={<ShieldCheck size={14} />}>
                  {copy.underReview}
                </Badge>
              </div>
            ) : null}
          </motion.div>
        </AnimatePresence>

        <div className="mt-6 flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => go(-1)}
            disabled={index === 0}
            iconStart={<ArrowLeft size={16} />}
          >
            {copy.back}
          </Button>
          {step === 'review' ? (
            <Button
              type="button"
              onClick={() => void onSubmit()}
              loading={submit.isPending}
              iconEnd={<Send size={16} />}
            >
              {copy.submit}
            </Button>
          ) : (
            <Button type="button" onClick={() => go(1)} iconEnd={<ArrowRight size={16} />}>
              {copy.next}
            </Button>
          )}
        </div>
      </Card>
    </Shell>
  );
}

function Shell({
  children,
  copy,
}: {
  children: React.ReactNode;
  copy: { applyTitle: string; applyLead: string };
}) {
  return (
    <div className="fab-container max-w-3xl py-6 sm:py-10">
      <header className="mb-6 rounded-3xl bg-gradient-to-br from-green-700 to-green-500 p-6 text-white shadow-lg">
        <h1 className="text-2xl font-bold sm:text-3xl">{copy.applyTitle}</h1>
        <p className="mt-2 max-w-xl text-sm text-white/90">{copy.applyLead}</p>
      </header>
      {children}
    </div>
  );
}

function StatusCard({
  tone,
  icon,
  title,
  body,
  children,
}: {
  tone: 'info' | 'success';
  icon: React.ReactNode;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <Card padded className="text-center">
      <div
        className={`mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full ${tone === 'success' ? 'bg-green-700/10 text-green-700' : 'bg-surface-2 text-blue'}`}
      >
        {icon}
      </div>
      <h2 className="text-xl font-semibold text-text">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">{body}</p>
      {children}
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-surface-2 p-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="truncate font-medium text-text">{value || '—'}</dd>
    </div>
  );
}
