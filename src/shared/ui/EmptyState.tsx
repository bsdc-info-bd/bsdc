/**
 * BSDC — src/shared/ui/EmptyState.tsx
 * Purpose : Empty and error states: illustration, one-line explanation, one primary action
 *           (PART 09.02). Every list in the product uses one of these.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Illustrations are inline SVG components generated at build time from
 *           assets/illustrations, never emoji and never a remote image that could fail offline.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { toUserMessage } from '@/core/errors/toUserMessage';
import emptyStateArt from '#assets/illustrations/empty-state.svg';
import errorStateArt from '#assets/illustrations/error-state.svg';
import offlineArt from '#assets/illustrations/offline.svg';
import notFoundArt from '#assets/illustrations/not-found.svg';
import maintenanceArt from '#assets/illustrations/maintenance.svg';
import welcomeArt from '#assets/illustrations/welcome.svg';

type IllustrationName =
  'empty-state' | 'error-state' | 'offline' | 'not-found' | 'maintenance' | 'welcome';

/** Illustration sources, bundled so the states work offline (PART 26). */
const PATHS: Readonly<Record<IllustrationName, string>> = {
  'empty-state': emptyStateArt,
  'error-state': errorStateArt,
  offline: offlineArt,
  'not-found': notFoundArt,
  maintenance: maintenanceArt,
  welcome: welcomeArt,
};

/** Props for the EmptyState component. */
export interface EmptyStateProps {
  readonly title: string;
  readonly description?: string | undefined;
  readonly illustration?: IllustrationName | undefined;
  readonly action?: ReactNode | undefined;
  readonly secondaryAction?: ReactNode | undefined;
  readonly className?: string | undefined;
  readonly lang?: string | undefined;
}

/**
 * Renders an empty state.
 * @param props component props
 * @returns an empty-state element
 */
export function EmptyState({
  title,
  description,
  illustration = 'empty-state',
  action,
  secondaryAction,
  className,
  lang,
}: EmptyStateProps): React.ReactElement {
  return (
    <div className={cn('bsdc-empty-state', className)} lang={lang}>
      <img
        src={PATHS[illustration]}
        alt=""
        width={180}
        height={126}
        loading="lazy"
        decoding="async"
        className="bsdc-empty-state__illustration"
      />
      <h3 className="bsdc-empty-state__title">{title}</h3>
      {description !== undefined && <p className="bsdc-empty-state__description">{description}</p>}
      {(action !== undefined || secondaryAction !== undefined) && (
        <div className="bsdc-empty-state__actions">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}

/** Props for the ErrorState component. */
export interface ErrorStateProps {
  readonly error?: unknown;
  readonly title?: string | undefined;
  readonly description?: string | undefined;
  readonly action?: ReactNode | undefined;
  readonly locale?: ('bn' | 'en') | undefined;
  readonly className?: string | undefined;
}

/**
 * Renders an error state derived from the platform error taxonomy.
 * @param props component props
 * @returns an error-state element
 */
export function ErrorState({
  error,
  title,
  description,
  action,
  locale = 'bn',
  className,
}: ErrorStateProps): React.ReactElement {
  const message = error === undefined ? null : toUserMessage(error, locale);
  const heading =
    title ?? (locale === 'bn' ? message?.titleBn : message?.titleEn) ?? 'Something went wrong';
  const body = description ?? (locale === 'bn' ? message?.bodyBn : message?.bodyEn);
  return (
    <div className={cn('bsdc-error-state', className)} role="alert">
      <img
        src={PATHS['error-state']}
        alt=""
        width={180}
        height={126}
        loading="lazy"
        decoding="async"
        className="bsdc-empty-state__illustration"
      />
      <h3 className="bsdc-empty-state__title">{heading}</h3>
      {body !== undefined && body.length > 0 && (
        <p className="bsdc-empty-state__description">{body}</p>
      )}
      {message !== null && <p className="bsdc-error-state__code">{message.code}</p>}
      {action !== undefined && <div className="bsdc-empty-state__actions">{action}</div>}
    </div>
  );
}
