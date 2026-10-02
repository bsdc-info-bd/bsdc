import { describe, expect, it } from 'vitest';
import {
  assignableRoles,
  canChangeRole,
  canClaim,
  canResolve,
  canToggle,
  cascadeOff,
  groupByModule,
  hasAnyPermission,
  hasPermission,
  isPluginActive,
  isPluginVisibleTo,
  missingDependencies,
  outranks,
  roleRank,
  rolloutBucket,
  sortQueue,
  type Person,
  type Plugin,
  type QueuedReport,
} from '@/lib/admin/admin-types';

function plugin(patch: Partial<Plugin> = {}): Plugin {
  return {
    key: 'market.shop',
    label: 'Marketplace',
    description: '',
    module: 'market',
    enabled: true,
    audience: 'all',
    isCore: false,
    dependsOn: [],
    rolloutPercent: 100,
    blockedBy: [],
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...patch,
  };
}

const GRAPH: Plugin[] = [
  plugin({ key: 'core.auth', module: 'core', isCore: true }),
  plugin({ key: 'market.shop', dependsOn: ['core.auth'] }),
  plugin({ key: 'market.vendor', dependsOn: ['market.shop'] }),
  plugin({ key: 'market.payouts', dependsOn: ['market.vendor'] }),
  plugin({ key: 'ads.serving', module: 'ads', dependsOn: [] }),
];

function report(patch: Partial<QueuedReport> = {}): QueuedReport {
  return {
    id: 'r1',
    subjectType: 'post',
    subjectId: 'p1',
    reason: 'spam',
    details: '',
    status: 'open',
    reporterUid: 'u9',
    assignedTo: null,
    resolution: '',
    reportCount: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...patch,
  };
}

function person(patch: Partial<Person> = {}): Person {
  return {
    uid: 'u1',
    username: 'rafi',
    displayName: 'Rafi',
    role: 'member',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...patch,
  };
}

describe('roles', () => {
  it('ranks roles the way the database does', () => {
    expect(roleRank('member')).toBeLessThan(roleRank('moderator'));
    expect(roleRank('moderator')).toBeLessThan(roleRank('admin'));
    expect(roleRank('admin')).toBeLessThan(roleRank('owner'));
  });

  it('never lets anyone grant their own rank or above', () => {
    expect(assignableRoles('admin', 'member')).not.toContain('admin');
    expect(assignableRoles('admin', 'member')).not.toContain('owner');
    expect(assignableRoles('admin', 'member')).toContain('moderator');
  });

  it('refuses to act on somebody who already outranks you', () => {
    expect(assignableRoles('moderator', 'admin')).toEqual([]);
    expect(assignableRoles('admin', 'owner')).toEqual([]);
    expect(outranks('manager', 'admin')).toBe(false);
  });

  it('refuses a self change outright', () => {
    expect(canChangeRole('owner', 'u1', person({ uid: 'u1' }))).toBe(false);
    expect(canChangeRole('owner', 'u2', person({ uid: 'u1' }))).toBe(true);
  });

  it('offers nothing when the actor is an ordinary member', () => {
    expect(assignableRoles('member', 'member')).toEqual([]);
  });
});

describe('permissions', () => {
  const granted = ['moderation.read', 'moderation.resolve'];

  it('answers a single permission', () => {
    expect(hasPermission(granted, 'moderation.read')).toBe(true);
    expect(hasPermission(granted, 'plugins.write')).toBe(false);
  });

  it('answers any of several', () => {
    expect(hasAnyPermission(granted, ['plugins.read', 'moderation.read'])).toBe(true);
    expect(hasAnyPermission(granted, ['plugins.read', 'people.read'])).toBe(false);
  });

  it('requires content.hide before hiding anything', () => {
    expect(canResolve(granted, 'dismiss')).toBe(true);
    expect(canResolve(granted, 'hide_content')).toBe(false);
    expect(canResolve([...granted, 'content.hide'], 'hide_content')).toBe(true);
  });

  it('requires moderation.resolve for every outcome', () => {
    expect(canResolve(['content.hide'], 'hide_content')).toBe(false);
  });
});

