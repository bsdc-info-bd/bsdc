/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
/**
 * Voice-note recording for BSDC Messenger.
 *
 * - Native MediaRecorder API (webm/opus with Safari mp4 fallback)
 * - Live level metering via AnalyserNode → animated waveform bars
 * - Tap-to-toggle AND hold-to-record (a sub-500ms hold cancels)
 * - Slide-to-cancel on the recording overlay (mobile-first)
 * - Returns a { blob, durationSec, mime } ready for Cloudinary upload
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface VoiceNoteResult {
  blob: Blob;
  durationSec: number;
  mime: string;
}

/** Negotiate the best supported audio mime for MediaRecorder on this browser. */
export function pickAudioMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return '';
}

export type RecorderStatus = 'idle' | 'requesting' | 'recording' | 'processing';

export function useVoiceRecorder(onDone: (note: VoiceNoteResult) => void, onError?: (message: string) => void) {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => new Array(28).fill(0.08));
  const [cancelled, setCancelled] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const cancelledRef = useRef(false);
  const holdTimerRef = useRef<number | null>(null);
  const onDoneRef = useRef(onDone);
  const onErrorRef = useRef(onError);
  onDoneRef.current = onDone;
  onErrorRef.current = onError;

  const teardown = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    rafRef.current = null;
    timerRef.current = null;
    recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    streamRef.current?.getTracks().forEach((track) => track.stop());
    void audioCtxRef.current?.close().catch(() => undefined);
    recorderRef.current = null;
    streamRef.current = null;
    audioCtxRef.current = null;
  }, []);

  useEffect(() => () => teardown(), [teardown]);

  const start = useCallback(async () => {
    if (status === 'recording' || status === 'requesting') return;
    setStatus('requesting');
    cancelledRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;

      const mime = pickAudioMime();
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const duration = (Date.now() - startedAtRef.current) / 1000;
        teardown();
        if (cancelledRef.current || duration < 0.6 || chunksRef.current.length === 0) {
          if (!cancelledRef.current && duration < 0.6) onErrorRef.current?.('TOO_SHORT');
          setStatus('idle');
          setElapsed(0);
          setLevels(new Array(28).fill(0.08));
          return;
        }
        const type = chunksRef.current[0]?.type || mime || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        setStatus('idle');
        setElapsed(0);
        setLevels(new Array(28).fill(0.08));
        onDoneRef.current({ blob, durationSec: duration, mime: type });
      };

      // Live level metering for the waveform
      const Ctx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        const ctx = new Ctx();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteTimeDomainData(data);
          let peak = 0;
          for (let i = 0; i < data.length; i += 1) {
            peak = Math.max(peak, Math.abs(data[i] - 128) / 128);
          }
          setLevels((prev) => {
            const next = prev.slice(1);
            next.push(Math.max(0.08, Math.min(1, peak * 1.8)));
            return next;
          });
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      }

      startedAtRef.current = Date.now();
      recorder.start(250);
      setStatus('recording');
      timerRef.current = window.setInterval(() => {
        setElapsed((Date.now() - startedAtRef.current) / 1000);
      }, 100);
    } catch (e) {
      teardown();
      setStatus('idle');
      const name = (e as Error).name || '';
      onErrorRef.current?.(name === 'NotAllowedError' ? 'PERMISSION' : 'FAILED');
    }
  }, [status, teardown]);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === 'recording') {
      setStatus('processing');
      recorderRef.current.stop();
    }
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    setCancelled(true);
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    else {
      teardown();
      setStatus('idle');
    }
  }, [teardown]);

  /** Hold-to-record: pointerdown starts after 250ms; pointerup before → cancel. */
  const holdHandlers = {
    onPointerDown: () => {
      holdTimerRef.current = window.setTimeout(() => {
        holdTimerRef.current = null;
        void start();
      }, 220);
    },
    onPointerUp: () => {
      if (holdTimerRef.current !== null) {
        window.clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
    },
    onPointerLeave: () => {
      if (holdTimerRef.current !== null) {
        window.clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
    },
  };

  return { status, elapsed, levels, start, stop, cancel, holdHandlers, cancelled };
}
