import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Alert, Button, EmptyState, PageSkeleton, SectionHeading } from '@/design-system';
import { Seo } from '@/components/seo/Seo';
import {
  deleteForever,
  fetchTrash,
  restoreFromTrash,
  type TrashItem,
} from '@/lib/content/trash-repository';
import { formatAbsoluteDate, formatRelativeTime } from '@/lib/format';
import { ROUTES } from '@/lib/site';
import { dataErrorKey } from '@/lib/supabase/errors';
import { useAuthStore } from '@/store/auth-store';

/**
 * Deleted items: everything the member removed, for as long as it can still be
 * brought back. The restore deadline is the database's number, shown here as a
 * date — the page never decides on its own that something is unrecoverable.
 */
export default function TrashPage() {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'bn' ? 'bn' : 'en';
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['trash', uid],
    queryFn: () => fetchTrash(50),
    enabled: uid !== null,
    staleTime: 15_000,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['trash', uid] });
    // The feed and the profile counts change when something comes back.
    void queryClient.invalidateQueries({ queryKey: ['feed'] });
    void queryClient.invalidateQueries({ queryKey: ['profile-stats'] });
    void queryClient.invalidateQueries({ queryKey: ['my-posts'] });
  };

  const restore = useMutation({
    mutationFn: (item: TrashItem) => restoreFromTrash(item),
    onSuccess: () => {
      toast.success(t('trash.restored'));
      refresh();
    },
    onError: (error) => {
      toast.error(
        error instanceof Error && error.message.includes('recovery_window_closed')
          ? t('trash.windowClosed')
          : t(dataErrorKey(error)),
      );
      refresh();
    },
  });

  const removeForever = useMutation({
    mutationFn: (item: TrashItem) => deleteForever(item),
    onSuccess: () => {
      toast.success(t('trash.deletedForever'));
      refresh();
    },
    onError: (error) => {
      toast.error(t(dataErrorKey(error)));
    },
  });

  const items = query.data ?? [];
  const busy = restore.isPending || removeForever.isPending;

  return (
    <>
      <Seo
        title={t('trash.metaTitle')}
        description={t('trash.metaDescription')}
        path={ROUTES.trash}
        noindex
      />
      <div className="fab-container py-6 sm:py-10">
        <SectionHeading title={t('trash.title')} description={t('trash.description')} />

        {query.isLoading ? <PageSkeleton label={t('common.loading')} /> : null}
        {query.isError ? <Alert tone="danger" title={t('trash.failed')} className="mt-4" /> : null}

        {!query.isLoading && !query.isError && items.length === 0 ? (
          <EmptyState
            icon={<Trash2 size={22} />}
            title={t('trash.emptyTitle')}
            description={t('trash.emptyBody')}
          />
        ) : null}

        <ul className="mt-4 flex flex-col gap-3">
          {items.map((item) => (
            <li
              key={`${item.kind}-${item.id}`}
              className="rounded-xl border border-line bg-surface p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-2xs uppercase tracking-wide text-muted">
                    {t(`trash.kinds.${item.kind}`)}
                    {item.moderated ? ` · ${t('trash.moderated')}` : ''}
                  </p>
                  <p className="fab-truncate font-medium">{item.title}</p>
                  {item.preview.length > 0 ? (
                    <p className="fab-truncate mt-1 text-sm text-muted">{item.preview}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted">
                    {t('trash.deletedAt', {
                      time: formatRelativeTime(new Date(item.deletedAt), language),
                    })}
                    {' · '}
                    {item.restorable
                      ? t('trash.recoverableUntil', {
                          date: formatAbsoluteDate(new Date(item.expiresAt), language),
                        })
                      : t('trash.windowClosed')}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy || !item.restorable}
                    onClick={() => {
                      restore.mutate(item);
                    }}
                  >
                    {t('trash.restore')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      removeForever.mutate(item);
                    }}
                  >
                    {t('trash.deleteForever')}
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
