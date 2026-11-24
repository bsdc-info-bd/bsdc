import { useCallback, useState, type ReactElement } from 'react';
import {
  Banner,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  Empty,
  Field,
  Loading,
  callRpc,
  listRpc,
  useAsync,
  useCorporateEnv,
  useProfile,
  useToast,
  type Column,
} from '@kit';
import {
  authorityTone,
  canGrantFrom,
  countAuthority,
  describeRoute,
  expiryNote,
  orderAuthority,
  routeLabel,
  type AuthorityRow,
  type AuthoritySummary,
} from './authority';

/** What the operator has asked to do, waiting on a reason. */
type PendingAction =
  | { kind: 'grant'; permission: string; destructive: boolean }
  | { kind: 'revoke'; permission: string }
  | { kind: 'deny'; permission: string };

/**
 * The authority screen: one account, every permission, and why.
 *
 * This is the screen an owner opens when a member says "I cannot do X". The
 * answer has to be the reason, not just the verdict — "your role brings it",
 * "somebody granted it until Friday", "it was deliberately withheld and here is
 * what you were told" are four different conversations.
 *
 * Every write goes through the same RPCs the database already publishes
 * (`set_permission_grant`, `deny_permission`), so this screen cannot invent a
 * fifth way to change authority. A grant needs a reason of at least twelve
 * characters, and the form says so before the button is pressed rather than after
 * the server refuses.
 */
export function Authority(): ReactElement {
  const env = useCorporateEnv();
  const profile = useProfile();
  const { success, error: toastError, note } = useToast();
  const [uid, setUid] = useState(profile?.uid ?? '');
  const [language, setLanguage] = useState<'en' | 'bn'>('en');
  const [pending, setPending] = useState<PendingAction | null>(null);

  const load = useCallback(async () => {
    if (!uid.trim()) return { summary: null, rows: [] as readonly AuthorityRow[] };
    const [summaries, rows] = await Promise.all([
      listRpc<AuthoritySummary>(env, 'person_authority_summary', { p_uid: uid.trim() }),
      listRpc<AuthorityRow>(env, 'person_authority', { p_uid: uid.trim() }),
    ]);
    return { summary: summaries[0] ?? null, rows };
  }, [env, uid]);

  const { state, reload } = useAsync(load, [env, uid]);

  const apply = useCallback(
    async (action: PendingAction, cleanReason: string) => {
      try {
        if (action.kind === 'deny') {
          await callRpc(env, 'deny_permission', {
            p_subject: uid.trim(),
            p_permission: action.permission,
            p_reason: cleanReason,
          });
          success(`Denied ${action.permission}. The role still grants it; the denial wins.`);
        } else if (action.kind === 'revoke') {
          await callRpc(env, 'set_permission_grant', {
            p_subject: uid.trim(),
            p_permission: action.permission,
            p_grant: false,
            p_reason: cleanReason,
          });
          success(`Revoked ${action.permission}. The revocation keeps its record.`);
        } else {
          await callRpc(env, 'set_permission_grant', {
            p_subject: uid.trim(),
            p_permission: action.permission,
            p_grant: true,
            p_reason: cleanReason,
          });
          success(`Granted ${action.permission}.`);
        }
        setPending(null);
        reload();
      } catch (cause) {
        toastError(cause instanceof Error ? cause.message : 'The change did not go through.');
      }
    },
    [env, uid, success, toastError, reload],
  );

  return (
    <div className="kit-stack">
      <Card
        title="Authority"
        description="One account, every permission, and the reason for each answer."
        actions={
          <Button
            size="small"
            variant="quiet"
            onClick={() => {
              const next = language === 'en' ? 'bn' : 'en';
              setLanguage(next);
              note(next === 'bn' ? 'ভাষা: বাংলা' : 'Language: English');
            }}
          >
            {language === 'en' ? 'বাংলায় দেখুন' : 'View in English'}
          </Button>
        }
      >
        <div className="kit-row">
          <Field label="Account uid" hint="The person whose authority you are reading.">
            <input
              className="kit-input"
              value={uid}
              placeholder="00000000-0000-4000-8000-000000000000"
              onChange={(event) => setUid(event.target.value)}
            />
          </Field>
          <Button size="small" onClick={reload}>
            Read
          </Button>
        </div>
      </Card>

      {state.status === 'loading' && <Loading label="Reading authority." />}
      {state.status === 'error' && (
        <Banner tone="bad" title="The authority screen could not be read">
          <p className="kit-small">{state.message}</p>
          <p className="kit-small">
            A refusal usually means your account does not hold <code>people.read</code>. The message
            above says which permission the database wanted.
          </p>
        </Banner>
      )}

      {state.status === 'ready' && state.data.summary === null && (
        <Empty>
          <strong>Enter an account uid.</strong> The screen reads one account at a time, because the
          question it answers is about one person.
        </Empty>
      )}

      {state.status === 'ready' && state.data.summary !== null && (
        <AuthorityBody
          summary={state.data.summary}
          rows={state.data.rows}
          language={language}
          onAction={setPending}
        />
      )}

      <ConfirmDialog
        open={pending !== null}
        level="reason"
        tone={pending?.kind === 'deny' ? 'danger' : 'primary'}
        title={
          pending === null
            ? ''
            : pending.kind === 'deny'
              ? `Deny ${pending.permission}?`
              : pending.kind === 'revoke'
                ? `Revoke ${pending.permission}?`
                : `Grant ${pending.permission}?`
        }
        summary={
          pending?.kind === 'deny'
            ? 'The role keeps granting this; the denial overrides it until somebody lifts it.'
            : pending?.kind === 'revoke'
              ? 'The grant is closed, not deleted. Its history stays readable.'
              : 'This is an addition on top of the role. It can be scoped and given an expiry later.'
        }
        irreversibleNote={
          pending?.kind === 'grant' && pending.destructive
            ? 'This is a destructive permission: it lets the account change other people’s standing or hand the platform over. Only the owner may grant it.'
            : undefined
        }
        confirmLabel={pending?.kind === 'revoke' ? 'Revoke' : pending?.kind === 'deny' ? 'Deny' : 'Grant'}
        onCancel={() => {
          setPending(null);
        }}
        onConfirm={(reason) => {
          if (pending) void apply(pending, reason);
        }}
      />
    </div>
  );
}

