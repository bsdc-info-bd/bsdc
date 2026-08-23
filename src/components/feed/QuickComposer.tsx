/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ImagePlus, Code2, HelpCircle, BarChart3 } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';
import type { PostType } from '@/types/post';

/** Compact home-feed composer that opens the full editor. */
export default function QuickComposer() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  if (!profile) return null;

  const quickTypes: { type: PostType; icon: typeof ImagePlus; label: string }[] = [
    { type: 'image', icon: ImagePlus, label: t('post.types.image') },
    { type: 'snippet', icon: Code2, label: t('post.types.snippet') },
    { type: 'qa', icon: HelpCircle, label: t('post.types.qa') },
    { type: 'poll', icon: BarChart3, label: t('post.types.poll') },
  ];

  return (
    <div className="bsdc-surface p-3.5">
      <div className="flex items-center gap-3">
        <Link to={`/p/${profile.username}`} aria-label={profile.displayName}>
          <Avatar src={profile.avatar} name={profile.displayName} size={40} />
        </Link>
        <button
          type="button"
          onClick={() => navigate('/create')}
          className="bsdc-tap min-w-0 flex-1 rounded-full border border-surface-light-border bg-surface-light-muted px-4 py-2.5 text-left text-sm text-neutral-400 hover:border-brand-400 dark:border-surface-dark-border dark:bg-surface-dark-raised"
        >
          {t('post.composer')}
        </button>
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-1 border-t border-surface-light-border pt-2.5 dark:border-surface-dark-border">
        {quickTypes.map((qt) => (
          <button
            key={qt.type}
            type="button"
            onClick={() => navigate(`/create?type=${qt.type}`)}
            className={cn(
              'bsdc-tap flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-neutral-500 transition-colors hover:bg-brand-50 hover:text-brand-700 dark:text-neutral-400 dark:hover:bg-brand-950/50 dark:hover:text-brand-300',
            )}
          >
            <qt.icon className="h-4 w-4 shrink-0" aria-hidden />
            <span className="hidden min-[420px]:inline">{qt.label.split(' ')[0]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
