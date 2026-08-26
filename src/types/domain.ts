/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import type { BaseEntity } from './common';

export type NotificationType =
  | 'new_follower'
  | 'post_reaction'
  | 'comment'
  | 'reply'
  | 'mention'
  | 'message'
  | 'group_invite'
  | 'post_shared'
  | 'points_received'
  | 'admin_announcement'
  | 'creator_status'
  | 'license_status'
  | 'job_application'
  | 'moderation_action'
  | 'story_view'
  | 'system';

export interface AppNotification extends BaseEntity {
  userId: string;
  type: NotificationType;
  actorId: string;
  actorName: string;
  actorAvatar: string;
  title: string;
  body: string;
  link: string;
  read: boolean;
}

export interface Group extends BaseEntity {
  name: string;
  slug: string;
  description: string;
  coverPhoto: string;
  type: 'public' | 'closed' | 'secret';
  memberCount: number;
  createdBy: string;
  createdByName: string;
  rules: string[];
  tags: string[];
  category: string;
}

export type GroupRole = 'owner' | 'admin' | 'moderator' | 'member';

export interface GroupMember extends BaseEntity {
  groupId: string;
  userId: string;
  displayName: string;
  username: string;
  avatar: string;
  role: GroupRole;
  joinedAt: number;
}

export type OrganizationType = 'organization' | 'business';
export type OrganizationMemberRole = 'owner' | 'admin' | 'member';

export interface Organization extends BaseEntity {
  name: string;
  slug: string;
  type: OrganizationType;
  description: string;
  logo: string;
  website: string;
  industry: string;
  size: 'solo' | 'small' | 'medium' | 'large' | 'enterprise';
  ownerId: string;
  memberCount: number;
  createdByName: string;
}

export interface OrganizationMember extends BaseEntity {
  organizationId: string;
  userId: string;
  displayName: string;
  username: string;
  avatar: string;
  role: OrganizationMemberRole;
  joinedAt: number;
}

export interface Report extends BaseEntity {
  reporterId: string;
  reporterName: string;
  targetType: 'post' | 'comment' | 'user' | 'message' | 'listing' | 'group';
  targetId: string;
  targetPreview: string;
  reason: string;
  details: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'open' | 'reviewing' | 'resolved' | 'dismissed';
  handledBy: string;
  handledAt: number;
  resolution: string;
}

export interface PointTransaction extends BaseEntity {
  from: string;
  to: string;
  fromName: string;
  toName: string;
  amount: number;
  type: 'earn' | 'spend' | 'transfer' | 'admin_grant';
  reason: string;
  qrCodeUsed: boolean;
}

export type LicenseStatus = 'pending' | 'approved' | 'rejected' | 'revoked' | 'expired';

export interface SoftwareLicense extends BaseEntity {
  ownerId: string;
  ownerName: string;
  ownerUsername: string;
  softwareName: string;
  version: string;
  description: string;
  category: string;
  repoUrl: string;
  liveUrl: string;
  screenshots: string[];
  techStack: string[];
  licenseType: string;
  status: LicenseStatus;
  licenseId: string;
  qrPayload: string;
  issuedAt: number | null;
  reviewNote: string;
}

export type CreatorTier = 'none' | 'standard' | 'enhanced' | 'elite';

export interface CreatorApplication extends BaseEntity {
  uid: string;
  displayName: string;
  username: string;
  email: string;
  legalName: string;
  nationalId: string;
  phone: string;
  address: string;
  portfolioUrl: string;
  reason: string;
  followerCount: number;
  tier: CreatorTier;
  status: 'applied' | 'approved' | 'rejected';
  reviewNote: string;
  reviewedBy: string;
  reviewedAt: number | null;
}

export type ListingStatus = 'pending' | 'active' | 'sold' | 'rejected' | 'removed';

export interface MarketplaceListing extends BaseEntity {
  sellerId: string;
  sellerName: string;
  sellerUsername: string;
  sellerAvatar: string;
  title: string;
  description: string;
  price: number;
  currency: 'BDT' | 'USD';
  images: string[];
  category: string;
  condition: 'new' | 'like_new' | 'used' | 'refurbished';
  location: string;
  contact: string;
  status: ListingStatus;
  savedBy: string[];
  savedCount: number;
  soldAt: number | null;
}

export type AdModel = 'crm' | 'cpc' | 'cpa' | 'cpv' | 'sponsored' | 'banner' | 'native' | 'interstitial' | 'pop_under' | 'video' | 'newsletter';

export interface AdCampaign extends BaseEntity {
  name: string;
  advertiserId: string;
  advertiserName: string;
  model: AdModel;
  placement: 'header' | 'sidebar' | 'in_feed' | 'interstitial' | 'newsletter';
  title: string;
  body: string;
  imageUrl: string;
  targetUrl: string;
  targetingLocations: string[];
  targetingTags: string[];
  targetingSkills: string[];
  dailyBudget: number;
  startDate: number;
  endDate: number | null;
  status: 'draft' | 'pending' | 'active' | 'paused' | 'completed' | 'rejected';
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
}

export interface CommunityEvent extends BaseEntity {
  title: string;
  slug: string;
  description: string;
  coverImage: string;
  format: 'virtual' | 'inperson';
  location: string;
  meetingUrl: string;
  startsAt: number;
  endsAt: number;
  hostId: string;
  hostName: string;
  speakers: { name: string; title: string; avatar: string }[];
  agenda: { time: string; title: string }[];
  rsvps: Record<string, 'going' | 'interested' | 'not_going'>;
  goingCount: number;
  interestedCount: number;
  category: string;
  tags: string[];
}

export interface SystemSettings {
  siteName: string;
  tagline: string;
  launchDate: number | null;
  preLaunchMode: boolean;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  announcementBanner: string;
  announcementEnabled: boolean;
  featureFlags: Record<string, boolean>;
  autoModerationKeywords: string[];
  spamThreshold: number;
  defaultTheme: 'light' | 'dark';
  signupEnabled: boolean;
  pointsEnabled: boolean;
  marketplaceEnabled: boolean;
  adsEnabled: boolean;
}

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  siteName: 'Bangladesh Software Development Community',
  tagline: 'The Pride of Bangladesh — Where Developers Unite',
  launchDate: null,
  preLaunchMode: true,
  maintenanceMode: false,
  maintenanceMessage: '',
  announcementBanner: '',
  announcementEnabled: false,
  featureFlags: {},
  autoModerationKeywords: [],
  spamThreshold: 5,
  defaultTheme: 'light',
  signupEnabled: true,
  pointsEnabled: true,
  marketplaceEnabled: true,
  adsEnabled: false,
};

export interface ModerationLogEntry extends BaseEntity {
  actorId: string;
  actorName: string;
  action: string;
  targetType: string;
  targetId: string;
  targetPreview: string;
  reason: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface DailyAnalytics {
  date: string;
  newUsers: number;
  activeUsers: number;
  newPosts: number;
  newComments: number;
  newReactions: number;
  messagesSent: number;
  signups: number;
  reportsOpened: number;
  pointsAwarded: number;
}
