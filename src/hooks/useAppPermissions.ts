/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
/**
 * useAppPermissions — a complete permission-request state machine for
 * microphone and geolocation.
 *
 * States per permission:  idle → pending → granted | denied
 *
 * Design notes:
 *  - Requests MUST be triggered from a real user gesture (button click) —
 *    browsers ignore/block programmatic permission calls otherwise.
 *  - The mic stream obtained to VERIFY permission is immediately stopped
 *    (every track) so the browser's recording indicator never lingers.
 *  - External changes (user flips the site permission in browser settings)
 *    are reflected live via navigator.permissions watchers.
 *  - Denials are classified: explicit user deny vs permanently-blocked vs
 *    hardware missing vs insecure context vs embedded iframe, so the UI can
 *    show the correct recovery path.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { inIframe } from '@/lib/permissions';

export type PermissionState = 'idle' | 'pending' | 'granted' | 'denied';

export type PermissionFailure =
  | 'user-denied' // user clicked "Block" on the native prompt
  | 'blocked' // previously blocked — the browser will NOT re-prompt
  | 'no-device' // no microphone hardware / no location provider
  | 'insecure' // page not served over https
  | 'unsupported' // API missing in this browser
  | 'iframe' // embedded preview — the host page must allow the API
  | 'unknown';

export interface PermissionStatus {
  state: PermissionState;
  failure: PermissionFailure | null;
  /** Human-readable explanation for the failure. */
  message: string;
}

export interface AppPermissionsApi {
  microphone: PermissionStatus;
  location: PermissionStatus;
  requestMicrophone: () => Promise<PermissionStatus>;
  requestLocation: () => Promise<PermissionStatus>;
  reset: () => void;
}

const IDLE: PermissionStatus = { state: 'idle', failure: null, message: '' };

function classifyError(domain: 'microphone' | 'geolocation', err: unknown): PermissionStatus {
  const name = (err as { name?: string })?.name || '';
  const isIframe = inIframe();

  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError' || name === 'SECURITY_ERR') {
    if (isIframe) return iframeStatus(domain);
    return {
      state: 'denied',
      failure: 'user-denied',
      message: `You declined ${label(domain)} access. The browser will ask again next time you tap Allow.`,
    };
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'PositionUnavailable' || name === 'PERMISSION_UNAVAILABLE') {
    return {
      state: 'denied',
      failure: 'no-device',
      message: `No ${domain === 'microphone' ? 'microphone was detected' : 'location provider was available'} on this device.`,
    };
  }
  if (name === 'TypeError' || name === 'NotSupportedError') {
    return { state: 'denied', failure: 'unsupported', message: `${label(domain)} is not supported by this browser.` };
  }
  if (location.protocol !== 'https:') {
    return { state: 'denied', failure: 'insecure', message: `${label(domain)} requires HTTPS.` };
  }
  return { state: 'denied', failure: 'unknown', message: `${label(domain)} request failed. Please try again.` };
}

function iframeStatus(domain: 'microphone' | 'geolocation'): PermissionStatus {
  return {
    state: 'denied',
    failure: 'iframe',
    message: `${label(domain)} is blocked inside embedded previews. Open BSDC in its own tab and try again.`,
  };
}

function label(domain: 'microphone' | 'geolocation'): string {
  return domain === 'microphone' ? 'Microphone' : 'Location';
}

/** True when the Permissions API reports the origin as permanently blocked. */
async function isHardBlocked(domain: 'microphone' | 'geolocation'): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) return false;
  const name = domain === 'microphone' ? 'microphone' : 'geolocation';
  try {
    const status = await navigator.permissions.query({ name } as PermissionDescriptor);
    return status.state === 'denied';
  } catch {
    return false;
  }
}

