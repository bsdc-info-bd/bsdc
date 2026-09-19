/**
 * BSDC — src/app/boundaries/GlobalErrorBoundary.tsx
 * Purpose : Last-resort boundary around the whole app (PART 24.2).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : If this boundary renders, the app shell itself failed. It offers a reload and, in
 *           development, the classified error. Production shows the code only (PART 05.04).
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AppError } from '@/core/errors/AppError';
import { toUserMessage } from '@/core/errors/toUserMessage';
import { logger } from '@/core/logger/logger';
import { Container } from '@/shared/ui/Container';
import { Heading, Text } from '@/shared/ui/Typography';

/** Props for the boundary. */
export interface GlobalErrorBoundaryProps {
  readonly children: ReactNode;
  readonly locale?: ('bn' | 'en') | undefined;
}

/** State of the boundary. */
interface GlobalErrorBoundaryState {
  readonly error: Error | null;
}

/**
 * Catches any error that escapes every route boundary.
 */
export class GlobalErrorBoundary extends Component<
  GlobalErrorBoundaryProps,
  GlobalErrorBoundaryState
> {
  public constructor(props: GlobalErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  /** @param error thrown error @returns new state */
  public static getDerivedStateFromError(error: Error): GlobalErrorBoundaryState {
    return { error };
  }

  /** @param error thrown error @param info React error info */
  public override componentDidCatch(error: Error, info: ErrorInfo): void {
    const appError =
      error instanceof AppError
        ? error
        : new AppError('BSDC-APP-001', { componentStack: info.componentStack ?? null }, error);
    logger.error('Application shell failed', { code: appError.code });
  }

  /** @returns the children or a full-page recovery state */
  public override render(): ReactNode {
    const { error } = this.state;
    const { children, locale = 'bn' } = this.props;
    if (error === null) return children;
    const message = toUserMessage(error, locale);
    return (
      <main className="grid min-h-dvh place-items-center bg-surface p-4">
        <Container width="prose" className="text-center">
          <Heading level={1} size="xl">
            {locale === 'bn' ? message.titleBn : message.titleEn}
          </Heading>
          <Text tone="muted" className="mt-3">
            {locale === 'bn' ? message.bodyBn : message.bodyEn}
          </Text>
          <Text tone="subtle" className="mt-2 font-mono text-2xs">
            {message.code}
          </Text>
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              className="bsdc-button"
              data-variant="primary"
              data-size="lg"
              onClick={(): void => window.location.reload()}
            >
              {locale === 'bn' ? 'রিলোড করুন' : 'Reload'}
            </button>
          </div>
        </Container>
      </main>
    );
  }
}
