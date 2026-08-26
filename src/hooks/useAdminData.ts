/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { useEffect, useState } from 'react';
import { collection, getDocs, limit as fsLimit, query as fsQuery } from 'firebase/firestore';
import { COL, fsDb } from '@/lib/firestore';
import { fetchAllUsers, fetchGroups, fetchRecentPosts, fetchReports } from '@/lib/data';
import type { AdCampaign, CreatorApplication, MarketplaceListing, ModerationLogEntry, SoftwareLicense } from '@/types/domain';
import type { UserProfile } from '@/types/user';
import type { Post } from '@/types/post';
import type { Report } from '@/types/domain';

export interface AdminData {
  users: UserProfile[];
  posts: Post[];
  groups: { id: string; name: string; memberCount: number; type: string; slug: string }[];
  reports: (Report & { id: string })[];
  licenses: (SoftwareLicense & { id: string })[];
  creators: (CreatorApplication & { id: string })[];
  listings: (MarketplaceListing & { id: string })[];
  ads: (AdCampaign & { id: string })[];
  logs: (ModerationLogEntry & { id: string })[];
  loading: boolean;
  error: string;
  refresh: () => void;
}

/** Loads the full admin dataset once — all real Firestore data, no demo numbers. */
export function useAdminData(): AdminData {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [groups, setGroups] = useState<AdminData['groups']>([]);
  const [reports, setReports] = useState<AdminData['reports']>([]);
  const [licenses, setLicenses] = useState<AdminData['licenses']>([]);
  const [creators, setCreators] = useState<AdminData['creators']>([]);
  const [listings, setListings] = useState<AdminData['listings']>([]);
  const [ads, setAds] = useState<AdminData['ads']>([]);
  const [logs, setLogs] = useState<AdminData['logs']>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    Promise.all([
      fetchAllUsers(500),
      fetchRecentPosts(500),
      fetchGroups(200),
      fetchReports(undefined, 300),
      getDocs(fsQuery(collection(fsDb(), COL.licenses), fsLimit(300))),
      getDocs(fsQuery(collection(fsDb(), COL.creatorApplications), fsLimit(300))),
      getDocs(fsQuery(collection(fsDb(), COL.marketplace), fsLimit(300))),
      getDocs(fsQuery(collection(fsDb(), COL.ads), fsLimit(200))),
      getDocs(fsQuery(collection(fsDb(), COL.modLogs), fsLimit(200))),
    ])
      .then(([u, p, g, r, lic, cre, mar, ad, log]) => {
        if (cancelled) return;
        setUsers(u);
        setPosts(p);
        setGroups(g);
        setReports(r);
        setLicenses(lic.docs.map((d) => ({ ...(d.data() as SoftwareLicense), id: d.id })).sort((a, b) => b.createdAt - a.createdAt));
        setCreators(cre.docs.map((d) => ({ ...(d.data() as CreatorApplication), id: d.id })).sort((a, b) => b.createdAt - a.createdAt));
        setListings(mar.docs.map((d) => ({ ...(d.data() as MarketplaceListing), id: d.id })).sort((a, b) => b.createdAt - a.createdAt));
        setAds(ad.docs.map((d) => ({ ...(d.data() as AdCampaign), id: d.id })).sort((a, b) => b.createdAt - a.createdAt));
        setLogs(log.docs.map((d) => ({ ...(d.data() as ModerationLogEntry), id: d.id })).sort((a, b) => b.createdAt - a.createdAt));
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Failed to load admin data'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [tick]);

  return {
    users,
    posts,
    groups,
    reports,
    licenses,
    creators,
    listings,
    ads,
    logs,
    loading,
    error,
    refresh: () => setTick((t) => t + 1),
  };
}

export function computeStats(data: AdminData) {
  const today = new Date().setHours(0, 0, 0, 0);
  const dayKey = (ts: number) => new Date(ts).toISOString().slice(0, 10);
  const newUsersToday = data.users.filter((u) => u.createdAt >= today).length;
  const newPostsToday = data.posts.filter((p) => p.createdAt >= today).length;
  const onlineNow = data.users.filter((u) => u.isOnline).length;
  const pointsInCirculation = data.users.reduce((s, u) => s + u.bsdcPoints, 0);
  const activeLicenses = data.licenses.filter((l) => l.status === 'approved').length;

  const days: { date: string; label: string; users: number; posts: number; engagement: number }[] = [];
  for (let i = 29; i >= 0; i -= 1) {
    const ts = today - i * 86400000;
    const key = dayKey(ts);
    days.push({
      date: key,
      label: new Date(ts).toLocaleDateString('en', { month: 'short', day: 'numeric' }),
      users: data.users.filter((u) => dayKey(u.createdAt) === key).length,
      posts: data.posts.filter((p) => dayKey(p.createdAt) === key).length,
      engagement: data.posts
        .filter((p) => dayKey(p.createdAt) === key)
        .reduce((s, p) => s + p.reactionTotal + p.commentCount + p.shareCount, 0),
    });
  }

  const tagCounts = new Map<string, number>();
  for (const p of data.posts) for (const tg of p.tags) tagCounts.set(tg, (tagCounts.get(tg) || 0) + 1);
  const topTags = [...tagCounts.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 6);

  const typeCounts = new Map<string, number>();
  for (const p of data.posts) typeCounts.set(p.type, (typeCounts.get(p.type) || 0) + 1);

  return {
    totalUsers: data.users.length,
    newUsersToday,
    totalPosts: data.posts.length,
    newPostsToday,
    onlineNow,
    totalGroups: data.groups.length,
    openReports: data.reports.filter((r) => r.status === 'open').length,
    pointsInCirculation,
    activeLicenses,
    totalListings: data.listings.filter((l) => l.status !== 'removed').length,
    pendingLicenses: data.licenses.filter((l) => l.status === 'pending').length,
    pendingCreators: data.creators.filter((c) => c.status === 'applied').length,
    pendingListings: data.listings.filter((l) => l.status === 'pending').length,
    days,
    topTags,
    typeCounts: [...typeCounts.entries()].map(([name, value]) => ({ name, value })),
  };
}
