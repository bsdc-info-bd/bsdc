import { useCallback, useEffect, useState } from 'react';
import { messageOf, type AsyncState } from '../data/rpc';

/**
 * Loads something once and lets the caller reload it after a write. The
 * cleanup flag matters: a console tab can be switched while a query is in
 * flight, and a late answer must not overwrite a newer screen.
 */
export function useAsync<T>(
  load: () => Promise<T>,
  deps: readonly unknown[],
): { readonly state: AsyncState<T>; readonly reload: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' });
  const [nonce, setNonce] = useState(0);

  // The loader is intentionally keyed on the caller's dependency list.
  const run = useCallback(load, deps);

  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });
    run()
      .then((data) => {
        if (active) setState({ status: 'ready', data });
      })
      .catch((error: unknown) => {
        if (active) setState({ status: 'error', message: messageOf(error) });
      });
    return () => {
      active = false;
    };
  }, [run, nonce]);

  const reload = useCallback(() => {
    setNonce((value) => value + 1);
  }, []);

  return { state, reload };
}
