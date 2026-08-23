/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
/**
 * Shared WebAudio chat sounds (dual-oscillator envelopes — soft and pleasant).
 * AudioContext is created lazily and unlocked on the first user interaction,
 * which browsers require before playback (including inside iframes).
 */
let ctx: AudioContext | null = null;
let unlocked = false;

function getCtx(): AudioContext | null {
  try {
    if (typeof window === 'undefined') return null;
    if (!ctx) {
      const Ctor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    return ctx;
  } catch {
    return null;
  }
}

/** Call from any pointerdown/keydown once to satisfy autoplay policies. */
export function unlockAudio(): void {
  if (unlocked) return;
  const c = getCtx();
  if (!c) return;
  unlocked = true;
  // A silent 1-frame buffer guarantees the context is running.
  try {
    const buffer = c.createBuffer(1, 1, 22050);
    const source = c.createBufferSource();
    source.buffer = buffer;
    source.connect(c.destination);
    source.start(0);
  } catch {
    /* ignore */
  }
}

export function isAudioUnlocked(): boolean {
  return unlocked;
}

export type ChatSound = 'sent' | 'received' | 'alert';

/** Play a short, comfortable beep. */
export function playBeep(type: ChatSound = 'sent'): void {
  try {
    if (!unlocked) return;
    const c = getCtx();
    if (!c) return;
    const now = c.currentTime;

    const master = c.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.connect(c.destination);

    const osc1 = c.createOscillator();
    osc1.type = 'sine';
    const osc2 = c.createOscillator();
    osc2.type = 'triangle';

    if (type === 'sent') {
      osc1.frequency.setValueAtTime(880, now);
      osc1.frequency.exponentialRampToValueAtTime(1400, now + 0.13);
      osc2.frequency.setValueAtTime(1320, now);
      osc2.frequency.exponentialRampToValueAtTime(1760, now + 0.13);
      master.gain.exponentialRampToValueAtTime(0.14, now + 0.015);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    } else if (type === 'received') {
      osc1.frequency.setValueAtTime(660, now);
      osc1.frequency.exponentialRampToValueAtTime(880, now + 0.16);
      osc2.frequency.setValueAtTime(990, now);
      osc2.frequency.exponentialRampToValueAtTime(1200, now + 0.16);
      master.gain.exponentialRampToValueAtTime(0.11, now + 0.02);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
    } else {
      // alert: gentle two-tone chime for notifications
      osc1.frequency.setValueAtTime(523.25, now);
      osc1.frequency.setValueAtTime(523.25, now + 0.12);
      osc2.frequency.setValueAtTime(659.25, now + 0.12);
      osc2.frequency.exponentialRampToValueAtTime(783.99, now + 0.24);
      master.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
      master.gain.setValueAtTime(0.12, now + 0.11);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
    }

    const gain2 = c.createGain();
    gain2.gain.value = 0.3;
    osc2.connect(gain2).connect(master);
    osc1.connect(master);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.5);
    osc2.stop(now + 0.5);
  } catch {
    /* silent fail */
  }
}
