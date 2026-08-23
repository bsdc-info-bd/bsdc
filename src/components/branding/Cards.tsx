/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { BsdcMark } from './Logo';
import { cn, formatDate } from '@/lib/utils';
import { QrCode as QrIcon } from 'lucide-react';

/** Digital member / staff ID card (51-57). */
export function IdCard({
  displayName,
  username,
  role,
  avatarUrl,
  memberId,
  issuedAt = Date.now(),
  dark,
  className,
}: {
  displayName: string;
  username: string;
  role: 'member' | 'admin' | 'moderator' | 'manager' | 'creator' | 'speaker' | 'attendee';
  avatarUrl?: string;
  memberId: string;
  issuedAt?: number;
  dark?: boolean;
  className?: string;
}) {
  const roleColor: Record<string, string> = {
    member: '#1877F2',
    admin: '#DC2626',
    moderator: '#F59E0B',
    manager: '#1877F2',
    creator: '#DB2777',
    speaker: '#7C3AED',
    attendee: '#0A8F3F',
  };
  return (
    <div
      className={cn(
        'relative w-[340px] max-w-full overflow-hidden rounded-2xl shadow-raised',
        dark ? 'bg-[#0F0F0F] text-white' : 'bg-white text-neutral-900',
        className,
      )}
      role="img"
      aria-label={`BSDC ${role} ID card for ${displayName}`}
    >
      <div className="h-16 bg-brand-gradient" />
      <div className="px-5 pb-5">
        <div className="-mt-8 mb-3 flex items-end justify-between">
          <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border-4 border-white bg-brand-50 text-xl font-extrabold text-brand-700 dark:border-[#0F0F0F] dark:bg-brand-950">
            {avatarUrl ? <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" loading="lazy" /> : displayName.slice(0, 2).toUpperCase()}
          </span>
          <BsdcMark size={34} />
        </div>
        <p className="text-lg font-extrabold leading-tight">{displayName}</p>
        <p className={cn('text-sm', dark ? 'text-neutral-400' : 'text-neutral-500')}>@{username}</p>
        <div className="mt-3 flex items-center justify-between">
          <span
            className="rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white"
            style={{ background: roleColor[role] }}
          >
            {role}
          </span>
          <span className={cn('text-[10px]', dark ? 'text-neutral-500' : 'text-neutral-400')}>
            ID {memberId} · Issued {formatDate(issuedAt, 'MMM YYYY')}
          </span>
        </div>
        <div className={cn('mt-3 border-t pt-2 text-[9px] tracking-wide', dark ? 'border-neutral-800 text-neutral-500' : 'border-neutral-100 text-neutral-400')}>
          BSDC — THE PRIDE OF BANGLADESH · RRC DEVELOPMENT · VERIFY AT www.bsdc.info.bd
        </div>
      </div>
    </div>
  );
}

/** Certificate template (63-67) — printable and exportable. */
export function Certificate({
  kind,
  recipientName,
  detail,
  issuedAt = Date.now(),
  serial,
  className,
}: {
  kind: 'license' | 'creator' | 'achievement' | 'event' | 'hackathon';
  recipientName: string;
  detail: string;
  issuedAt?: number;
  serial: string;
  className?: string;
}) {
  const titles: Record<string, string> = {
    license: 'SOFTWARE LICENSE CERTIFICATE',
    creator: 'CREATOR PROGRAM CERTIFICATE',
    achievement: 'ACHIEVEMENT CERTIFICATE',
    event: 'EVENT PARTICIPATION CERTIFICATE',
    hackathon: 'HACKATHON WINNER CERTIFICATE',
  };
  return (
    <div
      className={cn(
        'relative mx-auto w-full max-w-3xl overflow-hidden rounded-xl bg-[#0d1117] text-white shadow-raised',
        className,
      )}
      role="img"
      aria-label={`${titles[kind]} for ${recipientName}`}
    >
      <div className="pointer-events-none absolute inset-2 rounded-lg border-2 border-brand-500/70" />
      <div className="px-6 py-10 text-center sm:px-12">
        <BsdcMark size={44} className="mx-auto mb-3" />
        <p className="text-[11px] font-bold tracking-[0.3em] text-brand-400">BANGLADESH SOFTWARE DEVELOPMENT COMMUNITY</p>
        <h3 className="mt-4 text-xl font-extrabold sm:text-2xl">{titles[kind]}</h3>
        <p className="mt-6 text-sm text-neutral-400">This certificate is proudly presented to</p>
        <p className="mt-2 text-2xl font-extrabold text-brand-300 sm:text-3xl">{recipientName}</p>
        <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-neutral-300">{detail}</p>
        <div className="mt-8 flex flex-col items-center justify-between gap-4 text-xs text-neutral-400 sm:flex-row">
          <div className="text-center sm:text-left">
            <p className="mb-1 w-40 border-b border-neutral-700 pb-1">Rizwan Rahim Chowdhury</p>
            <p>Founder & CEO — RRC Development</p>
          </div>
          <div className="flex flex-col items-center gap-1">
            <QrIcon className="h-8 w-8 text-brand-400" aria-hidden />
            <p>Serial {serial}</p>
          </div>
          <div className="text-center sm:text-right">
            <p className="mb-1 w-40 border-b border-neutral-700 pb-1">{formatDate(issuedAt, 'MMMM D, YYYY')}</p>
            <p>Date of issue</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** T-shirt design mockups (58-62). */
export function TshirtDesign({ text, bangla, className }: { text: string; bangla?: boolean; className?: string }) {
  return (
    <div className={cn('mx-auto w-full max-w-xs', className)} role="img" aria-label={`BSDC ${text} t-shirt design`}>
      <svg viewBox="0 0 200 220" fill="none">
        <path
          d="M60 20l40 12 40-12 36 16-12 46-14-4v100H50V78l-14 4-12-46 36-16z"
          className="fill-neutral-100 stroke-neutral-300 dark:fill-neutral-800 dark:stroke-neutral-700"
          strokeWidth="2"
        />
        <rect x="78" y="20" width="44" height="8" rx="4" className="fill-neutral-200 dark:fill-neutral-700" />
        <g transform="translate(100 100)">
          <rect x="-14" y="-14" width="28" height="28" rx="8" fill="#0A8F3F" />
          <path d="M-5-6l-4 6 4 6" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M0 6V-6h3a3 3 0 010 6h-3" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </g>
        <text x="100" y="132" textAnchor="middle" fontSize="12" fontWeight="800" fill="currentColor" fontFamily="Inter, Hind Siliguri, sans-serif">
          {text}
        </text>
        {bangla ? (
          <text x="100" y="150" textAnchor="middle" fontSize="9" fontWeight="600" fill="#0A8F3F" fontFamily="Hind Siliguri, sans-serif">
            আমি বাংলাদেশ গড়ি
          </text>
        ) : (
          <text x="100" y="150" textAnchor="middle" fontSize="7.5" fill="#6B7280" fontFamily="Inter, sans-serif">
            The Pride of Bangladesh
          </text>
        )}
      </svg>
    </div>
  );
}

/** Onboarding / PWA splash (99, 102-104). */
export function SplashScreen({ label = 'BSDC' }: { label?: string }) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-brand-gradient text-white">
      <BsdcMark size={88} className="bsdc-animate-float" />
      <div className="text-center">
        <p className="text-2xl font-extrabold tracking-tight">{label}</p>
        <p className="mt-1 text-sm text-white/80">The Pride of Bangladesh — Where Developers Unite</p>
      </div>
      <div className="h-1 w-40 overflow-hidden rounded-full bg-white/25">
        <div className="h-full w-1/2 animate-[bsdc-slide-up_1.2s_ease-in-out_infinite_alternate] rounded-full bg-white" />
      </div>
      <p className="absolute bottom-8 text-xs text-white/70">RRC Development</p>
    </div>
  );
}
