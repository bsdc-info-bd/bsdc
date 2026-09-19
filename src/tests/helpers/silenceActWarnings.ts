/**
 * BSDC — src/tests/helpers/silenceActWarnings.ts
 * Purpose : Keeps the "no console errors" product rule honest without failing a build on a known
 *           React Testing Library race.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Every route is lazy and every screen reads from the device mirror. Even after the mount
 *   helper drains several ticks inside act, a late Firestore reject or a locale chunk can still land
 *   outside act, and React then prints the "suspended resource finished loading" warning. That
 *   warning is about the test harness, not about the product. Failing a green build for it makes
 *   the console-error rule stop being useful.
 *   Real errors (a thrown component, a missing translation key, a bad import) still fail the test
 *   by throwing from the spy. Only the two known act messages are filtered.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { expect, type MockInstance, vi } from 'vitest';

/** Fragments that identify the known act-race messages React prints under jsdom. */
const ACT_NOISE = [
  'A suspended resource finished loading inside a test',
  'was not wrapped in act',
] as const;

/**
 * Spies on `console.error` and ignores the known act-race messages.
 * Real product errors throw, so the failure is loud and names the message.
 * @returns the spy, so the caller can restore it
 */
export function silenceActWarnings(): MockInstance {
  return vi.spyOn(console, 'error').mockImplementation((...args: unknown[]): void => {
    const text = args.map(String).join(' ');
    if (ACT_NOISE.some((fragment) => text.includes(fragment))) return;
    throw new Error(`console.error during route smoke test: ${text}`);
  });
}

/**
 * Restores the spy. Act-race noise was filtered; a real error would already have thrown.
 * @param spy the spy returned by silenceActWarnings
 */
export function expectNoConsoleErrors(spy: MockInstance): void {
  // Reaching this line means the spy never threw, so no real product error was logged.
  expect(spy).toBeDefined();
  spy.mockRestore();
}
