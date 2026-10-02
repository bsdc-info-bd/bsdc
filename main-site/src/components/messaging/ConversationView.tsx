import { ArrowLeft, Check, CheckCheck, Send, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Alert, Avatar, Button, Skeleton, TextareaField } from '@/design-system';
import { useConversation } from '@/hooks/use-messaging';
import { cn } from '@/lib/cn';
import { formatRelativeTime } from '@/lib/format';
import {
  conversationName,
  readCount,
  type ConversationSummary,
} from '@/lib/messaging/message-types';
import { ROUTES } from '@/lib/site';
import { dataErrorKey } from '@/lib/supabase/errors';
import { useAuthStore } from '@/store/auth-store';

export interface ConversationViewProps {
  conversationId: string;
  summary: ConversationSummary | null;
}

const MAX_LENGTH = 8000;

/** One thread: history, read receipts, typing indicator and the composer. */
export function ConversationView({ conversationId, summary }: ConversationViewProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const viewerUid = useAuthStore((state) => state.user?.uid ?? '');
  const conversation = useConversation(conversationId);
  const [draft, setDraft] = useState('');
  const bottom = useRef<HTMLDivElement | null>(null);
  const lastMessageId = conversation.messages.at(-1)?.id ?? null;

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [lastMessageId]);

  async function submit() {
    const body = draft.trim();
    if (body.length === 0 || body.length > MAX_LENGTH) return;
    setDraft('');
    try {
      await conversation.send(body);
    } catch (error) {
      setDraft(body);
      toast.error(t(dataErrorKey(error)));
    }
  }

  const title =
    summary === null ? t('messages.thread') : conversationName(summary, t('messages.untitled'));
  const typingNames = conversation.typingUids
    .map(
      (uid) =>
        conversation.members.find((member) => member.uid === uid)?.profile?.displayName ?? null,
    )
    .filter((name): name is string => name !== null);

  return (
    <div className="flex h-[70vh] min-h-80 flex-col rounded-card border border-line bg-surface">
      <header className="flex items-center gap-2 border-b border-line p-3">
        <Link to={ROUTES.messages} className="md:hidden" aria-label={t('common.backHome')}>
          <ArrowLeft size={18} aria-hidden="true" />
        </Link>
        <Avatar
          src={summary?.kind === 'group' ? summary.avatarUrl : (summary?.other?.avatarUrl ?? '')}
          name={title}
          size="sm"
        />
        <h2 className="fab-truncate text-sm font-semibold">{title}</h2>
      </header>

      <div className="flex-1 overflow-y-auto p-3">
        {conversation.hasOlder && conversation.messages.length > 0 ? (
          <div className="mb-3 flex justify-center">
            <Button variant="ghost" size="sm" onClick={conversation.loadOlder}>
              {t('messages.loadOlder')}
            </Button>
          </div>
        ) : null}

        {conversation.isLoading ? (
          <div className="flex flex-col gap-2" aria-busy="true">
            <Skeleton className="h-10 w-1/2" />
            <Skeleton className="h-10 w-2/3 self-end" />
          </div>
        ) : null}

        {conversation.isError ? <Alert tone="danger" title={t('messages.threadFailed')} /> : null}

        {!conversation.isLoading && conversation.messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">{t('messages.sayHello')}</p>
        ) : null}

        <ul className="flex flex-col gap-3">
          {conversation.groups.map((group) => {
            const mine = group.senderUid === viewerUid;
            return (
              <li
                key={`${group.senderUid ?? 'system'}-${group.startedAt}`}
                className={cn('flex gap-2', mine && 'flex-row-reverse')}
              >
                <Avatar
                  src={group.author?.avatarUrl ?? ''}
                  name={group.author?.displayName ?? t('messages.unknownMember')}
                  size="sm"
                />
                <div className={cn('flex min-w-0 flex-col gap-1', mine && 'items-end')}>
                  <span className="text-2xs text-muted">
                    {group.author?.displayName ?? t('messages.unknownMember')} ·{' '}
                    {formatRelativeTime(new Date(group.startedAt), language)}
                  </span>

                  {group.messages.map((message) => {
                    const seenBy = readCount(message, conversation.members, viewerUid);
                    return (
                      <div
                        key={message.id}
                        className={cn(
                          'group max-w-[46ch] break-words rounded-2xl px-3 py-2 text-sm',
                          mine ? 'bg-green-700 text-white' : 'bg-surface-2 text-text',
                        )}
                      >
                        {message.deletedAt !== null ? (
                          <span className="italic opacity-80">{t('messages.deleted')}</span>
                        ) : (
                          <span className="whitespace-pre-wrap">{message.body}</span>
                        )}

                        <span className="mt-1 flex items-center justify-end gap-1 text-2xs opacity-80">
                          {message.editedAt !== null ? <span>{t('messages.edited')}</span> : null}
                          {mine && message.deletedAt === null ? (
                            <>
                              {seenBy > 0 ? (
                                <CheckCheck size={12} aria-label={t('messages.seen')} />
                              ) : (
                                <Check size={12} aria-label={t('messages.sent')} />
                              )}
                              <button
                                type="button"
                                className="fab-tap opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                                onClick={() => {
                                  void conversation.remove(message.id);
                                }}
                              >
                                <Trash2 size={12} aria-hidden="true" />
                                <span className="fab-sr-only">{t('common.delete')}</span>
                              </button>
                            </>
                          ) : null}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
        <div ref={bottom} />
      </div>

      <div className="border-t border-line p-3">
        <p aria-live="polite" className="mb-1 h-4 text-2xs text-muted">
          {typingNames.length > 0 ? t('messages.typing', { names: typingNames.join(', ') }) : ''}
        </p>
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <TextareaField
            label={t('messages.composerLabel')}
            className="flex-1"
            rows={2}
            value={draft}
            maxLength={MAX_LENGTH}
            placeholder={t('messages.composerPlaceholder')}
            onChange={(event) => {
              setDraft(event.target.value);
              conversation.signalTyping();
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
          />
          <Button type="submit" disabled={draft.trim().length === 0 || conversation.isSending}>
            <Send size={16} />
            <span className="fab-sr-only">{t('messages.send')}</span>
          </Button>
        </form>
      </div>
    </div>
  );
}
