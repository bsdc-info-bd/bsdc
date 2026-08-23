/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { APP_NAME, APP_TAGLINE, APP_URL } from './constants';
import type { Post } from '@/types/post';
import type { UserProfile } from '@/types/user';
import type { CommunityEvent, MarketplaceListing, SoftwareLicense } from '@/types/domain';
import { extractDescription } from '@/lib/utils';

export const SEO_DEFAULTS = {
  siteName: 'BSDC',
  ogSiteName: APP_NAME,
  twitterSite: '@bsdc_bd',
  defaultImage: `${APP_URL}/assets/logos/og-default.png`,
  locale: 'en_US',
};

export function absoluteUrl(path: string): string {
  if (path.startsWith('http')) return path;
  return `${APP_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export function websiteSchema(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: APP_NAME,
    alternateName: 'BSDC',
    url: APP_URL,
    description: APP_TAGLINE,
    inLanguage: ['en', 'bn'],
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${APP_URL}/search?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function organizationSchema(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: APP_NAME,
    alternateName: 'BSDC',
    url: APP_URL,
    logo: `${APP_URL}/favicon-512.png`,
    slogan: APP_TAGLINE,
    founder: { '@type': 'Person', name: 'Rizwan Rahim Chowdhury' },
    parentOrganization: { '@type': 'Organization', name: 'RRC Development' },
    email: 'hello@bsdc.info.bd',
    sameAs: ['https://github.com/bsdc-info-bd', 'https://www.facebook.com/'],
    knowsLanguage: ['en', 'bn'],
    address: { '@type': 'PostalAddress', addressCountry: 'BD' },
  };
}

export function breadcrumbSchema(items: { name: string; url: string }[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.url),
    })),
  };
}

export function personSchema(user: UserProfile): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: user.displayName,
    alternateName: `@${user.username}`,
    description: user.bioTitle || user.bio || `Member of ${APP_NAME}`,
    url: absoluteUrl(`/p/${user.username}`),
    image: user.avatar || undefined,
    jobTitle: user.bioTitle || undefined,
    memberOf: { '@type': 'Organization', name: APP_NAME },
    knowsAbout: user.skills,
    sameAs: [
      user.website || undefined,
      user.github ? `https://github.com/${user.github}` : undefined,
      user.linkedin ? `https://linkedin.com/in/${user.linkedin}` : undefined,
      user.twitter ? `https://twitter.com/${user.twitter}` : undefined,
    ].filter(Boolean),
  };
}

export function profilePageSchema(user: UserProfile): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    dateCreated: new Date(user.joinedAt).toISOString(),
    mainEntity: personSchema(user),
  };
}

export function postDetailRoute(type: string): string {
  switch (type) {
    case 'blog': return 'blog';
    case 'qa': return 'qa';
    case 'snippet': return 'snippet';
    case 'docs': return 'docs';
    case 'wiki': return 'wiki';
    case 'project': return 'project';
    case 'job': return 'job';
    case 'notice': return 'notice';
    default: return 'post';
  }
}

export function postSchema(post: Post): Record<string, unknown> {
  const base: Record<string, unknown> = {
    '@context': 'https://schema.org',
    headline: post.title || extractDescription(post.body, 'BSDC post'),
    url: absoluteUrl(`/${postDetailRoute(post.type)}/${post.slug}`),
    datePublished: new Date(post.publishedAt || post.createdAt).toISOString(),
    dateModified: new Date(post.updatedAt).toISOString(),
    author: {
      '@type': 'Person',
      name: post.authorName,
      url: absoluteUrl(`/p/${post.authorUsername}`),
    },
    publisher: { '@type': 'Organization', name: APP_NAME, logo: { '@type': 'ImageObject', url: `${APP_URL}/favicon-512.png` } },
    interactionStatistic: [
      { '@type': 'InteractionCounter', interactionType: 'https://schema.org/LikeAction', userInteractionCount: post.reactionTotal },
      { '@type': 'InteractionCounter', interactionType: 'https://schema.org/CommentAction', userInteractionCount: post.commentCount },
    ],
  };
  switch (post.type) {
    case 'blog':
      return { '@context': 'https://schema.org', '@type': 'BlogPosting', ...base };
    case 'qa':
      return {
        '@context': 'https://schema.org',
        '@type': 'QAPage',
        mainEntity: {
          '@type': 'Question',
          name: post.title,
          text: post.body,
          answerCount: post.commentCount,
          upvoteCount: post.reactionTotal,
          datePublished: base.datePublished,
          author: base.author,
        },
      };
    case 'job':
      return {
        '@context': 'https://schema.org',
        '@type': 'JobPosting',
        title: post.title,
        description: post.body,
        datePosted: base.datePublished,
        employmentType: post.job?.jobType === 'remote' ? 'CONTRACTOR' : 'FULL_TIME',
        jobLocationType: post.job?.jobType === 'remote' ? 'TELECOMMUTE' : undefined,
        hiringOrganization: { '@type': 'Organization', name: post.job?.company || post.authorName },
        url: base.url,
      };
    case 'snippet':
    case 'project':
      return { '@context': 'https://schema.org', '@type': 'CreativeWork', ...base };
    case 'docs':
      return { '@context': 'https://schema.org', '@type': 'HowTo', name: post.title, ...base };
    case 'image':
      return {
        '@context': 'https://schema.org',
        '@type': 'ImageObject',
        contentUrl: post.images[0],
        url: base.url,
        description: extractDescription(post.body),
      };
    default:
      return { '@context': 'https://schema.org', '@type': 'DiscussionForumPosting', ...base };
  }
}

export function eventSchema(event: CommunityEvent): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.title,
    description: extractDescription(event.description),
    startDate: new Date(event.startsAt).toISOString(),
    endDate: new Date(event.endsAt ? new Date(event.endsAt).toISOString() : event.startsAt).toISOString(),
    eventAttendanceMode: event.format === 'virtual' ? 'https://schema.org/OnlineEventAttendanceMode' : 'https://schema.org/OfflineEventAttendanceMode',
    location: event.format === 'virtual'
      ? { '@type': 'VirtualLocation', url: event.meetingUrl || absoluteUrl(`/events`) }
      : { '@type': 'Place', name: event.location, address: event.location },
    organizer: { '@type': 'Person', name: event.hostName },
    url: absoluteUrl(`/events/${event.id}`),
  };
}

export function softwareAppSchema(license: SoftwareLicense): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: license.softwareName,
    softwareVersion: license.version,
    description: extractDescription(license.description),
    applicationCategory: license.category,
    url: license.liveUrl || undefined,
    author: { '@type': 'Person', name: license.ownerName },
    license: `https://spdx.org/licenses/${license.licenseType}.html`,
  };
}

export function productSchema(listing: MarketplaceListing): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: listing.title,
    description: extractDescription(listing.description),
    image: listing.images[0] || undefined,
    offers: {
      '@type': 'Offer',
      price: listing.price,
      priceCurrency: listing.currency,
      availability: listing.status === 'active' ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut',
    },
  };
}

export function itemListSchema(name: string, items: { name: string; url: string }[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    itemListElement: items.slice(0, 30).map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      url: absoluteUrl(item.url),
    })),
  };
}

export function faqSchema(faqs: { q: string; a: string }[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

export function webPageSchema(name: string, path: string, description: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name,
    url: absoluteUrl(path),
    description,
    isPartOf: { '@type': 'WebSite', name: APP_NAME, url: APP_URL },
  };
}
