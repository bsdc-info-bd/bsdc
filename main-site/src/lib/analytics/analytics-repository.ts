import { getSupabase } from '@/lib/supabase/client';
import { toDataError } from '@/lib/supabase/errors';
import type {
  GrowthRow,
  ModerationStatRow,
  ReportSnapshotRow,
  RetentionRow,
  RevenueRow,
  TopContentRow,
} from '@/lib/supabase/types';
import {
  parseSnapshot,
  type GrowthPoint,
  type ModerationPoint,
  type ReportKind,
  type RetentionCell,
  type RevenuePoint,
  type SnapshotPayload,
  type SnapshotSummary,
  type TopContent,
} from './analytics-types';

export async function fetchGrowth(days = 30): Promise<GrowthPoint[]> {
  const { data, error } = await getSupabase()
    .rpc('analytics_growth', { p_days: days })
    .returns<GrowthRow[]>();
  if (error) throw toDataError(error);
  return (data ?? []).map((row) => ({
    day: row.day,
    newMembers: row.new_members,
    newPosts: row.new_posts,
    activeMembers: row.active_members,
  }));
}

export async function fetchRevenue(days = 30): Promise<RevenuePoint[]> {
  const { data, error } = await getSupabase()
    .rpc('analytics_revenue', { p_days: days })
    .returns<RevenueRow[]>();
  if (error) throw toDataError(error);
  return (data ?? []).map((row) => ({
    day: row.day,
    ordersCount: row.orders_count,
    grossSales: row.gross_sales,
    commission: row.commission,
    adSpend: row.ad_spend,
    platformTotal: row.platform_total,
  }));
}

export async function fetchModerationStats(days = 30): Promise<ModerationPoint[]> {
  const { data, error } = await getSupabase()
    .rpc('analytics_moderation', { p_days: days })
    .returns<ModerationStatRow[]>();
  if (error) throw toDataError(error);
  return (data ?? []).map((row) => ({
    day: row.day,
    reportsOpened: row.reports_opened,
    reportsResolved: row.reports_resolved,
    actionsTaken: row.actions_taken,
    medianHours: Number(row.median_hours),
  }));
}

export async function fetchRetention(weeks = 8): Promise<RetentionCell[]> {
  const { data, error } = await getSupabase()
    .rpc('analytics_retention', { p_weeks: weeks })
    .returns<RetentionRow[]>();
  if (error) throw toDataError(error);
  return (data ?? []).map((row) => ({
    cohortWeek: row.cohort_week,
    cohortSize: row.cohort_size,
    weekOffset: row.week_offset,
    retained: row.retained,
  }));
}

export async function fetchTopContent(days = 30, limit = 10): Promise<TopContent[]> {
  const { data, error } = await getSupabase()
    .rpc('analytics_top_content', { p_days: days, p_limit: limit })
    .returns<TopContentRow[]>();
  if (error) throw toDataError(error);
  return (data ?? []).map((row) => ({
    postId: row.post_id,
    slug: row.slug,
    title: row.title,
    likesCount: row.likes_count,
    commentsCount: row.comments_count,
    createdAt: row.created_at,
  }));
}

export async function fetchSnapshots(limit = 30): Promise<SnapshotSummary[]> {
  const { data, error } = await getSupabase()
    .rpc('report_snapshots_list', { p_limit: limit })
    .returns<ReportSnapshotRow[]>();
  if (error) throw toDataError(error);
  return (data ?? []).map((row) => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    periodFrom: row.period_from,
    periodTo: row.period_to,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }));
}

export async function createSnapshot(
  kind: ReportKind,
  title: string,
  days: number,
): Promise<string> {
  const { data, error } = await getSupabase().rpc('create_report_snapshot', {
    p_kind: kind,
    p_title: title.trim(),
    p_days: days,
  });
  if (error) throw toDataError(error);
  return data;
}

export async function fetchSnapshotPayload(id: string): Promise<SnapshotPayload | null> {
  const { data, error } = await getSupabase().rpc('report_snapshot', { p_id: id });
  if (error) throw toDataError(error);
  return parseSnapshot(data);
}
