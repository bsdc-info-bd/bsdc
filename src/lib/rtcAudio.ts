export interface RtcAudioMetrics {
  rttMs: number;
  jitterMs: number;
  packetLossRatio: number;
  audioLevel: number;
  bitrateKbps: number;
  quality: 'excellent' | 'good' | 'degraded' | 'poor';
}

export interface ProcessedAudioStream {
  stream: MediaStream;
  close: () => Promise<void>;
}

const STRICT_AUDIO = {
  echoCancellation: { exact: true },
  noiseSuppression: { exact: true },
  autoGainControl: { exact: true },
  channelCount: { exact: 1 },
  sampleRate: { ideal: 48_000 },
} satisfies MediaTrackConstraints;

const COMPATIBLE_AUDIO = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
  sampleRate: 48_000,
} satisfies MediaTrackConstraints;

const metricSamples = new WeakMap<RTCPeerConnection, { bytes: number; timestamp: number }>();

/** Request speech audio with native AEC/NS/AGC enabled whenever the device supports it. */
export async function getVoiceStream(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone is not supported by this browser');
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: STRICT_AUDIO });
  } catch {
    return navigator.mediaDevices.getUserMedia({ audio: COMPATIBLE_AUDIO });
  }
}

/**
 * Apply a local speech cleanup chain. It intentionally has no connection to
 * AudioContext.destination, preventing local microphone feedback and echo.
 */
export async function createProcessedAudioStream(input: MediaStream): Promise<ProcessedAudioStream> {
  const Context = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) return { stream: input, close: async () => stopTracks(input) };

  const context = new Context({ latencyHint: 'interactive', sampleRate: 48_000 });
  await context.resume().catch(() => undefined);
  const source = context.createMediaStreamSource(input);
  const highPass = context.createBiquadFilter();
  highPass.type = 'highpass';
  highPass.frequency.value = 80;
  highPass.Q.value = 0.707;
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.knee.value = 12;
  compressor.ratio.value = 3;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.12;
  const destination = context.createMediaStreamDestination();
  source.connect(highPass).connect(compressor).connect(destination);

  return {
    stream: destination.stream,
    close: async () => {
      source.disconnect();
      highPass.disconnect();
      compressor.disconnect();
      stopTracks(destination.stream);
      stopTracks(input);
      await context.close().catch(() => undefined);
    },
  };
}

/** Configure a voice sender for fullband Opus speech with FEC and DTX. */
export async function configureOpusSender(sender: RTCRtpSender): Promise<void> {
  const parameters = sender.getParameters();
  parameters.encodings = (parameters.encodings?.length ? parameters.encodings : [{}]).map((encoding) => ({
    ...encoding,
    maxBitrate: 128_000,
    minBitrate: 24_000,
    maxFramerate: 50,
  }));
  parameters.degradationPreference = 'maintain-framerate';
  await sender.setParameters(parameters).catch(() => undefined);
}

/** Adapt Opus bandwidth without renegotiating or dropping the active call. */
export async function adaptOpusBitrate(sender: RTCRtpSender, quality: RtcAudioMetrics['quality']): Promise<void> {
  const parameters = sender.getParameters();
  const maxBitrate = quality === 'poor' ? 64_000 : quality === 'degraded' ? 96_000 : 128_000;
  parameters.encodings = (parameters.encodings?.length ? parameters.encodings : [{}]).map((encoding) => ({ ...encoding, maxBitrate }));
  await sender.setParameters(parameters).catch(() => undefined);
}

/** Add Opus fmtp parameters without changing codecs or duplicating fmtp keys. */
export function tuneOpusSdp(sdp: string): string {
  return sdp.replace(/(a=fmtp:(\d+) [^\r\n]*)(\r?\n)/g, (full, prefix: string, payloadType: string, newline: string) => {
    if (!sdp.includes(`a=rtpmap:${payloadType} opus/48000/2`)) return full;
    const parameters = 'maxaveragebitrate=128000;maxplaybackrate=48000;sprop-maxcapturerate=48000;useinbandfec=1;usedtx=1;stereo=0;sprop-stereo=0';
    const withoutOld = prefix.replace(/;?(maxaveragebitrate|useinbandfec|usedtx|stereo|sprop-stereo|sprop-maxcapturerate)=[^;]*/g, '');
    return `${withoutOld.replace(/\s+$/, '')};${parameters}${newline}`;
  });
}

export async function collectRtcMetrics(connection: RTCPeerConnection): Promise<RtcAudioMetrics> {
  let rttMs = 0;
  let jitterMs = 0;
  let packetLossRatio = 0;
  let audioLevel = 0;
  let bitrateKbps = 0;
  let bytesReceived = 0;
  let sampleTimestamp = 0;
  const report = await connection.getStats();
  report.forEach((stat) => {
    if (stat.type === 'candidate-pair' && stat.state === 'succeeded' && typeof stat.currentRoundTripTime === 'number') rttMs = Math.max(rttMs, stat.currentRoundTripTime * 1000);
    if (stat.type === 'inbound-rtp' && stat.kind === 'audio') {
      if (typeof stat.jitter === 'number') jitterMs = Math.max(jitterMs, stat.jitter * 1000);
      if (typeof stat.audioLevel === 'number') audioLevel = Math.max(audioLevel, stat.audioLevel);
      const received = Number(stat.packetsReceived || 0);
      const lost = Number(stat.packetsLost || 0);
      if (received + lost > 0) packetLossRatio = Math.max(packetLossRatio, lost / (received + lost));
      if (typeof stat.bytesReceived === 'number' && typeof stat.timestamp === 'number') {
        bytesReceived = Math.max(bytesReceived, stat.bytesReceived);
        sampleTimestamp = Math.max(sampleTimestamp, stat.timestamp);
      }
    }
    if (stat.type === 'remote-inbound-rtp' && stat.kind === 'audio') {
      if (typeof stat.roundTripTime === 'number') rttMs = Math.max(rttMs, stat.roundTripTime * 1000);
      const sent = Number(stat.packetsSent || 0);
      const lost = Number(stat.packetsLost || 0);
      if (sent + lost > 0) packetLossRatio = Math.max(packetLossRatio, lost / (sent + lost));
    }
  });
  const previous = metricSamples.get(connection);
  if (previous && sampleTimestamp > previous.timestamp) bitrateKbps = Math.max(0, ((bytesReceived - previous.bytes) * 8) / (sampleTimestamp - previous.timestamp));
  if (sampleTimestamp > 0) metricSamples.set(connection, { bytes: bytesReceived, timestamp: sampleTimestamp });
  const quality = rttMs > 250 || jitterMs > 80 || packetLossRatio > 0.08 ? 'poor' : rttMs > 150 || jitterMs > 40 || packetLossRatio > 0.03 ? 'degraded' : rttMs > 80 || jitterMs > 20 || packetLossRatio > 0.01 ? 'good' : 'excellent';
  return { rttMs: Math.round(rttMs), jitterMs: Math.round(jitterMs), packetLossRatio, audioLevel, bitrateKbps: Math.round(bitrateKbps), quality };
}

function stopTracks(stream: MediaStream): void {
  stream.getTracks().forEach((track) => track.stop());
}
