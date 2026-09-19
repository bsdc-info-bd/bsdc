/**
 * BSDC — src/features/composer/index.ts
 * Purpose : Public surface of the composer feature.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The composer is reused by the feed, groups, pages and the profile surface.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
export { PostComposer, type PostComposerProps } from './PostComposer';
export { MediaTray, type MediaTrayProps } from './MediaTray';
export {
  useComposer,
  MAX_ATTACHMENTS,
  VISIBILITY_OPTIONS,
  type ComposerAttachment,
  type ComposerState,
  type ComposerActions,
  type UseComposerOptions,
} from './useComposer';
