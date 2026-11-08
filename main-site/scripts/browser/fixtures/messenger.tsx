/** Browser-only fixture: real messenger/components, in-memory mock API. */
import type { User } from 'firebase/auth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { AppShell } from '../../../src/components/layout/AppShell';
import MessagesPage from '../../../src/routes/MessagesPage';
import { DEFAULT_CLAIMS, useAuthStore } from '../../../src/store/auth-store';
import '../../../src/i18n';
import '../../../src/styles/index.css';

useAuthStore.getState().setSession(
  {
    uid: 'browser-alice',
    emailVerified: true,
    getIdToken: () => Promise.resolve('browser-test-token'),
  } as unknown as User,
  DEFAULT_CLAIMS,
);
const router = createMemoryRouter([
  { element: <AppShell />, children: [
    { path: '/messages', element: <MessagesPage /> },
    { path: '/messages/:id', element: <MessagesPage /> },
  ] },
], { initialEntries: [new URLSearchParams(window.location.search).get('path') ?? '/messages'] });
const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
createRoot(document.getElementById('root')!).render(
  <HelmetProvider><QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider></HelmetProvider>,
);
