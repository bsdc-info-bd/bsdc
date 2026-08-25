import { useEffect } from 'react';
import { Mic, MicOff, Phone, PhoneOff, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/stores/authStore';
import { useVoiceCall } from '@/hooks/useVoiceCall';
import { startRingtone, stopRingtone } from '@/lib/chatSounds';
import { showNativeNotification } from '@/lib/pushNotifications';

export function GlobalVoiceCallAlert() {
  const uid = useAuthStore((s) => s.profile?.uid || null);
  const call = useVoiceCall(uid, null);

  useEffect(() => {
    if (!call.incoming) return;
    const stop = startRingtone();
    void showNativeNotification({
      title: 'Incoming BSDC voice call',
      body: `${call.incoming.caller.displayName || 'A BSDC member'} is calling you`,
      tag: `bsdc-call-${call.incoming.id}`,
      url: '/messages',
    });
    return stop;
  }, [call.incoming]);

  useEffect(() => {
    if (!call.incoming && call.state === 'idle') stopRingtone();
  }, [call.incoming, call.state]);

  if (!call.incoming && call.state === 'idle') return <audio ref={call.remoteAudioRef} autoPlay playsInline className="hidden" aria-hidden="true" />;

  return (
    <>
      <audio ref={call.remoteAudioRef} autoPlay playsInline className="hidden" aria-hidden="true" />
      <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/35 p-3 backdrop-blur-sm sm:items-center">
        <section className="w-full max-w-sm rounded-3xl border border-white/20 bg-white p-6 text-center shadow-2xl dark:bg-surface-dark" role="alertdialog" aria-modal="true" aria-label="Voice call">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-brand-600 dark:bg-brand-950/60 dark:text-brand-300"><Volume2 className="h-7 w-7 animate-pulse" aria-hidden /></div>
          <p className="mt-4 text-xs font-bold uppercase tracking-wider text-brand-600 dark:text-brand-400">BSDC voice call</p>
          <h2 className="mt-1 truncate text-xl font-extrabold">{call.incoming?.caller.displayName || 'Incoming call'}</h2>
          <p className="mt-1 text-sm capitalize text-neutral-500">{call.state === 'idle' ? 'Incoming call' : call.state}</p>
          {call.incoming ? <div className="mt-6 flex justify-center gap-3"><Button className="bg-green-600 hover:bg-green-700" onClick={() => { stopRingtone(); void call.accept(); }} icon={<Phone className="h-4 w-4" aria-hidden />}>Accept</Button><Button variant="outline" onClick={() => { stopRingtone(); void call.decline(); }} icon={<PhoneOff className="h-4 w-4" aria-hidden />}>Decline</Button></div> : <div className="mt-6 flex flex-wrap justify-center gap-3"><span className="w-full text-xs text-neutral-500">{call.metrics.quality} connection · {call.metrics.rttMs} ms RTT</span><Button variant="outline" onClick={call.toggleMute} icon={call.muted ? <MicOff className="h-4 w-4" aria-hidden /> : <Mic className="h-4 w-4" aria-hidden />}>{call.muted ? 'Unmute' : 'Mute'}</Button><Button onClick={() => void call.end()} icon={<PhoneOff className="h-4 w-4" aria-hidden />}>End call</Button></div>}
        </section>
      </div>
    </>
  );
}