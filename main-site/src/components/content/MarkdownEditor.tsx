import {
  Bold,
  Code2,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Strikethrough,
  Table2,
  Underline as UnderlineIcon,
} from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MediaSourcePicker } from '@/components/media/MediaSourcePicker';
import { isSameMedia, type PickedMedia } from '@/lib/media/gallery';
import type { MediaPurpose } from '@/lib/storage/media-contract';
import { cn } from '@/lib/cn';
import {
  continueLine,
  countText,
  imageUrls,
  insertCodeBlock,
  insertImage,
  insertLink,
  insertTable,
  toggleLinePrefix,
  wrapSelection,
  type EditorWindow,
} from '@/lib/content/markdown-edit';

export interface MarkdownEditorProps {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  maxLength?: number;
  /**
   * Uploads a picture and answers its hosted URL. The editor never talks to a
   * provider itself: the page owns the upload contract so the same
   * `uploadAndRecord` call records the asset against its owner.
   */
  uploadImage?: (file: File) => Promise<string>;
  /**
   * The shelf this field's pictures live on. Named, the toolbar gains a library door:
   * a member writing about the photo they posted last month can put it in the body
   * without saving it to a disk and uploading it again.
   *
   * The editor still writes nothing but markdown. A pick inserts the address the
   * platform stored, where a freshly uploaded picture's address would have gone, so
   * `uploadImage` stays the only way bytes leave this component — and the caption the
   * member wrote for the picture the first time arrives as the alt text, which is the
   * one part of an inline image nobody wants to type twice.
   */
  galleryPurpose?: MediaPurpose;
  disabled?: boolean;
  id?: string;
}

type Action = (window: EditorWindow) => EditorWindow | null;

/**
 * The post editor: a textarea with the markdown a member actually uses within
 * reach of the keyboard.
 *
 * The text handling lives in `lib/content/markdown-edit.ts` as pure functions, so
 * every button has a test that does not need a browser. This component's job is
 * the part that needs one: keep the selection, restore it after React re-renders,
 * and turn a pasted or dropped picture into a markdown reference.
 */
