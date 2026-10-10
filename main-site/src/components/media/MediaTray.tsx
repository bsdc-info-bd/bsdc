import { ArrowLeft, ArrowRight, ImagePlus, Loader2, Pencil, RotateCw, Type, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, IconButton, ProgressBar, TextField } from '@/design-system';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/lib/format';
import { isEditableType } from '@/lib/media/edit';
import type { Attachment, AttachmentsController } from './use-attachments';

export interface MediaTrayProps {
  controller: AttachmentsController;
  /** Opens the editor for one picture. */
  onEdit: (attachment: Attachment) => void;
  /** Noun used in the count line: "pictures", "files". */
  noun?: string;
}

/** Alt text is stored in a column that holds 280 characters. */
const ALT_LIMIT = 280;

/**
 * The pictures on the way into a post.
 *
 * Each one shows what it is doing: waiting, the percentage it has reached, or
 * why it stopped. Nothing is silent, because a silent attachment is
 * indistinguishable from a button that does not work — which is exactly what
 * the composer looked like before.
 *
 * Order is the member's. Tiles can be dragged, and the same reordering is
 * available as two buttons, because a drag is not an interface anyone can use
 * with a keyboard or a screen reader.
 */
export function MediaTray({ controller, onEdit, noun }: MediaTrayProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const [altFor, setAltFor] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const altField = useRef<HTMLInputElement>(null);

  // Focus follows the field the member just asked for. `autoFocus` would also
  // fire on a re-render that had nothing to do with opening it.
  useEffect(() => {
    if (altFor !== null) altField.current?.focus();
  }, [altFor]);

  const { attachments } = controller;
  if (attachments.length === 0) return null;

  const editing = attachments.find((item) => item.id === altFor) ?? null;
  const count = attachments.length;
  const word = noun ?? t('media.tray.pictures');

  return (
    <div className="rounded-xl border border-border bg-surface-2/50 p-2">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-2xs font-semibold text-muted" aria-live="polite">
          {t('media.tray.count', { count, noun: word })}
          {controller.pending.length > 0
            ? ` · ${t('media.tray.uploading', { count: controller.pending.length })}`
            : ''}
        </p>
        {controller.failed.length > 0 ? (
          <Button
            size="sm"
            variant="outline"
            iconStart={<RotateCw size={14} />}
            onClick={controller.retryAll}
          >
            {t('media.tray.retryAll', { count: controller.failed.length })}
          </Button>
        ) : null}
      </div>

      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {attachments.map((item, index) => {
          const source = item.previewUrl || item.thumbUrl || item.url;
          const busy = item.status === 'queued' || item.status === 'uploading';
          const broken = item.status === 'failed';
          const editable = item.file !== null && isEditableType(item.file.type);
          return (
            <li
              key={item.id}
              draggable
              onDragStart={(event) => {
                setDraggingId(item.id);
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', item.id);
              }}
              onDragEnd={() => {
                setDraggingId(null);
                controller.dismissNotice();
              }}
              onDragOver={(event) => {
                // A tile is a drop target for another tile, not for a file: the
                // window handler owns files, and letting both act would attach
                // the picture twice.
                if (!draggingId || draggingId === item.id) return;
                event.preventDefault();
                event.stopPropagation();
                event.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(event) => {
                if (!draggingId || draggingId === item.id) return;
                event.preventDefault();
                event.stopPropagation();
                controller.moveTo(draggingId, index);
                setDraggingId(null);
              }}
              className={cn(
                'group relative overflow-hidden rounded-lg border bg-surface',
                broken ? 'border-danger' : 'border-border',
                draggingId === item.id && 'opacity-40',
              )}
            >
              <div className="relative aspect-square w-full">
                {source.length > 0 ? (
                  <img
                    src={source}
                    // Never an empty alt: this is the member's own picture, not
                    // decoration, and an unnamed preview is invisible to a
                    // screen reader — which is how a broken attach goes unnoticed.
                    alt={item.altText.length > 0 ? item.altText : t('media.tray.preview')}
                    className={cn('h-full w-full object-cover', broken && 'opacity-45 grayscale')}
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-muted">
                    <ImagePlus size={20} aria-hidden="true" />
                  </span>
                )}

                <span className="absolute start-1 top-1 rounded-full bg-green-950/70 px-1.5 py-0.5 text-2xs font-semibold text-white tabular-nums">
                  {index + 1}
                </span>

                {busy ? (
                  <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-green-950/55 text-white">
                    {item.status === 'uploading' ? (
                      <>
                        <span className="text-sm font-semibold tabular-nums">{item.progress}%</span>
                        <ProgressBar
                          value={item.progress}
                          label={t('media.tray.uploadProgress')}
                          className="w-3/4 bg-white/25 [&>div]:bg-white"
                        />
                      </>
                    ) : (
                      <>
                        <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                        <span className="text-2xs">{t('media.tray.queued')}</span>
                      </>
                    )}
                  </span>
                ) : null}

                {broken ? (
                  <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-danger/70 p-2 text-center text-white">
                    <span className="text-2xs font-semibold">
                      {t(item.errorKey ?? 'media.errors.failed')}
                    </span>
                    <button
                      type="button"
                      onClick={() => controller.retry(item.id)}
                      className="fab-tap inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-2xs font-semibold text-danger"
                    >
                      <RotateCw size={12} aria-hidden="true" />
                      {t('common.retry')}
                    </button>
                  </span>
                ) : null}

                {!busy && !broken ? (
                  <span className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-green-950/85 to-transparent p-1 opacity-0 transition-opacity duration-150 ease-app focus-within:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 max-sm:opacity-100">
                    <span className="flex items-center gap-0.5">
                      <IconButton
                        label={t('media.tray.moveEarlier')}
                        icon={<ArrowLeft size={14} />}
                        size="sm"
                        className="h-8 w-8 text-white hover:bg-white/20 disabled:opacity-35"
                        disabled={index === 0}
                        onClick={() => controller.move(item.id, -1)}
                      />
                      <IconButton
                        label={t('media.tray.moveLater')}
                        icon={<ArrowRight size={14} />}
                        size="sm"
                        className="h-8 w-8 text-white hover:bg-white/20 disabled:opacity-35"
                        disabled={index === attachments.length - 1}
                        onClick={() => controller.move(item.id, 1)}
                      />
                    </span>
                    <span className="flex items-center gap-0.5">
                      <IconButton
                        label={t('media.tray.describe')}
                        icon={<Type size={14} />}
                        size="sm"
                        className={cn(
                          'h-8 w-8 hover:bg-white/20',
                          altFor === item.id ? 'bg-white/25 text-white' : 'text-white',
                        )}
                        onClick={() => setAltFor(altFor === item.id ? null : item.id)}
                        aria-pressed={altFor === item.id}
                      />
                      {editable ? (
                        <IconButton
                          label={t('media.tray.edit')}
                          icon={<Pencil size={14} />}
                          size="sm"
                          className="h-8 w-8 text-white hover:bg-white/20"
                          onClick={() => onEdit(item)}
                        />
                      ) : null}
                      <IconButton
                        label={t('media.tray.remove')}
                        icon={<X size={14} />}
                        size="sm"
                        className="h-8 w-8 text-white hover:bg-danger"
                        onClick={() => {
                          if (altFor === item.id) setAltFor(null);
                          controller.remove(item.id);
                        }}
                      />
                    </span>
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      {editing ? (
        <div className="mt-2 rounded-lg border border-border bg-surface p-2">
          <TextField
            ref={altField}
            label={t('media.alt.label')}
            hint={t('media.alt.hint')}
            value={editing.altText}
            maxLength={ALT_LIMIT}
            onChange={(event) => controller.setAltText(editing.id, event.target.value)}
            onBlur={() => setAltFor(null)}
          />
          <p className="mt-1 text-2xs text-muted">
            {editing.width && editing.height ? `${editing.width} × ${editing.height} · ` : ''}
            {editing.file
              ? formatBytes(editing.file.size, language)
              : t('media.tray.alreadyUploaded')}
            {` · ${editing.altText.length}/${ALT_LIMIT}`}
          </p>
        </div>
      ) : null}
    </div>
  );
}
