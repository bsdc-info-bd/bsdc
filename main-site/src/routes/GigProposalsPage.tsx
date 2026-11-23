import { ArrowLeft, CheckCircle2, HandCoins, ShieldCheck, Users, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
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
} from '@/design-system';
import { useGigDetail, useGigProposals } from '@/hooks/use-opportunities';
import { formatNumber, formatRelativeTime } from '@/lib/format';
import type { GigProposal, ProposalStatus } from '@/lib/opportunities/opportunity-types';
import { ROUTES, gigPath } from '@/lib/site';
import { selectIsSignedIn } from '@/store/auth-store';
import { useAuthStore } from '@/store/auth-store';

/**
 * Every proposal on one gig, as its client sees them.
 *
 * The gig page has always shown "12 proposals". That number is a promise that
 * there is somewhere to read them, and until now there was not: the queue lived
 * only in the database. This is that page.
 *
 * It is deliberately one page per gig rather than a global inbox, because a
 * proposal only means something next to the gig it answers — its budget, its
 * skills, its deadline. Deciding happens here too, and the server refuses a
 * decision from anyone who is not the gig's client or staff.
 */

const STATUS_TONE = {
  submitted: 'blue',
  reviewing: 'warn',
  shortlisted: 'green',
  hired: 'green',
  rejected: 'danger',
  withdrawn: 'neutral',
} as const;

/** The order a client triages in: live bids first, settled ones last. */
const STATUS_ORDER: readonly ProposalStatus[] = [
  'submitted',
  'reviewing',
  'shortlisted',
  'hired',
  'rejected',
  'withdrawn',
];

