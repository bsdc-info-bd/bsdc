// ============================================================
// BSDC — Core Type Definitions
// ============================================================

// --- Roles & Permissions ---

export type UserRole =
  | 'OWNER'
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'MANAGEMENT'
  | 'MANAGER'
  | 'MODERATOR'
  | 'EDITOR'
  | 'SUPPORT'
  | 'VERIFIED_CREATOR'
  | 'VERIFIED_ORGANIZATION'
  | 'USER';

export type Permission =
  | 'admin:full'
  | 'admin:users'
  | 'admin:content'
  | 'admin:moderation'
  | 'admin:analytics'
  | 'admin:settings'
  | 'admin:ads'
  | 'admin:creators'
  | 'admin:marketplace'
  | 'admin:jobs'
  | 'admin:events'
  | 'admin:groups'
  | 'admin:licenses'
  | 'admin:seo'
  | 'admin:branding'
  | 'admin:reports'
  | 'admin:audit'
  | 'admin:security'
  | 'admin:feature_flags'
  | 'mod:posts'
  | 'mod:comments'
  | 'mod:users'
  | 'mod:reports'
  | 'content:create'
  | 'content:edit_own'
  | 'content:delete_own'
  | 'content:edit_any'
  | 'content:delete_any'
  | 'messaging:use'
  | 'marketplace:sell'
  | 'marketplace:buy'
  | 'jobs:post'
  | 'jobs:apply'
  | 'groups:create'
  | 'events:create'
  | 'creator:apply'
  | 'ads:create'
  | 'license:register';

// --- Timestamps ---

export interface Timestamps {
  createdAt: number;
  updatedAt: number;
}

// --- User ---

export interface User extends Timestamps {
  uid: string;
  email: string;
  emailVerified: boolean;
  displayName: string | null;
  photoURL: string | null;
  providerId: string;
  role: UserRole;
  permissions: Permission[];
  username: string | null;
  isBanned: boolean;
  isSuspended: boolean;
  suspendedUntil: number | null;
  isDeactivated: boolean;
  mfaEnabled: boolean;
  lastLoginAt: number;
  loginCount: number;
}

// --- Profile ---

export interface UserProfile extends Timestamps {
  uid: string;
  username: string;
  displayName: string;
  avatar: string | null;
  coverImage: string | null;
  title: string;
  bio: string;
  about: string;
  location: UserLocation;
  skills: string[];
  programmingLanguages: string[];
  frameworks: string[];
  education: Education[];
  workHistory: WorkExperience[];
  portfolio: PortfolioItem[];
  socialLinks: SocialLinks;
  isVerified: boolean;
  isCreator: boolean;
  isOrganization: boolean;
  reputation: number;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  badges: Badge[];
  preferences: ProfilePreferences;
}

export interface UserLocation {
  country: string;
  division: string;
  district: string;
  city: string;
  area: string;
  visibility: 'exact' | 'approximate' | 'city' | 'country' | 'hidden';
  lat: number | null;
  lng: number | null;
}

export interface Education {
  id: string;
  institution: string;
  degree: string;
  field: string;
  startYear: number;
  endYear: number | null;
  isCurrent: boolean;
}

export interface WorkExperience {
  id: string;
  company: string;
  title: string;
  location: string;
  startDate: number;
  endDate: number | null;
  isCurrent: boolean;
  description: string;
}

export interface PortfolioItem {
  id: string;
  title: string;
  description: string;
  url: string;
  imageUrl: string | null;
}

export interface SocialLinks {
  github: string;
  linkedin: string;
  website: string;
  twitter: string;
}

export interface ProfilePreferences {
  language: 'en' | 'bn';
  theme: 'light' | 'dark' | 'system';
  emailNotifications: boolean;
  pushNotifications: boolean;
  showEmail: boolean;
  showLocation: boolean;
  showActivity: boolean;
}

// --- Post ---

export type PostType =
  | 'text'
  | 'article'
  | 'blog'
  | 'snippet'
  | 'showcase'
  | 'question'
  | 'answer'
  | 'poll'
  | 'story'
  | 'tutorial'
  | 'job'
  | 'service'
  | 'listing'
  | 'event'
  | 'announcement'
  | 'link'
  | 'image'
  | 'repost'
  | 'quote'
  | 'changelog'
  | 'release'
  | 'resource'
  | 'opensource'
  | 'hiring'
  | 'achievement'
  | 'journal';

