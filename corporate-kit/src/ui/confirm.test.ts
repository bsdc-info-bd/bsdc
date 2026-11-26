import { describe, expect, it } from 'vitest';
import { diffRows } from './ConfirmDialog';

describe('diffRows', () => {
  it('shows only what actually changes', () => {
    const rows = diffRows(
      { role: 'member', status: 'active' },
      { role: 'moderator', status: 'active' },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ field: 'role', before: 'member', after: 'moderator' });
  });

  it('renders a missing value as a dash rather than the word undefined', () => {
    // This is the difference between a diff an operator trusts and one that
    // looks like a bug.
    const rows = diffRows({ ban_until: null }, { ban_until: '2026-12-01' });
    expect(rows[0]).toEqual({ field: 'ban_until', before: '—', after: '2026-12-01' });
  });

  it('catches a field that is only present on one side', () => {
    const rows = diffRows({ note: 'none' }, { note: 'none', standing: '-40' });
    expect(rows).toEqual([{ field: 'standing', before: '—', after: '-40' }]);
  });

  it('uses human labels where the caller supplies them', () => {
    const rows = diffRows(
      { ban_until: null },
      { ban_until: '2026-12-01' },
      { ban_until: 'Suspended until' },
    );
    expect(rows[0]?.field).toBe('Suspended until');
  });

  it('returns nothing when nothing changed, so no empty table is drawn', () => {
    expect(diffRows({ a: '1' }, { a: '1' })).toEqual([]);
  });

  it('treats an absent key and an explicit dash as different', () => {
    // A caller that passes "—" as a real value should see it, not have it
    // silently merged with a missing one.
    const rows = diffRows({ label: '—' }, { label: undefined });
    expect(rows).toHaveLength(0);
  });
});
