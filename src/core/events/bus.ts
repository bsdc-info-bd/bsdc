/**
 * BSDC — src/core/events/bus.ts
 * Purpose : A tiny typed event bus for cross-module notifications that must not create import
 *           cycles (ADR-006): analytics pings presence, presence pings the badge, and no module
 *           imports another module's internals.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Handlers are stored in a Set per topic and always called inside try/catch, so one
 *           failing listener can never break an unrelated feature.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */

/** Topics currently emitted by the platform. */
export type BusTopic =
  | 'route:changed'
  | 'theme:changed'
  | 'locale:changed'
  | 'network:changed'
  | 'feedback:published'
  | 'flag:changed'
  | 'toast:shown'
  | 'palette:open';

/** Payload carried with a `route:changed` event. */
export interface RouteChangedPayload {
  readonly path: string;
}

/** Payload carried with a `network:changed` event. */
export interface NetworkChangedPayload {
  readonly online: boolean;
}

/** Payload carried with a `theme:changed` event. */
export interface ThemeChangedPayload {
  readonly theme: string;
}

/** Payload carried with a `locale:changed` event. */
export interface LocaleChangedPayload {
  readonly locale: 'bn' | 'en';
}

/** Payload carried with a `flag:changed` event. */
export interface FlagChangedPayload {
  readonly key: string;
  readonly enabled: boolean;
}

/** Payload carried with a `toast:shown` event. */
export interface ToastShownPayload {
  readonly tone: 'success' | 'error' | 'info' | 'warning';
}

/** Topic to payload mapping. */
export interface BusEvents {
  'route:changed': RouteChangedPayload;
  'theme:changed': ThemeChangedPayload;
  'locale:changed': LocaleChangedPayload;
  'network:changed': NetworkChangedPayload;
  'feedback:published': { readonly postId: string };
  'flag:changed': FlagChangedPayload;
  'toast:shown': ToastShownPayload;
  /** Request to open the command palette. Emitted by the header search button. */
  'palette:open': { readonly source: string };
}

type Handler<T extends BusTopic> = (payload: BusEvents[T]) => void;

type AnyHandler = (payload: never) => void;

/** Handler registry keyed by topic. Stored loosely, accessed through typed helpers. */
const handlers = new Map<BusTopic, Set<AnyHandler>>();

/**
 * Subscribes to a topic.
 * @param topic event topic
 * @param handler callback invoked with the payload
 * @returns an unsubscribe function
 */
export function on<T extends BusTopic>(topic: T, handler: Handler<T>): () => void {
  const existing = handlers.get(topic);
  const set = existing ?? new Set<AnyHandler>();
  if (existing === undefined) handlers.set(topic, set);
  const typed = handler as unknown as AnyHandler;
  set.add(typed);
  return () => {
    set.delete(typed);
  };
}

/**
 * Emits a topic to every subscriber.
 * @param topic event topic
 * @param payload event payload
 */
export function emit<T extends BusTopic>(topic: T, payload: BusEvents[T]): void {
  const set = handlers.get(topic);
  if (set === undefined) return;
  for (const handler of set) {
    try {
      (handler as unknown as Handler<T>)(payload);
    } catch (error) {
      console.error('[bsdc] event handler failed', topic, error);
    }
  }
}
