import {
  Crop,
  FlipHorizontal2,
  FlipVertical2,
  RotateCcw,
  RotateCw,
  SlidersHorizontal,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Chip, IconButton, Modal, SelectField } from '@/design-system';
import { cn } from '@/lib/cn';
import {
  clampCrop,
  cropForRatio,
  type CropRect,
  CROP_PRESETS,
  DEFAULT_EDIT,
  decodeImage,
  displayBoxFor,
  drawPreview,
  estimatedBytes,
  isEditableType,
  isUntouched,
  outputNameFor,
  outputSizeFor,
  outputTypeFor,
  refitCropOnRotate,
  renderEdit,
  SIZE_CHOICES,
  sizeAfterRotation,
  type EditState,
  type Rotation,
} from '@/lib/media/edit';
import { formatBytes } from '@/lib/format';

/** The preview is drawn at this size and scaled down by CSS on narrow screens. */
const PREVIEW_MAX_WIDTH = 640;
const PREVIEW_MAX_HEIGHT = 420;
/** Arrow keys move the crop by this much; holding Shift moves it five times as far. */
const NUDGE = 0.01;

export interface ImageEditorDialogProps {
  open: boolean;
  file: File | null;
  /** The edit this picture already carries, so reopening shows it instead of starting over. */
  initial?: EditState | undefined;
  onClose: () => void;
  /** `null` means nothing was changed and the original bytes should be kept. */
  onApply: (edited: File | null, edit: EditState) => void;
}

type Decoded = {
  source: CanvasImageSource;
  width: number;
  height: number;
  type: string;
};

/**
 * Edit a picture before it is attached.
 *
 * The preview is painted by the same code that produces the upload, so what the
 * member sees is what everybody else will see — no CSS approximation of a crop
 * that then comes out two pixels differently. Nothing is sent anywhere: the
 * canvas lives in the browser and the edited bytes replace the original before
 * the upload starts.
 */
