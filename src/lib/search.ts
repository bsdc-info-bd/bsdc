/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import FlexSearch from 'flexsearch';
import type { Post } from '@/types/post';
import type { UserProfile } from '@/types/user';
import type { Group } from '@/types/domain';

export type SearchCategory = 'all' | 'posts' | 'users' | 'tags' | 'groups' | 'jobs' | 'snippets';

export interface SearchHit {
  kind: 'post' | 'user' | 'tag' | 'group';
  id: string;
  title: string;
  subtitle: string;
  image: string;
  url: string;
  score: number;
}

interface PostIndexDoc {
  id: string;
  title: string;
  body: string;
  tags: string;
  author: string;
  type: string;
  url: string;
  image: string;
}

interface UserIndexDoc {
  id: string;
  displayName: string;
  username: string;
  bio: string;
  bioTitle: string;
  skills: string;
  url: string;
  image: string;
}

interface GroupIndexDoc {
  id: string;
  name: string;
  description: string;
  url: string;
}

export class SearchIndex {
  private posts = new FlexSearch.Document<PostIndexDoc>({
    document: { id: 'id', index: ['title', 'body', 'tags', 'author'] },
    tokenize: 'forward',
  });

  private users = new FlexSearch.Document<UserIndexDoc>({
    document: { id: 'id', index: ['displayName', 'username', 'bioTitle', 'skills'] },
    tokenize: 'forward',
  });

  private groups = new FlexSearch.Document<GroupIndexDoc>({
    document: { id: 'id', index: ['name', 'description'] },
    tokenize: 'forward',
  });

  private tagCounts = new Map<string, number>();
  private postsById = new Map<string, Post>();
  private usersById = new Map<string, UserProfile>();
  private usersIndex = new Map<string, UserIndexDoc>();
  private groupsById = new Map<string, GroupIndexDoc>();

  indexPosts(posts: Post[]): void {
    for (const p of posts) {
      this.postsById.set(p.id, p);
      this.posts.add!({
        id: p.id,
        title: p.title || p.body.slice(0, 100),
        body: p.body.slice(0, 4000),
        tags: p.tags.join(' '),
        author: `${p.authorName} ${p.authorUsername}`,
        type: p.type,
        url: `/${routeFor(p.type)}/${p.slug}`,
        image: p.authorAvatar || p.images[0] || '',
      });
      for (const t of p.tags) this.tagCounts.set(t, (this.tagCounts.get(t) || 0) + 1);
    }
  }

  indexUsers(users: UserProfile[]): void {
    for (const u of users) {
      this.usersById.set(u.uid, u);
      const doc: UserIndexDoc = {
        id: u.uid,
        displayName: u.displayName,
        username: u.username,
        bio: u.bio,
        bioTitle: u.bioTitle,
        skills: u.skills.join(' '),
        url: `/p/${u.username}`,
        image: u.avatar,
      };
      this.usersIndex.set(doc.id, doc);
      this.users.add!(doc);
    }
  }

  indexGroups(groups: (Group & { id: string })[]): void {
    for (const g of groups) {
      const doc: GroupIndexDoc = { id: g.id, name: g.name, description: g.description, url: `/g/${g.slug}` };
      this.groupsById.set(doc.id, doc);
      this.groups.add(doc);
    }
  }

  search(rawQuery: string, category: SearchCategory = 'all', limit = 30): SearchHit[] {
    const q = rawQuery.trim();
    if (!q) return [];
    const hits: SearchHit[] = [];

    if (category === 'all' || category === 'users') {
      const results = this.users.search(q, { limit });
      const seen = new Set<string>();
      for (const field of results) {
        for (const id of field.result as unknown[]) {
          const doc = this.usersIndex.get(String(id));
          if (!doc || seen.has(doc.id)) continue;
          seen.add(doc.id);
          hits.push({
            kind: 'user',
            id: doc.id,
            title: doc.displayName,
            subtitle: `@${doc.username}${doc.bioTitle ? ` · ${doc.bioTitle}` : ''}`,
            image: doc.image,
            url: doc.url,
            score: 100,
          });
        }
      }
    }

    const postCategories: SearchCategory[] = ['all', 'posts', 'jobs', 'snippets'];
    if (postCategories.includes(category)) {
      const results = this.posts.search(q, { limit: limit * 2 });
      const seen = new Set<string>();
      for (const field of results) {
        for (const id of field.result as unknown[]) {
          const doc = this.postsById.get(String(id));
          if (!doc || seen.has(doc.id)) continue;
          seen.add(doc.id);
          if (category === 'jobs' && doc.type !== 'job') continue;
          if (category === 'snippets' && doc.type !== 'snippet') continue;
          const postDoc: PostIndexDoc = {
            id: doc.id,
            title: doc.title || doc.body.slice(0, 80),
            body: '',
            tags: '',
            author: `${doc.authorName} ${doc.authorUsername}`,
            type: doc.type,
            url: `/${routeFor(doc.type)}/${doc.slug}`,
            image: doc.authorAvatar || doc.images[0] || '',
          };
          hits.push({
            kind: 'post',
            id: postDoc.id,
            title: postDoc.title || 'Untitled post',
            subtitle: `${postDoc.author} · ${doc.type}`,
            image: postDoc.image,
            url: postDoc.url,
            score: 50,
          });
        }
      }
    }

    if (category === 'all' || category === 'tags') {
      const lower = q.replace(/^#/, '').toLowerCase();
      for (const [tag, count] of this.tagCounts) {
        if (tag.includes(lower)) {
          hits.push({ kind: 'tag', id: tag, title: `#${tag}`, subtitle: `${count} post${count === 1 ? '' : 's'}`, image: '', url: `/tag/${encodeURIComponent(tag)}`, score: 80 });
        }
        if (hits.filter((h) => h.kind === 'tag').length >= 10) break;
      }
    }

    if (category === 'all' || category === 'groups') {
      const results = this.groups.search(q, { limit });
      const seen = new Set<string>();
      for (const field of results) {
        for (const id of field.result as unknown[]) {
          const doc = this.groupsById.get(String(id));
          if (!doc || seen.has(doc.id)) continue;
          seen.add(doc.id);
          hits.push({ kind: 'group', id: doc.id, title: doc.name, subtitle: doc.description, image: '', url: doc.url, score: 60 });
        }
      }
    }

    return hits.slice(0, limit);
  }
}

export function routeFor(type: string): string {
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
