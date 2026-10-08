import { Eye, ImagePlus, Plus, Send, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { MarkdownView } from '@/components/content/MarkdownView';
import { Seo } from '@/components/seo/Seo';
import {
  Alert,
  Button,
  Card,
  PageSkeleton,
  Chip,
  IconButton,
  SelectField,
  Switch,
  Tabs,
  TagInput,
  TextField,
  TextareaField,
  type TabItem,
} from '@/design-system';
import { useDraftAutosave } from '@/hooks/use-draft-autosave';
import {
  CODE_LANGUAGES,
  EMPTY_DRAFT,
  POLL_OPTIONS_MAX,
  POST_KINDS,
  TAGS_MAX,
  TITLE_MAX,
  draftFromPost,
  validateDraft,
  VISIBILITIES,
  type CodeLanguage,
  type PostDraft,
  type PostKind,
  type Visibility,
} from '@/lib/content/content-types';
import { clearLocalDraft, loadLocalDraft } from '@/lib/content/draft-storage';
import { classifyComposeSaveError } from '@/lib/content/compose-errors';
import { extractHashtags, normalizeTag } from '@/lib/content/text';
import { isConfigured } from '@/lib/env';
import { ROUTES } from '@/lib/site';
import { useAuthStore } from '@/store/auth-store';

const TAG_SUGGESTIONS = [
  'javascript',
  'typescript',
  'react',
  'nodejs',
  'php',
  'laravel',
  'python',
  'flutter',
  'android',
  'devops',
  'career',
  'freelancing',
  'open-source',
  'security',
  'ui-design',
] as const;

export default function ComposePage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const params = useParams<{ postId?: string }>();
  const user = useAuthStore((state) => state.user);
  // `/compose/<post id>` edits that post; `/compose` writes a new one.
  const editingId = params.postId !== undefined && params.postId.length > 0 ? params.postId : null;
  const isEditing = editingId !== null;

  const [draft, setDraft] = useState<PostDraft>(() => ({
    ...EMPTY_DRAFT,
    language: i18n.language === 'en' ? 'en' : 'bn',
  }));
  const [restored, setRestored] = useState(false);
  const [tab, setTab] = useState('write');
  const [busy, setBusy] = useState(false);
  const [errorKeys, setErrorKeys] = useState<string[]>([]);
  const [saveErrorKey, setSaveErrorKey] = useState<string | null>(null);
  const [existing, setExisting] = useState<'loading' | 'ready' | 'missing' | 'forbidden'>(
    isEditing ? 'loading' : 'ready',
  );
  const fileRef = useRef<HTMLInputElement>(null);
  // Editing a saved post never touches the browser copy: that copy belongs to
  // the post being written from scratch.
  const autosave = useDraftAutosave(draft, 1200, !isEditing);

  // A draft left behind by an earlier session is offered back, never applied
  // silently over something the member is already writing.
  useEffect(() => {
    if (isEditing) return;
    const stored = loadLocalDraft();
    if (stored) {
      setDraft(stored);
      setRestored(true);
    }
  }, [isEditing]);

  // The post being edited is loaded once, and only the author may open it.
  // The database enforces the same rule on save; this stops the editor from
  // presenting somebody else's post as editable in the first place.
  useEffect(() => {
    if (editingId === null) return;
    let cancelled = false;
    setExisting('loading');
    void import('@/lib/content/post-repository')
      .then((module) => module.fetchPostById(editingId))
      .then((post) => {
        if (cancelled) return;
        if (post === null) {
          setExisting('missing');
          return;
        }
        if (post.author === null || post.author.uid !== user?.uid) {
          setExisting('forbidden');
          return;
        }
        setDraft(draftFromPost(post));
        setExisting('ready');
      })
      .catch(() => {
        if (!cancelled) setExisting('missing');
      });
    return () => {
      cancelled = true;
    };
  }, [editingId, user?.uid]);

  const update = useCallback(<K extends keyof PostDraft>(key: K, value: PostDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  }, []);

  const kindLabels: Record<PostKind, string> = {
    post: t('compose.kinds.post'),
    article: t('compose.kinds.article'),
    question: t('compose.kinds.question'),
    poll: t('compose.kinds.poll'),
    snippet: t('compose.kinds.snippet'),
    media: t('compose.kinds.media'),
  };

  async function attachFiles(files: FileList) {
    if (!user) return;
    const { uploadMedia } = await import('@/lib/storage/upload');
    const { recordMediaAsset } = await import('@/lib/data/media-repository');

    for (const file of Array.from(files).slice(0, 10 - draft.media.length)) {
      try {
        const result = await uploadMedia(file, { purpose: 'post-image' });
        // `post_media` references `media_assets`, so an upload the platform
        // has no record of can never be attached to the post. Swallowing that
        // failure would leave the picture in the composer and silently drop it
        // from the published post, which is why it is reported instead.
        const record = isConfigured.supabase ? await recordMediaAsset(user.uid, result) : null;
        if (isConfigured.supabase && !record) {
          throw new Error('media.errors.recordFailed');
        }
        const mediaId = record?.id ?? '';
        setDraft((current) => ({
          ...current,
          media: [
            ...current.media,
            { url: result.url, thumbUrl: result.thumbUrl, mediaId, altText: '' },
          ],
        }));
      } catch (error) {
        const key =
          error instanceof Error && error.message.startsWith('media.')
            ? error.message
            : 'media.errors.failed';
        toast.error(t(key));
      }
    }
  }

  async function submit(status: 'draft' | 'published') {
    if (!user) return;
    const issues = status === 'published' ? validateDraft(draft) : [];
    if (issues.length > 0) {
      setSaveErrorKey(null);
      setErrorKeys(issues.map((issue) => issue.messageKey));
      return;
    }
    setErrorKeys([]);
    setSaveErrorKey(null);
    setBusy(true);
    try {
      const { savePost } = await import('@/lib/content/post-repository');
      const saved = await savePost(user.uid, draft, status);
      if (isEditing) {
        toast.success(t('compose.updated'));
        navigate(`/p/${saved.slug}`);
        return;
      }
      clearLocalDraft();
      toast.success(status === 'published' ? t('compose.published') : t('compose.savedDraft'));
      navigate(status === 'published' ? `/p/${saved.slug}` : ROUTES.home);
    } catch (error) {
      // A save failure is a data problem, not a draft problem: it belongs to
      // its own alert, and a missing profile sends the member to onboarding.
      const classified = classifyComposeSaveError(error);
      if (classified.kind === 'onboarding') {
        toast.error(t(classified.messageKey));
        navigate(ROUTES.onboarding);
      } else {
        setSaveErrorKey(classified.messageKey);
      }
    } finally {
      setBusy(false);
    }
  }

  function discard() {
    clearLocalDraft();
    setDraft({ ...EMPTY_DRAFT, language: i18n.language === 'en' ? 'en' : 'bn' });
    setRestored(false);
    setErrorKeys([]);
    setSaveErrorKey(null);
  }

  const suggestedTags = extractHashtags(draft.body).filter(
    (tag) => !draft.tags.includes(tag) && draft.tags.length < TAGS_MAX,
  );

  const editor = (
    <div className="grid gap-4">
      {draft.kind !== 'post' && draft.kind !== 'media' ? (
        <TextField
          label={t('compose.fields.title')}
          value={draft.title}
          maxLength={TITLE_MAX}
          onChange={(event) => update('title', event.target.value)}
          hint={t('compose.hints.title')}
        />
      ) : null}

      <TextareaField
        label={t('compose.fields.body')}
        hint={t('compose.hints.body')}
        value={draft.body}
        rows={draft.kind === 'article' ? 14 : 7}
        onChange={(event) => update('body', event.target.value)}
      />

      {draft.kind === 'snippet' ? (
        <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
          <TextareaField
            label={t('compose.fields.code')}
            value={draft.code}
            rows={10}
            spellCheck={false}
            className="font-mono"
            onChange={(event) => update('code', event.target.value)}
          />
          <SelectField
            label={t('compose.fields.codeLanguage')}
            value={draft.codeLanguage}
            onChange={(event) => update('codeLanguage', event.target.value as CodeLanguage)}
            options={CODE_LANGUAGES.map((language) => ({ value: language, label: language }))}
          />
        </div>
      ) : null}

      {draft.kind === 'poll' ? (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">{t('compose.fields.pollOptions')}</legend>
          {draft.pollOptions.map((option, index) => (
            <div key={`poll-option-${String(index)}`} className="flex items-end gap-2">
              <TextField
                label={t('compose.fields.pollOption', { number: index + 1 })}
                value={option}
                maxLength={80}
                onChange={(event) => {
                  const next = [...draft.pollOptions];
                  next[index] = event.target.value;
                  update('pollOptions', next);
                }}
              />
              {draft.pollOptions.length > 2 ? (
                <IconButton
                  label={t('compose.removeOption')}
                  icon={<X size={18} />}
                  onClick={() =>
                    update(
                      'pollOptions',
                      draft.pollOptions.filter((_, position) => position !== index),
                    )
                  }
                />
              ) : null}
            </div>
          ))}
          {draft.pollOptions.length < POLL_OPTIONS_MAX ? (
            <div>
              <Button
                variant="secondary"
                size="sm"
                iconStart={<Plus size={16} />}
                onClick={() => update('pollOptions', [...draft.pollOptions, ''])}
              >
                {t('compose.addOption')}
              </Button>
            </div>
          ) : null}
        </fieldset>
      ) : null}

      <div>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
          className="sr-only"
          onChange={(event) => {
            if (event.target.files) void attachFiles(event.target.files);
            event.target.value = '';
          }}
        />
        <Button
          variant="secondary"
          size="sm"
          iconStart={<ImagePlus size={16} />}
          disabled={draft.media.length >= 10}
          onClick={() => fileRef.current?.click()}
        >
          {t('compose.addMedia')}
        </Button>
        {draft.media.length > 0 ? (
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {draft.media.map((item, index) => (
              <li key={item.url} className="rounded-card border border-border p-2">
                <img
                  src={item.thumbUrl.length > 0 ? item.thumbUrl : item.url}
                  alt=""
                  loading="lazy"
                  className="h-24 w-full rounded-lg object-cover"
                />
                <TextField
                  label={t('compose.fields.altText')}
                  value={item.altText}
                  maxLength={280}
                  className="mt-2"
                  onChange={(event) => {
                    const next = [...draft.media];
                    const current = next[index];
                    if (!current) return;
                    next[index] = { ...current, altText: event.target.value };
                    update('media', next);
                  }}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  iconStart={<Trash2 size={16} />}
                  className="mt-1"
                  onClick={() =>
                    update(
                      'media',
                      draft.media.filter((_, position) => position !== index),
                    )
                  }
                >
                  {t('common.close')}
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <TagInput
        label={t('compose.fields.tags')}
        hint={t('compose.hints.tags', { count: TAGS_MAX })}
        value={draft.tags}
        max={TAGS_MAX}
        suggestions={TAG_SUGGESTIONS}
        onChange={(tags) => update('tags', tags.map(normalizeTag).filter(Boolean))}
      />

      {suggestedTags.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">{t('compose.hashtagSuggestions')}</span>
          {suggestedTags.map((tag) => (
            <Chip key={tag} onClick={() => update('tags', [...draft.tags, tag])}>
              #{tag}
            </Chip>
          ))}
        </div>
      ) : null}
    </div>
  );

  const preview = (
    <div className="grid gap-3">
      {draft.title.trim().length > 0 ? <h2 className="text-2xl">{draft.title}</h2> : null}
      {draft.body.trim().length > 0 ? (
        <MarkdownView markdown={draft.body} />
      ) : (
        <p className="text-sm text-muted">{t('compose.previewEmpty')}</p>
      )}
      {draft.kind === 'snippet' && draft.code.trim().length > 0 ? (
        <MarkdownView markdown={`\`\`\`${draft.codeLanguage}\n${draft.code}\n\`\`\``} />
      ) : null}
      {draft.kind === 'poll' ? (
        <ul className="grid gap-2">
          {draft.pollOptions
            .filter((option) => option.trim().length > 0)
            .map((option) => (
              <li key={option} className="rounded-xl border border-border px-3 py-2 text-sm">
                {option}
              </li>
            ))}
        </ul>
      ) : null}
    </div>
  );

  const tabs: TabItem[] = [
    { id: 'write', label: t('compose.tabs.write'), content: editor },
    { id: 'preview', label: t('compose.tabs.preview'), content: preview },
  ];

  return (
    <>
      <Seo
        title={isEditing ? t('compose.editMetaTitle') : t('compose.metaTitle')}
        description={t('compose.metaDescription')}
        path="/compose"
        noindex
      />
      <div className="fab-container py-6 sm:py-10">
        <div className="mx-auto w-full max-w-3xl">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-2xl sm:text-3xl">
              {isEditing ? t('compose.editTitle') : t('compose.title')}
            </h1>
            <p aria-live="polite" className="text-xs text-muted">
              {autosave === 'saving' ? t('compose.autosaving') : null}
              {autosave === 'saved' ? t('compose.autosaved') : null}
            </p>
          </div>

          {!isConfigured.supabase ? (
            <Alert tone="danger" title={t('data.errors.notConfigured')} className="mt-4" />
          ) : null}

          {existing === 'loading' ? <PageSkeleton label={t('common.loading')} /> : null}

          {existing === 'missing' ? (
            <Alert tone="danger" title={t('compose.editMissing')} className="mt-4" />
          ) : null}

          {existing === 'forbidden' ? (
            <Alert tone="danger" title={t('compose.editForbidden')} className="mt-4" />
          ) : null}

          {restored ? (
            <Alert tone="info" title={t('compose.restoredTitle')} className="mt-4">
              <div className="mt-2">
                <Button variant="secondary" size="sm" onClick={discard}>
                  {t('compose.discard')}
                </Button>
              </div>
            </Alert>
          ) : null}

          {errorKeys.length > 0 ? (
            <Alert tone="danger" title={t('compose.errors.title')} className="mt-4">
              <ul className="mt-1 list-disc ps-5">
                {errorKeys.map((key) => (
                  <li key={key}>{t(key)}</li>
                ))}
              </ul>
            </Alert>
          ) : null}

          {saveErrorKey !== null ? (
            <Alert tone="danger" title={t('compose.saveFailed')} className="mt-4">
              {t(saveErrorKey)}
            </Alert>
          ) : null}

          {existing !== 'ready' ? null : (
            <>
              {!isEditing ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {POST_KINDS.map((kind) => (
                    <Chip
                      key={kind}
                      selected={draft.kind === kind}
                      onClick={() => update('kind', kind)}
                    >
                      {kindLabels[kind]}
                    </Chip>
                  ))}
                </div>
              ) : null}

              <Card className="mt-4">
                <Tabs items={tabs} activeId={tab} onChange={setTab} label={t('compose.title')} />
              </Card>

              <Card className="mt-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <SelectField
                    label={t('compose.fields.visibility')}
                    value={draft.visibility}
                    onChange={(event) => update('visibility', event.target.value as Visibility)}
                    options={VISIBILITIES.map((visibility) => ({
                      value: visibility,
                      label: t(`compose.visibility.${visibility}`),
                    }))}
                  />
                  <SelectField
                    label={t('compose.fields.language')}
                    value={draft.language}
                    onChange={(event) =>
                      update('language', event.target.value === 'en' ? 'en' : 'bn')
                    }
                    options={[
                      { value: 'bn', label: t('language.bangla') },
                      { value: 'en', label: t('language.english') },
                    ]}
                  />
                  <Switch
                    checked={draft.allowComments}
                    onCheckedChange={(value) => update('allowComments', value)}
                    label={t('compose.allowComments')}
                  />
                  <Switch
                    checked={draft.isSensitive}
                    onCheckedChange={(value) => update('isSensitive', value)}
                    label={t('compose.sensitive')}
                    description={t('compose.sensitiveHint')}
                  />
                </div>
              </Card>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button
                  iconStart={<Send size={16} />}
                  loading={busy}
                  disabled={!isConfigured.supabase || existing !== 'ready'}
                  onClick={() => void submit('published')}
                >
                  {isEditing ? t('compose.saveChanges') : t('compose.publish')}
                </Button>
                {!isEditing ? (
                  <Button
                    variant="secondary"
                    disabled={busy || !isConfigured.supabase}
                    onClick={() => void submit('draft')}
                  >
                    {t('compose.saveDraft')}
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  iconStart={<Eye size={16} />}
                  onClick={() => setTab(tab === 'preview' ? 'write' : 'preview')}
                >
                  {tab === 'preview' ? t('compose.tabs.write') : t('compose.tabs.preview')}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
