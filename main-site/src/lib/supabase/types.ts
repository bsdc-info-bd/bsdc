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

export type DbReaction = 'like' | 'insightful' | 'celebrate' | 'support' | 'curious';

export type DbNotificationKind =
  | 'follow'
  | 'reaction'
  | 'comment'
  | 'reply'
  | 'mention'
  | 'bookmark'
  | 'share'
  | 'post_published'
  | 'moderation';

export type NotificationRow = {
  id: string;
  uid: string;
  actor_uid: string | null;
  kind: DbNotificationKind;
  post_id: string | null;
  comment_id: string | null;
  body: string;
  read_at: string | null;
  created_at: string;
};

export type PostReactionRow = {
  post_id: string;
  uid: string;
  reaction: DbReaction;
  created_at: string;
};

export type CommentRow = {
  id: string;
  post_id: string;
  author_uid: string;
  parent_id: string | null;
  root_id: string | null;
  depth: number;
  body: string;
  status: DbPostStatus;
  likes_count: number;
  replies_count: number;
  is_answer: boolean;
  edited_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CommentReactionRow = { comment_id: string; uid: string; created_at: string };

export type BookmarkCollectionRow = {
  id: string;
  uid: string;
  name: string;
  is_private: boolean;
  created_at: string;
};

export type BookmarkRow = {
  uid: string;
  post_id: string;
  collection_id: string | null;
  note: string;
  created_at: string;
};

export type PostShareRow = {
  id: string;
  post_id: string;
  uid: string | null;
  channel: string;
  created_at: string;
};

export type InteractionStateRow = {
  post_id: string;
  reaction: DbReaction | null;
  bookmarked: boolean;
};

export type ToggleReactionRow = { reacted: boolean; reaction: DbReaction; total: number };

export type ToggleCommentReactionRow = { reacted: boolean; total: number };

export type DbConversationKind = 'direct' | 'group';
export type DbMessageKind = 'text' | 'image' | 'file' | 'snippet' | 'system';
export type DbMemberRole = 'owner' | 'admin' | 'member';

export type ConversationRow = {
  id: string;
  kind: DbConversationKind;
  title: string;
  avatar_url: string;
  created_by: string | null;
  direct_key: string | null;
  last_message_at: string | null;
  last_message_preview: string;
  created_at: string;
  updated_at: string;
};

export type ConversationMemberRow = {
  conversation_id: string;
  uid: string;
  role: DbMemberRole;
  joined_at: string;
  last_read_at: string;
  muted_until: string | null;
  left_at: string | null;
};

export type MessageRow = {
  id: string;
  conversation_id: string;
  sender_uid: string | null;
  kind: DbMessageKind;
  body: string;
  media_url: string;
  media_name: string;
  code_language: string;
  reply_to: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
};

export type ConversationInboxRow = {
  id: string;
  kind: DbConversationKind;
  title: string;
  avatar_url: string;
  last_message_at: string | null;
  last_message_preview: string;
  unread_count: number;
  muted: boolean;
  other_uid: string | null;
  other_username: string | null;
  other_name: string | null;
  other_avatar: string | null;
};

export type DbGroupPrivacy = 'public' | 'private' | 'secret';
export type DbGroupRole = 'owner' | 'admin' | 'moderator' | 'member';
export type DbJoinStatus = 'pending' | 'approved' | 'rejected';
export type DbRsvpStatus = 'going' | 'interested' | 'declined';
export type DbEventMode = 'online' | 'in_person' | 'hybrid';

export type GroupRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  privacy: DbGroupPrivacy;
  avatar_url: string;
  cover_url: string;
  language: string;
  rules: string;
  owner_uid: string;
  members_count: number;
  posts_count: number;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

export type GroupMemberRow = {
  group_id: string;
  uid: string;
  role: DbGroupRole;
  joined_at: string;
  muted_until: string | null;
};

export type GroupJoinRequestRow = {
  group_id: string;
  uid: string;
  status: DbJoinStatus;
  message: string;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
};

export type ChannelRow = {
  id: string;
  group_id: string;
  slug: string;
  name: string;
  topic: string;
  position: number;
  is_read_only: boolean;
  created_at: string;
};

export type PageRow = {
  id: string;
  slug: string;
  name: string;
  category: string;
  about: string;
  avatar_url: string;
  cover_url: string;
  website: string;
  owner_uid: string;
  followers_count: number;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
};

export type PageFollowerRow = { page_id: string; uid: string; created_at: string };

export type EventRow = {
  id: string;
  slug: string;
  title: string;
  description: string;
  mode: DbEventMode;
  venue: string;
  city: string;
  join_url: string;
  cover_url: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  capacity: number | null;
  host_uid: string;
  group_id: string | null;
  page_id: string | null;
  going_count: number;
  is_cancelled: boolean;
  created_at: string;
  updated_at: string;
};

export type EventRsvpRow = {
  event_id: string;
  uid: string;
  status: DbRsvpStatus;
  created_at: string;
};

export type GroupDirectoryRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  privacy: DbGroupPrivacy;
  avatar_url: string;
  members_count: number;
  posts_count: number;
  my_role: DbGroupRole | null;
  request_status: DbJoinStatus | null;
};

