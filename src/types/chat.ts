/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import type { ReactionType } from './common';

export type ChatType = 'direct' | 'group' | 'channel';

export interface ChatParticipant {
  uid: string;
  displayName: string;
  username: string;
  avatar: string;
  role: 'member' | 'admin' | 'owner';
  joinedAt: number;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  text: string;
  imageUrl: string;
  /** Voice note (Cloudinary secure_url) + recorded duration in seconds. */
  audioUrl: string;
  audioDuration: number;
  audioMime: string;
  /** Generic file attachment (PDF etc.) — Cloudinary secure_url + metadata. */
  fileUrl: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  codeSnippet: string;
  codeLanguage: string;
  linkUrl: string;
  linkTitle: string;
  linkImage: string;
  replyToId: string | null;
  replyToText: string;
  replyToSender: string;
  reactions: Record<string, Record<string, string>>;
  readBy: Record<string, number>;
  edited: boolean;
  deleted: boolean;
  deletedFor: string[];
  createdAt: number;
}

export interface ChatMetadata {
  id: string;
  type: ChatType;
  name: string;
  description: string;
  photo: string;
  category: string;
  isPublic: boolean;
  participants: ChatParticipant[];
  participantIds: string[];
  participantMap?: Record<string, boolean>;
  createdBy: string;
  pinnedMessageId: string | null;
  lastMessage: string;
  lastMessageAt: number;
  createdAt: number;
}

export interface UserChatEntry {
  chatId: string;
  type: ChatType;
  name: string;
  photo: string;
  participantIds: string[];
  lastMessage: string;
  lastMessageAt: number;
  lastSender: string;
  unreadCount: number;
  pinned: boolean;
  muted: boolean;
  archived: boolean;
}

export interface PresenceInfo {
  online: boolean;
  lastSeen: number;
}

export interface TypingInfo {
  isTyping: boolean;
  displayName: string;
  updatedAt: number;
}

export interface ReactionSummary {
  type: ReactionType;
  count: number;
}
