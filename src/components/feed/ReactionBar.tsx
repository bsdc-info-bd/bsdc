/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as Popover from '@radix-ui/react-popover';
import { ThumbsUp } from 'lucide-react';
import { REACTION_TYPES, type ReactionType } from '@/types/common';
import { REACTION_META } from './postMeta';
import { cn } from '@/lib/utils';

export function ReactionPicker({ onSelect }: { onSelect: (type: ReactionType) => void }) {
  return (
    <div className="flex items-center gap-0.5 rounded-full border border-surface-light-border bg-white p-1.5 shadow-raised dark:border-surface-dark-border dark:bg-surface-dark-raised" role="menu" aria-label="Choose a reaction">
      {REACTION_TYPES.map((type) => {
        const meta = REACTION_META[type];
        const Icon = meta.icon;
        return (
          <button
            key={type}
            type="button"
            role="menuitem"
            aria-label={meta.labelKey.split('.').pop()}
            title={type}
            onClick={() => onSelect(type)}
            className="bsdc-tap flex items-center justify-center rounded-full p-1.5 transition-transform hover:scale-125"
            style={{ color: meta.color }}
          >
            <Icon className="h-5 w-5" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}

export function ReactionButton({
  activeType,
  counts,
  total,
  onReact,
  onRemove,
  compact,
}: {
  activeType: ReactionType | null;
  counts: Record<string, number>;
  total: number;
  onReact: (type: ReactionType) => void;
  onRemove: () => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const topTypes = (Object.entries(counts) as [string, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([type]) => type as ReactionType);

  const activeMeta = activeType ? REACTION_META[activeType] : null;
  const ActiveIcon = activeMeta?.icon ?? ThumbsUp;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Anchor asChild>
        <button
          type="button"
          onClick={() => (activeType ? onRemove() : onReact('like'))}
          aria-label={t('post.reactions.like')}
          className={cn(
            'bsdc-tap flex items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors',
            activeMeta
              ? 'hover:bg-neutral-100 dark:hover:bg-surface-dark-raised'
              : 'text-neutral-500 hover:bg-neutral-100 hover:text-brand-600 dark:text-neutral-400 dark:hover:bg-surface-dark-raised',
            compact && 'px-2 py-1 text-xs',
          )}
          style={activeMeta ? { color: activeMeta.color } : undefined}
        >
          <ActiveIcon style={{ width: 18, height: 18 }} aria-hidden fill={activeType === 'love' ? 'currentColor' : 'none'} />
          {!compact ? <span>{t('post.reactions.like')}</span> : null}
          {total > 0 && !compact ? (
            <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-xs font-bold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
              {total}
            </span>
          ) : null}
        </button>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content side="top" sideOffset={8} align="start" className="z-50 bsdc-animate-fade-in" aria-label="Reaction picker">
          <ReactionPicker
            onSelect={(type) => {
              onReact(type);
              setOpen(false);
            }}
          />
        </Popover.Content>
      </Popover.Portal>
      {topTypes.length > 0 ? (
        <span className="ml-1 flex items-center gap-0.5" aria-hidden>
          {topTypes.map((type) => {
            const Icon = REACTION_META[type].icon;
            return (
              <span
                key={type}
                className="flex h-4 w-4 items-center justify-center rounded-full border border-white dark:border-surface-dark"
                style={{ background: `${REACTION_META[type].color}20`, color: REACTION_META[type].color }}
              >
                <Icon style={{ width: 10, height: 10 }} aria-hidden />
              </span>
            );
          })}
        </span>
      ) : null}
    </Popover.Root>
  );
}

