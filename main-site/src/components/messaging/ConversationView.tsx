import {
  ArrowDown,
  ArrowLeft,
  BellOff,
  Bell,
  Info,
  Pin,
  Search,
  Trash2,
  Archive,
  LogOut,
  MoreHorizontal,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  EmptyState,
  IconButton,
  Modal,
  PageSkeleton,
} from '@/design-system';
import { cn } from '@/lib/cn';
import type { Language } from '@/i18n';
import { useErrorToast } from '@/hooks/use-error-toast';
import { formatAbsoluteDate, formatNumber } from '@/lib/format';
import { dayKey } from '@/lib/messaging/message-text';
import {
  compareMessageInstants,
  conversationName,
  type ConversationSummary,
  type Message,
} from '@/lib/messaging/message-types';
import { ROUTES } from '@/lib/site';
import { dataErrorKey } from '@/lib/supabase/errors';
import { useAuthStore } from '@/store/auth-store';
import {
  useConversation,
  useConversationSettings,
  useLeaveConversation,
  useMessageSearch,
} from '@/hooks/use-messaging';
import { MessageBubble } from './MessageBubble';
import { MessageComposer } from './MessageComposer';

export interface ConversationViewProps {
  conversationId: string;
  summary: ConversationSummary | null;
}

function formatDay(iso: string, language: Language): string {
  const today = dayKey(new Date().toISOString());
  const yesterday = dayKey(new Date(Date.now() - 86_400_000).toISOString());
  const key = dayKey(iso);
  if (key === today) return language === 'bn' ? 'আজ' : 'Today';
  if (key === yesterday) return language === 'bn' ? 'গতকাল' : 'Yesterday';
  return formatAbsoluteDate(new Date(iso), language);
}

