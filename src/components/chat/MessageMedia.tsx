/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
/** Voice note player, PDF/file attachment card and zoomable image for chat bubbles. */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mic, Play, Pause, FileText, Download, ExternalLink, Clock3 } from 'lucide-react';
import type { ChatMessage } from '@/types/chat';
import { formatBytes, formatDuration } from '@/lib/cloudinary-chat';
import { cn } from '@/lib/utils';

/** Standard HTML <audio> player styled as a modern voice-note card. */
export function VoiceNotePlayer({ message, mine }: { message: ChatMessage; mine: boolean }) {
  const { t } = useTranslation();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  return (
    <div
      className={cn(
        'mb-1 flex min-w-56 max-w-full items-center gap-2.5 rounded-xl p-2',
        mine ? 'bg-black/15' : 'bg-white/70 dark:bg-black/20',
      )}
      aria-label={t('chat.voiceNote')}
    >
      <button
        type="button"
        onClick={() => {
          const el = audioRef.current;
          if (!el) return;
          if (el.paused) {
            void el.play();
            setPlaying(true);
          } else {
            el.pause();
            setPlaying(false);
          }
        }}
        aria-label={playing ? t('common.close') : t('common.send')}
        className={cn(
          'bsdc-tap flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white shadow-sm transition-transform hover:scale-105',
          mine ? 'bg-white/25' : 'bg-brand-600',
        )}
      >
        {playing ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
      </button>
      <span className="flex h-8 min-w-0 flex-1 items-center gap-[2px] overflow-hidden" aria-hidden>
        {Array.from({ length: 26 }).map((_, i) => {
          const seed = (i * 37) % 11;
          const active = (i / 26) * 100 <= progress;
          return (
            <span
              key={i}
              className={cn('w-[3px] shrink-0 rounded-full transition-colors', mine ? (active ? 'bg-white' : 'bg-white/40') : active ? 'bg-brand-600 dark:bg-brand-400' : 'bg-brand-300/60 dark:bg-brand-800')}
              style={{ height: `${20 + seed * 6}%` }}
            />
          );
        })}
      </span>
      <span className={cn('flex shrink-0 items-center gap-1 font-mono text-[11px] font-bold tabular-nums', mine ? 'text-white/90' : 'text-neutral-500 dark:text-neutral-300')}>
        <Clock3 className="h-3 w-3" aria-hidden />
        {formatDuration(message.audioDuration || 0)}
      </span>
      <audio
        ref={audioRef}
        src={message.audioUrl}
        controls
        preload="metadata"
        className="hidden"
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          if (el.duration > 0) setProgress((el.currentTime / el.duration) * 100);
        }}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
        }}
      >
        <track kind="captions" />
      </audio>
      <span className={cn('hidden shrink-0 text-[10px] font-semibold sm:inline', mine ? 'text-white/60' : 'text-neutral-400')}>
        <Mic className="mr-0.5 inline h-3 w-3" aria-hidden />
        {t('chat.voiceNote')}
      </span>
    </div>
  );
}

/** PDF / file attachment card with download + open actions. */
export function FileCard({ message, mine }: { message: ChatMessage; mine: boolean }) {
  const { t } = useTranslation();
  const isPdf = message.fileType === 'pdf' || message.fileName?.toLowerCase().endsWith('.pdf');
  return (
    <a
      href={message.fileUrl}
      target="_blank"
      rel="noopener noreferrer"
      download={message.fileName || undefined}
      className={cn(
        'group mb-1 flex min-w-56 max-w-full items-center gap-3 rounded-xl p-2.5 transition-transform hover:scale-[1.01]',
        mine ? 'bg-black/15' : 'bg-white/70 dark:bg-black/20',
      )}
      aria-label={`${t('chat.download')} ${message.fileName}`}
    >
      <span
        className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-sm',
          isPdf ? 'bg-red-500' : 'bg-fb-600',
        )}
      >
        <FileText className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-sm font-bold', mine ? 'text-white' : 'text-neutral-900 dark:text-neutral-100')}>
          {message.fileName || 'Document'}
        </span>
        <span className={cn('block text-[11px]', mine ? 'text-white/70' : 'text-neutral-400')}>
          {isPdf ? 'PDF' : 'FILE'} · {formatBytes(message.fileSize)}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <span
          className={cn(
            'rounded-full p-1.5 opacity-80 transition-opacity group-hover:opacity-100',
            mine ? 'bg-white/20 text-white' : 'bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-200',
          )}
          aria-hidden
        >
          <Download className="h-3.5 w-3.5" />
        </span>
        <span
          className={cn(
            'rounded-full p-1.5 opacity-80 transition-opacity group-hover:opacity-100',
            mine ? 'bg-white/20 text-white' : 'bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-200',
          )}
          aria-hidden
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </span>
      </span>
    </a>
  );
}

/** Tap-to-zoom image overlay for photo messages. */
export function ImageWithZoom({ src, mine }: { src: string; mine: boolean }) {
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoom(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoom]);

  return (
    <>
      <button type="button" onClick={() => setZoom(true)} className="mb-1 block overflow-hidden rounded-xl" aria-label="Zoom image">
        <img src={src} alt="Chat image" loading="lazy" className="max-h-64 max-w-full rounded-xl object-cover transition-transform duration-300 hover:scale-[1.02]" />
      </button>
      {zoom ? (
        <div
          className="fixed inset-0 z-[80] flex bsdc-scale-in items-center justify-center bg-black/90 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setZoom(false)}
        >
          <img src={src} alt="Chat image (zoomed)" className={cn('max-h-full max-w-full rounded-xl shadow-2xl', mine && 'ring-2 ring-white/30')} />
          <button type="button" className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white" aria-label="Close" onClick={() => setZoom(false)}>
            ×
          </button>
        </div>
      ) : null}
    </>
  );
}
