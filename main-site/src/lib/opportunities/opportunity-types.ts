import type {
  DbApplicationStatus,
  DbExperienceLevel,
  DbJobType,
  DbListingStatus,
  DbSketchLanguage,
  DbWorkMode,
} from '@/lib/supabase/types';

export type JobType = DbJobType;
export type WorkMode = DbWorkMode;
export type ListingStatus = DbListingStatus;
export type ApplicationStatus = DbApplicationStatus;
export type ExperienceLevel = DbExperienceLevel;
export type SketchLanguage = DbSketchLanguage;

export interface JobListing {
  id: string;
  slug: string;
  title: string;
  company: string;
  jobType: JobType;
  workMode: WorkMode;
  level: ExperienceLevel;
  city: string;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string;
  period: string;
  skills: string[];
  applications: number;
  publishedAt: string | null;
  myStatus: ApplicationStatus | null;
}

export interface Gig {
  id: string;
  slug: string;
  title: string;
  description: string;
  budgetMin: number | null;
  budgetMax: number | null;
  currency: string;
  isHourly: boolean;
  durationDays: number | null;
  skills: string[];
  proposals: number;
  clientUid: string;
  publishedAt: string | null;
}

export type ProjectSort = 'popular' | 'recent';

export interface Project {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  repoUrl: string;
  demoUrl: string;
  coverUrl: string;
  tech: string[];
  license: string;
  lookingForContributors: boolean;
  ownerUid: string;
  stars: number;
  starred: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectOwner {
  uid: string;
  username: string | null;
  displayName: string;
  avatarUrl: string;
}

/**
 * One screenshot in a project's gallery, in the author's order.
 *
 * The bytes are at the external host and `media_assets` holds the row; this is
 * the shape the gallery draws, and it mirrors `PostMediaItem` so one renderer
 * serves both.
 */
export interface ProjectScreenshot {
  mediaId: string;
  url: string;
  thumbUrl: string;
  altText: string;
  position: number;
  width: number | null;
  height: number | null;
}

export interface ProjectDetail extends Project {
  owner: ProjectOwner | null;
  /** The gallery under the cover. Empty for a project published without one. */
  screenshots: ProjectScreenshot[];
  /**
   * Whether the person looking at this project owns it. The database enforces
   * ownership again on every write; this only decides whether to offer the
   * buttons at all, so a stranger is not shown a control that will refuse them.
   */
  isOwner: boolean;
}

export interface Sketch {
  id: string;
  title: string;
  language: SketchLanguage;
  code: string;
  isPublic: boolean;
  updatedAt: string;
}

/**
 * Formats a salary band the way a reader expects: a single figure when both
 * ends agree, "from" when only a floor is known, nothing at all when the
 * employer did not say. Never invents a number.
 */
export function formatSalaryRange(
  min: number | null,
  max: number | null,
  currency: string,
  language: 'bn' | 'en',
): string | null {
  if (min === null && max === null) return null;
  const locale = language === 'bn' ? 'bn-BD' : 'en-BD';
  const money = (value: number): string =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(value);

  if (min !== null && max !== null) {
    return min === max ? money(min) : `${money(min)} – ${money(max)}`;
  }
  return money((min ?? max) as number);
}

/** True when an applicant may still act on their own application. */
export function canWithdraw(status: ApplicationStatus | null): boolean {
  return status === 'submitted' || status === 'reviewing' || status === 'shortlisted';
}

export function isApplied(status: ApplicationStatus | null): boolean {
  return status !== null && status !== 'withdrawn';
}

/** Terminal states no longer belong in an employer's working queue. */
export function isDecided(status: ApplicationStatus): boolean {
  return status === 'rejected' || status === 'hired' || status === 'withdrawn';
}

export interface JobFilters {
  workMode: WorkMode | null;
  skill: string | null;
  level: ExperienceLevel | null;
  query: string;
}

export const EMPTY_JOB_FILTERS: JobFilters = {
  workMode: null,
  skill: null,
  level: null,
  query: '',
};

/**
 * Client-side narrowing applied on top of the server's filters: the database
 * already handles work mode and skill, this covers free text and level so
 * typing feels instant.
 */
export function filterJobs(jobs: readonly JobListing[], filters: JobFilters): JobListing[] {
  const query = filters.query.trim().toLowerCase();

  return jobs.filter((job) => {
    if (filters.level !== null && job.level !== filters.level) return false;
    if (filters.workMode !== null && job.workMode !== filters.workMode) return false;
    if (filters.skill !== null && !job.skills.includes(filters.skill.toLowerCase())) return false;
    if (query.length === 0) return true;

    return (
      job.title.toLowerCase().includes(query) ||
      job.company.toLowerCase().includes(query) ||
      job.city.toLowerCase().includes(query) ||
      job.skills.some((skill) => skill.includes(query))
    );
  });
}

/** Every skill mentioned by the current result set, most common first. */
export function skillFacets(jobs: readonly JobListing[], limit = 12): string[] {
  const counts = new Map<string, number>();
  for (const job of jobs) {
    for (const skill of job.skills) counts.set(skill, (counts.get(skill) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => (b[1] === a[1] ? a[0].localeCompare(b[0]) : b[1] - a[1]))
    .slice(0, limit)
    .map(([skill]) => skill);
}

/**
 * The document handed to the sandboxed playground iframe. The frame is
 * sandboxed to "allow-scripts" only, so it has no same-origin access, no
 * storage, no network credentials and no way back into the host page except
 * the postMessage channel this document opens itself.
 */
export function buildSandboxDocument(language: SketchLanguage, code: string): string {
  const escape = (value: string): string =>
    value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  if (language === 'html') {
    return code;
  }
  if (language === 'css') {
    return `<!doctype html><meta charset="utf-8"><style>${code}</style><div id="preview">CSS preview</div>`;
  }
  if (language === 'sql') {
    return `<!doctype html><meta charset="utf-8"><pre>${escape(code)}</pre>`;
  }

  // JavaScript and TypeScript: TypeScript annotations are not stripped, so a
  // sketch that uses them will report a syntax error rather than pretend.
  return [
    '<!doctype html><meta charset="utf-8">',
    '<body><pre id="out"></pre><script>',
    'var out=document.getElementById("out");',
    'function print(){out.textContent+=Array.prototype.map.call(arguments,function(v){',
    'try{return typeof v==="string"?v:JSON.stringify(v);}catch(e){return String(v);}',
    '}).join(" ")+"\\n";}',
    'console.log=print;console.info=print;console.warn=print;console.error=print;',
    'try{',
    code,
    '}catch(error){out.textContent+="Error: "+(error&&error.message?error.message:error);}',
    '<\\/script></body>',
  ].join('\n');
}
