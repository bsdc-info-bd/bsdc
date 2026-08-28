// ============================================================
// BSDC — Centralized Environment Configuration
// ============================================================

const getEnv = (key: string, fallback: string = ''): string => {
  return import.meta.env[key] || fallback;
};

export const config = {
  // Site
  siteUrl: getEnv('VITE_PUBLIC_SITE_URL', 'https://bsdc.pages.dev'),
  siteName: 'Bangladesh Software Development Community',
  siteShortName: 'BSDC',
  siteDescription: 'The proud software development community of Bangladesh.',
  organization: 'RRC Development',
  owner: 'Rizwan Rahim Chowdhury',
  githubRepo: 'https://github.com/bsdc-info-bd/bsdc',
  primaryDomain: 'www.bsdc.info.bd',

  // Firebase
  firebase: {
    apiKey: getEnv('VITE_FIREBASE_API_KEY'),
    authDomain: getEnv('VITE_FIREBASE_AUTH_DOMAIN'),
    projectId: getEnv('VITE_FIREBASE_PROJECT_ID'),
    storageBucket: getEnv('VITE_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: getEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
    appId: getEnv('VITE_FIREBASE_APP_ID'),
    databaseURL: getEnv('VITE_FIREBASE_DATABASE_URL'),
  },

  // Cloudinary
  cloudinary: {
    cloudName: getEnv('VITE_CLOUDINARY_CLOUD_NAME'),
    uploadPreset: getEnv('VITE_CLOUDINARY_UPLOAD_PRESET'),
  },

  // ImgBB
  imgbb: {
    apiKey: getEnv('VITE_IMGBB_API_KEY'),
  },

  // OneSignal
  onesignal: {
    appId: getEnv('VITE_ONESIGNAL_APP_ID'),
  },

  // Feature flags
  features: {
    marketplace: getEnv('VITE_ENABLE_MARKETPLACE', 'true') === 'true',
    jobs: getEnv('VITE_ENABLE_JOBS', 'true') === 'true',
    messaging: getEnv('VITE_ENABLE_MESSAGING', 'true') === 'true',
    creatorProgram: getEnv('VITE_ENABLE_CREATOR_PROGRAM', 'true') === 'true',
    ads: getEnv('VITE_ENABLE_ADS', 'true') === 'true',
    groups: getEnv('VITE_ENABLE_GROUPS', 'true') === 'true',
    events: getEnv('VITE_ENABLE_EVENTS', 'true') === 'true',
    licenses: getEnv('VITE_ENABLE_LICENSES', 'true') === 'true',
  },

  // Firebase collections
  collections: {
    users: 'users',
    userProfiles: 'userProfiles',
    userSettings: 'userSettings',
    userSessions: 'userSessions',
    posts: 'posts',
    postRevisions: 'postRevisions',
    comments: 'comments',
    reactions: 'reactions',
    follows: 'follows',
    blocks: 'blocks',
    mutes: 'mutes',
    bookmarks: 'bookmarks',
    tags: 'tags',
    categories: 'categories',
    groups: 'groups',
    groupMembers: 'groupMembers',
    organizations: 'organizations',
    projects: 'projects',
    jobs: 'jobs',
    applications: 'applications',
    events: 'events',
    eventParticipants: 'eventParticipants',
    conversations: 'conversations',
    conversationMembers: 'conversationMembers',
    messages: 'messages',
    notifications: 'notifications',
    reports: 'reports',
    moderationActions: 'moderationActions',
    creatorApplications: 'creatorApplications',
    creatorMilestones: 'creatorMilestones',
    ads: 'ads',
    campaigns: 'campaigns',
    advertisers: 'advertisers',
    adEvents: 'adEvents',
    marketplaceListings: 'marketplaceListings',
    orders: 'orders',
    reviews: 'reviews',
    licenses: 'licenses',
    licenseVerifications: 'licenseVerifications',
    analytics: 'analytics',
    pdfReports: 'pdfReports',
    auditLogs: 'auditLogs',
    systemSettings: 'systemSettings',
    featureFlags: 'featureFlags',
  },

  // RTDB paths
  rtdb: {
    presence: 'presence',
    typing: 'typing',
    activeSessions: 'activeSessions',
    realtimeCounters: 'counters',
  },

  // App constants
  app: {
    maxPostLength: 50000,
    maxCommentLength: 5000,
    maxBioLength: 500,
    maxTitleLength: 200,
    maxUploadSizeMB: 10,
    maxImagesPerPost: 10,
    maxNestingDepth: 5,
    postsPerPage: 20,
    commentsPerPage: 20,
    messagesPerPage: 50,
    notificationsPerPage: 30,
    searchResultsPerPage: 20,
    explorationPercentage: 0.08,
    voiceNoteMaxDuration: 20,
    reservedUsernames: [
      'admin', 'administrator', 'root', 'system', 'moderator', 'mod',
      'support', 'help', 'official', 'bsdc', 'api', 'www', 'mail',
      'ftp', 'static', 'cdn', 'assets', 'blog', 'news', 'about',
      'contact', 'privacy', 'terms', 'security', 'status', 'jobs',
      'marketplace', 'explore', 'trending', 'search', 'settings',
      'notifications', 'messages', 'feed', 'home', 'login', 'register',
      'signup', 'signin', 'logout', 'auth', 'verify', 'reset',
      'owner', 'superadmin', 'manager', 'staff', 'team', 'ceo',
    ],
  },
} as const;

export const isFirebaseConfigured = (): boolean => {
  return Boolean(
    config.firebase.apiKey &&
    config.firebase.authDomain &&
    config.firebase.projectId
  );
};

export const isCloudinaryConfigured = (): boolean => {
  return Boolean(config.cloudinary.cloudName && config.cloudinary.uploadPreset);
};

export const isOneSignalConfigured = (): boolean => {
  return Boolean(config.onesignal.appId);
};
