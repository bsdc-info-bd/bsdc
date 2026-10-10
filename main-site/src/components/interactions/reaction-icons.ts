import { Lightbulb, PartyPopper, Search, ThumbsUp, Users, type LucideIcon } from 'lucide-react';
import type { Reaction } from '@/lib/interactions/interaction-types';

/**
 * One SVG per reaction, shared by the post bar and the message thread.
 *
 * A reaction is a word in the database and a symbol on screen, and the symbol is
 * always an icon. Emoji were the reactions in the thread before this; they are
 * not a fallback anywhere now, so a word the map does not know is a bug to see,
 * not a character to quietly display.
 */
export const REACTION_ICONS: Record<Reaction, LucideIcon> = {
  like: ThumbsUp,
  insightful: Lightbulb,
  celebrate: PartyPopper,
  support: Users,
  curious: Search,
};
