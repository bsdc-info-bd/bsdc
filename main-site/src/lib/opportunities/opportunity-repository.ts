import { getSupabase } from '@/lib/supabase/client';
import { toDataError } from '@/lib/supabase/errors';
import type { GigRow, JobBoardRow, PlaygroundSketchRow, ProjectRow } from '@/lib/supabase/types';
import type {
  ApplicationStatus,
  Gig,
  JobListing,
  Project,
  ProjectDetail,
  ProjectScreenshot,
  ProjectSort,
  Sketch,
  SketchLanguage,
  WorkMode,
} from './opportunity-types';

function toJob(row: JobBoardRow): JobListing {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    company: row.company,
    jobType: row.job_type,
    workMode: row.work_mode,
    level: row.level,
    city: row.city,
    salaryMin: row.salary_min,
    salaryMax: row.salary_max,
    currency: row.salary_currency,
    period: row.salary_period,
    skills: row.skills,
    applications: row.applications_count,
    publishedAt: row.published_at,
    myStatus: row.my_status,
  };
}

export async function fetchJobBoard(
  workMode: WorkMode | null = null,
  skill: string | null = null,
  limit = 60,
): Promise<JobListing[]> {
  const { data, error } = await getSupabase()
    .rpc('job_board', { p_limit: limit, p_work_mode: workMode, p_skill: skill })
    .returns<JobBoardRow[]>();
  if (error) throw toDataError(error);
  return (data ?? []).map(toJob);
}

export async function applyToJob(
  jobId: string,
  coverLetter: string,
  resumeUrl = '',
): Promise<string> {
  const { data, error } = await getSupabase().rpc('apply_to_job', {
    p_job_id: jobId,
    p_cover_letter: coverLetter,
    p_resume_url: resumeUrl,
  });
  if (error) throw toDataError(error);
  return typeof data === 'string' ? data : '';
}

export async function decideApplication(
  applicationId: string,
  status: ApplicationStatus,
): Promise<void> {
  const { error } = await getSupabase().rpc('decide_application', {
    p_application_id: applicationId,
    p_status: status,
  });
  if (error) throw toDataError(error);
}

export async function recordJobView(jobId: string): Promise<void> {
  const { error } = await getSupabase().rpc('increment_job_view', { p_job_id: jobId });
  if (error) throw toDataError(error);
}

// -------------------------------- gigs --------------------------------------

function toGig(row: GigRow): Gig {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    budgetMin: row.budget_min,
    budgetMax: row.budget_max,
    currency: row.currency,
    isHourly: row.is_hourly,
    durationDays: row.duration_days,
    skills: row.skills,
    proposals: row.proposals_count,
    clientUid: row.client_uid,
    publishedAt: row.published_at,
  };
}

export async function fetchGigs(limit = 40): Promise<Gig[]> {
  const { data, error } = await getSupabase()
    .from('gigs')
    .select('*')
    .eq('status', 'open')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit)
    .returns<GigRow[]>();
  if (error) throw toDataError(error);
  return (data ?? []).map(toGig);
}

export async function submitProposal(
  gigId: string,
  pitch: string,
  bidAmount: number,
  deliveryDays: number,
): Promise<string> {
  const { data, error } = await getSupabase().rpc('submit_proposal', {
    p_gig_id: gigId,
    p_pitch: pitch,
    p_bid_amount: bidAmount,
    p_delivery_days: deliveryDays,
  });
  if (error) throw toDataError(error);
  return typeof data === 'string' ? data : '';
}

// ------------------------------- projects ------------------------------------

