/**
 * BSDC — src/core/logger/redact.ts
 * Purpose : Redaction of secrets and personal data before anything is logged (PART 06.01).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Defence in depth: even if a developer logs a whole object, these keys are rewritten
 *           before the payload reaches a transport. Never log a passkey, a token or a phone number.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */

/** Keys whose values must never appear in a log. */
const SECRET_KEYS = new Set([
  'password',
  'passkey',
  'accessKey',
  'apiKey',
  'apiSecret',
  'token',
  'idToken',
  'refreshToken',
  'privateKey',
  'secret',
  'authorization',
  'cookie',
  'bKashNumber',
  'phone',
  'phoneNumber',
  'nidNumber',
  'transactionId',
]);

/** Patterns that look like secrets inside free text. */
const SECRET_PATTERNS: readonly (readonly [RegExp, string])[] = [
  [/AIza[0-9A-Za-z_-]{30,}/g, '[redacted-firebase-key]'],
  [/BSDC-ADS-[A-Z0-9-]{16,}/g, '[redacted-access-key]'],
  [/\b\d{4}\s?\d{4}\s?\d{4}\b/g, '[redacted-card]'],
];

/**
 * Redacts a structured payload.
 * @param payload object to sanitise
 * @returns a copy with secret values replaced
 */
export function redact<T>(payload: T): T {
  if (payload === null || typeof payload !== 'object') return payload;
  if (Array.isArray(payload)) return (payload as unknown[]).map((item) => redact(item)) as T;
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    if (SECRET_KEYS.has(key)) {
      output[key] = '[redacted]';
      continue;
    }
    output[key] = typeof value === 'object' && value !== null ? redact(value) : value;
  }
  return output as T;
}

/**
 * Redacts secret-looking substrings in free text.
 * @param text message text
 * @returns sanitised text
 */
export function redactText(text: string): string {
  let output = text;
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    output = output.replace(pattern, replacement);
  }
  return output;
}
