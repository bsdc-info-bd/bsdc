import { ArrowLeft, Banknote, CalendarClock, HandCoins, Users } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Seo } from '@/components/seo/Seo';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  LinkButton,
  Modal,
  PageSkeleton,
  TextareaField,
  TextField,
} from '@/design-system';
import { useGigDetail } from '@/hooks/use-opportunities';
import { formatAbsoluteDate, formatNumber, formatRelativeTime } from '@/lib/format';
import { formatSalaryRange } from '@/lib/opportunities/opportunity-types';
import { ROUTES, gigPath } from '@/lib/site';
import { dataErrorKey } from '@/lib/supabase/errors';
import { selectIsSignedIn, useAuthStore } from '@/store/auth-store';

/** One freelance gig in full: its budget and terms, and the reader's own proposal. */
export default function GigPage() {
  const { slug = '' } = useParams();
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const isSignedIn = useAuthStore(selectIsSignedIn);
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const detail = useGigDetail(slug);
  const [proposing, setProposing] = useState(false);
  const [pitch, setPitch] = useState('');
  const [bid, setBid] = useState('');
  const [days, setDays] = useState('7');

  if (detail.isLoading) return <PageSkeleton label={t('freelance.detail.loading')} />;

  if (detail.isError) {
    return (
      <div className="fab-container py-6">
        <Alert tone="danger" title={t('freelance.detail.failed')} />
      </div>
    );
  }

  const gig = detail.gig;
  if (detail.isNotFound || gig === null) {
    return (
      <>
        <Seo
          title={t('freelance.detail.notFoundTitle')}
          description={t('freelance.detail.notFoundBody')}
          path={gigPath(slug)}
          noindex
        />
        <div className="fab-container py-6 sm:py-10">
          <EmptyState
            icon={<HandCoins size={22} />}
            title={t('freelance.detail.notFoundTitle')}
            description={t('freelance.detail.notFoundBody')}
            action={
              <LinkButton to={ROUTES.freelance} variant="outline" size="sm">
                {t('freelance.detail.back')}
              </LinkButton>
            }
          />
        </div>
      </>
    );
  }

  const open = gig.status === 'open';
  const isOwner = uid !== null && uid === gig.clientUid;
  const budget = formatSalaryRange(gig.budgetMin, gig.budgetMax, gig.currency, language);
  const path = gigPath(gig.slug);
  const summary = gig.description.replace(/\s+/g, ' ').trim().slice(0, 155);

  const bidValue = Number.parseInt(bid, 10);
  const daysValue = Number.parseInt(days, 10);
  const valid =
    pitch.trim().length >= 20 &&
    Number.isFinite(bidValue) &&
    bidValue >= 0 &&
    Number.isFinite(daysValue) &&
    daysValue >= 1;

  async function send() {
    if (!valid) return;
    try {
      await detail.propose(pitch.trim(), bidValue, daysValue);
      toast.success(t('freelance.proposalSent'));
      setProposing(false);
      setPitch('');
      setBid('');
    } catch (error) {
      toast.error(t(dataErrorKey(error)));
    }
  }

  return (
    <>
      <Seo
        title={t('freelance.detail.metaTitle', { title: gig.title })}
        description={summary.length > 0 ? summary : gig.title}
        path={path}
        noindex={!open}
      />

      <article className="fab-container py-5 sm:py-8">
        <div className="mx-auto grid w-full max-w-4xl gap-4">
          <LinkButton
            to={ROUTES.freelance}
            variant="ghost"
            size="sm"
            iconStart={<ArrowLeft size={16} />}
            className="w-fit"
          >
            {t('freelance.detail.back')}
          </LinkButton>

          <Card>
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {gig.isHourly ? <Badge tone="neutral">{t('freelance.detail.hourly')}</Badge> : null}
                {open ? null : (
                  <Badge tone="warn">{t(`freelance.detail.statuses.${gig.status}`)}</Badge>
                )}
              </div>

              <h1 className="text-2xl font-bold leading-tight sm:text-3xl">{gig.title}</h1>

              <ul className="grid gap-2 text-sm sm:grid-cols-2">
                <li className="flex items-start gap-2">
                  <Banknote size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-muted" />
                  <span>
                    {budget !== null ? (
                      <>
                        {budget}
                        {gig.isHourly ? ` / ${t('freelance.perHour')}` : ''}
                      </>
                    ) : (
                      t('freelance.budgetOpen')
                    )}
                  </span>
                </li>
                {gig.durationDays !== null ? (
                  <li className="flex items-start gap-2">
                    <CalendarClock
                      size={16}
                      aria-hidden="true"
                      className="mt-0.5 shrink-0 text-muted"
                    />
                    <span>
                      {t('freelance.durationDays', {
                        total: formatNumber(gig.durationDays, language),
                      })}
                    </span>
                  </li>
                ) : null}
                <li className="flex items-start gap-2">
                  <Users size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-muted" />
                  <span>
                    {t('freelance.proposalCount', { total: formatNumber(gig.proposals, language) })}
                  </span>
                </li>
                {gig.publishedAt !== null ? (
                  <li className="flex items-start gap-2 text-muted">
                    <span>
                      {t('freelance.detail.posted', {
                        when: formatRelativeTime(new Date(gig.publishedAt), language),
                        date: formatAbsoluteDate(new Date(gig.publishedAt), language),
                      })}
                    </span>
                  </li>
                ) : null}
              </ul>

              <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
                {detail.myProposalStatus !== null ? (
                  <p className="flex items-center gap-2 text-sm">
                    {t('freelance.detail.proposalStatus')}
                    <Badge tone="green">
                      {t(`jobs.statuses.${detail.myProposalStatus}`, {
                        defaultValue: detail.myProposalStatus,
                      })}
                    </Badge>
                  </p>
                ) : isOwner ? (
                  <p className="text-sm text-muted">{t('freelance.detail.postedByYou')}</p>
                ) : !isSignedIn ? (
                  <p className="text-sm text-muted">{t('freelance.signInToPropose')}</p>
                ) : open ? (
                  <Button
                    onClick={() => {
                      setProposing(true);
                    }}
                  >
                    {t('freelance.propose')}
                  </Button>
                ) : (
                  <p className="text-sm text-muted">{t('freelance.detail.notAccepting')}</p>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold">{t('freelance.detail.about')}</h2>
            <p className="mt-3 whitespace-pre-line text-sm leading-7">{gig.description}</p>
            {gig.skills.length > 0 ? (
              <ul className="mt-4 flex flex-wrap gap-1">
                {gig.skills.map((skill) => (
                  <li key={skill}>
                    <Badge tone="neutral">{skill}</Badge>
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>
        </div>
      </article>

      <Modal
        open={proposing}
        onClose={() => {
          setProposing(false);
        }}
        title={t('freelance.proposeTo', { title: gig.title })}
        closeLabel={t('common.close')}
      >
        <TextareaField
          label={t('freelance.pitch')}
          hint={t('freelance.pitchHint')}
          rows={5}
          value={pitch}
          maxLength={6000}
          counterMax={6000}
          onChange={(event) => {
            setPitch(event.target.value);
          }}
        />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <TextField
            label={t('freelance.bid')}
            type="number"
            inputMode="numeric"
            min={0}
            value={bid}
            onChange={(event) => {
              setBid(event.target.value);
            }}
          />
          <TextField
            label={t('freelance.deliveryDays')}
            type="number"
            inputMode="numeric"
            min={1}
            value={days}
            onChange={(event) => {
              setDays(event.target.value);
            }}
          />
        </div>
        <div className="mt-4 flex gap-2">
          <Button
            disabled={!valid || detail.isProposing}
            onClick={() => {
              void send();
            }}
          >
            {t('freelance.sendProposal')}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setProposing(false);
            }}
          >
            {t('common.cancel')}
          </Button>
        </div>
      </Modal>
    </>
  );
}
