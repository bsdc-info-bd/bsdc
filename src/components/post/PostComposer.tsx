/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Editor from '@monaco-editor/react';
import { toast } from 'sonner';
import {
  ChevronDown, Clock, Eye, FileText, HelpCircle, Code2, BookOpen, Library, Image as ImageIcon,
  FolderGit2, Briefcase, Megaphone, BarChart3, PenLine, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { ImageUploader, type UploadedImage } from '@/components/ui/ImageUploader';
import { Markdown } from '@/components/ui/Markdown';
import { createPost, getPostById, updatePost } from '@/lib/data';
import { useAuthStore } from '@/stores/authStore';
import type { Post, PostType } from '@/types/post';

function detailRoute(type: PostType): string {
  if (type === 'text' || type === 'image' || type === 'poll' || type === 'story') return 'post';
  return type;
}
import type { Visibility } from '@/types/common';
import { MAX_TAGS_PER_POST, SNIPPET_LANGUAGES } from '@/config/constants';
import { cn, randomId, readingMinutes } from '@/lib/utils';
import { z } from 'zod';

const COMPOSER_TYPES: { type: PostType; labelKey: string; icon: typeof FileText }[] = [
  { type: 'text', labelKey: 'post.types.text', icon: FileText },
  { type: 'image', labelKey: 'post.types.image', icon: ImageIcon },
  { type: 'blog', labelKey: 'post.types.blog', icon: PenLine },
  { type: 'qa', labelKey: 'post.types.qa', icon: HelpCircle },
  { type: 'snippet', labelKey: 'post.types.snippet', icon: Code2 },
  { type: 'docs', labelKey: 'post.types.docs', icon: BookOpen },
  { type: 'wiki', labelKey: 'post.types.wiki', icon: Library },
  { type: 'project', labelKey: 'post.types.project', icon: FolderGit2 },
  { type: 'job', labelKey: 'post.types.job', icon: Briefcase },
  { type: 'notice', labelKey: 'post.types.notice', icon: Megaphone },
  { type: 'poll', labelKey: 'post.types.poll', icon: BarChart3 },
];

const TITLED_TYPES: PostType[] = ['blog', 'qa', 'snippet', 'docs', 'wiki', 'project', 'job', 'notice'];

const postSchema = z.object({
  title: z.string().max(160, 'Title must be 160 characters or fewer'),
  body: z.string().min(1, 'Write something first'),
});

export function PostComposer({ initialType, groupId, groupName }: { initialType?: PostType; groupId?: string; groupName?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const profile = useAuthStore((s) => s.profile);
  const editId = searchParams.get('edit');

  const [type, setType] = useState<PostType>(initialType || 'text');
  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [tagsInput, setTagsInput] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  const [canonicalUrl, setCanonicalUrl] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  // Snippet fields
  const [snippetLanguage, setSnippetLanguage] = useState('typescript');
  const [code, setCode] = useState('// Write your code here\n');
  // Job fields
  const [company, setCompany] = useState('');
  const [jobType, setJobType] = useState<'remote' | 'onsite' | 'hybrid'>('remote');
  const [jobLocation, setJobLocation] = useState('');
  const [salaryMin, setSalaryMin] = useState('');
  const [salaryMax, setSalaryMax] = useState('');
  const [salaryCurrency, setSalaryCurrency] = useState<'BDT' | 'USD'>('BDT');
  const [applyUrl, setApplyUrl] = useState('');
  const [requirements, setRequirements] = useState('');
  const [expiry, setExpiry] = useState('');
  // Project fields
  const [repoUrl, setRepoUrl] = useState('');
  const [liveUrl, setLiveUrl] = useState('');
  const [techStack, setTechStack] = useState('');
  // Notice fields
  const [priority, setPriority] = useState<'normal' | 'important' | 'urgent'>('normal');
  // Poll fields
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [pollMultiple, setPollMultiple] = useState(false);
  const [pollAnonymous, setPollAnonymous] = useState(false);
  const [pollExpiry, setPollExpiry] = useState('');

  useEffect(() => {
    if (!editId) return;
    void getPostById(editId).then((post) => {
      if (!post) return;
      setEditingPost(post);
      setType(post.type);
      setTitle(post.title);
      setBody(post.body);
      setImages(post.images.map((url) => ({ url, name: 'image' })));
      setTagsInput(post.tags.join(', '));
      setVisibility(post.visibility);
      setSeoTitle(post.seoTitle);
      setSeoDescription(post.seoDescription);
      setCanonicalUrl(post.canonicalUrl);
      if (post.snippet) {
        setSnippetLanguage(post.snippet.language);
        setCode(post.snippet.code);
      }
      if (post.job) {
        setCompany(post.job.company);
        setJobType(post.job.jobType);
        setJobLocation(post.job.location);
        setSalaryMin(String(post.job.salaryMin || ''));
        setSalaryMax(String(post.job.salaryMax || ''));
        setSalaryCurrency(post.job.salaryCurrency);
        setApplyUrl(post.job.applyUrl);
        setRequirements(post.job.requirements.join('\n'));
        if (post.job.expiryAt) setExpiry(new Date(post.job.expiryAt).toISOString().slice(0, 10));
      }
      if (post.project) {
        setRepoUrl(post.project.repoUrl);
        setLiveUrl(post.project.liveUrl);
        setTechStack(post.project.techStack.join(', '));
      }
      if (post.notice) setPriority(post.notice.priority);
      if (post.poll) {
        setPollQuestion(post.poll.question);
        setPollOptions(post.poll.options.map((o) => o.text));
        setPollMultiple(post.poll.multiple);
        setPollAnonymous(post.poll.anonymous);
      }
    });
  }, [editId]);

  const tags = useMemo(
    () =>
      tagsInput
        .split(/[,\s]+/)
        .map((tg) => tg.replace(/^#/, '').toLowerCase().trim())
        .filter(Boolean)
        .slice(0, MAX_TAGS_PER_POST),
    [tagsInput],
  );

  const needsTitle = TITLED_TYPES.includes(type);
  const effectiveTitle = type === 'poll' ? pollQuestion : title;

  async function submit(status: 'published' | 'draft' | 'scheduled') {
    if (!profile) {
      navigate('/login');
      return;
    }
    const parsed = postSchema.safeParse({ title: effectiveTitle, body: type === 'snippet' ? code : body });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message || 'Please complete the form');
      return;
    }
    if (needsTitle && !title.trim()) {
      toast.error('Add a title');
      return;
    }
    if (type === 'poll' && pollOptions.filter((o) => o.trim()).length < 2) {
      toast.error('A poll needs at least two options');
      return;
    }
    if (type === 'job' && (!company.trim() || !applyUrl.trim())) {
      toast.error('Job posts need a company name and application URL');
      return;
    }
    if (status === 'scheduled' && !scheduledAt) {
      toast.error('Pick a schedule date and time');
      return;
    }

    setSaving(true);
    try {
      const scheduledTs = scheduledAt ? new Date(scheduledAt).getTime() : null;
      const pollData =
        type === 'poll'
          ? {
              question: pollQuestion,
              options: pollOptions.filter((o) => o.trim()).map((text) => ({ id: randomId(6), text: text.trim(), votes: 0 })),
              multiple: pollMultiple,
              anonymous: pollAnonymous,
              expiresAt: pollExpiry ? new Date(pollExpiry).getTime() : null,
              totalVotes: 0,
            }
          : null;

      if (editingPost) {
        await updatePost(
          editingPost.id,
          {
            title: effectiveTitle,
            body,
            images: images.map((i) => i.url),
            tags,
            visibility,
            seoTitle,
            seoDescription,
            canonicalUrl,
            snippet: type === 'snippet' ? { language: snippetLanguage, code, forks: editingPost.snippet?.forks || 0 } : null,
            poll: pollData,
          },
          type === 'wiki' ? 'Updated wiki entry' : '',
        );
        toast.success('Post updated');
        navigate(`/${detailRoute(editingPost.type)}/${editingPost.slug}`);
      } else {
        const post = await createPost({
          author: profile,
          type,
          title: effectiveTitle,
          body: type === 'snippet' ? `${body || code.slice(0, 300)}` : body,
          images: images.map((i) => i.url),
          tags,
          visibility,
          status,
          scheduledAt: scheduledTs,
          groupId: groupId || null,
          groupName: groupName || null,
          seoTitle,
          seoDescription,
          canonicalUrl,
          snippet: type === 'snippet' ? { language: snippetLanguage, code } : null,
          job:
            type === 'job'
              ? {
                  company,
                  companyLogo: '',
                  jobType,
                  location: jobLocation,
                  salaryMin: salaryMin ? Number(salaryMin) : null,
                  salaryMax: salaryMax ? Number(salaryMax) : null,
                  salaryCurrency,
                  applyUrl,
                  requirements: requirements.split('\n').map((r) => r.trim()).filter(Boolean),
                  expiryAt: expiry ? new Date(expiry).getTime() : null,
                }
              : null,
          project:
            type === 'project'
              ? {
                  repoUrl,
                  liveUrl,
                  techStack: techStack.split(',').map((s) => s.trim()).filter(Boolean),
                  teamMemberIds: [],
                  starCount: 0,
                }
              : null,
          notice: type === 'notice' ? { priority, expiresAt: expiry ? new Date(expiry).getTime() : null } : null,
          poll: pollData,
        });
        toast.success(status === 'draft' ? t('post.draftSaved') : t('post.published'));
        navigate(status === 'draft' ? '/' : `/${detailRoute(post.type)}/${post.slug}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save post');
    } finally {
      setSaving(false);
    }
  }

  if (!profile) {
    return (
      <div className="bsdc-surface p-8 text-center">
        <p className="mb-4 text-sm font-medium text-neutral-500">{t('auth.hasAccount')} {t('common.login')} to share</p>
        <Button onClick={() => navigate('/login')}>{t('common.login')}</Button>
      </div>
    );
  }

  const currentTypeMeta = COMPOSER_TYPES.find((c) => c.type === type)!;

  return (
    <div className="bsdc-surface overflow-visible">
      {/* Type picker */}
      <div className="border-b border-surface-light-border p-4 dark:border-surface-dark-border">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold">{editingPost ? t('post.editPost') : t('post.newPost')}</p>
          <button
            type="button"
            onClick={() => setTypePickerOpen((v) => !v)}
            className="bsdc-tap inline-flex items-center gap-2 rounded-full border border-surface-light-border px-3 py-1.5 text-sm font-semibold hover:border-brand-500 dark:border-surface-dark-border"
            aria-expanded={typePickerOpen}
          >
            <currentTypeMeta.icon className="h-4 w-4 text-brand-600" aria-hidden />
            {t(currentTypeMeta.labelKey)}
            <ChevronDown className="h-4 w-4" aria-hidden />
          </button>
        </div>
        {typePickerOpen ? (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {COMPOSER_TYPES.map((opt) => (
              <button
                key={opt.type}
                type="button"
                onClick={() => {
                  setType(opt.type);
                  setTypePickerOpen(false);
                }}
                className={cn(
                  'bsdc-tap flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors',
                  type === opt.type
                    ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300'
                    : 'border-surface-light-border hover:bg-neutral-50 dark:border-surface-dark-border dark:hover:bg-surface-dark-raised',
                )}
              >
                <opt.icon className="h-4 w-4 shrink-0" aria-hidden />
                <span className="truncate">{t(opt.labelKey)}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="space-y-4 p-4">
        {needsTitle ? (
          <Input
            label={t('common.title')}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={160}
            placeholder={type === 'qa' ? t('post.questionTitle') : t('common.title')}
          />
        ) : null}

        {type === 'poll' ? (
          <div className="space-y-3">
            <Input label={t('post.pollQuestion')} value={pollQuestion} onChange={(e) => setPollQuestion(e.target.value)} />
            {pollOptions.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={opt}
                  onChange={(e) => setPollOptions((prev) => prev.map((o, j) => (j === i ? e.target.value : o)))}
                  placeholder={`${t('post.pollOption')} ${i + 1}`}
                  aria-label={`${t('post.pollOption')} ${i + 1}`}
                />
                {pollOptions.length > 2 ? (
                  <button
                    type="button"
                    onClick={() => setPollOptions((prev) => prev.filter((_, j) => j !== i))}
                    aria-label={`Remove option ${i + 1}`}
                    className="bsdc-tap shrink-0 rounded-lg px-3 py-2 text-sm font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
                  >
                    ×
                  </button>
                ) : null}
              </div>
            ))}
            {pollOptions.length < 10 ? (
              <Button variant="outline" size="sm" onClick={() => setPollOptions((prev) => [...prev, ''])}>
                {t('post.addOption')}
              </Button>
            ) : null}
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={pollMultiple} onChange={(e) => setPollMultiple(e.target.checked)} className="h-4 w-4 accent-brand-600" />
                {t('post.pollMultiple')}
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={pollAnonymous} onChange={(e) => setPollAnonymous(e.target.checked)} className="h-4 w-4 accent-brand-600" />
                {t('post.pollAnonymous')}
              </label>
            </div>
            <Input label={t('post.pollExpires')} type="date" value={pollExpiry} onChange={(e) => setPollExpiry(e.target.value)} />
          </div>
        ) : null}

        {type === 'snippet' ? (
          <div className="space-y-2">
            <Select
              label={t('post.language')}
              value={snippetLanguage}
              onChange={(e) => setSnippetLanguage(e.target.value)}
              options={SNIPPET_LANGUAGES.map((l) => ({ value: l, label: l }))}
            />
            <div className="overflow-hidden rounded-xl border border-surface-light-border dark:border-surface-dark-border">
              <Editor
                height="min(42dvh, 380px)"
                defaultLanguage={snippetLanguage}
                language={snippetLanguage}
                theme="vs-dark"
                value={code}
                onChange={(v) => setCode(v || '')}
                options={{ minimap: { enabled: false }, fontSize: 13, wordWrap: 'on', scrollBeyondLastLine: false, tabSize: 2 }}
              />
            </div>
            <Textarea label={`${t('common.description')} (${t('common.optional')})`} value={body} onChange={(e) => setBody(e.target.value)} placeholder={t('post.questionDetails')} minRows={2} />
          </div>
        ) : type === 'image' ? (
          <>
            <ImageUploader images={images} onChange={setImages} max={10} folder="bsdc/posts" />
            <Textarea
              label="Caption"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t('post.composer')}
              minRows={3}
              ref={bodyRef}
            />
          </>
        ) : (
          <div>
            <Textarea
              label={type === 'qa' ? t('post.questionDetails') : `${type === 'text' ? '' : 'Content'}${type === 'text' ? ' ' + t('post.composer') : ''}`}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={type === 'text' ? t('post.composer') : 'Write in Markdown… (code blocks, tables, math and task lists supported)'}
              minRows={type === 'text' ? 3 : 8}
              maxRows={24}
              ref={bodyRef}
            />
            <div className="mt-1 flex items-center justify-between text-xs text-neutral-400">
              <span>Markdown supported · {readingMinutes(body)} {t('post.readingTime')}</span>
              {type !== 'text' && type !== 'qa' ? (
                <button type="button" onClick={() => setPreview((v) => !v)} className="inline-flex items-center gap-1 font-semibold text-brand-600 hover:underline">
                  <Eye className="h-3.5 w-3.5" aria-hidden />
                  {preview ? 'Edit' : 'Preview'}
                </button>
              ) : null}
            </div>
            {preview && body ? <div className="bsdc-surface mt-2 p-4"><Markdown content={body} /></div> : null}
          </div>
        )}

        {type === 'job' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label={t('post.company')} value={company} onChange={(e) => setCompany(e.target.value)} />
            <Select
              label={t('post.jobType')}
              value={jobType}
              onChange={(e) => setJobType(e.target.value as 'remote' | 'onsite' | 'hybrid')}
              options={[
                { value: 'remote', label: t('post.remote') },
                { value: 'onsite', label: t('post.onsite') },
                { value: 'hybrid', label: t('post.hybrid') },
              ]}
            />
            <Input label={t('common.location')} value={jobLocation} onChange={(e) => setJobLocation(e.target.value)} placeholder="Dhaka, Bangladesh" />
            <div className="grid grid-cols-2 gap-2 min-[460px]:grid-cols-3">
              <Input label={`${t('post.salary')} min`} type="number" min={0} value={salaryMin} onChange={(e) => setSalaryMin(e.target.value)} />
              <Input label="max" type="number" min={0} value={salaryMax} onChange={(e) => setSalaryMax(e.target.value)} />
              <Select
                label="Currency"
                value={salaryCurrency}
                onChange={(e) => setSalaryCurrency(e.target.value as 'BDT' | 'USD')}
                options={[
                  { value: 'BDT', label: 'BDT' },
                  { value: 'USD', label: 'USD' },
                ]}
              />
            </div>
            <Input label={t('post.applyUrl')} type="url" value={applyUrl} onChange={(e) => setApplyUrl(e.target.value)} placeholder="https://…" />
            <Input label={t('post.expiry')} type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
            <div className="sm:col-span-2">
              <Textarea label={t('post.requirements')} value={requirements} onChange={(e) => setRequirements(e.target.value)} hint="One requirement per line" minRows={3} />
            </div>
          </div>
        ) : null}

        {type === 'project' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label={t('post.repoUrl')} type="url" value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} placeholder="https://github.com/…" />
            <Input label={t('post.liveUrl')} type="url" value={liveUrl} onChange={(e) => setLiveUrl(e.target.value)} placeholder="https://…" />
            <div className="sm:col-span-2">
              <Input label={t('post.techStack')} value={techStack} onChange={(e) => setTechStack(e.target.value)} hint="Comma separated — React, Firebase, Tailwind…" />
            </div>
            <div className="sm:col-span-2">
              {type === 'project' ? <ImageUploader images={images} onChange={setImages} max={6} folder="bsdc/projects" /> : null}
            </div>
          </div>
        ) : null}

        {type === 'notice' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label={t('post.priority')}
              value={priority}
              onChange={(e) => setPriority(e.target.value as 'normal' | 'important' | 'urgent')}
              options={[
                { value: 'normal', label: t('post.normal') },
                { value: 'important', label: t('post.important') },
                { value: 'urgent', label: t('post.urgent') },
              ]}
            />
            <Input label={t('post.expiry')} type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          </div>
        ) : null}

        {(type === 'blog' || type === 'image' || type === 'text') ? (
          <ImageUploader images={images} onChange={setImages} max={10} folder="bsdc/posts" />
        ) : null}

        <Input
          label={t('common.tags')}
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          hint={`${t('post.tagHint')} — react, firebase, bangladesh`}
          leftIcon={<span aria-hidden>#</span>}
        />
        {tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tg) => (
              <span key={tg} className="bsdc-chip bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300">#{tg}</span>
            ))}
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="text-sm font-semibold text-brand-600 hover:underline dark:text-brand-400"
        >
          {showAdvanced ? 'Hide' : 'Show'} {t('post.seoFields').toLowerCase()}, {t('common.visibility').toLowerCase()} & {t('common.schedule').toLowerCase()}
        </button>

        {showAdvanced ? (
          <div className="space-y-3 rounded-xl border border-surface-light-border p-3.5 dark:border-surface-dark-border">
            <Select
              label={t('common.visibility')}
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as Visibility)}
              options={[
                { value: 'public', label: t('common.public') },
                { value: 'followers', label: t('common.followersOnly') },
                { value: 'private', label: t('common.onlyMe') },
                ...(groupId ? [{ value: 'group', label: t('common.groupOnly') }] : []),
              ]}
            />
            <Input label={`${t('post.metaTitle')} (${t('common.optional')})`} value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} maxLength={60} />
            <Textarea label={`${t('post.metaDescription')} (${t('common.optional')})`} value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} maxRows={3} maxLength={160} />
            <Input label={`${t('post.canonical')} (${t('common.optional')})`} value={canonicalUrl} onChange={(e) => setCanonicalUrl(e.target.value)} placeholder="https://…" />
            <Input label={t('post.scheduledFor')} type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 border-t border-surface-light-border p-4 dark:border-surface-dark-border sm:flex-row sm:items-center sm:justify-end">
        {saving ? (
          <span className="flex items-center gap-2 text-sm text-neutral-400">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            {t('common.saving')}
          </span>
        ) : null}
        {!editingPost ? (
          <Button variant="outline" onClick={() => void submit('draft')} disabled={saving}>
            {t('common.draft')}
          </Button>
        ) : null}
        {!editingPost ? (
          <Button variant="outline" icon={<Clock className="h-4 w-4" aria-hidden />} onClick={() => void submit('scheduled')} disabled={saving || !scheduledAt}>
            {t('common.schedule')}
          </Button>
        ) : null}
        <Button onClick={() => void submit('published')} disabled={saving}>
          {editingPost ? t('common.save') : t('common.publish')}
        </Button>
      </div>
    </div>
  );
}