/** One thread: live lines, receipts, typing, pins, search and the composer. */
export function ConversationView({ conversationId, summary }: ConversationViewProps) {
  const { t, i18n } = useTranslation();
  const language: Language = i18n.language === 'en' ? 'en' : 'bn';
  const navigate = useNavigate();
  const location = useLocation();
  const requestedMessage =
    typeof (location.state as { messageId?: unknown } | null)?.messageId === 'string'
      ? (location.state as { messageId: string }).messageId
      : null;
  const jumpRequest = requestedMessage === null ? null : `${location.key}:${requestedMessage}`;
  const consumedJump = useRef<string | null>(null);
  const viewerUid = useAuthStore((state) => state.user?.uid ?? '');
  const conversation = useConversation(conversationId);
  const settings = useConversationSettings(conversationId);
  useErrorToast(settings.errorKey, settings.dismissError);
  const leave = useLeaveConversation();

  const [draft, setDraft] = useState('');
  const draftLoaded = useRef(false);
  const draftDirty = useRef(false);
  const draftBeforeEdit = useRef('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [deleting, setDeleting] = useState<Message | null>(null);
  const [searching, setSearching] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const actions = useRef<HTMLDivElement | null>(null);
  const [jumping, setJumping] = useState<string | null>(null);
  const searchInput = useRef<HTMLInputElement | null>(null);
  const [searchText, setSearchText] = useState('');
  const [flash, setFlash] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const scroller = useRef<HTMLDivElement | null>(null);
  const [firstReadMark, setFirstReadMark] = useState<string | null>(null);
  const search = useMessageSearch(searchText, conversationId, searching);

  useEffect(() => {
    if (searching) searchInput.current?.focus();
  }, [searching]);

  useEffect(() => {
    if (!actionsOpen) return;
    const closeOnPointer = (event: PointerEvent) => {
      if (!actions.current?.contains(event.target as Node)) setActionsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActionsOpen(false);
    };
    document.addEventListener('pointerdown', closeOnPointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnPointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [actionsOpen]);

  // The draft the member left behind on any device, loaded once.
  useEffect(() => {
    if (draftLoaded.current || conversation.state === null) return;
    draftLoaded.current = true;
    if (!draftDirty.current && conversation.state.draftBody.length > 0)
      setDraft(conversation.state.draftBody);
    setFirstReadMark(conversation.state.lastReadAt);
  }, [conversation.state]);

  const lastMessageId = conversation.messages.at(-1)?.id ?? null;
  useEffect(() => {
    if (!atBottom || scroller.current === null) return;
    scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [lastMessageId, atBottom]);

  // A visible thread is read only at its newest edge; scrolling through older
  // history or leaving a background tab open must not clear unseen messages.
  const lastIncomingId =
    [...conversation.messages]
      .reverse()
      .find((message) => message.senderUid !== viewerUid && message.clientState === undefined)
      ?.id ?? null;
  const markRead = conversation.markRead;
  useEffect(() => {
    const mark = () => {
      if (
        document.visibilityState === 'visible' &&
        atBottom &&
        !conversation.isLoading &&
        !conversation.isError &&
        conversation.state !== null &&
        lastIncomingId !== null
      )
        markRead(lastIncomingId);
    };
    mark();
    document.addEventListener('visibilitychange', mark);
    window.addEventListener('online', mark);
    return () => {
      document.removeEventListener('visibilitychange', mark);
      window.removeEventListener('online', mark);
    };
  }, [
    lastIncomingId,
    atBottom,
    markRead,
    conversation.isLoading,
    conversation.isError,
    conversation.state,
  ]);

  useEffect(() => {
    if (jumping === null) return;
    const element = document.getElementById(`message-${jumping}`);
    if (element === null) return;
    setAtBottom(false);
    element.scrollIntoView({
      block: 'center',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
    setFlash(jumping);
    setJumping(null);
  }, [jumping, conversation.messages]);

  useEffect(() => {
    if (flash === null) return;
    const timer = window.setTimeout(() => setFlash(null), 1_600);
    return () => window.clearTimeout(timer);
  }, [flash]);

  const loadUntil = conversation.loadUntil;
  const jump = useCallback(
    async (messageId: string): Promise<void> => {
      try {
        const found = await loadUntil(messageId);
        if (found) setJumping(messageId);
        else toast.info(t('chat.messageNotLoaded'));
      } catch (error) {
        toast.error(t(dataErrorKey(error)));
      }
    },
    [loadUntil, t],
  );

  // Saved-message and cross-conversation search links identify a line, not
  // merely a room. Load enough history and scroll to the requested result.
  useEffect(() => {
    if (
      requestedMessage === null ||
      jumpRequest === null ||
      consumedJump.current === jumpRequest ||
      conversation.isLoading ||
      conversation.isError
    )
      return;
    consumedJump.current = jumpRequest;
    void jump(requestedMessage);
  }, [requestedMessage, jumpRequest, conversation.isLoading, conversation.isError, jump]);

  async function loadPrevious(): Promise<void> {
    const element = scroller.current;
    const oldHeight = element?.scrollHeight ?? 0;
    const oldTop = element?.scrollTop ?? 0;
    try {
      await conversation.loadOlder();
      requestAnimationFrame(() => {
        if (element !== null) element.scrollTop = oldTop + element.scrollHeight - oldHeight;
      });
    } catch (error) {
      toast.error(t(dataErrorKey(error)));
    }
  }

  function reportFailure(action: Promise<void>): void {
    void action.catch((error: unknown) => toast.error(t(dataErrorKey(error))));
  }

  const title =
    summary === null ? t('messages.thread') : conversationName(summary, t('messages.untitled'));

  const memberName = useMemo(
    () => (uid: string | null) =>
      uid === null
        ? t('messages.unknownMember')
        : (conversation.members.find((member) => member.uid === uid)?.profile?.displayName ??
          t('messages.unknownMember')),
    [conversation.members, t],
  );

  const memberAvatar = useMemo(
    () => (uid: string | null) =>
      uid === null
        ? ''
        : (conversation.members.find((member) => member.uid === uid)?.profile?.avatarUrl ?? ''),
    [conversation.members],
  );

  const typingNames = conversation.typingUids
    .map((uid) => memberName(uid))
    .filter((name) => name !== t('messages.unknownMember'));

  const pin = conversation.pins[0] ?? null;
  const unreadDividerId = useMemo(() => {
    const mark = firstReadMark;
    if (mark === null) return null;
    return (
      conversation.messages.find(
        (message) =>
          compareMessageInstants(message.createdAt, mark) > 0 && message.senderUid !== viewerUid,
      )?.id ?? null
    );
  }, [conversation.messages, viewerUid, firstReadMark]);

  const statusLabel =
    conversation.status === 'live'
      ? t('chat.live')
      : conversation.status === 'reconnecting'
        ? t('chat.reconnecting')
        : conversation.status === 'offline'
          ? t('chat.offline')
          : t('chat.connecting');

  return (
    // Fills whatever height the page gives it: a thread route is the whole
    // viewport, and the fixed 75vh card this used to be left the composer
    // under the fold on a phone.
    <div className="flex h-full min-h-0 flex-col overflow-hidden border-border bg-surface md:rounded-[24px] md:border md:shadow-raised">
      <header className="relative z-20 flex shrink-0 items-center gap-2 border-b border-border bg-bg/95 px-2 py-2 sm:px-4">
        <Link
          to={ROUTES.messages}
          aria-label={t('chat.backToInbox')}
          className="fab-tap inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-text"
        >
          <ArrowLeft size={18} aria-hidden="true" />
        </Link>
        <Avatar
          src={summary?.kind === 'group' ? summary.avatarUrl : (summary?.other?.avatarUrl ?? '')}
          name={title}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <h2 className="fab-truncate text-sm font-semibold">{title}</h2>
          <p className="flex items-center gap-1.5 overflow-hidden whitespace-nowrap text-2xs text-muted">
            <span
              className={cn(
                'inline-flex h-2 w-2 rounded-full',
                conversation.status === 'live' ? 'bg-green-600' : 'bg-amber-500',
              )}
              aria-hidden="true"
            />
            <span>{statusLabel}</span>
            <span className="hidden sm:inline" aria-hidden="true">
              ·
            </span>
            <span className="hidden sm:inline">
              {t('chat.memberCount', { count: conversation.members.length })}
            </span>
          </p>
        </div>

        <IconButton
          label={t('chat.searchThread')}
          icon={<Search size={16} />}
          aria-expanded={searching}
          onClick={() => setSearching((open) => !open)}
        />
        <div ref={actions} className="relative shrink-0">
          <IconButton
            label={t('chat.conversationActions')}
            icon={<MoreHorizontal size={20} />}
            aria-haspopup="menu"
            aria-expanded={actionsOpen}
            onClick={() => setActionsOpen((open) => !open)}
          />
          {actionsOpen ? (
            <div
              role="menu"
              className="motion-safe:animate-fade-up absolute end-0 top-full z-30 mt-1 w-52 rounded-2xl border border-border bg-bg p-1.5 text-sm shadow-raised"
            >
              <button
                type="button"
                role="menuitem"
                className="fab-tap flex w-full items-center gap-3 rounded-xl px-3 py-2 text-start hover:bg-surface-2"
                onClick={() => {
                  settings.setMuted(!(settings.state?.muted ?? false));
                  setActionsOpen(false);
                }}
              >
                {settings.state?.muted === true ? <Bell size={16} /> : <BellOff size={16} />}
                {settings.state?.muted === true ? t('chat.unmute') : t('chat.mute')}
              </button>
              <button
                type="button"
                role="menuitem"
                className="fab-tap flex w-full items-center gap-3 rounded-xl px-3 py-2 text-start hover:bg-surface-2"
                onClick={() => {
                  settings.setPinned(!(settings.state?.isPinned ?? false));
                  setActionsOpen(false);
                }}
              >
                <Pin size={16} />
                {settings.state?.isPinned === true
                  ? t('chat.unpinConversation')
                  : t('chat.pinConversation')}
              </button>
              <button
                type="button"
                role="menuitem"
                className="fab-tap flex w-full items-center gap-3 rounded-xl px-3 py-2 text-start hover:bg-surface-2"
                onClick={() => {
                  settings.setArchived(!(settings.state?.isArchived ?? false));
                  setActionsOpen(false);
                }}
              >
                <Archive size={16} />
                {settings.state?.isArchived === true ? t('chat.unarchive') : t('chat.archive')}
              </button>
              <button
                type="button"
                role="menuitem"
                className="fab-tap flex w-full items-center gap-3 rounded-xl px-3 py-2 text-start text-danger hover:bg-surface-2"
                onClick={() => {
                  setLeaving(true);
                  setActionsOpen(false);
                }}
              >
                <LogOut size={16} /> {t('chat.leave')}
              </button>
            </div>
          ) : null}
        </div>
      </header>

      {searching ? (
        <div className="border-b border-line p-3">
          <div className="flex items-center gap-2">
            <input
              ref={searchInput}
              className="fab-input flex-1"
              value={searchText}
              placeholder={t('chat.searchPlaceholder')}
              aria-label={t('chat.searchThread')}
              onChange={(event) => setSearchText(event.target.value)}
            />
            <IconButton
              label={t('chat.searchClose')}
              icon={<X size={16} />}
              onClick={() => {
                setSearching(false);
                setSearchText('');
              }}
            />
          </div>
          {searchText.trim().length >= 2 ? (
            <ul className="mt-2 max-h-40 overflow-y-auto">
              {search.isLoading ? (
                <li className="text-xs text-muted">{t('common.loading')}</li>
              ) : null}
              {search.isError ? (
                <li role="alert" className="text-xs text-danger">
                  {t('chat.searchFailed')}{' '}
                  <button type="button" className="underline" onClick={search.retry}>
                    {t('common.retry')}
                  </button>
                </li>
              ) : null}
              {!search.isLoading && !search.isError && search.hits.length === 0 ? (
                <li className="text-xs text-muted">{t('chat.searchEmpty')}</li>
              ) : null}
              {search.hits.map((hit) => (
                <li key={hit.messageId}>
                  <button
                    type="button"
                    className="fab-tap block w-full rounded-lg px-2 py-1 text-start text-xs hover:bg-surface-2"
                    onClick={() => {
                      void jump(hit.messageId);
                      setSearching(false);
                    }}
                  >
                    <span className="font-semibold">{memberName(hit.senderUid)}</span>
                    <span className="ms-2 text-muted">
                      {formatAbsoluteDate(new Date(hit.createdAt), language)}
                    </span>
                    <span className="fab-truncate mt-0.5 block">{hit.body}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {pin !== null ? (
        <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-3 py-2 text-xs">
          <Pin size={13} aria-hidden="true" />
          <button
            type="button"
            className="fab-tap fab-truncate flex-1 text-start"
            onClick={() => void jump(pin.messageId)}
          >
            <span className="font-semibold">{t('chat.pinned')}</span>
            <span className="ms-2 text-muted">
              {pin.body.length > 0 ? pin.body : pin.mediaName}
            </span>
          </button>
          <Badge tone="neutral">{formatNumber(conversation.pins.length, language)}</Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              reportFailure(conversation.pin(pin.messageId));
            }}
          >
            {t('chat.unpin')}
          </Button>
        </div>
      ) : null}

      <div
        ref={scroller}
        data-message-scroller
        className="fab-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain bg-surface-2/40 px-3 py-4 sm:px-5"
        onScroll={(event) => {
          const element = event.currentTarget;
          setAtBottom(element.scrollHeight - element.scrollTop - element.clientHeight < 80);
        }}
      >
        {conversation.hasOlder && conversation.messages.length > 0 ? (
          <div className="mb-3 flex justify-center">
            <Button
              variant="ghost"
              size="sm"
              loading={conversation.isLoadingOlder}
              onClick={() => void loadPrevious()}
            >
              {t('messages.loadOlder')}
            </Button>
          </div>
        ) : null}

        {conversation.isLoading ? <PageSkeleton label={t('common.loading')} /> : null}

        {conversation.isError ? (
          <div className="space-y-2">
            <Alert tone="danger" title={t('messages.threadFailed')} />
            <Button variant="outline" size="sm" onClick={conversation.refresh}>
              {t('common.retry')}
            </Button>
          </div>
        ) : null}

        {!conversation.isLoading && !conversation.isError && conversation.messages.length === 0 ? (
          <EmptyState
            icon={<Info size={22} />}
            title={t('messages.sayHello')}
            description={t('chat.firstMessageBody')}
          />
        ) : null}

        <ul className="flex flex-col gap-3">
          {conversation.groups.map((group, groupIndex) => {
            const mine = group.senderUid === viewerUid;
            return (
              <li key={`${group.senderUid ?? 'system'}-${group.startedAt}`}>
                <ul className="flex flex-col gap-1">
                  {group.messages.map((message, index) => {
                    const previous =
                      index === 0
                        ? conversation.groups[groupIndex - 1]?.messages.at(-1)
                        : group.messages[index - 1];
                    const startsADay =
                      previous === undefined ||
                      dayKey(previous.createdAt) !== dayKey(message.createdAt);
                    return (
                      <li key={message.id}>
                        {startsADay ? (
                          <p className="my-3 text-center text-2xs font-semibold uppercase text-muted">
                            {formatDay(message.createdAt, language)}
                          </p>
                        ) : null}
                        {message.id === unreadDividerId ? (
                          <p className="my-2 flex items-center gap-2 text-2xs font-semibold text-green-700">
                            <span className="h-px flex-1 bg-green-700/40" />
                            {t('chat.newMessages')}
                            <span className="h-px flex-1 bg-green-700/40" />
                          </p>
                        ) : null}
                        <MessageBubble
                          message={message}
                          mine={mine}
                          showAuthor={index === 0}
                          highlight={searchText.trim().length >= 2 ? searchText : ''}
                          memberName={memberName}
                          memberAvatar={memberAvatar}
                          flash={flash === message.id}
                          onReply={(target) => {
                            if (editing !== null) setDraft(draftBeforeEdit.current);
                            setEditing(null);
                            setReplyTo(target);
                          }}
                          onEdit={(target) => {
                            if (editing === null) draftBeforeEdit.current = draft;
                            setReplyTo(null);
                            setEditing(target);
                            setDraft(target.body);
                          }}
                          onDelete={(target) => setDeleting(target)}
                          onReact={(target, reaction) => {
                            reportFailure(conversation.react(target.id, reaction));
                          }}
                          onStar={(target) => {
                            reportFailure(conversation.star(target.id));
                          }}
                          onPin={(target) => {
                            reportFailure(conversation.pin(target.id));
                          }}
                          onJump={(id) => void jump(id)}
                          onRetry={(target) => {
                            reportFailure(conversation.retry(target));
                          }}
                          onDiscard={conversation.discard}
                        />
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
      </div>

      {!atBottom ? (
        <div className="relative">
          <IconButton
            className="absolute -top-12 end-4 z-10 shadow-lg"
            label={t('chat.scrollToBottom')}
            variant="solid"
            icon={<ArrowDown size={16} />}
            onClick={() => {
              setAtBottom(true);
              scroller.current?.scrollTo({
                top: scroller.current.scrollHeight,
                behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
                  ? 'auto'
                  : 'smooth',
              });
            }}
          />
        </div>
      ) : null}

      <p aria-live="polite" className="px-3 text-2xs text-muted">
        {typingNames.length > 0 ? t('messages.typing', { names: typingNames.join(', ') }) : ''}
      </p>

      {conversation.draftSaveFailed ? (
        <p
          role="status"
          className="flex items-center justify-between gap-2 border-t border-border px-3 py-2 text-xs text-danger"
        >
          <span>{t('messages.draftSaveFailed')}</span>
          <button
            type="button"
            className="fab-tap shrink-0 font-semibold underline"
            onClick={conversation.retryDraft}
          >
            {t('common.retry')}
          </button>
        </p>
      ) : null}

      <MessageComposer
        draft={draft}
        onDraftChange={(value) => {
          draftDirty.current = true;
          setDraft(value);
          if (editing === null) conversation.saveDraft(value);
        }}
        onSend={async (body, replyId) => {
          await conversation.send(body, { replyTo: replyId });
        }}
        onSendAttachment={async (input) => {
          await conversation.send(input.body, {
            kind: input.kind,
            mediaUrl: input.mediaUrl,
            mediaName: input.mediaName,
            replyTo: replyTo?.id ?? null,
          });
        }}
        onTyping={conversation.signalTyping}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        editing={editing}
        onCancelEdit={() => {
          setEditing(null);
          setDraft(draftBeforeEdit.current);
        }}
        onSaveEdit={async (body) => {
          if (editing !== null) await conversation.edit(editing.id, body);
        }}
        memberName={memberName}
        disabled={conversation.isLoading || conversation.isError || conversation.state === null}
      />

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={t('chat.deleteMessageTitle')}
        closeLabel={t('common.close')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                const target = deleting;
                setDeleting(null);
                if (target === null) return;
                void conversation.remove(target.id).catch((error: unknown) => {
                  toast.error(t(dataErrorKey(error)));
                });
              }}
            >
              <Trash2 size={15} aria-hidden="true" />
              {t('chat.deleteMessage')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">{t('chat.deleteMessageBody')}</p>
      </Modal>

      <Modal
        open={leaving}
        onClose={() => setLeaving(false)}
        title={t('chat.leaveTitle')}
        closeLabel={t('common.close')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setLeaving(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setLeaving(false);
                void leave(conversationId)
                  .then(() => navigate(ROUTES.messages))
                  .catch((error: unknown) => toast.error(t(dataErrorKey(error))));
              }}
            >
              {t('chat.leave')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">{t('chat.leaveBody')}</p>
      </Modal>
    </div>
  );
}
