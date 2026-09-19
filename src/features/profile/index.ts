/**
 * BSDC — src/features/profile/index.ts
 * Purpose : Public surface of the profile feature.
 * Owner   : RRC Development / BSDC Platform Team
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
export { ProfileHeader, type ProfileHeaderProps } from './ProfileHeader';
export { ProfileCard, type ProfileCardProps } from './ProfileCard';
export { ProfileEditor, type ProfileEditorProps } from './ProfileEditor';
export { FollowButton, type FollowButtonProps } from './FollowButton';
export { useProfile, profileById, type ProfileView } from './useProfile';
