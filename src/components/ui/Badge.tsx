/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import type { ReactNode } from 'react';
import { BadgeCheck, ShieldCheck, Crown, Star, Gavel, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UserRole } from '@/types/user';
import { useTranslation } from 'react-i18next';

export function Badge({
  children,
  color = 'neutral',
  className,
  icon,
}: {
  children: ReactNode;
  color?: 'neutral' | 'brand' | 'blue' | 'red' | 'amber' | 'teal' | 'violet';
  className?: string;
  icon?: ReactNode;
}) {
  const colors = {
    neutral: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
    brand: 'bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300',
    blue: 'bg-fb-50 text-fb-700 dark:bg-fb-950/60 dark:text-fb-300',
    red: 'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
    teal: 'bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300',
    violet: 'bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300',
  } as const;
  return (
    <span className={cn('bsdc-chip', colors[color], className)}>
      {icon}
      {children}
    </span>
  );
}

const ROLE_META: Record<UserRole, { color: string; icon: ReactNode; key: string }> = {
  superadmin: { color: 'text-violet-600 dark:text-violet-400', icon: <Crown className="h-3.5 w-3.5" />, key: 'common.superadmin' },
  admin: { color: 'text-red-600 dark:text-red-400', icon: <ShieldCheck className="h-3.5 w-3.5" />, key: 'common.admin' },
  manager: { color: 'text-fb-600 dark:text-fb-400', icon: <Gavel className="h-3.5 w-3.5" />, key: 'common.manager' },
  moderator: { color: 'text-amber-600 dark:text-amber-400', icon: <Gavel className="h-3.5 w-3.5" />, key: 'common.moderator' },
  verified: { color: 'text-brand-600 dark:text-brand-400', icon: <BadgeCheck className="h-3.5 w-3.5" />, key: 'common.verified' },
  user: { color: 'text-neutral-500 dark:text-neutral-400', icon: <User className="h-3.5 w-3.5" />, key: '' },
  restricted: { color: 'text-orange-600 dark:text-orange-400', icon: <Gavel className="h-3.5 w-3.5" />, key: '' },
  banned: { color: 'text-red-700 dark:text-red-500', icon: <Gavel className="h-3.5 w-3.5" />, key: '' },
};

export function RoleBadge({ role, className }: { role: UserRole; className?: string }) {
  const { t } = useTranslation();
  const meta = ROLE_META[role];
  if (!meta.key) return null;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide', meta.color, 'border-current/30', className)}>
      {meta.icon}
      {t(meta.key)}
    </span>
  );
}

export function VerifiedBadge({ className, size = 14 }: { className?: string; size?: number }) {
  return (
    <span className={cn('inline-flex text-fb-500', className)} title="Verified" aria-label="Verified account">
      <BadgeCheck style={{ width: size, height: size }} aria-hidden />
    </span>
  );
}

export function CreatorBadge({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white', className)}>
      <Star className="h-3 w-3" aria-hidden />
      Creator
    </span>
  );
}
