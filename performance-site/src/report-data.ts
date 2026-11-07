import {
  listRpc,
  type BundlePoint,
  type CorporateEnv,
  type ErrorRow,
  type Forecast,
  type TrendPoint,
  type Vital,
  type VitalOverall,
  type VitalRow,
} from '@kit';
import type { EdgeRow } from './model';

export const REPORT_SECTIONS = [
  { id: 'overall', label: 'Application-wide vitals' },
  { id: 'routes', label: 'Route detail' },
  { id: 'trend', label: 'Daily metric trend' },
  { id: 'edge', label: 'Application edge latency' },
  { id: 'errors', label: 'Recent errors (all apps)' },
  { id: 'bundle', label: 'Application bundle history' },
  { id: 'forecast', label: 'Measurement-volume projection (all apps)' },
] as const;
export type ReportSection = (typeof REPORT_SECTIONS)[number]['id'];

export interface ReportOptions {
  readonly title: string;
  readonly app: string;
  readonly days: number;
  readonly metric: Vital;
  readonly sections: readonly ReportSection[];
  readonly rowLimit: number;
  readonly accent: string;
  readonly note: string;
}

export interface ReportData {
  readonly overall: readonly VitalOverall[];
  readonly routes: readonly VitalRow[];
  readonly trend: readonly TrendPoint[];
  readonly edge: readonly EdgeRow[];
  readonly errors: readonly ErrorRow[];
  readonly bundles: readonly BundlePoint[];
  readonly bundleSourceCount: number;
  readonly forecast: Forecast | null;
}

type Reader = <T>(
  env: CorporateEnv,
  name: string,
  args?: Record<string, unknown>,
) => Promise<readonly T[]>;

/** Fetch selected sections fresh. A failed source aborts instead of becoming fake zeroes. */
export async function loadReportData(
  env: CorporateEnv,
  options: ReportOptions,
  read: Reader = listRpc,
  now: Date = new Date(),
): Promise<ReportData> {
  const wants = (section: ReportSection): boolean => options.sections.includes(section);
  const appWindow = { p_days: options.days, p_app: options.app };
  const [overall, routes, trend, edge, errors, bundles, forecast] = await Promise.all([
    wants('overall') ? read<VitalOverall>(env, 'performance_vitals_overall', appWindow) : [],
    wants('routes') ? read<VitalRow>(env, 'vitals_summary', appWindow) : [],
    wants('trend')
      ? read<TrendPoint>(env, 'vitals_trend', { ...appWindow, p_metric: options.metric })
      : [],
    wants('edge') ? read<EdgeRow>(env, 'performance_edge_for_app', appWindow) : [],
    wants('errors')
      ? read<ErrorRow>(env, 'error_board', { p_days: options.days, p_include_resolved: true })
      : [],
    wants('bundle')
      ? read<BundlePoint>(env, 'bundle_history', { p_app: options.app, p_limit: 365 })
      : [],
    wants('forecast') ? read<Forecast>(env, 'capacity_forecast', { p_days: options.days }) : [],
  ]);
  const after = now.getTime() - options.days * 86_400_000;
  return {
    overall,
    routes,
    trend,
    edge,
    errors,
    bundles: bundles.filter((row) => {
      const recorded = new Date(row.recorded_at).getTime();
      return Number.isFinite(recorded) && recorded >= after && recorded <= now.getTime();
    }),
    bundleSourceCount: bundles.length,
    forecast: forecast[0] ?? null,
  };
}

export function reportProblems(options: ReportOptions): readonly string[] {
  const problems: string[] = [];
  if (options.title.trim().length < 3 || options.title.trim().length > 100) {
    problems.push('The report title must contain 3 to 100 characters.');
  }
  if (!Number.isInteger(options.days) || options.days < 1 || options.days > 90) {
    problems.push('Choose a period from 1 to 90 days.');
  }
  if (options.sections.length === 0) problems.push('Choose at least one section.');
  if (![10, 25, 50, 100].includes(options.rowLimit)) problems.push('Choose a supported row limit.');
  if (!['#1b4332', '#134e4a', '#1e3a5f'].includes(options.accent))
    problems.push('Choose a supported report theme.');
  if (options.note.length > 600) problems.push('Keep the private note to 600 characters.');
  return problems;
}
