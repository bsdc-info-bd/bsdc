import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CHUNK_MS,
  currentRecorderEnvironment,
  describeSupport,
  elapsedLabel,
  isWorthSending,
  MAX_VOICE_MS,
  recorderFailureKey,
  voiceNoteFileName,
} from '@/lib/messaging/voice-recorder';

export type VoiceRecorderState = 'idle' | 'recording' | 'paused' | 'processing' | 'unsupported';

export interface VoiceRecorder {
  state: VoiceRecorderState;
  /** Why recording is unavailable at all, as a message key. Null when it is available. */
  blockKey: string | null;
  /** Why this recording did not become a note, as a message key. */
  errorKey: string | null;
  elapsedMs: number;
  label: string;
  /** Input level, 0 to 1, for the meter. */
  level: number;
  start: () => void;
  /** Stop and hand the note over. */
  stop: () => void;
  /** Stop and throw it away. */
  cancel: () => void;
  pause: () => void;
  resume: () => void;
  dismissError: () => void;
}

const BLOCK_KEYS: Record<string, string> = {
  insecure: 'chat.voice.insecure',
  'no-recorder': 'chat.voice.noRecorder',
  'no-microphone': 'chat.voice.noMicrophone',
  'no-codec': 'chat.voice.noCodec',
};

/** How often the timer and the meter are refreshed. */
const TICK_MS = 100;

/**
 * Record a voice note.
 *
 * The recorder reports what it is doing the whole time it is doing it: elapsed
 * time, an input level that moves when the member speaks, and a distinct
 * sentence for each way it can fail. A recording control that gives no feedback
 * is indistinguishable from one that is broken, and "voice recording not
 * working" is almost always that — a permission prompt behind the browser
 * chrome, a codec the device does not have, or a note that stopped before the
 * member knew it had started.
 */
