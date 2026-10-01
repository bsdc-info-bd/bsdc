import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Tabs, type TabItem } from '@/design-system';
import { useFeed } from '@/hooks/use-feed';
import type { FeedAlgorithm } from '@/lib/feed/ranking';
import { FeedList } from './FeedList';

const ALGORITHMS: FeedAlgorithm[] = ['ranked', 'following', 'latest'];

/** For you / Following / Latest. One query at a time: the active tab's. */
export function FeedTabs() {
  const { t } = useTranslation();
  const [active, setActive] = useState<FeedAlgorithm>('ranked');
  const feed = useFeed(active);

  const list = (
    <FeedList
      feed={feed}
      emptyTitle={t(`feed.empty.${active}.title`)}
      emptyDescription={t(`feed.empty.${active}.description`)}
    />
  );

  const items: TabItem[] = ALGORITHMS.map((algorithm) => ({
    id: algorithm,
    label: t(`feed.tabs.${algorithm}`),
    content: list,
  }));

  return (
    <Tabs
      items={items}
      activeId={active}
      onChange={(id) => {
        setActive(id as FeedAlgorithm);
      }}
      label={t('feed.tabsLabel')}
    />
  );
}
