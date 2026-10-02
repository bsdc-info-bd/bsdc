import { describe, expect, it } from 'vitest';
import {
  matches,
  needsAttention,
  roster,
  sortRows,
  tenureLabel,
  tenureMonths,
  type StaffRow,
} from './model';

const row = (over: Partial<StaffRow> = {}): StaffRow => ({
  uid: 'u1',
  display_name: 'Ayesha Rahman',
  username: 'ayesha',
  role: 'moderator',
  staff_no: 'ENG-014',
  department: 'Engineering',
  designation: 'Reviewer',
  shift: 'general',
  card_code: 'BSDC-ID-4A7C21B9-6',
  joined_at: '2024-03-10',
  is_active: true,
  ...over,
});

describe('searching the directory', () => {
  it('matches whichever detail the searcher happens to remember', () => {
    const person = row();
    expect(matches(person, 'ayesha')).toBe(true);
    expect(matches(person, 'ENG-014')).toBe(true);
    expect(matches(person, 'engineering')).toBe(true);
    expect(matches(person, 'reviewer')).toBe(true);
    expect(matches(person, 'moderator')).toBe(true);
    expect(matches(person, 'rafi')).toBe(false);
  });

  it('requires every word, so a second word narrows the result', () => {
    const person = row();
    expect(matches(person, 'ayesha engineering')).toBe(true);
    expect(matches(person, 'ayesha support')).toBe(false);
  });

  it('treats an empty search as no filter at all', () => {
    expect(matches(row(), '   ')).toBe(true);
  });

  it('copes with a member who has no username', () => {
    expect(matches(row({ username: null }), 'ayesha')).toBe(true);
  });
});

describe('ordering the directory', () => {
  const rows = [
    row({
      uid: '1',
      staff_no: 'SUP-002',
      display_name: 'Zaman',
      role: 'moderator',
      department: 'Support',
      joined_at: '2025-01-01',
    }),
    row({
      uid: '2',
      staff_no: 'ENG-001',
      display_name: 'Ayesha',
      role: 'admin',
      department: 'Engineering',
      joined_at: '2023-01-01',
    }),
    row({
      uid: '3',
      staff_no: 'ENG-014',
      display_name: 'Rafi',
      role: 'manager',
      department: 'Engineering',
      joined_at: '2024-01-01',
    }),
  ];

  it('orders by staff number by default', () => {
    expect(sortRows(rows, 'staff_no').map((item) => item.staff_no)).toEqual([
      'ENG-001',
      'ENG-014',
      'SUP-002',
    ]);
  });

  it('orders by name', () => {
    expect(sortRows(rows, 'name').map((item) => item.display_name)).toEqual([
      'Ayesha',
      'Rafi',
      'Zaman',
    ]);
  });

  it('puts the highest role first, then names within a role', () => {
    expect(sortRows(rows, 'role').map((item) => item.role)).toEqual([
      'admin',
      'manager',
      'moderator',
    ]);
  });

  it('groups departments together and sorts names inside them', () => {
    expect(sortRows(rows, 'department').map((item) => item.display_name)).toEqual([
      'Ayesha',
      'Rafi',
      'Zaman',
    ]);
  });

  it('puts the longest serving first', () => {
    expect(sortRows(rows, 'joined').map((item) => item.display_name)).toEqual([
      'Ayesha',
      'Rafi',
      'Zaman',
    ]);
  });

  it('does not modify the list it was given', () => {
    const original = [...rows];
    sortRows(rows, 'name');
    expect(rows).toEqual(original);
  });
});

describe('the shift roster', () => {
  it('keeps the shifts in a fixed order and leaves empty ones out', () => {
    const rows = [
      row({ uid: '1', shift: 'night' }),
      row({ uid: '2', shift: 'general' }),
      row({ uid: '3', shift: 'night' }),
    ];
    const groups = roster(rows);
    expect(groups.map((group) => group.shift)).toEqual(['general', 'night']);
    expect(groups[1]?.people).toHaveLength(2);
  });

  it('leaves people who have left off the roster', () => {
    expect(roster([row({ is_active: false })])).toEqual([]);
  });
});

describe('length of service', () => {
  const now = new Date('2026-03-10T00:00:00Z');

  it('counts whole months only', () => {
    expect(tenureMonths(row({ joined_at: '2026-03-01' }), now)).toBe(0);
    expect(tenureMonths(row({ joined_at: '2026-02-01' }), now)).toBe(1);
    expect(tenureMonths(row({ joined_at: '2024-03-10' }), now)).toBe(24);
  });

  it('does not credit a month before its anniversary day', () => {
    expect(tenureMonths(row({ joined_at: '2026-02-20' }), now)).toBe(0);
  });

  it('never goes negative for a future start date', () => {
    expect(tenureMonths(row({ joined_at: '2026-09-01' }), now)).toBe(0);
  });

  it('ignores a date it cannot read', () => {
    expect(tenureMonths(row({ joined_at: 'not a date' }), now)).toBe(0);
  });

  it('reads service in the unit people use', () => {
    expect(tenureLabel(0)).toBe('this month');
    expect(tenureLabel(1)).toBe('1 month');
    expect(tenureLabel(11)).toBe('11 months');
    expect(tenureLabel(12)).toBe('1 year');
    expect(tenureLabel(25)).toBe('2 years 1 month');
  });
});

describe('records needing attention', () => {
  it('flags a missing card or a missing department, and nobody else', () => {
    const rows = [
      row({ uid: '1' }),
      row({ uid: '2', card_code: null }),
      row({ uid: '3', department: '  ' }),
      row({ uid: '4', card_code: null, is_active: false }),
    ];
    expect(needsAttention(rows).map((item) => item.uid)).toEqual(['2', '3']);
  });
});
