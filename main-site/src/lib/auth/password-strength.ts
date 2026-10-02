export type StrengthLevel = 0 | 1 | 2 | 3 | 4;

/** Deterministic, offline strength estimate — no third-party service. */
export function scorePassword(password: string): StrengthLevel {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score += 1;
  if (/^(.)\1+$/.test(password) || password.length < 8) score = Math.min(score, 1);
  return Math.min(score, 4) as StrengthLevel;
}