export type PostVisibility = 'public' | 'followers' | 'unlisted' | 'private';
export type PostStatus = 'draft' | 'scheduled' | 'published' | 'unpublished' | 'archived' | 'deleted';

export interface Post extends Timestamps {
  id: string;
  slug: string;
  type: PostType;
  status: PostStatus;
  visibility: PostVisibility;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string;
  authorAvatar: string | null;
  title: string;
  body: string;
  bodyHtml: string;
  excerpt: string;
  coverImage: string | null;
  tags: string[];
  category: string;
  language: 'en' | 'bn';
  readingTime: number;
  reactionsCount: Record<string, number>;
  commentsCount: number;
  sharesCount: number;
  bookmarksCount: number;
  viewsCount: number;
  qualityScore: number;
  isPinned: boolean;
  isFeatured: boolean;
  isLocked: boolean;
  scheduledAt: number | null;
  publishedAt: number | null;
  editedAt: number | null;
  canonicalUrl: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  groupId: string | null;
  parentId: string | null;
  pollOptions: PollOption[] | null;
}

export interface PollOption {
  id: string;
  text: string;
  votes: number;
}

// --- Comment ---

export interface Comment extends Timestamps {
  id: string;
  postId: string;
  parentId: string | null;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string;
  authorAvatar: string | null;
  body: string;
  bodyHtml: string;
  depth: number;
  reactionsCount: Record<string, number>;
  repliesCount: number;
  isDeleted: boolean;
  isPinned: boolean;
  isEdited: boolean;
  editedAt: number | null;
}

// --- Reaction ---

export type ReactionType =
  | 'like'
  | 'love'
  | 'care'
  | 'haha'
  | 'wow'
  | 'sad'
  | 'angry'
  | 'fire'
  | 'mind_blown';

export interface Reaction {
  id: string;
  userId: string;
  targetType: 'post' | 'comment';
  targetId: string;
  reactionType: ReactionType;
  createdAt: number;
}

// --- Follow ---

export interface Follow {
  id: string;
  followerId: string;
  followingId: string;
  createdAt: number;
}

// --- Notification ---

export type NotificationType =
  | 'follow'
  | 'comment'
  | 'reply'
  | 'reaction'
  | 'mention'
  | 'share'
  | 'repost'
  | 'system'
  | 'job'
  | 'creator'
  | 'moderation'
  | 'group'
  | 'event'
  | 'marketplace';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  actorId: string | null;
  actorDisplayName: string | null;
  actorAvatar: string | null;
  targetId: string | null;
  targetType: string | null;
  targetSlug: string | null;
  isRead: boolean;
  createdAt: number;
}

// --- Message ---

export interface Conversation extends Timestamps {
  id: string;
  type: 'direct' | 'group';
  name: string | null;
  avatar: string | null;
  participants: ConversationParticipant[];
  lastMessage: MessagePreview | null;
  unreadCount: Record<string, number>;
  isArchived: Record<string, boolean>;
  isMuted: Record<string, boolean>;
  createdBy: string;
}

export interface ConversationParticipant {
  userId: string;
  displayName: string;
  avatar: string | null;
  role: 'owner' | 'admin' | 'member';
  joinedAt: number;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderDisplayName: string;
  senderAvatar: string | null;
  body: string;
  type: 'text' | 'image' | 'file' | 'code' | 'voice' | 'system';
  attachment: MessageAttachment | null;
  replyTo: string | null;
  isEdited: boolean;
  isDeleted: boolean;
  editedAt: number | null;
  createdAt: number;
  readBy: string[];
  deliveredTo: string[];
  reactions: Record<string, string[]>;
}

export interface MessagePreview {
  id: string;
  senderId: string;
  senderName: string;
  body: string;
  type: string;
  createdAt: number;
}

export interface MessageAttachment {
  url: string;
  name: string;
  type: string;
  size: number;
  thumbnailUrl: string | null;
}

// --- Group ---

export type GroupPrivacy = 'public' | 'private' | 'restricted';

