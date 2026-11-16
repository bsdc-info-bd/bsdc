import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from 'react';
import { Banner, Button, Field, Select, useCorporateEnv } from '@kit';
import {
  AD_ASPECT_PRESETS,
  DEFAULT_AD_IMAGE_EDIT,
  EDITABLE_AD_IMAGE_TYPES,
  clampCrop,
  decodeAdImageFile,
  fitCropToRatio,
  outputDimensions,
  paintFullStagePreview,
  renderEditedAdImage,
  uploadAdCreativeImage,
  type AdImageEdit,
  type CropRect,
  type DecodedAdImage,
  type Rotation,
} from './ad-media';
import { isImgbbUrl } from './campaigns';

export interface AdImageFieldProps {
  imageUrl: string;
  thumbUrl: string;
  imageAlt: string;
  error?: string | undefined;
  onChange: (next: { imageUrl: string; thumbUrl: string; imageAlt: string }) => void;
}

/**
 * Staff image selector for ad creatives: upload & crop/filter via ImgBB proxy
 * or paste an existing ImgBB HTTPS image URL.
 */
export function AdImageField({
  imageUrl,
  thumbUrl,
  imageAlt,
  error,
  onChange,
}: AdImageFieldProps): ReactElement {
  const env = useCorporateEnv();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function uploadDirect(file: File): Promise<void> {
    setUploading(true);
    setUploadError(null);
    try {
      const uploaded = await uploadAdCreativeImage(env, file);
      onChange({ imageUrl: uploaded.url, thumbUrl: uploaded.thumbUrl, imageAlt });
      setSelectedFile(null);
    } catch (failure) {
      setUploadError(failure instanceof Error ? failure.message : 'ImgBB upload failed.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="kit-stack" style={{ gap: 'var(--sp-2)' }}>
      <div className="kit-grid kit-grid--2">
        <Field
          label="Image URL (ImgBB)"
          value={imageUrl}
          hint="Upload a file below or paste a direct https://i.ibb.co/... image URL."
          error={error}
          onChange={(event) => {
            const nextUrl = event.target.value;
            onChange({
              imageUrl: nextUrl,
              thumbUrl: thumbUrl === imageUrl || thumbUrl === '' ? nextUrl : thumbUrl,
              imageAlt,
            });
          }}
        />
        <Field
          label="Image alt text"
          value={imageAlt}
          maxLength={200}
          hint="Describes the image for screen readers and accessibility."
          onChange={(event) => onChange({ imageUrl, thumbUrl, imageAlt: event.target.value })}
        />
      </div>

      <div className="kit-row" style={{ alignItems: 'center' }}>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
          style={{ display: 'none' }}
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            event.target.value = '';
            if (!file) return;
            setUploadError(null);
            if (EDITABLE_AD_IMAGE_TYPES.includes(file.type)) {
              setSelectedFile(file);
            } else {
              void uploadDirect(file);
            }
          }}
        />
        <Button
          type="button"
          size="small"
          variant="quiet"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? 'Uploading to ImgBB…' : 'Upload & crop image'}
        </Button>
        {imageUrl.trim() !== '' ? (
          <Button
            type="button"
            size="small"
            variant="quiet"
            disabled={uploading}
            onClick={() => onChange({ imageUrl: '', thumbUrl: '', imageAlt })}
          >
            Remove image
          </Button>
        ) : null}
        {isImgbbUrl(imageUrl) ? (
          <img
            src={thumbUrl || imageUrl}
            alt={imageAlt || 'Uploaded creative image'}
            className="kit-ad-thumb"
          />
        ) : null}
      </div>

      {uploadError !== null ? (
        <Banner tone="bad" title="Image upload failed">
          <p className="kit-small">{uploadError}</p>
        </Banner>
      ) : null}

      {selectedFile !== null ? (
        <AdImageEditorModal
          file={selectedFile}
          busy={uploading}
          error={uploadError}
          onClose={() => {
            if (!uploading) setSelectedFile(null);
          }}
          onUpload={(fileToSend) => void uploadDirect(fileToSend)}
        />
      ) : null}
    </div>
  );
}