export type EventCalendarRow = {
  id: string;
  slug: string;
  title: string;
  mode: DbEventMode;
  venue: string;
  city: string;
  cover_url: string;
  starts_at: string;
  ends_at: string;
  capacity: number | null;
  going_count: number;
  group_id: string | null;
  page_id: string | null;
  my_status: DbRsvpStatus | null;
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
      groups: {
        Row: GroupRow;
        Insert: Pick<GroupRow, 'slug' | 'name' | 'owner_uid'> & Partial<GroupRow>;
        Update: Partial<
          Pick<
            GroupRow,
            | 'name'
            | 'description'
            | 'privacy'
            | 'avatar_url'
            | 'cover_url'
            | 'rules'
            | 'language'
            | 'is_archived'
          >
        >;
        Relationships: [];
      };
      group_members: {
        Row: GroupMemberRow;
        Insert: Pick<GroupMemberRow, 'group_id' | 'uid'> & { role?: DbGroupRole };
        Update: Partial<Pick<GroupMemberRow, 'role' | 'muted_until'>>;
        Relationships: [];
      };
      group_join_requests: {
        Row: GroupJoinRequestRow;
        Insert: Pick<GroupJoinRequestRow, 'group_id' | 'uid'> & { message?: string };
        Update: Partial<Pick<GroupJoinRequestRow, 'status' | 'message'>>;
        Relationships: [];
      };
      channels: {
        Row: ChannelRow;
        Insert: Pick<ChannelRow, 'group_id' | 'slug' | 'name'> & Partial<ChannelRow>;
        Update: Partial<Pick<ChannelRow, 'name' | 'topic' | 'position' | 'is_read_only'>>;
        Relationships: [];
      };
      pages: {
        Row: PageRow;
        Insert: Pick<PageRow, 'slug' | 'name' | 'owner_uid'> & Partial<PageRow>;
        Update: Partial<
          Pick<PageRow, 'name' | 'about' | 'category' | 'avatar_url' | 'cover_url' | 'website'>
        >;
        Relationships: [];
      };
      page_followers: {
        Row: PageFollowerRow;
        Insert: Pick<PageFollowerRow, 'page_id' | 'uid'>;
        Update: Partial<PageFollowerRow>;
        Relationships: [];
      };
      events: {
        Row: EventRow;
        Insert: Pick<EventRow, 'slug' | 'title' | 'starts_at' | 'ends_at' | 'host_uid'> &
          Partial<EventRow>;
        Update: Partial<Omit<EventRow, 'id' | 'created_at' | 'going_count'>>;
        Relationships: [];
      };
      event_rsvps: {
        Row: EventRsvpRow;
        Insert: Pick<EventRsvpRow, 'event_id' | 'uid'> & { status?: DbRsvpStatus };
        Update: Partial<Pick<EventRsvpRow, 'status'>>;
        Relationships: [];
      };
      conversations: {
        Row: ConversationRow;
        Insert: Pick<ConversationRow, 'kind'> & Partial<ConversationRow>;
        Update: Partial<Pick<ConversationRow, 'title' | 'avatar_url'>>;
        Relationships: [];
      };
      conversation_members: {
        Row: ConversationMemberRow;
        Insert: Pick<ConversationMemberRow, 'conversation_id' | 'uid'> & {
          role?: DbMemberRole;
        };
        Update: Partial<Pick<ConversationMemberRow, 'last_read_at' | 'muted_until' | 'left_at'>>;
        Relationships: [];
      };
      messages: {
        Row: MessageRow;
        Insert: Pick<MessageRow, 'conversation_id' | 'body'> & Partial<MessageRow>;
        Update: Partial<Pick<MessageRow, 'body' | 'edited_at' | 'deleted_at'>>;
        Relationships: [];
      };
      notifications: {
        Row: NotificationRow;
        Insert: Pick<NotificationRow, 'uid' | 'kind'> & Partial<NotificationRow>;
        Update: Partial<Pick<NotificationRow, 'read_at'>>;
        Relationships: [];
      };
      post_reactions: {
        Row: PostReactionRow;
        Insert: Pick<PostReactionRow, 'post_id' | 'uid'> & { reaction?: DbReaction };
        Update: Partial<Pick<PostReactionRow, 'reaction'>>;
        Relationships: [];
      };
      comments: {
        Row: CommentRow;
        Insert: Pick<CommentRow, 'post_id' | 'author_uid' | 'body'> & {
          parent_id?: string | null;
        };
        Update: Partial<Pick<CommentRow, 'body' | 'status' | 'edited_at'>>;
        Relationships: [];
      };
      comment_reactions: {
        Row: CommentReactionRow;
        Insert: Pick<CommentReactionRow, 'comment_id' | 'uid'>;
        Update: Partial<CommentReactionRow>;
        Relationships: [];
      };
      bookmark_collections: {
        Row: BookmarkCollectionRow;
        Insert: Pick<BookmarkCollectionRow, 'uid' | 'name'> & { is_private?: boolean };
        Update: Partial<Pick<BookmarkCollectionRow, 'name' | 'is_private'>>;
        Relationships: [];
      };
      bookmarks: {
        Row: BookmarkRow;
        Insert: Pick<BookmarkRow, 'uid' | 'post_id'> & {
          collection_id?: string | null;
          note?: string;
        };
        Update: Partial<Pick<BookmarkRow, 'collection_id' | 'note'>>;
        Relationships: [];
      };
      post_shares: {
        Row: PostShareRow;
        Insert: Pick<PostShareRow, 'post_id' | 'channel'> & { uid?: string | null };
        Update: Partial<PostShareRow>;
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
      toggle_reaction: {
        Args: { p_post_id: string; p_reaction: DbReaction };
        Returns: ToggleReactionRow[];
      };
      toggle_comment_reaction: {
        Args: { p_comment_id: string };
        Returns: ToggleCommentReactionRow[];
      };
      mark_answer: { Args: { p_comment_id: string }; Returns: boolean };
      toggle_bookmark: {
        Args: { p_post_id: string; p_collection_id?: string | null };
        Returns: boolean;
      };
      record_share: { Args: { p_post_id: string; p_channel: string }; Returns: undefined };
      unread_notification_count: { Args: Record<never, never>; Returns: number };
      mark_notifications_read: { Args: { p_ids: string[] | null }; Returns: number };
      create_group: {
        Args: {
          p_slug: string;
          p_name: string;
          p_description?: string;
          p_privacy?: DbGroupPrivacy;
          p_language?: string;
        };
        Returns: string;
      };
      join_group: { Args: { p_group_id: string; p_message?: string }; Returns: DbJoinStatus };
      decide_join_request: {
        Args: { p_group_id: string; p_uid: string; p_approve: boolean };
        Returns: undefined;
      };
      leave_group: { Args: { p_group_id: string }; Returns: undefined };
      set_group_role: {
        Args: { p_group_id: string; p_uid: string; p_role: DbGroupRole };
        Returns: undefined;
      };
      rsvp_event: { Args: { p_event_id: string; p_status: DbRsvpStatus }; Returns: number };
      toggle_page_follow: { Args: { p_page_id: string }; Returns: boolean };
      group_directory: { Args: { p_limit: number }; Returns: GroupDirectoryRow[] };
      event_calendar: { Args: { p_limit: number }; Returns: EventCalendarRow[] };
      open_direct_conversation: { Args: { p_other_uid: string }; Returns: string };
      create_group_conversation: {
        Args: { p_title: string; p_members: string[] };
        Returns: string;
      };
      send_message: {
        Args: {
          p_conversation_id: string;
          p_body: string;
          p_kind?: DbMessageKind;
          p_media_url?: string;
          p_media_name?: string;
          p_code_language?: string;
          p_reply_to?: string | null;
        };
        Returns: MessageRow;
      };
      mark_conversation_read: { Args: { p_conversation_id: string }; Returns: undefined };
      leave_conversation: { Args: { p_conversation_id: string }; Returns: undefined };
      conversation_inbox: { Args: { p_limit: number }; Returns: ConversationInboxRow[] };
      unread_message_count: { Args: Record<never, never>; Returns: number };
      post_interaction_state: {
        Args: { p_post_ids: string[] };
        Returns: InteractionStateRow[];
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
      bsdc_reaction: DbReaction;
      bsdc_notification_kind: DbNotificationKind;
      bsdc_conversation_kind: DbConversationKind;
      bsdc_message_kind: DbMessageKind;
      bsdc_member_role: DbMemberRole;
      bsdc_group_privacy: DbGroupPrivacy;
      bsdc_group_role: DbGroupRole;
      bsdc_join_status: DbJoinStatus;
      bsdc_rsvp_status: DbRsvpStatus;
      bsdc_event_mode: DbEventMode;
    };
    CompositeTypes: Record<never, never>;
  };
};
