import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

/**
 * Feedback for every action.
 *
 * The standing rule in this suite is that nothing happens silently: a button
 * that appears to do nothing is indistinguishable from a button that failed,
 * and an operator who is unsure whether a suspension went through will try it
 * again. So every write announces itself here.
 *
 * The design decisions worth knowing:
 *
 * - **A toast is an announcement, not a record.** It says what happened now; the
 *   audit row says what happened forever. Toasts are therefore allowed to
 *   disappear and are never used to carry information an operator must be able
 *   to retrieve later.
 * - **Errors do not auto-dismiss.** A success can vanish after four seconds
 *   because the operator caused it and knows what they did. A failure needs to
 *   be read, and a message that disappears before it is read turns into a
 *   support ticket.
 * - **At most one action toast at a time.** Three stacked "Saved" toasts are
 *   noise. A new one replaces the previous action toast; errors stack, because
 *   two different refusals are two different problems.
 * - **The region is polite, and errors are assertive.** A screen reader should
 *   hear "Saved" without being interrupted, and must be told about a refusal
 *   immediately.
 */

export type ToastTone = 'ok' | 'warn' | 'bad' | 'info';

export type Toast = {
  readonly id: number;
  readonly tone: ToastTone;
  readonly message: string;
  /** An optional second line: what to do about it, or which record changed. */
  readonly detail?: string | undefined;
  /** Milliseconds to live. Zero means it stays until dismissed. */
  readonly ttl: number;
};

export type ToastInput = {
  readonly message: string;
  readonly tone?: ToastTone;
  readonly detail?: string;
  readonly ttl?: number;
};

type ToastApi = {
  readonly toasts: readonly Toast[];
  /** Announces an action that succeeded. */
  readonly success: (message: string, detail?: string) => void;
  /** Announces a refusal or failure; stays until dismissed. */
  readonly error: (message: string, detail?: string) => void;
  /** Announces something worth noticing that is neither. */
  readonly note: (message: string, detail?: string) => void;
  readonly dismiss: (id: number) => void;
  readonly clear: () => void;
};

/** Default lifetimes. Errors are zero: they wait for the operator. */
export const TOAST_TTL: Readonly<Record<ToastTone, number>> = {
  ok: 4_000,
  info: 5_000,
  warn: 8_000,
  bad: 0,
};

/** Errors stack; successes and notes replace each other. */
export function shouldReplace(previous: Toast, incoming: ToastInput): boolean {
  const incomingTone = incoming.tone ?? 'ok';
  if (incomingTone === 'bad' || incomingTone === 'warn') return false;
  return previous.tone === 'ok' || previous.tone === 'info';
}

const ToastContext = createContext<ToastApi | null>(null);

/**
 * Reduces a toast list for a new arrival.
 *
 * Exported so the rule can be tested without a DOM: a suite that needs React
 * Testing Library to check "a second save replaces the first toast" is testing
 * the wrong thing.
 */
export function pushToast(current: readonly Toast[], input: ToastInput): readonly Toast[] {
  if (input.message.trim().length === 0) return current;
  const tone = input.tone ?? 'ok';
  const ttl = input.ttl ?? TOAST_TTL[tone];

  // A low-stakes toast replaces the most recent low-stakes one, in place: the
  // operator sees one "Saved" that updates, rather than a queue of them. It
  // keeps the original id so the caller's dismiss timer stays valid, and it
  // never evicts an error the operator has not read yet.
  const lastActionIndex = current.reduce(
    (found, toast, index) => (shouldReplace(toast, input) ? index : found),
    -1,
  );
  if (lastActionIndex >= 0) {
    const copy = current.slice();
    const previous = copy[lastActionIndex];
    if (previous !== undefined) {
      // The replaced toast inherits the id and the arrival order of the one it
      // replaced, which is what makes it "the same toast, updated".
      copy[lastActionIndex] = {
        id: previous.id,
        tone,
        message: input.message,
        detail: input.detail,
        ttl,
      };
    }
    return copy;
  }

  const next: Toast = {
    id: current.reduce((highest, toast) => Math.max(highest, toast.id), 0) + 1,
    tone,
    message: input.message,
    detail: input.detail,
    ttl,
  };
  // Cap the stack: beyond four, an operator is not reading them anyway.
  const trimmed = current.length >= 4 ? current.slice(1) : current;
  return [...trimmed, next];
}

