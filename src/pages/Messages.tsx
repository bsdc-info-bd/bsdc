/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, Check, CheckCheck, Code2, ImagePlus, MessageSquarePlus, MoreVertical, Pin, PinOff,
  Reply, Search, Send, ShieldCheck, Trash2, Users, Pencil, VolumeOff, Volume2, LogOut, Hash,
  ThumbsUp, Heart, PartyPopper, Flame,
} from 'lucide-react';
import { toast } from 'sonner';
import { useChat, useChatList } from '@/hooks/useChat';
import { useAuthStore } from '@/stores/authStore';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from '@/components/ui/Dropdown';
import { SEOHead } from '@/components/seo/SEOHead';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { uploadImage } from '@/lib/upload';
import { cn, timeAgo } from '@/lib/utils';
import { fetchActiveUsers } from '@/lib/data';
import { onPresence } from '@/lib/realtime';
import type { ChatMessage, UserChatEntry } from '@/types/chat';
import { useUIStore } from '@/stores/uiStore';

/* ---------- Audio Beep (Web Audio API, lightweight, browser-policy safe) ---------- */
let _audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext | null {
  try {
    if (typeof window === 'undefined') return null;
    if (!_audioCtx) {
      const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
      if (!Ctx) return null;
      _audioCtx = new Ctx();
    }
    if (_audioCtx.state === 'suspended') void _audioCtx.resume().catch(() => {});
    return _audioCtx;
  } catch {
    return null;
  }
}
function playBeep(kind: 'send' | 'receive' = 'send') {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    if (kind === 'send') {
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1320, now + 0.12);
    } else {
      osc.frequency.setValueAtTime(660, now);
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.16);
    }
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.25);
  } catch {
    /* silent */
  }
}
// Unlock audio on first user gesture (browser autoplay policy)
if (typeof window !== 'undefined') {
  const unlock = () => {
    getAudioCtx();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
}

/* ---------- Inject scoped animations (once) ---------- */
const BSDC_MSG_STYLES = `
@keyframes bsdc-msg-in { 0% { opacity: 0; transform: translateY(8px) scale(.97); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes bsdc-fade-in { 0% { opacity: 0; } 100% { opacity: 1; } }
@keyframes bsdc-pop { 0% { transform: scale(.6); opacity: 0; } 60% { transform: scale(1.15); opacity: 1; } 100% { transform: scale(1); } }
@keyframes bsdc-shimmer { 0% { background-position: -400px 0; } 100% { background-position: 400px 0; } }
.bsdc-msg-in { animation: bsdc-msg-in .28s cubic-bezier(.22,1,.36,1) both; }
.bsdc-fade-in { animation: bsdc-fade-in .25s ease-out both; }
.bsdc-pop { animation: bsdc-pop .32s cubic-bezier(.34,1.56,.64,1) both; }
.bsdc-tap { transition: transform .15s ease, background-color .2s ease; }
.bsdc-tap:active { transform: scale(.94); }
.bsdc-hover-lift { transition: transform .2s ease, box-shadow .2s ease; }
.bsdc-hover-lift:hover { transform: translateY(-1px); }
`;
if (typeof document !== 'undefined' && !document.getElementById('bsdc-msg-styles')) {
  const style = document.createElement('style');
  style.id = 'bsdc-msg-styles';
  style.innerHTML = BSDC_MSG_STYLES;
  document.head.appendChild(style);
}

export default function Messages() {
  const { chatId } = useParams<{ chatId?: string }>();
  const [searchParams] = useSearchParams();
  const activeChat = chatId || searchParams.get('chat') || null;

  return (
    <>
      <SEOHead title="Messages — BSDC" description="Your BSDC conversations." path="/messages" noindex />
      <div className="fixed inset-0 z-30 flex flex-col pt-14 lg:pt-16 lg:bsdc-safe-top">
        <div className="mx-auto flex h-full w-full max-w-[1600px] flex-1 overflow-hidden px-0 sm:px-4 lg:px-6">
          <div className="flex h-full min-h-0 w-full overflow-hidden border-surface-light-border bg-white/95 backdrop-blur-sm dark:border-surface-dark-border dark:bg-surface-dark-muted/95 sm:rounded-2xl sm:border sm:shadow-2xl">
            {/* Chat list */}
            <aside
              className={cn(
                'flex h-full min-h-0 w-full flex-col border-r border-surface-light-border dark:border-surface-dark-border sm:w-80 sm:shrink-0 lg:w-96',
                activeChat && 'hidden sm:flex',
              )}
              aria-label="Conversations"
            >
              <ChatListPanel activeChatId={activeChat} />
            </aside>
            {/* Active chat */}
            <section className={cn('flex h-full min-h-0 min-w-0 flex-1 flex-col', !activeChat && 'hidden sm:flex')} aria-label="Conversation">
              {activeChat ? <ChatWindow chatId={activeChat} /> : <EmptyConversation />}
            </section>
          </div>
        </div>
      </div>
    </>
  );
}

function EmptyConversation() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-1 items-center justify-center bg-gradient-to-br from-white via-brand-50/30 to-white dark:from-surface-dark-muted dark:via-brand-950/10 dark:to-surface-dark-muted">
      <div className="bsdc-fade-in">
        <EmptyState title={t('chat.noChats')} body={t('chat.noChatsBody')} icon={<MessageSquarePlus className="h-16 w-16" aria-hidden />} />
      </div>
    </div>
  );
}

