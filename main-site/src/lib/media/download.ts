import { isRepairableMediaHost } from './hosts';
import { proxyUrlFor } from './resilience';

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
};

const EXT_PATTERN = /\.(jpe?g|png|webp|gif|avif|svg)(?:$|[?#])/i;

function normalizeMediaUrl(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return '';
  if (trimmed.startsWith('/')) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' && isRepairableMediaHost(parsed.hostname)) {
      parsed.protocol = 'https:';
    }
    return parsed.toString();
  } catch {
    return trimmed;
  }
}

/**
 * Picks a predictable filename with a real image extension so browsers save
 * the file cleanly instead of falling back to "download" with no suffix.
 */
export function suggestImageFilename(
  url: string,
  mimeType?: string | null,
  label?: string,
): string {
  const cleanMime = (mimeType ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  const mimeExt = MIME_TO_EXT[cleanMime];
  const urlMatch = url.match(EXT_PATTERN);
  const urlExt = urlMatch?.[1]?.toLowerCase() === 'jpeg' ? 'jpg' : urlMatch?.[1]?.toLowerCase();
  const ext = mimeExt ?? urlExt ?? 'jpg';

  const baseRaw = (label ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

  const stem = baseRaw.length >= 3 ? baseRaw : `bsdc-image-${Date.now().toString(36)}`;
  return `${stem}.${ext}`;
}

/**
 * Returns fetch URL candidates in priority order. For ImgBB/repairable hosts,
 * our same-origin `/media/i` edge proxy comes first because it emits `CORS: *`
 * and 7-day edge caching; direct fetch is kept as fallback.
 */
export function buildDownloadCandidates(rawUrl: string): string[] {
  const normalized = normalizeMediaUrl(rawUrl);
  if (normalized.length === 0) return [];
  if (normalized.startsWith('/')) return [normalized];

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol === 'https:' && isRepairableMediaHost(parsed.hostname)) {
      return [proxyUrlFor(normalized), normalized];
    }
    return [normalized];
  } catch {
    return [normalized];
  }
}

/**
 * Fetches an image as a Blob so cross-origin URLs (where browsers ignore the
 * `<a download>` attribute and navigate instead) actually save to disk. Falls
 * back to opening in a new tab only when all CORS-capable fetches fail.
 */
export async function downloadImage(rawUrl: string, label?: string): Promise<void> {
  const candidates = buildDownloadCandidates(rawUrl);
  if (candidates.length === 0) throw new Error('media.lightbox.downloadFailed');

  let downloadedBlob: Blob | null = null;
  let mimeType = '';

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, { mode: 'cors' });
      if (!response.ok) continue;
      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('text/html') || contentType.includes('application/json')) {
        continue;
      }
      const blob = await response.blob();
      if (blob.size === 0) continue;
      downloadedBlob = blob;
      mimeType = blob.type || contentType;
      break;
    } catch {
      continue;
    }
  }

  if (downloadedBlob === null) {
    const fallbackUrl = normalizeMediaUrl(rawUrl);
    if (typeof window !== 'undefined' && fallbackUrl.length > 0) {
      window.open(fallbackUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    throw new Error('media.lightbox.downloadFailed');
  }

  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return;

  const objectUrl = URL.createObjectURL(downloadedBlob);
  try {
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = suggestImageFilename(rawUrl, mimeType, label);
    anchor.rel = 'noopener noreferrer';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    window.setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
    }, 30_000);
  }
}
