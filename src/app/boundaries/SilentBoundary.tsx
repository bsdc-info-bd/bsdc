/**
 * BSDC — src/app/boundaries/SilentBoundary.tsx
 * Purpose : Boundary for optional widgets: a broken widget disappears, the page stays usable
 *           (PART 24.2: notifications, groups, people-to-follow, trending).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Nothing is rendered in the user's place — the failure is logged with enough context to
 *           be actionable, and the surrounding page keeps its structure (no CLS).
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AppError } from '@/core/errors/AppError';
import { logger } from '@/core/logger/logger';

/** Props for the boundary. */
export interface SilentBoundaryProps {
  readonly children: ReactNode;
  /** Name used in logs, e.g. 'trending-widget'. */
  readonly name: string;
}

/**
 * Catches errors in an optional widget and renders nothing in its place.
 */
export class SilentBoundary extends Component<SilentBoundaryProps, { readonly failed: boolean }> {
  public constructor(props: SilentBoundaryProps) {
    super(props);
    this.state = { failed: false };
  }

  /** @returns new state */
  public static getDerivedStateFromError(): { readonly failed: boolean } {
    return { failed: true };
  }

  /** @param error thrown error @param info React error info */
  public override componentDidCatch(error: Error, info: ErrorInfo): void {
    const appError =
      error instanceof AppError
        ? error
        : new AppError('BSDC-APP-002', { widget: this.props.name }, error);
    logger.warn('Optional widget failed', {
      widget: this.props.name,
      code: appError.code,
      componentStack: info.componentStack ?? null,
    });
  }

  /** @returns the children or null */
  public override render(): ReactNode {
    if (this.state.failed) return null;
    return this.props.children;
  }
}
