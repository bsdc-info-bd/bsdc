/**
 * Asking where a member is, and getting back words.
 *
 * The permission is asked for by a button that says what it is for — a profile
 * field a member is filling in — and never on load. What is sent is a coordinate
 * rounded to about a kilometre, to this site's own origin, and what comes back is
 * a city name. The numbers are not kept by the app, not written to the profile
 * and not sent anywhere else.
 */
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  LOCATION_BLOCK_KEYS,
  POSITION_OPTIONS,
  blockFromPositionError,
  describeLocationSupport,
  roundedPosition,
  type LocationBlock,
} from '@/lib/geo/reverse';

export type LocationState = 'idle' | 'locating' | 'resolving';

export interface PlaceFinder {
  /** `'ok'` when this browser can be asked. */
  block: LocationBlock;
  state: LocationState;
  busy: boolean;
  errorKey: string | null;
  dismissError: () => void;
  /** Resolves to a place name, or to null with `errorKey` set. */
  find: () => Promise<string | null>;
}

function readPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    globalThis.navigator.geolocation.getCurrentPosition(resolve, reject, POSITION_OPTIONS);
  });
}

export function usePlaceFinder(): PlaceFinder {
  const { i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const [state, setState] = useState<LocationState>('idle');
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const block = describeLocationSupport({
    secureContext: globalThis.isSecureContext === true,
    geolocation: typeof globalThis.navigator?.geolocation?.getCurrentPosition === 'function',
  });

  const dismissError = useCallback(() => setErrorKey(null), []);

  const find = useCallback(async (): Promise<string | null> => {
    if (block !== 'ok') {
      setErrorKey(LOCATION_BLOCK_KEYS[block]);
      return null;
    }

    setErrorKey(null);
    setState('locating');

    let position: GeolocationPosition;
    try {
      position = await readPosition();
    } catch (error) {
      const code = (error as GeolocationPositionError).code;
      setErrorKey(LOCATION_BLOCK_KEYS[blockFromPositionError(code)]);
      setState('idle');
      return null;
    }

    // Rounded before it leaves the browser: the promise is a neighbourhood, not
    // a door, and the server cannot make that true on this side of the request.
    const rounded = roundedPosition(position.coords.latitude, position.coords.longitude);

    setState('resolving');
    try {
      const response = await fetch('/api/geo/reverse', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          latitude: rounded.latitude,
          longitude: rounded.longitude,
          language,
        }),
      });
      if (!response.ok) {
        setErrorKey('location.errors.failed');
        setState('idle');
        return null;
      }
      const payload = (await response.json()) as { place?: unknown };
      const place = typeof payload.place === 'string' ? payload.place.trim() : '';
      if (place.length === 0) {
        // Nothing named within a kilometre of a rounded coordinate: a river, a
        // border, a stretch of road. The field stays the member's to fill in.
        setErrorKey('location.errors.nothingFound');
        setState('idle');
        return null;
      }
      setState('idle');
      return place;
    } catch {
      setErrorKey('location.errors.failed');
      setState('idle');
      return null;
    }
  }, [block, language]);

  return {
    block,
    state,
    busy: state !== 'idle',
    errorKey,
    dismissError,
    find,
  };
}
