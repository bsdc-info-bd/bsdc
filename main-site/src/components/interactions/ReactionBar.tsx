import {
  Bookmark,
  Lightbulb,
  MessageSquare,
  PartyPopper,
  Search,
  ThumbsUp,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShareMenu } from '@/components/interactions/ShareMenu';
import { Button, IconButton } from '@/design-system';
import { usePostInteractions } from '@/hooks/use-interactions';
import { REACTIONS, type Reaction } from '@/lib/interactions/interaction-types';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';
import { selectIsSignedIn, useAuthStore } from '@/store/auth-store';

const REACTION_ICONS: Record<Reaction, LucideIcon> = {
  like: ThumbsUp,
  insightful: Lightbulb,
  celebrate: PartyPopper,
  support: Users,
  curious: Search,
};

export interface ReactionBarProps {
  postId: string;
  slug: string;
  title: string;
  likes: number;
  comments: number;
  onCommentClick?: () => void;
}

/** Reactions, bookmark and share for one post. Guests see counts, not actions. */
export function ReactionBar({
  postId,
  slug,
  title,
  likes,
  comments,
  onCommentClick,
}: ReactionBarProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const isSignedIn = useAuthStore(selectIsSignedIn);
  const [pickerOpen, setPickerOpen] = useState(false);
  const interactions = usePostInteractions(postId, likes);
  const active = interactions.state.reaction;
  const ActiveIcon = REACTION_ICONS[active ?? 'like'];

  return (
    <div className="flex flex-wrap items-center gap-1">
      <div className="relative">
        <Button
          variant={active === null ? 'ghost' : 'secondary'}
          size="sm"
          disabled={!isSignedIn}
          aria-pressed={active !== null}
          onClick={() => {
            interactions.react(active ?? 'like');
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            setPickerOpen((open) => !open);
          }}
        >
          <ActiveIcon size={16} />
          <span>{formatNumber(interactions.likes, language)}</span>
          <span className="fab-sr-only">
            {active === null ? t('interactions.react') : t(`interactions.reactions.${active}`)}
          </span>
        </Button>

        {isSignedIn ? (
          <IconButton
            label={t('interactions.chooseReaction')}
            icon={<span aria-hidden>+</span>}
            className="ms-0.5 align-middle"
            onClick={() => {
              setPickerOpen((open) => !open);
            }}
          />
        ) : null}

        {pickerOpen ? (
          <div
            role="menu"
            aria-label={t('interactions.chooseReaction')}
            className="absolute bottom-full start-0 z-30 mb-1 flex gap-1 rounded-xl border border-line bg-surface p-1 shadow-lg"
          >
            {REACTIONS.map((reaction) => {
              const Icon = REACTION_ICONS[reaction];
              return (
                <IconButton
                  key={reaction}
                  role="menuitem"
                  label={t(`interactions.reactions.${reaction}`)}
                  icon={<Icon size={16} />}
                  className={cn(active === reaction && 'text-green-700')}
                  onClick={() => {
                    interactions.react(reaction);
                    setPickerOpen(false);
                  }}
                />
              );
            })}
          </div>
        ) : null}
      </div>

      <Button variant="ghost" size="sm" onClick={onCommentClick}>
        <MessageSquare size={16} />
        <span>{formatNumber(comments, language)}</span>
        <span className="fab-sr-only">{t('interactions.comment')}</span>
      </Button>

      <Button
        variant={interactions.state.bookmarked ? 'secondary' : 'ghost'}
        size="sm"
        disabled={!isSignedIn}
        aria-pressed={interactions.state.bookmarked}
        onClick={interactions.bookmark}
      >
        <Bookmark size={16} />
        <span className="fab-sr-only">
          {interactions.state.bookmarked
            ? t('interactions.bookmarked')
            : t('interactions.bookmark')}
        </span>
      </Button>

      <ShareMenu slug={slug} title={title} onShare={interactions.share} />
    </div>
  );
}
