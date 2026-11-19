import { recordMediaAsset } from '@/lib/data/media-repository';
import { MediaError, uploadMedia, type UploadOptions, type UploadResult } from './upload';

/**
 * Uploads a picture and records it against the member who uploaded it.
 *
 * The two halves are one operation, and the second half is the one that is easy
 * to forget: `uploadMedia` puts bytes on ImgBB and returns a URL, while
 * `recordMediaAsset` writes the row that says who the URL belongs to. Nothing in
 * the upload response points out that the row is missing.
 *
 * Three things depended on that row and failed without it:
 *
 *   * a comment with a picture was refused by `prepare_comment` (0120) with
 *     `42501`, which the app rendered as "your role does not allow this action"
 *     — a message about permissions for a missing record;
 *   * the upload sweeper asks what nothing points at, and an unrecorded picture
 *     is not a candidate at all, so it would stay at ImgBB for ever;
 *   * nothing could be attributed to a member after the fact.
 *
 * The sign-in check comes first so a signed-out caller does not spend an upload
 * on a row that cannot be written.
 */
export async function uploadAndRecord(
  file: File,
  options: UploadOptions,
  ownerUid: string,
): Promise<UploadResult> {
  if (ownerUid.length === 0) throw new MediaError('data.errors.signInRequired');

  const result = await uploadMedia(file, options);
  const record = await recordMediaAsset(ownerUid, result);
  // A null row means the fallback insert did not persist either; the picture is
  // at ImgBB and nothing may reference it without breaking the rules above.
  if (record === null) throw new MediaError('media.errors.recordFailed');
  return result;
}
