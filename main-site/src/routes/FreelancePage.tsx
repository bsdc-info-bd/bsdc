import { HandCoins } from 'lucide-react';
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
  Modal,
  PageSkeleton,
  SectionHeading,
  TextareaField,
  TextField,
} from '@/design-system';
import { useGigBoard } from '@/hooks/use-opportunities';
import { formatSalaryRange, type Gig } from '@/lib/opportunities/opportunity-types';
import { formatNumber } from '@/lib/format';
import { ROUTES } from '@/lib/site';
import { dataErrorKey } from '@/lib/supabase/errors';
import { selectIsSignedIn, useAuthStore } from '@/store/auth-store';

/** Freelance gigs with budgets and sealed proposals. */
export default function FreelancePage() {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const isSignedIn = useAuthStore(selectIsSignedIn);
  const board = useGigBoard();
  const [target, setTarget] = useState<Gig | null>(null);
  const [pitch, setPitch] = useState('');
  const [bid, setBid] = useState('');
  const [days, setDays] = useState('7');

  const bidValue = Number.parseInt(bid, 10);
  const daysValue = Number.parseInt(days, 10);
  const valid =
    pitch.trim().length >= 20 &&
    Number.isFinite(bidValue) &&
    bidValue >= 0 &&
    Number.isFinite(daysValue) &&
    daysValue >= 1;

  async function send() {
    if (target === null || !valid) return;
    try {
      await board.propose(target.id, pitch.trim(), bidValue, daysValue);
      toast.success(t('freelance.proposalSent'));
      setTarget(null);
      setPitch('');
      setBid('');
    } catch (error) {
      toast.error(t(dataErrorKey(error)));
    }
  }

  return (
    <>
      <Seo
        title={t('freelance.metaTitle')}
        description={t('freelance.metaDescription')}
        path={ROUTES.freelance}
      />

      <div className="fab-container py-6 sm:py-10">
        <SectionHeading
          title={t('freelance.title')}
          description={t('freelance.description')}
          action={
            <LinkButton
              to={`${ROUTES.create}?kind=gig`}
              variant="outline"
              size="sm"
              iconStart={<HandCoins size={14} />}
            >
              {t('create.submit.gig')}
            </LinkButton>
          }
        />

        {board.isLoading ? <PageSkeleton label={t('common.loading')} /> : null}
        {board.isError ? (
          <Alert tone="danger" title={t('freelance.failed')} className="mt-4" />
        ) : null}

        {!board.isLoading && !board.isError && board.gigs.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={<HandCoins size={22} />}
              title={t('freelance.emptyTitle')}
              description={t('freelance.emptyBody')}
              action={
                <LinkButton to={`${ROUTES.create}?kind=gig`} variant="primary" size="sm">
                  {t('create.submit.gig')}
                </LinkButton>
              }
            />
          </div>
        ) : null}

        <ul className="mt-4 grid gap-3 lg:grid-cols-2">
          {board.gigs.map((gig) => {
            const budget = formatSalaryRange(gig.budgetMin, gig.budgetMax, gig.currency, language);
            return (
              <Card as="li" key={gig.id}>
                <h2 className="text-lg font-semibold">{gig.title}</h2>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                  {budget !== null ? (
                    <span>
                      {budget}
                      {gig.isHourly ? ` / ${t('freelance.perHour')}` : ''}
                    </span>
                  ) : (
                    <span>{t('freelance.budgetOpen')}</span>
                  )}
                  {gig.durationDays !== null ? (
                    <Badge tone="neutral">
                      {t('freelance.durationDays', {
                        total: formatNumber(gig.durationDays, language),
                      })}
                    </Badge>
                  ) : null}
                  <span>
                    {t('freelance.proposalCount', {
                      total: formatNumber(gig.proposals, language),
                    })}
                  </span>
                </p>
                {gig.description.length > 0 ? (
                  <p className="mt-2 line-clamp-4 text-sm text-muted">{gig.description}</p>
                ) : null}

                <div className="mt-3">
                  {isSignedIn ? (
                    <Button
                      size="sm"
                      onClick={() => {
                        setTarget(gig);
                      }}
                    >
                      {t('freelance.propose')}
                    </Button>
                  ) : (
                    <p className="text-xs text-muted">{t('freelance.signInToPropose')}</p>
                  )}
                </div>
              </Card>
            );
          })}
        </ul>
      </div>

      <Modal
        open={target !== null}
        onClose={() => {
          setTarget(null);
        }}
        title={t('freelance.proposeTo', { title: target?.title ?? '' })}
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
            disabled={!valid || board.isProposing}
            onClick={() => {
              void send();
            }}
          >
            {t('freelance.sendProposal')}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setTarget(null);
            }}
          >
            {t('common.cancel')}
          </Button>
        </div>
      </Modal>
    </>
  );
}
