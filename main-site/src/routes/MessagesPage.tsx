import {
  Archive,
  Bell,
  BellOff,
  Bookmark,
  Check,
  MessagesSquare,
  Pin,
  Plus,
  Search,
  UserPlus,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ConversationView } from '@/components/messaging/ConversationView';
import { Seo } from '@/components/seo/Seo';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  EmptyState,
  IconButton,
  Modal,
  PageSkeleton,
  SectionHeading,
  TextField,
} from '@/design-system';
import {
  useConversationSettings,
  useInbox,
  useMessageSearch,
  useSavedMessages,
  useStartConversation,
} from '@/hooks/use-messaging';
import { cn } from '@/lib/cn';
import { formatNumber, formatRelativeTime } from '@/lib/format';
import type { ConversationSummary, InboxFilter } from '@/lib/messaging/message-types';
import { conversationName } from '@/lib/messaging/message-types';
import { ROUTES, conversationPath } from '@/lib/site';
import { dataErrorKey } from '@/lib/supabase/errors';
import { useAuthStore } from '@/store/auth-store';

const FILTERS: InboxFilter[] = ['all', 'unread', 'direct', 'groups', 'pinned', 'archived'];

interface InboxRowProps {
  conversation: ConversationSummary;
  name: string;
  active: boolean;
  language: 'en' | 'bn';
  state: { pinned: boolean; archived: boolean; muted: boolean };
  onRead: () => void;
}

/** One conversation in the list, with its own real settings writes. */
function InboxRow({ conversation, name, active, language, state, onRead }: InboxRowProps) {
  const { t } = useTranslation();
  const settings = useConversationSettings(conversation.id);
  const muted = settings.state?.muted ?? state.muted;
  const pinned = settings.state?.isPinned ?? state.pinned;
  const archived = settings.state?.isArchived ?? state.archived;

  return (
    <div className="group relative">
      <Link
        to={conversationPath(conversation.id)}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'fab-tap flex items-center gap-2 rounded-xl border border-transparent p-2 pe-20 hover:bg-surface-2',
          active && 'border-line bg-surface-2',
        )}
      >
        <Avatar
          src={
            conversation.kind === 'group'
              ? conversation.avatarUrl
              : (conversation.other?.avatarUrl ?? '')
          }
          name={name}
          size="sm"
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="fab-truncate text-sm font-semibold">{name}</span>
            {pinned ? <Pin size={11} aria-label={t('chat.pin')} /> : null}
            {muted ? <BellOff size={11} aria-label={t('chat.mute')} /> : null}
            {conversation.lastMessageAt !== null ? (
              <span className="ms-auto shrink-0 text-2xs text-muted">
                {formatRelativeTime(new Date(conversation.lastMessageAt), language)}
              </span>
            ) : null}
          </span>
          <span className="fab-truncate mt-0.5 block text-xs text-muted">
            {conversation.preview.length > 0 ? conversation.preview : t('messages.noMessagesYet')}
          </span>
        </span>
        {conversation.unread > 0 && !muted ? (
          <Badge tone="green">{formatNumber(conversation.unread, language)}</Badge>
        ) : null}
      </Link>

      <div className="absolute end-1 top-1 flex gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <IconButton
          size="sm"
          label={t('chat.markRead')}
          icon={<Check size={13} />}
          onClick={onRead}
        />
        <IconButton
          size="sm"
          label={pinned ? t('chat.unpinConversation') : t('chat.pinConversation')}
          icon={<Pin size={13} />}
          onClick={() => settings.setPinned(!pinned)}
        />
        <IconButton
          size="sm"
          label={muted ? t('chat.unmute') : t('chat.mute')}
          icon={muted ? <Bell size={13} /> : <BellOff size={13} />}
          onClick={() => settings.setMuted(!muted)}
        />
        <IconButton
          size="sm"
          label={archived ? t('chat.unarchive') : t('chat.archive')}
          icon={<Archive size={13} />}
          onClick={() => settings.setArchived(!archived)}
        />
      </div>
    </div>
  );
}

/**
 * Messenger. The list and the thread sit side by side from the medium
 * breakpoint up; a narrow screen shows one at a time. Everything on this
 * screen is delivered by the change feed — the page never polls while the
 * socket is joined.
 */
