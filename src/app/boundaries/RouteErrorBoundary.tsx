/**
 * BSDC — src/app/boundaries/RouteErrorBoundary.tsx
 * Purpose : Per-route error boundary: one broken screen never blanks the app (PART 24.2).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Errors are classified into the BSDC taxonomy before rendering, so the member always
 *           sees a code they can quote to support and a real next action (PART 09.02).
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AppError } from '@/core/errors/AppError';
import { toUserMessage } from '@/core/errors/toUserMessage';
import { logger } from '@/core/logger/logger';
import { ErrorState } from '@/shared/ui/EmptyState';

/** Props for the boundary. */
export interface RouteErrorBoundaryProps {
  readonly children: ReactNode;
  /** Locale used for the message. */
  readonly locale?: ('bn' | 'en') | undefined;
  /** Rendered fallback when a reset is not possible. */
  readonly fallback?: ReactNode | undefined;
}

/** State of the boundary. */
interface RouteErrorBoundaryState {
  readonly error: Error | null;
}

/**
 * Catches render errors below a route and renders a recoverable error state.
 */
export class RouteErrorBoundary extends Component<
  RouteErrorBoundaryProps,
  RouteErrorBoundaryState
> {
  public constructor(props: RouteErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  /** @param error thrown error @returns new state */
  public static getDerivedStateFromError(error: Error): RouteErrorBoundaryState {
    return { error };
  }

  /** @param error thrown error @param info React error info */
  public override componentDidCatch(error: Error, info: ErrorInfo): void {
    const appError =
      error instanceof AppError
        ? error
        : new AppError('BSDC-APP-001', { componentStack: info.componentStack ?? null }, error);
    logger.error('Route render failed', { code: appError.code, context: appError.context });
  }

  /** Resets the boundary so the route can re-render. */
  private readonly reset = (): void => {
    this.setState({ error: null });
  };

  /** @returns the children or the error state */
  public override render(): ReactNode {
    const { error } = this.state;
    const { children, locale = 'bn', fallback } = this.props;
    if (error === null) return children;
    void toUserMessage(error, locale);
    if (fallback !== undefined) return fallback;
    return (
      <ErrorState
        error={error}
        locale={locale}
        action={
          <button type="button" className="bsdc-button" data-variant="primary" onClick={this.reset}>
            {locale === 'bn' ? 'আবার চেষ্টা করুন' : 'Try again'}
          </button>
        }
      />
    );
  }
}
