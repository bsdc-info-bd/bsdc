import { useCallback, useState, type ReactElement } from 'react';
import {
  Badge,
  Banner,
  Button,
  Card,
  Empty,
  Loading,
  Table,
  TextArea,
  appealOutcomeMessage,
  appealQueueSummary,
  breachedAppeals,
  callRpc,
  canClaim,
  decisionBlocker,
  listRpc,
  messageOf,
  orderAppeals,
  reviewBlocker,
  slaTone,
  useAsync,
  useCorporateEnv,
  useProfile,
  type AppealRow,
} from '@kit';

/**
 * The appeal queue.
 *
 * An appeal is a request that a decision be looked at again by somebody other than
 * the person who made it. That clause is the whole feature, so it is visible on
 * every row rather than discovered on submission: a row whose original decider is
 * you shows *why* you cannot take it, and a row somebody else holds says so.
 *
 * The queue is ordered the way `appeals_queue` returns it — breached first, then
 * oldest — rather than re-sorted here. A console that re-sorts shows a different
 * urgency from the one the database computed, and the two eventually disagree in
 * front of a member.
 */
export function Appeals(): ReactElement {
  const env = useCorporateEnv();
  const profile = useProfile();
  const load = useCallback(
    async () => orderAppeals(await listRpc<AppealRow>(env, 'appeals_queue', { p_limit: 100 })),
    [env],
  );
  const { state, reload } = useAsync(load, [env]);

  const uid = profile?.uid ?? '';

  return (
    <div className="kit-stack">
      <Banner tone="neutral" title="You cannot review a decision you made">
        <p className="kit-small" style={{ margin: 0 }}>
          That is enforced by the database, not by this screen. The row says who made the decision,
          so you can see why before you start reading.
        </p>
      </Banner>

      <Card
        title="Appeals waiting"
        description={
          state.status === 'ready' ? appealQueueSummary(state.data) : 'Reading the queue.'
        }
        actions={
          <Button size="small" variant="quiet" onClick={reload}>
            Refresh
          </Button>
        }
      >
        {state.status === 'loading' ? <Loading label="Loading appeals." /> : null}
        {state.status === 'error' ? (
          <Banner tone="bad" title="The appeal queue did not load">
            {state.message}
          </Banner>
        ) : null}
        {state.status === 'ready' && state.data.length === 0 ? (
          <Empty>
            No appeal is waiting. Every decision somebody asked about has been answered.
          </Empty>
        ) : null}
        {state.status === 'ready' && state.data.length > 0 ? (
          <div className="kit-stack">
            {breachedAppeals(state.data) > 0 ? (
              <Banner tone="bad" title="Past the target">
                {breachedAppeals(state.data)} appeal
                {breachedAppeals(state.data) === 1 ? ' is' : 's are'} past the time the policy
                allows. Somebody is waiting on a decision about their own account.
              </Banner>
            ) : null}
            <Table
              caption="Most overdue first"
              head={['Appellant', 'What it is about', 'Waiting', 'Clock', 'Held by', '']}
            >
              {state.data.map((appeal) => (
                <tr key={appeal.id}>
                  <td>{appeal.appellant}</td>
                  <td>
                    <div>{appeal.summary}</div>
                    <div className="kit-small kit-muted">{appeal.subject}</div>
                  </td>
                  <td>{hoursLabel(appeal.age_minutes)}</td>
                  <td>
                    <Badge tone={slaTone(toState(appeal.respond_state))}>
                      {appeal.respond_state}
                    </Badge>
                  </td>
                  <td className="kit-small kit-muted">
                    {appeal.reviewer_uid === null
                      ? 'nobody yet'
                      : appeal.reviewer_uid === uid
                        ? 'you'
                        : 'another reviewer'}
                  </td>
                  <td>
                    {appeal.status === 'open' ? (
                      canClaim(appeal, uid) ? (
                        <ClaimButton appeal={appeal} onClaimed={reload} />
                      ) : (
                        <span className="kit-small kit-muted">{reviewBlocker(appeal, uid)}</span>
                      )
                    ) : (
                      <DecideForm appeal={appeal} reviewerUid={uid} onDecided={reload} />
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

function toState(raw: string): 'ok' | 'watching' | 'breached' | 'met' {
  return raw === 'breached' || raw === 'watching' || raw === 'met' ? raw : 'ok';
}

function hoursLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h` : `${Math.round(hours / 24)} d`;
}

function ClaimButton({
  appeal,
  onClaimed,
}: {
  appeal: AppealRow;
  onClaimed: () => void;
}): ReactElement {
  const env = useCorporateEnv();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const claim = (): void => {
    setBusy(true);
    setError('');
    void (async () => {
      try {
        await callRpc(env, 'claim_appeal', { p_appeal_id: appeal.id });
        onClaimed();
      } catch (cause) {
        setError(messageOf(cause));
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <>
      <Button size="small" onClick={claim} disabled={busy}>
        {busy ? 'Taking' : 'Take it'}
      </Button>
      {error !== '' ? <div className="kit-error kit-small">{error}</div> : null}
    </>
  );
}

function DecideForm({
  appeal,
  reviewerUid,
  onDecided,
}: {
  appeal: AppealRow;
  reviewerUid: string;
  onDecided: () => void;
}): ReactElement {
  const env = useCorporateEnv();
  const [outcome, setOutcome] = useState('');
  const [upheld, setUpheld] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const blocker =
    upheld === null
      ? 'Choose whether the appeal is upheld.'
      : decisionBlocker(outcome, reviewerUid, appeal);

  const decide = (): void => {
    if (upheld === null) return;
    setBusy(true);
    setError('');
    void (async () => {
      try {
        await callRpc(env, 'decide_appeal', {
          p_appeal_id: appeal.id,
          p_upheld: upheld,
          p_outcome: outcome.trim(),
        });
        onDecided();
      } catch (cause) {
        setError(messageOf(cause));
      } finally {
        setBusy(false);
      }
    })();
  };

  if (appeal.reviewer_uid !== reviewerUid) {
    return <span className="kit-small kit-muted">{reviewBlocker(appeal, reviewerUid)}</span>;
  }

  return (
    <div className="kit-stack" style={{ minWidth: '16rem' }}>
      <TextArea
        label="Why"
        rows={3}
        value={outcome}
        hint="The member reads this. Twelve characters at least."
        onChange={(event) => setOutcome(event.target.value)}
      />
      {upheld !== null && outcome.trim().length >= 12 ? (
        <Banner tone={upheld ? 'ok' : 'warn'} title="This is what the member will be told">
          {appealOutcomeMessage(upheld, outcome)}
        </Banner>
      ) : null}
      <div className="kit-row">
        <Button size="small" variant="quiet" onClick={() => setUpheld(false)} disabled={busy}>
          Not upheld
        </Button>
        <Button size="small" onClick={() => setUpheld(true)} disabled={busy}>
          Upheld
        </Button>
        <Button
          size="small"
          onClick={decide}
          disabled={busy || blocker !== null || upheld === null}
        >
          {busy ? 'Deciding' : 'Decide'}
        </Button>
      </div>
      {blocker !== null && outcome !== '' ? (
        <p className="kit-small kit-muted" style={{ margin: 0 }}>
          {blocker}
        </p>
      ) : null}
      {error !== '' ? <div className="kit-error kit-small">{error}</div> : null}
    </div>
  );
}
