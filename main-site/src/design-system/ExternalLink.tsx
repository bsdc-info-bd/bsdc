import { ExternalLink as ExternalIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface ExternalLinkProps {
  href: string;
  children: ReactNode;
  className?: string;
  /** User-generated links must stay nofollow+ugc; official links do not. */
  userGenerated?: boolean;
  showIcon?: boolean;
}

export function ExternalLink({
  href,
  children,
  className,
  userGenerated = false,
  showIcon = true,
}: ExternalLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel={userGenerated ? 'noopener noreferrer nofollow ugc' : 'noopener noreferrer'}
      className={cn(
        'inline-flex items-center gap-1 text-blue underline underline-offset-2',
        className,
      )}
    >
      <span className="fab-truncate">{children}</span>
      {showIcon ? <ExternalIcon size={14} aria-hidden="true" className="shrink-0" /> : null}
    </a>
  );
}
