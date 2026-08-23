/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
/** Recording UI: mic button (tap/hold) and the animated full-width recording overlay. */
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mic, Trash2, Send } from 'lucide-react';
import { formatDuration } from '@/lib/cloudinary-chat';
import { cn } from '@/lib/utils';
import type { RecorderStatus } from './useVoiceRecorder';

/* ------------------------------------------------------------- UI parts */

/** The composer mic button: tap toggles recording, press-and-hold records until release. */
export function MicButton({
  status,
  onStart,
  onStop,
  onWarmUp,
}: {
  status: RecorderStatus;
  onStart: () => void;
  onStop: () => void;
  onWarmUp?: () => void;
}) {
  const recording = status === 'recording';
  const holdTimer = useRef<number | null>(null);
  const heldRef = useRef(false);

  function down() {
    // Acquire the mic INSIDE the gesture (iOS/iframe requirement).
    onWarmUp?.();
    heldRef.current = false;
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = null;
      if (!recording) {
        heldRef.current = true; // hold-mode: release will stop + send
        onStart();
      }
    }, 260);
  }

  function up() {
    if (holdTimer.current !== null) {
      // Released before the hold threshold — treat as a tap toggle.
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
      if (recording) onStop();
      else onStart();
      return;
    }
    if (heldRef.current && recording) {
      heldRef.current = false;
      onStop(); // hold-mode release: stop and send
    }
  }

  function cancelHold() {
    if (holdTimer.current !== null) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    heldRef.current = false;
  }

  return (
    <button
      type="button"
      onPointerDown={down}
      onPointerUp={up}
      onPointerLeave={cancelHold}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          if (recording) onStop();
          else onStart();
        }
      }}
      aria-label={recording ? 'Stop recording' : 'Record voice note — tap to start, hold to record'}
      aria-pressed={recording}
      title={recording ? 'Stop' : 'Tap to start · hold to record'}
      className={cn(
        'bsdc-tap bsdc-hover-lift relative shrink-0 touch-none rounded-full p-2 text-neutral-500 transition-colors sm:p-2.5',
        'hover:bg-neutral-100 hover:text-brand-600 dark:hover:bg-surface-dark-raised',
        recording && 'bg-red-50 text-red-500 dark:bg-red-950/50 dark:text-red-400',
        status === 'requesting' && 'animate-pulse',
      )}
    >
      {recording ? (
        <>
          <span className="absolute inset-0 animate-ping rounded-full bg-red-400/30" aria-hidden />
          <span className="relative flex h-5 w-5 items-center justify-center">
            <span className="h-2.5 w-2.5 rounded-sm bg-red-500" aria-hidden />
          </span>
        </>
      ) : (
        <Mic className="h-5 w-5" aria-hidden />
      )}
    </button>
  );
}

/** Full-width recording overlay: waveform, timer, slide/tap-to-cancel, send. */
export function RecordingOverlay({
  levels,
  elapsed,
  onCancel,
  onStop,
}: {
  levels: number[];
  elapsed: number;
  onCancel: () => void;
  onStop: () => void;
}) {
  const { t } = useTranslation();
  const [dragX, setDragX] = useState(0);
  const dragStartRef = useRef<number | null>(null);
  const cancelThreshold = 96;

  return (
    <div
      className="bsdc-scale-in bsdc-pb-safe flex w-full touch-none select-none items-center gap-2 px-1 py-1.5"
      role="group"
      aria-label={t('chat.recording')}
      onPointerDown={(e) => {
        dragStartRef.current = e.clientX;
      }}
      onPointerMove={(e) => {
        if (dragStartRef.current === null) return;
        setDragX(Math.min(0, e.clientX - dragStartRef.current));
      }}
      onPointerUp={() => {
        if (dragX <= -cancelThreshold) {
          setDragX(0);
          dragStartRef.current = null;
          onCancel();
        } else {
          setDragX(0);
          dragStartRef.current = null;
        }
      }}
    >
      <button
        type="button"
        onClick={onCancel}
        aria-label={t('common.cancel')}
        className="bsdc-tap shrink-0 rounded-full bg-red-50 p-2.5 text-red-500 transition-transform hover:scale-105 dark:bg-red-950/50 dark:text-red-400"
        style={{ transform: dragX < -20 ? `translateX(${dragX / 2}px)` : undefined }}
      >
        <Trash2 className="h-5 w-5" aria-hidden />
      </button>

      <div
        className="relative flex h-11 min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-full border border-red-200 bg-red-50/70 px-4 dark:border-red-900 dark:bg-red-950/30"
        style={{ transform: dragX < -20 ? `translateX(${dragX / 4}px)` : undefined, opacity: 1 + Math.max(-0.5, dragX / 200) }}
      >
        <span className="relative flex h-3 w-3 shrink-0" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
        </span>
        <span className="shrink-0 font-mono text-xs font-bold tabular-nums text-red-600 dark:text-red-300">
          {formatDuration(elapsed)}
        </span>
        <span className="flex h-8 min-w-0 flex-1 items-center justify-end gap-[2px] overflow-hidden" aria-hidden>
          {levels.slice(-24).map((level, i) => (
            <span
              key={i}
              className="w-[3px] shrink-0 rounded-full bg-red-400/80 transition-[height] duration-75 dark:bg-red-500/70"
              style={{ height: `${Math.max(8, level * 100)}%` }}
            />
          ))}
        </span>
        <span className="hidden shrink-0 text-[10px] font-semibold text-red-400 min-[380px]:inline">
          {t('chat.slideToCancel')}
        </span>
      </div>

      <button
        type="button"
        onClick={onStop}
        aria-label={t('common.send')}
        className="bsdc-tap bsdc-send-btn shrink-0 rounded-full p-2.5 text-white transition-transform hover:scale-105"
      >
        <Send className="h-5 w-5" aria-hidden />
      </button>
    </div>
  );
}

