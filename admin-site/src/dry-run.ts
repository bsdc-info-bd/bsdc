/**
 * `--dry-run`: what would happen, printed without anything happening.
 *
 * Gap G10 in the plan. The temptation is to implement a dry-run as a parallel code
 * path that describes what the real one will do — and that is the failure mode,
 * because a description that can drift from the action is worse than no preview at
 * all. So this module does not describe; it *resolves*. It runs the same argument
 * checking, the same permission assumption and the same target resolution the real
 * path runs, and returns the plan it would execute. Where it cannot be certain, it
 * says so rather than guessing.
 *
 * Nothing here performs a network call. A dry-run that talks to the database is a
 * dry-run that can fail for reasons unrelated to the plan, and a preview that fails
 * teaches an operator to skip it.
 */

import { BULK_REASON_MIN, BULK_SUBJECTS, type BulkSubject } from './cli-engine';

export interface DryRunStep {
  /** What would be called, as a function name. */
  rpc: string;
  /** The arguments it would be called with, so a reader can check them. */
  args: Record<string, unknown>;
  /** The audit action string the call would write. */
  audit: string;
  /** One line a person can read. */
  summary: string;
}

export interface DryRunPlan {
  ok: boolean;
  /** The command as typed, so the plan carries what it is a plan for. */
  command: string;
  steps: DryRunStep[];
  /** Why the command would be refused. Non-empty means nothing would be called. */
  problems: string[];
  /** Things the plan cannot know without asking the database. */
  unknowns: string[];
}

/** The verbs that change something. A dry-run of a read is the read, so it is not listed. */
export const DESTRUCTIVE_VERBS: readonly string[] = [
  'approvals',
  'bulk',
  'case',
  'cert',
  'notices',
  'pages',
  'redirects',
  'seo',
  'standing',
];

/** Whether this command is worth a dry-run at all. */
export function isDestructive(command: string): boolean {
  const verb = command.trim().split(/\s+/)[0] ?? '';
  return DESTRUCTIVE_VERBS.includes(verb);
}

/**
 * Whether a command needs its subject id typed out before it runs.
 *
 * The plan asks for the id rather than the word "confirm", and the reason is
 * narrow: typing an id forces the operator to look at which record they are about
 * to change. Typing "yes" forces them to look at nothing.
 */
export function requiresTypedId(command: string): boolean {
  const words = command.trim().split(/\s+/);
  const verb = words[0] ?? '';
  const sub = words[1] ?? '';
  if (verb === 'bulk' && sub === 'apply') return true;
  if (verb === 'case' && (sub === 'close' || sub === 'reopen')) return true;
  if (verb === 'approvals') return true;
  if (verb === 'cert' && sub === 'revoke') return true;
  if (verb === 'redirects' && sub === 'remove') return true;
  if (verb === 'standing' && sub === 'adjust') return true;
  return false;
}

/** The id a confirmation would need typed, or null when the verb takes none. */
export function confirmationTarget(command: string): string | null {
  if (!requiresTypedId(command)) return null;
  const words = command.trim().split(/\s+/);
  const verb = words[0] ?? '';
  const sub = words[1] ?? '';
  if (verb === 'bulk' && sub === 'apply') return words[2] ?? null;
  if (verb === 'case') return words[2] ?? null;
  if (verb === 'cert') return words[2] ?? null;
  if (verb === 'redirects') return words[2] ?? null;
  if (verb === 'approvals') return words[2] ?? null;
  return null;
}

/**
 * Build the plan a command would execute.
 *
 * This takes the already-parsed words and flags rather than re-parsing, so the
 * dry-run cannot disagree with the real path about what was typed — the parser runs
 * once.
 */
