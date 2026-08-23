/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { collection, addDoc, getDocs, limit as fsLimit, query as fsQuery } from 'firebase/firestore';
import {
  BarChart3, FileDown, Megaphone, Radio, ScrollText, Database, Rocket, Download,
  Save, Check,
} from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as ReTooltip, XAxis, YAxis } from 'recharts';
import { COL, fsDb, saveSystemSettings } from '@/lib/firestore';
import { useAdminData, computeStats } from '@/hooks/useAdminData';
import { broadcastToAllUsers } from '@/lib/notifications';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { generateReportPdf } from '@/lib/pdf-generator';
import { generateFullSitemap } from '@/lib/sitemap-generator';
import { fetchLatestPosts } from '@/lib/rss-generator';
import { postsToRss, postsToAtom } from '@/lib/rss-generator';
import { downloadBlob, formatNumber } from '@/lib/utils';
import { AD_MODELS } from '@/config/constants';
import type { AdModel } from '@/types/domain';

/* ------------------------------------------------------------ ANALYTICS */

export function AdminAnalytics() {
  const { t } = useTranslation();
  const language = useUIStore((s) => s.language);
  const data = useAdminData();
  if (data.loading) return <Skeleton className="h-96" />;

  const stats = computeStats(data);
  const dau = stats.days.slice(-7).reduce((s, d) => s + d.engagement, 0);
  const totalEngagement = data.posts.reduce((s, p) => s + p.reactionTotal + p.commentCount + p.shareCount, 0);
  const searchSnap = data.posts.length > 0 ? Math.round((data.posts.filter((p) => p.viewCount > 0).length / Math.max(1, data.posts.length)) * 100) : 0;

  const cards: { label: string; value: number }[] = [
    { label: 'Total engagement', value: totalEngagement },
    { label: '7-day engagement', value: dau },
    { label: 'Avg engagement / post', value: data.posts.length ? Math.round(totalEngagement / data.posts.length) : 0 },
    { label: 'Posts with views %', value: searchSnap },
    { label: 'Total reactions', value: data.posts.reduce((s, p) => s + p.reactionTotal, 0) },
    { label: 'Total comments', value: data.posts.reduce((s, p) => s + p.commentCount, 0) },
    { label: 'Total shares', value: data.posts.reduce((s, p) => s + p.shareCount, 0) },
    { label: 'Banned users', value: data.users.filter((u) => u.role === 'banned').length },
  ];

  return (
    <div className="space-y-5">
      <h1 className="flex items-center gap-2 text-lg font-extrabold sm:text-xl">
        <BarChart3 className="h-5 w-5 text-brand-600" aria-hidden />
        {t('admin.analytics')}
      </h1>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="bsdc-surface p-4">
            <p className="text-2xl font-extrabold tabular-nums">{formatNumber(c.value, language)}</p>
            <p className="mt-0.5 text-xs font-semibold text-neutral-400">{c.label}</p>
          </div>
        ))}
      </div>

      <section className="bsdc-surface p-4">
        <h2 className="mb-3 text-sm font-bold">New members — 30 days</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={stats.days}>
              <defs>
                <linearGradient id="adminUsers" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1877F2" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#1877F2" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.2)" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={4} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <ReTooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Area type="monotone" dataKey="users" stroke="#1877F2" fill="url(#adminUsers)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="bsdc-surface p-4">
        <h2 className="mb-3 text-sm font-bold">Posts per day — 30 days</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.days}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.2)" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={4} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <ReTooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="posts" fill="#0A8F3F" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}

/* --------------------------------------------------------- PDF REPORTS */