function AdImageEditorModal({
  file,
  busy,
  error,
  onClose,
  onUpload,
}: {
  file: File;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onUpload: (file: File) => void;
}): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [decoded, setDecoded] = useState<DecodedAdImage | null>(null);
  const [decodeError, setDecodeError] = useState<string | null>(null);
  const [edit, setEdit] = useState<AdImageEdit>(DEFAULT_AD_IMAGE_EDIT);
  const [ratioId, setRatioId] = useState('free');
  const [stageBox, setStageBox] = useState({ width: 0, height: 0 });
  const drag = useRef<{
    mode: 'move' | 'se';
    startX: number;
    startY: number;
    crop: CropRect;
  } | null>(null);

  useEffect(() => {
    let active = true;
    let loaded: DecodedAdImage | null = null;
    setDecodeError(null);
    void decodeAdImageFile(file)
      .then((res) => {
        if (!active) {
          res.revoke();
          return;
        }
        loaded = res;
        setDecoded(res);
      })
      .catch((failure: unknown) => {
        if (active) {
          setDecodeError(failure instanceof Error ? failure.message : 'Unable to open image.');
        }
      });
    return () => {
      active = false;
      loaded?.revoke();
    };
  }, [file]);

  useEffect(() => {
    if (!decoded || !canvasRef.current) return;
    const box = paintFullStagePreview(canvasRef.current, decoded, edit);
    setStageBox(box);
  }, [decoded, edit]);

  const outSize = useMemo(
    () => (decoded ? outputDimensions(decoded.width, decoded.height, edit) : null),
    [decoded, edit],
  );

  function selectPreset(id: string): void {
    setRatioId(id);
    if (!decoded) return;
    const preset = AD_ASPECT_PRESETS.find((entry) => entry.id === id);
    setEdit((prev) => ({
      ...prev,
      crop: fitCropToRatio(
        prev.crop,
        preset?.ratio ?? null,
        decoded.width,
        decoded.height,
        prev.rotate,
      ),
    }));
  }

  function rotateRight(): void {
    setEdit((prev) => ({
      ...prev,
      rotate: ((prev.rotate + 90) % 360) as Rotation,
      crop: { x: 0, y: 0, width: 1, height: 1 },
    }));
    setRatioId('free');
  }

  function startPointer(mode: 'move' | 'se', event: ReactPointerEvent): void {
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    drag.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      crop: edit.crop,
    };
  }

  function movePointer(event: ReactPointerEvent): void {
    const state = drag.current;
    if (!state || stageBox.width <= 0 || stageBox.height <= 0) return;
    const dx = (event.clientX - state.startX) / stageBox.width;
    const dy = (event.clientY - state.startY) / stageBox.height;
    if (state.mode === 'move') {
      setEdit((prev) => ({
        ...prev,
        crop: clampCrop({ ...state.crop, x: state.crop.x + dx, y: state.crop.y + dy }),
      }));
      return;
    }
    const preset = AD_ASPECT_PRESETS.find((entry) => entry.id === ratioId);
    let nextWidth = Math.min(1 - state.crop.x, Math.max(0.1, state.crop.width + dx));
    let nextHeight = Math.min(1 - state.crop.y, Math.max(0.1, state.crop.height + dy));
    if (preset?.ratio && decoded) {
      const picRatio = stageBox.width / Math.max(1, stageBox.height);
      const normRatio = preset.ratio / picRatio;
      nextHeight = nextWidth / normRatio;
      if (state.crop.y + nextHeight > 1) {
        nextHeight = 1 - state.crop.y;
        nextWidth = nextHeight * normRatio;
      }
    }
    setEdit((prev) => ({
      ...prev,
      crop: clampCrop({ ...state.crop, width: nextWidth, height: nextHeight }),
    }));
  }

  function endPointer(event: ReactPointerEvent): void {
    if (!drag.current) return;
    const el = event.currentTarget as HTMLElement;
    if (el.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId);
    drag.current = null;
  }

  async function applyAndUpload(): Promise<void> {
    if (!decoded) return;
    const edited = await renderEditedAdImage(file.name, decoded, edit);
    onUpload(edited);
  }

  return (
    <div className="kit-modal-backdrop" role="dialog" aria-modal="true" aria-label="Edit ad image">
      <div className="kit-modal">
        <div className="kit-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>Crop and prepare ad image</strong>
          <Button type="button" size="small" variant="quiet" disabled={busy} onClick={onClose}>
            Close
          </Button>
        </div>

        {decodeError !== null ? (
          <Banner tone="bad" title="Could not load image">
            <p className="kit-small">{decodeError}</p>
          </Banner>
        ) : (
          <div className="kit-crop-box">
            <div className="kit-crop-stage">
              <canvas ref={canvasRef} style={{ display: 'block', maxWidth: '100%' }} />
              {stageBox.width > 0 ? (
                <div
                  onPointerDown={(event) => startPointer('move', event)}
                  onPointerMove={movePointer}
                  onPointerUp={endPointer}
                  onPointerCancel={endPointer}
                  style={{
                    position: 'absolute',
                    left: `${edit.crop.x * 100}%`,
                    top: `${edit.crop.y * 100}%`,
                    width: `${edit.crop.width * 100}%`,
                    height: `${edit.crop.height * 100}%`,
                    border: '2px solid #ffffff',
                    boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.5)',
                    cursor: 'move',
                  }}
                >
                  <span
                    onPointerDown={(event) => startPointer('se', event)}
                    onPointerMove={movePointer}
                    onPointerUp={endPointer}
                    onPointerCancel={endPointer}
                    className="kit-crop-handle"
                    style={{ right: -7, bottom: -7, cursor: 'nwse-resize' }}
                  />
                </div>
              ) : null}
            </div>
          </div>
        )}

        <div className="kit-row">
          {AD_ASPECT_PRESETS.map((preset) => (
            <Button
              key={preset.id}
              type="button"
              size="small"
              variant={ratioId === preset.id ? 'primary' : 'quiet'}
              disabled={busy || !decoded}
              onClick={() => selectPreset(preset.id)}
            >
              {preset.label}
            </Button>
          ))}
          <Button
            type="button"
            size="small"
            variant="quiet"
            disabled={busy || !decoded}
            onClick={rotateRight}
          >
            Rotate 90°
          </Button>
          <Button
            type="button"
            size="small"
            variant="quiet"
            disabled={busy || !decoded}
            onClick={() => setEdit((prev) => ({ ...prev, flipHorizontal: !prev.flipHorizontal }))}
          >
            Flip
          </Button>
          <Button
            type="button"
            size="small"
            variant="quiet"
            disabled={busy || !decoded}
            onClick={() => {
              setEdit(DEFAULT_AD_IMAGE_EDIT);
              setRatioId('free');
            }}
          >
            Reset
          </Button>
        </div>

        <div className="kit-grid kit-grid--3">
          {(
            [
              ['brightness', 'Brightness'],
              ['contrast', 'Contrast'],
              ['saturation', 'Saturation'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="kit-small">
              {label} ({Math.round(edit[key] * 100)}%)
              <input
                type="range"
                min={50}
                max={160}
                value={Math.round(edit[key] * 100)}
                disabled={busy || !decoded}
                onChange={(event) =>
                  setEdit((prev) => ({ ...prev, [key]: Number(event.target.value) / 100 }))
                }
                style={{ width: '100%' }}
              />
            </label>
          ))}
        </div>

        <div className="kit-grid kit-grid--2">
          <Select
            label="Output max size"
            value={String(edit.maxWidth)}
            options={[
              { value: '1200', label: '1200 px (recommended)' },
              { value: '800', label: '800 px (compact)' },
              { value: '0', label: 'Original dimensions' },
            ]}
            onChange={(event) =>
              setEdit((prev) => ({ ...prev, maxWidth: Number(event.target.value) }))
            }
          />
          <Select
            label="Output format"
            value={edit.format}
            options={[
              { value: 'image/webp', label: 'WebP (smaller, crisp)' },
              { value: 'image/jpeg', label: 'JPEG (universal)' },
            ]}
            onChange={(event) =>
              setEdit((prev) => ({
                ...prev,
                format: event.target.value === 'image/jpeg' ? 'image/jpeg' : 'image/webp',
              }))
            }
          />
        </div>

        {error !== null ? (
          <Banner tone="bad" title="Upload failed">
            <p className="kit-small">{error}</p>
          </Banner>
        ) : null}

        <div className="kit-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="kit-small kit-muted">
            {outSize ? `Output ${outSize.width} × ${outSize.height} px` : 'Preparing preview…'}
          </span>
          <div className="kit-row">
            <Button
              type="button"
              size="small"
              variant="quiet"
              disabled={busy}
              onClick={() => onUpload(file)}
            >
              Upload original
            </Button>
            <Button
              type="button"
              size="small"
              disabled={busy || !decoded}
              onClick={() => void applyAndUpload()}
            >
              {busy ? 'Uploading…' : 'Apply & upload to ImgBB'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
