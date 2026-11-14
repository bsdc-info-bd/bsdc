import type { QueryClient } from '@tanstack/react-query';

/**
 * Registry for the active React Query client so sign-out and account-switch
 * paths can clear member-scoped caches without pulling configuration out of
 * `main.tsx` or creating circular imports.
 */
let activeClient: QueryClient | null = null;

export function registerQueryClient(client: QueryClient): void {
  activeClient = client;
}

export function clearQueryCache(): void {
  activeClient?.clear();
}