export function useVoiceRecorder(onRecorded: (file: File) => void): VoiceRecorder {
  const support = useMemo(() => describeSupport(currentRecorderEnvironment()), []);
  const [state, setState] = useState<VoiceRecorderState>(
    support.supported ? 'idle' : 'unsupported',
  );
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [level, setLevel] = useState(0);

  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const context = useRef<AudioContext | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const tick = useRef<number | null>(null);
  const accumulated = useRef(0);
  const since = useRef<number | null>(null);
  const mimeType = useRef<string | null>(null);
  const startedAt = useRef<Date>(new Date());
  const discarded = useRef(false);
  const deliver = useRef(onRecorded);
  deliver.current = onRecorded;

  const elapsed = useCallback(
    () => accumulated.current + (since.current === null ? 0 : Date.now() - since.current),
    [],
  );

  const teardown = useCallback(() => {
    if (tick.current !== null) {
      window.clearInterval(tick.current);
      tick.current = null;
    }
    for (const track of stream.current?.getTracks() ?? []) track.stop();
    stream.current = null;
    void context.current?.close().catch(() => undefined);
    context.current = null;
    analyser.current = null;
    since.current = null;
  }, []);

  const finish = useCallback(() => {
    const total = elapsed();
    teardown();
    recorder.current = null;
    if (discarded.current) {
      discarded.current = false;
      chunks.current = [];
      setState('idle');
      setElapsedMs(0);
      setLevel(0);
      return;
    }
    if (!isWorthSending(total)) {
      chunks.current = [];
      setState('idle');
      setElapsedMs(0);
      setLevel(0);
      setErrorKey('chat.voice.tooShort');
      return;
    }
    const type = mimeType.current ?? 'audio/webm';
    const blob = new Blob(chunks.current, { type });
    chunks.current = [];
    const file = new File([blob], voiceNoteFileName(type, startedAt.current), {
      type,
      lastModified: Date.now(),
    });
    setState('idle');
    setElapsedMs(0);
    setLevel(0);
    deliver.current(file);
  }, [elapsed, teardown]);

  // The recorder's own stop event is the only place the bytes are complete.
  useEffect(() => teardown, [teardown]);

  const startTimer = useCallback(() => {
    if (tick.current !== null) window.clearInterval(tick.current);
    const samples = analyser.current ? new Uint8Array(analyser.current.fftSize) : null;
    tick.current = window.setInterval(() => {
      setElapsedMs(elapsed());
      if (samples && analyser.current) {
        analyser.current.getByteTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) {
          const normalised = (sample - 128) / 128;
          sum += normalised * normalised;
        }
        // Root mean square, scaled up: speech sits low in the raw number and a
        // meter that barely moves reads as a microphone that is not listening.
        setLevel(Math.min(1, Math.sqrt(sum / samples.length) * 2.6));
      }
    }, TICK_MS);
  }, [elapsed]);

  const start = useCallback(() => {
    if (!support.supported || state === 'recording' || state === 'processing') return;
    setErrorKey(null);
    discarded.current = false;
    chunks.current = [];
    accumulated.current = 0;
    since.current = null;
    setState('processing');

    void navigator.mediaDevices
      .getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      })
      .then((microphone) => {
        stream.current = microphone;
        startedAt.current = new Date();
        mimeType.current = support.mimeType;
        const media =
          support.mimeType === null
            ? new MediaRecorder(microphone)
            : new MediaRecorder(microphone, { mimeType: support.mimeType });
        // The browser can still choose something else; believe what it says.
        if (media.mimeType.length > 0) mimeType.current = media.mimeType;
        media.ondataavailable = (event) => {
          if (event.data.size > 0) chunks.current.push(event.data);
        };
        media.onstop = finish;
        recorder.current = media;

        // A level meter needs an analyser, and an analyser needs an audio
        // context. Neither is essential: a browser that refuses them still
        // records, it just cannot show the member that it is hearing them.
        try {
          const audio = new AudioContext();
          const source = audio.createMediaStreamSource(microphone);
          const node = audio.createAnalyser();
          node.fftSize = 512;
          node.smoothingTimeConstant = 0.6;
          source.connect(node);
          context.current = audio;
          analyser.current = node;
        } catch {
          analyser.current = null;
        }

        media.start(CHUNK_MS);
        since.current = Date.now();
        setState('recording');
        startTimer();
      })
      .catch((error: unknown) => {
        teardown();
        recorder.current = null;
        setState('idle');
        setErrorKey(recorderFailureKey(error));
      });
  }, [finish, startTimer, state, support.mimeType, support.supported, teardown]);

  const stop = useCallback(() => {
    const media = recorder.current;
    if (media === null || media.state === 'inactive') return;
    accumulated.current = elapsed();
    since.current = null;
    setState('processing');
    if (tick.current !== null) {
      window.clearInterval(tick.current);
      tick.current = null;
    }
    // requestData flushes what is buffered so a short note is not truncated.
    try {
      media.requestData();
    } catch {
      // Not every browser implements it; onstop still carries what was chunked.
    }
    media.stop();
  }, [elapsed]);

  const cancel = useCallback(() => {
    discarded.current = true;
    stop();
  }, [stop]);

  const pause = useCallback(() => {
    const media = recorder.current;
    if (media === null || media.state !== 'recording') return;
    media.pause();
    accumulated.current = elapsed();
    since.current = null;
    setState('paused');
  }, [elapsed]);

  const resume = useCallback(() => {
    const media = recorder.current;
    if (media === null || media.state !== 'paused') return;
    media.resume();
    since.current = Date.now();
    setState('recording');
  }, []);

  // A note that reaches the limit stops itself rather than being cut off.
  useEffect(() => {
    if (state !== 'recording') return;
    if (elapsedMs < MAX_VOICE_MS) return;
    stop();
  }, [elapsedMs, state, stop]);

  return {
    state,
    blockKey: support.supported ? null : (BLOCK_KEYS[support.reason] ?? 'chat.voice.failed'),
    errorKey,
    elapsedMs,
    label: elapsedLabel(elapsedMs),
    level,
    start,
    stop,
    cancel,
    pause,
    resume,
    dismissError: () => setErrorKey(null),
  };
}
