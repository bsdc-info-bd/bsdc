/**
 * BSDC — src/shared/hooks/useEventListener.ts
 * Purpose : Declarative event subscription with guaranteed cleanup (LAW-22).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Every listener in the product goes through this hook or an equivalent, so the
 *           "no leaked listener" rule is enforced by construction rather than by review.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useEffect, useRef } from 'react';

/**
 * Subscribes to a DOM or window event for the lifetime of the component.
 * @param target event target (null disables the subscription)
 * @param type event name
 * @param handler listener
 * @param options addEventListener options
 */
export function useEventListener<K extends keyof HTMLElementEventMap>(
  target: HTMLElement | null | undefined,
  type: K,
  handler: (event: HTMLElementEventMap[K]) => void,
  options?: AddEventListenerOptions,
): void;
/**
 * Subscribes to a window event for the lifetime of the component.
 * @param target the window object
 * @param type event name
 * @param handler listener
 * @param options addEventListener options
 */
export function useEventListener<K extends keyof WindowEventMap>(
  target: Window,
  type: K,
  handler: (event: WindowEventMap[K]) => void,
  options?: AddEventListenerOptions,
): void;
/**
 * Implementation signature.
 * @param target event target
 * @param type event name
 * @param handler listener
 * @param options addEventListener options
 */
export function useEventListener(
  target: EventTarget | null | undefined,
  type: string,
  handler: (event: Event) => void,
  options?: AddEventListenerOptions,
): void {
  const saved = useRef(handler);
  saved.current = handler;

  useEffect(() => {
    if (!target) return;
    const listener = (event: Event): void => saved.current(event);
    target.addEventListener(type, listener, options);
    return () => target.removeEventListener(type, listener, options);
  }, [target, type, options]);
}
