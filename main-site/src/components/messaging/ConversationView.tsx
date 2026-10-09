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
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
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
  const viewerUid = useAuthStore((state) => state.user?.uid ?? '');
  const conversation = useConversation(conversationId);
  const settings = useConversationSettings(conversationId);
  useErrorToast(settings.errorKey, settings.dismissError);
  const leave = useLeaveConversation();

  const [draft, setDraft] = useState('');
  const draftLoaded = useRef(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [deleting, setDeleting] = useState<Message | null>(null);
  const [searching, setSearching] = useState(false);
  const searchInput = useRef<HTMLInputElement | null>(null);
  const [searchText, setSearchText] = useState('');
  const [flash, setFlash] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const bottom = useRef<HTMLDivElement | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const firstReadMark = useRef<string | null>(null);
  const search = useMessageSearch(searchText, conversationId, searching);

  useEffect(() => {
    if (searching) searchInput.current?.focus();
  }, [searching]);

  // The draft the member left behind on any device, loaded once.
  useEffect(() => {
    if (draftLoaded.current || conversation.state === null) return;
    draftLoaded.current = true;
    if (conversation.state.draftBody.length > 0) setDraft(conversation.state.draftBody);
    firstReadMark.current = conversation.state.lastReadAt;
  }, [conversation.state]);

  const lastMessageId = conversation.messages.at(-1)?.id ?? null;
  useEffect(() => {
    if (!atBottom) return;
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [lastMessageId, atBottom]);

  // A thread on screen in a visible tab is read; a hidden tab is not.
  useEffect(() => {
    const mark = () => {
      if (document.visibilityState !== 'visible') return;
      const last = [...conversation.messages].reverse().find((m) => m.senderUid !== viewerUid);
      if (last !== undefined) conversation.markRead(last.id);
    };
    mark();
    document.addEventListener('visibilitychange', mark);
    return () => document.removeEventListener('visibilitychange', mark);
  }, [conversation, viewerUid]);

  function jump(messageId: string): void {
    const element = document.getElementById(`message-${messageId}`);
    element?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setFlash(messageId);
    window.setTimeout(() => setFlash((current) => (current === messageId ? null : current)), 1_600);
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
    const mark = firstReadMark.current;
    if (mark === null) return null;
    return (
      conversation.messages.find(
        (message) => message.createdAt > mark && message.senderUid !== viewerUid,
      )?.id ?? null
    );
  }, [conversation.messages, viewerUid]);

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
    <div className="flex h-full min-h-0 flex-col overflow-hidden border-line bg-surface md:rounded-card md:border">
      <header className="flex items-center gap-2 border-b border-line p-3">
        <Link to={ROUTES.messages} aria-label={t('chat.backToInbox')}>
          <ArrowLeft size={18} aria-hidden="true" />
        </Link>
        <Avatar
          src={summary?.kind === 'group' ? summary.avatarUrl : (summary?.other?.avatarUrl ?? '')}
          name={title}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <h2 className="fab-truncate text-sm font-semibold">{title}</h2>
          <p className="flex items-center gap-2 text-2xs text-muted">
            <span
              className={cn(
                'inline-flex h-2 w-2 rounded-full',
                conversation.status === 'live' ? 'bg-green-600' : 'bg-amber-500',
              )}
              aria-hidden="true"
            />
            <span>{statusLabel}</span>
            {conversation.latencyMs !== null ? (
              <span>
                {t('chat.latency', { ms: formatNumber(conversation.latencyMs, language) })}
              </span>
            ) : null}
            {conversation.presentUids.length > 0 ? (
              <span>{t('chat.here', { count: conversation.presentUids.length })}</span>
            ) : null}
            <span>{t('chat.memberCount', { count: conversation.members.length })}</span>
          </p>
        </div>

        <IconButton
          label={t('chat.searchThread')}
          icon={<Search size={16} />}
          aria-expanded={searching}
          onClick={() => setSearching((open) => !open)}
        />
        <IconButton
          label={settings.state?.muted === true ? t('chat.unmute') : t('chat.mute')}
          icon={settings.state?.muted === true ? <BellOff size={16} /> : <Bell size={16} />}
          onClick={() => settings.setMuted(!(settings.state?.muted ?? false))}
        />
        <IconButton
          label={
            settings.state?.isPinned === true
              ? t('chat.unpinConversation')
              : t('chat.pinConversation')
          }
          icon={<Pin size={16} />}
          onClick={() => settings.setPinned(!(settings.state?.isPinned ?? false))}
        />
        <IconButton
          label={settings.state?.isArchived === true ? t('chat.unarchive') : t('chat.archive')}
          icon={<Archive size={16} />}
          onClick={() => settings.setArchived(!(settings.state?.isArchived ?? false))}
        />
        <IconButton
          label={t('chat.leave')}
          icon={<LogOut size={16} />}
          onClick={() => setLeaving(true)}
        />
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
              {!search.isLoading && search.hits.length === 0 ? (
                <li className="text-xs text-muted">{t('chat.searchEmpty')}</li>
              ) : null}
              {search.hits.map((hit) => (
                <li key={hit.messageId}>
                  <button
                    type="button"
                    className="fab-tap block w-full rounded-lg px-2 py-1 text-start text-xs hover:bg-surface-2"
                    onClick={() => {
                      jump(hit.messageId);
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
            onClick={() => jump(pin.messageId)}
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
              const message = conversation.messages.find((item) => item.id === pin.messageId);
              if (message !== undefined) void conversation.pin(message.id);
            }}
          >
            {t('chat.unpin')}
          </Button>
        </div>
      ) : null}

      <div
        ref={scroller}
        className="fab-scroll flex-1 overscroll-contain p-3"
        onScroll={(event) => {
          const element = event.currentTarget;
          setAtBottom(element.scrollHeight - element.scrollTop - element.clientHeight < 80);
        }}
      >
        {conversation.hasOlder && conversation.messages.length > 0 ? (
          <div className="mb-3 flex justify-center">
            <Button variant="ghost" size="sm" onClick={conversation.loadOlder}>
              {t('messages.loadOlder')}
            </Button>
          </div>
        ) : null}

        {conversation.isLoading ? <PageSkeleton label={t('common.loading')} /> : null}

        {conversation.isError ? <Alert tone="danger" title={t('messages.threadFailed')} /> : null}

        {!conversation.isLoading && conversation.messages.length === 0 ? (
          <EmptyState
            icon={<Info size={22} />}
            title={t('messages.sayHello')}
            description={t('chat.firstMessageBody')}
          />
        ) : null}

        <ul className="flex flex-col gap-3">
          {conversation.groups.map((group) => {
            const mine = group.senderUid === viewerUid;
            return (
              <li key={`${group.senderUid ?? 'system'}-${group.startedAt}`}>
                <ul className="flex flex-col gap-1">
                  {group.messages.map((message, index) => {
                    const previous = group.messages[index - 1];
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
                            setEditing(null);
                            setReplyTo(target);
                          }}
                          onEdit={(target) => {
                            setReplyTo(null);
                            setEditing(target);
                            setDraft(target.body);
                          }}
                          onDelete={(target) => setDeleting(target)}
                          onReact={(target, reaction) => {
                            void conversation.react(target.id, reaction);
                          }}
                          onStar={(target) => {
                            void conversation.star(target.id);
                          }}
                          onPin={(target) => {
                            void conversation.pin(target.id);
                          }}
                          onJump={jump}
                          onRetry={(target) => {
                            void conversation.retry(target);
                          }}
                        />
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
        <div ref={bottom} />
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
              bottom.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
            }}
          />
        </div>
      ) : null}

      <p aria-live="polite" className="px-3 text-2xs text-muted">
        {typingNames.length > 0 ? t('messages.typing', { names: typingNames.join(', ') }) : ''}
      </p>

      <MessageComposer
        draft={draft}
        onDraftChange={(value) => {
          setDraft(value);
          conversation.saveDraft(value);
        }}
        onSend={async (body, replyId) => {
          await conversation.send(body, { replyTo: replyId });
        }}
        onSendAttachment={async (input) => {
          const { sendMessage } = await import('@/lib/messaging/message-repository');
          await sendMessage({
            conversationId,
            body: input.body,
            kind: input.kind,
            mediaUrl: input.mediaUrl,
            mediaName: input.mediaName,
            replyTo: replyTo?.id ?? null,
          });
          setReplyTo(null);
        }}
        onTyping={conversation.signalTyping}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        editing={editing}
        onCancelEdit={() => {
          setEditing(null);
          setDraft('');
        }}
        onSaveEdit={async (body) => {
          if (editing !== null) await conversation.edit(editing.id, body);
        }}
        memberName={memberName}
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