export interface Group extends Timestamps {
  id: string;
  slug: string;
  name: string;
  description: string;
  privacy: GroupPrivacy;
  avatar: string | null;
  coverImage: string | null;
  createdBy: string;
  membersCount: number;
  postsCount: number;
  rules: string[];
  tags: string[];
  category: string;
  isVerified: boolean;
}

// --- Organization ---

export interface Organization extends Timestamps {
  id: string;
  slug: string;
  name: string;
  description: string;
  logo: string | null;
  coverImage: string | null;
  website: string;
  location: UserLocation;
  industry: string;
  size: string;
  teamMembers: string[];
  isVerified: boolean;
  followersCount: number;
  postsCount: number;
  jobsCount: number;
}

// --- Project ---

export interface Project extends Timestamps {
  id: string;
  slug: string;
  name: string;
  description: string;
  longDescription: string;
  coverImage: string | null;
  logo: string | null;
  authorId: string;
  organizationId: string | null;
  repositoryUrl: string;
  liveUrl: string;
  technologies: string[];
  category: string;
  status: 'active' | 'archived' | 'completed';
  isFeatured: boolean;
  starsCount: number;
  forksCount: number;
  viewsCount: number;
}

// --- Job ---

export type JobType = 'full-time' | 'part-time' | 'contract' | 'freelance' | 'internship' | 'remote';
export type JobLocation = 'onsite' | 'remote' | 'hybrid';

export interface Job extends Timestamps {
  id: string;
  slug: string;
  title: string;
  description: string;
  companyId: string;
  companyName: string;
  companyLogo: string | null;
  type: JobType;
  locationType: JobLocation;
  location: UserLocation;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string;
  experienceLevel: string;
  skills: string[];
  category: string;
  status: 'draft' | 'pending' | 'approved' | 'expired' | 'filled' | 'cancelled';
  applicationsCount: number;
  viewsCount: number;
  expiresAt: number | null;
  publishedAt: number | null;
  isVerified: boolean;
}

// --- Marketplace ---

export interface MarketplaceListing extends Timestamps {
  id: string;
  slug: string;
  title: string;
  description: string;
  sellerId: string;
  sellerName: string;
  sellerAvatar: string | null;
  images: string[];
  price: number;
  currency: string;
  category: string;
  subcategory: string;
  tags: string[];
  status: 'draft' | 'active' | 'sold' | 'expired' | 'removed';
  isDigital: boolean;
  deliveryType: 'digital' | 'physical' | 'service';
  viewsCount: number;
  favoritesCount: number;
  reviewsCount: number;
  rating: number;
}

// --- Event ---

export type EventType = 'online' | 'offline' | 'hybrid';

export interface Event extends Timestamps {
  id: string;
  slug: string;
  title: string;
  description: string;
  type: EventType;
  coverImage: string | null;
  organizerId: string;
  organizerName: string;
  location: UserLocation;
  virtualLink: string | null;
  startDate: number;
  endDate: number;
  speakers: EventSpeaker[];
  agenda: EventAgendaItem[];
  maxAttendees: number | null;
  attendeesCount: number;
  category: string;
  status: 'upcoming' | 'ongoing' | 'completed' | 'cancelled';
  isFeatured: boolean;
}

export interface EventSpeaker {
  id: string;
  name: string;
  title: string;
  avatar: string | null;
}

export interface EventAgendaItem {
  time: string;
  title: string;
  description: string;
  speakerId: string | null;
}

// --- License ---

export interface SoftwareLicense extends Timestamps {
  id: string;
  licenseId: string;
  softwareName: string;
  version: string;
  developerId: string;
  developerName: string;
  organizationId: string | null;
  licenseType: string;
  issueDate: number;
  expiryDate: number | null;
  status: 'active' | 'expired' | 'revoked' | 'suspended';
  metadata: Record<string, string>;
  verificationHash: string;
  isPublic: boolean;
}

// --- Report ---

export type ReportReason =
  | 'spam'
  | 'harassment'
  | 'hate'
  | 'misinformation'
  | 'malicious_code'
  | 'phishing'
  | 'malware'
  | 'copyright'
  | 'impersonation'
  | 'scam'
  | 'illegal'
  | 'self_harm'
  | 'privacy_violation'
  | 'other';

