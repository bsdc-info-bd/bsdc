/**
 * English interface strings. Property names are the translation keys; values
 * are widened to `string` so the Bangla bundle can be typed against the same
 * shape (missing or renamed keys then fail `tsc --noEmit`).
 */
export const en = {
  common: {
    brand: 'BSDC',
    brandFull: 'Bangladesh Software Development Community',
    close: 'Close',
    open: 'Open',
    cancel: 'Cancel',
    retry: 'Try again',
    loading: 'Loading',
    menu: 'Menu',
    search: 'Search',
    copy: 'Copy',
    copied: 'Copied',
    learnMore: 'Learn more',
    backHome: 'Back to home',
    new: 'New',
  },
  a11y: {
    skipToContent: 'Skip to main content',
    primaryNavigation: 'Primary navigation',
    mobileNavigation: 'Bottom navigation',
    toggleTheme: 'Switch between light and dark theme',
    toggleLanguage: 'Switch interface language',
    openCommandPalette: 'Open the command palette',
    routeLoading: 'Page is loading',
  },
  nav: {
    home: 'Home',
    about: 'About',
    guidelines: 'Guidelines',
    contact: 'Contact',
  },
  theme: {
    light: 'Light',
    dark: 'Dark',
    system: 'System',
    label: 'Appearance',
  },
  language: {
    label: 'Language',
    english: 'English',
    bangla: 'বাংলা',
  },
  palette: {
    placeholder: 'Search BSDC or run a command',
    empty: 'No matching command',
    groups: {
      navigation: 'Navigation',
      preferences: 'Preferences',
      resources: 'Resources',
    },
    actions: {
      goHome: 'Go to home',
      goAbout: 'Go to about',
      goGuidelines: 'Go to community guidelines',
      goContact: 'Go to contact',
      themeLight: 'Use light theme',
      themeDark: 'Use dark theme',
      themeSystem: 'Follow system theme',
      languageEnglish: 'Switch to English',
      languageBangla: 'Switch to Bangla',
      openRepository: 'Open the GitHub repository',
      openStatus: 'Open the live status page',
    },
    hint: 'Press Ctrl plus K to open this menu at any time',
  },
  home: {
    metaTitle:
      'Bangladesh Software Development Community (BSDC) — The Pride of Bangladesh | Developer Community, Blogs, Jobs, Marketplace',
    metaDescription:
      'BSDC is the open community platform for Bangladeshi and worldwide software developers: a social feed, developer blogs, questions, jobs, freelancing, a marketplace and a verification system. Free, bilingual and built by RRC Development.',
    eyebrow: 'A platform of RRC Development',
    heading: 'The developer community of Bangladesh',
    subheading:
      'One free home for Bangladeshi and worldwide software developers: write, ask, share code, find work, sell, and build your reputation — in Bangla and in English.',
    countdownTitle: 'Commercial launch countdown',
    countdownNote:
      'The launch date is controlled by the administrator in the configuration app. Until launch, this page shows the live countdown.',
    pillarsTitle: 'What BSDC is being built for',
    pillars: {
      community: {
        title: 'Community',
        body: 'A real social graph for developers: feed, stories, reactions, comments, follows and badges.',
      },
      knowledge: {
        title: 'Knowledge',
        body: 'Developer blogs, runnable code snippets, questions and answers, and long-form technical writing.',
      },
      opportunity: {
        title: 'Opportunity',
        body: 'A jobs board, a freelance sub-platform and a project showcase built for the Bangladeshi market.',
      },
      commerce: {
        title: 'Commerce',
        body: 'A marketplace with verified vendors, cash-on-delivery orders and order-based subscriptions.',
      },
      advertising: {
        title: 'Advertising',
        body: 'A self-serve advertising network with invoices, precise targeting and transparent analytics.',
      },
      trust: {
        title: 'Trust',
        body: 'Software licenses, certificates and notices — every one of them verifiable by QR code.',
      },
      reach: {
        title: 'Reach',
        body: 'World-class SEO, offline support, push notifications and a native Android application.',
      },
    },
    ecosystemTitle: 'The BSDC ecosystem',
    ecosystemBody:
      'BSDC is part of a wider set of free properties operated by RRC Development for students and developers.',
  },
  about: {
    metaTitle: 'About BSDC — Bangladesh Software Development Community',
    metaDescription:
      'BSDC is a free and open community platform for Bangladeshi and worldwide software developers, owned and operated by RRC Development and led by Rizwan Rahim Chowdhury.',
    heading: 'About BSDC',
    missionTitle: 'Our mission',
    missionBody:
      'To give every developer in Bangladesh — from a student on a small phone in Sylhet to a senior engineer on a large desktop — one free, fast, bilingual place to learn, publish, collaborate, find work and build a public reputation.',
    ownerTitle: 'Ownership',
    ownerBody:
      'BSDC is built, owned and operated by RRC Development. The platform is proprietary software; it may not be redeployed by anyone else.',
    principlesTitle: 'Principles',
    principles: {
      free: 'Free for every member, forever, on infrastructure that stays within free tiers.',
      bilingual: 'Every screen works in Bangla and in English, including dates and numbers.',
      accessible: 'Usable from a 250 pixel wide phone up to a 50 inch monitor, keyboard first.',
      honest: 'No fake content, no hidden sponsorship, and clearly labelled advertising.',
    },
    contactCta: 'Contact the team',
  },
  guidelines: {
    metaTitle: 'Community Guidelines — BSDC',
    metaDescription:
      'The rules that keep the Bangladesh Software Development Community safe, useful and respectful for every member.',
    heading: 'Community guidelines',
    intro:
      'These rules apply to every post, comment, message, product listing and profile on BSDC. Moderators enforce them, and every enforcement action can be appealed.',
    rules: {
      respect: {
        title: 'Respect people',
        body: 'No harassment, hate speech, threats, doxxing or impersonation. Disagree with ideas, never attack the person.',
      },
      authentic: {
        title: 'Be authentic',
        body: 'Use one real account. Do not run bot networks, buy engagement, or plagiarise other people\u2019s work and code.',
      },
      useful: {
        title: 'Keep it useful',
        body: 'No spam, no link farms, no repetitive self-promotion. Ask clear questions and give answers you would want to receive.',
      },
      legal: {
        title: 'Stay lawful',
        body: 'No malware, no pirated software or license keys, no illegal goods in the marketplace, and no sharing of private data.',
      },
      safety: {
        title: 'Protect the community',
        body: 'Report what breaks these rules instead of escalating it. False reporting is itself a violation.',
      },
    },
    enforcementTitle: 'How we enforce',
    enforcementBody:
      'Depending on severity and history, moderators may remove content, issue a warning, mute, restrict, suspend or permanently ban an account. Every action is logged, and the member is notified with the reason.',
    appealTitle: 'Appeals',
    appealBody:
      'If you believe an action was wrong, submit an appeal from the notification you received or write to the team. Appeals are reviewed by a different staff member than the one who acted.',
  },
  contact: {
    metaTitle: 'Contact BSDC',
    metaDescription:
      'Reach the Bangladesh Software Development Community team for support, partnerships, press, advertising and security reports.',
    heading: 'Contact',
    intro: 'Write to us in Bangla or in English. We read every message.',
    generalTitle: 'General and support',
    partnershipTitle: 'Partnerships and advertising',
    securityTitle: 'Security reports',
    securityBody:
      'Report a vulnerability by email with the subject SECURITY. Please include reproduction steps and the affected URL. Do not open a public issue.',
    repositoryTitle: 'Source repository',
    ownerTitle: 'Founder',
  },
  footer: {
    builtBy: 'A platform of RRC Development',
    rights: 'All rights reserved.',
    proprietary:
      'BSDC is proprietary software of RRC Development. Unauthorized deployment will result in legal action.',
    sections: {
      platform: 'Platform',
      community: 'Community',
      ecosystem: 'Ecosystem',
    },
    ecosystem: {
      rrc: 'RRC Development',
      cloud: 'Free cloud hosting',
      news: 'Tech and code news',
      wiki: 'BSDC wiki',
      docs: 'Documentation',
    },
  },
  countdown: {
    days: 'Days',
    hours: 'Hours',
    minutes: 'Minutes',
    seconds: 'Seconds',
    live: 'BSDC is live',
  },
  errors: {
    boundaryTitle: 'Something went wrong on this screen',
    boundaryBody:
      'The error has been recorded. You can retry this screen, or return to the home page.',
    notFoundTitle: 'This page does not exist',
    notFoundBody:
      'The address may be mistyped, or the content may have been removed. Try the home page.',
    offlineTitle: 'You are offline',
    offlineBody:
      'BSDC works offline for pages you have already visited. Reconnect to load new content.',
    offlineBadge: 'Offline',
  },
  pwa: {
    updateTitle: 'A new version of BSDC is available',
    updateAction: 'Refresh',
    readyTitle: 'BSDC is ready to work offline',
  },
};

export type Translation = typeof en;