describe('plugin graph', () => {
  it('reports a plugin as active only when nothing blocks it', () => {
    expect(isPluginActive(plugin())).toBe(true);
    expect(isPluginActive(plugin({ enabled: false }))).toBe(false);
    expect(isPluginActive(plugin({ blockedBy: ['core.auth'] }))).toBe(false);
    expect(isPluginActive(plugin({ rolloutPercent: 0 }))).toBe(false);
  });

  it('follows the graph when something is switched off', () => {
    expect(cascadeOff(GRAPH, 'market.shop')).toEqual(['market.payouts', 'market.vendor']);
    expect(cascadeOff(GRAPH, 'core.auth')).toEqual([
      'market.payouts',
      'market.shop',
      'market.vendor',
    ]);
  });

  it('takes nothing with an independent plugin', () => {
    expect(cascadeOff(GRAPH, 'ads.serving')).toEqual([]);
  });

  it('lists the dependencies that must come on first', () => {
    const off = GRAPH.map((item) =>
      item.key === 'market.shop' ? { ...item, enabled: false } : item,
    );
    expect(missingDependencies(off, 'market.vendor')).toEqual(['market.shop']);
    expect(missingDependencies(GRAPH, 'market.vendor')).toEqual([]);
  });

  it('refuses to switch a core plugin off, ever', () => {
    const core = plugin({ isCore: true });
    expect(canToggle(core, false)).toBe(false);
    expect(canToggle(core, true)).toBe(true);
  });

  it('refuses to switch on something that is blocked', () => {
    expect(canToggle(plugin({ enabled: false, blockedBy: ['core.auth'] }), true)).toBe(false);
  });

  it('groups the registry by module in a stable order', () => {
    const groups = groupByModule(GRAPH);
    expect(groups.map(([module]) => module)).toEqual(['ads', 'core', 'market']);
    expect(groups[2]?.[1]).toHaveLength(3);
  });
});

describe('rollout', () => {
  it('puts the same member in the same bucket every time', () => {
    const first = rolloutBucket('uid-123', 'market.shop');
    expect(rolloutBucket('uid-123', 'market.shop')).toBe(first);
  });

  it('keeps buckets inside 0 to 99', () => {
    for (const uid of ['a', 'b', 'uid-123', 'uid-999', 'রাফি']) {
      const bucket = rolloutBucket(uid, 'market.shop');
      expect(bucket).toBeGreaterThanOrEqual(0);
      expect(bucket).toBeLessThan(100);
    }
  });

  it('separates members across plugins rather than reusing one bucket', () => {
    expect(rolloutBucket('uid-123', 'market.shop')).not.toBe(
      rolloutBucket('uid-123', 'ads.serving'),
    );
  });

  it('shows a full rollout to everyone and a zero rollout to nobody', () => {
    const viewer = { uid: 'uid-123', staff: false, vendor: false };
    expect(isPluginVisibleTo(plugin(), viewer)).toBe(true);
    expect(isPluginVisibleTo(plugin({ rolloutPercent: 0 }), viewer)).toBe(false);
  });

  it('keeps staff-only plugins away from members', () => {
    expect(
      isPluginVisibleTo(plugin({ audience: 'staff' }), { uid: 'u', staff: false, vendor: false }),
    ).toBe(false);
    expect(
      isPluginVisibleTo(plugin({ audience: 'staff' }), { uid: 'u', staff: true, vendor: false }),
    ).toBe(true);
  });

  it('shows vendor plugins to vendors and to staff', () => {
    expect(
      isPluginVisibleTo(plugin({ audience: 'vendor' }), { uid: 'u', staff: false, vendor: true }),
    ).toBe(true);
    expect(
      isPluginVisibleTo(plugin({ audience: 'vendor' }), { uid: 'u', staff: false, vendor: false }),
    ).toBe(false);
  });
});

describe('moderation queue', () => {
  it('lets the holder of a claim act, and nobody else', () => {
    expect(canClaim(report(), 'm1')).toBe(true);
    expect(canClaim(report({ assignedTo: 'm1' }), 'm1')).toBe(true);
    expect(canClaim(report({ assignedTo: 'm2' }), 'm1')).toBe(false);
  });

  it("treats a closed report as nobody's to claim", () => {
    expect(canClaim(report({ status: 'dismissed' }), 'm1')).toBe(false);
  });

  it('puts open reports first, then the most reported, then the oldest', () => {
    const sorted = sortQueue([
      report({ id: 'a', status: 'dismissed', reportCount: 9 }),
      report({ id: 'b', reportCount: 2, createdAt: '2026-02-01T00:00:00.000Z' }),
      report({ id: 'c', reportCount: 7, createdAt: '2026-03-01T00:00:00.000Z' }),
      report({ id: 'd', reportCount: 2, createdAt: '2026-01-01T00:00:00.000Z' }),
    ]);
    expect(sorted.map((item) => item.id)).toEqual(['c', 'd', 'b', 'a']);
  });
});
