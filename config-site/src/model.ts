import { formatConfigValue, type ConfigEntry, type ConfigValueType } from '@kit';

/** The shape `site_config_list()` returns, before it is given better names. */
export type ConfigRow = {
  readonly key: string;
  readonly value: unknown;
  readonly value_type: ConfigValueType;
  readonly group_name: string;
  readonly label: string;
  readonly help: string;
  readonly min_value: number | string | null;
  readonly max_value: number | string | null;
  readonly options: readonly string[] | null;
  readonly is_public: boolean;
  readonly updated_at: string;
};

/** Numerics arrive from PostgREST as strings; a bound is a number or absent. */
function bound(value: number | string | null): number | null {
  if (value === null) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toEntry(row: ConfigRow): ConfigEntry {
  return {
    key: row.key,
    groupName: row.group_name,
    label: row.label === '' ? row.key : row.label,
    description: row.help,
    valueType: row.value_type,
    value: row.value,
    minValue: bound(row.min_value),
    maxValue: bound(row.max_value),
    options: row.options && row.options.length > 0 ? row.options : null,
    isPublic: row.is_public,
    updatedAt: row.updated_at,
  };
}

/** What the editor should start with in the text box for an entry. */
export function editableText(entry: ConfigEntry): string {
  if (entry.valueType === 'json') return JSON.stringify(entry.value, null, 2);
  if (entry.value === null || entry.value === undefined) return '';
  return String(entry.value);
}

export type HistoryRow = {
  readonly id: number;
  readonly old_value: unknown;
  readonly new_value: unknown;
  readonly changed_by: string | null;
  readonly changed_at: string;
};

/**
 * One line describing a change, used in the history list. A first-ever value
 * is described as such rather than as a change from nothing, because "set to
 * 500" and "changed from nothing to 500" are different events.
 */
export function describeChange(valueType: ConfigValueType, row: HistoryRow): string {
  const next = formatConfigValue(valueType, row.new_value);
  if (row.old_value === null || row.old_value === undefined) return `set to ${next}`;
  const previous = formatConfigValue(valueType, row.old_value);
  if (previous === next) return `rewritten with the same value, ${next}`;
  return `changed from ${previous} to ${next}`;
}

/** The three feed weights are meant to add up to one; this reports the drift. */
export function feedWeightDrift(entries: readonly ConfigEntry[]): number | null {
  const weights = entries.filter(
    (entry) => entry.key.startsWith('feed.') && entry.key.endsWith('_weight'),
  );
  if (weights.length === 0) return null;
  const total = weights.reduce(
    (sum, entry) => sum + (typeof entry.value === 'number' ? entry.value : 0),
    0,
  );
  return Math.round((total - 1) * 1000) / 1000;
}

// ---------------------------------------------------------------------------
// §12.1 Provenance, blast radius, secrets, staging
// ---------------------------------------------------------------------------

/** The shape `site_config_console()` returns: every column the editor needs. */
export type ConsoleRow = ConfigRow & {
  readonly is_secret: boolean;
  readonly secret_is_set: boolean;
  readonly secret_set_at: string | null;
  readonly secret_rotated_at: string | null;
  readonly source: 'default' | 'database' | 'environment' | 'override';
  readonly owner_area: string;
  readonly requires_approval: boolean;
  readonly reader_count: number | null;
  readonly removal_proposed: boolean;
  readonly updated_by: string | null;
};

export type Provenance = {
  readonly source: ConsoleRow['source'];
  readonly label: string;
  readonly detail: string;
  /** True when the value was chosen deliberately rather than inherited. */
  readonly chosen: boolean;
};

/**
 * Where a value came from, said in a sentence.
 *
 * "Why is this on" is answered by the source and not by the value — a key reading
 * `true` from the seed data and a key reading `true` because somebody set it in
 * March are the same value and different facts. The distinction is what makes a
 * rollback safe: only a `database` value has a history worth reverting.
 */
export function provenanceOf(row: ConsoleRow): Provenance {
  switch (row.source) {
    case 'database':
      return {
        source: row.source,
        label: 'Set here',
        detail:
          row.updated_by === null
            ? 'An operator set this value in this console.'
            : `Set in this console by ${row.updated_by}.`,
        chosen: true,
      };
    case 'environment':
      return {
        source: row.source,
        label: 'From the deploy',
        detail:
          'Supplied by the deployment. Editing it here takes effect until the next deploy overrides it again.',
        chosen: false,
      };
    case 'override':
      return {
        source: row.source,
        label: 'Forced',
        detail: 'Forced by an override that the deploy controls. A change here will not survive it.',
        chosen: false,
      };
    case 'default':
    default:
      return {
        source: 'default',
        label: 'Never changed',
        detail: 'This is the value the platform shipped with. Nobody has overridden it.',
        chosen: false,
      };
  }
}

export type BlastRadiusReader = {
  readonly reader: string;
  readonly kind: 'screen' | 'job' | 'edge' | 'app' | 'test';
  readonly note: string;
};

export type BlastRadius = {
  readonly readers: readonly BlastRadiusReader[];
  readonly count: number;
  /** What the save is about to move, in one sentence. */
  readonly sentence: string;
  /** A key nothing reads. The spec asks for it to be flagged, not for it to be deleted. */
  readonly orphan: boolean;
};

const READER_PLURAL: Readonly<Record<BlastRadiusReader['kind'], string>> = {
  screen: 'screen',
  job: 'job',
  edge: 'edge worker',
  app: 'application',
  test: 'test',
};

export function describeBlastRadius(readers: readonly BlastRadiusReader[]): BlastRadius {
  const count = readers.length;
  if (count === 0) {
    return {
      readers,
      count,
      sentence:
        'Nothing reads this setting. It can be proposed for removal — which is a decision, not a cleanup.',
      orphan: true,
    };
  }
  const byKind = new Map<BlastRadiusReader['kind'], number>();
  for (const reader of readers) byKind.set(reader.kind, (byKind.get(reader.kind) ?? 0) + 1);
  const parts = [...byKind.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([kind, n]) => `${String(n)} ${READER_PLURAL[kind]}${n === 1 ? '' : 's'}`);
  return {
    readers,
    count,
    sentence: `Saving this changes ${String(count)} thing${count === 1 ? '' : 's'}: ${parts.join(', ')}.`,
    orphan: false,
  };
}

/**
 * A secret is write-only, so the editor has no value to show.
 *
 * The read returns a boolean, and this turns it into what an operator needs before
 * deciding to rotate: is one set, and how long has it been sitting there.
 */
export type SecretState = {
  readonly isSet: boolean;
  readonly summary: string;
  /** Days since the value was first set, or null when nothing is set. */
  readonly ageDays: number | null;
  /** True after 90 days, which is the point rotation is proposed rather than suggested. */
  readonly rotationDue: boolean;
};

export function secretState(row: ConsoleRow, now = new Date()): SecretState {
  if (!row.secret_is_set || row.secret_set_at === null) {
    return { isSet: false, summary: 'No secret is set for this key.', ageDays: null, rotationDue: false };
  }
  const setAt = new Date(row.secret_set_at).getTime();
  const rotatedAt = row.secret_rotated_at === null ? setAt : new Date(row.secret_rotated_at).getTime();
  const ageDays = Number.isFinite(rotatedAt)
    ? Math.floor((now.getTime() - rotatedAt) / 86_400_000)
    : null;
  if (ageDays === null) {
    return {
      isSet: true,
      summary: 'A secret is set. Its rotation date could not be read.',
      ageDays: null,
      rotationDue: false,
    };
  }
  const when =
    ageDays <= 0 ? 'today' : ageDays === 1 ? 'yesterday' : `${String(ageDays)} days ago`;
  return {
    isSet: true,
    summary: `A secret is set, last rotated ${when}.`,
    ageDays,
    rotationDue: ageDays >= 90,
  };
}

/**
 * The reason floor, which applies to every route: direct, staged, scheduled.
 *
 * Delegated to the kit's `reasonProblems` rather than reimplemented. It is the same
 * rule the RPC applies and it catches more than length — "test", "n/a" and "fixed"
 * are all twelve characters and none of them is a reason. A local copy with a
 * different minimum is how a console offers a button the database refuses.
 */
export { reasonMessage, reasonProblems } from '@kit';
export type { ReasonProblem } from '@kit';

export const MIN_REASON = 12;

export type Route = 'direct' | 'staged' | 'scheduled';

/**
 * What pressing Save will actually do, decided before the request.
 *
 * The database decides this itself and the result carries the route it took — but a
 * screen that says "saved" when a change was only proposed is how somebody leaves
 * believing a flag is on. This mirrors the server's order: approval beats schedule.
 */
export function plannedRoute(row: ConsoleRow, applyAt: string): Route {
  if (row.requires_approval) return 'staged';
  if (applyAt.trim() !== '') return 'scheduled';
  return 'direct';
}

export function routeSummary(route: Route, row: ConsoleRow): string {
  switch (route) {
    case 'staged':
      return `This is a production setting, so the change is staged. Somebody other than you has to approve it, and the live value does not move until they do.`;
    case 'scheduled':
      return `The live value stays as it is until the scheduled time, and the change can be cancelled before then.`;
    case 'direct':
    default:
      return row.is_secret
        ? 'Saving replaces the stored secret. The old value is not kept, so have the new one to hand.'
        : 'The live value changes as soon as you save.';
  }
}

export type StagedRow = {
  readonly id: string;
  readonly key: string;
  readonly proposed_value: unknown;
  readonly reason: string;
  readonly status: 'pending' | 'applied' | 'rejected' | 'cancelled';
  readonly apply_at: string | null;
  readonly proposed_by: string;
  readonly proposed_at: string;
  readonly decided_by: string | null;
  readonly decided_at: string | null;
  readonly decision_note: string;
  /** True when the change has a time and will apply itself. */
  readonly scheduled?: boolean;
  /**
   * Whether the person making this request may decide it.
   *
   * Computed by `config_pending_changes` from the session, not by the screen from a
   * uid it fetched separately — the button and the enforcement must be the same
   * answer, or the console teaches an operator that the button is decorative.
   */
  readonly can_decide?: boolean;
  /** The sentence explaining why the button is not offered. */
  readonly blocker?: string;
};

/** Whether a staged change is waiting, and what it is waiting for. */
export function stagedState(row: StagedRow, viewerUid: string | null): {
  readonly waiting: boolean;
  readonly needsApprovalFrom: 'anybody-else' | 'nobody';
  readonly sentence: string;
} {
  if (row.status !== 'pending') {
    return {
      waiting: false,
      needsApprovalFrom: 'nobody',
      sentence: `This change was ${row.status}.`,
    };
  }
  // A scheduled change needs no second person; a staged one does, and not from the
  // person who proposed it.
  if (row.apply_at !== null) {
    return {
      waiting: false,
      needsApprovalFrom: 'nobody',
      sentence: `Scheduled to apply at ${row.apply_at}.`,
    };
  }
  if (viewerUid !== null && viewerUid === row.proposed_by) {
    return {
      waiting: true,
      needsApprovalFrom: 'anybody-else',
      sentence: 'Waiting for somebody else to approve this. You proposed it, so you cannot.',
    };
  }
  return {
    waiting: true,
    needsApprovalFrom: 'nobody',
    sentence: 'Waiting for approval. You can approve it.',
  };
}
