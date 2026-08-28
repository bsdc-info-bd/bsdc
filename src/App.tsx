import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui';
import { router } from '@/routes';
import { initFirebase } from '@/lib/firebase';
import { useAuthListener } from '@/hooks/useAuthListener';
import { useUIStore } from '@/stores/uiStore';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

function AppInitializer() {
  useAuthListener();

  // Initialize theme on mount
  useEffect(() => {
    const { theme } = useUIStore.getState();
    useUIStore.getState().setTheme(theme);
  }, []);

  // Initialize Firebase
  useEffect(() => {
    initFirebase();
  }, []);

  return null;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AppInitializer />
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
  );
}