export default function MessagesPage() {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const inbox = useInbox();
  const activeId = id ?? null;
  const [newChat, setNewChat] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [crossSearch, setCrossSearch] = useState('');
  const [searchAll, setSearchAll] = useState(false);
  const saved = useSavedMessages(uid !== null && showSaved);
  const across = useMessageSearch(crossSearch, null, searchAll);
  const start = useStartConversation();

  const [username, setUsername] = useState('');
  const [groupTitle, setGroupTitle] = useState('');
  const [members, setMembers] = useState('');

  const activeSummary = useMemo(
    () => inbox.conversations.find((item) => item.id === activeId) ?? null,
    [inbox.conversations, activeId],
  );

  async function openDirect(): Promise<void> {
    const handle = username.trim().replace(/^@/, '');
    if (handle.length === 0) return;
    try {
      const conversationId = await start.openDirect(handle);
      setNewChat(false);
      setUsername('');
      navigate(conversationPath(conversationId));
    } catch (error) {
      toast.error(t(dataErrorKey(error)));
    }
  }

  async function openGroup(): Promise<void> {
    const title = groupTitle.trim();
    const handles = members
      .split(',')
      .map((value) => value.trim().replace(/^@/, ''))
      .filter((value) => value.length > 0);
    if (title.length === 0 || handles.length === 0) return;
    try {
      const conversationId = await start.openGroup(title, handles);
      setNewChat(false);
      setGroupTitle('');
      setMembers('');
      navigate(conversationPath(conversationId));
    } catch (error) {
      toast.error(t(dataErrorKey(error)));
    }
  }

  return (
    <>
      <Seo
        title={t('messages.metaTitle')}
        description={t('messages.metaDescription')}
        path={ROUTES.messages}
        noindex
      />
      <div className="fab-container py-6">
        <SectionHeading
          title={t('messages.title')}
          description={t('messages.description')}
          action={
            <Button onClick={() => setNewChat(true)}>
              <Plus size={16} aria-hidden="true" />
              {t('chat.newChat')}
            </Button>
          }
        />

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label className="relative flex-1 md:max-w-xs">
            <span className="fab-sr-only">{t('chat.searchInbox')}</span>
            <Search
              size={14}
              aria-hidden="true"
              className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              className="fab-input w-full ps-8"
              value={inbox.query}
              placeholder={t('chat.searchInbox')}
              onChange={(event) => inbox.setQuery(event.target.value)}
            />
          </label>
          <IconButton
            label={t('chat.searchAll')}
            icon={<Search size={15} />}
            aria-expanded={searchAll}
            onClick={() => setSearchAll((open) => !open)}
          />
          {inbox.status === 'live' ? (
            <Badge tone="green">{t('chat.live')}</Badge>
          ) : (
            <Badge tone="neutral">{t('chat.reconnecting')}</Badge>
          )}
          {inbox.unreadTotal > 0 ? (
            <Badge tone="green">{formatNumber(inbox.unreadTotal, language)}</Badge>
          ) : null}
        </div>

        <div className="mt-2 flex flex-wrap gap-1">
          {FILTERS.map((filter) => (
            <button
              key={filter}
              type="button"
              aria-pressed={inbox.filter === filter && !showSaved}
              className={cn(
                'fab-tap rounded-full border px-3 py-1 text-xs',
                inbox.filter === filter && !showSaved
                  ? 'border-green-700 bg-green-700/10 font-semibold'
                  : 'border-line bg-surface',
              )}
              onClick={() => {
                setShowSaved(false);
                inbox.setFilter(filter);
              }}
            >
              {t(`chat.filters.${filter}`)}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={showSaved}
            className={cn(
              'fab-tap flex items-center gap-1 rounded-full border px-3 py-1 text-xs',
              showSaved
                ? 'border-green-700 bg-green-700/10 font-semibold'
                : 'border-line bg-surface',
            )}
            onClick={() => setShowSaved((open) => !open)}
          >
            <Bookmark size={12} aria-hidden="true" />
            {t('chat.savedMessages')}
          </button>
        </div>

        {searchAll ? (
          <div className="mt-3 rounded-card border border-line bg-surface p-3">
            <label className="relative block">
              <span className="fab-sr-only">{t('chat.searchAll')}</span>
              <input
                className="fab-input w-full"
                value={crossSearch}
                placeholder={t('chat.searchAll')}
                onChange={(event) => setCrossSearch(event.target.value)}
              />
            </label>
            {across.isLoading ? (
              <p className="mt-2 text-xs text-muted">{t('common.loading')}</p>
            ) : null}
            {!across.isLoading && crossSearch.trim().length >= 2 && across.hits.length === 0 ? (
              <p className="mt-2 text-xs text-muted">{t('chat.noResults')}</p>
            ) : null}
            <ul className="mt-2">
              {across.hits.map((hit) => (
                <li key={hit.messageId}>
                  <Link
                    to={conversationPath(hit.conversationId)}
                    className="fab-tap block rounded-lg px-2 py-1 text-xs hover:bg-surface-2"
                  >
                    <span className="fab-truncate block">{hit.body}</span>
                    <span className="text-2xs text-muted">
                      {formatRelativeTime(new Date(hit.createdAt), language)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-4 grid gap-4 md:grid-cols-[320px_1fr]">
          <aside
            aria-label={t('messages.conversations')}
            className={cn('min-w-0', activeId !== null && !showSaved && 'hidden md:block')}
          >
            {inbox.isLoading ? <PageSkeleton label={t('common.loading')} /> : null}
            {inbox.isError ? <Alert tone="danger" title={t('messages.inboxFailed')} /> : null}

            {showSaved ? (
              saved.saved.length === 0 && !saved.isLoading ? (
                <EmptyState
                  icon={<Bookmark size={22} />}
                  title={t('chat.showSaved')}
                  description={t('chat.emptySaved')}
                />
              ) : (
                <ul className="flex flex-col gap-1">
                  {saved.saved.map((item) => (
                    <li key={item.messageId}>
                      <Link
                        to={conversationPath(item.conversationId)}
                        className="fab-tap block rounded-xl border border-transparent p-2 text-xs hover:bg-surface-2"
                      >
                        <span className="fab-truncate block font-semibold">
                          {item.body.length > 0 ? item.body : item.mediaName}
                        </span>
                        <span className="text-2xs text-muted">
                          {formatRelativeTime(new Date(item.createdAt), language)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )
            ) : null}

            {!showSaved &&
            !inbox.isLoading &&
            !inbox.isError &&
            inbox.conversations.length === 0 ? (
              <EmptyState
                icon={<MessagesSquare size={22} />}
                title={t('messages.emptyTitle')}
                description={t('messages.emptyBody')}
              />
            ) : null}

            {!showSaved ? (
              <ul className="flex flex-col gap-1">
                {inbox.conversations.map((conversation) => {
                  const name = conversationName(conversation, t('messages.untitled'));
                  const state = inbox.settingsOf(conversation.id);
                  return (
                    <li key={conversation.id}>
                      <InboxRow
                        conversation={conversation}
                        name={name}
                        active={conversation.id === activeId}
                        language={language}
                        state={state}
                        onRead={() => inbox.markRead(conversation.id)}
                      />
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </aside>

          <section
            aria-label={t('messages.thread')}
            className={cn('min-w-0', (activeId === null || showSaved) && 'hidden md:block')}
          >
            {activeId === null || showSaved ? (
              <EmptyState
                icon={<MessagesSquare size={22} />}
                title={t('messages.pickTitle')}
                description={t('messages.pickBody')}
              />
            ) : (
              <ConversationView conversationId={activeId} summary={activeSummary} />
            )}
          </section>
        </div>
      </div>

      <Modal
        open={newChat}
        onClose={() => setNewChat(false)}
        title={t('chat.newChatTitle')}
        closeLabel={t('common.close')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setNewChat(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void openDirect()} disabled={username.trim().length === 0}>
              <UserPlus size={15} aria-hidden="true" />
              {t('chat.start')}
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-muted">{t('chat.newChatHint')}</p>
        <div className="flex flex-col gap-3">
          <TextField
            label={t('chat.usernameLabel')}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="@username"
          />
          <TextField
            label={t('chat.groupTitleLabel')}
            value={groupTitle}
            onChange={(event) => setGroupTitle(event.target.value)}
          />
          <TextField
            label={t('chat.memberLabel')}
            value={members}
            onChange={(event) => setMembers(event.target.value)}
            placeholder="@alice, @bob"
          />
          <Button
            variant="outline"
            onClick={() => void openGroup()}
            disabled={groupTitle.trim().length === 0 || members.trim().length === 0}
          >
            <Archive size={15} aria-hidden="true" />
            {t('chat.startGroup')}
          </Button>
        </div>
      </Modal>
    </>
  );
}
