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

/**
 * Only `uid` and `display_name` are genuinely required: every other member-
 * editable column has a database default or is nullable. The server owns
 * role, moderation, counters, verification and activity fields, and migration
 * 0037 intentionally withholds INSERT grants for them. Keeping this type to
 * the client grant surface prevents a new write payload from turning a valid
 * profile save into a production permission error.
 */
export type ProfileInsert = Pick<ProfileRow, 'uid' | 'display_name'> &
  Partial<
    Omit<
      ProfileRow,
      | 'uid'
      | 'display_name'
      | 'role'
      | 'status'
      | 'email_verified'
      | 'followers_count'
      | 'following_count'
      | 'posts_count'
      | 'reputation'
      | 'last_seen_at'
      | 'created_at'
      | 'updated_at'
    >
  >;

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
  deleted_at: string | null;
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
    | 'deleted_at'
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
  | 'message'
  | 'moderation';

export type NotificationRow = {
  id: string;
  uid: string;
  actor_uid: string | null;
  kind: DbNotificationKind;
  post_id: string | null;
  comment_id: string | null;
  conversation_id: string | null;
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
  deleted_at: string | null;
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
  is_pinned: boolean;
  is_archived: boolean;
  draft_body: string;
};

/** One emoji a member left on one message. */
export type MessageReactionRow = {
  message_id: string;
  uid: string;
  reaction: string;
  created_at: string;
};

/** The delivery and read marks a member gives one message. */
export type MessageReceiptRow = {
  message_id: string;
  uid: string;
  delivered_at: string;
  read_at: string | null;
};

export type MessagePinRow = {
  conversation_id: string;
  message_id: string;
  pinned_by: string;
  pinned_at: string;
};

/** A private bookmark: only its owner can see it. */
export type MessageStarRow = {
  uid: string;
  message_id: string;
  created_at: string;
};

/** A message as `conversation_messages` returns it: with its reactions, my
 * reactions, my receipt, my star, the pin state and the line it answers. */
export type ConversationMessageRow = {
  id: string;
  conversation_id: string;
  sender_uid: string | null;
  kind: DbMessageKind;
  body: string;
  media_url: string;
  media_name: string;
  code_language: string;
  reply_to: string | null;
  reply_body: string | null;
  reply_sender: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
  reactions: Record<string, number>;
  my_reactions: string[];
  read_by: string[];
  starred: boolean;
  pinned: boolean;
};

export type ConversationStateRow = {
  is_member: boolean;
  muted: boolean;
  is_pinned: boolean;
  is_archived: boolean;
  draft_body: string;
  last_read_at: string;
};

export type ConversationPinRow = {
  message_id: string;
  body: string;
  sender_uid: string | null;
  media_name: string;
  kind: DbMessageKind;
  pinned_at: string;
  pinned_by: string;
};

export type SavedMessageRow = {
  message_id: string;
  conversation_id: string;
  body: string;
  media_name: string;
  kind: DbMessageKind;
  created_at: string;
};

export type MessageSearchRow = {
  message_id: string;
  conversation_id: string;
  sender_uid: string | null;
  body: string;
  created_at: string;
};