export function ImageEditorDialog({
  open,
  file,
  initial,
  onClose,
  onApply,
}: ImageEditorDialogProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const frameCounter = useRef(0);
  const drag = useRef<{
    mode: 'move' | 'nw' | 'ne' | 'sw' | 'se';
    startX: number;
    startY: number;
    crop: CropRect;
    boxWidth: number;
    boxHeight: number;
  } | null>(null);

  const [decoded, setDecoded] = useState<Decoded | null>(null);
  const [edit, setEdit] = useState<EditState>(initial ?? DEFAULT_EDIT);
  const [ratioId, setRatioId] = useState<string>('free');
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editable = file !== null && isEditableType(file.type);

  // ---------------------------------------------------------------- decode ---
  useEffect(() => {
    if (!open || file === null) return;
    let cancelled = false;
    setDecoded(null);
    setFailed(false);
    setEdit(initial ?? DEFAULT_EDIT);
    setRatioId('free');
    setError(null);
    if (!isEditableType(file.type)) return;
    void decodeImage(file)
      .then((result) => {
        if (!cancelled) setDecoded(result);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
    // `initial` is read when the dialog opens and deliberately not tracked:
    // a parent re-render must not throw away an edit in progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, file]);

  // --------------------------------------------------------------- preview ---
  const box = useMemo(
    () =>
      decoded
        ? displayBoxFor(
            decoded.width,
            decoded.height,
            edit.rotate,
            PREVIEW_MAX_WIDTH,
            PREVIEW_MAX_HEIGHT,
          )
        : { width: 0, height: 0 },
    [decoded, edit.rotate],
  );

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !decoded || box.width === 0) return;
    frameCounter.current += 1;
    const frame = frameCounter.current;
    const handle = requestAnimationFrame(() => {
      if (frame !== frameCounter.current) return;
      drawPreview(canvas, decoded.source, decoded, edit, box);
    });
    return () => cancelAnimationFrame(handle);
  }, [decoded, edit, box]);

  const boxRef = useRef(box);
  boxRef.current = box;

  // ------------------------------------------------------------ crop frame ---
  const ratioValue = useCallback(
    (id: string): number | null => {
      const preset = CROP_PRESETS.find((entry) => entry.id === id);
      if (!preset || preset.ratio === null) return null;
      if (preset.ratio === 0 && decoded) {
        const turned = sizeAfterRotation(decoded.width, decoded.height, edit.rotate);
        return turned.width / Math.max(turned.height, 1);
      }
      return preset.ratio;
    },
    [decoded, edit.rotate],
  );

  function applyPreset(id: string) {
    setRatioId(id);
    if (!decoded) return;
    setEdit((current) => ({
      ...current,
      crop: cropForRatio(current.crop, ratioValue(id), decoded, current.rotate),
    }));
  }

  function rotate(by: 90 | -90) {
    setEdit((current) => {
      const next = (((current.rotate + by) % 360) + 360) % 360;
      const crop = refitCropOnRotate(current.crop, current.rotate, next as Rotation);
      if (!decoded) return { ...current, rotate: next as Rotation, crop };
      // A locked shape stays locked through the turn.
      const ratio = ratioValue(ratioId);
      return {
        ...current,
        rotate: next as Rotation,
        crop: ratio === null ? crop : cropForRatio(crop, ratio, decoded, next as Rotation),
      };
    });
  }

  function onPointerDown(mode: 'move' | 'nw' | 'ne' | 'sw' | 'se', event: ReactPointerEvent) {
    if (!decoded) return;
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    drag.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      crop: { ...edit.crop },
      boxWidth: Math.max(boxRef.current.width, 1),
      boxHeight: Math.max(boxRef.current.height, 1),
    };
  }

  function onPointerMove(event: ReactPointerEvent) {
    const state = drag.current;
    if (!state || !decoded) return;
    const dx = (event.clientX - state.startX) / state.boxWidth;
    const dy = (event.clientY - state.startY) / state.boxHeight;
    const start = state.crop;
    const ratio = ratioValue(ratioId);
    const picture = sizeAfterRotation(decoded.width, decoded.height, edit.rotate);
    const pictureRatio = picture.width / Math.max(picture.height, 1);

    if (state.mode === 'move') {
      setEdit((current) => ({
        ...current,
        crop: clampCrop({ ...start, x: start.x + dx, y: start.y + dy }),
      }));
      return;
    }

    // A corner drag: the moving edge follows the pointer, the opposite edge
    // stays put, and a locked shape decides the second axis instead of the
    // pointer does.
    const right = state.mode === 'ne' || state.mode === 'se';
    const bottom = state.mode === 'sw' || state.mode === 'se';
    const anchorX = right ? start.x : start.x + start.width;
    const anchorY = bottom ? start.y : start.y + start.height;
    let width = Math.abs((right ? start.width + dx : start.width - dx) || 0.01);
    let height = Math.abs((bottom ? start.height + dy : start.height - dy) || 0.01);
    if (ratio !== null && ratio > 0) {
      // Grow whichever axis the pointer moved further, then derive the other.
      const fromWidth = width * pictureRatio;
      const fromHeight = height;
      if (fromWidth >= fromHeight * ratio) {
        height = fromWidth / ratio;
      } else {
        width = (fromHeight * ratio) / pictureRatio;
      }
    }
    width = Math.min(width, 1);
    height = Math.min(height, 1);
    const x = right ? anchorX : Math.min(anchorX, 1 - width);
    const y = bottom ? anchorY : Math.min(anchorY, 1 - height);
    setEdit((current) => ({
      ...current,
      crop: clampCrop({
        x: right ? x : anchorX - width,
        y: bottom ? y : anchorY - height,
        width,
        height,
      }),
    }));
  }

  function endDrag(event: ReactPointerEvent) {
    if (!drag.current) return;
    const target = event.currentTarget as HTMLElement;
    if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
    drag.current = null;
  }

  function nudge(event: ReactKeyboardEvent) {
    const step = event.shiftKey ? NUDGE * 5 : NUDGE;
    const moves: Record<string, { x: number; y: number }> = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    };
    const move = moves[event.key];
    if (event.key === 'Enter' || event.key === ' ') {
      // The one thing a keyboard member can do with a drag handle that a
      // pointer member does by letting go: put the crop back in the middle.
      event.preventDefault();
      setEdit((current) => ({
        ...current,
        crop: clampCrop({
          x: (1 - current.crop.width) / 2,
          y: (1 - current.crop.height) / 2,
          width: current.crop.width,
          height: current.crop.height,
        }),
      }));
      return;
    }
    if (!move) return;
    event.preventDefault();
    setEdit((current) => ({
      ...current,
      crop: clampCrop({
        ...current.crop,
        x: current.crop.x + move.x,
        y: current.crop.y + move.y,
      }),
    }));
  }

  // ------------------------------------------------------------------ apply ---
  async function apply() {
    if (!decoded || file === null) return;
    if (isUntouched(edit)) {
      onApply(null, edit);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const blob = await renderEdit(decoded.source, { ...decoded, type: file.type }, edit);
      const type = outputTypeFor(edit, file.type);
      const edited = new File([blob], outputNameFor(file.name, type), {
        type,
        lastModified: Date.now(),
      });
      onApply(edited, edit);
    } catch {
      setError('media.errors.failed');
    } finally {
      setBusy(false);
    }
  }

  const output = decoded ? outputSizeFor(decoded.width, decoded.height, edit) : null;
  const estimate =
    decoded && file ? estimatedBytes(decoded.width, decoded.height, edit, file.size) : 0;
  const untouched = isUntouched(edit);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('media.editor.title')}
      closeLabel={t('common.close')}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-2xs text-muted">
            {output
              ? t('media.editor.outputSize', {
                  width: output.width,
                  height: output.height,
                  size: formatBytes(estimate, language),
                })
              : t('media.editor.preparing')}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={() => void apply()}
              loading={busy}
              disabled={!decoded}
            >
              {untouched ? t('media.editor.keepOriginal') : t('media.editor.apply')}
            </Button>
          </div>
        </div>
      }
    >
      {!editable ? (
        <Alert tone="warning" title={t('media.editor.notEditableTitle')}>
          {t('media.editor.notEditable')}
        </Alert>
      ) : failed ? (
        <Alert tone="danger" title={t('media.editor.cannotOpenTitle')}>
          {t('media.editor.cannotOpen')}
        </Alert>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-center rounded-xl bg-surface-2 p-2">
            {decoded ? (
              <div className="relative inline-block max-w-full touch-none select-none">
                <canvas
                  ref={canvasRef}
                  className="block h-auto max-w-full rounded-lg"
                  style={{ width: box.width, height: box.height }}
                  aria-label={t('media.editor.preview')}
                  role="img"
                />
                <div className="pointer-events-none absolute inset-0">
                  <div
                    aria-hidden="true"
                    className="absolute inset-0"
                    style={{
                      boxShadow: '0 0 0 9999px rgba(6, 26, 18, 0.55)',
                      clipPath: `polygon(evenodd, 0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, ${edit.crop.x * 100}% ${edit.crop.y * 100}%, ${edit.crop.x * 100}% ${(edit.crop.y + edit.crop.height) * 100}%, ${(edit.crop.x + edit.crop.width) * 100}% ${(edit.crop.y + edit.crop.height) * 100}%, ${(edit.crop.x + edit.crop.width) * 100}% ${edit.crop.y * 100}%, ${edit.crop.x * 100}% ${edit.crop.y * 100}%)`,
                    }}
                  />
                </div>
                <div
                  ref={frameRef}
                  role="button"
                  tabIndex={0}
                  aria-label={t('media.editor.cropRegion')}
                  aria-describedby="bsdc-crop-help"
                  onKeyDown={nudge}
                  onPointerDown={(event) => onPointerDown('move', event)}
                  onPointerMove={onPointerMove}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  className="absolute cursor-move rounded-sm border-2 border-white/90 shadow-[0_0_0_1px_rgba(6,26,18,0.4)] outline-none focus-visible:border-green-300"
                  style={{
                    left: `${edit.crop.x * 100}%`,
                    top: `${edit.crop.y * 100}%`,
                    width: `${edit.crop.width * 100}%`,
                    height: `${edit.crop.height * 100}%`,
                  }}
                >
                  {(
                    [
                      ['nw', '-left-2 -top-2 cursor-nwse-resize'],
                      ['ne', '-right-2 -top-2 cursor-nesw-resize'],
                      ['sw', '-bottom-2 -left-2 cursor-nesw-resize'],
                      ['se', '-bottom-2 -right-2 cursor-nwse-resize'],
                    ] as const
                  ).map(([corner, position]) => (
                    <span
                      key={corner}
                      onPointerDown={(event) => onPointerDown(corner, event)}
                      onPointerMove={onPointerMove}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                      className={cn(
                        'absolute h-4 w-4 rounded-full border-2 border-green-700 bg-white shadow-card',
                        position,
                      )}
                    />
                  ))}
                  {/* Thirds, because that is what a crop is judged against. */}
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-0 left-1/3 w-px bg-white/35"
                  />
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-0 left-2/3 w-px bg-white/35"
                  />
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 top-1/3 h-px bg-white/35"
                  />
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 top-2/3 h-px bg-white/35"
                  />
                </div>
              </div>
            ) : (
              <div
                className="flex items-center justify-center text-sm text-muted"
                style={{ width: PREVIEW_MAX_WIDTH, height: 180, maxWidth: '100%' }}
              >
                {t('media.editor.preparing')}
              </div>
            )}
          </div>

          {error ? (
            <Alert tone="danger" title={t('media.editor.failedTitle')}>
              {t(error)}
            </Alert>
          ) : null}

          <p id="bsdc-crop-help" className="text-2xs text-muted">
            {t('media.editor.cropHelp')}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <IconButton
              label={t('media.editor.rotateLeft')}
              icon={<RotateCcw size={18} />}
              variant="outline"
              size="sm"
              onClick={() => rotate(-90)}
              disabled={!decoded}
            />
            <IconButton
              label={t('media.editor.rotateRight')}
              icon={<RotateCw size={18} />}
              variant="outline"
              size="sm"
              onClick={() => rotate(90)}
              disabled={!decoded}
            />
            <IconButton
              label={t('media.editor.flipHorizontal')}
              icon={<FlipHorizontal2 size={18} />}
              variant="outline"
              size="sm"
              onClick={() =>
                setEdit((current) => ({ ...current, flipHorizontal: !current.flipHorizontal }))
              }
              disabled={!decoded}
            />
            <IconButton
              label={t('media.editor.flipVertical')}
              icon={<FlipVertical2 size={18} />}
              variant="outline"
              size="sm"
              onClick={() =>
                setEdit((current) => ({ ...current, flipVertical: !current.flipVertical }))
              }
              disabled={!decoded}
            />
            <IconButton
              label={t('media.editor.reset')}
              icon={<SlidersHorizontal size={18} />}
              variant="outline"
              size="sm"
              onClick={() => {
                setEdit({ ...DEFAULT_EDIT });
                setRatioId('free');
              }}
              disabled={!decoded}
            />
          </div>

          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
              <Crop size={14} aria-hidden="true" />
              {t('media.editor.cropShape')}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {CROP_PRESETS.map((preset) => (
                <Chip
                  key={preset.id}
                  selected={ratioId === preset.id}
                  onClick={() => applyPreset(preset.id)}
                  disabled={!decoded}
                >
                  {t(`media.editor.ratios.${preset.id}`)}
                </Chip>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                ['brightness', t('media.editor.brightness')],
                ['contrast', t('media.editor.contrast')],
                ['saturation', t('media.editor.saturation')],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block">
                <span className="mb-1 flex items-center justify-between text-sm font-medium">
                  {label}
                  <span className="text-2xs tabular-nums text-muted">
                    {Math.round((edit[key] - 1) * 100)}%
                  </span>
                </span>
                <input
                  type="range"
                  min={40}
                  max={180}
                  step={1}
                  value={Math.round(edit[key] * 100)}
                  disabled={!decoded}
                  onChange={(event) =>
                    setEdit((current) => ({
                      ...current,
                      [key]: Number(event.target.value) / 100,
                    }))
                  }
                  className="h-2 w-full cursor-pointer appearance-none rounded-full bg-surface-2 accent-green-700"
                />
              </label>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField
              label={t('media.editor.longestEdge')}
              value={String(edit.maxWidth)}
              disabled={!decoded}
              onChange={(event) =>
                setEdit((current) => ({ ...current, maxWidth: Number(event.target.value) }))
              }
              options={SIZE_CHOICES.map((choice) => ({
                value: String(choice),
                label:
                  choice === 0
                    ? t('media.editor.sizes.original')
                    : t('media.editor.sizes.pixels', { pixels: choice }),
              }))}
              hint={t('media.editor.longestEdgeHint')}
            />
            <SelectField
              label={t('media.editor.format')}
              value={edit.format}
              disabled={!decoded}
              onChange={(event) =>
                setEdit((current) => ({
                  ...current,
                  format: event.target.value as EditState['format'],
                }))
              }
              options={[
                { value: 'source', label: t('media.editor.formats.source') },
                { value: 'image/jpeg', label: t('media.editor.formats.jpeg') },
                { value: 'image/webp', label: t('media.editor.formats.webp') },
              ]}
              hint={t('media.editor.formatHint')}
            />
          </div>
        </div>
      )}
    </Modal>
  );
}
