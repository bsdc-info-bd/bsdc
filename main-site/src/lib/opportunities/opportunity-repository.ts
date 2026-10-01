import { getSupabase } from '@/lib/supabase/client';
import { toDataError } from '@/lib/supabase/errors';
import type { GigRow, JobBoardRow, PlaygroundSketchRow, ProjectRow } from '@/lib/supabase/types';
import type {
  ApplicationStatus,
  Gig,
  JobListing,
  Project,
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

export async function fetchProjects(viewerUid: string | null, limit = 40): Promise<Project[]> {
  const { data, error } = await getSupabase()
    .from('projects')
    .select('*')
    .order('stars_count', { ascending: false })
    .limit(limit)
    .returns<ProjectRow[]>();
  if (error) throw toDataError(error);

  const rows = data ?? [];
  let starred = new Set<string>();

  if (viewerUid !== null && rows.length > 0) {
    const { data: stars } = await getSupabase()
      .from('project_stars')
      .select('project_id')
      .eq('uid', viewerUid)
      .in(
        'project_id',
        rows.map((row) => row.id),
      );
    starred = new Set((stars ?? []).map((row) => row.project_id));
  }

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    repoUrl: row.repo_url,
    demoUrl: row.demo_url,
    coverUrl: row.cover_url,
    tech: row.tech,
    license: row.license,
    lookingForContributors: row.looking_for_contributors,
    ownerUid: row.owner_uid,
    stars: row.stars_count,
    starred: starred.has(row.id),
  }));
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
  const payload = {
    uid,
    title: sketch.title,
    language: sketch.language,
    code: sketch.code,
  };

  const query =
    sketch.id === undefined
      ? getSupabase().from('playground_sketches').insert(payload)
      : getSupabase().from('playground_sketches').update(payload).eq('id', sketch.id);

  const { data, error } = await query.select('*').single<PlaygroundSketchRow>();
  if (error) throw toDataError(error);
  return toSketch(data);
}

export async function deleteSketch(id: string): Promise<void> {
  const { error } = await getSupabase().from('playground_sketches').delete().eq('id', id);
  if (error) throw toDataError(error);
}
