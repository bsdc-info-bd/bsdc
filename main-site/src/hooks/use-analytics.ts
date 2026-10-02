import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type {
  GrowthPoint,
  ModerationPoint,
  ReportKind,
  RetentionCell,
  RevenuePoint,
  SnapshotSummary,
  TopContent,
} from '@/lib/analytics/analytics-types';

const repository = () => import('@/lib/analytics/analytics-repository');

export interface AnalyticsResult {
  days: number;
  setDays: (days: number) => void;
  growth: GrowthPoint[];
  revenue: RevenuePoint[];
  moderation: ModerationPoint[];
  retention: RetentionCell[];
  topContent: TopContent[];
  isLoading: boolean;
  isError: boolean;
}

/** Every series for the dashboard, over one window the viewer controls. */
export function useAnalytics(enabled: boolean): AnalyticsResult {
  const [days, setDays] = useState(30);

  const growth = useQuery({
    queryKey: ['analytics-growth', days],
    queryFn: async () => (await repository()).fetchGrowth(days),
    enabled,
    staleTime: 300_000,
  });

  const revenue = useQuery({
    queryKey: ['analytics-revenue', days],
    queryFn: async () => (await repository()).fetchRevenue(days),
    enabled,
    staleTime: 300_000,
  });

  const moderation = useQuery({
    queryKey: ['analytics-moderation', days],
    queryFn: async () => (await repository()).fetchModerationStats(days),
    enabled,
    staleTime: 300_000,
  });

  const retention = useQuery({
    queryKey: ['analytics-retention'],
    queryFn: async () => (await repository()).fetchRetention(8),
    enabled,
    staleTime: 600_000,
  });

  const topContent = useQuery({
    queryKey: ['analytics-top', days],
    queryFn: async () => (await repository()).fetchTopContent(days, 10),
    enabled,
    staleTime: 300_000,
  });

  return {
    days,
    setDays,
    growth: growth.data ?? [],
    revenue: revenue.data ?? [],
    moderation: moderation.data ?? [],
    retention: retention.data ?? [],
    topContent: topContent.data ?? [],
    isLoading: growth.isLoading || revenue.isLoading,
    isError: growth.isError || revenue.isError,
  };
}

export interface ReportsResult {
  snapshots: SnapshotSummary[];
  isLoading: boolean;
  create: (kind: ReportKind, title: string, days: number) => Promise<void>;
  isSaving: boolean;
  download: (snapshot: SnapshotSummary) => Promise<void>;
  isRendering: boolean;
}

/** Saved report snapshots, and the rendering of one into a PDF. */
export function useReports(enabled: boolean): ReportsResult {
  const queryClient = useQueryClient();
  const [isRendering, setIsRendering] = useState(false);

  const query = useQuery({
    queryKey: ['report-snapshots'],
    queryFn: async () => (await repository()).fetchSnapshots(),
    enabled,
    staleTime: 60_000,
  });

  const createMutation = useMutation({
    mutationFn: async (input: { kind: ReportKind; title: string; days: number }) =>
      (await repository()).createSnapshot(input.kind, input.title, input.days),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['report-snapshots'] });
      void queryClient.invalidateQueries({ queryKey: ['audit'] });
    },
  });

  return {
    snapshots: query.data ?? [],
    isLoading: query.isLoading,
    create: async (kind, title, days) => {
      await createMutation.mutateAsync({ kind, title, days });
    },
    isSaving: createMutation.isPending,
    download: async (snapshot) => {
      setIsRendering(true);
      try {
        const data = await repository();
        const payload = await data.fetchSnapshotPayload(snapshot.id);
        if (payload === null) return;
        // The PDF writer is only loaded when somebody actually prints.
        const [{ buildReportPdf, downloadPdf }, { reportFilename }] = await Promise.all([
          import('@/lib/reports/report-builder'),
          import('@/lib/analytics/analytics-types'),
        ]);
        downloadPdf(
          buildReportPdf(snapshot, payload),
          reportFilename(snapshot.kind, snapshot.periodFrom, snapshot.periodTo),
        );
      } finally {
        setIsRendering(false);
      }
    },
    isRendering,
  };
}
