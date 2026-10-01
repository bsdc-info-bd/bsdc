import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from 'react-error-boundary';
import { HelmetProvider } from 'react-helmet-async';
import App from './App';
import { AuthProvider } from './components/auth/AuthProvider';
import { AppCrashFallback } from './components/layout/AppCrashFallback';
import './i18n';
import './styles/index.css';
import { registerServiceWorker } from './pwa';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const container = document.getElementById('root');
if (!container) {
  throw new Error('BSDC: #root container is missing from index.html');
}

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary FallbackComponent={AppCrashFallback}>
      <HelmetProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </QueryClientProvider>
      </HelmetProvider>
    </ErrorBoundary>
  </StrictMode>,
);

registerServiceWorker();
