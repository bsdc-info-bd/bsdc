import { useCallback, useEffect, useRef, useState } from 'react';
import { onChildAdded, onValue, push, ref, remove, set, update, type DataSnapshot } from 'firebase/database';
import { rtdb } from '@/config/firebase';
import type { ChatParticipant } from '@/types/chat';

export type CallState = 'idle' | 'calling' | 'ringing' | 'connecting' | 'connected' | 'ended' | 'failed';
export interface IncomingCall { id: string; caller: ChatParticipant; createdAt: number }

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }],
};

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
  const cleanupRef = useRef<(() => void) | null>(null);

  const cleanup = useCallback(async (removeCall = true) => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (removeCall && callIdRef.current) {
      const callId = callIdRef.current;
      await remove(ref(rtdb(), `calls/${callId}`)).catch(() => undefined);
      if (peer) await remove(ref(rtdb(), `incomingCalls/${peer.uid}/${callId}`)).catch(() => undefined);
    }
    callIdRef.current = null;
    setMuted(false);
    setState('idle');
  }, [peer]);

  useEffect(() => () => { void cleanup(); }, [cleanup]);

  useEffect(() => {
    if (!uid) return;
    const callsRef = ref(rtdb(), `incomingCalls/${uid}`);
    return onChildAdded(callsRef, (snapshot) => {
      const call = snapshotValue<IncomingCall>(snapshot);
      if (call && call.id && call.createdAt > Date.now() - 60_000 && state === 'idle') setIncoming(call);
    });
  }, [uid, state]);

  const preparePeer = useCallback(async (callId: string) => {
    if (!uid || !peer) throw new Error('Call participant unavailable');
    const connection = new RTCPeerConnection(ICE_SERVERS);
    peerRef.current = connection;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1, sampleRate: 48000 } });
    streamRef.current = stream;
    stream.getTracks().forEach((track) => connection.addTrack(track, stream));
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
    const ownCandidates = ref(rtdb(), `calls/${callId}/candidates/${uid}`);
    const otherCandidates = ref(rtdb(), `calls/${callId}/candidates/${peer.uid}`);
    const unsubscribeCandidates = onChildAdded(otherCandidates, (snapshot) => {
      const candidate = snapshotValue<RTCIceCandidateInit>(snapshot);
      if (candidate) void connection.addIceCandidate(candidate).catch(() => undefined);
    });
    connection.onicecandidate = (event) => { if (event.candidate) void set(push(ownCandidates), event.candidate.toJSON()); };
    cleanupRef.current = () => unsubscribeCandidates();
    return connection;
  }, [peer, uid]);

  const start = useCallback(async () => {
    if (!uid || !peer || state !== 'idle' || !navigator.mediaDevices?.getUserMedia) return;
    setState('calling');
    try {
      const callRef = push(ref(rtdb(), 'calls'));
      const callId = callRef.key;
      if (!callId) throw new Error('Could not create call');
      callIdRef.current = callId;
      const connection = await preparePeer(callId);
      const offer = await connection.createOffer({ offerToReceiveAudio: true });
      await connection.setLocalDescription(offer);
      await set(callRef, { id: callId, caller: { uid, displayName: 'BSDC member' }, callerId: uid, calleeId: peer.uid, status: 'ringing', offer: { type: offer.type, sdp: offer.sdp }, createdAt: Date.now() });
      await set(ref(rtdb(), `incomingCalls/${peer.uid}/${callId}`), { id: callId, caller: { uid, displayName: 'BSDC member', username: '', avatar: '', role: 'member', joinedAt: Date.now() }, createdAt: Date.now() });
      const unsubscribe = onValue(callRef, (snapshot) => { const value = snapshotValue<{ answer?: RTCSessionDescriptionInit; status?: string }>(snapshot); if (value?.answer && !connection.currentRemoteDescription) void connection.setRemoteDescription(value.answer); if (value?.status === 'ended') void cleanup(); });
      cleanupRef.current = () => { unsubscribe(); };
    } catch { await cleanup(); setState('failed'); }
  }, [cleanup, peer, preparePeer, state, uid]);

  const accept = useCallback(async () => {
    if (!incoming || !uid || !peer) return;
    const callId = incoming.id;
    setIncoming(null); setState('connecting'); callIdRef.current = callId;
    try {
      const callRef = ref(rtdb(), `calls/${callId}`);
      const snapshot = await new Promise<DataSnapshot>((resolve) => onValue(callRef, resolve, { onlyOnce: true }));
      const call = snapshotValue<{ offer: RTCSessionDescriptionInit }>(snapshot);
      if (!call?.offer) throw new Error('Call offer unavailable');
      const connection = await preparePeer(callId);
      await connection.setRemoteDescription(call.offer);
      const answer = await connection.createAnswer(); await connection.setLocalDescription(answer);
      await update(callRef, { answer: { type: answer.type, sdp: answer.sdp }, status: 'connected' });
    } catch { await cleanup(); setState('failed'); }
  }, [cleanup, incoming, peer, preparePeer, uid]);

  const decline = useCallback(async () => { if (incoming) { await remove(ref(rtdb(), `calls/${incoming.id}`)); if (peer) await remove(ref(rtdb(), `incomingCalls/${peer.uid}/${incoming.id}`)); } setIncoming(null); }, [incoming, peer]);
  const end = useCallback(async () => { if (callIdRef.current) await update(ref(rtdb(), `calls/${callIdRef.current}`), { status: 'ended' }); await cleanup(); }, [cleanup]);
  const toggleMute = useCallback(() => { const next = !muted; streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next; }); setMuted(next); }, [muted]);

  return { state, incoming, muted, remoteAudioRef, start, accept, decline, end, toggleMute };
}