/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import {
  ThumbsUp, Heart, PartyPopper, Lightbulb, HelpCircle, ShieldCheck, Flame,
  FileText, Code2, BookOpen, Library, FolderGit2, Briefcase, Megaphone, CalendarDays, Clock,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactionType } from '@/types/common';

export const REACTION_META: Record<ReactionType, { icon: LucideIcon; color: string; labelKey: string }> = {
  like: { icon: ThumbsUp, color: '#1877F2', labelKey: 'post.reactions.like' },
  love: { icon: Heart, color: '#DB2777', labelKey: 'post.reactions.love' },
  celebrate: { icon: PartyPopper, color: '#D97706', labelKey: 'post.reactions.celebrate' },
  insightful: { icon: Lightbulb, color: '#F59E0B', labelKey: 'post.reactions.insightful' },
  curious: { icon: HelpCircle, color: '#7C3AED', labelKey: 'post.reactions.curious' },
  support: { icon: ShieldCheck, color: '#14B8A6', labelKey: 'post.reactions.support' },
  fire: { icon: Flame, color: '#EA580C', labelKey: 'post.reactions.fire' },
};

export const POST_TYPE_META: Record<string, { icon: LucideIcon; color: string; labelKey: string }> = {
  text: { icon: FileText, color: '#6B7280', labelKey: 'post.types.text' },
  image: { icon: FileText, color: '#0A8F3F', labelKey: 'post.types.image' },
  blog: { icon: FileText, color: '#7C3AED', labelKey: 'post.types.blog' },
  qa: { icon: HelpCircle, color: '#1877F2', labelKey: 'post.types.qa' },
  snippet: { icon: Code2, color: '#EA580C', labelKey: 'post.types.snippet' },
  docs: { icon: BookOpen, color: '#14B8A6', labelKey: 'post.types.docs' },
  wiki: { icon: Library, color: '#0F766E', labelKey: 'post.types.wiki' },
  project: { icon: FolderGit2, color: '#DB2777', labelKey: 'post.types.project' },
  job: { icon: Briefcase, color: '#0A8F3F', labelKey: 'post.types.job' },
  notice: { icon: Megaphone, color: '#F59E0B', labelKey: 'post.types.notice' },
  poll: { icon: CalendarDays, color: '#1877F2', labelKey: 'post.types.poll' },
  story: { icon: Clock, color: '#DB2777', labelKey: 'post.types.story' },
};
