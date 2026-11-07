import { describe, expect, it } from 'vitest';
import {
  dayOf,
  describeAction,
  describeMetadata,
  formatCount,
  groupByDay,
  outstandingWork,
  overviewTiles,
  triageTone,
  type AuditRow,
  type Overview,
} from './overview';

const overview: Overview = {
  members_total: 12480,
  members_today: 0,
  posts_total: 3021,
  posts_today: 7,
  open_reports: 0,
  shops_pending: 4,
  campaigns_pending: 0,
  plugins_enabled: 12,
  plugins_total: 18,
};

const audit = (created_at: string, action = 'people.role', subject = 'uid-1'): AuditRow => ({
  actor_uid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  action,
  subject,
  metadata: null,
  created_at,
});

describe('what needs a person', () => {
  it('counts the three queues that grow while nobody looks', () => {
    expect(outstandingWork(overview)).toBe(4);
    expect(outstandingWork({ ...overview, open_reports: 3, campaigns_pending: 2 })).toBe(9);
  });

  it('colours each queue by how bad its own count is', () => {
    expect(triageTone(0, 10, 40)).toBe('ok');
    expect(triageTone(10, 10, 40)).toBe('warn');
    expect(triageTone(40, 10, 40)).toBe('bad');
  });

  it('says what an empty number means instead of leaving a zero alone', () => {
    const tiles = overviewTiles(overview);
    const reports = tiles.find((tile) => tile.key === 'reports');
    expect(reports?.note).toContain('clear');
    const members = tiles.find((tile) => tile.key === 'members');
    expect(members?.value).toBe('12,480');
    expect(members?.note).toContain('Nobody joined today');
    const shops = tiles.find((tile) => tile.key === 'shops');
    expect(shops?.note).toContain('Approvals');
  });

  it('notices a plugin registry that has never been seeded', () => {
    const tiles = overviewTiles({ ...overview, plugins_enabled: 0, plugins_total: 0 });
    expect(tiles.find((tile) => tile.key === 'plugins')?.note).toContain('not been seeded');
  });

  it('renders a count that cannot be trusted as zero rather than as nonsense', () => {
    expect(formatCount(Number.NaN)).toBe('0');
    expect(formatCount(-5)).toBe('0');
    expect(formatCount(1234.9)).toBe('1,234');
  });
});

describe('an audit action', () => {
  it('is described in words an operator can read', () => {
    expect(describeAction('people.role')).toBe("Changed somebody's role");
    expect(describeAction('shop.approve')).toBe('Approved a shop');
    expect(describeAction('staff.provisioned')).toContain('first profile row');
  });

  it('shows an action it has never seen rather than hiding it', () => {
    expect(describeAction('experiment.enrol')).toBe('Experiment enrol');
    expect(describeAction('oddaction')).toBe('Oddaction');
  });

  it('flattens metadata into one line and stops at four facts', () => {
    expect(describeMetadata(null)).toBe('');
    expect(describeMetadata({ from: 'member', to: 'moderator' })).toBe(
      'from: member · to: moderator',
    );
    expect(describeMetadata({ a: 1, b: 2, c: 3, d: 4, e: 5, f: '' })).toBe(
      'a: 1 · b: 2 · c: 3 · d: 4',
    );
    expect(describeMetadata({ nested: { x: 1 } })).toContain('{"x":1}');
  });
});

describe('the day a change happened', () => {
  it('is the community day, not the browser day', () => {
    // 20:30 UTC is the next morning in Dhaka, and a change made then belongs to
    // the day the community was awake for.
    expect(dayOf('2026-11-06T20:30:00.000Z')).toBe('2026-11-07');
    expect(dayOf('2026-11-06T06:00:00.000Z')).toBe('2026-11-06');
  });

  it('groups newest day first and keeps the rows inside a day in order', () => {
    const groups = groupByDay([
      audit('2026-11-06T05:00:00.000Z'),
      audit('2026-11-07T05:00:00.000Z', 'shop.approve'),
      audit('2026-11-05T05:00:00.000Z'),
    ]);
    expect(groups.map((group) => group.day)).toEqual(['2026-11-07', '2026-11-06', '2026-11-05']);
    expect(groups[0]?.rows[0]?.action).toBe('shop.approve');
  });

  it('puts an unreadable date in its own bucket instead of dropping the row', () => {
    const groups = groupByDay([audit('not a timestamp')]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.day).toBe('unknown');
    expect(groups[0]?.rows).toHaveLength(1);
  });
});
