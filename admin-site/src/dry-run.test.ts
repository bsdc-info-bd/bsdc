import { describe, expect, it } from 'vitest';
import {
  confirmationTarget,
  isDestructive,
  planCommand,
  renderPlan,
  requiresTypedId,
} from './dry-run';
import { parseCli } from './cli-engine';

function planFor(command: string) {
  const parsed = parseCli(command);
  expect(parsed.error).toBeUndefined();
  return planCommand(parsed.positional, parsed.flags);
}

describe('isDestructive', () => {
  it('knows the verbs that write', () => {
    for (const verb of ['approvals', 'bulk', 'case', 'cert', 'notices', 'redirects', 'seo']) {
      expect(isDestructive(`${verb} something`)).toBe(true);
    }
  });

  it('knows the verbs that do not', () => {
    expect(isDestructive('telemetry')).toBe(false);
    expect(isDestructive('audit --limit 5')).toBe(false);
    expect(isDestructive('help')).toBe(false);
  });

  it('treats an empty command as not destructive rather than crashing', () => {
    expect(isDestructive('')).toBe(false);
  });
});

describe('requiresTypedId', () => {
  it('requires the id for a bulk apply, because that is the moment a plan becomes real', () => {
    expect(requiresTypedId('bulk apply 7f3a-b2')).toBe(true);
  });

  it('does not require one for a bulk plan, which writes nothing', () => {
    expect(requiresTypedId('bulk plan shops approve --reason x')).toBe(false);
  });

  it('requires one to close a case', () => {
    expect(requiresTypedId('case close abc warned')).toBe(true);
  });

  it('does not require one to add a note', () => {
    expect(requiresTypedId('case note abc "hello"')).toBe(false);
  });
});

describe('confirmationTarget', () => {
  it('is the plan id for a bulk apply', () => {
    expect(confirmationTarget('bulk apply 7f3a-b2')).toBe('7f3a-b2');
  });

  it('is the case id for a close', () => {
    expect(confirmationTarget('case close abc123 warned')).toBe('abc123');
  });

  it('is null when the verb takes no id', () => {
    expect(confirmationTarget('telemetry')).toBeNull();
  });
});

describe('planCommand — reads', () => {
  it('refuses to preview something that changes nothing, and says to just run it', () => {
    const plan = planFor('telemetry --dry-run');
    expect(plan.ok).toBe(false);
    expect(plan.problems[0]).toContain('changes nothing');
  });
});

describe('planCommand — bulk plan', () => {
  it('accepts a well-formed plan and writes nothing', () => {
    const plan = planFor('bulk plan shops approve --reason "Both trade licences verified"');
    expect(plan.problems).toEqual([]);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]?.rpc).toBe('bulk_plan');
    expect(plan.steps[0]?.audit).toBe('bulk.plan');
  });

  it('names the subject it would act on', () => {
    const plan = planFor('bulk plan shops approve --reason "Both trade licences verified"');
    expect(plan.steps[0]?.args['p_subject']).toBe('shops');
  });

  it('refuses an unknown subject and lists the real ones', () => {
    const plan = planFor('bulk plan wizards approve --reason "Both trade licences verified"');
    expect(plan.ok).toBe(false);
    expect(plan.problems[0]).toContain('shops');
  });

  it('refuses an action the subject does not support', () => {
    const plan = planFor('bulk plan shops resolve --reason "Both trade licences verified"');
    expect(plan.ok).toBe(false);
    expect(plan.problems[0]).toContain('approve');
  });

  it('refuses a thin reason before the database has to', () => {
    const plan = planFor('bulk plan shops approve --reason "ok"');
    expect(plan.ok).toBe(false);
    expect(plan.problems[0]).toContain('12 characters');
  });

  it('admits it cannot count the matching rows without the database', () => {
    const plan = planFor('bulk plan shops approve --reason "Both trade licences verified"');
    expect(plan.unknowns.join(' ')).toContain('needs the database');
  });
});

describe('planCommand — bulk apply', () => {
  it('plans the apply and names the id', () => {
    const plan = planFor('bulk apply 7f3a-b2c4 --dry-run');
    expect(plan.ok).toBe(true);
    expect(plan.steps[0]?.rpc).toBe('bulk_apply');
    expect(plan.steps[0]?.args['p_plan_id']).toBe('7f3a-b2c4');
  });

  it('refuses an apply with no id', () => {
    const plan = planFor('bulk apply');
    expect(plan.ok).toBe(false);
    expect(plan.problems[0]).toContain('plan id');
  });

  it('refuses something that is not shaped like an id', () => {
    const plan = planFor('bulk apply everything');
    expect(plan.ok).toBe(false);
    expect(plan.problems[0]).toContain('does not look like a plan id');
  });

  it('admits it cannot know whether rows moved since the plan', () => {
    const plan = planFor('bulk apply 7f3a-b2c4');
    expect(plan.unknowns.join(' ')).toContain('changed since it was made');
  });
});

