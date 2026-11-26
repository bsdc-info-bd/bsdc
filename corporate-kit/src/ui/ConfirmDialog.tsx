import { useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from 'react';
import {
  confirmationPhraseFor,
  matchesConfirmation,
  reasonMessage,
  reasonQuality,
  type ReasonPolicy,
} from '../domain/reason';
import { Button, TextArea, Field } from './primitives';

/**
 * The dialog in front of anything that cannot be undone.
 *
 * Every destructive action in the suite goes through this one component, and it
 * exists because the console is not allowed to be the only guard *but must
 * still be a correct one*. The database refuses a destructive write with no
 * reason; this makes sure the operator is asked for a usable one before the
 * round trip, rather than after it.
 *
 * Three levels of friction, chosen by the caller rather than by habit:
 *
 * - `confirm` — one click. For a reversible action.
 * - `reason` — a real sentence. For anything that changes a person's standing.
 * - `typed` — the record's own name, typed. For the five irreversible verbs.
 *
 * The diff block is not decoration. An operator who is shown exactly what will
 * change can catch their own mistake before it is permanent, which is cheaper
 * than any amount of undo.
 */

export type ConfirmVerdict =
  | { readonly kind: 'confirmed'; readonly reason: string }
  | { readonly kind: 'cancelled' };

export type DiffRow = {
  readonly field: string;
  readonly before: string;
  readonly after: string;
};

export type ConfirmLevel = 'confirm' | 'reason' | 'typed';

export function ConfirmDialog({
  open,
  title,
  summary,
  confirmLabel,
  level = 'reason',
  tone = 'danger',
  diff = [],
  typedName,
  irreversibleNote,
  policy,
  busy = false,
  onCancel,
  onConfirm,
}: {
  readonly open: boolean;
  readonly title: string;
  /** One sentence: what this will do, in plain language. */
  readonly summary: string;
  readonly confirmLabel: string;
  readonly level?: ConfirmLevel;
  readonly tone?: 'primary' | 'danger';
  readonly diff?: readonly DiffRow[];
  /** The exact phrase to type. Defaults to the title when `level` is `typed`. */
  readonly typedName?: string | undefined;
  /** Shown above the buttons when the action cannot be reversed at all. */
  readonly irreversibleNote?: string | undefined;
  readonly policy?: ReasonPolicy | undefined;
  readonly busy?: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: (reason: string) => void;
}): ReactElement | null {
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');
  const [touched, setTouched] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const reasonId = useId();

  // Reset when opened, so a cancelled dialog does not keep the last reason and
  // a confirmed one cannot be accidentally resubmitted.
  useEffect(() => {
    if (open) {
      setReason('');
      setTyped('');
      setTouched(false);
    }
  }, [open]);

  // Escape closes, and focus moves into the dialog so a keyboard user is not
  // left behind it. A modal that does not trap focus is a modal that lies.
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !busy) {
        event.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    const focusTarget = dialogRef.current?.querySelector<HTMLElement>(
      'textarea, input, button[data-primary]',
    );
    focusTarget?.focus();
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, busy, onCancel]);

  if (!open) return null;

  const phrase = typedName === undefined ? confirmationPhraseFor(title) : typedName;
  const reasonProblem = level === 'confirm' ? null : reasonMessage(reason, policy);
  const typedOk = level !== 'typed' || matchesConfirmation(typed, phrase);
  const quality = reasonQuality(reason);
  const ready = typedOk && (level === 'confirm' || reasonProblem === null) && !busy;

  const submit = (): void => {
    setTouched(true);
    if (!ready) return;
    onConfirm(level === 'confirm' ? '' : reason.trim());
  };

  return (
    <div
      className="kit-modal-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div
        className="kit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${reasonId}-title`}
        ref={dialogRef}
      >
        <h2 id={`${reasonId}-title`} className="kit-modal-title">
          {title}
        </h2>
        <p className="kit-modal-summary">{summary}</p>

        {irreversibleNote !== undefined && irreversibleNote.length > 0 && (
          <p className="kit-modal-warning" role="note">
            {irreversibleNote}
          </p>
        )}

        {diff.length > 0 && <DiffTable rows={diff} />}

        {level !== 'confirm' && (
          <div className="kit-modal-field">
            <TextArea
              label={level === 'typed' ? 'Why is this necessary?' : 'Reason'}
              value={reason}
              rows={3}
              placeholder="What happened, in terms a person reading this next year will understand."
              onChange={(event) => setReason(event.target.value)}
              onBlur={() => setTouched(true)}
              {...(touched && reasonProblem !== null
                ? { error: reasonProblem }
                : { hint: qualityHint(quality) })}
            />
          </div>
        )}

        {level === 'typed' && (
          <div className="kit-modal-field">
            <Field
              label={`Type “${phrase}” to confirm`}
              value={typed}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setTyped(event.target.value)}
              {...(touched && !typedOk
                ? { error: 'That does not match. Type the name exactly as it appears above.' }
                : { hint: 'This makes your hands slow down. It is the only reason it is here.' })}
            />
          </div>
        )}

        <div className="kit-modal-actions">
          <Button variant="quiet" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <button
            type="button"
            data-primary
            className={`kit-btn ${tone === 'danger' ? 'kit-btn--danger' : ''}`.trim()}
            onClick={submit}
            disabled={!ready}
          >
            {busy ? 'Working' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function qualityHint(quality: ReturnType<typeof reasonQuality>): string {
  switch (quality) {
    case 'empty':
      return 'Required. It is the only part of this record a person will read later.';
    case 'thin':
      return 'Not yet a reason — say what specifically happened.';
    case 'adequate':
      return 'Enough to record.';
    case 'good':
      return 'This will still make sense in six months.';
    /* c8 ignore next */
    default:
      return '';
  }
}

function DiffTable({ rows }: { readonly rows: readonly DiffRow[] }): ReactElement {
  return (
    <div className="kit-modal-diff">
      <p className="kit-small kit-muted">This changes:</p>
      <table className="kit-table">
        <caption className="kit-small kit-muted">Changes to be applied</caption>
        <thead>
          <tr>
            <th scope="col">Field</th>
            <th scope="col">Now</th>
            <th scope="col">After</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.field}>
              <th scope="row">{row.field}</th>
              <td>
                <span className="kit-diff-before">{row.before}</span>
              </td>
              <td>
                <span className="kit-diff-after">{row.after}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Builds diff rows from a before/after pair, skipping what did not change. */
export function diffRows(
  before: Readonly<Record<string, string | null | undefined>>,
  after: Readonly<Record<string, string | null | undefined>>,
  labels: Readonly<Record<string, string>> = {},
): readonly DiffRow[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const rows: DiffRow[] = [];
  for (const key of keys) {
    const from = before[key] ?? '—';
    const to = after[key] ?? '—';
    if (from === to) continue;
    rows.push({ field: labels[key] ?? key, before: from, after: to });
  }
  return rows;
}

/** Wraps a dialog body so a long diff scrolls rather than pushing buttons off screen. */
export function ConfirmDialogBody({ children }: { readonly children: ReactNode }): ReactElement {
  return <div className="kit-modal-body">{children}</div>;
}
