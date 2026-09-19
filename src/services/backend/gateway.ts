/**
 * BSDC — src/services/backend/gateway.ts
 * Purpose : The single place that knows whether BSDC is talking to Firebase or to the device.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   :
 *   ADR-019 — the product must degrade, never break. If Firestore or the Realtime Database
 *   cannot be reached (no project, blocked network, preview without credentials, kiosk device)
 *   the application switches to device-local mode: reads come from the offline mirror, writes
 *   land in the outbox and are replayed when the backend returns. Nothing about that mode is
 *   simulated: the data a person creates is their own, it is durable on the device, and it is
 *   reconciled later. The banner tells the truth about which mode is active.
 *   `withRemote` is the only sanctioned way to touch the network: it enforces the timeout,
 *   records the failure reason and flips the mode, so no repository has to repeat that logic.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { AppError } from '@/core/errors/AppError';
import { err, ok, type Result } from '@/core/result/Result';

/** How the application is currently reading and writing data. */
export type BackendMode = 'remote' | 'local';

/** Connection lifecycle state. */
export type BackendStatus = 'idle' | 'connecting' | 'remote' | 'local';

/** Immutable snapshot of backend health. */
export interface BackendState {
  readonly status: BackendStatus;
  readonly mode: BackendMode;
  /** Redacted reason for the last failure, safe to show in the UI. */
  readonly reason: string | null;
  /** Error code of the last failure, when one exists. */
  readonly code: string | null;
  readonly since: string;
  /** Number of consecutive failed remote operations. */
  readonly failures: number;
}

const INITIAL: BackendState = {
  status: 'idle',
  mode: 'local',
  reason: null,
  code: null,
  since: new Date(0).toISOString(),
  failures: 0,
};

let state: BackendState = INITIAL;
const listeners = new Set<(next: BackendState) => void>();

/** How long a remote operation may run before the gateway gives up. */
export const REMOTE_TIMEOUT_MS = 7_000;

/**
 * Reads the current backend state.
 * @returns the immutable snapshot
 */
export function getBackendState(): BackendState {
  return state;
}

/**
 * Subscribes to backend state changes.
 * @param listener callback invoked on every change
 * @returns an unsubscribe function
 */
export function subscribeBackend(listener: (next: BackendState) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Publishes a new backend state.
 * @param patch fields to replace
 */
function publish(patch: Partial<BackendState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener(state);
}

/**
 * Marks the gateway as connecting to the remote backend.
 */
export function markConnecting(): void {
  publish({ status: 'connecting', reason: null, code: null, since: new Date().toISOString() });
}

/**
 * Marks the gateway as connected to the remote backend.
 */
export function markRemote(): void {
  publish({
    status: 'remote',
    mode: 'remote',
    reason: null,
    code: null,
    since: new Date().toISOString(),
    failures: 0,
  });
}

/**
 * Degrades the gateway to device-local mode and records why.
 * @param reason human-readable, redacted reason
 * @param code BSDC error code, when one applies
 */
export function markLocal(reason: string, code: string | null = 'BSDC-NET-005'): void {
  publish({
    status: 'local',
    mode: 'local',
    reason,
    code,
    since: new Date().toISOString(),
    failures: state.failures + 1,
  });
}

/**
 * Reports whether the gateway believes the remote backend is reachable.
 * @returns true when the last probe succeeded
 */
export function isRemote(): boolean {
  return state.mode === 'remote';
}

/**
 * Runs a remote operation with a timeout and degrades to local mode on failure.
 * @param operation the remote operation
 * @param label short description used in the failure reason
 * @returns Ok with the value, or Err with an AppError
 */
export async function withRemote<T>(
  operation: () => Promise<T>,
  label = 'backend operation',
): Promise<Result<T, AppError>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const value = await Promise.race([
      operation(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new AppError('BSDC-NET-002', { operation: label }));
        }, REMOTE_TIMEOUT_MS);
      }),
    ]);
    if (state.mode !== 'remote') markRemote();
    return ok(value);
  } catch (error) {
    const appError =
      error instanceof AppError ? error : new AppError('BSDC-NET-005', { operation: label }, error);
    markLocal(appError.message, appError.code);
    return err(appError);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Runs a remote operation and swallows the failure, returning the fallback.
 * @param operation the remote operation
 * @param fallback value returned when the remote call fails
 * @param label short description used in the failure reason
 * @returns the remote value or the fallback
 */
export async function withRemoteFallback<T>(
  operation: () => Promise<T>,
  fallback: T,
  label = 'backend operation',
): Promise<T> {
  const result = await withRemote(operation, label);
  return result.ok ? result.value : fallback;
}
