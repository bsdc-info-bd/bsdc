/**
 * Database types for the schema in /supabase/migrations.
 *
 * They are maintained by hand next to the SQL rather than generated into the
 * repository, so a migration and its types always land in the same commit.
 */
export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type DbRole = 'member' | 'creator' | 'vendor' | 'moderator' | 'manager' | 'admin' | 'owner';

export type DbAccountStatus = 'active' | 'suspended' | 'deactivated' | 'deleted';
export type DbMediaKind = 'image' | 'document' | 'audio' | 'video';
export type DbMediaProvider = 'cloudinary' | 'imgbb' | 'external';
export type DbReportStatus = 'open' | 'reviewing' | 'actioned' | 'dismissed';

export type ProfileRow = {
  uid: string;
  username: string | null;
  display_name: string;
  bio: string;
  avatar_url: string;
  cover_url: string;
  location: string;
  website: string;
  skills: string[];
  interests: string[];
  language: string;
  role: DbRole;
  status: DbAccountStatus;
  onboarding_complete: boolean;
  email_verified: boolean;
  notifications: Json;
  privacy: Json;
  followers_count: number;
  following_count: number;
  posts_count: number;
  reputation: number;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ProfileInsert = Omit<
  ProfileRow,
  | 'role'
  | 'status'
  | 'followers_count'
  | 'following_count'
  | 'posts_count'
  | 'reputation'
  | 'created_at'
  | 'updated_at'
> &
  Partial<Pick<ProfileRow, 'created_at' | 'updated_at'>>;

export type ProfileUpdate = Partial<
  Pick<
    ProfileRow,
    | 'username'
    | 'display_name'
    | 'bio'
    | 'avatar_url'
    | 'cover_url'
    | 'location'
    | 'website'
    | 'skills'
    | 'interests'
    | 'language'
    | 'onboarding_complete'
    | 'notifications'
    | 'privacy'
    | 'last_seen_at'
  >
>;

export type FollowRow = {
  follower_uid: string;
  followee_uid: string;
  created_at: string;
};

export type BlockRow = {
  blocker_uid: string;
  blocked_uid: string;
  reason: string;
  created_at: string;
};

export type MediaAssetRow = {
  id: string;
  owner_uid: string;
  provider: DbMediaProvider;
  kind: DbMediaKind;
  url: string;
  thumb_url: string;
  delete_token: string;
  width: number | null;
  height: number | null;
  bytes: number;
  mime_type: string;
  checksum: string;
  created_at: string;
};

export type FeatureFlagRow = {
  key: string;
  enabled: boolean;
  audience: 'all' | 'staff' | 'vendor' | 'beta';
  description: string;
  updated_by: string | null;
  updated_at: string;
};

export type ReportRow = {
  id: string;
  reporter_uid: string;
  subject_type: string;
  subject_id: string;
  reason: string;
  details: string;
  status: DbReportStatus;
  handled_by: string | null;
  handled_at: string | null;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: ProfileInsert;
        Update: ProfileUpdate;
        Relationships: [];
      };
      reserved_usernames: {
        Row: { username: string; reason: string; created_at: string };
        Insert: { username: string; reason?: string };
        Update: { reason?: string };
        Relationships: [];
      };
      follows: {
        Row: FollowRow;
        Insert: Pick<FollowRow, 'follower_uid' | 'followee_uid'>;
        Update: Partial<FollowRow>;
        Relationships: [];
      };
      blocks: {
        Row: BlockRow;
        Insert: Pick<BlockRow, 'blocker_uid' | 'blocked_uid'> & { reason?: string };
        Update: { reason?: string };
        Relationships: [];
      };
      media_assets: {
        Row: MediaAssetRow;
        Insert: Omit<MediaAssetRow, 'id' | 'created_at'> & { id?: string };
        Update: Partial<Omit<MediaAssetRow, 'id' | 'owner_uid' | 'created_at'>>;
        Relationships: [];
      };
      feature_flags: {
        Row: FeatureFlagRow;
        Insert: Pick<FeatureFlagRow, 'key'> & Partial<FeatureFlagRow>;
        Update: Partial<Omit<FeatureFlagRow, 'key'>>;
        Relationships: [];
      };
      reports: {
        Row: ReportRow;
        Insert: Pick<ReportRow, 'reporter_uid' | 'subject_type' | 'subject_id' | 'reason'> & {
          details?: string;
        };
        Update: Partial<Pick<ReportRow, 'status' | 'handled_by' | 'handled_at'>>;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      claim_username: { Args: { p_username: string }; Returns: ProfileRow };
    };
    Enums: {
      bsdc_role: DbRole;
      bsdc_account_status: DbAccountStatus;
      bsdc_media_kind: DbMediaKind;
      bsdc_media_provider: DbMediaProvider;
      bsdc_report_status: DbReportStatus;
    };
    CompositeTypes: Record<never, never>;
  };
};
