import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Banner, Button, mountConsole } from '@kit';
import { App } from './App';

/** Keep an unexpected signed-in render failure visible instead of showing a blank screen. */
class AdminRenderBoundary extends Component<
  { readonly children: ReactNode },
  { readonly error: Error | null }
> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: unknown): { error: Error } {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[bsdc-admin] console render failed', error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (error === null) return this.props.children;

    return (
      <main role="alert" style={{ maxWidth: '48rem', margin: '5vh auto', padding: '1rem' }}>
        <Banner tone="bad" title="The admin console could not load">
          <p className="kit-small">
            Something failed while opening the page. Reload the console; if it happens again, share
            the error below.
          </p>
          <p className="kit-small kit-mono" style={{ overflowWrap: 'anywhere' }}>
            {error.message || 'Unknown rendering error'}
          </p>
          <Button type="button" onClick={() => window.location.reload()}>
            Reload console
          </Button>
        </Banner>
      </main>
    );
  }
}

mountConsole('bsdc-admin', 'SEO and branding', () => (
  <AdminRenderBoundary>
    <App />
  </AdminRenderBoundary>
));
