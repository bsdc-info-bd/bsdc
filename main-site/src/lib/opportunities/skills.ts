/**
 * The one canonical form of a skill. The database stores skills this way (see
 * migration 0103) and matches filters against it, so every writer and reader
 * on the client must agree: trimmed, lower-case, single spaces, no blanks.
 */
export function normaliseSkill(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Normalises a list of skills: canonical form, no blanks, no duplicates, sorted. */
export function normaliseSkills(raw: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const skill of raw) {
    const canonical = normaliseSkill(skill);
    if (canonical.length > 0) seen.add(canonical);
  }
  return [...seen].sort();
}
