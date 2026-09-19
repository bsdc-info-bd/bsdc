/**
 * BSDC — src/entities/report/catalog.ts
 * Purpose : The reports BSDC issues, and the rows each one is made of.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : A report is a set of rows and a set of totals built from a snapshot, and nothing else —
 *   which is what lets the same builder run on a device, in a test, or on a server and produce the
 *   same bytes, and therefore the same integrity hash, every time.
 *   Every row is bilingual at the point it is built, because a report in Bangladesh that only speaks
 *   English is a report half the community cannot check its own moderators against.
 *   Counts are of what is in the snapshot. A report never estimates, never extrapolates, and never
 *   fills a gap with a number it did not count.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { REPORT_CATEGORIES, REPORT_STATES } from '@/core/config/moderation';
import { EVENT_MODES, EVENT_STATUSES } from '@/core/config/opportunities';
import { JOB_STATUSES } from '@/core/config/opportunities';
import { ROLES } from '@/core/config/permissions';
import type { ReportRow, ReportPayload } from '@/core/lib/report';
import type { Report } from '@/entities/moderation/model';
import type { BsdcEvent } from '@/entities/event/model';
import type { Job } from '@/entities/job/model';

/** The reports the platform can issue. */
export const REPORT_KINDS = ['moderation', 'events', 'jobs', 'members'] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

/** One report in the catalogue. */
export interface ReportDefinition {
  readonly kind: ReportKind;
  /** Short code printed in the report id, e.g. `MOD`. */
  readonly code: string;
  readonly labelBn: string;
  readonly labelEn: string;
  readonly descriptionBn: string;
  readonly descriptionEn: string;
  /** Who may issue it. */
  readonly minRole: 'support' | 'moderator' | 'admin' | 'root';
}

/** The catalogue. */
export const REPORT_DEFINITIONS: readonly ReportDefinition[] = [
  {
    kind: 'moderation',
    code: 'MOD',
    labelBn: 'মডারেশন সারসংক্ষেপ',
    labelEn: 'Moderation summary',
    descriptionBn: 'কতগুলো রিপোর্ট এল, কী সিদ্ধান্ত হলো এবং কতগুলো এখনো অপেক্ষায় আছে।',
    descriptionEn: 'How many reports arrived, what was decided, and how many are still waiting.',
    minRole: 'support',
  },
  {
    kind: 'events',
    code: 'EVT',
    labelBn: 'ইভেন্ট প্রতিবেদন',
    labelEn: 'Events report',
    descriptionBn: 'প্রকাশিত ইভেন্ট, ধরনভিত্তিক বিভাজন এবং অবস্থা।',
    descriptionEn: 'Published events, split by mode and by status.',
    minRole: 'support',
  },
  {
    kind: 'jobs',
    code: 'JOB',
    labelBn: 'চাকরি প্রতিবেদন',
    labelEn: 'Jobs report',
    descriptionBn: 'চাকরির বিজ্ঞপ্তি কী অবস্থায় আছে এবং কোন ধরনের চাকরি বেশি আসে।',
    descriptionEn: 'The state of every job posting, and which kinds of work are being offered.',
    minRole: 'support',
  },
  {
    kind: 'members',
    code: 'MEM',
    labelBn: 'সদস্য প্রতিবেদন',
    labelEn: 'Members report',
    descriptionBn: 'ভূমিকা অনুযায়ী সদস্য সংখ্যা।',
    descriptionEn: 'How many accounts hold each role.',
    minRole: 'admin',
  },
];

/** A snapshot of the community, from which every report is built. */
export interface CommunitySnapshot {
  readonly reports: readonly Report[];
  readonly events: readonly BsdcEvent[];
  readonly jobs: readonly Job[];
  /** Role to number of accounts holding it. */
  readonly membersByRole: Readonly<Record<string, number>>;
  /** Inclusive period the snapshot covers, when the caller narrowed it. */
  readonly periodStart: string | null;
  readonly periodEnd: string | null;
}

/** The language a counted label should be written in. */
export type ReportLocale = 'bn' | 'en';

/**
 * Builds the payload of one report from a snapshot.
 * @param kind which report
 * @param snapshot the community snapshot
 * @param locale the language to label rows in
 * @returns the payload, ready to be sealed
 */
export function buildReportPayload(
  kind: ReportKind,
  snapshot: CommunitySnapshot,
  locale: ReportLocale,
): ReportPayload {
  const definition = REPORT_DEFINITIONS.find((entry) => entry.kind === kind);
  const title =
    definition === undefined ? kind : locale === 'bn' ? definition.labelBn : definition.labelEn;
  const subtitle =
    definition === undefined
      ? ''
      : locale === 'bn'
        ? definition.descriptionBn
        : definition.descriptionEn;

  const body = rowsFor(kind, snapshot, locale);
  return {
    // The payload carries the short code, not the catalogue key: the code is what appears in the
    // report id, and `moderation` would produce `BSDC-MODERA-...` where `BSDC-MOD-...` is the id a
    // person can actually read out loud to somebody on the phone.
    kind: definition?.code ?? kind,
    title,
    subtitle,
    periodStart: snapshot.periodStart,
    periodEnd: snapshot.periodEnd,
    rows: body.rows,
    totals: body.totals,
  };
}

