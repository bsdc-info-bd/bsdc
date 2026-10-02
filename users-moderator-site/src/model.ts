import { roleRank } from '@kit';

/** A row from `staff_directory()`, as this console reads it. */
export type StaffRow = {
  readonly uid: string;
  readonly display_name: string;
  readonly username: string | null;
  readonly role: string;
  readonly staff_no: string;
  readonly department: string;
  readonly designation: string;
  readonly shift: string;
  readonly card_code: string | null;
  readonly joined_at: string;
  readonly is_active: boolean;
};

export type SortKey = 'staff_no' | 'name' | 'role' | 'department' | 'joined';

/**
 * Search matches a name, a username, a staff number, a department or a
 * designation. People look somebody up by whatever they happen to remember,
 * so one box searches all of it.
 */
export function matches(row: StaffRow, term: string): boolean {
  const needle = term.trim().toLowerCase();
  if (needle === '') return true;
  const haystack = [
    row.display_name,
    row.username ?? '',
    row.staff_no,
    row.department,
    row.designation,
    row.role,
  ]
    .join(' ')
    .toLowerCase();
  return needle.split(/\s+/).every((word) => haystack.includes(word));
}

export function sortRows(rows: readonly StaffRow[], key: SortKey): readonly StaffRow[] {
  const sorted = [...rows];
  switch (key) {
    case 'name':
      sorted.sort((a, b) => a.display_name.localeCompare(b.display_name));
      break;
    case 'role':
      sorted.sort(
        (a, b) =>
          roleRank(b.role) - roleRank(a.role) || a.display_name.localeCompare(b.display_name),
      );
      break;
    case 'department':
      sorted.sort(
        (a, b) =>
          a.department.localeCompare(b.department) || a.display_name.localeCompare(b.display_name),
      );
      break;
    case 'joined':
      sorted.sort((a, b) => Date.parse(a.joined_at) - Date.parse(b.joined_at));
      break;
    default:
      sorted.sort((a, b) => a.staff_no.localeCompare(b.staff_no));
  }
  return sorted;
}

export const SHIFTS = ['general', 'morning', 'evening', 'night'] as const;

/** Who is on each shift, in a fixed order so the roster does not jump about. */
export function roster(rows: readonly StaffRow[]): ReadonlyArray<{
  readonly shift: string;
  readonly people: readonly StaffRow[];
}> {
  return SHIFTS.map((shift) => ({
    shift,
    people: rows.filter((row) => row.is_active && row.shift === shift),
  })).filter((group) => group.people.length > 0);
}

/** Length of service in whole months, for the directory card. */
export function tenureMonths(row: StaffRow, now = new Date()): number {
  const joined = new Date(row.joined_at);
  if (Number.isNaN(joined.getTime())) return 0;
  const months =
    (now.getUTCFullYear() - joined.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - joined.getUTCMonth());
  const beforeAnniversary = now.getUTCDate() < joined.getUTCDate();
  return Math.max(0, beforeAnniversary ? months - 1 : months);
}

export function tenureLabel(months: number): string {
  if (months < 1) return 'this month';
  if (months < 12) return `${months} month${months === 1 ? '' : 's'}`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest === 0
    ? `${years} year${years === 1 ? '' : 's'}`
    : `${years} year${years === 1 ? '' : 's'} ${rest} month${rest === 1 ? '' : 's'}`;
}

/** Records that need somebody's attention before they are usable. */
export function needsAttention(rows: readonly StaffRow[]): readonly StaffRow[] {
  return rows.filter(
    (row) =>
      row.is_active &&
      (row.card_code === null || row.card_code === '' || row.department.trim() === ''),
  );
}
