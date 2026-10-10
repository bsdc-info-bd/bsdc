import { describe, expect, it } from 'vitest';
import {
  describeSupport,
  elapsedLabel,
  extensionForMime,
  isWorthSending,
  MAX_VOICE_MS,
  pickMimeType,
  recorderFailureKey,
  recordingProgress,
  voiceNoteFileName,
  VOICE_MIME_CANDIDATES,
  type RecorderEnvironment,
} from './voice-recorder';

const everything = (supported: readonly string[]): RecorderEnvironment => ({
  isSecureContext: true,
  hasMediaRecorder: true,
  hasGetUserMedia: true,
  mimeSupported: (mimeType) => supported.includes(mimeType),
});

const nothing = (): RecorderEnvironment => ({
  isSecureContext: true,
  hasMediaRecorder: true,
  hasGetUserMedia: true,
  mimeSupported: () => false,
});

describe('whether this page can record at all', () => {
  it('takes the first codec the browser says it can write', () => {
    expect(pickMimeType(everything(VOICE_MIME_CANDIDATES).mimeSupported)).toBe(
      'audio/webm;codecs=opus',
    );
    // Safari: no WebM, but it will write AAC in an MP4 container.
    expect(pickMimeType(everything(['audio/mp4']).mimeSupported)).toBe('audio/mp4');
    expect(pickMimeType(everything([]).mimeSupported)).toBeNull();
  });

  it('names the reason it cannot, because each one needs a different answer', () => {
    expect(describeSupport(everything(['audio/webm']))).toEqual({
      supported: true,
      reason: 'ok',
      mimeType: 'audio/webm',
    });
    expect(describeSupport({ ...everything(['audio/webm']), isSecureContext: false }).reason).toBe(
      'insecure',
    );
    expect(describeSupport({ ...everything(['audio/webm']), hasMediaRecorder: false }).reason).toBe(
      'no-recorder',
    );
    expect(describeSupport({ ...everything(['audio/webm']), hasGetUserMedia: false }).reason).toBe(
      'no-microphone',
    );
    expect(describeSupport(nothing())).toEqual({
      supported: false,
      reason: 'no-codec',
      mimeType: null,
    });
  });
});

describe('what the recording is called', () => {
  it('matches the extension to the bytes, not to the platform that made them', () => {
    expect(extensionForMime('audio/webm;codecs=opus')).toBe('webm');
    expect(extensionForMime('audio/mp4')).toBe('m4a');
    expect(extensionForMime('audio/x-m4a')).toBe('m4a');
    expect(extensionForMime('audio/ogg;codecs=opus')).toBe('ogg');
    expect(extensionForMime('audio/mpeg')).toBe('mp3');
    expect(extensionForMime('audio/wav')).toBe('wav');
    expect(extensionForMime('')).toBe('webm');
  });

  it('stamps the moment it started', () => {
    const name = voiceNoteFileName('audio/mp4', new Date('2026-10-08T14:05:06.000Z'));
    expect(name).toBe('voice-20261008T140506.m4a');
    expect(name.includes('/')).toBe(false);
    expect(name.includes(':')).toBe(false);
  });
});

describe('why a recording did not happen', () => {
  function dom(name: string): DOMException {
    return new DOMException('no', name);
  }

  it('tells a refused permission apart from a missing microphone', () => {
    expect(recorderFailureKey(dom('NotAllowedError'))).toBe('chat.voice.denied');
    expect(recorderFailureKey(dom('PermissionDeniedError'))).toBe('chat.voice.denied');
    expect(recorderFailureKey(dom('NotFoundError'))).toBe('chat.voice.noMicrophone');
    expect(recorderFailureKey(dom('NotReadableError'))).toBe('chat.voice.inUse');
    expect(recorderFailureKey(dom('SecurityError'))).toBe('chat.voice.insecure');
    expect(recorderFailureKey(dom('NotSupportedError'))).toBe('chat.voice.noCodec');
  });

  it('still answers for something it has never seen', () => {
    expect(recorderFailureKey(dom('QuotaExceededError'))).toBe('chat.voice.failed');
    expect(recorderFailureKey(new Error('gone'))).toBe('chat.voice.failed');
    expect(recorderFailureKey(null)).toBe('chat.voice.failed');
  });
});

describe('the clock on the bubble', () => {
  it('reads as minutes and seconds, and adds hours only when there are any', () => {
    expect(elapsedLabel(0)).toBe('00:00');
    expect(elapsedLabel(999)).toBe('00:00');
    expect(elapsedLabel(5_000)).toBe('00:05');
    expect(elapsedLabel(65_000)).toBe('01:05');
    expect(elapsedLabel(600_000)).toBe('10:00');
    expect(elapsedLabel(3_600_000)).toBe('1:00:00');
    expect(elapsedLabel(-1)).toBe('00:00');
  });

  it('measures the limit without going past it', () => {
    expect(recordingProgress(0)).toBe(0);
    expect(recordingProgress(MAX_VOICE_MS / 2)).toBeCloseTo(0.5);
    expect(recordingProgress(MAX_VOICE_MS)).toBe(1);
    expect(recordingProgress(MAX_VOICE_MS * 4)).toBe(1);
  });

  it('refuses to send a note nobody would listen to', () => {
    expect(isWorthSending(0)).toBe(false);
    expect(isWorthSending(499)).toBe(false);
    expect(isWorthSending(500)).toBe(true);
    expect(isWorthSending(30_000)).toBe(true);
  });
});
