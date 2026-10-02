import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import type {
  AccountStatus,
  AdminOverview,
  AuditEntry,
  ModerationActionKind,
  Person,
  Plugin,
  QueuedReport,
  Role,
} from '@/lib/admin/admin-types';
import { sortQueue } from '@/lib/admin/admin-types';
import { useAuthStore } from '@/store/auth-store';

const repository = () => import('@/lib/admin/admin-repository');

export interface PermissionsResult {
  permissions: string[];
  isLoading: boolean;
  can: (permission: string) => boolean;
}

/**
 * The caller's permissions as the database understands them — read from the
 * role on the profile, not from a claim that may predate a demotion.
 */
export function usePermissions(): PermissionsResult {
  const uid = useAuthStore((state) => state.user?.uid ?? null);

  const query = useQuery({
    queryKey: ['permissions', uid],
    queryFn: async () => (await repository()).fetchPermissions(),
    enabled: uid !== null,
    staleTime: 300_000,
  });

  const permissions = useMemo(() => query.data ?? [], [query.data]);

  return {
    permissions,
    isLoading: query.isLoading,
    can: (permission) => permissions.includes(permission),
  };
}

export interface AdminOverviewResult {
  overview: AdminOverview | null;
  isLoading: boolean;
  isError: boolean;
}

export function useAdminOverview(enabled: boolean): AdminOverviewResult {
  const query = useQuery({
    queryKey: ['admin-overview'],
    queryFn: async () => (await repository()).fetchOverview(),
    enabled,
    staleTime: 60_000,
  });

  return {
    overview: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

export interface PluginsResult {
  plugins: Plugin[];
  isLoading: boolean;
  isError: boolean;
  toggle: (key: string, enabled: boolean) => Promise<void>;
  setRollout: (key: string, percent: number) => Promise<void>;
  isSaving: boolean;
}

export function usePlugins(enabled: boolean): PluginsResult {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['plugins'],
    queryFn: async () => (await repository()).fetchPlugins(),
    enabled,
    staleTime: 60_000,
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['plugins'] });
    void queryClient.invalidateQueries({ queryKey: ['feature-flags'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-overview'] });
  };

  const toggleMutation = useMutation({
    mutationFn: async (input: { key: string; enabled: boolean }) =>
      (await repository()).setPluginEnabled(input.key, input.enabled),
    onSuccess: invalidate,
  });

  const rolloutMutation = useMutation({
    mutationFn: async (input: { key: string; percent: number }) =>
      (await repository()).setPluginRollout(input.key, input.percent),
    onSuccess: invalidate,
  });

  return {
    plugins: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    toggle: async (key, pluginEnabled) => {
      await toggleMutation.mutateAsync({ key, enabled: pluginEnabled });
    },
    setRollout: async (key, percent) => {
      await rolloutMutation.mutateAsync({ key, percent });
    },
    isSaving: toggleMutation.isPending || rolloutMutation.isPending,
  };
}

export interface ModerationResult {
  reports: QueuedReport[];
  filter: string;
  setFilter: (status: string) => void;
  isLoading: boolean;
  claim: (reportId: string) => Promise<void>;
  resolve: (reportId: string, action: ModerationActionKind, reason: string) => Promise<void>;
  isSaving: boolean;
}

export function useModerationQueue(enabled: boolean): ModerationResult {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('open');

  const query = useQuery({
    queryKey: ['moderation-queue', filter],
    queryFn: async () => (await repository()).fetchQueue(filter),
    enabled,
    staleTime: 20_000,
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['moderation-queue'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-overview'] });
    void queryClient.invalidateQueries({ queryKey: ['audit'] });
  };

  const claimMutation = useMutation({
    mutationFn: async (reportId: string) => (await repository()).claimReport(reportId),
    onSuccess: invalidate,
  });

  const resolveMutation = useMutation({
    mutationFn: async (input: { reportId: string; action: ModerationActionKind; reason: string }) =>
      (await repository()).resolveReport(input.reportId, input.action, input.reason),
    onSuccess: invalidate,
  });

  return {
    reports: sortQueue(query.data ?? []),
    filter,
    setFilter,
    isLoading: query.isLoading,
    claim: async (reportId) => {
      await claimMutation.mutateAsync(reportId);
    },
    resolve: async (reportId, action, reason) => {
      await resolveMutation.mutateAsync({ reportId, action, reason });
    },
    isSaving: claimMutation.isPending || resolveMutation.isPending,
  };
}

export interface PeopleResult {
  people: Person[];
  search: string;
  setSearch: (value: string) => void;
  isLoading: boolean;
  setRole: (uid: string, role: Role) => Promise<void>;
  setStatus: (uid: string, status: AccountStatus, reason: string) => Promise<void>;
  isSaving: boolean;
}

export function useAdminPeople(enabled: boolean): PeopleResult {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');

  const query = useQuery({
    queryKey: ['admin-people', search],
    queryFn: async () => (await repository()).fetchPeople(search),
    enabled,
    staleTime: 30_000,
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['admin-people'] });
    void queryClient.invalidateQueries({ queryKey: ['audit'] });
  };

  const roleMutation = useMutation({
    mutationFn: async (input: { uid: string; role: Role }) =>
      (await repository()).setUserRole(input.uid, input.role),
    onSuccess: invalidate,
  });

  const statusMutation = useMutation({
    mutationFn: async (input: { uid: string; status: AccountStatus; reason: string }) =>
      (await repository()).setAccountStatus(input.uid, input.status, input.reason),
    onSuccess: invalidate,
  });

  return {
    people: query.data ?? [],
    search,
    setSearch,
    isLoading: query.isLoading,
    setRole: async (uid, role) => {
      await roleMutation.mutateAsync({ uid, role });
    },
    setStatus: async (uid, status, reason) => {
      await statusMutation.mutateAsync({ uid, status, reason });
    },
    isSaving: roleMutation.isPending || statusMutation.isPending,
  };
}

export interface AuditResult {
  entries: AuditEntry[];
  isLoading: boolean;
}

export function useAuditLog(enabled: boolean): AuditResult {
  const query = useQuery({
    queryKey: ['audit'],
    queryFn: async () => (await repository()).fetchAudit(),
    enabled,
    staleTime: 30_000,
  });

  return { entries: query.data ?? [], isLoading: query.isLoading };
}
