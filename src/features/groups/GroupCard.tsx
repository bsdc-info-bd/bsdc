/**
 * BSDC — src/features/groups/GroupCard.tsx
 * Purpose : One group in a list: identity, privacy, size and the join control.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Privacy is stated in words, not only with a lock icon, because an icon alone is not
 *   accessible and not translatable. The join control reflects the truth of the membership
 *   document and never claims success before the write is queued.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { Icon } from '@/shared/ui/Icon';
import { Text } from '@/shared/ui/Typography';
import { formatCompact } from '@/shared/lib/number.bn';
import type { Group } from '@/entities/group/model';
import { groupHref } from '@/entities/group/model';
import { joinGroup, leaveGroup } from '@/entities/group/repository';

/** Props for the group card. */
export interface GroupCardProps {
  readonly group: Group;
  readonly locale: 'bn' | 'en';
  readonly joined: boolean;
  readonly viewerUid: string | null;
  readonly onChanged?: (() => void) | undefined;
}

/**
 * Renders one group.
 * @param props card props
 * @returns the group card
 */
export function GroupCard({
  group,
  locale,
  joined,
  viewerUid,
  onChanged,
}: GroupCardProps): React.ReactElement {
  const { t } = useTranslation('groups');
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState(joined);

  /**
   * Joins or leaves the group.
   */
  async function toggle(): Promise<void> {
    if (viewerUid === null) return;
    setBusy(true);
    const next = !state;
    setState(next);
    if (next) await joinGroup(group.id, viewerUid);
    else await leaveGroup(group.id, viewerUid);
    setBusy(false);
    onChanged?.();
  }

  return (
    <Card as="article" className="bsdc-group-card" padding="md">
      <div className="bsdc-group-card__head">
        <span
          className="bsdc-group-card__cover"
          style={
            group.coverUrl.length > 0 ? { backgroundImage: `url(${group.coverUrl})` } : undefined
          }
          aria-hidden="true"
        />
        <div className="bsdc-group-card__identity">
          <a className="bsdc-group-card__name" href={groupHref(group)}>
            {group.name}
          </a>
          <div className="bsdc-group-card__meta">
            <Badge tone={group.privacy === 'public' ? 'neutral' : 'brand'} variant="outline">
              {t(`privacy.${group.privacy}`)}
            </Badge>
            <span>
              <Icon name="users" size={14} />
              {formatCompact(group.memberCount, locale)}
            </span>
          </div>
        </div>
      </div>

      {group.description.length > 0 ? (
        <Text as="p" className="bsdc-group-card__description" lang={locale === 'bn' ? 'bn' : 'en'}>
          {group.description}
        </Text>
      ) : null}

      <div className="bsdc-group-card__actions">
        <Button
          type="button"
          variant={state ? 'outline' : 'primary'}
          size="sm"
          loading={busy}
          disabled={viewerUid === null}
          onClick={() => void toggle()}
        >
          {state ? t('leave') : t('join')}
        </Button>
        <a className="bsdc-group-card__link" href={groupHref(group)}>
          {t('open')}
        </a>
      </div>
    </Card>
  );
}