function ChatListPanel({ activeChatId }: { activeChatId: string | null }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const language = useUIStore((s) => s.language);
  const { chats, loading } = useChatList();
  const [filter, setFilter] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!filter.trim()) return chats;
    const f = filter.toLowerCase();
    return chats.filter((c) => c.name?.toLowerCase().includes(f) || c.chatId.toLowerCase().includes(f) || c.lastMessage.toLowerCase().includes(f));
  }, [chats, filter]);

  if (!profile) {
    navigate('/login');
    return null;
  }

  return (
    <>
      <div className="border-b border-surface-light-border bg-white/70 p-3 backdrop-blur-md dark:border-surface-dark-border dark:bg-surface-dark-muted/70">
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <h1 className="bg-gradient-to-r from-brand-600 to-fb-600 bg-clip-text text-base font-extrabold tracking-tight text-transparent">{t('chat.title')}</h1>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setNewOpen(true)}
              aria-label={t('chat.newChat')}
              className="bsdc-tap bsdc-hover-lift rounded-lg p-2 text-brand-600 transition-all hover:bg-brand-50 hover:shadow-md dark:hover:bg-brand-950/50"
            >
              <MessageSquarePlus className="h-5 w-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setGroupOpen(true)}
              aria-label={t('chat.newGroup')}
              className="bsdc-tap bsdc-hover-lift rounded-lg p-2 text-fb-600 transition-all hover:bg-fb-50 hover:shadow-md dark:hover:bg-fb-950/50"
            >
              <Users className="h-5 w-5" aria-hidden />
            </button>
          </div>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400 transition-colors" aria-hidden />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t('chat.searchChats')}
            aria-label={t('chat.searchChats')}
            className="bsdc-input h-9 rounded-full pl-9 text-sm transition-all focus:shadow-md"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-2 p-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bsdc-fade-in">
            <EmptyState title={t('chat.noChats')} body={t('chat.noChatsBody')} icon={<MessageSquarePlus className="h-12 w-12" aria-hidden />} />
          </div>
        ) : (
          <ul className="p-1.5">
            {filtered.map((chat, idx) => (
              <li key={chat.chatId} className="bsdc-fade-in" style={{ animationDelay: `${Math.min(idx * 30, 300)}ms` }}>
                <button
                  type="button"
                  onClick={() => navigate(`/messages/${chat.chatId}`)}
                  className={cn(
                    'group flex w-full items-center gap-3 rounded-xl p-3 text-left transition-all duration-200 bsdc-tap',
                    chat.chatId === activeChatId
                      ? 'bg-gradient-to-r from-brand-50 to-brand-100/50 shadow-sm ring-1 ring-brand-200/60 dark:from-brand-950/60 dark:to-brand-900/30 dark:ring-brand-800/40'
                      : 'hover:bg-neutral-50 hover:shadow-sm dark:hover:bg-surface-dark-raised/70',
                  )}
                >
                  <ChatAvatar name={chat.name || chatTitle(chat)} type={chat.type} ids={chat.participantIds || []} meId={profile.uid} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-bold">{chat.name || chatTitle(chat)}</span>
                      <span className="shrink-0 text-[10px] text-neutral-400">{timeAgo(chat.lastMessageAt, language)}</span>
                    </span>
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                        {chat.lastSender && chat.type !== 'channel' ? `${chat.lastSender.split(' ')[0]}: ` : ''}
                        {chat.lastMessage || '…'}
                      </span>
                      {chat.unreadCount > 0 ? (
                        <span className="bsdc-pop flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 px-1 text-[10px] font-bold text-white shadow-md shadow-brand-500/30">
                          {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                        </span>
                      ) : chat.pinned ? (
                        <Pin className="h-3 w-3 shrink-0 text-neutral-400" aria-hidden />
                      ) : null}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <NewChatModal open={newOpen} onOpenChange={setNewOpen} />
      <NewGroupModal open={groupOpen} onOpenChange={setGroupOpen} />
    </>
  );
}

function chatTitle(chat: UserChatEntry): string {
  return chat.name || 'Direct message';
}

function ChatAvatar({ name, type, ids, meId }: { name: string; type: string; ids: string[]; meId: string }) {
  const [other, setOther] = useState<{ displayName: string; avatar: string; uid: string } | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    if (type !== 'direct') return;
    const otherId = ids.find((id) => id !== meId);
    if (!otherId) return;
    void import('@/lib/data').then(async ({ fetchUsersByIds }) => {
      const users = await fetchUsersByIds([otherId]);
      if (users[0]) setOther({ displayName: users[0].displayName, avatar: users[0].avatar, uid: users[0].uid });
    });
  }, [type, ids, meId]);

  useEffect(() => {
    if (!other) return;
    const unsub = onPresence(other.uid, (p) => setOnline(p.online));
    return unsub;
  }, [other]);

  if (type === 'group' || type === 'channel') {
    return (
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-white shadow-md shadow-brand-500/20 ring-2 ring-white/50 dark:ring-surface-dark-muted/50">
        {type === 'channel' ? <Hash className="h-5 w-5" aria-hidden /> : <Users className="h-5 w-5" aria-hidden />}
      </span>
    );
  }
  return <Avatar src={other?.avatar} name={other?.displayName || name} size={44} online={online} />;
}

function ChatWindow({ chatId }: { chatId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const language = useUIStore((s) => s.language);
  const chat = useChat(chatId);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [codeOpen, setCodeOpen] = useState(false);
  const [codeText, setCodeText] = useState('');
  const [codeLang, setCodeLang] = useState('typescript');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [editMsgId, setEditMsgId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  // Audio beep on new message received (not sent by me)
  const lastMsgIdRef = useRef<string | null>(null);
  const initializedRef = useRef(false);
  useEffect(() => {
    const msgs = chat.messages;
    if (msgs.length === 0) return;
    const last = msgs[msgs.length - 1];
    if (!initializedRef.current) {
      initializedRef.current = true;
      lastMsgIdRef.current = last.id;
      return;
    }
    if (last.id !== lastMsgIdRef.current) {
      lastMsgIdRef.current = last.id;
      if (last.senderId !== profile?.uid) playBeep('receive');
    }
  }, [chat.messages, profile?.uid]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [chat.messages.length]);

  const otherParticipants = useMemo(
    () => (chat.metadata?.participants || []).filter((p) => p.uid !== profile?.uid),
    [chat.metadata, profile?.uid],
  );

  async function send() {
    const value = text.trim();
    if (!value || !profile) return;
    setText('');
    setReplyTo(null);
    playBeep('send');
    await chat.send({
      text: value,
      replyTo: replyTo ? { id: replyTo.id, text: replyTo.text || 'Message', sender: replyTo.senderName } : null,
    });
  }

  async function sendImage(file: File) {
    if (!profile) return;
    setUploadingImage(true);
    try {
      const result = await uploadImage(file, 'casual', 'bsdc/chat');
      playBeep('send');
      await chat.send({ imageUrl: result.url });
    } catch {
      toast.error('Image upload failed');
    } finally {
      setUploadingImage(false);
    }
  }

  const messagesByDay = useMemo(() => {
    const groups: { day: string; messages: ChatMessage[] }[] = [];
    for (const m of chat.messages) {
      if (m.deletedFor?.includes(profile?.uid || '')) continue;
      const day = new Date(m.createdAt).toDateString();
      const last = groups[groups.length - 1];
      if (last && last.day === day) last.messages.push(m);
      else groups.push({ day, messages: [m] });
    }
    return groups;
  }, [chat.messages, profile?.uid]);

  return (
    <>
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-surface-light-border bg-white/70 p-3 backdrop-blur-md dark:border-surface-dark-border dark:bg-surface-dark-muted/70">
        <button
          type="button"
          onClick={() => navigate('/messages')}
          aria-label={t('common.back')}
          className="bsdc-tap -ml-1 rounded-lg p-2 transition-colors hover:bg-neutral-100 dark:hover:bg-surface-dark-raised sm:hidden"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </button>
        {chat.metadata?.type === 'direct' && otherParticipants[0] ? (
          <Link to={`/p/${otherParticipants[0].username}`} className="flex min-w-0 items-center gap-2.5 rounded-lg px-1 py-1 transition-colors hover:bg-neutral-50 dark:hover:bg-surface-dark-raised/60">
            <ParticipantAvatar uid={otherParticipants[0].uid} name={otherParticipants[0].displayName} src={otherParticipants[0].avatar} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold">{otherParticipants[0].displayName}</span>
              <span className="block text-xs text-neutral-400">
                {chat.typing.length > 0 ? (
                  `${chat.typing[0].displayName} ${t('chat.typing')}`
                ) : (
                  <PresenceText uid={otherParticipants[0].uid} language={language} />
                )}
              </span>
            </span>
          </Link>
        ) : (
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-gradient text-white shadow-md shadow-brand-500/20 ring-2 ring-white/50 dark:ring-surface-dark-muted/50">
              {chat.metadata?.type === 'channel' ? <Hash className="h-5 w-5" aria-hidden /> : <Users className="h-5 w-5" aria-hidden />}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold">{chat.metadata?.name || 'Group'}</span>
              <span className="block text-xs text-neutral-400">
                {chat.metadata?.participants.length || 0} {t('chat.members')}
                {chat.typing.length > 0 ? ` · ${chat.typing[0].displayName} ${t('chat.typing')}` : ''}
              </span>
            </span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-1">
          <span className="mr-1 hidden items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-600 ring-1 ring-green-200/60 dark:bg-green-950/40 dark:text-green-400 dark:ring-green-800/40 md:flex">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            {t('chat.secure')}
          </span>
          <Dropdown open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownTrigger asChild>
              <button type="button" aria-label={t('common.more')} className="bsdc-tap rounded-lg p-2 transition-colors hover:bg-neutral-100 dark:hover:bg-surface-dark-raised">
                <MoreVertical className="h-5 w-5" aria-hidden />
              </button>
            </DropdownTrigger>
            <DropdownContent>
              <DropdownItem icon={<Pin className="h-4 w-4" aria-hidden />} onSelect={() => void chat.togglePin(true)}>
                {t('chat.pin')} conversation
              </DropdownItem>
              <DropdownItem icon={<PinOff className="h-4 w-4" aria-hidden />} onSelect={() => void chat.togglePin(false)}>
                Unpin
              </DropdownItem>
              <DropdownItem icon={<Volume2 className="h-4 w-4" aria-hidden />} onSelect={() => void chat.toggleMute(false)}>
                {t('chat.unmute')}
              </DropdownItem>
              <DropdownItem icon={<VolumeOff className="h-4 w-4" aria-hidden />} onSelect={() => void chat.toggleMute(true)}>
                {t('chat.mute')}
              </DropdownItem>
              <DropdownSeparator />
              <DropdownItem danger icon={<LogOut className="h-4 w-4" aria-hidden />} onSelect={() => { if (profile) { void chat.removeMember(profile.uid); navigate('/messages'); } }}>
                {t('chat.leave')}
              </DropdownItem>
            </DropdownContent>
          </Dropdown>
        </div>
      </header>

      {/* Pinned message */}
      {chat.metadata?.pinnedMessageId ? (
        <div className="bsdc-fade-in flex items-center gap-2 border-b border-surface-light-border bg-gradient-to-r from-amber-50 to-amber-100/60 px-4 py-1.5 text-xs font-semibold text-amber-700 dark:border-surface-dark-border dark:from-amber-950/40 dark:to-amber-900/20 dark:text-amber-300">
          <Pin className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">{t('chat.pinned')}: {chat.messages.find((m) => m.id === chat.metadata?.pinnedMessageId)?.text || '—'}</span>
        </div>
      ) : null}

      {/* Messages */}
      <div
        className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-neutral-50/40 via-white to-neutral-50/40 px-2 py-4 dark:from-surface-dark-muted dark:via-surface-dark-muted dark:to-surface-dark-muted/80 sm:px-4"
        role="log"
        aria-live="polite"
      >
        {chat.loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className={cn('h-12 w-2/3', i % 2 && 'ml-auto')} />
            ))}
          </div>
        ) : chat.messages.length === 0 ? (
          <p className="bsdc-fade-in py-14 text-center text-sm text-neutral-400">Say hello — messages are delivered in real time.</p>
        ) : (
          messagesByDay.map((group) => (
            <div key={group.day}>
              <p className="my-3 text-center">
                <span className="rounded-full border border-surface-light-border/60 bg-white/80 px-3 py-1 text-[11px] font-semibold text-neutral-500 shadow-sm backdrop-blur-sm dark:border-surface-dark-border/60 dark:bg-surface-dark-raised/80">
                  {group.day === new Date().toDateString() ? 'Today' : group.day === new Date(Date.now() - 86400000).toDateString() ? 'Yesterday' : new Date(group.day).toLocaleDateString()}
                </span>
              </p>
              {group.messages.map((m) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  isMine={m.senderId === profile?.uid}
                  onReply={() => setReplyTo(m)}
                  onReact={(r) => void chat.react(m.id, r)}
                  onEdit={() => { setEditMsgId(m.id); setEditText(m.text); }}
                  onDelete={(everyone) => void chat.remove(m.id, everyone)}
                  onPin={() => void chat.pin(m.id)}
                  canModerate={chat.metadata?.createdBy === profile?.uid}
                />
              ))}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Typing indicator */}
      {chat.typing.length > 0 ? (
        <div className="bsdc-fade-in px-5 pb-1 text-xs text-brand-600 dark:text-brand-400" aria-live="polite">
          <span className="bsdc-loading-dots">{chat.typing[0].displayName} is typing</span>
        </div>
      ) : null}

      {/* Composer */}
      {chat.canPost ? (
        <div className="border-t border-surface-light-border bg-white/70 p-2.5 backdrop-blur-md dark:border-surface-dark-border dark:bg-surface-dark-muted/70 sm:p-3">
          {replyTo ? (
            <div className="bsdc-fade-in mb-2 flex items-center gap-2 rounded-lg border border-brand-200/60 bg-brand-50/70 px-3 py-1.5 text-xs dark:border-brand-800/40 dark:bg-brand-950/40">
              <Reply className="h-3.5 w-3.5 shrink-0 text-brand-600" aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                <strong>{t('chat.replying')} {replyTo.senderName}:</strong> {replyTo.text || 'Message'}
              </span>
              <button type="button" onClick={() => setReplyTo(null)} aria-label={t('common.cancel')} className="bsdc-tap shrink-0 rounded-full px-1.5 font-bold hover:bg-brand-100 dark:hover:bg-brand-900/40">×</button>
            </div>
          ) : null}
          {editMsgId ? (
            <div className="bsdc-fade-in mb-2 flex items-center gap-2 rounded-lg border border-amber-200/60 bg-amber-50/80 px-3 py-1.5 text-xs dark:border-amber-800/40 dark:bg-amber-950/40">
              <Pencil className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <input
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="min-w-0 flex-1 bg-transparent outline-none"
                aria-label="Edit message"
              />
              <button type="button" onClick={async () => { await chat.edit(editMsgId, editText); setEditMsgId(null); }} className="bsdc-tap font-bold text-brand-600">
                {t('common.save')}
              </button>
              <button type="button" onClick={() => setEditMsgId(null)} className="bsdc-tap font-bold">× </button>
            </div>
          ) : null}
          <form
            className="flex items-end gap-1.5 sm:gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void sendImage(file);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploadingImage}
              aria-label={t('chat.sendImage')}
              className="bsdc-tap rounded-full p-2.5 text-neutral-500 transition-all hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-950/40 dark:hover:text-brand-400"
            >
              <ImagePlus className="h-5 w-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setCodeOpen(true)}
              aria-label={t('chat.sendCode')}
              className="bsdc-tap rounded-full p-2.5 text-neutral-500 transition-all hover:bg-fb-50 hover:text-fb-600 dark:hover:bg-fb-950/40 dark:hover:text-fb-400"
            >
              <Code2 className="h-5 w-5" aria-hidden />
            </button>
            <Textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                chat.notifyTyping(e.target.value.length > 0);
              }}
              placeholder={t('chat.messagePlaceholder')}
              minRows={1}
              maxRows={5}
              aria-label={t('chat.messagePlaceholder')}
              className="flex-1 rounded-2xl transition-all focus-within:shadow-md"
            />
            <Button
              type="submit"
              size="md"
              className="bsdc-tap shrink-0 rounded-full px-4 shadow-md shadow-brand-500/30 transition-all hover:shadow-lg hover:shadow-brand-500/40 disabled:shadow-none"
              aria-label={t('common.send')}
              disabled={!text.trim()}
            >
              <Send className="h-5 w-5" aria-hidden />
            </Button>
          </form>
        </div>
      ) : (
        <div className="border-t border-surface-light-border p-4 text-center text-xs text-neutral-400 dark:border-surface-dark-border">
          {t('chat.channelInfo')}
        </div>
      )}

      {/* Code snippet modal */}
      <Modal open={codeOpen} onOpenChange={setCodeOpen} title={t('chat.sendCode')}>
        <div className="space-y-3">
          <Input label={t('post.language')} value={codeLang} onChange={(e) => setCodeLang(e.target.value)} />
          <Textarea label={t('post.code')} value={codeText} onChange={(e) => setCodeText(e.target.value)} minRows={6} className="font-mono text-xs" />
          <Button
            fullWidth
            onClick={async () => {
              if (!codeText.trim()) return;
              playBeep('send');
              await chat.send({ codeSnippet: codeText, codeLanguage: codeLang });
              setCodeText('');
              setCodeOpen(false);
            }}
          >
            {t('common.send')}
          </Button>
        </div>
      </Modal>
    </>
  );
}

function ParticipantAvatar({ uid, name, src }: { uid: string; name: string; src: string }) {
  const [online, setOnline] = useState<boolean | null>(null);
  useEffect(() => {
    const unsub = onPresence(uid, (p) => setOnline(p.online));
    return unsub;
  }, [uid]);
  return <Avatar src={src} name={name} size={40} online={online} />;
}

function PresenceText({ uid, language }: { uid: string; language: string }) {
  const [info, setInfo] = useState<{ online: boolean; lastSeen: number } | null>(null);
  useEffect(() => {
    const unsub = onPresence(uid, setInfo);
    return unsub;
  }, [uid]);
  if (!info) return null;
  return info.online
    ? <span className="font-semibold text-green-600 dark:text-green-400">{'online'}</span>
    : <span>{`${t0(language)} ${timeAgo(info.lastSeen, language)}`}</span>;
}
function t0(language: string): string {
  return language === 'bn' ? 'শেষ দেখা' : 'last seen';
}

function MessageBubble({
  message,
  isMine,
  onReply,
  onReact,
  onEdit,
  onDelete,
  onPin,
  canModerate,
}: {
  message: ChatMessage;
  isMine: boolean;
  onReply: () => void;
  onReact: (reaction: string) => void;
  onEdit: () => void;
  onDelete: (everyone: boolean) => void;
  onPin: () => void;
  canModerate: boolean;
}) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const reactions = Object.entries(message.reactions || {}).reduce<{ reaction: string; count: number }[]>((acc, [_uid, userReactions]) => {
    const reaction = Object.values(userReactions || {})[0] || '';
    if (!reaction) return acc;
    const found = acc.find((a) => a.reaction === reaction);
    if (found) found.count += 1;
    else acc.push({ reaction, count: 1 });
    return acc;
  }, []);
  const REACT_OPTIONS: { id: string; icon: typeof ThumbsUp; color: string }[] = [
    { id: 'like', icon: ThumbsUp, color: '#1877F2' },
    { id: 'love', icon: Heart, color: '#DB2777' },
    { id: 'celebrate', icon: PartyPopper, color: '#D97706' },
    { id: 'fire', icon: Flame, color: '#EA580C' },
  ];

  return (
    <div className={cn('group bsdc-msg-in mb-2.5 flex items-end gap-2', isMine && 'flex-row-reverse')}>
      <Avatar src={message.senderAvatar} name={message.senderName} size={30} className={cn(isMine && 'hidden sm:inline-flex')} />
      <div className={cn('relative max-w-[82%] sm:max-w-[68%]', isMine && 'items-end')}>
        <div
          className={cn(
            'rounded-2xl px-3.5 py-2 text-sm shadow-sm transition-all duration-200 group-hover:shadow-md',
            isMine
              ? 'rounded-br-md bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-brand-500/20'
              : 'rounded-bl-md bg-white text-neutral-900 ring-1 ring-surface-light-border/60 dark:bg-surface-dark-raised dark:text-neutral-100 dark:ring-surface-dark-border/60',
          )}
        >
          {!isMine ? <p className="mb-0.5 text-xs font-bold text-brand-700 dark:text-brand-300">{message.senderName}</p> : null}
          {message.deleted ? (
            <p className="italic opacity-60">[message deleted]</p>
          ) : (
            <>
              {message.replyToId ? (
                <div className={cn('mb-1.5 rounded-lg border-l-2 px-2 py-1 text-xs', isMine ? 'border-white/60 bg-white/10' : 'border-brand-500 bg-brand-50/70 dark:bg-black/20')}>
                  <strong>{message.replyToSender}</strong>
                  <br />
                  {message.replyToText?.slice(0, 80)}
                </div>
              ) : null}
              {message.imageUrl ? (
                <img src={message.imageUrl} alt="Chat image" loading="lazy" className="mb-1 max-h-64 rounded-xl transition-transform duration-200 hover:scale-[1.02]" />
              ) : null}
              {message.codeSnippet ? (
                <pre className={cn('mb-1 max-w-full overflow-x-auto rounded-lg p-2 font-mono text-xs shadow-inner', isMine ? 'bg-black/25 text-white' : 'bg-[#0d1117] text-neutral-100')}>
                  <code>{message.codeSnippet}</code>
                </pre>
              ) : null}
              {message.text ? <p className="whitespace-pre-wrap break-words">{message.text}</p> : null}
              {message.edited ? <span className={cn('ml-1 text-[10px] italic', isMine ? 'text-white/70' : 'text-neutral-400')}>({t('chat.edited')})</span> : null}
            </>
          )}
          <p className={cn('mt-0.5 text-right text-[10px]', isMine ? 'text-white/70' : 'text-neutral-400')}>
            {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            {isMine ? message.readBy && Object.keys(message.readBy).length > 1 ? <CheckCheck className="ml-1 inline h-3 w-3" aria-hidden /> : <Check className="ml-1 inline h-3 w-3" aria-hidden /> : null}
          </p>
        </div>
        {reactions.length > 0 ? (
          <div className={cn('-mt-1.5 flex gap-0.5', isMine && 'justify-end')}>
            {reactions.map((r) => (
              <span key={r.reaction} className="bsdc-pop inline-flex items-center gap-1 rounded-full border border-surface-light-border bg-white px-1.5 py-0.5 text-[10px] font-bold text-neutral-600 shadow-sm dark:border-surface-dark-border dark:bg-surface-dark-raised dark:text-neutral-300">
                <span className="h-3 w-3" aria-hidden>
                  {r.reaction === 'like' ? <ThumbsUp className="h-3 w-3 text-fb-500" /> : r.reaction === 'love' ? <Heart className="h-3 w-3 text-pink-500" /> : r.reaction === 'celebrate' ? <PartyPopper className="h-3 w-3 text-amber-500" /> : <Flame className="h-3 w-3 text-orange-500" />}
                </span>
                {r.count > 1 ? r.count : ''}
              </span>
            ))}
          </div>
        ) : null}

        {/* Hover actions */}
        <div className={cn('absolute top-1/2 hidden -translate-y-1/2 group-hover:flex', isMine ? 'right-full mr-1 flex-row-reverse' : 'left-full ml-1')}>
          <div className="bsdc-fade-in flex items-center gap-0.5 rounded-full border border-surface-light-border bg-white/95 p-0.5 shadow-lg backdrop-blur-md dark:border-surface-dark-border dark:bg-surface-dark-raised/95">
            {REACT_OPTIONS.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onReact(r.id)}
                aria-label={`React ${r.id}`}
                className="bsdc-tap rounded-full px-1.5 py-1 transition-transform hover:scale-125"
                style={{ color: r.color }}
              >
                <r.icon className="h-3.5 w-3.5" aria-hidden />
              </button>
            ))}
          </div>
          <Dropdown open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownTrigger asChild>
              <button type="button" aria-label={t('common.more')} className="bsdc-tap rounded-full bg-white/95 p-1 text-neutral-400 shadow-md backdrop-blur-md dark:bg-surface-dark-raised/95 dark:text-neutral-400">
                <MoreVertical className="h-3.5 w-3.5" aria-hidden />
              </button>
            </DropdownTrigger>
            <DropdownContent>
              <DropdownItem icon={<Reply className="h-4 w-4" aria-hidden />} onSelect={onReply}>
                {t('chat.reply')}
              </DropdownItem>
              {isMine && message.text ? (
                <DropdownItem icon={<Pencil className="h-4 w-4" aria-hidden />} onSelect={onEdit}>
                  {t('chat.edit')}
                </DropdownItem>
              ) : null}
              {canModerate ? (
                <DropdownItem icon={<Pin className="h-4 w-4" aria-hidden />} onSelect={onPin}>
                  {t('chat.pin')}
                </DropdownItem>
              ) : null}
              <DropdownItem icon={<Trash2 className="h-4 w-4" aria-hidden />} onSelect={() => onDelete(false)}>
                {t('chat.deleteForMe')}
              </DropdownItem>
              {isMine ? (
                <DropdownItem danger icon={<Trash2 className="h-4 w-4" aria-hidden />} onSelect={() => onDelete(true)}>
                  {t('chat.deleteForEveryone')}
                </DropdownItem>
              ) : null}
            </DropdownContent>
          </Dropdown>
        </div>
      </div>
    </div>
  );
}

function NewChatModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation();
  const profile = useAuthStore((s) => s.profile);
  const navigate = useNavigate();
  const { openDirectChat } = useChat(null);
  const [users, setUsers] = useState<{ uid: string; displayName: string; username: string; avatar: string }[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !profile) return;
    setLoading(true);
    void fetchActiveUsers(80)
      .then((list) => setUsers(list.filter((u) => u.uid !== profile.uid).map((u) => ({ uid: u.uid, displayName: u.displayName, username: u.username, avatar: u.avatar }))))
      .finally(() => setLoading(false));
  }, [open, profile]);

  const filtered = filter ? users.filter((u) => u.displayName.toLowerCase().includes(filter.toLowerCase()) || u.username.includes(filter.toLowerCase())) : users;

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={t('chat.newChat')}>
      <Input placeholder={t('common.search')} value={filter} onChange={(e) => setFilter(e.target.value)} leftIcon={<Search className="h-4 w-4" aria-hidden />} />
      {loading ? (
        <div className="mt-3 space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : (
        <ul className="mt-3 max-h-80 space-y-1 overflow-y-auto">
          {filtered.map((u, idx) => (
            <li key={u.uid} className="bsdc-fade-in" style={{ animationDelay: `${Math.min(idx * 20, 200)}ms` }}>
              <button
                type="button"
                onClick={async () => {
                  const chatId = await openDirectChat(u);
                  onOpenChange(false);
                  if (chatId) navigate(`/messages/${chatId}`);
                }}
                className="bsdc-tap flex w-full items-center gap-2.5 rounded-lg p-2 text-left transition-all hover:bg-brand-50 hover:shadow-sm dark:hover:bg-brand-950/30"
              >
                <Avatar src={u.avatar} name={u.displayName} size={36} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{u.displayName}</span>
                  <span className="block truncate text-xs text-neutral-400">@{u.username}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function NewGroupModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation();
  const profile = useAuthStore((s) => s.profile);
  const navigate = useNavigate();
  const { createChat } = useChat(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'group' | 'channel'>('group');
  const [selected, setSelected] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const { chats } = useChatList();

  useEffect(() => {
    if (!open) {
      setName('');
      setDescription('');
      setSelected([]);
      setType('group');
    }
  }, [open]);

  const participants = useMemo(() => {
    const ids = new Set<string>();
    for (const chat of chats) {
      for (const id of chat.participantIds || []) if (id !== profile?.uid) ids.add(id);
    }
    return [...ids];
  }, [chats, profile?.uid]);

  const [people, setPeople] = useState<{ uid: string; displayName: string; username: string; avatar: string }[]>([]);
  useEffect(() => {
    if (!open || participants.length === 0) return;
    void fetchActiveUsers(80).then((list) => {
      const recentIds = new Set(participants);
      setPeople(list.filter((u) => recentIds.has(u.uid)).map((u) => ({ uid: u.uid, displayName: u.displayName, username: u.username, avatar: u.avatar })));
    });
  }, [open, participants]);

  async function create() {
    if (!profile || !name.trim()) {
      toast.error(t('chat.groupName') + ' ' + t('common.required'));
      return;
    }
    setCreating(true);
    try {
      const chatId = await createChat(name.trim(), description, people.filter((p) => selected.includes(p.uid)), type);
      onOpenChange(false);
      if (chatId) navigate(`/messages/${chatId}`);
      toast.success(type === 'channel' ? t('chat.newChannel') : t('chat.newGroup'));
    } finally {
      setCreating(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={type === 'channel' ? t('chat.newChannel') : t('chat.newGroup')}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button loading={creating} onClick={() => void create()}>
            {t('common.create')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex gap-2">
          <Button size="sm" variant={type === 'group' ? 'primary' : 'outline'} onClick={() => setType('group')}>
            {t('chat.newGroup')}
          </Button>
          <Button size="sm" variant={type === 'channel' ? 'primary' : 'outline'} onClick={() => setType('channel')}>
            {t('chat.newChannel')}
          </Button>
        </div>
        <Input label={t('chat.groupName')} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        <Input label={t('chat.groupDescription')} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={160} />
        <div>
          <p className="bsdc-label">{t('chat.addMembers')} ({selected.length})</p>
          <ul className="max-h-52 space-y-1 overflow-y-auto rounded-xl border border-surface-light-border p-1.5 dark:border-surface-dark-border">
            {people.length === 0 ? <li className="p-2 text-xs text-neutral-400">Start direct chats first — your contacts appear here.</li> : null}
            {people.map((p) => (
              <li key={p.uid}>
                <label className="flex cursor-pointer items-center gap-2.5 rounded-lg p-2 transition-all hover:bg-brand-50 dark:hover:bg-brand-950/30">
                  <input
                    type="checkbox"
                    checked={selected.includes(p.uid)}
                    onChange={(e) => setSelected((prev) => (e.target.checked ? [...prev, p.uid] : prev.filter((id) => id !== p.uid)))}
                    className="h-4 w-4 accent-brand-600"
                  />
                  <Avatar src={p.avatar} name={p.displayName} size={30} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{p.displayName}</span>
                    <span className="block truncate text-xs text-neutral-400">@{p.username}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Modal>
  );
}