export function AdminPdfReports() {
  const { t } = useTranslation();
  const me = useAuthStore((s) => s.profile);
  const data = useAdminData();
  const [period, setPeriod] = useState('daily');
  const [generating, setGenerating] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);

  async function generate() {
    if (!me) return;
    setGenerating(true);
    try {
      const stats = computeStats(data);
      let range = stats.days.slice(-1);
      if (period === 'weekly') range = stats.days.slice(-7);
      if (period === 'monthly') range = stats.days.slice(-30);
      if (period === 'yearly') range = stats.days;
      const sections = [
        {
          title: 'Users',
          rows: [
            { label: 'Total users', value: String(stats.totalUsers) },
            { label: 'New users (period)', value: String(range.reduce((s, d) => s + d.users, 0)) },
            { label: 'Online now', value: String(stats.onlineNow) },
          ],
        },
        {
          title: 'Content',
          rows: [
            { label: 'Total posts', value: String(stats.totalPosts) },
            { label: 'New posts (period)', value: String(range.reduce((s, d) => s + d.posts, 0)) },
            { label: 'Groups', value: String(stats.totalGroups) },
          ],
        },
        {
          title: 'Engagement',
          rows: [
            { label: 'Engagement (period)', value: String(range.reduce((s, d) => s + d.engagement, 0)) },
            { label: 'Open reports', value: String(stats.openReports) },
          ],
        },
        {
          title: 'Economy',
          rows: [
            { label: 'BSDC points in circulation', value: String(stats.pointsInCirculation) },
            { label: 'Licenses issued', value: String(stats.activeLicenses) },
            { label: 'Marketplace listings', value: String(stats.totalListings) },
          ],
        },
      ];
      const blob = await generateReportPdf({
        title: `BSDC ${period} report`,
        subtitle: 'Bangladesh Software Development Community — live platform statistics',
        period: `${period} · ${new Date().toLocaleDateString()}`,
        generatedBy: me.displayName,
        sections,
      });
      downloadBlob(blob, `bsdc-report-${period}-${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success('PDF report downloaded');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-2 text-lg font-extrabold sm:text-xl">
        <FileDown className="h-5 w-5 text-brand-600" aria-hidden />
        {t('admin.reports')}
      </h1>
      <div className="bsdc-surface space-y-4 p-5">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Generate a branded PDF report with live Firestore statistics and a verification QR code.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <Select
            label="Report period"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            options={[
              { value: 'daily', label: 'Daily' },
              { value: 'weekly', label: 'Weekly' },
              { value: 'monthly', label: 'Monthly' },
              { value: 'yearly', label: 'Yearly' },
            ]}
          />
          <Button loading={generating} icon={<Download className="h-4 w-4" aria-hidden />} onClick={() => void generate()}>
            {t('admin.generatePdf')}
          </Button>
        </div>
        <div ref={chartRef} className="hidden" aria-hidden />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ ADS */

export function AdminAds() {
  const { t } = useTranslation();
  const me = useAuthStore((s) => s.profile);
  const data = useAdminData();
  const [name, setName] = useState('');
  const [model, setModel] = useState<AdModel>('crm');
  const [placement, setPlacement] = useState<'header' | 'sidebar' | 'in_feed' | 'interstitial' | 'newsletter'>('in_feed');
  const [title, setTitle] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [dailyBudget, setDailyBudget] = useState('100');
  const [creating, setCreating] = useState(false);

  async function create() {
    if (!me) return;
    if (!name.trim() || !targetUrl.trim()) {
      toast.error('Campaign name and target URL are required');
      return;
    }
    setCreating(true);
    try {
      const now = Date.now();
      await addDoc(collection(fsDb(), COL.ads), {
        name: name.trim(),
        advertiserId: me.uid,
        advertiserName: me.displayName,
        model,
        placement,
        title,
        body: '',
        imageUrl,
        targetUrl,
        targetingLocations: [],
        targetingTags: [],
        targetingSkills: [],
        dailyBudget: Number(dailyBudget) || 0,
        startDate: now,
        endDate: null,
        status: 'active',
        impressions: 0,
        clicks: 0,
        conversions: 0,
        ctr: 0,
        createdAt: now,
        updatedAt: now,
      });
      toast.success('Campaign launched');
      setName('');
      setTitle('');
      setTargetUrl('');
      setImageUrl('');
      data.refresh();
    } finally {
      setCreating(false);
    }
  }

  async function setStatus(id: string, status: string) {
    const { doc, updateDoc } = await import('firebase/firestore');
    await updateDoc(doc(fsDb(), COL.ads, id), { status, updatedAt: Date.now() });
    data.refresh();
  }

  async function recordImpression(id: string) {
    const { doc, updateDoc, increment } = await import('firebase/firestore');
    await updateDoc(doc(fsDb(), COL.ads, id), { impressions: increment(1) });
  }

  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-2 text-lg font-extrabold sm:text-xl">
        <Megaphone className="h-5 w-5 text-fb-600" aria-hidden />
        {t('admin.ads')}
      </h1>

      <div className="bsdc-surface space-y-3 p-5">
        <p className="text-sm font-bold">New campaign</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Campaign name" value={name} onChange={(e) => setName(e.target.value)} />
          <Select label="Pricing model" value={model} onChange={(e) => setModel(e.target.value as AdModel)} options={AD_MODELS.map((m) => ({ value: m.id, label: m.label }))} />
          <Select
            label="Placement"
            value={placement}
            onChange={(e) => setPlacement(e.target.value as 'header' | 'sidebar' | 'in_feed' | 'interstitial' | 'newsletter')}
            options={[
              { value: 'header', label: 'Header banner' },
              { value: 'sidebar', label: 'Sidebar' },
              { value: 'in_feed', label: 'In-feed native' },
              { value: 'interstitial', label: 'Interstitial' },
              { value: 'newsletter', label: 'Newsletter' },
            ]}
          />
          <Input label="Target URL" value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} placeholder="https://…" />
          <Input label="Headline" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Input label="Creative image URL" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" />
          <Input label="Daily budget (BDT)" type="number" min={0} value={dailyBudget} onChange={(e) => setDailyBudget(e.target.value)} />
        </div>
        <Button loading={creating} onClick={() => void create()}>{t('common.create')}</Button>
      </div>

      {data.loading ? (
        <Skeleton className="h-64" />
      ) : data.ads.length === 0 ? (
        <p className="bsdc-surface p-10 text-center text-sm text-neutral-400">{t('common.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {data.ads.map((ad) => (
            <li key={ad.id} className="bsdc-surface flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="font-bold">{ad.name}</p>
                <p className="text-xs text-neutral-400">
                  {ad.model} · {ad.placement} · {ad.impressions} impressions · {ad.clicks} clicks · CTR {ad.impressions ? Math.round((ad.clicks / ad.impressions) * 100) : 0}%
                </p>
              </div>
              <Button size="xs" variant="outline" onClick={() => void recordImpression(ad.id)}>+ impression</Button>
              <Button size="xs" variant={ad.status === 'active' ? 'outline' : 'primary'} onClick={() => void setStatus(ad.id, ad.status === 'active' ? 'paused' : 'active')}>
                {ad.status === 'active' ? 'Pause' : 'Resume'}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ BROADCAST */

export function AdminBroadcast() {
  const { t } = useTranslation();
  const me = useAuthStore((s) => s.profile);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  async function send() {
    if (!me) return;
    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }
    setSending(true);
    try {
      const count = await broadcastToAllUsers(me, title, body);
      toast.success(`${t('admin.broadcastSent')} — ${count} users`);
      setTitle('');
      setBody('');
    } catch {
      toast.error('Broadcast failed');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-2 text-lg font-extrabold sm:text-xl">
        <Radio className="h-5 w-5 text-brand-600" aria-hidden />
        {t('admin.broadcast')}
      </h1>
      <div className="bsdc-surface space-y-3 p-5">
        <Input label={t('admin.broadcastTitle')} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
        <Textarea label={t('admin.broadcastBody')} value={body} onChange={(e) => setBody(e.target.value)} maxRows={5} />
        <p className="text-xs text-neutral-400">Delivered in-app to every user instantly. Pair with a push campaign via OneSignal for maximum reach.</p>
        <Button loading={sending} onClick={() => void send()} icon={<Radio className="h-4 w-4" aria-hidden />}>
          {t('common.send')}
        </Button>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- LOGS */

export function AdminLogs() {
  const { t } = useTranslation();
  const data = useAdminData();
  const [tab, setTab] = useState<'mod' | 'admin'>('mod');
  const [adminLogs, setAdminLogs] = useState<{ id: string; actorName: string; action: string; targetPreview: string; createdAt: number }[]>([]);

  async function loadAdminLogs() {
    const snap = await getDocs(fsQuery(collection(fsDb(), COL.adminLogs), fsLimit(100)));
    setAdminLogs(snap.docs.map((d) => ({ id: d.id, ...(d.data() as { actorName: string; action: string; targetPreview: string; createdAt: number }) })).sort((a, b) => b.createdAt - a.createdAt));
  }

  const logs = tab === 'mod' ? data.logs.map((l) => ({ id: l.id, actorName: l.actorName, action: l.action, targetPreview: l.targetPreview, createdAt: l.createdAt })) : adminLogs;

  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-2 text-lg font-extrabold sm:text-xl">
        <ScrollText className="h-5 w-5 text-brand-600" aria-hidden />
        {t('admin.logs')}
      </h1>
      <Tabs value={tab} onValueChange={(v) => { setTab(v as 'mod' | 'admin'); if (v === 'admin') void loadAdminLogs(); }}>
        <div className="bsdc-surface p-2">
          <TabsList>
            <TabsTrigger value="mod">Moderation log</TabsTrigger>
            <TabsTrigger value="admin">Admin audit log</TabsTrigger>
          </TabsList>
        </div>
      </Tabs>
      {logs.length === 0 ? (
        <p className="bsdc-surface p-10 text-center text-sm text-neutral-400">{t('common.empty')}</p>
      ) : (
        <ul className="bsdc-surface divide-y divide-surface-light-border dark:divide-surface-dark-border">
          {logs.map((log) => (
            <li key={log.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
              <strong className="shrink-0">{log.actorName}</strong>
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-bold uppercase text-neutral-500 dark:bg-neutral-800">{log.action}</span>
              <span className="min-w-0 flex-1 truncate text-neutral-500 dark:text-neutral-400">{log.targetPreview}</span>
              <time className="shrink-0 text-xs text-neutral-400">{new Date(log.createdAt).toLocaleString()}</time>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- DATABASE */

const BROWSABLE_COLLECTIONS = ['users', 'posts', 'comments', 'tags', 'groups', 'reports', 'licenses', 'marketplace', 'ads', 'events', 'stories', 'pointTransactions', 'announcements'] as const;

export function AdminDatabase() {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string>('posts');
  const [docs, setDocs] = useState<{ id: string; data: Record<string, unknown> }[]>([]);
  const [loading, setLoading] = useState(false);

  async function browse(name: string) {
    setLoading(true);
    setSelected(name);
    const snap = await getDocs(fsQuery(collection(fsDb(), name), fsLimit(20)));
    setDocs(snap.docs.map((d) => ({ id: d.id, data: d.data() })));
    setLoading(false);
  }

  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-2 text-lg font-extrabold sm:text-xl">
        <Database className="h-5 w-5 text-brand-600" aria-hidden />
        {t('admin.database')}
      </h1>
      <div className="bsdc-scroll-x flex gap-2 overflow-x-auto pb-1">
        {BROWSABLE_COLLECTIONS.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => void browse(name)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold ${selected === name ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300' : 'border-surface-light-border text-neutral-500 dark:border-surface-dark-border'}`}
          >
            {name}
          </button>
        ))}
      </div>
      {loading ? (
        <Skeleton className="h-72" />
      ) : (
        <div className="bsdc-surface bsdc-scroll-x overflow-x-auto p-4">
          {docs.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-400">
              {t('common.empty')} — select a collection to browse its latest 20 documents (read-only).
            </p>
          ) : (
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead>
                <tr className="border-b border-surface-light-border dark:border-surface-dark-border">
                  <th className="p-2 font-bold">ID</th>
                  <th className="p-2 font-bold">Document preview</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id} className="border-b border-surface-light-border/60 dark:border-surface-dark-border/60">
                    <td className="p-2 font-mono text-neutral-400">{d.id.slice(0, 12)}</td>
                    <td className="p-2">
                      <code className="line-clamp-2 max-w-2xl whitespace-pre-wrap break-all font-mono">
                        {JSON.stringify(d.data).slice(0, 220)}
                      </code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------ SYSTEM SETTINGS */

export function AdminSettings() {
  const { t } = useTranslation();
  const settings = useUIStore((s) => s.systemSettings);
  const [siteName, setSiteName] = useState(settings.siteName);
  const [tagline, setTagline] = useState(settings.tagline);
  const [announcement, setAnnouncement] = useState(settings.announcementBanner);
  const [announcementEnabled, setAnnouncementEnabled] = useState(settings.announcementEnabled);
  const [maintenance, setMaintenance] = useState(settings.maintenanceMode);
  const [maintenanceMessage, setMaintenanceMessage] = useState(settings.maintenanceMessage);
  const [signupEnabled, setSignupEnabled] = useState(settings.signupEnabled);
  const [pointsEnabled, setPointsEnabled] = useState(settings.pointsEnabled);
  const [marketplaceEnabled, setMarketplaceEnabled] = useState(settings.marketplaceEnabled);
  const [adsEnabled, setAdsEnabled] = useState(settings.adsEnabled);
  const [keywords, setKeywords] = useState(settings.autoModerationKeywords.join(', '));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await saveSystemSettings({
        siteName,
        tagline,
        announcementBanner: announcement,
        announcementEnabled,
        maintenanceMode: maintenance,
        maintenanceMessage,
        signupEnabled,
        pointsEnabled,
        marketplaceEnabled,
        adsEnabled,
        autoModerationKeywords: keywords.split(',').map((k) => k.trim()).filter(Boolean),
      });
      toast.success(t('settings.savedToast'));
    } catch {
      toast.error('Could not save settings');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-2 text-lg font-extrabold sm:text-xl">
        <Save className="h-5 w-5 text-brand-600" aria-hidden />
        {t('admin.settings')}
      </h1>

      <div className="bsdc-surface space-y-3 p-5">
        <Input label="Site name" value={siteName} onChange={(e) => setSiteName(e.target.value)} />
        <Input label="Tagline" value={tagline} onChange={(e) => setTagline(e.target.value)} />
      </div>

      <div className="bsdc-surface space-y-1 p-5">
        <p className="mb-1 text-sm font-bold">Feature flags</p>
        <Switch label="Sign-ups enabled" description="When off, new registrations are closed" checked={signupEnabled} onCheckedChange={setSignupEnabled} />
        <Switch label="BSDC points enabled" checked={pointsEnabled} onCheckedChange={setPointsEnabled} />
        <Switch label="Marketplace enabled" checked={marketplaceEnabled} onCheckedChange={setMarketplaceEnabled} />
        <Switch label="Ads enabled" checked={adsEnabled} onCheckedChange={setAdsEnabled} />
      </div>

      <div className="bsdc-surface space-y-3 p-5">
        <p className="text-sm font-bold">{t('admin.announcement')}</p>
        <Input value={announcement} onChange={(e) => setAnnouncement(e.target.value)} placeholder="Welcome to BSDC — launch day!" />
        <Switch label="Show announcement banner" checked={announcementEnabled} onCheckedChange={setAnnouncementEnabled} />
      </div>

      <div className="bsdc-surface space-y-3 p-5">
        <p className="text-sm font-bold">{t('admin.maintenance')}</p>
        <Switch label="Maintenance mode" description="Shows a maintenance screen to all visitors" checked={maintenance} onCheckedChange={setMaintenance} />
        <Textarea label="Maintenance message" value={maintenanceMessage} onChange={(e) => setMaintenanceMessage(e.target.value)} maxRows={3} />
      </div>

      <div className="bsdc-surface space-y-3 p-5">
        <p className="text-sm font-bold">Auto-moderation</p>
        <Input label="Keyword blocklist" value={keywords} onChange={(e) => setKeywords(e.target.value)} hint="Comma separated — posts containing these are flagged for review" />
      </div>

      <Button loading={saving} onClick={() => void save()} icon={<Save className="h-4 w-4" aria-hidden />}>
        {t('common.save')}
      </Button>
    </div>
  );
}

/* -------------------------------------------------------------- LAUNCH */

export function AdminLaunch() {
  const { t } = useTranslation();
  const settings = useUIStore((s) => s.systemSettings);
  const [date, setDate] = useState(settings.launchDate ? new Date(settings.launchDate).toISOString().slice(0, 16) : '');
  const [preLaunch, setPreLaunch] = useState(settings.preLaunchMode);
  const [saving, setSaving] = useState(false);

  async function saveLaunch() {
    setSaving(true);
    try {
      const ts = date ? new Date(date).getTime() : null;
      await saveSystemSettings({ launchDate: ts, preLaunchMode: preLaunch });
      toast.success(t('admin.launchSet'));
    } catch {
      toast.error('Could not save launch date');
    } finally {
      setSaving(false);
    }
  }

  async function downloadSitemap() {
    const xml = await generateFullSitemap();
    downloadBlob(new Blob([xml], { type: 'application/xml' }), 'sitemap.xml');
    toast.success('sitemap.xml downloaded — deploy to /public on Cloudflare Pages');
  }

  async function downloadRss() {
    const posts = await fetchLatestPosts(50);
    downloadBlob(new Blob([postsToRss(posts)], { type: 'application/rss+xml' }), 'rss.xml');
    downloadBlob(new Blob([postsToAtom(posts)], { type: 'application/atom+xml' }), 'atom.xml');
    downloadBlob(new Blob([postsToRss(posts.filter((p) => p.type === 'blog' || p.type === 'notice'))], { type: 'application/rss+xml' }), 'news-rss.xml');
    toast.success('RSS, Atom and News RSS downloaded');
  }

  const checklist = [
    { label: 'Authentication providers enabled (Google, GitHub, Yahoo, Email)', done: true },
    { label: 'Firestore security rules deployed', done: true },
    { label: 'Cloudinary & ImgBB upload presets configured', done: true },
    { label: 'OneSignal web push configured', done: true },
    { label: 'Launch date set', done: settings.launchDate !== null },
    { label: 'Superadmin account signed in once', done: false },
    { label: 'Custom domain bsdc.info.bd connected', done: false },
  ];

  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-2 text-lg font-extrabold sm:text-xl">
        <Rocket className="h-5 w-5 text-brand-600" aria-hidden />
        {t('admin.launch')}
      </h1>

      <div className="bsdc-surface space-y-3 p-5">
        <p className="text-sm font-bold">{t('admin.launchDate')}</p>
        <Input label="Commercial launch date & time" type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} hint="The public landing page countdown counts down to this moment" />
        <Switch label="Pre-launch mode (show countdown)" checked={preLaunch} onCheckedChange={setPreLaunch} />
        <div className="flex flex-wrap gap-2">
          <Button loading={saving} onClick={() => void saveLaunch()} icon={<Rocket className="h-4 w-4" aria-hidden />}>
            {date ? t('admin.setLaunch') : t('admin.goLive')}
          </Button>
          <Button variant="outline" icon={<Download className="h-4 w-4" aria-hidden />} onClick={() => void downloadSitemap()}>
            {t('admin.downloadSitemap')}
          </Button>
          <Button variant="outline" icon={<Download className="h-4 w-4" aria-hidden />} onClick={() => void downloadRss()}>
            {t('admin.downloadRss')}
          </Button>
        </div>
      </div>

      <div className="bsdc-surface p-5">
        <p className="mb-3 text-sm font-bold">Pre-launch checklist</p>
        <ul className="space-y-2 text-sm">
          {checklist.map((item) => (
            <li key={item.label} className="flex items-center gap-2.5">
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-white ${item.done ? 'bg-brand-600' : 'bg-neutral-300 dark:bg-neutral-700'}`}>
                {item.done ? <Check className="h-3 w-3" aria-hidden /> : null}
              </span>
              {item.label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