function safeExternalUrl(value: string): string {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function toProject(row: ProjectRow, starred: boolean): Project {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    description: row.description,
    repoUrl: safeExternalUrl(row.repo_url),
    demoUrl: safeExternalUrl(row.demo_url),
    coverUrl: safeExternalUrl(row.cover_url),
    tech: row.tech,
    license: row.license,
    lookingForContributors: row.looking_for_contributors,
    ownerUid: row.owner_uid,
    stars: row.stars_count,
    starred,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchProjects(
  viewerUid: string | null,
  limit = 40,
  sort: ProjectSort = 'popular',
): Promise<Project[]> {
  let query = getSupabase().from('projects').select('*');
  query =
    sort === 'recent'
      ? query.order('created_at', { ascending: false })
      : query.order('stars_count', { ascending: false }).order('created_at', { ascending: false });

  const { data, error } = await query.limit(limit).returns<ProjectRow[]>();
  if (error) throw toDataError(error);

  const rows = data ?? [];
  let starred = new Set<string>();

  if (viewerUid !== null && rows.length > 0) {
    const { data: stars, error: starError } = await getSupabase()
      .from('project_stars')
      .select('project_id')
      .eq('uid', viewerUid)
      .in(
        'project_id',
        rows.map((row) => row.id),
      );
    if (starError) throw toDataError(starError);
    starred = new Set((stars ?? []).map((row) => row.project_id));
  }

  return rows.map((row) => toProject(row, starred.has(row.id)));
}

/**
 * The gallery join, spelled the way PostgREST wants it.
 *
 * `project_media` carries the order and the caption; the address lives on the
 * `media_assets` row it points at. Selecting the nested resource is what makes
 * one query enough, and it is the same shape `POST_SELECT` uses for a post's
 * pictures, so both galleries are read the same way.
 */
export const PROJECT_MEDIA_SELECT = `
  project_media (media_id, position, alt_text, media_assets (url, thumb_url, width, height))
`;

interface JoinedProjectMediaRow {
  media_id: string;
  position: number;
  alt_text: string;
  media_assets: {
    url: string;
    thumb_url: string;
    width: number | null;
    height: number | null;
  } | null;
}

/**
 * Reads the gallery out of a project row.
 *
 * A row whose `media_assets` join came back empty is dropped rather than turned
 * into an `src=""` image. An empty source is not a missing picture to a browser:
 * it is a request for the page it is sitting on, which is how a project page
 * ends up fetching itself and showing a broken tile.
 */
export function toScreenshots(
  rows: readonly JoinedProjectMediaRow[] | null | undefined,
): ProjectScreenshot[] {
  return (rows ?? [])
    .map((row) => ({
      mediaId: row.media_id,
      url: row.media_assets?.url ?? '',
      thumbUrl: row.media_assets?.thumb_url ?? '',
      altText: row.alt_text,
      position: row.position,
      width: row.media_assets?.width ?? null,
      height: row.media_assets?.height ?? null,
    }))
    .filter((shot) => shot.url.trim().length > 0)
    .sort((a, b) => a.position - b.position);
}

export async function fetchProjectBySlug(
  slug: string,
  viewerUid: string | null,
): Promise<ProjectDetail | null> {
  const { data: row, error } = await getSupabase()
    .from('projects')
    .select(`*, ${PROJECT_MEDIA_SELECT}`)
    .eq('slug', slug.trim().toLowerCase())
    .maybeSingle<ProjectRow & { project_media?: JoinedProjectMediaRow[] | null }>();
  if (error) throw toDataError(error);
  if (!row) return null;

  const [ownerResult, starResult] = await Promise.all([
    getSupabase()
      .from('profiles')
      .select('uid, username, display_name, avatar_url')
      .eq('uid', row.owner_uid)
      .maybeSingle(),
    viewerUid === null
      ? Promise.resolve({ data: null, error: null })
      : getSupabase()
          .from('project_stars')
          .select('project_id')
          .eq('project_id', row.id)
          .eq('uid', viewerUid)
          .maybeSingle(),
  ]);
  if (ownerResult.error) throw toDataError(ownerResult.error);
  if (starResult.error) throw toDataError(starResult.error);

  return {
    ...toProject(row, starResult.data !== null),
    owner: ownerResult.data
      ? {
          uid: ownerResult.data.uid,
          username: ownerResult.data.username,
          displayName: ownerResult.data.display_name,
          avatarUrl: ownerResult.data.avatar_url,
        }
      : null,
    screenshots: toScreenshots(row.project_media),
    isOwner: viewerUid !== null && viewerUid === row.owner_uid,
  };
}

/**
 * Everything one member has published, newest first.
 *
 * This is what makes a project manageable rather than merely creatable: without
 * it an author has no way to find their own work again except by remembering the
 * slug. Ownership is enforced by the database on every write below; this read is
 * filtered so a member is not shown a list they cannot act on.
 */
export async function fetchMyProjects(uid: string): Promise<Project[]> {
  const { data, error } = await getSupabase()
    .from('projects')
    .select('*')
    .eq('owner_uid', uid)
    .order('created_at', { ascending: false })
    .returns<ProjectRow[]>();
  if (error) throw toDataError(error);
  // A member's own projects are not "starred by me" in the sense the directory
  // means, and asking would be a second query for a number they already have.
  return (data ?? []).map((row) => toProject(row, false));
}

/** The fields an owner may correct. The counter columns are not among them. */
export interface ProjectUpdate {
  name: string;
  tagline: string;
  description: string;
  repoUrl: string;
  demoUrl: string;
  coverUrl: string;
  tech: string[];
  license: string;
  lookingForContributors: boolean;
}

/**
 * Corrects a published project and returns its slug.
 *
 * The slug is deliberately not writable here. It is the permalink the sitemap,
 * the canonical tag and every link already shared point at; changing it would
 * move a project out from under everything that referred to it, and the
 * platform has a redirect table for the rare case that really is wanted.
 *
 * Ownership is checked twice: once here, so a stranger gets a readable refusal
 * instead of a silent zero-row update, and once by the row-level policy, which
 * is the check that actually counts.
 */
export async function updateProject(projectId: string, draft: ProjectUpdate): Promise<string> {
  const { data, error } = await getSupabase()
    .from('projects')
    .update({
      name: draft.name.trim(),
      tagline: draft.tagline.trim(),
      description: draft.description.trim(),
      repo_url: draft.repoUrl.trim(),
      demo_url: draft.demoUrl.trim(),
      cover_url: draft.coverUrl.trim(),
      tech: draft.tech,
      license: draft.license.trim(),
      looking_for_contributors: draft.lookingForContributors,
    })
    .eq('id', projectId)
    .select('slug')
    .maybeSingle();
  if (error) throw toDataError(error);
  // Row level security hides a project that is not the caller's, so an update
  // that matched nothing is a refusal, not a success. Reporting it as one would
  // send the author back to a page showing the old values with a "saved" toast.
  if (!data) throw new Error('projects.errors.notYours');
  return data.slug;
}

/** One screenshot the author wants on the project, already uploaded. */
export interface ProjectScreenshotDraft {
  mediaId: string;
  altText: string;
}

/**
 * Writes the gallery in the author's order.
 *
 * Delete-then-insert, the way a post's pictures are written: a reorder is then
 * one operation rather than a set of positional patches, and a picture the
 * author removed cannot survive the save. The two foreign keys are not writable
 * at all (migration 0064 revokes them), so this can only ever arrange the
 * author's own uploads on the author's own project.
 *
 * An entry with no `mediaId` is dropped: an upload that was never recorded has
 * no row to point at, and inserting one would fail the whole batch and lose the
 * pictures that did succeed.
 */
export async function replaceProjectScreenshots(
  projectId: string,
  screenshots: readonly ProjectScreenshotDraft[],
): Promise<void> {
  const supabase = getSupabase();
  const { error: clearError } = await supabase
    .from('project_media')
    .delete()
    .eq('project_id', projectId);
  if (clearError) throw toDataError(clearError);

  const rows = screenshots
    .filter((shot) => shot.mediaId.trim().length > 0)
    .map((shot, index) => ({
      project_id: projectId,
      media_id: shot.mediaId.trim(),
      position: index,
      alt_text: shot.altText.slice(0, 280),
    }));
  if (rows.length === 0) return;

  const { error } = await supabase.from('project_media').insert(rows);
  if (error) throw toDataError(error);
}

/**
 * Takes a project down.
 *
 * The database cascades: the gallery references and the stars go with it. The
 * uploads themselves stay in `media_assets`, because the same picture may be
 * attached to something else and because destroying bytes is not this
 * operation's job — it is moderation's, on its own schedule.
 */
export async function deleteProject(projectId: string): Promise<void> {
  const { error, count } = await getSupabase()
    .from('projects')
    .delete({ count: 'exact' })
    .eq('id', projectId);
  if (error) throw toDataError(error);
  if (count === 0) throw new Error('projects.errors.notYours');
}

export async function toggleProjectStar(projectId: string): Promise<boolean> {
  const { data, error } = await getSupabase().rpc('toggle_project_star', {
    p_project_id: projectId,
  });
  if (error) throw toDataError(error);
  return data === true;
}

// ------------------------------ playground -----------------------------------

function toSketch(row: PlaygroundSketchRow): Sketch {
  return {
    id: row.id,
    title: row.title,
    language: row.language,
    code: row.code,
    isPublic: row.is_public,
    updatedAt: row.updated_at,
  };
}

export async function fetchSketches(uid: string): Promise<Sketch[]> {
  const { data, error } = await getSupabase()
    .from('playground_sketches')
    .select('*')
    .eq('uid', uid)
    .order('updated_at', { ascending: false })
    .limit(50)
    .returns<PlaygroundSketchRow[]>();
  if (error) throw toDataError(error);
  return (data ?? []).map(toSketch);
}

export async function saveSketch(
  uid: string,
  sketch: { id?: string; title: string; language: SketchLanguage; code: string },
): Promise<Sketch> {
  // An insert needs the owner; an update must not carry it, because the
  // owner of a sketch is not a thing an edit is allowed to change.
  const fields = {
    title: sketch.title,
    language: sketch.language,
    code: sketch.code,
  };

  const query =
    sketch.id === undefined
      ? getSupabase()
          .from('playground_sketches')
          .insert({ uid, ...fields })
      : getSupabase().from('playground_sketches').update(fields).eq('id', sketch.id);

  const { data, error } = await query.select('*').single<PlaygroundSketchRow>();
  if (error) throw toDataError(error);
  return toSketch(data);
}

export async function deleteSketch(id: string): Promise<void> {
  const { error } = await getSupabase().from('playground_sketches').delete().eq('id', id);
  if (error) throw toDataError(error);
}
