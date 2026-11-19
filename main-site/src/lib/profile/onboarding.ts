/**
 * The two questions the router asks about a profile, in a module with no
 * dependencies.
 *
 * They live here rather than beside the profile schema because the schema
 * pulls in a validation library, and `RequireGuest` — which sits in the router
 * and therefore on the path of the first paint — only ever needed these two
 * booleans. Importing them from the schema file put ~40 kB of validation code
 * on the critical path of every page to answer a question about two fields.
 *
 * `hasClaimedHandle` takes the shape it reads, not `Profile`, so the trust
 * boundary stays where it was: this never parses a row, it inspects one.
 */
export function hasClaimedHandle(profile: { username: string }): boolean {
  return profile.username.trim().length > 0;
}

/**
 * True when a member has already completed setup (either explicitly via
 * `onboardingComplete` — including staff/imported accounts — or by holding a
 * claimed username handle). Prevents existing OAuth accounts from being sent
 * back into onboarding due to partial legacy rows.
 */
export function isProfileOnboarded(
  profile: { onboardingComplete?: boolean; username?: string } | null | undefined,
): boolean {
  if (!profile) return false;
  return Boolean(
    profile.onboardingComplete || hasClaimedHandle({ username: profile.username ?? '' }),
  );
}