export function MarkdownEditor({
  label,
  hint,
  value,
  onChange,
  rows = 12,
  maxLength = 60000,
  uploadImage,
  galleryPurpose,
  disabled = false,
  id,
}: MarkdownEditorProps) {
  const { t } = useTranslation();
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingSelection = useRef<{ start: number; end: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const restoreSelection = useCallback(() => {
    const pending = pendingSelection.current;
    const element = textareaRef.current;
    if (!pending || !element) return;
    pendingSelection.current = null;
    element.focus();
    element.setSelectionRange(pending.start, pending.end);
  }, []);

  useEffect(() => {
    restoreSelection();
  }, [value, restoreSelection]);

  const apply = useCallback(
    (action: Action) => {
      const element = textareaRef.current;
      if (!element || disabled) return;
      const window: EditorWindow = {
        value,
        start: element.selectionStart,
        end: element.selectionEnd,
      };
      const next = action(window);
      if (!next) return;
      pendingSelection.current = { start: next.start, end: next.end };
      onChange(next.value);
    },
    [disabled, onChange, value],
  );

  const insertUploaded = useCallback(
    async (files: readonly File[]) => {
      if (!uploadImage || files.length === 0) return;
      setUploading(true);
      setNotice(null);
      try {
        for (const file of files) {
          if (!file.type.startsWith('image/')) {
            setNotice(t('compose.editor.onlyImages'));
            continue;
          }
          const url = await uploadImage(file);
          apply((window) => insertImage(window, url, file.name.replace(/\.[a-z0-9]+$/i, '')));
        }
      } catch {
        setNotice(t('compose.editor.uploadFailed'));
      } finally {
        setUploading(false);
        setNotice(null);
        if (fileRef.current) fileRef.current.value = '';
      }
    },
    [apply, t, uploadImage],
  );

  /**
   * Writes a picture the member already hosted into the text, and uploads nothing.
   *
   * One reference per opening, rather than a multi-select: a body has no image cap for
   * the dialog to respect, and inventing one to make a checkbox reachable would be a
   * limit the member meets for no reason. The caret is where it was, so the next
   * picture in the same paragraph is one more opening away.
   */
  const insertPicked = useCallback(
    (picked: readonly PickedMedia[]) => {
      const first = picked[0];
      if (first === undefined) return;
      // The same picture twice in one body is a mistake more often than a choice, and
      // the shelf already says which of its rows are in this text — so the refusal is
      // said back, in the words the queue uses for it, rather than swallowed.
      if (imageUrls(value).some((url) => isSameMedia(url, first.url))) {
        setNotice(t('media.gallery.alreadyAttached'));
        return;
      }
      setNotice(null);
      apply((window) => insertImage(window, first.url, first.altText));
    },
    [apply, t, value],
  );

  const counts = countText(value);
  const counter = t('compose.editor.counter', {
    words: counts.words,
    characters: counts.characters,
  });

  const tools: { key: string; label: string; icon: React.ReactNode; run: () => void }[] = [
    {
      key: 'bold',
      label: t('compose.editor.bold'),
      icon: <Bold size={15} aria-hidden="true" />,
      run: () => {
        apply((window) => wrapSelection(window, '**', '**', t('compose.editor.placeholderBold')));
      },
    },
    {
      key: 'italic',
      label: t('compose.editor.italic'),
      icon: <Italic size={15} aria-hidden="true" />,
      run: () => {
        apply((window) => wrapSelection(window, '*', '*', t('compose.editor.placeholderItalic')));
      },
    },
    {
      key: 'underline',
      label: t('compose.editor.underline'),
      icon: <UnderlineIcon size={15} aria-hidden="true" />,
      run: () => {
        apply((window) =>
          wrapSelection(window, '<u>', '</u>', t('compose.editor.placeholderText')),
        );
      },
    },
    {
      key: 'strike',
      label: t('compose.editor.strike'),
      icon: <Strikethrough size={15} aria-hidden="true" />,
      run: () => {
        apply((window) => wrapSelection(window, '~~', '~~', t('compose.editor.placeholderText')));
      },
    },
    {
      key: 'h2',
      label: t('compose.editor.heading2'),
      icon: <Heading2 size={15} aria-hidden="true" />,
      run: () => {
        apply((window) => toggleLinePrefix(window, '## '));
      },
    },
    {
      key: 'h3',
      label: t('compose.editor.heading3'),
      icon: <Heading3 size={15} aria-hidden="true" />,
      run: () => {
        apply((window) => toggleLinePrefix(window, '### '));
      },
    },
    {
      key: 'quote',
      label: t('compose.editor.quote'),
      icon: <Quote size={15} aria-hidden="true" />,
      run: () => {
        apply((window) => toggleLinePrefix(window, '> '));
      },
    },
    {
      key: 'ul',
      label: t('compose.editor.bullets'),
      icon: <List size={15} aria-hidden="true" />,
      run: () => {
        apply((window) => toggleLinePrefix(window, '- '));
      },
    },
    {
      key: 'ol',
      label: t('compose.editor.numbers'),
      icon: <ListOrdered size={15} aria-hidden="true" />,
      run: () => {
        apply((window) => toggleLinePrefix(window, '1. '));
      },
    },
    {
      key: 'code',
      label: t('compose.editor.inlineCode'),
      icon: <Code2 size={15} aria-hidden="true" />,
      run: () => {
        apply((window) => wrapSelection(window, '`', '`', t('compose.editor.placeholderCode')));
      },
    },
    {
      key: 'codeblock',
      label: t('compose.editor.codeBlock'),
      icon: <span className="font-mono text-2xs leading-none">{'{}'}</span>,
      run: () => {
        apply((window) => insertCodeBlock(window, ''));
      },
    },
    {
      key: 'link',
      label: t('compose.editor.link'),
      icon: <Link2 size={15} aria-hidden="true" />,
      run: () => {
        apply((window) => insertLink(window));
      },
    },
    {
      key: 'table',
      label: t('compose.editor.table'),
      icon: <Table2 size={15} aria-hidden="true" />,
      run: () => {
        apply((window) => insertTable(window, 3, 2));
      },
    },
  ];

  return (
    <div className="grid gap-1.5">
      <label htmlFor={fieldId} className="text-sm font-medium">
        {label}
      </label>

      <div
        className={cn(
          'overflow-hidden rounded-xl border border-border bg-bg',
          'focus-within:border-primary focus-within:ring-1 focus-within:ring-primary',
        )}
      >
        <div
          role="toolbar"
          aria-label={t('compose.editor.toolbar')}
          aria-controls={fieldId}
          className="flex flex-wrap items-center gap-0.5 border-b border-border bg-surface-2 px-1 py-1"
        >
          {tools.map((tool) => (
            <button
              key={tool.key}
              type="button"
              // A mousedown that moves focus would collapse the selection the
              // button is about to act on, so the press is kept inside the field.
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              onClick={tool.run}
              title={tool.label}
              aria-label={tool.label}
              disabled={disabled}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface hover:text-text disabled:opacity-50"
            >
              {tool.icon}
            </button>
          ))}

          {uploadImage ? (
            <>
              <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
                onChange={(event) => {
                  const files = event.target.files;
                  if (files) void insertUploaded(Array.from(files));
                }}
              />
              <button
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={() => fileRef.current?.click()}
                title={t('compose.editor.insertImage')}
                aria-label={t('compose.editor.insertImage')}
                disabled={disabled || uploading}
                className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs text-muted hover:bg-surface hover:text-text disabled:opacity-50"
              >
                <ImagePlus size={15} aria-hidden="true" />
                {uploading ? t('compose.editor.uploading') : null}
              </button>
            </>
          ) : null}

          {galleryPurpose ? (
            <MediaSourcePicker
              purpose={galleryPurpose}
              showUpload={false}
              compact
              // The body's own pictures, so the shelf shows them as taken: the same
              // address twice in one post is a rendering accident waiting to happen,
              // and the member who wants it twice wants a caption that differs.
              attached={imageUrls(value)}
              disabled={disabled}
              onPick={insertPicked}
              className="h-8 shrink-0 gap-1 px-2 text-xs"
            />
          ) : null}

          <span className="ml-auto pr-1 text-2xs text-muted">{counter}</span>
        </div>

        <textarea
          id={fieldId}
          ref={textareaRef}
          value={value}
          rows={rows}
          maxLength={maxLength}
          disabled={disabled}
          spellCheck
          aria-describedby={`${fieldId}-hint`}
          className="block w-full resize-y border-0 bg-transparent px-3 py-2 font-mono text-sm leading-relaxed text-text outline-none"
          onChange={(event) => {
            onChange(event.target.value);
          }}
          onKeyDown={(event) => {
            const modifier = event.ctrlKey || event.metaKey;
            if (modifier && !event.altKey) {
              const key = event.key.toLowerCase();
              if (key === 'b') {
                event.preventDefault();
                apply((window) =>
                  wrapSelection(window, '**', '**', t('compose.editor.placeholderBold')),
                );
                return;
              }
              if (key === 'i') {
                event.preventDefault();
                apply((window) =>
                  wrapSelection(window, '*', '*', t('compose.editor.placeholderItalic')),
                );
                return;
              }
              if (key === 'k') {
                event.preventDefault();
                apply((window) => insertLink(window));
                return;
              }
              if (key === 'e') {
                event.preventDefault();
                apply((window) =>
                  wrapSelection(window, '`', '`', t('compose.editor.placeholderCode')),
                );
                return;
              }
            }
            if (event.key === 'Enter' && !event.shiftKey) {
              // Only list items are intercepted: everywhere else Enter is Enter.
              const element = event.currentTarget;
              const window: EditorWindow = {
                value,
                start: element.selectionStart,
                end: element.selectionEnd,
              };
              const next = continueLine(window);
              if (next) {
                event.preventDefault();
                pendingSelection.current = { start: next.start, end: next.end };
                onChange(next.value);
              }
            }
          }}
          onPaste={(event) => {
            if (!uploadImage) return;
            const files = Array.from(event.clipboardData.files).filter((file) =>
              file.type.startsWith('image/'),
            );
            if (files.length === 0) return;
            // A screenshot pasted into the composer is a picture, not a filename.
            event.preventDefault();
            void insertUploaded(files);
          }}
          onDrop={(event) => {
            if (!uploadImage) return;
            const files = Array.from(event.dataTransfer.files).filter((file) =>
              file.type.startsWith('image/'),
            );
            if (files.length === 0) return;
            event.preventDefault();
            void insertUploaded(files);
          }}
        />
      </div>

      <p id={`${fieldId}-hint`} className="text-xs text-muted">
        {hint ?? t('compose.editor.hint')}
      </p>
      {notice === null ? null : (
        <p role="alert" className="text-xs text-danger">
          {notice}
        </p>
      )}
    </div>
  );
}
