/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { CLOUDINARY_CLOUD, CLOUDINARY_UPLOAD_PRESET } from './constants';

const UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`;

export interface UploadResult {
  url: string;
  provider: 'cloudinary' | 'imgbb';
  publicId: string;
  width: number;
  height: number;
  bytes: number;
}

export interface UploadOptions {
  folder?: string;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

/**
 * Unsigned upload to Cloudinary via XHR (progress events supported).
 * Used for important images: avatars, covers, post images, banners.
 */
export function uploadToCloudinary(file: File, options: UploadOptions = {}): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file);
    form.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    form.append('folder', options.folder || 'bsdc/misc');
    const timestamp = Date.now().toString();
    form.append('timestamp', timestamp);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', UPLOAD_URL);
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
          width?: number;
          height?: number;
          bytes?: number;
          error?: { message: string };
        };
        if (xhr.status >= 200 && xhr.status < 300 && res.secure_url) {
          resolve({
            url: res.secure_url,
            provider: 'cloudinary',
            publicId: res.public_id || '',
            width: res.width || 0,
            height: res.height || 0,
            bytes: res.bytes || 0,
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
    options.signal?.addEventListener('abort', () => xhr.abort());
    xhr.send(form);
  });
}
