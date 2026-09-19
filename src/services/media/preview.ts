/**
 * BSDC — src/services/media/preview.ts
 * Purpose : Local previews: object URLs, blur previews and dominant colours.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Every image in BSDC ships with an explicit width and height, a lazy or priority
 *   decision and a blur preview (PART 25). The preview is generated on the device from the file
 *   itself, so the first frame of an upload looks finished before a byte has left the phone.
 *   Object URLs are revoked by the caller: this module only hands them out.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */

/** A generated local preview. */
export interface LocalPreview {
  /** Object URL for immediate display. Revoke it when the preview is no longer needed. */
  readonly objectUrl: string;
  /** Tiny blurred data URL used as the progressive-loading backdrop. */
  readonly blurDataUrl: string;
  /** Average colour as a hex string, used for the letterbox background. */
  readonly dominantColor: string;
  readonly width: number;
  readonly height: number;
}

/** Width of the generated blur preview, in pixels. */
const BLUR_WIDTH = 24;
/** Quality of the generated blur preview JPEG. */
const BLUR_QUALITY = 0.4;

/**
 * Converts an RGB triple into a hex colour string.
 * @param red red channel
 * @param green green channel
 * @param blue blue channel
 * @returns a hex colour
 */
function toHex(red: number, green: number, blue: number): string {
  const clamp = (value: number): string =>
    Math.max(0, Math.min(255, Math.round(value)))
      .toString(16)
      .padStart(2, '0');
  return `#${clamp(red)}${clamp(green)}${clamp(blue)}`;
}

/**
 * Generates a local preview for an image file.
 * @param file image file
 * @returns the preview, or null when the image cannot be decoded
 */
export async function createLocalPreview(file: File): Promise<LocalPreview | null> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement | null>((resolve) => {
      const element = new Image();
      element.onload = (): void => resolve(element);
      element.onerror = (): void => resolve(null);
      element.src = objectUrl;
    });
    if (image === null) {
      URL.revokeObjectURL(objectUrl);
      return null;
    }

    const width = image.naturalWidth;
    const height = image.naturalHeight;
    const ratio = height === 0 ? 1 : height / width;
    const canvas = document.createElement('canvas');
    canvas.width = BLUR_WIDTH;
    canvas.height = Math.max(1, Math.round(BLUR_WIDTH * ratio));
    const context = canvas.getContext('2d');
    if (context === null) {
      URL.revokeObjectURL(objectUrl);
      return null;
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    let red = 0;
    let green = 0;
    let blue = 0;
    let sampled = 0;
    try {
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let index = 0; index < pixels.length; index += 4) {
        red += pixels[index] ?? 0;
        green += pixels[index + 1] ?? 0;
        blue += pixels[index + 2] ?? 0;
        sampled += 1;
      }
    } catch {
      sampled = 0;
    }
    const dominantColor =
      sampled === 0 ? '#1b2436' : toHex(red / sampled, green / sampled, blue / sampled);

    return {
      objectUrl,
      blurDataUrl: canvas.toDataURL('image/jpeg', BLUR_QUALITY),
      dominantColor,
      width,
      height,
    };
  } catch {
    URL.revokeObjectURL(objectUrl);
    return null;
  }
}

/**
 * Releases an object URL handed out by this module.
 * @param objectUrl the URL to release
 */
export function releasePreview(objectUrl: string): void {
  URL.revokeObjectURL(objectUrl);
}
