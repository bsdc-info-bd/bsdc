import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Seo, profileSeoProps } from '@/components/seo';
import { Avatar, Button, FeedSkeleton } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import {
  MapPin,
  LinkIcon,
  Github,
  Linkedin,
  Calendar,
  Users,
  FileText,
  Code2,
  Briefcase,
  GraduationCap,
  Share2,
  MessageSquare,
} from 'lucide-react';

export default function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const { t } = useTranslation();
  const { profile: currentProfile, isAuthenticated } = useAuthStore();

  const isOwnProfile = currentProfile?.username === username;

  // In a real implementation, we'd fetch the profile by username
  // For now, show the current user's profile or a loading state
  const profile = isOwnProfile ? currentProfile : null;

  if (!username) {
    return <div className="text-center text-gray-500">Invalid profile URL</div>;
  }

  return (
    <>
      <Seo {...profileSeoProps(username, profile?.displayName, profile?.bio, profile?.avatar || undefined)} />

      <div className="max-w-3xl mx-auto">
        {/* Cover Image */}
        <div className="h-32 sm:h-48 md:h-56 bg-gradient-to-r from-brand-500 to-accent-500 rounded-t-xl">
          {profile?.coverImage && (
            <img
              src={profile.coverImage}
              alt="Cover"
              className="w-full h-full object-cover rounded-t-xl"
            />
          )}
        </div>

        {/* Profile Header */}
        <div className="px-4 sm:px-6 -mt-12 sm:-mt-16 relative">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div className="flex items-end gap-4">
              <Avatar
                src={profile?.avatar}
                alt={profile?.displayName || username}
                size="2xl"
                className="ring-4 ring-white dark:ring-gray-950"
                isVerified={profile?.isVerified}
              />
              <div className="pb-2">
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                  {profile?.displayName || username}
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">@{username}</p>
              </div>
            </div>
            <div className="flex gap-2 pb-2">
              {isOwnProfile ? (
                <Link to="/settings">
                  <Button variant="outline" size="sm">
                    {t('profile.editProfile')}
                  </Button>
                </Link>
              ) : isAuthenticated ? (
                <>
                  <Button variant="primary" size="sm">
                    {t('common.follow')}
                  </Button>
                  <Button variant="outline" size="sm">
                    <MessageSquare className="h-4 w-4" />
                  </Button>
                </>
              ) : null}
              <Button variant="ghost" size="sm" aria-label="Share profile">
                <Share2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Profile Info */}
        <div className="px-4 sm:px-6 mt-4 space-y-4">
          {profile?.title && (
            <p className="text-sm font-medium text-gray-900 dark:text-white">{profile.title}</p>
          )}
          {profile?.bio && (
            <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
              {profile.bio}
            </p>
          )}

          {/* Meta */}
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-gray-500 dark:text-gray-400">
            {profile?.location?.city && (
              <span className="flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                {profile.location.city}
                {profile.location.country ? `, ${profile.location.country}` : ''}
              </span>
            )}
            {profile?.socialLinks?.github && (
              <a
                href={profile.socialLinks.github}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 hover:text-brand-500"
              >
                <Github className="h-4 w-4" />
                GitHub
              </a>
            )}
            {profile?.socialLinks?.linkedin && (
              <a
                href={profile.socialLinks.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 hover:text-brand-500"
              >
                <Linkedin className="h-4 w-4" />
                LinkedIn
              </a>
            )}
            {profile?.socialLinks?.website && (
              <a
                href={profile.socialLinks.website}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 hover:text-brand-500"
              >
                <LinkIcon className="h-4 w-4" />
                Website
              </a>
            )}
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              Joined {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </span>
          </div>

          {/* Stats */}
          <div className="flex gap-6 text-sm">
            <span className="text-gray-900 dark:text-white">
              <strong>{profile?.followersCount || 0}</strong>{' '}
              <span className="text-gray-500 dark:text-gray-400">{t('profile.followers')}</span>
            </span>
            <span className="text-gray-900 dark:text-white">
              <strong>{profile?.followingCount || 0}</strong>{' '}
              <span className="text-gray-500 dark:text-gray-400">{t('profile.following')}</span>
            </span>
            <span className="text-gray-900 dark:text-white">
              <strong>{profile?.postsCount || 0}</strong>{' '}
              <span className="text-gray-500 dark:text-gray-400">{t('profile.posts')}</span>
            </span>
          </div>

          {/* Skills */}
          {profile?.skills && profile.skills.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                <Code2 className="h-4 w-4" />
                {t('profile.skills')}
              </h3>
              <div className="flex flex-wrap gap-2">
                {profile.skills.map((skill) => (
                  <span key={skill} className="badge-secondary">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="mt-6 border-t border-gray-200 dark:border-gray-800">
          <nav className="flex gap-1 px-4 sm:px-6 overflow-x-auto no-scrollbar" aria-label="Profile sections">
            {[
              { id: 'posts', label: t('profile.posts'), icon: <FileText className="h-4 w-4" /> },
              { id: 'about', label: t('profile.about'), icon: <Users className="h-4 w-4" /> },
              { id: 'experience', label: t('profile.experience'), icon: <Briefcase className="h-4 w-4" /> },
              { id: 'education', label: t('profile.education'), icon: <GraduationCap className="h-4 w-4" /> },
            ].map((tab, i) => (
              <button
                key={tab.id}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  i === 0
                    ? 'border-brand-500 text-brand-500'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="px-4 sm:px-6 py-6">
          {!profile && !isOwnProfile ? (
            <div className="text-center py-12">
              <p className="text-gray-500 dark:text-gray-400">
                Profile data will be loaded from Firebase when configured.
              </p>
            </div>
          ) : (
            <FeedSkeleton count={3} />
          )}
        </div>
      </div>
    </>
  );
}
