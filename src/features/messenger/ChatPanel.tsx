/**
 * BSDC — src/features/messenger/ChatPanel.tsx
 * Purpose : One conversation: history, composer, receipts, typing and presence.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The panel is deliberately the only place that writes chat state. It announces typing
 *   through the Realtime Database, marks the thread read when it is on screen, and sends through
 *   the write-through path so a bubble appears before the network is consulted.
 *   History virtualises past one hundred messages. Attachment is images and documents only: BSDC
 *   accepts no video anywhere (LAW-07), and the file picker says so in its accept attribute.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/shared/ui/Avatar';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { IconButton } from '@/shared/ui/IconButton';
import { Textarea } from '@/shared/ui/Input';
import { Text } from '@/shared/ui/Typography';
import { VirtualList } from '@/shared/ui/VirtualList';
import { fromNow } from '@/shared/lib/date';
import type { Profile } from '@/entities/profile/model';
import {
  conversationTitle,
  newMessage,
  type ChatMessage,
  type Conversation,
} from '@/entities/conversation/model';
import {
  listMessages,
  markConversationRead,
  peekMessages,
  sendMessage,
  watchMessages,
} from '@/entities/conversation/repository';
import { announceTyping, stopTyping, TYPING_REFRESH_MS } from '@/services/realtime/typing';
import { uploadMedia } from '@/services/media';
import { createLocalPreview } from '@/services/media/preview';
import { usePresence } from '@/features/presence';
import { MessageBubble } from './MessageBubble';
import { TypingIndicator } from './TypingIndicator';

/** Messages beyond which history virtualises. */
const VIRTUALISE_AFTER = 100;

/** Props for the chat panel. */
export interface ChatPanelProps {
  readonly conversation: Conversation;
  readonly viewer: Profile;
  readonly locale: 'bn' | 'en';
}

/**
 * Renders one conversation.
 * @param props panel props
 * @returns the chat panel
 */
