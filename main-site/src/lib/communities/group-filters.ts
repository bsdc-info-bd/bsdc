import { joinAction, type GroupSummary } from './community-types';

/** Joined: groups the reader belongs to. Open: groups the reader can still join or ask to join. */
export type GroupScope = 'all' | 'joined' | 'open';

/** Local filtering is instant. Name and description match; an empty query matches everything. */
export function filterGroups(
  groups: readonly GroupSummary[],
  query: string,
  scope: GroupScope,
  signedIn: boolean,
): GroupSummary[] {
  const needle = query.trim().toLowerCase();
  return groups.filter((group) => {
    if (scope === 'joined' && group.myRole === null) return false;
    if (scope === 'open') {
      const action = joinAction(group, signedIn);
      if (action !== 'join' && action !== 'request') return false;
    }
    if (needle.length === 0) return true;
    return `${group.name} ${group.description}`.toLowerCase().includes(needle);
  });
}
