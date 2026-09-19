/**
 * BSDC — src/core/flags/flagClient.ts
 * Purpose : Feature-flag state with local override, scheduling and change events (PART 04 LAW-11).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Build-time defaults come from src/core/config/features.ts. The runtime copy lives in
 *           Firestore and is merged in RESPONSE 4; scheduled windows are evaluated here so a flag
 *           can switch itself on or off at the right minute without a redeploy (ADR-016).
 *           Toggling a protected flag requires the plugin passkey at the call site — this module
 *           records who asked and refuses nothing it should not.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { FLAG_REGISTRY, isFlagOnByDefault, type FlagDefinition } from '../config/features';
import { emit } from '../events/bus';

/** A scheduled on/off window in ISO strings. */
export interface FlagSchedule {
  readonly enabledAt?: string | undefined;
  readonly disabledAt?: string | undefined;
  readonly timezone?: string | undefined;
}

/** Runtime state of one flag. */
export interface FlagState {
  readonly key: string;
  readonly enabled: boolean;
  readonly schedule: FlagSchedule | null;
  readonly updatedAt: string;
}

/**
 * Persistence adapter. Core never touches browser storage directly: the app layer injects a
 * storage-backed adapter, which keeps the layering rule intact (ADR-003) and makes flags testable.
 */
export interface FlagPersistence {
  readonly read: () => readonly FlagState[];
  readonly write: (states: readonly FlagState[]) => void;
}

let persistence: FlagPersistence | null = null;

/** In-memory overlay applied on top of registry defaults. */
const overrides = new Map<string, FlagState>();

/**
 * Installs the persistence adapter and loads any previously saved overlay.
 * @param adapter storage-backed adapter supplied by the app layer
 */
export function setFlagPersistence(adapter: FlagPersistence): void {
  persistence = adapter;
  for (const state of adapter.read()) overrides.set(state.key, state);
}

/**
 * Persists the overlay through the installed adapter.
 */
function persist(): void {
  persistence?.write(Array.from(overrides.values()));
}

/**
 * Resolves the default state of a flag from the registry.
 * @param key flag key
 * @returns registry definition or undefined
 */
export function flagDefinition(key: string): FlagDefinition | undefined {
  return FLAG_REGISTRY.find((flag) => flag.key === key);
}

/**
 * Evaluates whether a schedule makes the flag active right now.
 * @param schedule scheduled window
 * @param now evaluation instant
 * @returns null when the schedule says nothing, otherwise the forced state
 */
export function evaluateSchedule(
  schedule: FlagSchedule | null,
  now: Date = new Date(),
): boolean | null {
  if (!schedule) return null;
  const enabledAt = schedule.enabledAt ? Date.parse(schedule.enabledAt) : null;
  const disabledAt = schedule.disabledAt ? Date.parse(schedule.disabledAt) : null;
  if (enabledAt !== null && Number.isFinite(enabledAt) && now.getTime() < enabledAt) return false;
  if (disabledAt !== null && Number.isFinite(disabledAt) && now.getTime() >= disabledAt)
    return false;
  if (enabledAt !== null && Number.isFinite(enabledAt) && now.getTime() >= enabledAt) return true;
  return null;
}

/**
 * Reads the effective state of a flag.
 * @param key flag key
 * @param now evaluation instant (injectable for tests)
 * @returns true when the feature is enabled
 */
export function isEnabled(key: string, now: Date = new Date()): boolean {
  const override = overrides.get(key);
  if (override) {
    const scheduled = evaluateSchedule(override.schedule, now);
    if (scheduled !== null) return scheduled;
    return override.enabled;
  }
  return isFlagOnByDefault(key);
}

/**
 * Sets a flag state (used by the admin panel and by the dev-only design-system lab).
 * @param key flag key
 * @param enabled desired state
 * @param schedule optional scheduled window
 * @param actor identity of the person toggling (for the audit trail)
 */
export function setFlag(
  key: string,
  enabled: boolean,
  schedule: FlagSchedule | null = null,
  actor = 'system',
): void {
  const state: FlagState = {
    key,
    enabled,
    schedule,
    updatedAt: new Date().toISOString(),
  };
  overrides.set(key, state);
  persist();
  emit('flag:changed', { key, enabled });
  if (actor !== 'system') {
    // The admin panel writes the immutable audit entry; this line exists so a client-side
    // toggle in the lab can be traced when localStorage is inspected during support.
    // eslint-disable-next-line no-console
    console.info(`[bsdc] flag ${key} set to ${enabled} by ${actor}`);
  }
}

/**
 * Returns every flag with its effective state, for the admin matrix and the lab.
 * @returns registry entries merged with runtime overrides
 */
export function listFlags(): readonly (FlagDefinition & { enabled: boolean })[] {
  return FLAG_REGISTRY.map((flag) => ({ ...flag, enabled: isEnabled(flag.key) }));
}

/**
 * Clears a local override, restoring the registry default.
 * @param key flag key
 */
export function resetFlag(key: string): void {
  overrides.delete(key);
  persist();
  emit('flag:changed', { key, enabled: isEnabled(key) });
}