export default function GigProposalsPage() {
  const { slug = '' } = useParams();
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const isSignedIn = useAuthStore(selectIsSignedIn);
  const uid = useAuthStore((state) => state.user?.uid ?? null);

  const detail = useGigDetail(slug);
  const gig = detail.gig;
  const isOwner = gig !== null && uid !== null && gig.clientUid === uid;

  const queue = useGigProposals(gig?.id ?? null, isOwner);
  const [filter, setFilter] = useState<ProposalStatus | 'all'>('all');
  const [declining, setDeclining] = useState<GigProposal | null>(null);
  const [reason, setReason] = useState('');

  const counts = useMemo(() => {
    const map = new Map<ProposalStatus, number>();
    for (const proposal of queue.proposals) {
      map.set(proposal.status, (map.get(proposal.status) ?? 0) + 1);
    }
    return map;
  }, [queue.proposals]);

  const visible = useMemo(() => {
    const rows =
      filter === 'all'
        ? queue.proposals
        : queue.proposals.filter((proposal) => proposal.status === filter);
    return [...rows].sort((a, b) => {
      const rank = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
      if (rank !== 0) return rank;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [queue.proposals, filter]);

  /**
   * A decided proposal. Each outcome gets its own literal key rather than a
   * template so the i18n test can prove both languages have a sentence for it.
   */
  async function decide(proposal: GigProposal, status: ProposalStatus): Promise<void> {
    try {
      await queue.decide(proposal.id, status);
      switch (status) {
        case 'shortlisted':
          toast.success(t('freelance.proposals.movedShortlisted'));
          break;
        case 'hired':
          toast.success(t('freelance.proposals.movedHired'));
          break;
        case 'rejected':
          toast.success(t('freelance.proposals.movedRejected'));
          break;
        case 'reviewing':
          toast.success(t('freelance.proposals.movedReviewing'));
          break;
        default:
          toast.success(t('freelance.proposals.movedSubmitted'));
      }
      setDeclining(null);
      setReason('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('errors.generic'));
    }
  }

  const path = gigPath(slug);

  if (detail.isLoading) return <PageSkeleton label={t('freelance.detail.loading')} />;

  if (detail.isError || detail.isNotFound || gig === null) {
    return (
      <>
        <Seo
          title={t('freelance.proposals.notFoundTitle')}
          description={t('freelance.detail.notFoundBody')}
          path={path}
          noindex
        />
        <div className="fab-container py-6 sm:py-10">
          <EmptyState
            icon={<HandCoins size={22} />}
            title={t('freelance.proposals.notFoundTitle')}
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

  if (!isSignedIn) {
    return (
      <>
        <Seo title={t('freelance.proposals.title')} description={gig.title} path={path} noindex />
        <div className="fab-container py-6">
          <Alert tone="warning" title={t('freelance.signInToPropose')} />
        </div>
      </>
    );
  }

  // A freelancer who lands here is not being shown a queue of their competitors:
  // the server refuses the read, and the page says so plainly rather than
  // rendering an empty list that looks like "nobody applied".
  if (!isOwner) {
    return (
      <>
        <Seo title={t('freelance.proposals.title')} description={gig.title} path={path} noindex />
        <div className="fab-container py-6 sm:py-10">
          <EmptyState
            icon={<HandCoins size={22} />}
            title={t('freelance.proposals.ownerOnlyTitle')}
            description={t('freelance.proposals.ownerOnlyBody')}
            action={
              <LinkButton to={path} variant="outline" size="sm">
                {t('freelance.proposals.backToGig')}
              </LinkButton>
            }
          />
        </div>
      </>
    );
  }

  const total = gig.proposals;

  return (
    <>
      <Seo
        title={`${t('freelance.proposals.title')} — ${gig.title}`}
        description={gig.title}
        path={path}
        noindex
      />
      <div className="fab-container space-y-4 py-6 sm:py-10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              to={path}
              className="inline-flex items-center gap-1 text-sm text-muted hover:text-text"
            >
              <ArrowLeft size={15} aria-hidden />
              {gig.title}
            </Link>
            <h1 className="mt-2 text-xl font-bold text-text sm:text-2xl">
              {t('freelance.proposals.title')}
            </h1>
            <p className="mt-1 text-sm text-muted">
              {t('freelance.proposals.lead', { total: formatNumber(total, language) })}
            </p>
          </div>
          <Badge tone="green" icon={<Users size={14} />}>
            {t('freelance.proposals.liveCount', {
              total: formatNumber(
                queue.proposals.filter((p) => p.status !== 'withdrawn').length,
                language,
              ),
            })}
          </Badge>
        </div>

        {queue.isError ? <Alert tone="danger" title={t('freelance.proposals.failed')} /> : null}

        <div
          className="flex flex-wrap gap-2"
          role="radiogroup"
          aria-label={t('freelance.proposals.filterLabel')}
        >
          <button
            type="button"
            role="radio"
            aria-checked={filter === 'all'}
            onClick={() => setFilter('all')}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
              filter === 'all'
                ? 'border-primary bg-primary text-on-primary'
                : 'border-border text-text hover:bg-surface-2'
            }`}
          >
            {t('freelance.proposals.all')} · {formatNumber(queue.proposals.length, language)}
          </button>
          {STATUS_ORDER.filter((status) => (counts.get(status) ?? 0) > 0).map((status) => (
            <button
              key={status}
              type="button"
              role="radio"
              aria-checked={filter === status}
              onClick={() => setFilter(status)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                filter === status
                  ? 'border-primary bg-primary text-on-primary'
                  : 'border-border text-text hover:bg-surface-2'
              }`}
            >
              {t(`jobs.statuses.${status}`, { defaultValue: status })} ·{' '}
              {formatNumber(counts.get(status) ?? 0, language)}
            </button>
          ))}
        </div>

        {queue.isLoading ? (
          <Card>
            <p className="text-sm text-muted">{t('common.loading')}</p>
          </Card>
        ) : null}

        {!queue.isLoading && visible.length === 0 ? (
          <EmptyState
            icon={<HandCoins size={22} />}
            title={t('freelance.proposals.emptyTitle')}
            description={t('freelance.proposals.emptyBody')}
          />
        ) : null}

        <ul className="grid gap-3">
          {visible.map((proposal) => {
            const busy = queue.decidingId === proposal.id;
            const live = proposal.status !== 'withdrawn' && proposal.status !== 'rejected';
            return (
              <li key={proposal.id}>
                <Card>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 font-semibold text-text">
                        <span className="truncate">{proposal.displayName}</span>
                        {proposal.verified ? (
                          <ShieldCheck
                            size={15}
                            aria-label={t('freelance.proposals.verified')}
                            className="shrink-0 text-green-700"
                          />
                        ) : null}
                      </p>
                      {proposal.username.length > 0 ? (
                        <Link
                          to={`/u/${proposal.username}`}
                          className="text-xs text-green-700 hover:underline"
                        >
                          @{proposal.username}
                        </Link>
                      ) : null}
                    </div>
                    <Badge tone={STATUS_TONE[proposal.status]}>
                      {t(`jobs.statuses.${proposal.status}`, { defaultValue: proposal.status })}
                    </Badge>
                  </div>

                  <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <dt className="text-xs text-muted">{t('freelance.proposals.bid')}</dt>
                      <dd className="font-semibold text-text">
                        ৳{formatNumber(proposal.bidAmount, language)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">{t('freelance.proposals.delivery')}</dt>
                      <dd className="font-semibold text-text">
                        {t('freelance.durationDays', {
                          total: formatNumber(proposal.deliveryDays, language),
                        })}
                      </dd>
                    </div>
                  </dl>

                  <p className="mt-3 whitespace-pre-line text-sm leading-6 text-text">
                    {proposal.pitch}
                  </p>
                  <p className="mt-2 text-xs text-muted">
                    {formatRelativeTime(new Date(proposal.createdAt), language)}
                  </p>

                  {live ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {proposal.status !== 'shortlisted' ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={queue.isDeciding}
                          loading={busy}
                          onClick={() => void decide(proposal, 'shortlisted')}
                          iconStart={<CheckCircle2 size={14} />}
                        >
                          {t('freelance.proposals.shortlist')}
                        </Button>
                      ) : null}
                      {proposal.status !== 'hired' ? (
                        <Button
                          size="sm"
                          disabled={queue.isDeciding}
                          loading={busy}
                          onClick={() => void decide(proposal, 'hired')}
                          iconStart={<HandCoins size={14} />}
                        >
                          {t('freelance.proposals.hire')}
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={queue.isDeciding}
                        onClick={() => {
                          setDeclining(proposal);
                          setReason('');
                        }}
                        iconStart={<XCircle size={14} />}
                      >
                        {t('freelance.proposals.decline')}
                      </Button>
                    </div>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      </div>

      <Modal
        open={declining !== null}
        onClose={() => setDeclining(null)}
        title={t('freelance.proposals.declineTitle')}
        closeLabel={t('common.cancel')}
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setDeclining(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={reason.trim().length < 3}
              onClick={() => {
                if (declining !== null) void decide(declining, 'rejected');
              }}
            >
              {t('freelance.proposals.decline')}
            </Button>
          </div>
        }
      >
        <TextareaField
          label={t('freelance.proposals.declineReason')}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={3}
        />
      </Modal>
    </>
  );
}
