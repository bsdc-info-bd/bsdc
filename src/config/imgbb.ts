/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { IMGBB_API_KEY } from './constants';
import type { UploadResult } from './cloudinary';

/**
 * Upload to ImgBB via POST https://api.imgbb.com/1/image — key in URL query param,
 * base64 image in the request body. Used for non-critical images (chat attachments,
 * comment images, misc uploads).
 */
export async function uploadToImgBB(file: File): Promise<UploadResult> {
  const base64 = await fileToBase64(file);
  const body = new URLSearchParams({ image: base64 });
  const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
    method: 'POST',
    body,
  });
  if (!res.ok) throw new Error(`ImgBB upload failed (${res.status})`);
  const json = (await res.json()) as {
    success: boolean;
    data?: {
      url: string;
      display_url: string;
      width: number;
      height: number;
      size: number;
    };
  };
  if (!json.success || !json.data) throw new Error('ImgBB upload failed');
  return {
    url: json.data.display_url || json.data.url,
    provider: 'imgbb',
    publicId: '',
    width: json.data.width,
    height: json.data.height,
    bytes: json.data.size,
  };
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}