export function ToastProvider({ children }: { readonly children: ReactNode }): ReactElement {
  const [toasts, setToasts] = useState<readonly Toast[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const announce = useCallback(
    (input: ToastInput) => {
      setToasts((current) => {
        const next = pushToast(current, input);
        const created = next.at(-1);
        if (created && created.ttl > 0 && !timers.current.has(created.id)) {
          timers.current.set(
            created.id,
            setTimeout(() => {
              timers.current.delete(created.id);
              setToasts((live) => live.filter((toast) => toast.id !== created.id));
            }, created.ttl),
          );
        }
        return next;
      });
    },
    [],
  );

  const api = useMemo<ToastApi>(
    () => ({
      toasts,
      dismiss,
      clear: () => setToasts([]),
      success: (message, detail) =>
        announce({ message, tone: 'ok', ...(detail === undefined ? {} : { detail }) }),
      note: (message, detail) =>
        announce({ message, tone: 'info', ...(detail === undefined ? {} : { detail }) }),
      error: (message, detail) =>
        announce({ message, tone: 'bad', ...(detail === undefined ? {} : { detail }) }),
    }),
    [toasts, dismiss, announce],
  );

  // Clear every pending timer on unmount, so a console that is torn down does
  // not keep firing setState on a dead tree.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  return <ToastContext.Provider value={api}>{children}</ToastContext.Provider>;
}

/** The toast API. Throws when used outside a provider, which is a bug not a state. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside a ToastProvider.');
  return api;
}

/**
 * A toast API for a caller that may be outside a provider.
 *
 * Tests and small embedded widgets mount without the shell; they get a no-op
 * rather than an exception. Interactive screens use `useToast`.
 */
export function useOptionalToast(): ToastApi {
  const api = useContext(ToastContext);
  return (
    api ?? {
      toasts: [],
      dismiss: () => {},
      clear: () => {},
      success: () => {},
      note: () => {},
      error: () => {},
    }
  );
}

const TONE_CLASS: Readonly<Record<ToastTone, string>> = {
  ok: 'kit-toast--ok',
  warn: 'kit-toast--warn',
  bad: 'kit-toast--bad',
  info: 'kit-toast--info',
};

/** The live region. Rendered once by the shell, above everything else. */
export function ToastViewport(): ReactElement {
  const { toasts, dismiss } = useToast();
  const errors = toasts.filter((toast) => toast.tone === 'bad' || toast.tone === 'warn');
  const others = toasts.filter((toast) => toast.tone !== 'bad' && toast.tone !== 'warn');

  const render = (toast: Toast): ReactElement => (
    <li key={toast.id} className={`kit-toast ${TONE_CLASS[toast.tone]}`}>
      <div className="kit-toast-body">
        <p className="kit-toast-message">{toast.message}</p>
        {toast.detail !== undefined && toast.detail.length > 0 && (
          <p className="kit-toast-detail">{toast.detail}</p>
        )}
      </div>
      <button
        type="button"
        className="kit-toast-close"
        onClick={() => dismiss(toast.id)}
        aria-label={`Dismiss: ${toast.message}`}
      >
        {/* A drawn cross, because an emoji would fail the icon audit. */}
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
          <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      </button>
    </li>
  );

  return (
    <>
      {/* Errors interrupt: a refusal the operator does not notice is a refusal
          they will repeat. */}
      <div className="kit-toast-region" aria-live="assertive" aria-atomic="false">
        <ul className="kit-toast-list">{errors.map(render)}</ul>
      </div>
      {/* Successes do not. */}
      <div className="kit-toast-region kit-toast-region--polite" role="status" aria-live="polite">
        <ul className="kit-toast-list">{others.map(render)}</ul>
      </div>
    </>
  );
}