export type ReportStatus = 'pending' | 'under_review' | 'resolved' | 'dismissed' | 'escalated';

export interface Report {
  id: string;
  reporterId: string;
  targetType: string;
  targetId: string;
  reason: ReportReason;
  description: string;
  status: ReportStatus;
  priority: 'low' | 'medium' | 'high' | 'critical';
  assignedTo: string | null;
  resolution: string | null;
  resolutionReason: string | null;
  createdAt: number;
  updatedAt: number;
  resolvedAt: number | null;
}

// --- Creator ---

export interface CreatorApplication extends Timestamps {
  id: string;
  userId: string;
  displayName: string;
  legalName: string;
  contact: string;
  organization: string;
  country: string;
  taxInfo: string;
  contentCategory: string;
  socialProfiles: string[];
  proof: string[];
  agreementAccepted: boolean;
  status: 'submitted' | 'under_review' | 'needs_info' | 'approved' | 'rejected' | 'contacted';
  milestoneReached: string;
  reviewedBy: string | null;
  reviewNotes: string | null;
}

// --- Ad / Campaign ---

export type AdFormat =
  | 'cpc'
  | 'cpm'
  | 'cpa'
  | 'sponsored_post'
  | 'banner'
  | 'native'
  | 'location_based'
  | 'category_based'
  | 'interest_based'
  | 'job_promotion'
  | 'project_promotion'
  | 'org_promotion'
  | 'event_promotion'
  | 'marketplace_promotion'
  | 'newsletter_sponsor'
  | 'featured_listing';

export interface AdCampaign extends Timestamps {
  id: string;
  advertiserId: string;
  name: string;
  format: AdFormat;
  status: 'draft' | 'pending' | 'approved' | 'active' | 'paused' | 'completed' | 'rejected';
  budget: number;
  spent: number;
  currency: string;
  startDate: number;
  endDate: number;
  targeting: AdTargeting;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  content: AdContent;
  frequencyCap: number;
  priority: number;
}

export interface AdTargeting {
  locations: string[];
  languages: string[];
  categories: string[];
  devices: string[];
  interests: string[];
  ageRange: [number, number] | null;
}

export interface AdContent {
  title: string;
  body: string;
  imageUrl: string | null;
  linkUrl: string;
  ctaText: string;
}

// --- Bookmark ---

export interface Bookmark {
  id: string;
  userId: string;
  targetType: string;
  targetId: string;
  createdAt: number;
}

// --- Badge ---

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  earnedAt: number;
}

// --- Audit Log ---

export interface AuditLog {
  id: string;
  actorId: string;
  actorRole: UserRole;
  action: string;
  targetType: string;
  targetId: string;
  details: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: number;
}

// --- Feature Flag ---

export interface FeatureFlag {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  enabledRoles: UserRole[];
  enabledUsers: string[];
  percentage: number;
  updatedAt: number;
  updatedBy: string;
}

// --- System Settings ---

export interface SystemSettings {
  siteName: string;
  siteDescription: string;
  siteUrl: string;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  readOnlyMode: boolean;
  launchDate: number | null;
  countdownEnabled: boolean;
  availableReactions: ReactionType[];
  maxPostLength: number;
  maxCommentLength: number;
  maxUploadSize: number;
  registrationEnabled: boolean;
  emailVerificationRequired: boolean;
  defaultLanguage: 'en' | 'bn';
  supportedLanguages: string[];
  maxNestingDepth: number;
  explorationPercentage: number;
}

// --- Analytics Aggregate ---

export interface AnalyticsAggregate {
  date: string;
  dau: number;
  wau: number;
  mau: number;
  newUsers: number;
  postsCreated: number;
  commentsCreated: number;
  reactionsCount: number;
  sharesCount: number;
  messagesCount: number;
  searchesCount: number;
  reportsCreated: number;
}

// --- Feed Ranking ---

export interface FeedSignal {
  source: string;
  weight: number;
  value: number;
}

export interface RankedPost {
  post: Post;
  score: number;
  signals: FeedSignal[];
}

// --- API Response ---

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

export interface PaginatedResponse<T> {
  items: T[];
  hasMore: boolean;
  lastCursor: string | null;
  total: number;
}