export function planCommand(
  positional: readonly string[],
  flags: Readonly<Record<string, string | boolean>>,
): DryRunPlan {
  const command = positional.join(' ');
  const verb = positional[0] ?? '';
  const sub = positional[1] ?? '';
  const steps: DryRunStep[] = [];
  const problems: string[] = [];
  const unknowns: string[] = [];

  const flag = (name: string): string =>
    typeof flags[name] === 'string' ? String(flags[name]) : '';

  if (!isDestructive(command)) {
    return {
      ok: false,
      command,
      steps,
      problems: [
        `\`${verb || 'that'}\` changes nothing, so --dry-run has nothing to preview. Run it.`,
      ],
      unknowns: [],
    };
  }

  if (verb === 'bulk') {
    if (sub === 'plan') {
      const subject = positional[2] ?? '';
      const action = positional[3] ?? '';
      const reason = flag('reason');
      if (!(subject in BULK_SUBJECTS)) {
        problems.push(
          `The subject must be one of: ${Object.keys(BULK_SUBJECTS).join(', ')}.`,
        );
      } else if (!(BULK_SUBJECTS[subject as BulkSubject] as readonly string[]).includes(action)) {
        problems.push(
          `${subject} can be ${BULK_SUBJECTS[subject as BulkSubject].join(' or ')}, not "${action}".`,
        );
      }
      if (reason.trim().length < BULK_REASON_MIN) {
        problems.push(
          `A plan needs a reason of at least ${String(BULK_REASON_MIN)} characters; --reason is "${reason}".`,
        );
      }
      steps.push({
        rpc: 'bulk_plan',
        args: { p_subject: subject, p_action: action, p_reason: reason },
        audit: 'bulk.plan',
        summary: `Would store a plan to ${action} every matching ${subject}, and write nothing yet.`,
      });
      unknowns.push(
        'How many rows match: that is the plan itself, and it needs the database. This preview cannot count them.',
      );
      return { ok: problems.length === 0, command, steps, problems, unknowns };
    }

    if (sub === 'apply') {
      const planId = positional[2] ?? '';
      if (!planId) {
        problems.push('apply needs the plan id that `bulk plan` printed.');
      } else if (!/^[0-9a-f-]{8,36}$/i.test(planId)) {
        problems.push(`"${planId}" does not look like a plan id.`);
      }
      steps.push({
        rpc: 'bulk_apply',
        args: { p_plan_id: planId },
        audit: 'bulk.apply',
        summary: `Would apply plan ${planId}. Each row is re-checked against the stored preview first, and any that moved are named in the receipt rather than folded into a count.`,
      });
      unknowns.push(
        'Whether the plan is still inside its two-hour window, and whether any row changed since it was made. Both are checked at apply time.',
      );
      return { ok: problems.length === 0, command, steps, problems, unknowns };
    }

    problems.push('Usage: bulk plan <subject> <action> --reason <text> | bulk apply <id>');
    return { ok: false, command, steps, problems, unknowns };
  }

  if (verb === 'case' && sub === 'close') {
    const id = positional[2] ?? '';
    const outcome = positional[3] ?? '';
    const reason = flag('reason');
    const quiet = outcome === 'no_action' || outcome === 'duplicate';
    if (!id) problems.push('close needs the case id.');
    if (!outcome) {
      problems.push(
        'close needs an outcome: no_action, content_removed, account_suspended, account_banned, warned, referred or duplicate.',
      );
    }
    if (!quiet && outcome && reason.trim().length < 12) {
      problems.push(
        `The member is told about "${outcome}", so --reason needs at least twelve characters; it is "${reason}".`,
      );
    }
    steps.push({
      rpc: 'close_case',
      args: {
        p_case_id: id,
        p_outcome: outcome,
        p_outcome_message_key: quiet ? '' : outcome,
        p_note: reason,
      },
      audit: 'case.close',
      summary: quiet
        ? `Would close case ${id} as ${outcome} and announce nothing, because nothing was done.`
        : `Would close case ${id} as ${outcome} and tell the member, with your note. A message cannot be unsent.`,
    });
    return { ok: problems.length === 0, command, steps, problems, unknowns };
  }

  if (verb === 'case' && sub === 'note') {
    const id = positional[2] ?? '';
    const body = positional.slice(3).join(' ');
    if (!id) problems.push('note needs the case id.');
    if (body.trim().length < 2) problems.push('note needs some text.');
    steps.push({
      rpc: 'add_case_note',
      args: { p_case_id: id, p_body: body, p_kind: 'note' },
      audit: 'case.note',
      summary: `Would append "${body}" to case ${id}. The timeline cannot be edited, so this cannot be taken back — only corrected by another note.`,
    });
    return { ok: problems.length === 0, command, steps, problems, unknowns };
  }

  if (verb === 'standing' && sub === 'adjust') {
    const uid = positional[2] ?? '';
    const rule = positional[3] ?? '';
    const points = flag('points');
    if (!uid) problems.push('adjust needs the member uid.');
    if (!rule) problems.push('adjust needs a rule key from standing_rules.');
    steps.push({
      rpc: 'person_standing_adjust',
      args: {
        p_uid: uid,
        p_rule_key: rule,
        p_reason: flag('reason'),
        p_points: points === '' ? null : Number(points),
      },
      audit: 'standing.adjust',
      summary: `Would add an entry under ${rule} to ${uid}${points === '' ? ' at the rule default' : ` worth ${points}`}.`,
    });
    unknowns.push(
      'The rule default and its expiry window: both live in standing_rules, and a wrong rule key is refused at write time rather than here.',
    );
    return { ok: problems.length === 0, command, steps, problems, unknowns };
  }

  if (verb === 'approvals') {
    // `approvals` itself is a two-word family — `approvals list`, `approvals shop
    // <id> …`, `approvals campaign <id> …`. The id is therefore the *third* word
    // when a kind is named and the second when it is not, and the first version of
    // this builder read the wrong two positions and refused every real command.
    const kind = positional[1] ?? '';
    const hasKind = kind === 'shop' || kind === 'campaign';
    const target = hasKind ? (positional[2] ?? '') : kind;
    const action = hasKind ? (positional[3] ?? '') : (positional[2] ?? '');
    if (!target) {
      problems.push('Which application? approvals <id> <approve|refuse>, or approvals shop <id> <approve|refuse>.');
    }
    if (action !== 'approve' && action !== 'refuse') {
      problems.push('The action is approve or refuse.');
    }
    if (flag('reason').trim().length < 12) {
      problems.push('A decision needs a reason of at least twelve characters.');
    }
    steps.push({
      rpc: 'mk_admin_decide_application',
      args: { id: target, decision: action, reason: flag('reason') },
      audit: `shop.${action}`,
      summary: `Would ${action} application ${target} and tell the applicant, with your reason in both languages.`,
    });
    return { ok: problems.length === 0, command, steps, problems, unknowns };
  }

  // A destructive verb with no plan builder is a gap, not a pass. Saying so is
  // better than printing an empty preview that a reader takes as "nothing will
  // change".
  problems.push(
    `\`${verb}\` writes, but this build has no dry-run for it. Run it without --dry-run and read the confirmation.`,
  );
  return { ok: false, command, steps, problems, unknowns };
}

/** The plan as text for the transcript. */
export function renderPlan(plan: DryRunPlan): string {
  const lines: string[] = [`DRY RUN — nothing has been written.`, `command: ${plan.command}`, ''];
  if (plan.problems.length > 0) {
    lines.push('This command would be refused:');
    for (const problem of plan.problems) lines.push(`  x ${problem}`);
    lines.push('', 'Nothing would be called.');
    return lines.join('\n');
  }
  lines.push('Would call:');
  for (const step of plan.steps) {
    lines.push(`  ${step.rpc}(${JSON.stringify(step.args)})`);
    lines.push(`  audit: ${step.audit}`);
    lines.push(`  ${step.summary}`);
  }
  if (plan.unknowns.length > 0) {
    lines.push('', 'What this preview cannot know:');
    for (const unknown of plan.unknowns) lines.push(`  ? ${unknown}`);
  }
  return lines.join('\n');
}
