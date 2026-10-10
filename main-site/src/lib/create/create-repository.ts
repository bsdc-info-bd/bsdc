/**
 * Writing the rows the directories were missing.
 *
 * Each of these tables already had a row level policy letting a member insert
 * their own row (`host_uid`, `poster_uid`, `client_uid`, `owner_uid` compared
 * against the caller), so no new privilege is involved: the site simply never
 * asked. Groups go through `create_group`, which has always been the only door
 * — a member cannot insert into `groups` directly, because the RPC is what adds
 * the owner's own membership row.
 *
 * Slugs are unique and patterned, so a title is run through `uniqueSlug`, which
 * appends a short suffix. Two members listing the same thing on the same day get
 * two working pages instead of one of them getting a 23505.
 */
import { createGroup } from '@/lib/communities/community-repository';
import { uniqueSlug } from '@/lib/content/text';
import { getSupabase } from '@/lib/supabase/client';
import { toDataError } from '@/lib/supabase/errors';
import type {
  CreateKind,
  EventDraftInput,
  GigDraftInput,
  GroupDraftInput,
  JobDraftInput,
  ProjectDraftInput,
} from './create-types';

function timestamp(value: string): string {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? '' : new Date(time).toISOString();
}

export async function createEvent(hostUid: string, draft: EventDraftInput): Promise<string> {
  const { data, error } = await getSupabase()
    .from('events')
    .insert({
      slug: uniqueSlug(draft.title, 'event'),
      title: draft.title.trim(),
      description: draft.description.trim(),
      mode: draft.mode,
      venue: draft.venue.trim(),
      city: draft.city.trim(),
      join_url: draft.joinUrl.trim(),
      cover_url: draft.coverUrl.trim(),
      starts_at: timestamp(draft.startsAt),
      ends_at: timestamp(draft.endsAt),
      timezone: draft.timezone,
      capacity: draft.capacity,
      host_uid: hostUid,
      group_id: draft.groupId,
    })
    .select('slug')
    .single();
  if (error) throw toDataError(error);
  return data?.slug ?? '';
}

export async function createJob(posterUid: string, draft: JobDraftInput): Promise<string> {
  const { data, error } = await getSupabase()
    .from('jobs')
    .insert({
      slug: uniqueSlug(`${draft.company}-${draft.title}`, 'job'),
      title: draft.title.trim(),
      company: draft.company.trim(),
      description: draft.description.trim(),
      job_type: draft.jobType,
      work_mode: draft.workMode,
      level: draft.level,
      city: draft.city.trim(),
      country: 'BD',
      salary_min: draft.salaryMin,
      salary_max: draft.salaryMax,
      salary_currency: 'BDT',
      salary_period: draft.salaryPeriod,
      skills: draft.skills,
      apply_url: draft.applyUrl.trim(),
      status: 'open',
      poster_uid: posterUid,
      expires_at: draft.expiresAt ? timestamp(draft.expiresAt) : null,
      published_at: new Date().toISOString(),
    })
    .select('slug')
    .single();
  if (error) throw toDataError(error);
  return data?.slug ?? '';
}

export async function createGig(clientUid: string, draft: GigDraftInput): Promise<string> {
  const { data, error } = await getSupabase()
    .from('gigs')
    .insert({
      slug: uniqueSlug(draft.title, 'gig'),
      title: draft.title.trim(),
      description: draft.description.trim(),
      budget_min: draft.budgetMin,
      budget_max: draft.budgetMax,
      currency: 'BDT',
      is_hourly: draft.isHourly,
      duration_days: draft.durationDays,
      skills: draft.skills,
      status: 'open',
      client_uid: clientUid,
      published_at: new Date().toISOString(),
    })
    .select('slug')
    .single();
  if (error) throw toDataError(error);
  return data?.slug ?? '';
}

export async function createProject(ownerUid: string, draft: ProjectDraftInput): Promise<string> {
  const { data, error } = await getSupabase()
    .from('projects')
    .insert({
      slug: uniqueSlug(draft.name, 'project'),
      name: draft.name.trim(),
      tagline: draft.tagline.trim(),
      description: draft.description.trim(),
      repo_url: draft.repoUrl.trim(),
      demo_url: draft.demoUrl.trim(),
      cover_url: draft.coverUrl.trim(),
      tech: draft.tech,
      license: draft.license.trim(),
      looking_for_contributors: draft.lookingForContributors,
      owner_uid: ownerUid,
    })
    .select('slug')
    .single();
  if (error) throw toDataError(error);
  return data?.slug ?? '';
}

/** Groups go through the RPC: it writes the membership row the table cannot. */
export async function createGroupListing(draft: GroupDraftInput): Promise<string> {
  await createGroup({
    slug: draft.slug.trim(),
    name: draft.name.trim(),
    description: draft.description.trim(),
    privacy: draft.privacy,
    language: draft.language,
  });
  return draft.slug.trim();
}

export type CreateDraft =
  | EventDraftInput
  | JobDraftInput
  | GigDraftInput
  | ProjectDraftInput
  | GroupDraftInput;

/** One door for the hub, so a caller never has to know which table it landed in. */
export async function createListing(
  kind: CreateKind,
  uid: string,
  draft: CreateDraft,
): Promise<string> {
  switch (kind) {
    case 'event':
      return createEvent(uid, draft as EventDraftInput);
    case 'job':
      return createJob(uid, draft as JobDraftInput);
    case 'gig':
      return createGig(uid, draft as GigDraftInput);
    case 'project':
      return createProject(uid, draft as ProjectDraftInput);
    case 'group':
      return createGroupListing(draft as GroupDraftInput);
  }
}