export type ToggleMessageReactionRow = {
  reacted: boolean;
  reaction: string;
  total: number;
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

export type DbJobType = 'full_time' | 'part_time' | 'contract' | 'internship';
export type DbWorkMode = 'onsite' | 'remote' | 'hybrid';
export type DbListingStatus = 'draft' | 'open' | 'paused' | 'closed';
export type DbApplicationStatus =
  | 'submitted'
  | 'reviewing'
  | 'shortlisted'
  | 'rejected'
  | 'hired'
  | 'withdrawn';
export type DbExperienceLevel = 'entry' | 'junior' | 'mid' | 'senior' | 'lead';
export type DbSketchLanguage = 'javascript' | 'typescript' | 'html' | 'css' | 'sql';

export type JobRow = {
  id: string;
  slug: string;
  title: string;
  company: string;
  company_page_id: string | null;
  description: string;
  job_type: DbJobType;
  work_mode: DbWorkMode;
  level: DbExperienceLevel;
  city: string;
  country: string;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string;
  salary_period: string;
  skills: string[];
  apply_url: string;
  status: DbListingStatus;
  poster_uid: string;
  applications_count: number;
  views_count: number;
  expires_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type GigRow = {
  id: string;
  slug: string;
  title: string;
  description: string;
  budget_min: number | null;
  budget_max: number | null;
  currency: string;
  is_hourly: boolean;
  duration_days: number | null;
  skills: string[];
  status: DbListingStatus;
  client_uid: string;
  proposals_count: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type JobApplicationRow = {
  id: string;
  job_id: string;
  applicant_uid: string;
  cover_letter: string;
  resume_url: string;
  status: DbApplicationStatus;
  decided_at: string | null;
  created_at: string;
};

export type GigProposalRow = {
  id: string;
  gig_id: string;
  freelancer_uid: string;
  pitch: string;
  bid_amount: number;
  delivery_days: number;
  status: DbApplicationStatus;
  created_at: string;
};

export type ProjectRow = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  repo_url: string;
  demo_url: string;
  cover_url: string;
  tech: string[];
  license: string;
  looking_for_contributors: boolean;
  owner_uid: string;
  stars_count: number;
  created_at: string;
  updated_at: string;
};

export type ProjectStarRow = { project_id: string; uid: string; created_at: string };

export type PlaygroundSketchRow = {
  id: string;
  uid: string;
  title: string;
  language: DbSketchLanguage;
  code: string;
  is_public: boolean;
  forked_from: string | null;
  created_at: string;
  updated_at: string;
};

export type JobBoardRow = {
  id: string;
  slug: string;
  title: string;
  company: string;
  job_type: DbJobType;
  work_mode: DbWorkMode;
  level: DbExperienceLevel;
  city: string;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string;
  salary_period: string;
  skills: string[];
  applications_count: number;
  published_at: string | null;
  my_status: DbApplicationStatus | null;
};

export type DbCourseLevel = 'beginner' | 'intermediate' | 'advanced';
export type DbCourseStatus = 'draft' | 'published' | 'archived';
export type DbLessonKind = 'reading' | 'video' | 'exercise' | 'quiz';
export type DbEnrollmentStatus = 'active' | 'completed' | 'dropped';
export type DbQuestionKind = 'single' | 'multiple' | 'boolean';

export type CourseRow = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  description: string;
  cover_url: string;
  level: DbCourseLevel;
  language: string;
  tags: string[];
  outcomes: string[];
  prerequisites: string[];
  duration_minutes: number;
  lesson_count: number;
  enrolled_count: number;
  pass_mark: number;
  grants_certificate: boolean;
  instructor_uid: string;
  status: DbCourseStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CourseModuleRow = {
  id: string;
  course_id: string;
  title: string;
  summary: string;
  position: number;
  created_at: string;
};

export type LessonRow = {
  id: string;
  course_id: string;
  module_id: string | null;
  slug: string;
  title: string;
  kind: DbLessonKind;
  body: string;
  video_url: string;
  duration_minutes: number;
  position: number;
  is_preview: boolean;
  created_at: string;
  updated_at: string;
};

export type EnrollmentRow = {
  id: string;
  course_id: string;
  uid: string;
  status: DbEnrollmentStatus;
  progress: number;
  last_lesson_id: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type LessonProgressRow = {
  id: string;
  lesson_id: string;
  course_id: string;
  uid: string;
  seconds_spent: number;
  completed_at: string;
};

export type QuizRow = {
  id: string;
  course_id: string;
  lesson_id: string | null;
  title: string;
  instructions: string;
  time_limit_minutes: number | null;
  max_attempts: number;
  created_at: string;
};

export type QuizQuestionRow = {
  id: string;
  quiz_id: string;
  prompt: string;
  kind: DbQuestionKind;
  marks: number;
  explanation: string;
  position: number;
};

/** The answer key column is revoked from clients, so it is absent here. */
export type QuizOptionRow = {
  id: string;
  question_id: string;
  label: string;
  position: number;
};

export type QuizAttemptRow = {
  id: string;
  quiz_id: string;
  uid: string;
  score: number;
  earned_marks: number;
  total_marks: number;
  passed: boolean;
  answers: Record<string, string[]>;
  created_at: string;
};

export type CertificateRow = {
  id: string;
  code: string;
  course_id: string;
  uid: string;
  recipient_name: string;
  course_title: string;
  score: number;
  issued_at: string;
  revoked_at: string | null;
  revoke_reason: string;
};

export type CourseCatalogRow = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  cover_url: string;
  level: DbCourseLevel;
  language: string;
  tags: string[];
  duration_minutes: number;
  lesson_count: number;
  enrolled_count: number;
  instructor_uid: string;
  my_progress: number | null;
  my_status: DbEnrollmentStatus | null;
  has_certificate: boolean;
};

export type CourseOutlineRow = {
  lesson_id: string;
  lesson_slug: string;
  title: string;
  kind: DbLessonKind;
  duration_minutes: number;
  position: number;
  module_title: string;
  is_preview: boolean;
  body: string;
  completed: boolean;
};

export type QuizPaperRow = {
  question_id: string;
  prompt: string;
  kind: DbQuestionKind;
  marks: number;
  position: number;
  option_id: string;
  label: string;
  option_position: number;
};

export type GradeResultRow = {
  score: number;
  earned_marks: number;
  total_marks: number;
  passed: boolean;
  certificate_code: string | null;
};

export type CertificateVerificationRow = {
  code: string;
  recipient_name: string;
  course_title: string;
  course_slug: string;
  score: number;
  issued_at: string;
  revoked: boolean;
};

export type SearchKind = 'post' | 'person' | 'group' | 'course' | 'job' | 'project';

export type SearchResultRow = {
  kind: SearchKind;
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  image_url: string;
  rank: number;
  created_at: string;
};

export type SearchSuggestionRow = {
  kind: SearchKind;
  slug: string;
  title: string;
};

export type TrendingSearchRow = {
  term: string;
  uses: number;
};

export type SearchLogRow = {
  id: string;
  term: string;
  result_count: number;
  searched_at: string;
};

export type DbShopStatus = 'pending' | 'active' | 'suspended' | 'closed';
export type DbProductStatus = 'draft' | 'active' | 'out_of_stock' | 'archived';
export type DbOrderStatus =
  | 'pending'
  | 'confirmed'
  | 'packed'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded';
export type DbPaymentMethod = 'cash_on_delivery' | 'bkash' | 'nagad' | 'card' | 'bank';
export type DbPaymentStatus = 'unpaid' | 'pending' | 'paid' | 'refunded' | 'failed';

export type ShopRow = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  about: string;
  logo_url: string;
  owner_uid: string;
  status: DbShopStatus;
  city: string;
  shipping_flat: number;
  free_shipping_over: number | null;
  rating_sum: number;
  rating_count: number;
  orders_count: number;
  created_at: string;
  updated_at: string;
};

export type ProductRow = {
  id: string;
  shop_id: string;
  slug: string;
  title: string;
  summary: string;
  description: string;
  images: string[];
  category: string;
  tags: string[];
  price: number;
  price_original: number | null;
  currency: string;
  stock: number;
  is_digital: boolean;
  max_per_order: number;
  status: DbProductStatus;
  rating_sum: number;
  rating_count: number;
  sold_count: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CartRow = {
  id: string;
  uid: string;
  created_at: string;
  updated_at: string;
};

export type CartItemRow = {
  id: string;
  cart_id: string;
  product_id: string;
  quantity: number;
  added_at: string;
};

export type AddressRow = {
  id: string;
  uid: string;
  label: string;
  recipient: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  district: string;
  postcode: string;
  is_default: boolean;
  created_at: string;
};

export type OrderRow = {
  id: string;
  code: string;
  uid: string;
  shop_id: string;
  status: DbOrderStatus;
  payment_method: DbPaymentMethod;
  payment_status: DbPaymentStatus;
  subtotal: number;
  shipping: number;
  discount: number;
  total: number;
  currency: string;
  recipient: string;
  phone: string;
  address_line: string;
  city: string;
  note: string;
  placed_at: string;
  confirmed_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string;
  updated_at: string;
};

export type OrderItemRow = {
  id: string;
  order_id: string;
  product_id: string;
  title: string;
  unit_price: number;
  quantity: number;
  line_total: number;
};

export type WishlistItemRow = {
  uid: string;
  product_id: string;
  added_at: string;
};

export type ProductReviewRow = {
  id: string;
  product_id: string;
  uid: string;
  order_id: string;
  rating: number;
  body: string;
  created_at: string;
};

export type CartLineRow = {
  product_id: string;
  slug: string;
  title: string;
  image_url: string;
  unit_price: number;
  currency: string;
  quantity: number;
  available: number;
  line_total: number;
  shop_id: string;
  shop_name: string;
  in_stock: boolean;
};

export type CatalogProductRow = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  image_url: string;
  price: number;
  price_original: number | null;
  currency: string;
  stock: number;
  is_digital: boolean;
  category: string;
  rating_sum: number;
  rating_count: number;
  sold_count: number;
  shop_id: string;
  shop_name: string;
  shop_slug: string;
  wishlisted: boolean;
};

export type MyOrderRow = {
  id: string;
  code: string;
  status: DbOrderStatus;
  payment_status: DbPaymentStatus;
  payment_method: DbPaymentMethod;
  total: number;
  currency: string;
  item_count: number;
  shop_name: string;
  placed_at: string;
  can_cancel: boolean;
  can_review: boolean;
};

export type PlacedOrderRow = {
  order_id: string;
  code: string;
  total: number;
};

export type DbLedgerKind = 'sale' | 'commission' | 'refund' | 'payout' | 'adjustment';
export type DbPayoutStatus = 'requested' | 'approved' | 'paid' | 'rejected';

export type PayoutAccountRow = {
  id: string;
  shop_id: string;
  method: DbPaymentMethod;
  account_name: string;
  account_ref: string;
  bank_name: string;
  branch: string;
  is_default: boolean;
  created_at: string;
};

export type ShopLedgerRow = {
  id: string;
  shop_id: string;
  order_id: string | null;
  payout_id: string | null;
  kind: DbLedgerKind;
  amount: number;
  memo: string;
  created_at: string;
};

export type PayoutRow = {
  id: string;
  shop_id: string;
  account_id: string;
  amount: number;
  status: DbPayoutStatus;
  reference: string;
  note: string;
  requested_at: string;
  decided_at: string | null;
  decided_by: string | null;
};

export type MyShopRow = {
  id: string;
  slug: string;
  name: string;
  status: DbShopStatus;
  logo_url: string;
  commission_bps: number;
  shipping_flat: number;
  free_shipping_over: number | null;
  rating_sum: number;
  rating_count: number;
  orders_count: number;
  product_count: number;
  open_orders: number;
  balance: number;
  lifetime_sales: number;
  suspension_reason: string;
};

export type ShopOrderRow = {
  id: string;
  code: string;
  status: DbOrderStatus;
  payment_status: DbPaymentStatus;
  payment_method: DbPaymentMethod;
  total: number;
  currency: string;
  item_count: number;
  recipient: string;
  phone: string;
  address_line: string;
  city: string;
  placed_at: string;
  next_statuses: DbOrderStatus[];
};

export type ShopProductRow = {
  id: string;
  slug: string;
  title: string;
  status: DbProductStatus;
  price: number;
  currency: string;
  stock: number;
  is_digital: boolean;
  sold_count: number;
  rating_sum: number;
  rating_count: number;
  updated_at: string;
};

export type LedgerEntryRow = {
  id: string;
  kind: DbLedgerKind;
  amount: number;
  memo: string;
  created_at: string;
};

export type ShopPayoutRow = {
  id: string;
  amount: number;
  status: DbPayoutStatus;
  reference: string;
  requested_at: string;
  decided_at: string | null;
  method: DbPaymentMethod;
  account_tail: string;
};

export type DbAdStatus =
  | 'draft'
  | 'pending_review'
  | 'active'
  | 'paused'
  | 'rejected'
  | 'completed';
export type DbAdPlacement = 'feed' | 'sidebar' | 'shop' | 'search' | 'article';
export type DbAdPricing = 'cpm' | 'cpc';
export type DbAdEventKind = 'impression' | 'click';
export type DbAdWalletKind = 'topup' | 'spend' | 'refund' | 'adjustment';

export type AdCampaignRow = {
  id: string;
  owner_uid: string;
  name: string;
  status: DbAdStatus;
  pricing: DbAdPricing;
  bid: number;
  daily_budget: number;
  total_budget: number;
  spent: number;
  starts_at: string;
  ends_at: string | null;
  target_cities: string[];
  target_topics: string[];
  target_language: string;
  review_note: string;
  created_at: string;
  updated_at: string;
};

export type AdCreativeRow = {
  id: string;
  campaign_id: string;
  placement: DbAdPlacement;
  headline: string;
  body: string;
  image_url: string;
  cta_label: string;
  target_url: string;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type AdWalletEntryRow = {
  id: string;
  owner_uid: string;
  campaign_id: string | null;
  kind: DbAdWalletKind;
  amount: number;
  memo: string;
  reference: string;
  created_at: string;
};

export type AdEventRow = {
  id: string;
  creative_id: string;
  campaign_id: string;
  uid: string | null;
  kind: DbAdEventKind;
  placement: DbAdPlacement;
  cost: number;
  bucket: string;
  created_at: string;
};

export type AdDailyStatRow = {
  campaign_id: string;
  creative_id: string;
  day: string;
  impressions: number;
  clicks: number;
  spend: number;
};

export type ServedAdRow = {
  creative_id: string;
  campaign_id: string;
  headline: string;
  body: string;
  image_url: string;
  cta_label: string;
  target_url: string;
  placement: DbAdPlacement;
};

export type MyCampaignRow = {
  id: string;
  name: string;
  status: DbAdStatus;
  pricing: DbAdPricing;
  bid: number;
  total_budget: number;
  daily_budget: number;
  spent: number;
  starts_at: string;
  ends_at: string | null;
  review_note: string;
  creative_count: number;
  impressions: number;
  clicks: number;
  spend_today: number;
};

export type CampaignCreativeRow = {
  id: string;
  placement: DbAdPlacement;
  headline: string;
  body: string;
  image_url: string;
  cta_label: string;
  target_url: string;
  is_enabled: boolean;
  impressions: number;
  clicks: number;
  spend: number;
};

export type CampaignDayRow = {
  day: string;
  impressions: number;
  clicks: number;
  spend: number;
};

export type AdWalletHistoryRow = {
  id: string;
  kind: DbAdWalletKind;
  amount: number;
  memo: string;
  reference: string;
  created_at: string;
};

export type DbModerationAction =
  | 'dismiss'
  | 'warn'
  | 'hide_content'
  | 'restore_content'
  | 'suspend_account'
  | 'restore_account'
  | 'ban_account';

export type PluginRow = {
  key: string;
  label: string;
  description: string;
  module: string;
  enabled: boolean;
  audience: string;
  is_core: boolean;
  depends_on: string[];
  rollout_percent: number;
  blocked_by: string[];
  updated_at: string;
};

export type RolePermissionRow = {
  role: DbRole;
  permission: string;
};

export type AdminSettingRow = {
  key: string;
  value: unknown;
  label: string;
  visibility: 'public' | 'staff';
  updated_by: string | null;
  updated_at: string;
};

export type ModerationActionRow = {
  id: string;
  actor_uid: string;
  report_id: string | null;
  subject_type: string;
  subject_id: string;
  action: DbModerationAction;
  reason: string;
  created_at: string;
};

export type ModerationQueueRow = {
  id: string;
  subject_type: string;
  subject_id: string;
  reason: string;
  details: string;
  status: DbReportStatus;
  reporter_uid: string;
  assigned_to: string | null;
  resolution: string;
  report_count: number;
  created_at: string;
};

export type AdminOverviewRow = {
  members_total: number;
  members_today: number;
  posts_total: number;
  posts_today: number;
  open_reports: number;
  shops_pending: number;
  campaigns_pending: number;
  plugins_enabled: number;
  plugins_total: number;
};

export type AdminPersonRow = {
  uid: string;
  username: string | null;
  display_name: string;
  role: DbRole;
  status: DbAccountStatus;
  created_at: string;
};

export type AuditEntryRow = {
  id: number;
  actor_uid: string | null;
  action: string;
  subject: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type DbReportKind = 'overview' | 'growth' | 'revenue' | 'moderation' | 'ads';

export type GrowthRow = {
  day: string;
  new_members: number;
  new_posts: number;
  active_members: number;
};

export type RevenueRow = {
  day: string;
  orders_count: number;
  gross_sales: number;
  commission: number;
  ad_spend: number;
  platform_total: number;
};

export type ModerationStatRow = {
  day: string;
  reports_opened: number;
  reports_resolved: number;
  actions_taken: number;
  median_hours: number;
};

export type RetentionRow = {
  cohort_week: string;
  cohort_size: number;
  week_offset: number;
  retained: number;
};

export type TopContentRow = {
  post_id: string;
  slug: string;
  title: string;
  likes_count: number;
  comments_count: number;
  created_at: string;
};

export type ReportSnapshotRow = {
  id: string;
  kind: DbReportKind;
  title: string;
  period_from: string;
  period_to: string;
  created_by: string | null;
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
      jobs: {
        Row: JobRow;
        Insert: Pick<JobRow, 'slug' | 'title' | 'company' | 'poster_uid'> & Partial<JobRow>;
        Update: Partial<Omit<JobRow, 'id' | 'created_at' | 'applications_count' | 'views_count'>>;
        Relationships: [];
      };
      gigs: {
        Row: GigRow;
        Insert: Pick<GigRow, 'slug' | 'title' | 'client_uid'> & Partial<GigRow>;
        Update: Partial<Omit<GigRow, 'id' | 'created_at' | 'proposals_count'>>;
        Relationships: [];
      };
      job_applications: {
        Row: JobApplicationRow;
        Insert: Pick<JobApplicationRow, 'job_id' | 'applicant_uid'> & Partial<JobApplicationRow>;
        Update: Partial<Pick<JobApplicationRow, 'status'>>;
        Relationships: [];
      };
      gig_proposals: {
        Row: GigProposalRow;
        Insert: Pick<
          GigProposalRow,
          'gig_id' | 'freelancer_uid' | 'pitch' | 'bid_amount' | 'delivery_days'
        >;
        Update: Partial<Pick<GigProposalRow, 'status'>>;
        Relationships: [];
      };
      projects: {
        Row: ProjectRow;
        Insert: Pick<ProjectRow, 'slug' | 'name' | 'owner_uid'> & Partial<ProjectRow>;
        Update: Partial<Omit<ProjectRow, 'id' | 'created_at' | 'stars_count'>>;
        Relationships: [];
      };
      project_stars: {
        Row: ProjectStarRow;
        Insert: Pick<ProjectStarRow, 'project_id' | 'uid'>;
        Update: Partial<ProjectStarRow>;
        Relationships: [];
      };
      courses: {
        Row: CourseRow;
        Insert: Pick<CourseRow, 'slug' | 'title' | 'instructor_uid'> & Partial<CourseRow>;
        Update: Partial<
          Omit<
            CourseRow,
            'id' | 'created_at' | 'lesson_count' | 'duration_minutes' | 'enrolled_count'
          >
        >;
        Relationships: [];
      };
      course_modules: {
        Row: CourseModuleRow;
        Insert: Pick<CourseModuleRow, 'course_id' | 'title' | 'position'> &
          Partial<CourseModuleRow>;
        Update: Partial<Omit<CourseModuleRow, 'id' | 'course_id' | 'created_at'>>;
        Relationships: [];
      };
      lessons: {
        Row: LessonRow;
        Insert: Pick<LessonRow, 'course_id' | 'slug' | 'title' | 'position'> & Partial<LessonRow>;
        Update: Partial<Omit<LessonRow, 'id' | 'course_id' | 'created_at'>>;
        Relationships: [];
      };
      enrollments: {
        Row: EnrollmentRow;
        Insert: Pick<EnrollmentRow, 'course_id' | 'uid'> & Partial<EnrollmentRow>;
        Update: Partial<Pick<EnrollmentRow, 'last_lesson_id'>>;
        Relationships: [];
      };
      lesson_progress: {
        Row: LessonProgressRow;
        Insert: Pick<LessonProgressRow, 'lesson_id' | 'course_id' | 'uid'> &
          Partial<LessonProgressRow>;
        Update: Partial<Pick<LessonProgressRow, 'seconds_spent'>>;
        Relationships: [];
      };
      quizzes: {
        Row: QuizRow;
        Insert: Pick<QuizRow, 'course_id' | 'title'> & Partial<QuizRow>;
        Update: Partial<Omit<QuizRow, 'id' | 'course_id' | 'created_at'>>;
        Relationships: [];
      };
      quiz_questions: {
        Row: QuizQuestionRow;
        Insert: Pick<QuizQuestionRow, 'quiz_id' | 'prompt' | 'position'> & Partial<QuizQuestionRow>;
        Update: Partial<Omit<QuizQuestionRow, 'id' | 'quiz_id'>>;
        Relationships: [];
      };
      quiz_options: {
        Row: QuizOptionRow;
        Insert: Pick<QuizOptionRow, 'question_id' | 'label' | 'position'>;
        Update: Partial<Pick<QuizOptionRow, 'label' | 'position'>>;
        Relationships: [];
      };
      quiz_attempts: {
        Row: QuizAttemptRow;
        Insert: Pick<QuizAttemptRow, 'quiz_id' | 'uid'> & Partial<QuizAttemptRow>;
        Update: Partial<Pick<QuizAttemptRow, 'score'>>;
        Relationships: [];
      };
      certificates: {
        Row: CertificateRow;
        Insert: Pick<CertificateRow, 'code' | 'course_id' | 'uid'> & Partial<CertificateRow>;
        Update: Partial<Pick<CertificateRow, 'revoked_at' | 'revoke_reason'>>;
        Relationships: [];
      };
      shops: {
        Row: ShopRow;
        Insert: Pick<ShopRow, 'slug' | 'name' | 'owner_uid'> & Partial<ShopRow>;
        Update: Partial<
          Omit<ShopRow, 'id' | 'created_at' | 'rating_sum' | 'rating_count' | 'orders_count'>
        >;
        Relationships: [];
      };
      products: {
        Row: ProductRow;
        Insert: Pick<ProductRow, 'shop_id' | 'slug' | 'title' | 'price'> & Partial<ProductRow>;
        Update: Partial<
          Omit<ProductRow, 'id' | 'created_at' | 'rating_sum' | 'rating_count' | 'sold_count'>
        >;
        Relationships: [];
      };
      carts: {
        Row: CartRow;
        Insert: Pick<CartRow, 'uid'> & Partial<CartRow>;
        Update: Partial<Pick<CartRow, 'updated_at'>>;
        Relationships: [];
      };
      cart_items: {
        Row: CartItemRow;
        Insert: Pick<CartItemRow, 'cart_id' | 'product_id' | 'quantity'> & Partial<CartItemRow>;
        Update: Partial<Pick<CartItemRow, 'quantity'>>;
        Relationships: [];
      };
      addresses: {
        Row: AddressRow;
        Insert: Pick<AddressRow, 'uid' | 'recipient' | 'phone' | 'line1' | 'city'> &
          Partial<AddressRow>;
        Update: Partial<Omit<AddressRow, 'id' | 'uid' | 'created_at'>>;
        Relationships: [];
      };
      orders: {
        Row: OrderRow;
        Insert: Pick<OrderRow, 'code' | 'uid' | 'shop_id' | 'subtotal' | 'total'> &
          Partial<OrderRow>;
        Update: Partial<
          Pick<OrderRow, 'status' | 'payment_status' | 'confirmed_at' | 'delivered_at'>
        >;
        Relationships: [];
      };
      order_items: {
        Row: OrderItemRow;
        Insert: Omit<OrderItemRow, 'id'> & { id?: string };
        Update: Partial<Pick<OrderItemRow, 'quantity'>>;
        Relationships: [];
      };
      wishlist_items: {
        Row: WishlistItemRow;
        Insert: Pick<WishlistItemRow, 'uid' | 'product_id'>;
        Update: Partial<WishlistItemRow>;
        Relationships: [];
      };
      product_reviews: {
        Row: ProductReviewRow;
        Insert: Pick<ProductReviewRow, 'product_id' | 'uid' | 'order_id' | 'rating'> &
          Partial<ProductReviewRow>;
        Update: Partial<Pick<ProductReviewRow, 'rating' | 'body'>>;
        Relationships: [];
      };
      payout_accounts: {
        Row: PayoutAccountRow;
        Insert: Pick<PayoutAccountRow, 'shop_id' | 'account_name' | 'account_ref'> &
          Partial<PayoutAccountRow>;
        Update: Partial<Omit<PayoutAccountRow, 'id' | 'shop_id' | 'created_at'>>;
        Relationships: [];
      };
      shop_ledger: {
        Row: ShopLedgerRow;
        Insert: Pick<ShopLedgerRow, 'shop_id' | 'kind' | 'amount'> & Partial<ShopLedgerRow>;
        Update: Partial<Pick<ShopLedgerRow, 'memo'>>;
        Relationships: [];
      };
      payouts: {
        Row: PayoutRow;
        Insert: Pick<PayoutRow, 'shop_id' | 'account_id' | 'amount'> & Partial<PayoutRow>;
        Update: Partial<Pick<PayoutRow, 'status' | 'reference' | 'decided_at'>>;
        Relationships: [];
      };
      ad_campaigns: {
        Row: AdCampaignRow;
        Insert: Pick<AdCampaignRow, 'name' | 'bid' | 'total_budget'> & Partial<AdCampaignRow>;
        Update: Partial<
          Pick<
            AdCampaignRow,
            | 'name'
            | 'pricing'
            | 'bid'
            | 'daily_budget'
            | 'total_budget'
            | 'starts_at'
            | 'ends_at'
            | 'target_cities'
            | 'target_topics'
            | 'target_language'
          >
        >;
        Relationships: [];
      };
      ad_creatives: {
        Row: AdCreativeRow;
        Insert: Pick<AdCreativeRow, 'campaign_id' | 'headline' | 'target_url'> &
          Partial<AdCreativeRow>;
        Update: Partial<
          Pick<
            AdCreativeRow,
            | 'placement'
            | 'headline'
            | 'body'
            | 'image_url'
            | 'cta_label'
            | 'target_url'
            | 'is_enabled'
          >
        >;
        Relationships: [];
      };
      ad_wallet_entries: {
        Row: AdWalletEntryRow;
        Insert: Pick<AdWalletEntryRow, 'owner_uid' | 'kind' | 'amount'> & Partial<AdWalletEntryRow>;
        Update: Partial<Pick<AdWalletEntryRow, 'memo'>>;
        Relationships: [];
      };
      ad_events: {
        Row: AdEventRow;
        Insert: Pick<AdEventRow, 'creative_id' | 'campaign_id' | 'kind' | 'placement' | 'bucket'> &
          Partial<AdEventRow>;
        Update: Partial<Pick<AdEventRow, 'cost'>>;
        Relationships: [];
      };
      ad_daily_stats: {
        Row: AdDailyStatRow;
        Insert: Pick<AdDailyStatRow, 'campaign_id' | 'creative_id' | 'day'> &
          Partial<AdDailyStatRow>;
        Update: Partial<Pick<AdDailyStatRow, 'impressions' | 'clicks' | 'spend'>>;
        Relationships: [];
      };
      role_permissions: {
        Row: RolePermissionRow;
        Insert: RolePermissionRow;
        Update: Partial<RolePermissionRow>;
        Relationships: [];
      };
      admin_settings: {
        Row: AdminSettingRow;
        Insert: Pick<AdminSettingRow, 'key'> & Partial<AdminSettingRow>;
        Update: Partial<Pick<AdminSettingRow, 'value' | 'label' | 'visibility'>>;
        Relationships: [];
      };
      moderation_actions: {
        Row: ModerationActionRow;
        Insert: Pick<ModerationActionRow, 'actor_uid' | 'subject_type' | 'subject_id' | 'action'> &
          Partial<ModerationActionRow>;
        Update: Partial<Pick<ModerationActionRow, 'reason'>>;
        Relationships: [];
      };
      report_snapshots: {
        Row: ReportSnapshotRow & { payload: Json };
        Insert: Pick<ReportSnapshotRow, 'kind' | 'title' | 'period_from' | 'period_to'> & {
          payload: Json;
        };
        Update: Partial<Pick<ReportSnapshotRow, 'title'>>;
        Relationships: [];
      };
      search_log: {
        Row: SearchLogRow;
        Insert: Pick<SearchLogRow, 'term'> & Partial<SearchLogRow>;
        Update: Partial<Pick<SearchLogRow, 'result_count'>>;
        Relationships: [];
      };
      playground_sketches: {
        Row: PlaygroundSketchRow;
        Insert: Pick<PlaygroundSketchRow, 'uid'> & Partial<PlaygroundSketchRow>;
        Update: Partial<Pick<PlaygroundSketchRow, 'title' | 'language' | 'code' | 'is_public'>>;
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
        Update: Partial<
          Pick<
            ConversationMemberRow,
            'last_read_at' | 'muted_until' | 'left_at' | 'is_pinned' | 'is_archived' | 'draft_body'
          >
        >;
        Relationships: [];
      };
      messages: {
        Row: MessageRow;
        Insert: Pick<MessageRow, 'conversation_id' | 'body'> & Partial<MessageRow>;
        Update: Partial<Pick<MessageRow, 'body' | 'edited_at' | 'deleted_at'>>;
        Relationships: [];
      };
      message_reactions: {
        Row: MessageReactionRow;
        Insert: Pick<MessageReactionRow, 'message_id' | 'uid'> & { reaction?: string };
        Update: Partial<Pick<MessageReactionRow, 'reaction'>>;
        Relationships: [];
      };
      message_receipts: {
        Row: MessageReceiptRow;
        Insert: Pick<MessageReceiptRow, 'message_id' | 'uid'> & { read_at?: string | null };
        Update: Partial<Pick<MessageReceiptRow, 'read_at'>>;
        Relationships: [];
      };
      message_pins: {
        Row: MessagePinRow;
        Insert: Pick<MessagePinRow, 'conversation_id' | 'message_id' | 'pinned_by'>;
        Update: Partial<MessagePinRow>;
        Relationships: [];
      };
      message_stars: {
        Row: MessageStarRow;
        Insert: Pick<MessageStarRow, 'uid' | 'message_id'>;
        Update: Partial<MessageStarRow>;
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
        Update: Partial<Pick<CommentRow, 'body' | 'status' | 'edited_at' | 'deleted_at'>>;
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
      my_deleted_content: {
        Args: { p_limit?: number };
        Returns: {
          kind: string;
          id: string;
          post_id: string;
          title: string;
          preview: string;
          deleted_at: string;
          expires_at: string;
          restorable: boolean;
        }[];
      };
      enroll_in_course: { Args: { p_course_id: string }; Returns: string };
      complete_lesson: { Args: { p_lesson_id: string; p_seconds?: number }; Returns: number };
      grade_quiz_attempt: {
        Args: { p_quiz_id: string; p_answers: Record<string, string[]> };
        Returns: GradeResultRow[];
      };
      revoke_certificate: { Args: { p_code: string; p_reason?: string }; Returns: undefined };
      course_catalog: {
        Args: { p_limit: number; p_level?: DbCourseLevel | null; p_tag?: string | null };
        Returns: CourseCatalogRow[];
      };
      course_outline: { Args: { p_slug: string }; Returns: CourseOutlineRow[] };
      quiz_paper: { Args: { p_quiz_id: string }; Returns: QuizPaperRow[] };
      verify_certificate: { Args: { p_code: string }; Returns: CertificateVerificationRow[] };
      open_shop: {
        Args: { p_slug: string; p_name: string; p_tagline?: string; p_city?: string };
        Returns: string;
      };
      decide_shop: {
        Args: { p_shop_id: string; p_approve: boolean; p_reason?: string };
        Returns: undefined;
      };
      advance_order: {
        Args: { p_order_id: string; p_status: DbOrderStatus; p_note?: string };
        Returns: DbOrderStatus;
      };
      mark_order_paid: { Args: { p_order_id: string; p_reference?: string }; Returns: undefined };
      publish_product: {
        Args: { p_product_id: string; p_publish?: boolean };
        Returns: DbProductStatus;
      };
      restock_product: { Args: { p_product_id: string; p_delta: number }; Returns: number };
      request_payout: { Args: { p_account_id: string; p_amount: number }; Returns: string };
      decide_payout: {
        Args: { p_payout_id: string; p_approve: boolean; p_reference?: string };
        Returns: undefined;
      };
      shop_balance: { Args: { p_shop_id: string }; Returns: number };
      my_shop: { Args: Record<never, never>; Returns: MyShopRow[] };
      shop_orders: { Args: { p_limit?: number }; Returns: ShopOrderRow[] };
      shop_products: { Args: { p_limit?: number }; Returns: ShopProductRow[] };
      shop_ledger_entries: { Args: { p_limit?: number }; Returns: LedgerEntryRow[] };
      shop_payouts: { Args: { p_limit?: number }; Returns: ShopPayoutRow[] };
      serve_ads: {
        Args: { p_placement: DbAdPlacement; p_limit?: number };
        Returns: ServedAdRow[];
      };
      record_ad_event: {
        Args: { p_creative_id: string; p_kind: DbAdEventKind };
        Returns: boolean;
      };
      create_campaign: {
        Args: {
          p_name: string;
          p_pricing: DbAdPricing;
          p_bid: number;
          p_total_budget: number;
          p_daily_budget?: number;
          p_starts_at?: string;
          p_ends_at?: string | null;
          p_cities?: string[];
          p_topics?: string[];
          p_language?: string;
        };
        Returns: string;
      };
      add_creative: {
        Args: {
          p_campaign_id: string;
          p_placement: DbAdPlacement;
          p_headline: string;
          p_body: string;
          p_target_url: string;
          p_image_url?: string;
          p_cta_label?: string;
        };
        Returns: string;
      };
      submit_campaign: { Args: { p_campaign_id: string }; Returns: DbAdStatus };
      decide_campaign: {
        Args: { p_campaign_id: string; p_approve: boolean; p_note?: string };
        Returns: DbAdStatus;
      };
      set_campaign_paused: {
        Args: { p_campaign_id: string; p_paused: boolean };
        Returns: DbAdStatus;
      };
      topup_ad_wallet: {
        Args: { p_owner_uid: string; p_amount: number; p_reference?: string };
        Returns: number;
      };
      ad_wallet_balance: { Args: Record<never, never>; Returns: number };
      ad_wallet_history: { Args: { p_limit?: number }; Returns: AdWalletHistoryRow[] };
      my_campaigns: { Args: { p_limit?: number }; Returns: MyCampaignRow[] };
      campaign_creatives: { Args: { p_campaign_id: string }; Returns: CampaignCreativeRow[] };
      campaign_daily: {
        Args: { p_campaign_id: string; p_days?: number };
        Returns: CampaignDayRow[];
      };
      plugin_registry: { Args: Record<never, never>; Returns: PluginRow[] };
      set_plugin_enabled: { Args: { p_key: string; p_enabled: boolean }; Returns: boolean };
      set_plugin_rollout: {
        Args: { p_key: string; p_percent: number; p_audience?: string | null };
        Returns: number;
      };
      set_user_role: { Args: { p_uid: string; p_role: DbRole }; Returns: DbRole };
      /** Migration 0055: what the database decided about the caller. */
      my_role: {
        Args: Record<never, never>;
        Returns: { role: DbRole; staff: boolean; bootstrap: boolean }[];
      };
      claim_bootstrap_role: { Args: Record<never, never>; Returns: DbRole };
      set_account_status: {
        Args: { p_uid: string; p_status: DbAccountStatus; p_reason?: string };
        Returns: DbAccountStatus;
      };
      moderation_queue: {
        Args: { p_status?: string; p_limit?: number };
        Returns: ModerationQueueRow[];
      };
      claim_report: { Args: { p_report_id: string }; Returns: string };
      resolve_report: {
        Args: { p_report_id: string; p_action: string; p_reason?: string };
        Returns: DbReportStatus;
      };
      admin_overview: { Args: Record<never, never>; Returns: AdminOverviewRow[] };
      admin_people: { Args: { p_search?: string; p_limit?: number }; Returns: AdminPersonRow[] };
      admin_audit: { Args: { p_limit?: number }; Returns: AuditEntryRow[] };
      my_permissions: { Args: Record<never, never>; Returns: string[] };
      set_admin_setting: { Args: { p_key: string; p_value: unknown }; Returns: unknown };
      analytics_growth: { Args: { p_days?: number }; Returns: GrowthRow[] };
      analytics_revenue: { Args: { p_days?: number }; Returns: RevenueRow[] };
      analytics_moderation: { Args: { p_days?: number }; Returns: ModerationStatRow[] };
      analytics_retention: { Args: { p_weeks?: number }; Returns: RetentionRow[] };
      analytics_top_content: {
        Args: { p_days?: number; p_limit?: number };
        Returns: TopContentRow[];
      };
      create_report_snapshot: {
        Args: { p_kind: DbReportKind; p_title: string; p_days?: number };
        Returns: string;
      };
      report_snapshots_list: { Args: { p_limit?: number }; Returns: ReportSnapshotRow[] };
      report_snapshot: { Args: { p_id: string }; Returns: Json };
      add_to_cart: { Args: { p_product_id: string; p_quantity?: number }; Returns: number };
      set_cart_quantity: {
        Args: { p_product_id: string; p_quantity: number };
        Returns: undefined;
      };
      clear_cart: { Args: Record<never, never>; Returns: undefined };
      my_cart: { Args: Record<never, never>; Returns: CartLineRow[] };
      place_order: {
        Args: { p_address_id: string; p_payment_method?: DbPaymentMethod; p_note?: string };
        Returns: PlacedOrderRow[];
      };
      cancel_order: { Args: { p_order_id: string; p_reason?: string }; Returns: undefined };
      submit_review: {
        Args: { p_product_id: string; p_rating: number; p_body?: string };
        Returns: string;
      };
      toggle_wishlist: { Args: { p_product_id: string }; Returns: boolean };
      my_orders: { Args: { p_limit?: number }; Returns: MyOrderRow[] };
      product_catalog: {
        Args: {
          p_limit?: number;
          p_category?: string | null;
          p_search?: string | null;
          p_sort?: string;
        };
        Returns: CatalogProductRow[];
      };
      global_search: {
        Args: { p_query: string; p_kinds?: string[] | null; p_limit?: number };
        Returns: SearchResultRow[];
      };
      search_suggestions: {
        Args: { p_prefix: string; p_limit?: number };
        Returns: SearchSuggestionRow[];
      };
      trending_searches: { Args: { p_limit?: number }; Returns: TrendingSearchRow[] };
      log_search: { Args: { p_term: string; p_results: number }; Returns: undefined };
      apply_to_job: {
        Args: { p_job_id: string; p_cover_letter: string; p_resume_url?: string };
        Returns: string;
      };
      withdraw_application: { Args: { p_application_id: string }; Returns: undefined };
      decide_application: {
        Args: { p_application_id: string; p_status: DbApplicationStatus };
        Returns: undefined;
      };
      submit_proposal: {
        Args: {
          p_gig_id: string;
          p_pitch: string;
          p_bid_amount: number;
          p_delivery_days: number;
        };
        Returns: string;
      };
      toggle_project_star: { Args: { p_project_id: string }; Returns: boolean };
      job_board: {
        Args: { p_limit: number; p_work_mode?: DbWorkMode | null; p_skill?: string | null };
        Returns: JobBoardRow[];
      };
      increment_job_view: { Args: { p_job_id: string }; Returns: undefined };
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
      toggle_message_reaction: {
        Args: { p_message_id: string; p_reaction: string };
        Returns: ToggleMessageReactionRow[];
      };
      mark_message_read: { Args: { p_message_id: string }; Returns: undefined };
      toggle_message_pin: { Args: { p_message_id: string }; Returns: boolean };
      toggle_message_star: { Args: { p_message_id: string }; Returns: boolean };
      saved_messages: { Args: { p_limit?: number }; Returns: SavedMessageRow[] };
      search_messages: {
        Args: { p_query: string; p_conversation_id?: string | null; p_limit?: number };
        Returns: MessageSearchRow[];
      };
      conversation_pins: { Args: { p_conversation_id: string }; Returns: ConversationPinRow[] };
      conversation_state: {
        Args: { p_conversation_id: string };
        Returns: ConversationStateRow[];
      };
      conversation_messages: {
        Args: { p_conversation_id: string; p_before?: string | null; p_limit?: number };
        Returns: ConversationMessageRow[];
      };
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
      bsdc_job_type: DbJobType;
      bsdc_work_mode: DbWorkMode;
      bsdc_listing_status: DbListingStatus;
      bsdc_application_status: DbApplicationStatus;
      bsdc_report_kind: DbReportKind;
      bsdc_ad_event_kind: DbAdEventKind;
      bsdc_ad_placement: DbAdPlacement;
      bsdc_ad_pricing: DbAdPricing;
      bsdc_ad_status: DbAdStatus;
      bsdc_ad_wallet_kind: DbAdWalletKind;
      bsdc_ledger_kind: DbLedgerKind;
      bsdc_payout_status: DbPayoutStatus;
      bsdc_shop_status: DbShopStatus;
      bsdc_product_status: DbProductStatus;
      bsdc_order_status: DbOrderStatus;
      bsdc_payment_method: DbPaymentMethod;
      bsdc_payment_status: DbPaymentStatus;
      bsdc_course_level: DbCourseLevel;
      bsdc_course_status: DbCourseStatus;
      bsdc_lesson_kind: DbLessonKind;
      bsdc_enrollment_status: DbEnrollmentStatus;
      bsdc_question_kind: DbQuestionKind;
      bsdc_experience_level: DbExperienceLevel;
    };
    CompositeTypes: Record<never, never>;
  };
};
