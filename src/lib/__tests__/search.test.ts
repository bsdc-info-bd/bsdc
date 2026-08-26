/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { describe, expect, it } from 'vitest';
import { levenshtein, matchInfo, routeFor, SearchIndex } from '../search';
import { makePost } from './feed-algorithm.test';
import type { UserProfile } from '@/types/user';

function makeUser(overrides: Partial<UserProfile> = {}): UserProfile {
  const base = {
    id: 'u1',
    uid: 'u1',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    email: 'u1@bsdc.dev',
    username: 'rizwan',
    displayName: 'Rizwan Rahim',
    avatar: '',
    isVerified: true,
    coverPhoto: '',
    bio: '',
    bioTitle: 'Founder & CEO',
    location: 'Sylhet, Bangladesh',
    geo: { lat: 24.9, lng: 91.87 } as { lat: number; lng: number } | null,
    website: '',
    github: '',
    linkedin: '',
    twitter: '',
    skills: ['React', 'Firebase'],
    education: '',
    work: '',
    joinedAt: Date.now(),
    lastActive: Date.now(),
    role: 'user',
    isCreator: false,
    followerCount: 1200,
    followingCount: 10,
    postCount: 40,
    bsdcPoints: 3000,
    language: 'en',
    theme: 'light',
    isOnline: true,
    emailVerified: true,
    creatorProgramStatus: 'none',
    softwareLicenses: [],
    profileCompleted: true,
    onboardingStep: 0,
    provider: 'password',
    streak: 5,
    lastLoginDay: '',
  } as UserProfile;
  return { ...base, ...overrides };
}

describe('matchInfo', () => {
  it('ranks exact > prefix > contains > fuzzy', () => {
    expect(matchInfo('rizwan', 'rizwan').quality).toBe('exact');
    expect(matchInfo('riz', 'rizwan').quality).toBe('prefix');
    expect(matchInfo('zwa', 'rizwan').quality).toBe('contains');
    expect(matchInfo('rizwin', 'rizwan').quality).toBe('fuzzy');
    expect(matchInfo('xyz', 'rizwan').quality).toBe('none');
  });
  it('tolerates typos within Levenshtein 2 for longer queries', () => {
    expect(levenshtein('bangladesh', 'bangladesh')).toBe(0);
    expect(levenshtein('reactt', 'react')).toBe(1);
    expect(matchInfo('firebse', 'firebase').quality).toBe('fuzzy');
  });
  it('matches word prefixes inside full names', () => {
    expect(matchInfo('ra', 'Rizwan Rahim').quality).toBe('prefix');
  });
});

describe('SearchIndex ranking', () => {
  it('finds users by username prefix and boosts verified/popular', () => {
    const index = new SearchIndex();
    index.indexUsers([
      makeUser({ uid: 'a', username: 'rizwan', displayName: 'Rizwan Rahim', followerCount: 5000 }),
      makeUser({ uid: 'b', username: 'rizw', displayName: 'Someone Else', isVerified: false, followerCount: 3 }),
    ]);
    const hits = index.search('rizwan', 'all', null);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].kind).toBe('user');
    expect(hits[0].url).toBe('/p/rizwan');
  });

  it('personalization boosts followed authors', () => {
    const index = new SearchIndex();
    index.indexPosts([
      makePost({ id: 'p1', title: 'React patterns', authorId: 'followed' }),
      makePost({ id: 'p2', title: 'React anti-patterns', authorId: 'stranger' }),
    ]);
    const neutral = index.search('React patterns', 'all', null);
    const personalized = index.search('React patterns', 'all', {
      viewerTags: [],
      viewerSkills: [],
      viewerFollowing: new Set(['followed']),
      viewerGeo: null,
      viewerLocation: '',
    });
    const followedHit = personalized.find((h) => h.id === 'p1');
    const neutralHit = neutral.find((h) => h.id === 'p1');
    expect(followedHit).toBeDefined();
    expect(followedHit!.score).toBeGreaterThan(neutralHit!.score);
    expect(followedHit!.reason).toContain('author you follow');
  });

  it('geo proximity boosts nearby authors', () => {
    const index = new SearchIndex();
    index.indexPosts([makePost({ id: 'near', title: 'Meetup Sylhet', authorId: 'nearAuthor' })]);
    index.indexUsers([makeUser({ uid: 'nearAuthor', username: 'sylhetdev', displayName: 'Sylhet Dev', geo: { lat: 24.9, lng: 91.87 } })]);
    const far = index.search('Meetup', 'all', { viewerTags: [], viewerSkills: [], viewerFollowing: new Set(), viewerGeo: { lat: 51.5, lng: -0.12 }, viewerLocation: 'London' });
    const near = index.search('Meetup', 'all', { viewerTags: [], viewerSkills: [], viewerFollowing: new Set(), viewerGeo: { lat: 24.89, lng: 91.88 }, viewerLocation: 'Sylhet' });
    expect(near.find((h) => h.id === 'near')!.score).toBeGreaterThan(far.find((h) => h.id === 'near')!.score);
  });

  it('computes trending tags from real indexed posts only', () => {
    const index = new SearchIndex();
    index.indexPosts([
      makePost({ tags: ['react', 'firebase'] }),
      makePost({ tags: ['react'] }),
      makePost({ tags: ['cobol'] }),
    ]);
    const trending = index.trendingTags(3);
    expect(trending[0].tag).toBe('react');
    expect(trending.some((t) => t.tag === 'firebase')).toBe(true);
    expect(trending.some((t) => t.tag === 'cobol')).toBe(true);
  });

  it('category filters: jobs only returns job posts', () => {
    const index = new SearchIndex();
    index.indexPosts([
      makePost({ id: 'j1', title: 'Senior React job at BSDC', type: 'job' }),
      makePost({ id: 't1', title: 'React tips', type: 'text' }),
    ]);
    const hits = index.search('React', 'jobs', null);
    expect(hits.every((h) => h.id.startsWith('j'))).toBe(true);
  });

  it('routeFor maps post types to SEO routes', () => {
    expect(routeFor('snippet')).toBe('snippet');
    expect(routeFor('text')).toBe('post');
    expect(routeFor('job')).toBe('job');
  });
});
