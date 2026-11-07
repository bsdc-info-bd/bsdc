import {
  AlertCircle,
  Check,
  CheckCheck,
  Clock,
  Pencil,
  Pin,
  Reply,
  Smile,
  Star,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Avatar, Button } from '@/design-system';
import { cn } from '@/lib/cn';
import type { Language } from '@/i18n';
import { formatAbsoluteDate, formatNumber, formatRelativeTime } from '@/lib/format';
import { REACTION_CHOICES, previewLine } from '@/lib/messaging/message-text';
import type { Message } from '@/lib/messaging/message-types';
import { MessageBody } from './MessageBody';

export interface MessageBubbleProps {
  message: Message;
  mine: boolean;
  /** The first line of a run: the only one that shows an avatar and a name. */
  showAuthor: boolean;
  highlight: string;
  memberName: (uid: string | null) => string;
  memberAvatar: (uid: string | null) => string;
  /** True for a moment after the thread jumped to this line. */
  flash?: boolean;
  onReply: (message: Message) => void;
  onEdit: (message: Message) => void;
  onDelete: (message: Message) => void;
  onReact: (message: Message, reaction: string) => void;
  onStar: (message: Message) => void;
  onPin: (message: Message) => void;
  onJump: (messageId: string) => void;
  onRetry: (message: Message) => void;
  onDiscard: (message: Message) => void;
}

const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\uFE0F|\u200D|\s){1,12}$/u;