describe('planCommand — case close', () => {
  it('plans an announced outcome and says the message cannot be unsent', () => {
    const plan = planFor('case close abc123 content_removed --reason "The post was taken down"');
    expect(plan.ok).toBe(true);
    expect(plan.steps[0]?.rpc).toBe('close_case');
    expect(plan.steps[0]?.summary).toContain('cannot be unsent');
  });

  it('plans a quiet outcome and says nothing will be announced', () => {
    const plan = planFor('case close abc123 no_action');
    expect(plan.ok).toBe(true);
    expect(plan.steps[0]?.summary).toContain('announce nothing');
  });

  it('refuses an announced outcome with no reason', () => {
    const plan = planFor('case close abc123 warned');
    expect(plan.ok).toBe(false);
    expect(plan.problems[0]).toContain('twelve characters');
  });

  it('refuses a close with no outcome', () => {
    const plan = planFor('case close abc123');
    expect(plan.ok).toBe(false);
    expect(plan.problems.some((p) => p.includes('outcome'))).toBe(true);
  });
});

describe('planCommand — standing adjust', () => {
  it('plans the adjustment at the rule default when no points are given', () => {
    const plan = planFor('standing adjust abc123 warning.official --reason "Second complaint"');
    expect(plan.ok).toBe(true);
    expect(plan.steps[0]?.args['p_points']).toBeNull();
    expect(plan.steps[0]?.summary).toContain('rule default');
  });

  it('carries an explicit number when one is given', () => {
    const plan = planFor('standing adjust abc123 warning.minor --points -3 --reason "Minor"');
    expect(plan.steps[0]?.args['p_points']).toBe(-3);
  });

  it('admits the rule default lives in the database', () => {
    const plan = planFor('standing adjust abc123 warning.official --reason "Second complaint"');
    expect(plan.unknowns.join(' ')).toContain('standing_rules');
  });
});

describe('planCommand — approvals', () => {
  it('plans a decision and says the applicant is told in both languages', () => {
    const plan = planFor('approvals abc123 approve --reason "Documents verified in full"');
    expect(plan.ok).toBe(true);
    expect(plan.steps[0]?.summary).toContain('both languages');
  });

  it('refuses an action that is neither approve nor refuse', () => {
    const plan = planFor('approvals abc123 maybe --reason "Documents verified in full"');
    expect(plan.ok).toBe(false);
    expect(plan.problems[0]).toContain('approve or refuse');
  });

  it('refuses a thin reason', () => {
    const plan = planFor('approvals abc123 approve --reason "ok"');
    expect(plan.ok).toBe(false);
    expect(plan.problems[0]).toContain('twelve characters');
  });
});

describe('planCommand — a destructive verb with no builder', () => {
  it('says so rather than printing an empty preview a reader would take as "nothing changes"', () => {
    const plan = planFor('notices publish abc123');
    expect(plan.ok).toBe(false);
    expect(plan.problems[0]).toContain('no dry-run for it');
  });
});

describe('renderPlan', () => {
  it('says nothing was written, first', () => {
    const text = renderPlan(planFor('bulk plan shops approve --reason "Both trade licences verified"'));
    expect(text.split('\n')[0]).toContain('nothing has been written');
  });

  it('shows the audit action the call would write', () => {
    const text = renderPlan(planFor('bulk plan shops approve --reason "Both trade licences verified"'));
    expect(text).toContain('audit: bulk.plan');
  });

  it('lists the refusals and says nothing would be called', () => {
    const text = renderPlan(planFor('bulk plan wizards approve --reason "Both trade licences verified"'));
    expect(text).toContain('would be refused');
    expect(text).toContain('Nothing would be called');
  });

  it('separates what it cannot know from what it would do', () => {
    const text = renderPlan(planFor('bulk apply 7f3a-b2c4'));
    expect(text).toContain('cannot know');
    expect(text).toContain('Would call');
  });

  it('never claims a write happened', () => {
    for (const command of [
      'bulk plan shops approve --reason "Both trade licences verified"',
      'case close abc123 warned --reason "Warned about the thread"',
      'approvals abc123 refuse --reason "Documents did not match"',
    ]) {
      const text = renderPlan(planFor(command));
      expect(text).not.toMatch(/\b(created|updated|applied|closed successfully)\b/i);
    }
  });
});
