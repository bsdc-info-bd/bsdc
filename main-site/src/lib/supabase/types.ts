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

export type DbPostKind = 'post' | 'article' | 'question' | 'poll' | 'snippet' | 'media';
export type DbPostStatus = 'draft' | 'published' | 'archived' | 'removed';
export type DbVisibility = 'public' | 'followers' | 'private';

export type TagRow = {
  slug: string;
  label_en: string;
  label_bn: string;
  description: string;
  posts_count: number;
  created_at: string;
};

export type PostRow = {
  id: string;
  author_uid: string;
  kind: DbPostKind;
  status: DbPostStatus;
  visibility: DbVisibility;
  slug: string;
  title: string;
  body: string;
  excerpt: string;
  cover_url: string;
  language: string;
  code: string;
  code_language: string;
  reading_time: number;
  views_count: number;
  likes_count: number;
  comments_count: number;
  is_pinned: boolean;
  is_sensitive: boolean;
  allow_comments: boolean;
  published_at: string | null;
  edited_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PostInsert = Pick<PostRow, 'author_uid' | 'kind' | 'slug'> &
  Partial<
    Pick<
      PostRow,
      | 'id'
      | 'status'
      | 'visibility'
      | 'title'
      | 'body'
      | 'excerpt'
      | 'cover_url'
      | 'language'
      | 'code'
      | 'code_language'
      | 'reading_time'
      | 'is_sensitive'
      | 'allow_comments'
      | 'published_at'
    >
  >;

export type PostUpdate = Partial<
  Pick<
    PostRow,
    | 'kind'
    | 'status'
    | 'visibility'
    | 'slug'
    | 'title'
    | 'body'
    | 'excerpt'
    | 'cover_url'
    | 'language'
    | 'code'
    | 'code_language'
    | 'reading_time'
    | 'is_sensitive'
    | 'allow_comments'
    | 'published_at'
  >
>;

export type PostTagRow = { post_id: string; tag_slug: string };
export type PostMediaRow = {
  post_id: string;
  media_id: string;
  position: number;
  alt_text: string;
};
export type PostMentionRow = { post_id: string; mentioned_uid: string };

export type PollOptionRow = {
  id: string;
  post_id: string;
  position: number;
  label: string;
  votes: number;
};

export type PollVoteRow = {
  post_id: string;
  voter_uid: string;
  option_id: string;
  created_at: string;
};

export type PostRevisionRow = {
  id: number;
  post_id: string;
  editor_uid: string;
  title: string;
  body: string;
  created_at: string;
};

export type FeedPreferencesRow = {
  uid: string;
  algorithm: 'ranked' | 'following' | 'latest';
  languages: string[];
  muted_tags: string[];
  show_sensitive: boolean;
  hide_seen: boolean;
  updated_at: string;
};

export type FeedSeenRow = { uid: string; post_id: string; seen_at: string };

export type TopicAffinityRow = {
  uid: string;
  tag_slug: string;
  score: number;
  updated_at: string;
};

export type FeedCandidateRow = {
  post_id: string;
  author_uid: string;
  published_at: string | null;
  likes_count: number;
  comments_count: number;
  views_count: number;
  language: string;
  is_sensitive: boolean;
  kind: DbPostKind;
  author_followed: boolean;
  affinity: number;
  already_seen: boolean;
  tags: string[];
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
      tags: {
        Row: TagRow;
        Insert: Pick<TagRow, 'slug' | 'label_en'> & Partial<TagRow>;
        Update: Partial<Omit<TagRow, 'slug'>>;
        Relationships: [];
      };
      posts: {
        Row: PostRow;
        Insert: PostInsert;
        Update: PostUpdate;
        Relationships: [];
      };
      post_tags: {
        Row: PostTagRow;
        Insert: PostTagRow;
        Update: Partial<PostTagRow>;
        Relationships: [];
      };
      post_media: {
        Row: PostMediaRow;
        Insert: Pick<PostMediaRow, 'post_id' | 'media_id'> & Partial<PostMediaRow>;
        Update: Partial<PostMediaRow>;
        Relationships: [];
      };
      post_mentions: {
        Row: PostMentionRow;
        Insert: PostMentionRow;
        Update: Partial<PostMentionRow>;
        Relationships: [];
      };
      poll_options: {
        Row: PollOptionRow;
        Insert: Pick<PollOptionRow, 'post_id' | 'position' | 'label'> & { id?: string };
        Update: Partial<Pick<PollOptionRow, 'label' | 'position'>>;
        Relationships: [];
      };
      poll_votes: {
        Row: PollVoteRow;
        Insert: Pick<PollVoteRow, 'post_id' | 'voter_uid' | 'option_id'>;
        Update: Partial<PollVoteRow>;
        Relationships: [];
      };
      post_revisions: {
        Row: PostRevisionRow;
        Insert: Pick<PostRevisionRow, 'post_id' | 'editor_uid'> & Partial<PostRevisionRow>;
        Update: Partial<PostRevisionRow>;
        Relationships: [];
      };
      feed_preferences: {
        Row: FeedPreferencesRow;
        Insert: Pick<FeedPreferencesRow, 'uid'> & Partial<FeedPreferencesRow>;
        Update: Partial<Omit<FeedPreferencesRow, 'uid'>>;
        Relationships: [];
      };
      feed_seen: {
        Row: FeedSeenRow;
        Insert: Pick<FeedSeenRow, 'uid' | 'post_id'>;
        Update: Partial<FeedSeenRow>;
        Relationships: [];
      };
      topic_affinity: {
        Row: TopicAffinityRow;
        Insert: Pick<TopicAffinityRow, 'uid' | 'tag_slug'> & Partial<TopicAffinityRow>;
        Update: Partial<TopicAffinityRow>;
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
      cast_poll_vote: { Args: { p_post_id: string; p_option_id: string }; Returns: undefined };
      increment_post_view: { Args: { p_post_id: string }; Returns: undefined };
      record_feed_impression: { Args: { p_post_id: string }; Returns: undefined };
      prune_feed_seen: { Args: { p_days: number }; Returns: number };
      feed_new_count: { Args: { p_since: string }; Returns: number };
      feed_candidates: {
        Args: { p_limit: number; p_before: string | null };
        Returns: FeedCandidateRow[];
      };
    };
    Enums: {
      bsdc_role: DbRole;
      bsdc_account_status: DbAccountStatus;
      bsdc_media_kind: DbMediaKind;
      bsdc_media_provider: DbMediaProvider;
      bsdc_report_status: DbReportStatus;
      bsdc_post_kind: DbPostKind;
      bsdc_post_status: DbPostStatus;
      bsdc_visibility: DbVisibility;
    };
    CompositeTypes: Record<never, never>;
  };
};
