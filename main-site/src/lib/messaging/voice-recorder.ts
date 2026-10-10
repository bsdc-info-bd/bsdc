/**
 * Recording a voice note: what the browser can do, what to call the result,
 * and how to explain it when it refuses.
 *
 * A recorder is three things that each fail differently — a secure context, a
 * permission, and a codec — and a member who is told "the upload failed" when
 * they pressed "don't allow" will press it again and get the same answer. Every
 * failure here has its own sentence.
 *
 * The browser parts are deliberately kept out: this module is pure and tested,
 * and `useVoiceRecorder` is the thin shell that holds the MediaRecorder.
 */

/** Longest note one bubble should carry. Past this the thread stops being a thread. */
export const MAX_VOICE_MS = 5 * 60 * 1000;

/** How often the recorder hands over a chunk, so a long note is not one allocation. */
export const CHUNK_MS = 1_000;

/**
 * In the order they are tried.
 *
 * Opus in WebM is what every Chromium and Firefox records natively and what the
 * storage bucket accepts; Safari answers to MP4/AAC instead, and a recorder
 * constructed without a codec it supports throws rather than falling back.
 */
export const VOICE_MIME_CANDIDATES: readonly string[] = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
  'audio/mpeg',
];

export type RecorderBlock = 'ok' | 'insecure' | 'no-recorder' | 'no-microphone' | 'no-codec';

export interface RecorderSupport {
  supported: boolean;
  reason: RecorderBlock;
  /** The codec to construct the recorder with, when there is one. */
  mimeType: string | null;
}

/** What the page can see, so the answer can be worked out without a browser. */
export interface RecorderEnvironment {
  isSecureContext: boolean;
  hasMediaRecorder: boolean;
  hasGetUserMedia: boolean;
  /** `MediaRecorder.isTypeSupported`. */
  mimeSupported: (mimeType: string) => boolean;
}

export function pickMimeType(mimeSupported: (mimeType: string) => boolean): string | null {
  for (const candidate of VOICE_MIME_CANDIDATES) {
    if (mimeSupported(candidate)) return candidate;
  }
  return null;
}

export function describeSupport(environment: RecorderEnvironment): RecorderSupport {
  if (!environment.isSecureContext) {
    return { supported: false, reason: 'insecure', mimeType: null };
  }
  if (!environment.hasMediaRecorder) {
    return { supported: false, reason: 'no-recorder', mimeType: null };
  }
  if (!environment.hasGetUserMedia) {
    return { supported: false, reason: 'no-microphone', mimeType: null };
  }
  const mimeType = pickMimeType(environment.mimeSupported);
  if (mimeType === null) {
    return { supported: false, reason: 'no-codec', mimeType: null };
  }
  return { supported: true, reason: 'ok', mimeType };
}

/** The environment this page is actually running in. */
export function currentRecorderEnvironment(): RecorderEnvironment {
  return {
    isSecureContext: typeof window === 'undefined' ? false : window.isSecureContext === true,
    hasMediaRecorder: typeof MediaRecorder !== 'undefined',
    hasGetUserMedia:
      typeof navigator !== 'undefined' &&
      navigator.mediaDevices !== undefined &&
      typeof navigator.mediaDevices.getUserMedia === 'function',
    mimeSupported: (mimeType) =>
      typeof MediaRecorder !== 'undefined' &&
      typeof MediaRecorder.isTypeSupported === 'function' &&
      MediaRecorder.isTypeSupported(mimeType),
  };
}

/** What the recorded file should be called, so the extension matches the bytes. */
export function extensionForMime(mimeType: string): string {
  const type = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  if (type === 'audio/mp4' || type === 'audio/x-m4a' || type === 'audio/aac') return 'm4a';
  if (type === 'audio/ogg') return 'ogg';
  if (type === 'audio/mpeg' || type === 'audio/mp3') return 'mp3';
  if (type === 'audio/wav' || type === 'audio/x-wav') return 'wav';
  return 'webm';
}

export function voiceNoteFileName(mimeType: string, startedAt: Date): string {
  const stamp = startedAt.toISOString().replace(/[-:]/g, '').slice(0, 15);
  return `voice-${stamp}.${extensionForMime(mimeType)}`;
}

/**
 * Why a recording did not happen, as a message key.
 *
 * The names come from the DOM exception the browser raises, and each one is a
 * different thing the member has to do: allow the microphone, unplug the other
 * app using it, or use a browser that can record at all.
 */
export function recorderFailureKey(error: unknown): string {
  const name = error instanceof DOMException ? error.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'chat.voice.denied';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'chat.voice.noMicrophone';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'chat.voice.inUse';
    case 'OverconstrainedError':
      return 'chat.voice.unsupportedDevice';
    case 'SecurityError':
      return 'chat.voice.insecure';
    case 'NotSupportedError':
      return 'chat.voice.noCodec';
    default:
      return 'chat.voice.failed';
  }
}

/** `m:ss`, and `h:mm:ss` past an hour — the shape a timer on a bubble needs. */
export function elapsedLabel(milliseconds: number): string {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mmss = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return hours > 0 ? `${String(hours)}:${mmss}` : mmss;
}

/** How much of the limit a recording has used, 0 to 1. */
export function recordingProgress(milliseconds: number): number {
  return Math.min(1, Math.max(0, milliseconds / MAX_VOICE_MS));
}

/** True when the note is long enough to be worth sending. */
export function isWorthSending(milliseconds: number): boolean {
  return milliseconds >= 500;
}