function AuthorityBody({
  summary,
  rows,
  language,
  onAction,
}: {
  summary: AuthoritySummary;
  rows: readonly AuthorityRow[];
  language: 'en' | 'bn';
  onAction: (action: PendingAction) => void;
}): ReactElement {
  const counts = countAuthority(rows);
  const ordered = orderAuthority(rows);
  const bn = language === 'bn';

  return (
    <>
      <Banner
        tone={counts.denied > 0 ? 'warn' : 'ok'}
        title={`${summary.display_name} — ${summary.role} — ${summary.status}`}
      >
        <p className="kit-small">
          {counts.effective} of {rows.length} permissions in force
          {counts.granted > 0 ? `, ${String(counts.granted)} of them granted specifically` : ''}
          {counts.denied > 0 ? `, ${String(counts.denied)} deliberately withheld` : ''}
          {counts.destructive > 0 ? `, ${String(counts.destructive)} of them destructive` : ''}.
        </p>
        <p className="kit-small">
          {summary.sessions_live} live console session{summary.sessions_live === 1 ? '' : 's'}.
          {summary.last_seen_at
            ? ` Last seen ${new Date(summary.last_seen_at).toLocaleString()}.`
            : ' Never signed in.'}
        </p>
      </Banner>

      <Card
        title={bn ? 'প্রতিটি অনুমতি' : 'Every permission'}
        description={
          bn
            ? 'প্রথমে নিষেধাজ্ঞা, কারণ সেটিই অনুপস্থিত টিকের কারণ।'
            : 'Denials first, because they are the reason a tick is missing.'
        }
      >
        <DataTable<AuthorityRow>
          caption={`Authority for ${summary.display_name}`}
          columns={columnsFor(language, onAction)}
          rows={ordered}
          rowKey={(row) => row.permission}
          state={{ status: 'ready' }}
          initialSort={{ key: 'permission' }}
        />
      </Card>

      <Card title="How to read the route column">
        <ul className="kit-small">
          {(['role', 'grant', 'owner', 'denied', 'none'] as const).map((via) => (
            <li key={via}>
              <strong>{routeLabel(via, language)}</strong> — {describeRoute(via)}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

function columnsFor(
  language: 'en' | 'bn',
  onAction: (action: PendingAction) => void,
): readonly Column<AuthorityRow>[] {
  const bn = language === 'bn';
  return [
    {
      key: 'permission',
      header: bn ? 'অনুমতি' : 'Permission',
      render: (row) => row.permission,
      sortValue: (row) => row.permission,
    },
    {
      key: 'route',
      header: bn ? 'সূত্র' : 'Route',
      render: (row) => routeLabel(row.via, language),
      sortValue: (row) => row.via,
    },
    {
      key: 'state',
      header: bn ? 'অবস্থা' : 'State',
      render: (row) => {
        const word = row.effective ? (bn ? 'চালু' : 'in force') : bn ? 'নিষ্ক্রিয়' : 'not held';
        const expiry = expiryNote(row);
        // The tone drives the row's colour through the class name, so the word
        // and the colour cannot disagree.
        const tone = authorityTone(row);
        return <span className={`kit-authority kit-authority--${tone}`}>{expiry ? `${word} · ${expiry}` : word}</span>;
      },
      sortValue: (row) => (row.effective ? 0 : 1),
    },
    {
      key: 'why',
      header: bn ? 'কারণ' : 'Why',
      render: (row) =>
        row.via === 'denied'
          ? (row.deny_reason ?? describeRoute('denied'))
          : row.via === 'grant'
            ? (row.grant_reason ?? describeRoute('grant'))
            : describeRoute(row.via),
      hideBelow: 'md',
    },
    {
      key: 'actions',
      header: bn ? 'কাজ' : 'Actions',
      render: (row) => (
        <span className="kit-row">
          {row.effective && row.via !== 'owner' ? (
            <Button
              size="small"
              variant="quiet"
              onClick={() => {
                onAction({ kind: 'deny', permission: row.permission });
              }}
            >
              Deny
            </Button>
          ) : null}
          {row.via === 'grant' ? (
            <Button
              size="small"
              variant="quiet"
              onClick={() => {
                onAction({ kind: 'revoke', permission: row.permission });
              }}
            >
              Revoke
            </Button>
          ) : null}
          {!row.effective ? (
            <Button
              size="small"
              variant="quiet"
              onClick={() => {
                onAction({
                  kind: 'grant',
                  permission: row.permission,
                  destructive: canGrantFrom(
                    { role_rank: row.role_rank, via: row.via, effective: true, grant_rank: row.grant_rank },
                    { is_destructive: row.is_destructive, grant_rank: row.grant_rank },
                  )
                    ? row.is_destructive
                    : false,
                });
              }}
            >
              Grant
            </Button>
          ) : null}
        </span>
      ),
    },
  ];
}
