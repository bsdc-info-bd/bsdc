/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, Check, CheckCheck, Code2, ImagePlus, MessageSquarePlus, MoreVertical, Pin, PinOff,
  Reply, Search, Send, ShieldCheck, Trash2, Users, Pencil, VolumeOff, Volume2, LogOut, Hash,
  ThumbsUp, Heart, PartyPopper, Flame, Smile, ChevronDown, FileText, Archive, ArchiveRestore,
} from 'lucide-react';
import { toast } from 'sonner';
import { useChat, useChatList } from '@/hooks/useChat';
import { MicButton, RecordingOverlay } from '@/components/chat/VoiceRecorder';
import { useVoiceRecorder } from '@/components/chat/useVoiceRecorder';
import { VoiceCallPanel } from '@/components/chat/VoiceCallPanel';
import { useVoiceCall } from '@/hooks/useVoiceCall';
import { ImageEditorModal } from '@/components/chat/ImageEditorModal';
import { VoiceNotePlayer, FileCard, ImageWithZoom } from '@/components/chat/MessageMedia';
import { uploadVoiceNote, uploadPdf } from '@/lib/cloudinary-chat';
import { playBeep, unlockAudio } from '@/lib/chatSounds';
import { setChatArchived } from '@/lib/realtime';
import { openStandalone } from '@/lib/permissions';
import { fetchActiveUsers } from '@/lib/data';
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
import { onPresence } from '@/lib/realtime';
import type { ChatMessage, UserChatEntry } from '@/types/chat';
import { useUIStore } from '@/stores/uiStore';

/* -------------------------------------------------------------------------- */
/*  Ultra Audio Engine — Web Audio API with dual-tone envelopes                 */
/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */
/*  Advanced Keyframes & Ultra Responsive Styling                               */
/* -------------------------------------------------------------------------- */
const BSDC_CHAT_STYLES = `
@keyframes bsdc-bubble-in-left {
  0% { opacity: 0; transform: translate3d(-12px, 10px, 0) scale(.9); }
  60% { transform: translate3d(2px, -2px, 0) scale(1.02); }
  100% { opacity: 1; transform: translate3d(0,0,0) scale(1); }
}
@keyframes bsdc-bubble-in-right {
  0% { opacity: 0; transform: translate3d(12px, 10px, 0) scale(.9); }
  60% { transform: translate3d(-2px, -2px, 0) scale(1.02); }
  100% { opacity: 1; transform: translate3d(0,0,0) scale(1); }
}
@keyframes bsdc-wave-bounce {
  0%, 60%, 100% { transform: translateY(0) scale(1); opacity: 0.5; }
  30% { transform: translateY(-6px) scale(1.2); opacity: 1; }
}
@keyframes bsdc-fade-slide-up {
  0% { opacity: 0; transform: translateY(10px); }
  100% { opacity: 1; transform: translateY(0); }
}
@keyframes bsdc-scale-in {
  0% { opacity: 0; transform: scale(.85); }
  100% { opacity: 1; transform: scale(1); }
}
@keyframes bsdc-glow-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(37,99,235,0.5); }
  50% { box-shadow: 0 0 0 6px rgba(37,99,235,0); }
}
@keyframes bsdc-shimmer {
  0% { background-position: -400% 0; }
  100% { background-position: 400% 0; }
}
@keyframes bsdc-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}
@keyframes bsdc-ripple {
  0% { transform: scale(0); opacity: 1; }
  100% { transform: scale(4); opacity: 0; }
}
@keyframes bsdc-slide-down {
  0% { opacity: 0; transform: translateY(-8px); }
  100% { opacity: 1; transform: translateY(0); }
}

.bsdc-bubble-in-left { animation: bsdc-bubble-in-left .35s cubic-bezier(.16,1.2,.3,1) both; }
.bsdc-bubble-in-right { animation: bsdc-bubble-in-right .35s cubic-bezier(.16,1.2,.3,1) both; }
.bsdc-fade-slide-up { animation: bsdc-fade-slide-up .3s ease-out both; }
.bsdc-scale-in { animation: bsdc-scale-in .25s cubic-bezier(.16,1,.3,1) both; }
.bsdc-slide-down { animation: bsdc-slide-down .25s ease-out both; }
.bsdc-glow-pulse { animation: bsdc-glow-pulse 2s ease-in-out infinite; }
.bsdc-float { animation: bsdc-float 3s ease-in-out infinite; }

.bsdc-bounce-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: currentColor;
  animation: bsdc-wave-bounce 1.4s infinite ease-in-out;
}
.bsdc-bounce-dot:nth-child(2) { animation-delay: 0.15s; }
.bsdc-bounce-dot:nth-child(3) { animation-delay: 0.3s; }

.bsdc-shimmer-bg {
  background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%);
  background-size: 200% 100%;
  animation: bsdc-shimmer 2s infinite;
}

.bsdc-glass {
  backdrop-filter: blur(16px) saturate(180%);
  -webkit-backdrop-filter: blur(16px) saturate(180%);
  background: rgba(255,255,255,0.82);
  border-color: rgba(0,0,0,0.06);
}
.dark .bsdc-glass {
  background: rgba(12,14,20,0.85);
  border-color: rgba(255,255,255,0.06);
}

.bsdc-hover-lift {
  transition: transform .2s cubic-bezier(.16,1,.3,1), box-shadow .2s ease, background-color .2s ease;
}
.bsdc-hover-lift:hover { transform: translateY(-1.5px); }
.bsdc-hover-lift:active { transform: translateY(0) scale(.97); }

.bsdc-gradient-active {
  background: linear-gradient(135deg, rgba(37,99,235,0.14), rgba(124,58,237,0.10));
  border: 1px solid rgba(37,99,235,0.15);
}
.dark .bsdc-gradient-active {
  background: linear-gradient(135deg, rgba(37,99,235,0.22), rgba(124,58,237,0.18));
  border: 1px solid rgba(37,99,235,0.3);
}

.bsdc-msg-mine {
  background: linear-gradient(135deg, #2563eb 0%, #4f46e5 60%, #6366f1 100%);
  box-shadow: 0 6px 18px -6px rgba(37,99,235,0.5), 0 2px 6px -2px rgba(79,70,229,0.3);
}
.bsdc-msg-other {
  box-shadow: 0 3px 10px -4px rgba(0,0,0,0.1);
}
.dark .bsdc-msg-other {
  box-shadow: 0 3px 10px -4px rgba(0,0,0,0.4);
}

.bsdc-react-btn { transition: transform .15s cubic-bezier(.16,1.5,.3,1); }
.bsdc-react-btn:hover { transform: scale(1.3) rotate(-4deg); }
.bsdc-react-btn:active { transform: scale(.9); }

.bsdc-tap { transition: transform .1s cubic-bezier(.16,1,.3,1); }
.bsdc-tap:active { transform: scale(.94); }

.bsdc-send-btn {
  background: linear-gradient(135deg, #2563eb, #4f46e5);
  box-shadow: 0 4px 12px -2px rgba(37,99,235,0.5);
  transition: all .2s cubic-bezier(.16,1,.3,1);
}
.bsdc-send-btn:hover:not(:disabled) {
  transform: scale(1.05) rotate(-2deg);
  box-shadow: 0 6px 16px -2px rgba(37,99,235,0.6);
}
.bsdc-send-btn:active:not(:disabled) { transform: scale(.94); }
.bsdc-send-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.bsdc-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
.bsdc-scrollbar::-webkit-scrollbar-track { background: transparent; }
.bsdc-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(120,120,140,0.3);
  border-radius: 999px;
  transition: background .2s;
}
.bsdc-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(120,120,140,0.6); }

.bsdc-unread-badge {
  background: linear-gradient(135deg, #2563eb, #4f46e5);
  box-shadow: 0 2px 8px -2px rgba(37,99,235,0.5);
  animation: bsdc-float 2s ease-in-out infinite;
}

.bsdc-scroll-btn {
  position: absolute;
  bottom: 90px;
  right: 16px;
  width: 40px;
  height: 40px;
  border-radius: 999px;
  background: rgba(255,255,255,0.95);
  backdrop-filter: blur(10px);
  box-shadow: 0 4px 14px -2px rgba(0,0,0,0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  animation: bsdc-fade-slide-up .25s ease-out both;
  transition: transform .18s cubic-bezier(.16,1,.3,1);
}
.dark .bsdc-scroll-btn {
  background: rgba(30,30,40,0.95);
  box-shadow: 0 4px 14px -2px rgba(0,0,0,0.5);
}
.bsdc-scroll-btn:hover { transform: translateY(-2px) scale(1.05); }
.bsdc-scroll-btn:active { transform: scale(.92); }

.bsdc-composer-textarea {
  transition: border-color .18s ease, box-shadow .18s ease;
}
.bsdc-composer-textarea:focus {
  box-shadow: 0 0 0 3px rgba(37,99,235,0.12);
}

/* Safe-area for iPhone notches / gesture bar */
.bsdc-pb-safe {
  padding-bottom: max(0.5rem, env(safe-area-inset-bottom, 0.5rem));
}
.bsdc-pt-safe {
  padding-top: max(0px, env(safe-area-inset-top, 0px));
}

/* Ultra-tiny screens (250px+) support */
@media (max-width: 360px) {
  .bsdc-compact-hide { display: none !important; }
  .bsdc-composer-icon-btn { padding: 0.4rem !important; }
}

/* Fluid typography for large screens */
@media (min-width: 1800px) {
  .bsdc-fluid-text { font-size: 15px; }
}
`;