export function ChatPanel({ conversation, viewer, locale }: ChatPanelProps): React.ReactElement {
  const { t } = useTranslation('messenger');
  const [messages, setMessages] = useState<readonly ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const typingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const otherUid = conversation.participantUids.find((uid) => uid !== viewer.uid) ?? '';
  const presence = usePresence(otherUid);
  const title = conversationTitle(conversation, viewer.uid, 'BSDC');

  const names = useMemo<Readonly<Record<string, string>>>(() => {
    const map: Record<string, string> = {};
    conversation.participantUids.forEach((uid, index) => {
      map[uid] = conversation.participantNames[index] ?? '';
    });
    return map;
  }, [conversation.participantNames, conversation.participantUids]);

  /** Loads history once, then keeps it live. */
  const load = useCallback((): (() => void) => {
    let active = true;
    void listMessages(conversation.id).then(async (page) => {
      if (!active) return;
      setOffline(page.source === 'local');
      const local = await peekMessages(conversation.id);
      const merged = new Map<string, ChatMessage>();
      for (const message of [...local, ...page.items]) merged.set(message.clientId, message);
      setMessages(
        Array.from(merged.values()).sort(
          (left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt),
        ),
      );
      setLoading(false);
    });
    const release = watchMessages(conversation.id, (next) => {
      if (!active) return;
      setOffline(false);
      setMessages((current) => {
        const merged = new Map<string, ChatMessage>();
        for (const message of [...current, ...next]) merged.set(message.clientId, message);
        return Array.from(merged.values()).sort(
          (left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt),
        );
      });
      setLoading(false);
    });
    return () => {
      active = false;
      release();
    };
  }, [conversation.id]);

  useEffect(() => load(), [load]);

  useEffect(() => {
    void markConversationRead(conversation.id, viewer.uid);
  }, [conversation.id, viewer.uid, messages.length]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  /**
   * Announces typing and keeps the announcement alive while the person types.
   */
  function noteTyping(): void {
    void announceTyping(conversation.id, viewer.uid);
    if (typingTimer.current !== null) return;
    typingTimer.current = setInterval(() => {
      void announceTyping(conversation.id, viewer.uid);
    }, TYPING_REFRESH_MS);
  }

  /**
   * Stops announcing typing.
   */
  function clearTyping(): void {
    if (typingTimer.current !== null) {
      clearInterval(typingTimer.current);
      typingTimer.current = null;
    }
    void stopTyping(conversation.id, viewer.uid);
  }

  useEffect(
    () => () => {
      if (typingTimer.current !== null) {
        clearInterval(typingTimer.current);
        typingTimer.current = null;
      }
      void stopTyping(conversation.id, viewer.uid);
    },
    [conversation.id, viewer.uid],
  );

  /**
   * Sends the draft as a text message.
   * @param event form submit event
   */
  async function send(event?: SyntheticEvent<HTMLFormElement>): Promise<void> {
    event?.preventDefault();
    const body = draft.trim();
    if (body.length === 0 || busy) return;
    setBusy(true);
    const message = newMessage({
      conversationId: conversation.id,
      senderUid: viewer.uid,
      body,
      senderName: viewer.displayName,
      senderPhotoUrl: viewer.photoUrl,
    });
    setMessages((current) => [...current, message]);
    setDraft('');
    clearTyping();
    await sendMessage(message);
    setBusy(false);
  }

  /**
   * Sends an attachment after uploading it.
   * @param files chosen files
   */
  async function attach(files: readonly File[]): Promise<void> {
    for (const file of files) {
      const isImage = file.type.startsWith('image/');
      const preview = isImage ? await createLocalPreview(file) : null;
      const uploaded = await uploadMedia(file, isImage ? 'chatImage' : 'chatPdf');
      if (!uploaded.ok) continue;
      const message = newMessage({
        conversationId: conversation.id,
        senderUid: viewer.uid,
        body: '',
        kind: isImage ? 'image' : 'document',
        senderName: viewer.displayName,
        senderPhotoUrl: viewer.photoUrl,
        attachment: {
          url: uploaded.value.url,
          provider: uploaded.value.provider,
          remoteId: uploaded.value.remoteId,
          width: uploaded.value.width,
          height: uploaded.value.height,
          bytes: uploaded.value.bytes,
          alt: '',
          blurPreview: preview?.blurDataUrl ?? '',
          durationSeconds: 0,
        },
      });
      setMessages((current) => [...current, message]);
      await sendMessage(message);
    }
  }

  const virtualise = messages.length > VIRTUALISE_AFTER;

  return (
    <section className="bsdc-chat" aria-label={title}>
      <header className="bsdc-chat__head">
        <Avatar
          name={title}
          src={conversation.avatarUrl === '' ? null : conversation.avatarUrl}
          size="md"
          presence={presence?.state}
        />
        <div className="bsdc-chat__identity">
          <span className="bsdc-chat__title">{title}</span>
          <span className="bsdc-chat__status">
            {presence === null
              ? t('presenceUnknown')
              : presence.state === 'online'
                ? t('presenceOnline')
                : presence.state === 'away'
                  ? t('presenceAway')
                  : t('presenceOffline')}
          </span>
        </div>
      </header>

      {offline ? (
        <Text as="p" role="status" className="bsdc-chat__offline">
          {t('deviceOnly')}
        </Text>
      ) : null}

      <div className="bsdc-chat__history">
        {loading ? (
          <Text as="p" role="status">
            {t('loading')}
          </Text>
        ) : messages.length === 0 ? (
          <EmptyState
            illustration="welcome"
            title={t('noMessagesTitle')}
            description={t('noMessagesBody')}
          />
        ) : virtualise ? (
          <VirtualList
            items={messages}
            itemHeight={88}
            height="60vh"
            label={t('history')}
            renderItem={(message, index) => {
              const previous = messages[index - 1];
              return (
                <MessageBubble
                  message={message}
                  own={message.senderUid === viewer.uid}
                  locale={locale}
                  delivered={message.deliveredTo.length > 1}
                  read={message.readBy.some((uid) => uid !== viewer.uid)}
                  showAvatar={previous?.senderUid !== message.senderUid}
                />
              );
            }}
          />
        ) : (
          <ul className="bsdc-chat__messages">
            {messages.map((message, index) => {
              const previous = messages[index - 1];
              return (
                <li key={message.clientId}>
                  <MessageBubble
                    message={message}
                    own={message.senderUid === viewer.uid}
                    locale={locale}
                    delivered={message.deliveredTo.length > 1}
                    read={message.readBy.some((uid) => uid !== viewer.uid)}
                    showAvatar={previous?.senderUid !== message.senderUid}
                  />
                </li>
              );
            })}
          </ul>
        )}
        <div ref={endRef} aria-hidden="true" />
      </div>

      <TypingIndicator
        conversationId={conversation.id}
        viewerUid={viewer.uid}
        names={names}
        locale={locale}
      />

      <form
        className="bsdc-chat__composer"
        onSubmit={(submitEvent) => {
          void send(submitEvent);
        }}
      >
        <input
          ref={fileInput}
          type="file"
          className="bsdc-visually-hidden"
          accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = '';
            void attach(files);
          }}
        />
        <IconButton
          icon="award"
          label={t('attach')}
          variant="ghost"
          size="md"
          onClick={() => fileInput.current?.click()}
        />
        <Textarea
          label={t('writeMessage')}
          value={draft}
          rows={1}
          onChange={(event) => {
            setDraft(event.target.value);
            noteTyping();
          }}
          onBlur={clearTyping}
        />
        <Button type="submit" size="md" disabled={draft.trim().length === 0 || busy} loading={busy}>
          {t('send')}
        </Button>
      </form>

      <footer className="bsdc-chat__footer">
        <Text as="span" size="sm" tone="muted">
          {`${t('lastActivity')} ${fromNow(conversation.lastMessageAt, locale)}`}
        </Text>
      </footer>
    </section>
  );
}