/**
 * Builds the rows and totals of one report.
 * @param kind which report
 * @param snapshot the snapshot
 * @param locale the language
 * @returns rows and totals
 */
function rowsFor(
  kind: ReportKind,
  snapshot: CommunitySnapshot,
  locale: ReportLocale,
): { readonly rows: readonly ReportRow[]; readonly totals: readonly ReportRow[] } {
  if (kind === 'moderation') {
    const live = snapshot.reports.filter((report) => report.deletedAt == null);
    const byState = REPORT_STATES.map((state) => ({
      label: state,
      value: String(live.filter((report) => report.state === state).length),
      note: locale === 'bn' ? 'রিপোর্ট' : 'reports',
    }));
    const byCategory = REPORT_CATEGORIES.map((category) => ({
      label: category,
      value: String(live.filter((report) => report.category === category).length),
      note: locale === 'bn' ? 'রিপোর্ট' : 'reports',
    }));
    return {
      rows: [...byState, ...byCategory],
      totals: [
        {
          label: locale === 'bn' ? 'মোট রিপোর্ট' : 'Total reports',
          value: String(live.length),
        },
        {
          label: locale === 'bn' ? 'সিদ্ধান্ত হয়েছে' : 'Decided',
          value: String(
            live.filter((report) => report.state === 'actioned' || report.state === 'dismissed')
              .length,
          ),
        },
        {
          label: locale === 'bn' ? 'অপেক্ষমাণ' : 'Still waiting',
          value: String(
            live.filter(
              (report) =>
                report.state === 'open' ||
                report.state === 'triaged' ||
                report.state === 'escalated',
            ).length,
          ),
        },
      ],
    };
  }

  if (kind === 'events') {
    const live = snapshot.events.filter((event) => event.deletedAt == null);
    const byStatus = EVENT_STATUSES.map((status) => ({
      label: status,
      value: String(live.filter((event) => event.status === status).length),
      note: locale === 'bn' ? 'ইভেন্ট' : 'events',
    }));
    const byMode = EVENT_MODES.map((mode) => ({
      label: mode,
      value: String(live.filter((event) => event.mode === mode).length),
      note: locale === 'bn' ? 'ইভেন্ট' : 'events',
    }));
    return {
      rows: [...byStatus, ...byMode],
      totals: [
        {
          label: locale === 'bn' ? 'মোট ইভেন্ট' : 'Total events',
          value: String(live.length),
        },
        {
          label: locale === 'bn' ? 'প্রকাশিত' : 'Published',
          value: String(live.filter((event) => event.status === 'published').length),
        },
      ],
    };
  }

  if (kind === 'jobs') {
    const live = snapshot.jobs.filter((job) => job.deletedAt == null);
    const byStatus = JOB_STATUSES.map((status) => ({
      label: status,
      value: String(live.filter((job) => job.status === status).length),
      note: locale === 'bn' ? 'বিজ্ঞপ্তি' : 'postings',
    }));
    return {
      rows: byStatus,
      totals: [
        {
          label: locale === 'bn' ? 'মোট বিজ্ঞপ্তি' : 'Total postings',
          value: String(live.length),
        },
        {
          label: locale === 'bn' ? 'খোলা' : 'Open',
          value: String(live.filter((job) => job.status === 'open').length),
        },
      ],
    };
  }

  const rows = ROLES.map((role) => ({
    label: role,
    value: String(snapshot.membersByRole[role] ?? 0),
    note: locale === 'bn' ? 'অ্যাকাউন্ট' : 'accounts',
  }));
  const total = ROLES.reduce((sum, role) => sum + (snapshot.membersByRole[role] ?? 0), 0);
  return {
    rows,
    totals: [
      {
        label: locale === 'bn' ? 'মোট অ্যাকাউন্ট' : 'Total accounts',
        value: String(total),
      },
    ],
  };
}

/**
 * Reports whether an account may issue a report.
 * @param definition the report
 * @param role the account's role
 * @param root whether the account holds the root claim
 * @returns true when they may generate it
 */
export function mayIssueReport(definition: ReportDefinition, role: string, root: boolean): boolean {
  if (root || role === 'root') return true;
  const ladder = ['guest', 'member', 'creator', 'vendor', 'support', 'moderator', 'admin', 'root'];
  return ladder.indexOf(role) >= ladder.indexOf(definition.minRole);
}
