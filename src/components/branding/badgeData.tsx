/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import {
  Award, BadgeCheck, Flame, GitBranch, Heart, Lightbulb, MessageSquare, Rocket,
  ShieldCheck, Sparkles, Star, Terminal, Trophy, Users, Zap, Cpu,
  Lock, Server, Braces, Cloud, Crown, Flag, GraduationCap, Hammer, Mic,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type BadgeVariant = { id: string; label: string; description: string; icon: LucideIcon; color: string };

/* Achievement badges (68-80) — automatic platform achievements. */
export const ACHIEVEMENT_BADGES: BadgeVariant[] = [
  { id: 'first-post', label: 'First Post', description: 'Published your first BSDC post', icon: Flag, color: '#0A8F3F' },
  { id: '100-posts', label: 'Century Club', description: 'Published 100 posts', icon: Award, color: '#1877F2' },
  { id: '1k-followers', label: 'Rising Star', description: 'Reached 1,000 followers', icon: Star, color: '#F59E0B' },
  { id: '10k-followers', label: 'Community Pillar', description: 'Reached 10,000 followers', icon: Users, color: '#7C3AED' },
  { id: '100k-followers', label: 'BSDC Icon', description: 'Reached 100,000 followers', icon: Crown, color: '#DB2777' },
  { id: 'first-answer', label: 'Problem Solver', description: 'Answered your first question', icon: Lightbulb, color: '#14B8A6' },
  { id: 'accepted-answer', label: 'Trusted Expert', description: 'Had an answer accepted', icon: BadgeCheck, color: '#0A8F3F' },
  { id: 'snippet-master', label: 'Snippet Master', description: 'Shared 25 code snippets', icon: Braces, color: '#EA580C' },
  { id: 'streak-7', label: 'Week Warrior', description: '7-day activity streak', icon: Flame, color: '#DC2626' },
  { id: 'streak-30', label: 'Unstoppable', description: '30-day activity streak', icon: Zap, color: '#F59E0B' },
  { id: 'helper', label: 'Community Helper', description: 'Received 100 reactions', icon: Heart, color: '#DB2777' },
  { id: 'conversationalist', label: 'Conversationalist', description: 'Received 100 comments', icon: MessageSquare, color: '#1877F2' },
  { id: 'open-source', label: 'Open Source Hero', description: 'Showcased an open-source project', icon: GitBranch, color: '#6B7280' },
  { id: 'launch-day', label: 'Founding Member', description: 'Joined during launch year', icon: Rocket, color: '#0A8F3F' },
];

/* Role badges (81-85). */
export const ROLE_BADGES: BadgeVariant[] = [
  { id: 'admin', label: 'Admin', description: 'Platform administrator', icon: ShieldCheck, color: '#DC2626' },
  { id: 'moderator', label: 'Moderator', description: 'Community moderator', icon: Hammer, color: '#F59E0B' },
  { id: 'creator', label: 'Creator', description: 'BSDC Creator Program member', icon: Sparkles, color: '#DB2777' },
  { id: 'verified', label: 'Verified', description: 'Verified identity', icon: BadgeCheck, color: '#1877F2' },
  { id: 'top-contributor', label: 'Top Contributor', description: 'Top 10 leaderboard', icon: Trophy, color: '#0A8F3F' },
];

/* Skill badges (86-90). */
export const SKILL_BADGES: BadgeVariant[] = [
  { id: 'react', label: 'React', description: 'React developer', icon: Cpu, color: '#61DAFB' },
  { id: 'nodejs', label: 'Node.js', description: 'Node.js developer', icon: Server, color: '#339933' },
  { id: 'python', label: 'Python', description: 'Python developer', icon: Terminal, color: '#3776AB' },
  { id: 'devops', label: 'DevOps', description: 'DevOps engineer', icon: Cloud, color: '#336791' },
  { id: 'security', label: 'Security', description: 'Security researcher', icon: Lock, color: '#DB2777' },
];

/* Event badges (91-95). */
export const EVENT_BADGES: BadgeVariant[] = [
  { id: 'speaker', label: 'Speaker', description: 'Event speaker', icon: Mic, color: '#7C3AED' },
  { id: 'organizer', label: 'Organizer', description: 'Event organizer', icon: Rocket, color: '#0A8F3F' },
  { id: 'attendee', label: 'Attendee', description: 'Event attendee', icon: Users, color: '#1877F2' },
  { id: 'hackathon-winner', label: 'Hackathon Winner', description: 'Won a BSDC hackathon', icon: Trophy, color: '#F59E0B' },
  { id: 'mentor', label: 'Mentor', description: 'Mentored at an event', icon: GraduationCap, color: '#14B8A6' },
];



export const ALL_BADGE_GROUPS = [
  { title: 'Achievement Badges', variants: ACHIEVEMENT_BADGES },
  { title: 'Role Badges', variants: ROLE_BADGES },
  { title: 'Skill Badges', variants: SKILL_BADGES },
  { title: 'Event Badges', variants: EVENT_BADGES },
];
