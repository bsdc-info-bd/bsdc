import { Eye, ImagePlus, Plus, Send, X } from 'lucide-react';
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
import { ImageEditorDialog } from '@/components/media/ImageEditorDialog';
import { MediaGallery } from '@/components/media/MediaGallery';
import { MediaTray } from '@/components/media/MediaTray';
import { useFileDrop } from '@/components/media/use-file-drop';
import { useAttachments, type Attachment } from '@/components/media/use-attachments';
import {
  CODE_LANGUAGES,
  EMPTY_DRAFT,
  POLL_OPTIONS_MAX,
  POST_KINDS,
  TAGS_MAX,
  TITLE_MAX,
  draftFromPost,
  validateDraft,
  withReadyMedia,
  VISIBILITIES,
  type CodeLanguage,
  type DraftMedia,
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

/**
 * How many pictures one post carries.
 *
 * The limit is the composer's, not the database's: `post_media` has no ceiling.
 * Ten is as many as a feed card can arrange and as many as a member will look
 * at, and a queue longer than that is a queue somebody stopped watching.
 */
const MEDIA_MAX = 10;

/** The picture types the file picker offers. Anything else is refused by name. */
const ACCEPTED_IMAGES = 'image/jpeg,image/png,image/webp,image/gif,image/avif';

function sameMedia(left: readonly DraftMedia[], right: readonly DraftMedia[]): boolean {
  return (
    left.length === right.length &&
    left.every((item, index) => {
      const other = right[index];
      return (
        other !== undefined &&
        item.mediaId === other.mediaId &&
        item.url === other.url &&
        item.thumbUrl === other.thumbUrl &&
        item.altText === other.altText &&
        item.width === other.width &&
        item.height === other.height
      );
    })
  );
}

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
      // Pictures in a restored draft are already uploaded; they come back as
      // attachments rather than as a queue that would send them again.
      if (stored.media.length > 0) {
        attachments.seed(stored.media.map((item, index) => ({ ...item, position: index })));
      }
    }
    // `attachments.seed` is stable and deliberately not tracked: a re-run of
    // this effect must not re-seed over pictures the member is adding.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        attachments.seed(post.media);
        setExisting('ready');
      })
      .catch(() => {
        if (!cancelled) setExisting('missing');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId, user?.uid]);

  const update = useCallback(<K extends keyof PostDraft>(key: K, value: PostDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  }, []);

  // The queue owns the pictures while they are being written; the draft owns
  // them once they are attached. This is the bridge, and it only writes when
  // something actually changed, so autosave is not woken on every render.
  const syncDraftMedia = useCallback((ready: readonly Attachment[]) => {
    setDraft((current) => {
      const next = withReadyMedia(current, ready).media;
      return sameMedia(current.media, next) ? current : { ...current, media: next };
    });
  }, []);

  const attachments = useAttachments({
    purpose: 'post-image',
    uid: user?.uid ?? null,
    max: MEDIA_MAX,
    onChange: syncDraftMedia,
  });
  const [editingAttachment, setEditingAttachment] = useState<Attachment | null>(null);

  // A picture can be dropped anywhere on the page or pasted from the clipboard,
  // which on a phone is the only way a screenshot can be attached at all.
  const { dragging } = useFileDrop({
    onFiles: (files) => attachments.add(files),
    disabled: user === null,
  });

  const kindLabels: Record<PostKind, string> = {
    post: t('compose.kinds.post'),
    article: t('compose.kinds.article'),
    question: t('compose.kinds.question'),
    poll: t('compose.kinds.poll'),
    snippet: t('compose.kinds.snippet'),
    media: t('compose.kinds.media'),
  };

  async function submit(status: 'draft' | 'published') {
    if (!user) return;
    // Publishing while a picture is still travelling would quietly drop it:
    // the draft only carries attachments that have finished. Say so instead.
    if (attachments.pending.length > 0) {
      toast.info(t('compose.mediaPending', { count: attachments.pending.length }));
      return;
    }
    if (attachments.failed.length > 0) {
      toast.error(t('compose.mediaFailed', { count: attachments.failed.length }));
      return;
    }
    // Do not depend on the passive onChange bridge having copied the queue into
    // draft state yet. A completed upload is ready to save even on the render
    // immediately before that effect runs.
    const draftToSave = withReadyMedia(draft, attachments.ready);
    const issues = status === 'published' ? validateDraft(draftToSave) : [];
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
      const saved = await savePost(user.uid, draftToSave, status);
      if (isEditing) {
        toast.success(t('compose.updated'));
        navigate(`/p/${saved.slug}`);
        return;
      }
      clearLocalDraft();
      attachments.clear();
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
    attachments.clear();
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

      <div className="grid gap-3">
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={ACCEPTED_IMAGES}
          className="sr-only"
          onChange={(event) => {
            const files = event.target.files;
            if (files) attachments.add(Array.from(files));
            event.target.value = '';
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            iconStart={<ImagePlus size={16} />}
            disabled={!attachments.canAdd}
            onClick={() => fileRef.current?.click()}
          >
            {t('compose.addMedia')}
          </Button>
          <span className="text-2xs text-muted">
            {t('compose.mediaHint', { count: MEDIA_MAX })}
          </span>
        </div>

        {attachments.notice !== null ? (
          <Alert tone="warning" title={t(attachments.notice)} className="text-sm" />
        ) : null}

        <MediaTray controller={attachments} onEdit={setEditingAttachment} />
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

  // The preview shows the pictures as the post will show them: the same
  // arrangement, from the same sizes, before anything is published.
  const previewItems = attachments.attachments
    .map((item) => ({
      id: item.id,
      url: item.previewUrl.length > 0 ? item.previewUrl : item.url,
      thumbUrl: item.previewUrl.length > 0 ? item.previewUrl : item.thumbUrl,
      altText: item.altText,
      width: item.width,
      height: item.height,
    }))
    .filter((item) => item.url.length > 0);

  const preview = (
    <div className="grid gap-3">
      {previewItems.length > 0 ? (
        <MediaGallery items={previewItems} label={t('media.gallery.postImages')} />
      ) : null}
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

      <ImageEditorDialog
        open={editingAttachment !== null}
        file={editingAttachment?.file ?? null}
        initial={editingAttachment?.edit ?? undefined}
        onClose={() => setEditingAttachment(null)}
        onApply={(edited, edit) => {
          if (editingAttachment !== null) attachments.applyEdit(editingAttachment.id, edited, edit);
          setEditingAttachment(null);
        }}
      />

      {dragging ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-green-950/60 p-6"
        >
          <div className="flex flex-col items-center gap-2 rounded-card border-2 border-dashed border-white/70 px-8 py-6 text-center text-white">
            <ImagePlus size={28} />
            <p className="text-sm font-semibold">{t('compose.dropHere')}</p>
          </div>
        </div>
      ) : null}
    </>
  );
}