function BSDCStyleInjector() {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (document.getElementById('bsdc-chat-styles')) return;
    const s = document.createElement('style');
    s.id = 'bsdc-chat-styles';
    s.innerHTML = BSDC_CHAT_STYLES;
    document.head.appendChild(s);
  }, []);
  return null;
}

/* -------------------------------------------------------------------------- */

export default function Messages() {
  const { chatId } = useParams<{ chatId?: string }>();
  const [searchParams] = useSearchParams();
  const activeChat = chatId || searchParams.get('chat') || null;

  // Unlock browser audio policy on first gesture (shared engine)
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    window.addEventListener('touchstart', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };
  }, []);

  return (
    <>
      <BSDCStyleInjector />
      <SEOHead title="Messages — BSDC" description="Your BSDC conversations." path="/messages" noindex />
      {/* 
        Ultra-responsive container:
        - Uses dvh/svh for mobile viewport stability during keyboard show/hide
        - Fixed positioning ensures no bottom nav collision
        - Overflow controlled at root
      */}
      <div
        className="fixed inset-x-0 top-0 z-30 flex flex-col overflow-hidden bg-white dark:bg-[#09090b] bsdc-pt-safe"
        style={{ height: '100dvh', minHeight: '100svh' }}
      >
        <div className="mx-auto flex w-full max-w-[1800px] flex-1 overflow-hidden px-0 pt-14 sm:p-4 sm:pt-16 lg:p-6 lg:pt-20">
          <div className="flex h-full min-h-0 w-full overflow-hidden border-surface-light-border bg-white dark:border-surface-dark-border dark:bg-surface-dark-muted sm:rounded-2xl sm:border sm:shadow-2xl">
            {/* Chat list sidebar */}
            <aside
              className={cn(
                'flex h-full min-h-0 w-full flex-col border-r border-surface-light-border dark:border-surface-dark-border sm:w-64 sm:shrink-0 md:w-72 lg:w-80 xl:w-96',
                activeChat && 'hidden sm:flex',
              )}
              aria-label="Conversations"
            >
              <ChatListPanel activeChatId={activeChat} />
            </aside>
            {/* Active chat pane */}
            <section
              className={cn(
                'flex h-full min-h-0 min-w-0 flex-1 flex-col relative',
                !activeChat && 'hidden sm:flex',
              )}
              aria-label="Conversation"
            >
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
    <div className="flex flex-1 items-center justify-center p-6 bsdc-fade-slide-up">
      <EmptyState
        title={t('chat.noChats')}
        body={t('chat.noChatsBody')}
        icon={
          <div className="rounded-3xl bg-gradient-to-br from-brand-500/15 to-purple-500/15 p-6 bsdc-float">
            <MessageSquarePlus className="h-14 w-14 text-brand-600" aria-hidden />
          </div>
        }
      />
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

  // Active vs archived split (archived chats live in their own collapsible section)
  const [showArchived, setShowArchived] = useState(false);
  const activeChats = filtered.filter((c) => !c.archived);
  const archivedChats = filtered.filter((c) => c.archived);

  // Real-time incoming alerts: beep + in-app toast for messages in other chats
  // (or when the window is in the background), with a jump-to-chat action.
  const prevTimestamps = useRef<Record<string, number>>({});
  const initialized = useRef(false);
  useEffect(() => {
    if (!profile) return;
    if (!initialized.current) {
      chats.forEach((c) => {
        prevTimestamps.current[c.chatId] = c.lastMessageAt || 0;
      });
      if (chats.length > 0) initialized.current = true;
      return;
    }
    for (const c of chats) {
      const prev = prevTimestamps.current[c.chatId] || 0;
      prevTimestamps.current[c.chatId] = c.lastMessageAt || 0;
      if ((c.lastMessageAt || 0) <= prev) continue;
      if (c.muted) continue;
      if (c.lastSender === profile.displayName) continue;
      if (c.chatId === activeChatId && !document.hidden) continue;
      playBeep('received');
      toast.message(c.name || c.lastSender || 'New message', {
        description: c.lastMessage?.slice(0, 90),
        action: {
          label: 'Open',
          onClick: () => navigate(`/messages/${c.chatId}`),
        },
      });
    }
  }, [chats, profile, activeChatId, navigate]);

  if (!profile) {
    navigate('/login');
    return null;
  }

  return (
    <>
      <div className="bsdc-glass border-b border-surface-light-border p-2.5 sm:p-3 dark:border-surface-dark-border shrink-0">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h1 className="bg-gradient-to-r from-brand-600 via-indigo-600 to-purple-600 bg-clip-text text-base font-extrabold text-transparent sm:text-lg">
            {t('chat.title')}
          </h1>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setNewOpen(true)}
              aria-label={t('chat.newChat')}
              className="bsdc-tap bsdc-hover-lift rounded-xl p-2 text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-950/50"
            >
              <MessageSquarePlus className="h-5 w-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setGroupOpen(true)}
              aria-label={t('chat.newGroup')}
              className="bsdc-tap bsdc-hover-lift rounded-xl p-2 text-fb-600 hover:bg-fb-50 dark:hover:bg-fb-950/50"
            >
              <Users className="h-5 w-5" aria-hidden />
            </button>
          </div>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" aria-hidden />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t('chat.searchChats')}
            aria-label={t('chat.searchChats')}
            className="bsdc-input h-9 w-full rounded-full pl-9 pr-3 text-sm transition-shadow focus:shadow-md"
          />
        </div>
      </div>

      <div className="bsdc-scrollbar min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-2 p-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState title={t('chat.noChats')} body={t('chat.noChatsBody')} icon={<MessageSquarePlus className="h-10 w-10" aria-hidden />} />
        ) : (
          <>
          {archivedChats.length > 0 ? (
            <button
              type="button"
              onClick={() => setShowArchived((v) => !v)}
              className="mx-2 mb-1 mt-1.5 flex w-[calc(100%-1rem)] items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-bold text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-surface-dark-raised"
              aria-expanded={showArchived}
            >
              <Archive className="h-4 w-4" aria-hidden />
              {t('chat.archived')}
              <span className="ml-auto rounded-full bg-neutral-200 px-1.5 py-0.5 text-[10px] dark:bg-neutral-700">{archivedChats.length}</span>
              <span className={cn('transition-transform', showArchived && 'rotate-180')} aria-hidden>▾</span>
            </button>
          ) : null}
          {showArchived && archivedChats.length > 0 ? (
            <ul className="mb-2 space-y-0.5 border-b border-surface-light-border p-1.5 opacity-75 dark:border-surface-dark-border">
              {archivedChats.map((chat) => (
                <li key={chat.chatId} className="bsdc-fade-slide-up">
                  <div className="group/chip relative">
                    <button
                      type="button"
                      onClick={() => navigate(`/messages/${chat.chatId}`)}
                      className="bsdc-tap flex w-full items-center gap-2.5 rounded-xl p-2.5 text-left hover:bg-neutral-100/60 dark:hover:bg-surface-dark-raised/60"
                    >
                      <ChatAvatar name={chat.name || chatTitle(chat)} type={chat.type} ids={chat.participantIds || []} meId={profile.uid} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{chat.name || chatTitle(chat)}</span>
                        <span className="block truncate text-xs text-neutral-400">{chat.lastMessage || '…'}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={t('chat.unarchive')}
                      onClick={() => void setChatArchived(profile.uid, chat.chatId, false)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-1.5 text-brand-600 opacity-0 shadow-sm transition-opacity group-hover/chip:opacity-100 dark:bg-surface-dark/80 dark:text-brand-400"
                    >
                      <ArchiveRestore className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
          <ul className="space-y-0.5 p-1.5">
            {activeChats.map((chat, idx) => (
              <li key={chat.chatId} className="bsdc-fade-slide-up" style={{ animationDelay: `${Math.min(idx * 20, 200)}ms` }}>
                <button
                  type="button"
                  onClick={() => navigate(`/messages/${chat.chatId}`)}
                  className={cn(
                    'bsdc-tap bsdc-hover-lift flex w-full items-center gap-2.5 rounded-xl p-2.5 text-left sm:p-3',
                    chat.chatId === activeChatId
                      ? 'bsdc-gradient-active shadow-sm'
                      : 'hover:bg-neutral-100/60 dark:hover:bg-surface-dark-raised/60',
                  )}
                >
                  <ChatAvatar name={chat.name || chatTitle(chat)} type={chat.type} ids={chat.participantIds || []} meId={profile.uid} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-bold text-neutral-900 dark:text-neutral-100">{chat.name || chatTitle(chat)}</span>
                      <span className="shrink-0 text-[10px] font-medium text-neutral-400">{timeAgo(chat.lastMessageAt, language)}</span>
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                        {chat.lastSender && chat.type !== 'channel' ? `${chat.lastSender.split(' ')[0]}: ` : ''}
                        {chat.lastMessage || '…'}
                      </span>
                      {chat.unreadCount > 0 ? (
                        <span className="bsdc-unread-badge flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white">
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
          </>
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
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 via-indigo-500 to-purple-600 text-white shadow-md sm:h-11 sm:w-11">
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
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [newMsgCount, setNewMsgCount] = useState(0);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [editMsgId, setEditMsgId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const lastMsgCountRef = useRef<number>(0);
  const lastMsgIdRef = useRef<string | null>(null);
  const isFirstLoadRef = useRef(true);

  // Scroll utility with rAF for smoothness
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior, block: 'end' });
    });
  }, []);

  // Intelligent auto-scroll: only scroll if user is near bottom OR sent by me OR first load
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container || chat.messages.length === 0) return;

    const threshold = 200;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    const isAtBottom = distanceFromBottom <= threshold;

    const lastMsg = chat.messages[chat.messages.length - 1];
    const sentByMe = lastMsg.senderId === profile?.uid;

    if (isFirstLoadRef.current) {
      scrollToBottom('auto');
      isFirstLoadRef.current = false;
      return;
    }

    if (isAtBottom || sentByMe) {
      scrollToBottom('smooth');
      setNewMsgCount(0);
      setShowScrollBtn(false);
    } else if (chat.messages.length > lastMsgCountRef.current && !sentByMe) {
      // New message arrived while user is reading up
      setNewMsgCount((c) => c + 1);
      setShowScrollBtn(true);
    }
  // Deliberately keyed on messages.length (count changes), not array identity.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.messages.length, profile?.uid, scrollToBottom]);

  // Track scroll position for scroll-to-bottom button
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const onScroll = () => {
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      if (distanceFromBottom <= 200) {
        setShowScrollBtn(false);
        setNewMsgCount(0);
      } else if (distanceFromBottom > 300) {
        setShowScrollBtn(true);
      }
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, []);

  // Play beep on new incoming message
  useEffect(() => {
    const msgs = chat.messages;
    if (!msgs.length) {
      lastMsgCountRef.current = 0;
      lastMsgIdRef.current = null;
      return;
    }
    const last = msgs[msgs.length - 1];
    const prevCount = lastMsgCountRef.current;
    const prevId = lastMsgIdRef.current;
    if (
      prevCount > 0 &&
      msgs.length > prevCount &&
      last.id !== prevId &&
      last.senderId !== profile?.uid
    ) {
      playBeep('received');
    }
    lastMsgCountRef.current = msgs.length;
    lastMsgIdRef.current = last.id;
  }, [chat.messages, profile?.uid]);

  const otherParticipants = useMemo(
    () => (chat.metadata?.participants || []).filter((p) => p.uid !== profile?.uid),
    [chat.metadata, profile?.uid],
  );
  const voiceCall = useVoiceCall(profile?.uid || null, chat.metadata?.type === 'direct' ? otherParticipants[0] || null : null);

  async function send() {
    const value = text.trim();
    if (!value || !profile) return;
    setText('');
    setReplyTo(null);
    await chat.send({
      text: value,
      replyTo: replyTo ? { id: replyTo.id, text: replyTo.text || 'Message', sender: replyTo.senderName } : null,
    });
    playBeep('sent');
  }

  async function sendImage(file: File) {
    if (!profile) return;
    setUploadingImage(true);
    try {
      const result = await uploadImage(file, 'casual', 'bsdc/chat');
      await chat.send({
        imageUrl: result.url,
        replyTo: replyTo ? { id: replyTo.id, text: replyTo.text || 'Message', sender: replyTo.senderName } : null,
      });
      playBeep('sent');
    } catch {
      toast.error('Image upload failed');
    } finally {
      setUploadingImage(false);
    }
  }

  // ---------- Voice notes ----------
  const [voiceUploading, setVoiceUploading] = useState(false);
  const recorder = useVoiceRecorder(
    async (note) => {
      if (!profile) return;
      setVoiceUploading(true);
      try {
        const result = await uploadVoiceNote(note.blob, note.durationSec);
        await chat.send({
          audioUrl: result.url,
          audioDuration: result.duration,
          audioMime: note.mime,
          replyTo: replyTo ? { id: replyTo.id, text: replyTo.text || 'Message', sender: replyTo.senderName } : null,
        });
        playBeep('sent');
      } catch {
        toast.error('Voice upload failed — check your connection');
      } finally {
        setVoiceUploading(false);
      }
    },
    (code, message, openTab) => {
      if (code === 'TOO_SHORT') {
        toast.info('Hold the mic a little longer');
        return;
      }
      toast.error(message, {
        duration: 7000,
        action: openTab
          ? { label: 'Open in new tab', onClick: () => openStandalone() }
          : undefined,
      });
    },
  );

  // ---------- PDF attachments ----------
  const [pdfUploading, setPdfUploading] = useState(false);
  const [pdfProgress, setPdfProgress] = useState(0);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);
  async function sendPdf(file: File) {
    if (!profile) return;
    setPdfUploading(true);
    setPdfProgress(0);
    try {
      const result = await uploadPdf(file, setPdfProgress);
      await chat.send({
        fileUrl: result.url,
        fileName: file.name,
        fileSize: file.size,
        fileType: 'pdf',
        replyTo: replyTo ? { id: replyTo.id, text: replyTo.text || 'Message', sender: replyTo.senderName } : null,
      });
      playBeep('sent');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'PDF upload failed');
    } finally {
      setPdfUploading(false);
      setPdfProgress(0);
    }
  }

  // ---------- Image preview & edit ----------
  const [editingImage, setEditingImage] = useState<File | null>(null);

  // ---------- Archive ----------
  const [archivedLocal, setArchivedLocal] = useState(false);
  async function toggleArchive() {
    if (!profile) return;
    const next = !archivedLocal;
    setArchivedLocal(next);
    await setChatArchived(profile.uid, chatId, next).catch(() => {
      setArchivedLocal(!next);
      toast.error('Could not update archive');
    });
    toast.success(next ? t('chat.archivedToast') : t('chat.unarchivedToast'));
    if (next) navigate('/messages');
  }

  // Enter to send, Shift+Enter for newline
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

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
      <header className="bsdc-glass flex items-center gap-2 border-b border-surface-light-border p-2.5 shrink-0 dark:border-surface-dark-border sm:gap-3 sm:p-3">
        <button
          type="button"
          onClick={() => navigate('/messages')}
          aria-label={t('common.back')}
          className="bsdc-tap -ml-1 rounded-xl p-2 hover:bg-neutral-100 dark:hover:bg-surface-dark-raised sm:hidden"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </button>
        {chat.metadata?.type === 'direct' && otherParticipants[0] ? (
          <Link
            to={`/p/${otherParticipants[0].username || ''}`}
            className="bsdc-hover-lift flex min-w-0 items-center gap-2.5 rounded-xl p-1 -m-1"
          >
            <ParticipantAvatar
              uid={otherParticipants[0].uid}
              name={otherParticipants[0].displayName || ''}
              src={otherParticipants[0].avatar || ''}
            />
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold text-neutral-900 dark:text-neutral-100 sm:text-[15px]">
                {otherParticipants[0].displayName}
              </span>
              <span className="block text-[11px] text-neutral-400 sm:text-xs">
                {chat.typing.length > 0 ? (
                  <span className="inline-flex items-center gap-1 text-brand-600 dark:text-brand-400">
                    {chat.typing[0].displayName} {t('chat.typing')}
                  </span>
                ) : (
                  <PresenceText uid={otherParticipants[0].uid} language={language} />
                )}
              </span>
            </span>
          </Link>
        ) : (
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 via-indigo-500 to-purple-600 text-white shadow-md">
              {chat.metadata?.type === 'channel' ? <Hash className="h-5 w-5" aria-hidden /> : <Users className="h-5 w-5" aria-hidden />}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold text-neutral-900 dark:text-neutral-100 sm:text-[15px]">
                {chat.metadata?.name || 'Group'}
              </span>
              <span className="block text-[11px] text-neutral-400 sm:text-xs">
                {chat.metadata?.participants.length || 0} {t('chat.members')}
                {chat.typing.length > 0 ? ` · ${chat.typing[0].displayName} ${t('chat.typing')}` : ''}
              </span>
            </span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-1">
          <span className="bsdc-compact-hide mr-1 hidden items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-600 dark:bg-green-950/40 dark:text-green-400 md:flex">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            {t('chat.secure')}
          </span>
          <VoiceCallPanel
            state={voiceCall.state}
            muted={voiceCall.muted}
            metrics={voiceCall.metrics}
            incoming={voiceCall.incoming}
            peer={chat.metadata?.type === 'direct' ? otherParticipants[0] || null : null}
            onStart={() => void voiceCall.start()}
            onAccept={() => void voiceCall.accept()}
            onDecline={() => void voiceCall.decline()}
            onEnd={() => void voiceCall.end()}
            onMute={voiceCall.toggleMute}
          />
          <Dropdown open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownTrigger asChild>
              <button
                type="button"
                aria-label={t('common.more')}
                className="bsdc-tap rounded-xl p-2 hover:bg-neutral-100 dark:hover:bg-surface-dark-raised"
              >
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
              <DropdownItem
                icon={archivedLocal ? <ArchiveRestore className="h-4 w-4" aria-hidden /> : <Archive className="h-4 w-4" aria-hidden />}
                onSelect={() => void toggleArchive()}
              >
                {archivedLocal ? t('chat.unarchive') : t('chat.archive')}
              </DropdownItem>
              <DropdownItem
                danger
                icon={<LogOut className="h-4 w-4" aria-hidden />}
                onSelect={() => {
                  if (profile) {
                    void chat.removeMember(profile.uid);
                    navigate('/messages');
                  }
                }}
              >
                {t('chat.leave')}
              </DropdownItem>
            </DropdownContent>
          </Dropdown>
        </div>
      </header>
      <audio ref={voiceCall.remoteAudioRef} autoPlay playsInline className="hidden" aria-hidden="true" />

      {/* Pinned message bar */}
      {chat.metadata?.pinnedMessageId ? (
        <div className="bsdc-slide-down flex items-center gap-2 border-b border-surface-light-border bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-2 text-xs font-semibold text-amber-800 shrink-0 dark:border-surface-dark-border dark:from-amber-950/30 dark:to-orange-950/30 dark:text-amber-300">
          <Pin className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
          <span className="truncate">
            {t('chat.pinned')}: {chat.messages.find((m) => m.id === chat.metadata?.pinnedMessageId)?.text || '—'}
          </span>
        </div>
      ) : null}

      {/* Messages scrollable area */}
      <div
        ref={messagesContainerRef}
        className="bsdc-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2.5 py-3 sm:px-4 sm:py-4 lg:px-6"
        role="log"
        aria-live="polite"
      >
        {chat.loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className={cn('h-14 w-2/3 rounded-2xl', i % 2 && 'ml-auto')} />
            ))}
          </div>
        ) : chat.messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center bsdc-fade-slide-up">
            <div className="mb-3 rounded-full bg-brand-50 p-4 bsdc-float dark:bg-brand-950/40">
              <MessageSquarePlus className="h-8 w-8 text-brand-600" aria-hidden />
            </div>
            <p className="text-sm text-neutral-400">Say hello — messages are delivered in real time.</p>
          </div>
        ) : (
          messagesByDay.map((group) => (
            <div key={group.day} className="space-y-2">
              <p className="my-3 text-center">
                <span className="rounded-full bg-neutral-100/80 px-3 py-1 text-[11px] font-semibold text-neutral-500 backdrop-blur dark:bg-surface-dark-raised/80">
                  {group.day === new Date().toDateString()
                    ? 'Today'
                    : group.day === new Date(Date.now() - 86400000).toDateString()
                      ? 'Yesterday'
                      : new Date(group.day).toLocaleDateString()}
                </span>
              </p>
              {group.messages.map((m) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  isMine={m.senderId === profile?.uid}
                  onReply={() => setReplyTo(m)}
                  onReact={(r) => void chat.react(m.id, r)}
                  onEdit={() => {
                    setEditMsgId(m.id);
                    setEditText(m.text);
                  }}
                  onDelete={(everyone) => void chat.remove(m.id, everyone)}
                  onPin={() => void chat.pin(m.id)}
                  canModerate={chat.metadata?.createdBy === profile?.uid}
                />
              ))}
            </div>
          ))
        )}
        <div ref={bottomRef} className="h-1" />
      </div>

      {/* Scroll-to-bottom floating button */}
      {showScrollBtn ? (
        <button
          type="button"
          onClick={() => {
            scrollToBottom('smooth');
            setNewMsgCount(0);
            setShowScrollBtn(false);
          }}
          className="bsdc-scroll-btn bsdc-tap text-brand-600 dark:text-brand-400"
          aria-label="Scroll to latest"
        >
          <ChevronDown className="h-5 w-5" aria-hidden />
          {newMsgCount > 0 ? (
            <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white shadow-md">
              {newMsgCount > 9 ? '9+' : newMsgCount}
            </span>
          ) : null}
        </button>
      ) : null}

      {/* Typing indicator with animated dots */}
      {chat.typing.length > 0 ? (
        <div
          className="bsdc-fade-slide-up flex items-center gap-2 px-4 py-1.5 text-xs text-brand-600 shrink-0 dark:text-brand-400"
          aria-live="polite"
        >
          <span className="font-semibold">{chat.typing[0].displayName} is typing</span>
          <span className="flex items-center gap-0.5">
            <span className="bsdc-bounce-dot" />
            <span className="bsdc-bounce-dot" />
            <span className="bsdc-bounce-dot" />
          </span>
        </div>
      ) : null}

      {/* Composer — anchored at bottom with safe-area padding */}
      {chat.canPost ? (
        <div className="bsdc-glass bsdc-pb-safe border-t border-surface-light-border p-2 shrink-0 dark:border-surface-dark-border sm:p-3">
          {replyTo ? (
            <div className="bsdc-slide-down mb-2 flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-50 to-purple-50 px-3 py-1.5 text-xs shadow-sm dark:from-brand-950/40 dark:to-purple-950/40">
              <Reply className="h-3.5 w-3.5 shrink-0 text-brand-600" aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                <strong>
                  {t('chat.replying')} {replyTo.senderName}:
                </strong>{' '}
                {replyTo.text || 'Message'}
              </span>
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                aria-label={t('common.cancel')}
                className="bsdc-tap shrink-0 rounded-full px-1.5 font-bold hover:bg-black/5 dark:hover:bg-white/10"
              >
                ×
              </button>
            </div>
          ) : null}
          {editMsgId ? (
            <div className="bsdc-slide-down mb-2 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-1.5 text-xs shadow-sm dark:bg-amber-950/30">
              <Pencil className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
              <input
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="min-w-0 flex-1 bg-transparent outline-none"
                aria-label="Edit message"
              />
              <button
                type="button"
                onClick={async () => {
                  await chat.edit(editMsgId, editText);
                  setEditMsgId(null);
                }}
                className="bsdc-tap font-bold text-brand-600"
              >
                {t('common.save')}
              </button>
              <button type="button" onClick={() => setEditMsgId(null)} className="bsdc-tap font-bold">
                ×
              </button>
            </div>
          ) : null}
          <form
            className="flex items-end gap-1 sm:gap-1.5"
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
                if (file) setEditingImage(file);
                e.target.value = '';
              }}
            />
            <input
              ref={pdfInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void sendPdf(file);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploadingImage}
              aria-label={t('chat.sendImage')}
              className="bsdc-tap bsdc-hover-lift bsdc-composer-icon-btn shrink-0 rounded-full p-2 text-neutral-500 hover:bg-neutral-100 hover:text-brand-600 disabled:opacity-50 dark:hover:bg-surface-dark-raised sm:p-2.5"
            >
              <ImagePlus className="h-5 w-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => pdfInputRef.current?.click()}
              disabled={pdfUploading}
              aria-label={t('chat.sendPdf')}
              className="bsdc-tap bsdc-hover-lift bsdc-composer-icon-btn shrink-0 rounded-full p-2 text-neutral-500 hover:bg-neutral-100 hover:text-red-500 disabled:opacity-50 dark:hover:bg-surface-dark-raised sm:p-2.5"
            >
              {pdfUploading ? (
                <span className="text-[10px] font-bold text-red-500">{pdfProgress}%</span>
              ) : (
                <FileText className="h-5 w-5" aria-hidden />
              )}
            </button>
            <button
              type="button"
              onClick={() => setCodeOpen(true)}
              aria-label={t('chat.sendCode')}
              className="bsdc-tap bsdc-hover-lift bsdc-composer-icon-btn shrink-0 rounded-full p-2 text-neutral-500 hover:bg-neutral-100 hover:text-brand-600 dark:hover:bg-surface-dark-raised sm:p-2.5"
            >
              <Code2 className="h-5 w-5" aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Emoji"
              className="bsdc-tap bsdc-hover-lift bsdc-composer-icon-btn hidden shrink-0 rounded-full p-2 text-neutral-500 hover:bg-neutral-100 hover:text-brand-600 dark:hover:bg-surface-dark-raised md:inline-flex sm:p-2.5"
            >
              <Smile className="h-5 w-5" aria-hidden />
            </button>
            <Textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                chat.notifyTyping(e.target.value.length > 0);
              }}
              onKeyDown={handleKeyDown}
              placeholder={t('chat.messagePlaceholder')}
              minRows={1}
              maxRows={5}
              aria-label={t('chat.messagePlaceholder')}
              className="bsdc-composer-textarea min-w-0 flex-1 resize-none rounded-2xl text-sm"
            />
            {recorder.status === 'recording' ? (
              <div className="min-w-0 flex-1">
                <RecordingOverlay
                  levels={recorder.levels}
                  elapsed={recorder.elapsed}
                  onCancel={recorder.cancel}
                  onStop={recorder.stop}
                />
              </div>
            ) : (
              <>
                <MicButton
                  status={voiceUploading ? 'processing' : recorder.status}
                  onStart={() => void recorder.start()}
                  onStop={recorder.stop}
                  onWarmUp={recorder.warmUp}
                />
                <button
                  type="submit"
                  className="bsdc-send-btn shrink-0 flex h-10 w-10 items-center justify-center rounded-full text-white sm:h-11 sm:w-11"
                  aria-label={t('common.send')}
                  disabled={!text.trim()}
                >
                  {voiceUploading ? <Volume2 className="h-4 w-4 animate-pulse sm:h-5 sm:w-5" aria-hidden /> : <Send className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />}
                </button>
              </>
            )}
          </form>
        </div>
      ) : (
        <div className="bsdc-pb-safe border-t border-surface-light-border p-4 text-center text-xs text-neutral-400 shrink-0 dark:border-surface-dark-border">
          {t('chat.channelInfo')}
        </div>
      )}

      {/* Image preview & editor */}
      <ImageEditorModal
        open={editingImage !== null}
        file={editingImage}
        onOpenChange={(o) => !o && setEditingImage(null)}
        onSend={(edited) => void sendImage(edited)}
      />

      {/* Code snippet modal */}
      <Modal open={codeOpen} onOpenChange={setCodeOpen} title={t('chat.sendCode')}>
        <div className="bsdc-scale-in space-y-3">
          <Input label={t('post.language')} value={codeLang} onChange={(e) => setCodeLang(e.target.value)} />
          <Textarea
            label={t('post.code')}
            value={codeText}
            onChange={(e) => setCodeText(e.target.value)}
            minRows={6}
            className="font-mono text-xs"
          />
          <Button
            fullWidth
            onClick={async () => {
              if (!codeText.trim()) return;
              await chat.send({ codeSnippet: codeText, codeLanguage: codeLang });
              playBeep('sent');
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
  return info.online ? (
    <span className="font-medium text-green-600 dark:text-green-400">{'online'}</span>
  ) : (
    <span>{`${t0(language)} ${timeAgo(info.lastSeen, language)}`}</span>
  );
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
  const reactions = Object.entries(message.reactions || {}).reduce<{ reaction: string; count: number }[]>(
    (acc, [_uid, userReactions]) => {
      const reaction = Object.values(userReactions || {})[0] || '';
      if (!reaction) return acc;
      const found = acc.find((a) => a.reaction === reaction);
      if (found) found.count += 1;
      else acc.push({ reaction, count: 1 });
      return acc;
    },
    [],
  );
  const REACT_OPTIONS: { id: string; icon: typeof ThumbsUp; color: string }[] = [
    { id: 'like', icon: ThumbsUp, color: '#1877F2' },
    { id: 'love', icon: Heart, color: '#DB2777' },
    { id: 'celebrate', icon: PartyPopper, color: '#D97706' },
    { id: 'fire', icon: Flame, color: '#EA580C' },
  ];

  return (
    <div className={cn('group mb-1.5 flex items-end gap-1.5 sm:mb-2 sm:gap-2', isMine && 'flex-row-reverse')}>
      <Avatar
        src={message.senderAvatar}
        name={message.senderName}
        size={28}
        className={cn('shrink-0', isMine && 'hidden sm:inline-flex')}
      />
      <div
        className={cn(
          'relative max-w-[85%] sm:max-w-[70%]',
          isMine && 'items-end',
          isMine ? 'bsdc-bubble-in-right' : 'bsdc-bubble-in-left',
        )}
      >
        <div
          className={cn(
            'rounded-2xl px-3 py-2 text-sm sm:px-3.5',
            isMine
              ? 'bsdc-msg-mine rounded-br-md text-white'
              : 'bsdc-msg-other rounded-bl-md bg-neutral-100 text-neutral-900 dark:bg-surface-dark-raised dark:text-neutral-100',
          )}
        >
          {!isMine ? (
            <p className="mb-0.5 text-xs font-bold text-brand-700 dark:text-brand-300">{message.senderName}</p>
          ) : null}
          {message.deleted ? (
            <p className="italic opacity-60">[message deleted]</p>
          ) : (
            <>
              {message.replyToId ? (
                <div
                  className={cn(
                    'mb-1.5 rounded-lg border-l-2 px-2 py-1 text-xs',
                    isMine ? 'border-white/60 bg-white/10' : 'border-brand-500 bg-white/60 dark:bg-black/20',
                  )}
                >
                  <strong className="text-[10px] uppercase opacity-75">{message.replyToSender}</strong>
                  <p className="truncate">{message.replyToText?.slice(0, 80)}</p>
                </div>
              ) : null}
              {message.imageUrl ? <ImageWithZoom src={message.imageUrl} mine={isMine} /> : null}
              {message.audioUrl ? <VoiceNotePlayer message={message} mine={isMine} /> : null}
              {message.fileUrl ? <FileCard message={message} mine={isMine} /> : null}
              {message.codeSnippet ? (
                <pre
                  className={cn(
                    'bsdc-scrollbar mb-1 max-w-full overflow-x-auto rounded-lg p-2 font-mono text-xs',
                    isMine ? 'bg-black/25 text-white' : 'bg-[#0d1117] text-neutral-100',
                  )}
                >
                  <code>{message.codeSnippet}</code>
                </pre>
              ) : null}
              {message.text ? <p className="whitespace-pre-wrap break-words leading-relaxed">{message.text}</p> : null}
              {message.edited ? (
                <span className={cn('ml-1 text-[10px] italic', isMine ? 'text-white/70' : 'text-neutral-400')}>
                  ({t('chat.edited')})
                </span>
              ) : null}
            </>
          )}
          <p className={cn('mt-0.5 text-right text-[10px]', isMine ? 'text-white/70' : 'text-neutral-400')}>
            {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            {isMine ? (
              message.readBy && Object.keys(message.readBy).length > 1 ? (
                <CheckCheck className="ml-1 inline h-3 w-3" aria-hidden />
              ) : (
                <Check className="ml-1 inline h-3 w-3" aria-hidden />
              )
            ) : null}
          </p>
        </div>
        {reactions.length > 0 ? (
          <div className={cn('-mt-1.5 flex gap-0.5', isMine && 'justify-end')}>
            {reactions.map((r) => (
              <span
                key={r.reaction}
                className="bsdc-scale-in inline-flex items-center gap-1 rounded-full border border-surface-light-border bg-white px-1.5 py-0.5 text-[10px] font-bold text-neutral-600 shadow-sm dark:border-surface-dark-border dark:bg-surface-dark-raised dark:text-neutral-300"
              >
                <span className="h-3 w-3" aria-hidden>
                  {r.reaction === 'like' ? (
                    <ThumbsUp className="h-3 w-3 text-fb-500" />
                  ) : r.reaction === 'love' ? (
                    <Heart className="h-3 w-3 text-pink-500" />
                  ) : r.reaction === 'celebrate' ? (
                    <PartyPopper className="h-3 w-3 text-amber-500" />
                  ) : (
                    <Flame className="h-3 w-3 text-orange-500" />
                  )}
                </span>
                {r.count > 1 ? r.count : ''}
              </span>
            ))}
          </div>
        ) : null}

        {/* Hover actions */}
        <div
          className={cn(
            'absolute top-1/2 hidden -translate-y-1/2 group-hover:flex items-center gap-1 bsdc-scale-in',
            isMine ? 'right-full mr-1 flex-row-reverse' : 'left-full ml-1',
          )}
        >
          <div className="flex items-center gap-0.5 rounded-full border border-surface-light-border bg-white/95 p-0.5 shadow-lg backdrop-blur-md dark:border-surface-dark-border dark:bg-surface-dark-raised/95">
            {REACT_OPTIONS.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onReact(r.id)}
                aria-label={`React ${r.id}`}
                className="bsdc-react-btn rounded-full px-1.5 py-1"
                style={{ color: r.color }}
              >
                <r.icon className="h-3.5 w-3.5" aria-hidden />
              </button>
            ))}
          </div>
          <Dropdown open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownTrigger asChild>
              <button
                type="button"
                aria-label={t('common.more')}
                className="bsdc-tap rounded-full bg-white/95 p-1 text-neutral-400 shadow-lg backdrop-blur-md dark:bg-surface-dark-raised/95 dark:text-neutral-400"
              >
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
      .then((list) =>
        setUsers(
          list
            .filter((u) => u.uid !== profile.uid)
            .map((u) => ({ uid: u.uid, displayName: u.displayName, username: u.username, avatar: u.avatar })),
        ),
      )
      .finally(() => setLoading(false));
  }, [open, profile]);

  const filtered = filter
    ? users.filter(
        (u) => u.displayName.toLowerCase().includes(filter.toLowerCase()) || u.username.includes(filter.toLowerCase()),
      )
    : users;

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={t('chat.newChat')}>
      <div className="bsdc-scale-in">
        <Input
          placeholder={t('common.search')}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          leftIcon={<Search className="h-4 w-4" aria-hidden />}
        />
        {loading ? (
          <div className="mt-3 space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : (
          <ul className="bsdc-scrollbar mt-3 max-h-80 space-y-1 overflow-y-auto">
            {filtered.map((u, idx) => (
              <li key={u.uid} className="bsdc-fade-slide-up" style={{ animationDelay: `${Math.min(idx * 20, 240)}ms` }}>
                <button
                  type="button"
                  onClick={async () => {
                    const chatId = await openDirectChat(u);
                    onOpenChange(false);
                    if (chatId) navigate(`/messages/${chatId}`);
                  }}
                  className="bsdc-tap bsdc-hover-lift flex w-full items-center gap-2.5 rounded-xl p-2 text-left hover:bg-neutral-50 dark:hover:bg-surface-dark-raised"
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
      </div>
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

  const [people, setPeople] = useState<{ uid: string; displayName: string; username: string; avatar: string; bioTitle: string }[]>([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [directoryLoading, setDirectoryLoading] = useState(false);

  // Real member directory: the full active community, recent contacts ranked first.
  useEffect(() => {
    if (!open) return;
    setDirectoryLoading(true);
    const recentIds = new Set<string>();
    for (const chat of chats) {
      for (const id of chat.participantIds || []) if (id !== profile?.uid) recentIds.add(id);
    }
    void fetchActiveUsers(120)
      .then((list) => {
        const mapped = list
          .filter((u) => u.uid !== profile?.uid)
          .map((u) => ({ uid: u.uid, displayName: u.displayName, username: u.username, avatar: u.avatar, bioTitle: u.bioTitle }));
        mapped.sort((a, b) => Number(recentIds.has(b.uid)) - Number(recentIds.has(a.uid)));
        setPeople(mapped);
      })
      .catch(() => undefined)
      .finally(() => setDirectoryLoading(false));
  }, [open, chats, profile?.uid]);

  const visiblePeople = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return people.slice(0, 24);
    return people
      .filter((p) => p.displayName.toLowerCase().includes(q) || p.username.toLowerCase().includes(q) || p.bioTitle.toLowerCase().includes(q))
      .slice(0, 24);
  }, [people, memberSearch]);

  const selectedPeople = people.filter((p) => selected.includes(p.uid));

  async function create() {
    if (!profile || !name.trim()) {
      toast.error(t('chat.groupName') + ' ' + t('common.required'));
      return;
    }
    setCreating(true);
    try {
      const chatId = await createChat(
        name.trim(),
        description,
        people.filter((p) => selected.includes(p.uid)),
        type,
      );
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
      size="lg"
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
      <div className="bsdc-scale-in space-y-3">
        <div
          role="tablist"
          aria-label={t('common.create')}
          className="grid grid-cols-2 gap-1 rounded-xl bg-neutral-100 p-1 dark:bg-surface-dark-raised"
        >
          {(['group', 'channel'] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={type === option}
              onClick={() => setType(option)}
              className={cn(
                'bsdc-tap flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-all sm:text-sm',
                type === option
                  ? 'bg-white text-brand-700 shadow-sm dark:bg-surface-dark dark:text-brand-300'
                  : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400',
              )}
            >
              {option === 'group' ? <Users className="h-4 w-4" aria-hidden /> : <Hash className="h-4 w-4" aria-hidden />}
              {option === 'group' ? t('chat.newGroup') : t('chat.newChannel')}
            </button>
          ))}
        </div>
        <div className="grid gap-3 min-[560px]:grid-cols-2">
          <Input label={t('chat.groupName')} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          <Input
            label={t('chat.groupDescription')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={160}
          />
        </div>
        <div>
          <p className="bsdc-label">
            {t('chat.addMembers')} ({selected.length}/{people.length})
          </p>
          {selectedPeople.length > 0 ? (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {selectedPeople.map((p) => (
                <button
                  key={p.uid}
                  type="button"
                  onClick={() => setSelected((prev) => prev.filter((id) => id !== p.uid))}
                  className="bsdc-chip gap-1.5 bg-brand-50 text-brand-700 hover:bg-brand-100 dark:bg-brand-950/60 dark:text-brand-300"
                  aria-label={`${t('common.delete')} ${p.displayName}`}
                >
                  <Avatar src={p.avatar} name={p.displayName} size={18} />
                  {p.displayName.split(' ')[0]}
                  <span aria-hidden className="font-bold">×</span>
                </button>
              ))}
            </div>
          ) : null}
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" aria-hidden />
            <input
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              placeholder={t('chat.searchMembers')}
              aria-label={t('chat.searchMembers')}
              className="bsdc-input h-9 rounded-full pl-9 text-sm"
            />
          </div>
          <ul className="bsdc-scrollbar grid max-h-[38dvh] min-[560px]:grid-cols-2 gap-1 overflow-y-auto rounded-xl border border-surface-light-border p-1.5 dark:border-surface-dark-border">
            {directoryLoading ? (
              <li className="p-3 text-xs text-neutral-400">{t('common.loading')}</li>
            ) : null}
            {!directoryLoading && people.length === 0 ? (
              <li className="p-2 text-xs text-neutral-400">{t('chat.directoryEmpty')}</li>
            ) : null}
            {!directoryLoading && visiblePeople.length === 0 && memberSearch ? (
              <li className="p-2 text-xs text-neutral-400">{t('common.noResults')}</li>
            ) : null}
            {visiblePeople.map((p, idx) => (
              <li key={p.uid} className="bsdc-fade-slide-up" style={{ animationDelay: `${Math.min(idx * 20, 240)}ms` }}>
                <label className="bsdc-hover-lift flex cursor-pointer items-center gap-2.5 rounded-lg p-2 hover:bg-neutral-50 dark:hover:bg-surface-dark-raised">
                  <input
                    type="checkbox"
                    checked={selected.includes(p.uid)}
                    onChange={(e) =>
                      setSelected((prev) => (e.target.checked ? [...prev, p.uid] : prev.filter((id) => id !== p.uid)))
                    }
                    className="h-4 w-4 shrink-0 accent-brand-600"
                  />
                  <Avatar src={p.avatar} name={p.displayName} size={30} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{p.displayName}</span>
                    <span className="block truncate text-xs text-neutral-400">
                      @{p.username}
                      {p.bioTitle ? ` · ${p.bioTitle}` : ''}
                    </span>
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
