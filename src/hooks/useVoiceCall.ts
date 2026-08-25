import { useCallback, useEffect, useRef, useState } from 'react';
import { get, onChildAdded, onValue, push, ref, remove, set, update, type DataSnapshot } from 'firebase/database';
import { rtdb } from '@/config/firebase';
import type { ChatParticipant } from '@/types/chat';
import { adaptOpusBitrate, collectRtcMetrics, configureOpusSender, createProcessedAudioStream, getVoiceStream, tuneOpusSdp, type RtcAudioMetrics, type ProcessedAudioStream } from '@/lib/rtcAudio';

export type CallState = 'idle' | 'calling' | 'ringing' | 'connecting' | 'connected' | 'ended' | 'failed';
export interface IncomingCall { id: string; caller: ChatParticipant; createdAt: number }

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }],
};

const EMPTY_METRICS: RtcAudioMetrics = { rttMs: 0, jitterMs: 0, packetLossRatio: 0, audioLevel: 0, bitrateKbps: 0, quality: 'excellent' };

function snapshotValue<T>(snapshot: DataSnapshot): T | null {
  return (snapshot.val() as T | null) || null;
}

export function useVoiceCall(uid: string | null, peer: ChatParticipant | null) {
  const [state, setState] = useState<CallState>('idle');
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const [muted, setMuted] = useState(false);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const callIdRef = useRef<string | null>(null);
  const cleanupFnsRef = useRef<Array<() => void>>([]);
  const stateRef = useRef<CallState>('idle');
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const timeoutRef = useRef<number | null>(null);
  const metricsTimerRef = useRef<number | null>(null);
  const audioSessionRef = useRef<ProcessedAudioStream | null>(null);
  const [metrics, setMetrics] = useState<RtcAudioMetrics>(EMPTY_METRICS);
  stateRef.current = state;

  const cleanup = useCallback(async (removeCall = true) => {
    cleanupFnsRef.current.splice(0).forEach((unsubscribe) => unsubscribe());
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    if (metricsTimerRef.current !== null) window.clearInterval(metricsTimerRef.current);
    metricsTimerRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    if (audioSessionRef.current) await audioSessionRef.current.close();
    else streamRef.current?.getTracks().forEach((track) => track.stop());
    audioSessionRef.current = null;
    streamRef.current = null;
    if (removeCall && callIdRef.current) {
      const callId = callIdRef.current;
      await remove(ref(rtdb(), `calls/${callId}`)).catch(() => undefined);
      if (peer) await remove(ref(rtdb(), `incomingCalls/${peer.uid}/${callId}`)).catch(() => undefined);
      if (uid) await remove(ref(rtdb(), `incomingCalls/${uid}/${callId}`)).catch(() => undefined);
    }
    callIdRef.current = null;
    pendingCandidatesRef.current = [];
    setMetrics(EMPTY_METRICS);
    setMuted(false);
    setState('idle');
  }, [peer, uid]);

  useEffect(() => () => { void cleanup(); }, [cleanup]);

  useEffect(() => {
    // The app-root listener owns incoming calls. A chat page only starts calls
    // and must not create a second listener for the same user.
    if (!uid || peer) return;
    const callsRef = ref(rtdb(), `incomingCalls/${uid}`);
    return onChildAdded(callsRef, (snapshot) => {
      const call = snapshotValue<IncomingCall>(snapshot);
      if (call && call.id && call.createdAt > Date.now() - 60_000 && stateRef.current === 'idle') setIncoming(call);
    });
  }, [uid, peer]);

  const preparePeer = useCallback(async (callId: string, target: ChatParticipant) => {
    if (!uid) throw new Error('Call participant unavailable');
    const connection = new RTCPeerConnection(ICE_SERVERS);
    peerRef.current = connection;
    const input = await getVoiceStream();
    const audioSession = await createProcessedAudioStream(input);
    audioSessionRef.current = audioSession;
    streamRef.current = audioSession.stream;
    const senders: RTCRtpSender[] = [];
    audioSession.stream.getTracks().forEach((track) => {
      const sender = connection.addTrack(track, audioSession.stream);
      senders.push(sender);
      void configureOpusSender(sender);
    });
    connection.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (remoteStream && remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStream;
        void remoteAudioRef.current.play().catch(() => undefined);
      }
    };
    connection.onconnectionstatechange = () => {
      if (connection.connectionState === 'connected') setState('connected');
      if (['failed', 'disconnected', 'closed'].includes(connection.connectionState)) setState('failed');
    };
    metricsTimerRef.current = window.setInterval(() => {
      void collectRtcMetrics(connection).then((next) => { setMetrics(next); return Promise.all(senders.map((sender) => adaptOpusBitrate(sender, next.quality))); });
    }, 1000);
    const ownCandidates = ref(rtdb(), `calls/${callId}/candidates/${uid}`);
    const otherCandidates = ref(rtdb(), `calls/${callId}/candidates/${target.uid}`);
    const unsubscribeCandidates = onChildAdded(otherCandidates, (snapshot) => {
      const candidate = snapshotValue<RTCIceCandidateInit>(snapshot);
      if (!candidate) return;
      if (connection.remoteDescription) void connection.addIceCandidate(candidate).catch(() => undefined);
      else pendingCandidatesRef.current.push(candidate);
    });
    connection.onicecandidate = (event) => { if (event.candidate) void set(push(ownCandidates), event.candidate.toJSON()); };
    cleanupFnsRef.current.push(unsubscribeCandidates);
    return connection;
  }, [uid]);

  const start = useCallback(async () => {
    if (!uid || !peer || state !== 'idle' || !navigator.mediaDevices?.getUserMedia) return;
    setState('calling');
    try {
      const presence = snapshotValue<{ online?: boolean }>(await get(ref(rtdb(), `presence/${peer.uid}`)));
      if (!presence?.online) throw new Error('This user is offline');
      const callRef = push(ref(rtdb(), 'calls'));
      const callId = callRef.key;
      if (!callId) throw new Error('Could not create call');
      callIdRef.current = callId;
      const connection = await preparePeer(callId, peer);
      const offer = await connection.createOffer({ offerToReceiveAudio: true });
      if (offer.sdp) offer.sdp = tuneOpusSdp(offer.sdp);
      await connection.setLocalDescription(offer);
      const caller: ChatParticipant = { uid, displayName: 'BSDC member', username: '', avatar: '', role: 'member', joinedAt: Date.now() };
      await set(callRef, { id: callId, caller, callerId: uid, calleeId: peer.uid, status: 'ringing', offer: { type: offer.type, sdp: offer.sdp }, createdAt: Date.now() });
      await set(ref(rtdb(), `incomingCalls/${peer.uid}/${callId}`), { id: callId, caller, createdAt: Date.now() });
      timeoutRef.current = window.setTimeout(() => {
        void update(callRef, { status: 'ended' }).finally(() => cleanup());
      }, 30_000);
      const unsubscribe = onValue(callRef, (snapshot) => {
        const value = snapshotValue<{ answer?: RTCSessionDescriptionInit; status?: string }>(snapshot);
        if (value?.answer && !connection.currentRemoteDescription) {
          void connection.setRemoteDescription(value.answer).then(() =>
            Promise.all(pendingCandidatesRef.current.splice(0).map((candidate) => connection.addIceCandidate(candidate).catch(() => undefined))),
          );
        }
        if (value?.status === 'ended') void cleanup();
      });
      cleanupFnsRef.current.push(unsubscribe);
    } catch { await cleanup(); setState('failed'); }
  }, [cleanup, peer, preparePeer, state, uid]);

  const accept = useCallback(async () => {
    if (!incoming || !uid) return;
    const callId = incoming.id;
    setIncoming(null); setState('connecting'); callIdRef.current = callId;
    try {
      const callRef = ref(rtdb(), `calls/${callId}`);
      const snapshot = await new Promise<DataSnapshot>((resolve) => onValue(callRef, resolve, { onlyOnce: true }));
      const call = snapshotValue<{ offer: RTCSessionDescriptionInit }>(snapshot);
      if (!call?.offer) throw new Error('Call offer unavailable');
      const connection = await preparePeer(callId, incoming.caller);
      await connection.setRemoteDescription(call.offer);
      await Promise.all(pendingCandidatesRef.current.splice(0).map((candidate) => connection.addIceCandidate(candidate).catch(() => undefined)));
      const answer = await connection.createAnswer();
      if (answer.sdp) answer.sdp = tuneOpusSdp(answer.sdp);
      await connection.setLocalDescription(answer);
      await update(callRef, { answer: { type: answer.type, sdp: answer.sdp }, status: 'connected' });
    } catch { await cleanup(); setState('failed'); }
  }, [cleanup, incoming, preparePeer, uid]);

  const decline = useCallback(async () => { if (incoming) { await remove(ref(rtdb(), `calls/${incoming.id}`)); if (uid) await remove(ref(rtdb(), `incomingCalls/${uid}/${incoming.id}`)); } setIncoming(null); }, [incoming, uid]);
  const end = useCallback(async () => { if (callIdRef.current) await update(ref(rtdb(), `calls/${callIdRef.current}`), { status: 'ended' }); await cleanup(); }, [cleanup]);
  const toggleMute = useCallback(() => { const next = !muted; streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next; }); setMuted(next); }, [muted]);

  return { state, incoming, muted, metrics, remoteAudioRef, start, accept, decline, end, toggleMute };
}