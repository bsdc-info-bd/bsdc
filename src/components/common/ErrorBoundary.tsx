/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

/** Top-level error boundary — prevents a single component crash from blanking the app. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[BSDC] Render error:', error.message, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center" role="alert">
          <svg width="110" height="80" viewBox="0 0 110 80" fill="none" aria-hidden>
            <path d="M55 12L97 68H13L55 12z" className="fill-amber-100 dark:fill-amber-950/50" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" strokeLinejoin="round" />
            <path d="M55 30v16" stroke="#D97706" strokeWidth="4" strokeLinecap="round" />
            <circle cx="55" cy="55" r="2.6" fill="#D97706" />
          </svg>
          <h1 className="text-xl font-bold">Something went wrong</h1>
          <p className="max-w-md text-sm text-neutral-500 dark:text-neutral-400">
            {this.state.error.message || 'An unexpected error occurred while rendering this page.'}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="bsdc-tap rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Reload BSDC
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
