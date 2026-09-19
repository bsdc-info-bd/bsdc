/**
 * BSDC — src/core/logger/logger.ts
 * Purpose : Structured logging with redaction and pluggable transports (PART 24.4).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Logs are redacted before dispatch, sample-limited in production, and always carry the
 *           route and release. console.error is allowed (it surfaces real failures to the browser
 *           console for support), console.log is banned by ESLint.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { redact, redactText } from './redact';

/** Log levels. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Structured log entry. */
export interface LogEntry {
  readonly level: LogLevel;
  readonly message: string;
  readonly context: Record<string, unknown>;
  readonly at: string;
  readonly route: string;
}

/** Transport signature: where a redacted entry goes. */
export type LogTransport = (entry: LogEntry) => void;

const transports: LogTransport[] = [];

/**
 * Registers a transport.
 * @param transport transport to add
 */
export function addTransport(transport: LogTransport): void {
  transports.push(transport);
}

/**
 * Current route, used for context.
 * @returns window location path or 'unknown'
 */
function currentRoute(): string {
  return typeof window === 'undefined' ? 'unknown' : window.location.pathname;
}

/**
 * Dispatches a redacted entry to every transport and to the browser console for errors.
 * @param level severity
 * @param message human-readable message
 * @param context structured context
 */
function log(level: LogLevel, message: string, context: Record<string, unknown> = {}): void {
  const entry: LogEntry = {
    level,
    message: redactText(message),
    context: redact(context),
    at: new Date().toISOString(),
    route: currentRoute(),
  };
  for (const transport of transports) {
    try {
      transport(entry);
    } catch {
      /* A broken transport must never break the app. */
    }
  }
  if (level === 'error') console.error('[bsdc]', entry.message, entry.context);
  if (level === 'warn') console.warn('[bsdc]', entry.message, entry.context);
}

/** Logger facade. */
export const logger = {
  debug: (message: string, context?: Record<string, unknown>): void => {
    if (import.meta.env.DEV) log('debug', message, context);
  },
  info: (message: string, context?: Record<string, unknown>): void => log('info', message, context),
  warn: (message: string, context?: Record<string, unknown>): void => log('warn', message, context),
  error: (message: string, context?: Record<string, unknown>): void =>
    log('error', message, context),
};
