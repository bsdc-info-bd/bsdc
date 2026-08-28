import { isCloudinaryConfigured, config } from '@/config';

export interface UploadResult {
  url: string;
  publicId?: string;
  width?: number;
  height?: number;
  format?: string;
}

export interface UploadOptions {
  file: File;
  folder?: string;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/svg+xml',
];

const MAX_FILE_SIZE = config.app.maxUploadSizeMB * 1024 * 1024;

export const validateImage = (file: File): { valid: boolean; error?: string } => {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return { valid: false, error: 'Invalid file type. Allowed: JPEG, PNG, GIF, WebP, AVIF, SVG.' };
  }
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File too large. Maximum size is ${config.app.maxUploadSizeMB}MB.`,
    };
  }
  if (file.size === 0) {
    return { valid: false, error: 'File is empty.' };
  }
  return { valid: true };
};

export const uploadToCloudinary = async (
  options: UploadOptions
): Promise<UploadResult> => {
  if (!isCloudinaryConfigured()) {
    throw new Error('Cloudinary is not configured. Set VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET.');
  }

  const { file, folder = 'bsdc', onProgress, signal } = options;
  const validation = validateImage(file);
  if (!validation.valid) throw new Error(validation.error);

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', config.cloudinary.uploadPreset);
  formData.append('folder', folder);

  const url = `https://api.cloudinary.com/v1_1/${config.cloudinary.cloudName}/image/upload`;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    if (signal) {
      signal.addEventListener('abort', () => {
        xhr.abort();
        reject(new Error('Upload cancelled'));
      });
    }

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const response = JSON.parse(xhr.responseText);
        resolve({
          url: response.secure_url,
          publicId: response.public_id,
          width: response.width,
          height: response.height,
          format: response.format,
        });
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
    xhr.open('POST', url);
    xhr.send(formData);
  });
};

export const uploadToImgbb = async (options: UploadOptions): Promise<UploadResult> => {
  if (!config.imgbb.apiKey) {
    throw new Error('ImgBB is not configured. Set VITE_IMGBB_API_KEY.');
  }

  const { file, onProgress, signal } = options;
  const validation = validateImage(file);
  if (!validation.valid) throw new Error(validation.error);

  const formData = new FormData();
  formData.append('image', file);

  const url = `https://api.imgbb.com/1/upload?key=${config.imgbb.apiKey}`;

  if (onProgress) onProgress(50);

  const response = await fetch(url, {
    method: 'POST',
    body: formData,
    signal,
  });

  if (!response.ok) {
    throw new Error(`ImgBB upload failed with status ${response.status}`);
  }

  const data = await response.json();
  if (onProgress) onProgress(100);

  if (!data.success) {
    throw new Error(data.error?.message || 'ImgBB upload failed');
  }

  return {
    url: data.data.url,
    width: data.data.width,
    height: data.data.height,
    format: data.data.image?.extension,
  };
};

export const uploadImage = async (
  options: UploadOptions,
  priority: 'important' | 'normal' = 'normal'
): Promise<UploadResult> => {
  if (priority === 'important' && isCloudinaryConfigured()) {
    return uploadToCloudinary(options);
  }
  if (isCloudinaryConfigured()) {
    return uploadToCloudinary(options);
  }
  if (config.imgbb.apiKey) {
    return uploadToImgbb(options);
  }
  throw new Error(
    'No image upload service is configured. Set Cloudinary or ImgBB environment variables.'
  );
};

export const getCloudinaryUrl = (
  publicId: string,
  transformations: Record<string, string | number> = {}
): string => {
  if (!config.cloudinary.cloudName) return '';
  const transforms = Object.entries(transformations)
    .map(([key, value]) => `${key}_${value}`)
    .join(',');
  const transformPart = transforms ? `/${transforms}` : '';
  return `https://res.cloudinary.com/${config.cloudinary.cloudName}/image/upload${transformPart}/${publicId}`;
};
