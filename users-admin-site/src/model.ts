import { isStaffRole, isValidCardCode, roleRank } from '@kit';

/** A row from `staff_directory()`. */
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

export const SHIFTS = ['general', 'morning', 'evening', 'night'] as const;
export type Shift = (typeof SHIFTS)[number];

export type StaffDraft = {
  readonly uid: string;
  readonly staffNo: string;
  readonly department: string;
  readonly designation: string;
  readonly workEmail: string;
  readonly phone: string;
  readonly shift: Shift;
  readonly cvUrl: string;
};

export const EMPTY_DRAFT: StaffDraft = {
  uid: '',
  staffNo: '',
  department: '',
  designation: '',
  workEmail: '',
  phone: '',
  shift: 'general',
  cvUrl: '',
};

const STAFF_NO = /^[A-Z]{2,4}-\d{3,5}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Everything wrong with a draft, in the order the form shows the fields.
 * The database enforces the same rules; checking here only saves a trip.
 */
export function draftProblems(draft: StaffDraft): readonly string[] {
  const problems: string[] = [];
  if (draft.uid.trim() === '') problems.push('Choose the member this record belongs to.');
  if (!STAFF_NO.test(draft.staffNo.trim().toUpperCase())) {
    problems.push('A staff number looks like ENG-014: letters, a hyphen, then digits.');
  }
  if (draft.workEmail !== '' && !EMAIL.test(draft.workEmail.trim())) {
    problems.push('The work email address is not valid.');
  }
  if (draft.cvUrl !== '' && !/^https:\/\//.test(draft.cvUrl.trim())) {
    problems.push('A document link must start with https://.');
  }
  return problems;
}

/** The arguments `upsert_staff_record()` expects, already tidied. */
export function draftToArgs(draft: StaffDraft): Record<string, unknown> {
  return {
    p_uid: draft.uid.trim(),
    p_staff_no: draft.staffNo.trim().toUpperCase(),
    p_department: draft.department.trim(),
    p_designation: draft.designation.trim(),
    p_work_email: draft.workEmail.trim(),
    p_phone: draft.phone.trim(),
    p_shift: draft.shift,
    p_cv_url: draft.cvUrl.trim(),
  };
}

export function rowToDraft(row: StaffRow): StaffDraft {
  const shift = (SHIFTS as readonly string[]).includes(row.shift)
    ? (row.shift as Shift)
    : 'general';
  return {
    ...EMPTY_DRAFT,
    uid: row.uid,
    staffNo: row.staff_no,
    department: row.department,
    designation: row.designation,
    shift,
  };
}

/**
 * Whether this actor may edit this record. The database refuses the same
 * cases; the console hides the button so nobody learns the rule by being
 * told off.
 */
export function mayEdit(actorRole: string, row: StaffRow): boolean {
  return isStaffRole(row.role) && roleRank(actorRole) > roleRank(row.role);
}

export type CardState = 'none' | 'valid' | 'corrupt';

/** What the directory should say about a record's card. */
export function cardState(row: StaffRow): CardState {
  if (row.card_code === null || row.card_code === '') return 'none';
  return isValidCardCode(row.card_code) ? 'valid' : 'corrupt';
}

/** Headcount per department, largest first, for the summary strip. */
export function headcount(rows: readonly StaffRow[]): ReadonlyArray<{
  readonly department: string;
  readonly count: number;
}> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.is_active) continue;
    const key = row.department.trim() === '' ? 'Unassigned' : row.department.trim();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([department, count]) => ({ department, count }))
    .sort((a, b) => b.count - a.count || a.department.localeCompare(b.department));
}
