/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import {
  Home, Compass, Flame, Bell, MessageSquare, Users, ShoppingBag, Briefcase, CalendarDays,
  Trophy, FileBadge, Star, Zap, FileText, BookOpen, Library, FolderGit2, Megaphone, Settings,
  ShieldCheck, Bookmark, LayoutGrid,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  labelKey: string;
  icon: LucideIcon;
  authRequired?: boolean;
  minRole?: 'moderator' | 'admin';
  exact?: boolean;
}

export const PRIMARY_NAV: NavItem[] = [
  { to: '/', labelKey: 'nav.home', icon: Home, exact: true },
  { to: '/explore', labelKey: 'nav.explore', icon: Compass },
  { to: '/trending', labelKey: 'nav.trending', icon: Flame },
  { to: '/messages', labelKey: 'nav.messages', icon: MessageSquare, authRequired: true },
  { to: '/notifications', labelKey: 'nav.notifications', icon: Bell, authRequired: true },
  { to: '/bookmarks', labelKey: 'common.bookmarks', icon: Bookmark, authRequired: true },
];

export const COMMUNITY_NAV: NavItem[] = [
  { to: '/groups', labelKey: 'nav.groups', icon: Users },
  { to: '/marketplace', labelKey: 'nav.marketplace', icon: ShoppingBag },
  { to: '/jobs', labelKey: 'nav.jobs', icon: Briefcase },
  { to: '/events', labelKey: 'nav.events', icon: CalendarDays },
  { to: '/leaderboard', labelKey: 'nav.leaderboard', icon: Trophy },
];

export const CONTENT_NAV: NavItem[] = [
  { to: '/blog', labelKey: 'nav.blog', icon: FileText },
  { to: '/qa', labelKey: 'nav.qa', icon: MessageSquare },
  { to: '/snippets', labelKey: 'nav.snippets', icon: Library },
  { to: '/docs', labelKey: 'nav.docs', icon: BookOpen },
  { to: '/wiki', labelKey: 'nav.wiki', icon: Library },
  { to: '/projects', labelKey: 'nav.projects', icon: FolderGit2 },
  { to: '/notices', labelKey: 'nav.notices', icon: Megaphone },
];

export const MORE_NAV: NavItem[] = [
  { to: '/points', labelKey: 'nav.pointsWallet', icon: Zap, authRequired: true },
  { to: '/license', labelKey: 'nav.license', icon: FileBadge },
  { to: '/creator-program', labelKey: 'nav.creatorProgram', icon: Star },
  { to: '/settings', labelKey: 'nav.settings', icon: Settings, authRequired: true },
];

export const MOBILE_NAV: NavItem[] = [
  { to: '/', labelKey: 'nav.home', icon: Home, exact: true },
  { to: '/explore', labelKey: 'nav.explore', icon: Compass },
  { to: '/create', labelKey: 'post.create', icon: LayoutGrid, authRequired: true },
  { to: '/messages', labelKey: 'nav.messages', icon: MessageSquare, authRequired: true },
  { to: '/notifications', labelKey: 'nav.notifications', icon: Bell, authRequired: true },
];

export const STAFF_NAV_ITEM: NavItem = { to: '/admin', labelKey: 'nav.adminPanel', icon: ShieldCheck };