export function useAppPermissions(): AppPermissionsApi {
  const [microphone, setMicrophone] = useState<PermissionStatus>(IDLE);
  const [location, setLocation] = useState<PermissionStatus>(IDLE);
  const streamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Hard cleanup guarantee: stop any live track on unmount.
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, []);

  // Live-sync with the browser's permission store (including manual changes
  // made in browser settings while the app is open).
  useEffect(() => {
    const unsubs: Array<() => void> = [];
    const watch = async (domain: 'microphone' | 'geolocation') => {
      if (typeof navigator === 'undefined' || !navigator.permissions?.query) return;
      const name = domain === 'microphone' ? 'microphone' : 'geolocation';
      try {
        const status = await navigator.permissions.query({ name } as PermissionDescriptor);
        const onChange = () => {
          if (!mountedRef.current) return;
          const setter = domain === 'microphone' ? setMicrophone : setLocation;
          if (status.state === 'granted') {
            setter({ state: 'granted', failure: null, message: '' });
          } else if (status.state === 'denied') {
            setter((prev) =>
              prev.state === 'granted'
                ? prev // keep optimistic granted until a request actually fails
                : inIframe()
                  ? iframeStatus(domain)
                  : {
                      state: 'denied',
                      failure: 'blocked',
                      message: `${label(domain)} is blocked for this site. Enable it from the padlock icon in the address bar, then reload.`,
                    },
            );
          }
        };
        status.addEventListener('change', onChange);
        onChange();
        unsubs.push(() => status.removeEventListener('change', onChange));
      } catch {
        /* Permissions API unavailable for this domain — states stay request-driven */
      }
    };
    void watch('microphone');
    void watch('geolocation');
    return () => unsubs.forEach((fn) => fn());
  }, []);

  const requestMicrophone = useCallback(async (): Promise<PermissionStatus> => {
    if (!navigator.mediaDevices?.getUserMedia) {
      const result: PermissionStatus = { state: 'denied', failure: 'unsupported', message: 'This browser does not support microphone access.' };
      setMicrophone(result);
      return result;
    }
    setMicrophone({ state: 'pending', failure: null, message: '' });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      // Permission verified — stop every track immediately so the browser's
      // "recording" indicator turns off right away. The actual voice-note
      // recorder opens its own stream later.
      stopStream(stream);
      if (streamRef.current) stopStream(streamRef.current);
      streamRef.current = stream;
      const result: PermissionStatus = { state: 'granted', failure: null, message: '' };
      if (mountedRef.current) setMicrophone(result);
      return result;
    } catch (err) {
      let result = classifyError('microphone', err);
      if (result.failure === 'user-denied' && (await isHardBlocked('microphone'))) {
        result = inIframe()
          ? iframeStatus('microphone')
          : { ...result, failure: 'blocked', message: 'Microphone is blocked for this site. Enable it from the padlock icon in the address bar, then reload.' };
      }
      if (mountedRef.current) setMicrophone(result);
      return result;
    }
  }, []);

  const requestLocation = useCallback(async (): Promise<PermissionStatus> => {
    if (!navigator.geolocation) {
      const result: PermissionStatus = { state: 'denied', failure: 'unsupported', message: 'This browser does not support geolocation.' };
      setLocation(result);
      return result;
    }
    setLocation({ state: 'pending', failure: null, message: '' });
    try {
      await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 12000,
          maximumAge: 300000,
        });
      });
      const result: PermissionStatus = { state: 'granted', failure: null, message: '' };
      if (mountedRef.current) setLocation(result);
      return result;
    } catch (err) {
      let result = classifyError('geolocation', err);
      if (result.failure === 'user-denied' && (await isHardBlocked('geolocation'))) {
        result = inIframe()
          ? iframeStatus('geolocation')
          : { ...result, failure: 'blocked', message: 'Location is blocked for this site. Enable it from the padlock icon in the address bar, then reload.' };
      }
      if (mountedRef.current) setLocation(result);
      return result;
    }
  }, []);

  const reset = useCallback(() => {
    setMicrophone(IDLE);
    setLocation(IDLE);
  }, []);

  return { microphone, location, requestMicrophone, requestLocation, reset };
}

function stopStream(stream: MediaStream | null): void {
  if (!stream) return;
  stream.getTracks().forEach((track) => {
    try {
      track.stop();
    } catch {
      /* already stopped */
    }
  });
}
