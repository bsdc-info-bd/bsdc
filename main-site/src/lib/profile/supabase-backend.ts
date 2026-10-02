import { getSupabase } from '@/lib/supabase/client';
import { toDataError } from '@/lib/supabase/errors';
import type { ProfileRow, ProfileUpdate } from '@/lib/supabase/types';
import {
  DEFAULT_NOTIFICATIONS,
  DEFAULT_PRIVACY,
  notificationPrefsSchema,
  privacyPrefsSchema,
  profileSchema,
  usernameSchema,
  type Profile,
  type ProfileBackend,
  type ProfileDraft,
  type ProfileFields,
  type ProfileStats,
} from './types';

/** Maps a Postgres row onto the shared profile shape. */
export function rowToProfile(row: ProfileRow): Profile | null {
  const parsed = profileSchema.safeParse({
    uid: row.uid,
    username: row.username ?? '',
    displayName: row.display_name,
    bio: row.bio,
    avatarUrl: row.avatar_url,
    location: row.location,
    website: row.website,
    skills: row.skills,
    interests: row.interests,
    language: row.language === 'en' ? 'en' : 'bn',
    onboardingComplete: row.onboarding_complete,
    notifications: notificationPrefsSchema.safeParse(row.notifications).success
      ? notificationPrefsSchema.parse(row.notifications)
      : DEFAULT_NOTIFICATIONS,
    privacy: privacyPrefsSchema.safeParse(row.privacy).success
      ? privacyPrefsSchema.parse(row.privacy)
      : DEFAULT_PRIVACY,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
  return parsed.success ? parsed.data : null;
}

/** Maps the editable half of a profile onto column names. */
export function fieldsToUpdate(fields: ProfileFields): ProfileUpdate {
  const update: ProfileUpdate = {};
  if (fields.displayName !== undefined) update.display_name = fields.displayName;
  if (fields.bio !== undefined) update.bio = fields.bio;
  if (fields.avatarUrl !== undefined) update.avatar_url = fields.avatarUrl;
  if (fields.location !== undefined) update.location = fields.location;
  if (fields.website !== undefined) update.website = fields.website;
  if (fields.skills !== undefined) update.skills = [...fields.skills];
  if (fields.interests !== undefined) update.interests = [...fields.interests];
  if (fields.language !== undefined) update.language = fields.language;
  if (fields.onboardingComplete !== undefined) {
    update.onboarding_complete = fields.onboardingComplete;
  }
  if (fields.notifications !== undefined) update.notifications = { ...fields.notifications };
  if (fields.privacy !== undefined) update.privacy = { ...fields.privacy };
  return update;
}

function unwrap<T>(data: T | null, error: { message: string; code: string } | null): T | null {
  if (error) {
    // PGRST116 is "no rows" for a single() read, which is not a failure here.
    if (error.code === 'PGRST116') return null;
    throw toDataError(error);
  }
  return data;
}

async function fetchProfile(uid: string): Promise<Profile | null> {
  const { data, error } = await getSupabase()
    .from('profiles')
    .select('*')
    .eq('uid', uid)
    .maybeSingle();
  const row = unwrap(data, error);
  return row ? rowToProfile(row) : null;
}

async function fetchProfileByUsername(username: string): Promise<Profile | null> {
  const { data, error } = await getSupabase()
    .from('profiles')
    .select('*')
    .eq('username', username.trim().toLowerCase())
    .maybeSingle();
  const row = unwrap(data, error);
  return row ? rowToProfile(row) : null;
}

async function isUsernameAvailable(username: string): Promise<boolean> {
  const parsed = usernameSchema.safeParse(username);
  if (!parsed.success) return false;
  const supabase = getSupabase();

  const [reserved, taken] = await Promise.all([
    supabase
      .from('reserved_usernames')
      .select('username')
      .eq('username', parsed.data)
      .maybeSingle(),
    supabase.from('profiles').select('uid').eq('username', parsed.data).maybeSingle(),
  ]);

  if (reserved.error && reserved.error.code !== 'PGRST116') throw toDataError(reserved.error);
  if (taken.error && taken.error.code !== 'PGRST116') throw toDataError(taken.error);

  return reserved.data === null && taken.data === null;
}

/**
 * Upserts the row, then claims the handle through `claim_username()`, whose
 * uniqueness check and reserved-word check run inside the database.
 */
async function saveProfile(uid: string, draft: ProfileDraft): Promise<Profile> {
  const username = usernameSchema.parse(draft.username);
  const supabase = getSupabase();

  const { error: upsertError } = await supabase.from('profiles').upsert(
    {
      uid,
      username: null,
      display_name: draft.displayName,
      bio: draft.bio,
      avatar_url: draft.avatarUrl,
      cover_url: '',
      location: draft.location,
      website: draft.website,
      skills: [...draft.skills],
      interests: [...draft.interests],
      language: draft.language,
      onboarding_complete: draft.onboardingComplete,
      email_verified: false,
      notifications: { ...DEFAULT_NOTIFICATIONS },
      privacy: { ...DEFAULT_PRIVACY },
      last_seen_at: null,
    },
    { onConflict: 'uid', ignoreDuplicates: true },
  );
  if (upsertError) throw toDataError(upsertError);

  const { error: updateError } = await supabase
    .from('profiles')
    .update(
      fieldsToUpdate({
        displayName: draft.displayName,
        bio: draft.bio,
        avatarUrl: draft.avatarUrl,
        location: draft.location,
        website: draft.website,
        skills: draft.skills,
        interests: draft.interests,
        language: draft.language,
        onboardingComplete: draft.onboardingComplete,
      }),
    )
    .eq('uid', uid);
  if (updateError) throw toDataError(updateError);

  const { data, error } = await supabase.rpc('claim_username', { p_username: username });
  if (error) throw toDataError(error);

  const profile = data ? rowToProfile(data) : null;
  if (!profile) throw new Error('profile/save-failed');
  return profile;
}

async function updateProfileFields(uid: string, fields: ProfileFields): Promise<void> {
  const update = fieldsToUpdate(fields);
  if (Object.keys(update).length === 0) return;
  const { error } = await getSupabase().from('profiles').update(update).eq('uid', uid);
  if (error) throw toDataError(error);
}

async function fetchStats(uid: string): Promise<ProfileStats> {
  const { data, error } = await getSupabase()
    .from('profiles')
    .select('followers_count, following_count, posts_count, reputation')
    .eq('uid', uid)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') throw toDataError(error);
  return {
    followers: data?.followers_count ?? 0,
    following: data?.following_count ?? 0,
    posts: data?.posts_count ?? 0,
    reputation: data?.reputation ?? 0,
  };
}

export const supabaseProfileBackend: ProfileBackend = {
  name: 'supabase',
  fetchProfile,
  fetchProfileByUsername,
  isUsernameAvailable,
  saveProfile,
  updateProfileFields,
  fetchStats,
};
