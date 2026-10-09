import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Avatar, Card, IconButton, SectionHeading, Skeleton } from '@/design-system';
import { FollowButton } from '@/components/social/FollowButton';
import { useFollowSuggestions } from '@/hooks/use-interactions';
import { formatNumber } from '@/lib/format';
import { profilePath } from '@/lib/site';
import { selectIsSignedIn, useAuthStore } from '@/store/auth-store';
import type { FollowSuggestion } from '@/lib/data/follow-repository';

export interface FollowSuggestionsProps {
  limit?: number;
  className?: string;
}

/**
 * Who to follow next, and why.
 *
 * The reason is shown rather than kept to the ranking, because a suggestion that
 * cannot explain itself is an advertisement: "two people you follow also follow
 * them" is something a member can act on, and "popular" is not. Where there is
 * nothing true to say — no mutual follows, no shared skill, no shared city — the
 * card says the honest fourth thing, that this is a member the community reads.
 *
 * A member can put one away. That is a preference about a page, not a fact about
 * anybody, so it stays in the browser rather than becoming a row.
 */
export function FollowSuggestions({ limit = 6, className }: FollowSuggestionsProps) {
  const { t, i18n } = useTranslation();
  const signedIn = useAuthStore(selectIsSignedIn);
  const { suggestions, isLoading, dismiss } = useFollowSuggestions(limit);
  const language = i18n.language === 'en' ? 'en' : 'bn';

  if (!signedIn) return null;

  if (isLoading) {
    return (
      <Card className={className}>
        <div className="grid gap-3 p-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </Card>
    );
  }

  // Nothing to suggest is not a card with a hole in it.
  if (suggestions.length === 0) return null;

  return (
    <Card className={className}>
      <div className="p-4">
        <SectionHeading
          level={3}
          title={t('suggestions.title')}
          description={t('suggestions.body')}
        />
        <ul className="mt-3 grid gap-3">
          {suggestions.map((suggestion) => (
            <SuggestionRow
              key={suggestion.uid}
              suggestion={suggestion}
              language={language}
              onDismiss={() => dismiss(suggestion.uid)}
            />
          ))}
        </ul>
      </div>
    </Card>
  );
}

interface SuggestionRowProps {
  suggestion: FollowSuggestion;
  language: 'bn' | 'en';
  onDismiss: () => void;
}

function SuggestionRow({ suggestion, language, onDismiss }: SuggestionRowProps) {
  const { t } = useTranslation();

  // The reason is written out rather than looked up in a map, because each one
  // interpolates something different: a number of people, a list of skills, a
  // city. Every kind the database can return has a case, and a case that did not
  // exist would be a suggestion with nothing to say for itself.
  let reason: string;
  switch (suggestion.reason) {
    case 'mutual':
      reason = t('suggestions.reasons.mutual', {
        people: formatNumber(suggestion.mutualCount, language),
      });
      break;
    case 'skills':
      reason = t('suggestions.reasons.skills', {
        skills: suggestion.sharedSkills.slice(0, 3).join(', '),
      });
      break;
    case 'city':
      reason = t('suggestions.reasons.city', { city: suggestion.location });
      break;
    case 'active':
      reason = t('suggestions.reasons.active', {
        people: formatNumber(suggestion.followers, language),
      });
      break;
  }

  return (
    <li className="flex items-start gap-3">
      <Link to={profilePath(suggestion.username)} className="shrink-0">
        <Avatar src={suggestion.avatarUrl} name={suggestion.displayName} size="md" />
      </Link>

      <div className="min-w-0 flex-1">
        <Link
          to={profilePath(suggestion.username)}
          className="block truncate text-sm font-semibold hover:underline"
        >
          {suggestion.displayName}
        </Link>
        <p className="truncate text-2xs text-ink-3">@{suggestion.username}</p>
        <p className="mt-1 text-2xs text-ink-2">{reason}</p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <FollowButton uid={suggestion.uid} displayName={suggestion.displayName} size="sm" />
        <IconButton
          label={t('suggestions.dismiss')}
          icon={<X aria-hidden className="size-4" />}
          size="sm"
          onClick={onDismiss}
        />
      </div>
    </li>
  );
}
