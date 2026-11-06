import { isStaffRole, roleRank } from '@kit';

/**
 * Who may change whose role, and how a refusal is worded.
 *
 * This mirrors `set_user_role()` and `set_account_status()` in Postgres, which
 * refuse the same four things: changing yourself, granting a rank at or above
 * your own, acting on somebody who already outranks you, and treating a member
 * who has never held a staff role as staff. The rules are duplicated on purpose —
 * the console disables the control so an operator is not offered an action that
 * will be refused, and the database refuses anyway, because a control that is
 * merely disabled is not a permission check.
 *
 * Nothing here decides anything. It decides what is *drawn*, and the split is the
 * reason a promise on this screen can be trusted: the browser can only ever make
 * an action unavailable, never make it allowed.
 */

/** A row of `admin_people(p_search, p_limit)`. */
export interface PersonRow {
  uid: string;
  username: string | null;
  display_name: string;
  role: string;
  status: string;
  created_at: string;
}

/** The roles a member can hold, highest first, exactly as `bsdc_role` declares them. */
export const ROLES = [
  'owner',
  'admin',
  'manager',
  'moderator',
  'vendor',
  'creator',
  'member',
] as const;

export type PersonRole = (typeof ROLES)[number];

/** The account standings `set_account_status()` accepts. */
export const STATUSES = ['active', 'suspended', 'deactivated'] as const;

export type PersonStatus = (typeof STATUSES)[number];

/** Why a control is unavailable, in the words of the person who cannot use it. */
export type Refusal =
  { readonly allowed: true } | { readonly allowed: false; readonly reason: string };

export const ALLOWED: Refusal = { allowed: true };

/**
 * The roles this actor may give this person.
 *
 * Empty when the answer is "none", and the caller draws a disabled control rather
 * than a list that leads to a 403. A role is assignable when it is strictly below
 * the actor's own rank and different from what the person holds — the second half
 * matters because `set_user_role` treats "change it to what it already is" as a
 * no-op, and offering a no-op is a trap.
 */
export function assignableRoles(
  actorRole: string,
  actorUid: string,
  person: PersonRow,
): PersonRole[] {
  if (!canActOn(actorRole, actorUid, person).allowed) return [];
  const ceiling = roleRank(actorRole);
  return ROLES.filter((role) => roleRank(role) < ceiling && role !== person.role);
}

/** Whether this actor may change this person's role at all. */
export function canActOn(actorRole: string, actorUid: string, person: PersonRow): Refusal {
  if (person.uid === actorUid || person.uid.trim() === '' || actorUid.trim() === '') {
    return { allowed: false, reason: 'You cannot change your own role or status.' };
  }
  const actorRank = roleRank(actorRole);
  const targetRank = roleRank(person.role);
  if (targetRank >= actorRank) {
    return {
      allowed: false,
      reason: `That member holds ${person.role}, which is not below your own ${actorRole}. Only somebody above them can act.`,
    };
  }
  if (actorRank <= 1) {
    return { allowed: false, reason: 'Your account does not hold a staff role.' };
  }
  return ALLOWED;
}

/**
 * Whether a status change is available.
 *
 * Suspending is a moderation act; the database asks for `people.suspend`, which
 * only a manager or above holds. The check here is on the rank because that is
 * what the console knows without a second request, and the permission is still
 * enforced server-side.
 */
export function canChangeStatus(actorRole: string, actorUid: string, person: PersonRow): Refusal {
  const base = canActOn(actorRole, actorUid, person);
  if (!base.allowed) return base;
  if (roleRank(actorRole) < roleRank('manager')) {
    return {
      allowed: false,
      reason: 'Suspending an account needs the manager role or higher.',
    };
  }
  return ALLOWED;
}

/**
 * What a role change does to the person's next sign-in.
 *
 * This is the part operators get wrong: `set_user_role` writes the row, and the
 * Firebase custom claim that every row level security policy reads is minted by
 * `/api/auth/claims` from that row. Until the member signs in again — or the
 * claims endpoint is called for them — their token still says the old role. A
 * console that silently leaves somebody half-promoted is worse than one that says
 * so, so it says so.
 */
export function afterRoleChange(person: PersonRow, role: PersonRole): string {
  return `${person.display_name} is now ${role} in the database. Their token still carries ${person.role} until they sign in again — or until an owner calls the claims endpoint for them — so anything they do before then is checked against ${person.role}.`;
}

/** Why an account is being suspended, checked before the write is attempted. */
export function statusProblems(status: PersonStatus, reason: string): readonly string[] {
  if (status === 'active') return [];
  return reason.trim().length < 8
    ? [
        'Say why. The member sees this reason, and an unexplained suspension is one nobody can appeal.',
      ]
    : [];
}

/** A search that matches a handle or a name, trimmed and bounded. */
export function searchTerm(raw: string): string {
  return raw.trim().slice(0, 60);
}

/**
 * People matching a search, ranked so an exact handle comes first.
 *
 * `admin_people` already filters in SQL; this decides the order of what came
 * back, because an operator who has typed `@ada` and pressed enter expects Ada
 * first, not the four other people whose display names contain "ada".
 */
export function rankPeople(rows: readonly PersonRow[], search: string): PersonRow[] {
  const needle = search.trim().toLowerCase().replace(/^@/, '');
  if (needle === '') return [...rows];
  const score = (person: PersonRow): number => {
    const handle = (person.username ?? '').toLowerCase();
    const name = person.display_name.toLowerCase();
    if (handle === needle) return 0;
    if (handle.startsWith(needle)) return 1;
    if (name.startsWith(needle)) return 2;
    if (handle.includes(needle)) return 3;
    return name.includes(needle) ? 4 : 5;
  };
  return [...rows].sort((left, right) => {
    const difference = score(left) - score(right);
    if (difference !== 0) return difference;
    // Stable and predictable between renders: newest account first.
    return Date.parse(right.created_at) - Date.parse(left.created_at);
  });
}

/** Whether a row is a staff member the directory can be filtered to. */
export function isStaff(row: PersonRow): boolean {
  return isStaffRole(row.role);
}