function messageTime(iso: string, language: Language): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(language === 'bn' ? 'bn-BD' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** One line of the thread: quote, body, reactions, receipt and its actions. */
export function MessageBubble({
  message,
  mine,
  showAuthor,
  highlight,
  memberName,
  memberAvatar,
  flash = false,
  onReply,
  onEdit,
  onDelete,
  onReact,
  onStar,
  onPin,
  onJump,
  onRetry,
  onDiscard,
}: MessageBubbleProps) {
  const { t, i18n } = useTranslation();
  const language: Language = i18n.language === 'en' ? 'en' : 'bn';
  const [picker, setPicker] = useState(false);
  const [menu, setMenu] = useState(false);
  const [placement, setPlacement] = useState({ down: false, left: true, maxHeight: 320 });
  const wrapper = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!picker && !menu) return;
    const close = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) {
        setPicker(false);
        setMenu(false);
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPicker(false);
        setMenu(false);
      }
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [picker, menu]);

  function placePopup(button: HTMLButtonElement, width: number): void {
    const anchor = button.getBoundingClientRect();
    const scroller = button.closest('[data-message-scroller]')?.getBoundingClientRect();
    const top = Math.max(0, scroller?.top ?? 0);
    const bottom = Math.min(window.innerHeight, scroller?.bottom ?? window.innerHeight);
    const left = Math.max(0, scroller?.left ?? 0);
    const right = Math.min(window.innerWidth, scroller?.right ?? window.innerWidth);
    const above = Math.max(0, anchor.top - top - 4);
    const below = Math.max(0, bottom - anchor.bottom - 4);
    const spaceRight = right - anchor.left;
    const spaceLeft = anchor.right - left;
    const down = below >= above;
    setPlacement({
      down,
      left: spaceRight >= width || spaceRight >= spaceLeft,
      maxHeight: Math.floor(down ? below : above),
    });
  }

  const emojiOnly = message.body.length > 0 && EMOJI_ONLY.test(message.body.trim());
  const reactions = Object.entries(message.reactions).filter(([, total]) => total > 0);

  return (
    <div
      ref={wrapper}
      id={`message-${message.id}`}
      className={cn(
        'group motion-safe:animate-fade-up flex scroll-mt-24 gap-2 rounded-2xl transition-colors',
        mine && 'flex-row-reverse',
        flash && 'bg-amber-200/40',
      )}
    >
      {showAuthor ? (
        <Avatar
          src={memberAvatar(message.senderUid)}
          name={memberName(message.senderUid)}
          size="sm"
        />
      ) : (
        <span className="w-8 shrink-0" aria-hidden="true" />
      )}

      <div className={cn('flex min-w-0 flex-col gap-1', mine && 'items-end')}>
        {showAuthor ? (
          <span className="flex items-center gap-1 text-2xs text-muted">
            <span className="font-semibold">
              {mine ? t('chat.you') : memberName(message.senderUid)}
            </span>
            <span aria-hidden="true">·</span>
            <time
              dateTime={message.createdAt}
              title={formatAbsoluteDate(new Date(message.createdAt), language)}
            >
              {messageTime(message.createdAt, language)}
            </time>
            {message.editedAt !== null ? <span>· {t('messages.edited')}</span> : null}
            {message.pinned ? <Pin size={11} aria-label={t('chat.pin')} /> : null}
            {message.starred ? <Star size={11} aria-label={t('chat.savedMessages')} /> : null}
          </span>
        ) : null}

        <div className={cn('flex max-w-[52ch] items-end gap-1', mine && 'flex-row-reverse')}>
          <div
            className={cn(
              'relative min-w-0 break-words rounded-2xl px-3.5 py-2.5 text-sm shadow-card [overflow-wrap:anywhere]',
              mine ? 'rounded-tr-md bg-chat-outgoing text-white' : 'rounded-tl-md bg-bg text-text',
              emojiOnly && 'bg-transparent px-1 py-0 text-3xl text-text shadow-none',
            )}
          >
            {message.replyTo !== null && message.deletedAt === null ? (
              <button
                type="button"
                onClick={() => onJump(message.replyTo ?? '')}
                className={cn(
                  'fab-tap mb-1 block w-full rounded-lg border-s-2 px-2 py-1 text-start text-xs',
                  mine ? 'border-white/60 bg-black/15' : 'border-green-700 bg-surface',
                )}
              >
                <span className="block font-semibold">{memberName(message.replySender)}</span>
                <span className="fab-truncate block opacity-80">
                  {previewLine(message.replyBody ?? '', 80)}
                </span>
              </button>
            ) : null}

            <MessageBody message={message} highlight={highlight} mine={mine} />

            <span className="mt-1 flex items-center justify-end gap-1 text-2xs opacity-80">
              {message.editedAt !== null && !showAuthor ? (
                <span>{t('messages.edited')}</span>
              ) : null}
              {mine ? (
                message.clientState === 'failed' ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <AlertCircle size={12} aria-hidden="true" />
                    <span>{t('chat.deliver.unconfirmed')}</span>
                    <button
                      type="button"
                      onClick={() => onRetry(message)}
                      className="fab-tap underline"
                    >
                      {t('chat.deliver.retry')}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDiscard(message)}
                      className="fab-tap underline"
                    >
                      {t('chat.deliver.discard')}
                    </button>
                  </span>
                ) : message.clientState === 'pending' ? (
                  <Clock size={12} aria-label={t('chat.deliver.sending')} />
                ) : message.readBy.length > 0 ? (
                  <CheckCheck
                    size={12}
                    aria-label={t('chat.deliver.read', {
                      n: formatNumber(message.readBy.length, language),
                    })}
                  />
                ) : (
                  <Check size={12} aria-label={t('chat.deliver.sent')} />
                )
              ) : null}
            </span>
          </div>

          {/* The per-line actions. Revealed on hover, on focus and on tap. */}
          <div
            className={cn(
              'flex shrink-0 items-center gap-0.5 transition-opacity sm:opacity-0 sm:focus-within:opacity-100 sm:group-hover:opacity-100 [@media(hover:none)]:opacity-100',
              message.clientState !== undefined && 'hidden',
            )}
          >
            <Button
              variant="ghost"
              size="sm"
              className="hidden sm:inline-flex"
              aria-label={t('chat.reply')}
              onClick={() => onReply(message)}
            >
              <Reply size={13} aria-hidden="true" />
            </Button>
            <div className="relative hidden sm:block">
              <Button
                variant="ghost"
                size="sm"
                aria-haspopup="menu"
                aria-expanded={picker}
                aria-label={t('chat.emoji')}
                onClick={(event) => {
                  placePopup(event.currentTarget, 300);
                  setPicker((open) => !open);
                  setMenu(false);
                }}
              >
                <Smile size={16} aria-hidden="true" />
              </Button>
              {picker ? (
                <div
                  className={cn(
                    'absolute z-20 flex gap-1 rounded-full border border-border bg-bg p-1 shadow-raised',
                    placement.down ? 'top-full mt-1' : 'bottom-full mb-1',
                    placement.left ? 'left-0' : 'right-0',
                  )}
                >
                  {REACTION_CHOICES.map((reaction) => (
                    <button
                      key={reaction}
                      type="button"
                      className="fab-tap rounded-full px-1.5 py-0.5 text-base hover:bg-surface-2"
                      aria-label={reaction}
                      onClick={() => {
                        onReact(message, reaction);
                        setPicker(false);
                      }}
                    >
                      {reaction}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                aria-haspopup="menu"
                aria-expanded={menu}
                aria-label={t('chat.more')}
                onClick={(event) => {
                  placePopup(event.currentTarget, 176);
                  setMenu((open) => !open);
                  setPicker(false);
                }}
              >
                <span aria-hidden="true">⋯</span>
              </Button>
              {menu ? (
                <ul
                  role="menu"
                  className={cn(
                    'motion-safe:animate-fade-up absolute z-20 w-44 overflow-y-auto rounded-xl border border-border bg-bg py-1 text-sm shadow-raised',
                    placement.down ? 'top-full mt-1' : 'bottom-full mb-1',
                    placement.left ? 'left-0' : 'right-0',
                  )}
                  style={{ maxHeight: placement.maxHeight }}
                >
                  {message.deletedAt === null ? (
                    <li className="sm:hidden">
                      <button
                        type="button"
                        role="menuitem"
                        className="fab-tap flex w-full items-center gap-2 px-3 py-1.5 text-start hover:bg-surface-2"
                        onClick={() => {
                          onReply(message);
                          setMenu(false);
                        }}
                      >
                        <Reply size={13} aria-hidden="true" /> {t('chat.reply')}
                      </button>
                    </li>
                  ) : null}
                  {message.deletedAt === null ? (
                    <li className="border-b border-border p-1 sm:hidden">
                      <div
                        className="flex flex-wrap justify-center gap-1"
                        aria-label={t('chat.emoji')}
                      >
                        {REACTION_CHOICES.map((reaction) => (
                          <button
                            key={reaction}
                            type="button"
                            className="fab-tap rounded-lg p-1 hover:bg-surface-2"
                            aria-label={reaction}
                            onClick={() => {
                              onReact(message, reaction);
                              setMenu(false);
                            }}
                          >
                            {reaction}
                          </button>
                        ))}
                      </div>
                    </li>
                  ) : null}
                  {message.deletedAt === null ? (
                    <li>
                      <button
                        type="button"
                        role="menuitem"
                        className="fab-tap flex w-full items-center gap-2 px-3 py-1.5 text-start hover:bg-surface-2"
                        onClick={() => {
                          if (navigator.clipboard === undefined) {
                            toast.error(t('chat.copyUnavailable'));
                          } else {
                            void navigator.clipboard.writeText(message.body).then(
                              () => toast.success(t('common.copied')),
                              () => toast.error(t('chat.copyUnavailable')),
                            );
                          }
                          setMenu(false);
                        }}
                      >
                        {t('chat.copy')}
                      </button>
                    </li>
                  ) : null}
                  <li>
                    <button
                      type="button"
                      role="menuitem"
                      className="fab-tap flex w-full items-center gap-2 px-3 py-1.5 text-start hover:bg-surface-2"
                      onClick={() => {
                        onStar(message);
                        setMenu(false);
                      }}
                    >
                      <Star size={13} aria-hidden="true" />
                      {message.starred ? t('chat.unstar') : t('chat.star')}
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      role="menuitem"
                      className="fab-tap flex w-full items-center gap-2 px-3 py-1.5 text-start hover:bg-surface-2"
                      onClick={() => {
                        onPin(message);
                        setMenu(false);
                      }}
                    >
                      <Pin size={13} aria-hidden="true" />
                      {message.pinned ? t('chat.unpin') : t('chat.pin')}
                    </button>
                  </li>
                  {mine && message.deletedAt === null ? (
                    <li>
                      <button
                        type="button"
                        role="menuitem"
                        className="fab-tap flex w-full items-center gap-2 px-3 py-1.5 text-start hover:bg-surface-2"
                        onClick={() => {
                          onEdit(message);
                          setMenu(false);
                        }}
                      >
                        <Pencil size={13} aria-hidden="true" />
                        {t('chat.edit')}
                      </button>
                    </li>
                  ) : null}
                  {mine && message.deletedAt === null ? (
                    <li>
                      <button
                        type="button"
                        role="menuitem"
                        className="fab-tap flex w-full items-center gap-2 px-3 py-1.5 text-start text-danger hover:bg-surface-2"
                        onClick={() => {
                          onDelete(message);
                          setMenu(false);
                        }}
                      >
                        <Trash2 size={13} aria-hidden="true" />
                        {t('chat.deleteMessage')}
                      </button>
                    </li>
                  ) : null}
                </ul>
              ) : null}
            </div>
          </div>
        </div>

        {reactions.length > 0 ? (
          <ul className="flex flex-wrap items-center gap-1">
            {reactions.map(([reaction, total]) => (
              <li key={reaction}>
                <button
                  type="button"
                  className={cn(
                    'fab-tap flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs',
                    message.myReactions.includes(reaction)
                      ? 'border-green-700 bg-green-700/10'
                      : 'border-line bg-surface',
                  )}
                  aria-pressed={message.myReactions.includes(reaction)}
                  onClick={() => onReact(message, reaction)}
                >
                  <span aria-hidden="true">{reaction}</span>
                  <span>{formatNumber(total, language)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {message.readBy.length > 0 && mine ? (
          <span className="text-2xs text-muted">
            {t('chat.deliver.read', { n: formatNumber(message.readBy.length, language) })} ·{' '}
            {formatRelativeTime(new Date(message.createdAt), language)}
          </span>
        ) : null}
      </div>
    </div>
  );
}
