/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
/**
 * Chat image preview + editor (pure client-side canvas):
 *   rotate ±90°, horizontal flip, brightness / contrast / saturation sliders,
 *   grayscale toggle, center-crop aspect presets, zoom crop.
 * Returns the edited image as a JPEG blob ready for Cloudinary upload.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  RotateCcw, RotateCw, FlipHorizontal, Sun, Contrast, Palette, Maximize, Crop,
  Undo2, Send, Loader2,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export interface ImageEditState {
  rotation: 0 | 90 | 180 | 270;
  flipH: boolean;
  brightness: number; // 0.5..1.5
  contrast: number; // 0.5..1.5
  saturate: number; // 0..2
  grayscale: boolean;
  aspect: 'original' | 'square' | 'portrait' | 'wide';
  zoom: number; // 1..2 (center crop)
}

const DEFAULT_STATE: ImageEditState = {
  rotation: 0,
  flipH: false,
  brightness: 1,
  contrast: 1,
  saturate: 1,
  grayscale: false,
  aspect: 'original',
  zoom: 1,
};

const ASPECTS: Record<ImageEditState['aspect'], number | null> = {
  original: null,
  square: 1,
  portrait: 4 / 5,
  wide: 16 / 9,
};

export function ImageEditorModal({
  open,
  file,
  onOpenChange,
  onSend,
}: {
  open: boolean;
  file: File | null;
  onOpenChange: (o: boolean) => void;
  onSend: (edited: File) => void;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<ImageEditState>(DEFAULT_STATE);
  const [objectUrl, setObjectUrl] = useState('');
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [sending, setSending] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!open || !file) {
      setObjectUrl('');
      setImg(null);
      setState(DEFAULT_STATE);
      setShowAdjust(false);
      return;
    }
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    const image = new Image();
    image.onload = () => setImg(image);
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [open, file]);

  // Re-render the canvas whenever image or edit state changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const swap = state.rotation === 90 || state.rotation === 270;
    const srcW = img.naturalWidth;
    const srcH = img.naturalHeight;

    // Apply center-crop for aspect + zoom first.
    let cropW = srcW;
    let cropH = srcH;
    const aspect = ASPECTS[state.aspect];
    if (aspect) {
      if (srcW / srcH > aspect) {
        cropW = srcH * aspect;
      } else {
        cropH = srcW / aspect;
      }
    }
    cropW /= state.zoom;
    cropH /= state.zoom;
    const cropX = (srcW - cropW) / 2;
    const cropY = (srcH - cropH) / 2;

    const maxDim = 1440;
    const scale = Math.min(1, maxDim / Math.max(cropW, cropH));
    canvas.width = Math.round((swap ? cropH : cropW) * scale);
    canvas.height = Math.round((swap ? cropW : cropH) * scale);

    ctx.save();
    ctx.filter = `brightness(${state.brightness}) contrast(${state.contrast}) saturate(${state.saturate}) ${state.grayscale ? 'grayscale(1)' : ''}`;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((state.rotation * Math.PI) / 180);
    ctx.scale(state.flipH ? -1 : 1, 1);
    const drawW = (swap ? cropH : cropW) * scale;
    const drawH = (swap ? cropW : cropH) * scale;
    ctx.drawImage(img, cropX, cropY, cropW, cropH, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();
  }, [img, state]);

  function reset() {
    setState(DEFAULT_STATE);
    setShowAdjust(false);
  }

  async function send() {
    const canvas = canvasRef.current;
    if (!canvas || !file) return;
    setSending(true);
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9));
      if (!blob) throw new Error('Edit failed');
      const edited = new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
      onSend(edited);
      onOpenChange(false);
    } catch {
      toast.error('Could not process the image');
    } finally {
      setSending(false);
    }
  }

  const ToolButton = ({ label, onClick, active, children, disabled }: { label: string; onClick: () => void; active?: boolean; disabled?: boolean; children: React.ReactNode }) => (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={cn(
        'bsdc-tap flex flex-col items-center gap-1 rounded-xl px-3 py-2 text-[10px] font-semibold transition-colors',
        active ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300' : 'text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-surface-dark-raised',
        disabled && 'pointer-events-none opacity-40',
      )}
    >
      {children}
    </button>
  );

  return (
    <Modal
      open={open && Boolean(img)}
      onOpenChange={(o) => !o && onOpenChange(false)}
      title={t('chat.imageEditor')}
      description={file?.name}
      size="lg"
      footer={
        <>
          <Button variant="ghost" icon={<Undo2 className="h-4 w-4" aria-hidden />} onClick={reset}>
            {t('chat.editorReset')}
          </Button>
          <Button loading={sending} icon={<Send className="h-4 w-4" aria-hidden />} onClick={() => void send()}>
            {t('common.send')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="bsdc-checker flex max-h-[46vh] items-center justify-center overflow-hidden rounded-2xl bg-neutral-100 dark:bg-neutral-900">
          <canvas ref={canvasRef} className="bsdc-scale-in max-h-[46vh] w-auto max-w-full rounded-xl object-contain shadow-md" aria-label={t('chat.imageEditor')} />
        </div>

        {/* Transform tools */}
        <div className="bsdc-scroll-x flex items-center justify-start gap-1 overflow-x-auto rounded-xl border border-surface-light-border p-1 dark:border-surface-dark-border sm:justify-center">
          <ToolButton label={t('chat.rotateLeft')} onClick={() => setState((s) => ({ ...s, rotation: (((s.rotation + 270) % 360) as ImageEditState['rotation']) }))}>
            <RotateCcw className="h-5 w-5" aria-hidden />
          </ToolButton>
          <ToolButton label={t('chat.rotateRight')} onClick={() => setState((s) => ({ ...s, rotation: (((s.rotation + 90) % 360) as ImageEditState['rotation']) }))}>
            <RotateCw className="h-5 w-5" aria-hidden />
          </ToolButton>
          <ToolButton label={t('chat.flip')} active={state.flipH} onClick={() => setState((s) => ({ ...s, flipH: !s.flipH }))}>
            <FlipHorizontal className="h-5 w-5" aria-hidden />
          </ToolButton>
          <span className="mx-1 h-8 w-px shrink-0 bg-surface-light-border dark:bg-surface-dark-border" aria-hidden />
          {(['original', 'square', 'portrait', 'wide'] as const).map((a) => (
            <ToolButton key={a} label={a} active={state.aspect === a} onClick={() => setState((s) => ({ ...s, aspect: a }))}>
              <Crop className="h-5 w-5" aria-hidden />
              <span className="capitalize">{a === 'portrait' ? '4:5' : a === 'wide' ? '16:9' : a === 'square' ? '1:1' : 'Original'}</span>
            </ToolButton>
          ))}
          <span className="mx-1 h-8 w-px shrink-0 bg-surface-light-border dark:bg-surface-dark-border" aria-hidden />
          <ToolButton label={t('chat.zoom')} active={state.zoom > 1} onClick={() => setState((s) => ({ ...s, zoom: s.zoom >= 2 ? 1 : Math.min(2, s.zoom + 0.25) }))} disabled={state.aspect === 'original'}>
            <Maximize className="h-5 w-5" aria-hidden />
            <span>{state.zoom.toFixed(2)}×</span>
          </ToolButton>
          <ToolButton label={t('chat.adjust')} active={showAdjust} onClick={() => setShowAdjust((v) => !v)}>
            {showAdjust ? <Palette className="h-5 w-5" aria-hidden /> : <Sun className="h-5 w-5" aria-hidden />}
            <span>{t('chat.adjust')}</span>
          </ToolButton>
        </div>

        {/* Adjust sliders */}
        {showAdjust ? (
          <div className="bsdc-scale-in grid gap-3 rounded-xl border border-surface-light-border p-3 dark:border-surface-dark-border sm:grid-cols-3">
            {(
              [
                { key: 'brightness', label: t('chat.brightness'), icon: Sun, min: 0.5, max: 1.5 },
                { key: 'contrast', label: t('chat.contrast'), icon: Contrast, min: 0.5, max: 1.5 },
                { key: 'saturate', label: t('chat.saturate'), icon: Palette, min: 0, max: 2 },
              ] as const
            ).map((slider) => (
              <label key={slider.key} className="block text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                <span className="mb-1 flex items-center gap-1.5">
                  <slider.icon className="h-3.5 w-3.5" aria-hidden />
                  {slider.label} · {state[slider.key].toFixed(2)}
                </span>
                <input
                  type="range"
                  min={slider.min}
                  max={slider.max}
                  step={0.05}
                  value={state[slider.key]}
                  onChange={(e) => setState((s) => ({ ...s, [slider.key]: Number(e.target.value) }))}
                  className="w-full accent-brand-600"
                  aria-label={slider.label}
                />
              </label>
            ))}
            <label className="flex items-center gap-2 text-xs font-semibold text-neutral-500 dark:text-neutral-400">
              <input
                type="checkbox"
                checked={state.grayscale}
                onChange={(e) => setState((s) => ({ ...s, grayscale: e.target.checked }))}
                className="h-4 w-4 accent-brand-600"
              />
              {t('chat.grayscale')}
            </label>
          </div>
        ) : null}

        {sending ? (
          <p className="flex items-center justify-center gap-2 text-xs text-neutral-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            {t('common.saving')}
          </p>
        ) : null}
        {objectUrl ? null : null}
      </div>
    </Modal>
  );
}
