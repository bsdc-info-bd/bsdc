/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
/**
 * Cloudinary direct-upload utilities (unsigned presets — 100% client-side).
 *
 * - Images  → /image/upload (avatars, post images, chat photos)
 * - Voice notes (audio/webm, audio/mp4) → /auto/upload
 * - PDFs and other raw files → /auto/upload
 *
 * Everything runs in the browser with XHR so we get real upload progress.
 * No backend, no Node, no Cloudflare Workers.
 */
import { CLOUDINARY_CLOUD, CLOUDINARY_UPLOAD_PRESET } from '@/config/constants';

export type CloudinaryResource = 'image' | 'auto';

export interface UploadResult {
  url: string;
  provider: 'cloudinary';
  publicId: string;
  bytes: number;
  format: string;
  resourceType: string;
}

export interface UploadOptions {
  folder?: string;
  onProgress?: (percent: number) => void;
}

function cloudinaryEndpoint(resource: CloudinaryResource): string {
  return `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/${resource}/upload`;
}

/** Core unsigned uploader for any resource type, with progress events. */
export function uploadToCloudinaryRaw(
  file: File | Blob,
  resource: CloudinaryResource,
  options: UploadOptions = {},
  filename?: string,
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file, filename || (file instanceof File ? file.name : 'blob'));
    form.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    form.append('folder', options.folder || 'bsdc/misc');

    const xhr = new XMLHttpRequest();
    xhr.open('POST', cloudinaryEndpoint(resource));
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && options.onProgress) {
        options.onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      try {
        const res = JSON.parse(xhr.responseText) as {
          secure_url?: string;
          public_id?: string;
          bytes?: number;
          format?: string;
          resource_type?: string;
          error?: { message: string };
        };
        if (xhr.status >= 200 && xhr.status < 300 && res.secure_url) {
          resolve({
            url: res.secure_url,
            provider: 'cloudinary',
            publicId: res.public_id || '',
            bytes: res.bytes || file.size,
            format: res.format || '',
            resourceType: res.resource_type || String(resource),
          });
        } else {
          reject(new Error(res.error?.message || `Cloudinary upload failed (${xhr.status})`));
        }
      } catch {
        reject(new Error(`Cloudinary upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error('Cloudinary network error'));
    xhr.onabort = () => reject(new Error('Upload cancelled'));
    xhr.send(form);
  });
}

/** Upload a recorded voice-note blob (webm/opus, mp4…). */
export async function uploadVoiceNote(
  blob: Blob,
  durationSec: number,
  onProgress?: (percent: number) => void,
): Promise<UploadResult & { duration: number }> {
  const ext = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm';
  const result = await uploadToCloudinaryRaw(
    blob,
    'auto',
    { folder: 'bsdc/chat/voice', onProgress },
    `voice-${Date.now()}.${ext}`,
  );
  return { ...result, duration: Math.round(durationSec) };
}

/** Upload a PDF (or any raw file) for sharing in chat. */
export async function uploadPdf(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<UploadResult> {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('Only PDF files can be shared');
  }
  if (file.size > 20 * 1024 * 1024) throw new Error('PDF must be under 20 MB');
  return uploadToCloudinaryRaw(file, 'auto', { folder: 'bsdc/chat/files', onProgress }, file.name);
}

/** Format seconds as m:ss for voice notes. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/** Human-readable byte size for file attachments. */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}
