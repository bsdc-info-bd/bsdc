import { cn } from '@/utils/cn';
import { getInitials } from '@/utils';

interface AvatarProps {
  src?: string | null;
  alt: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  className?: string;
  isOnline?: boolean;
  isVerified?: boolean;
}

const sizeMap = {
  xs: 'h-6 w-6 text-2xs',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
  xl: 'h-16 w-16 text-lg',
  '2xl': 'h-24 w-24 text-2xl',
};

const onlineIndicatorSize = {
  xs: 'h-2 w-2 border',
  sm: 'h-2.5 w-2.5 border',
  md: 'h-3 w-3 border-2',
  lg: 'h-3.5 w-3.5 border-2',
  xl: 'h-4 w-4 border-2',
  '2xl': 'h-5 w-5 border-2',
};

export function Avatar({
  src,
  alt,
  size = 'md',
  className,
  isOnline,
  isVerified,
}: AvatarProps) {
  const initials = getInitials(alt);

  return (
    <div className={cn('relative inline-flex shrink-0', className)}>
      {src ? (
        <img
          src={src}
          alt={alt}
          className={cn(
            'rounded-full object-cover bg-gray-100 dark:bg-gray-800',
            sizeMap[size]
          )}
          loading="lazy"
        />
      ) : (
        <div
          className={cn(
            'rounded-full bg-brand-500 text-white flex items-center justify-center font-semibold',
            sizeMap[size]
          )}
          role="img"
          aria-label={alt}
        >
          {initials}
        </div>
      )}
      {isOnline !== undefined && (
        <span
          className={cn(
            'absolute bottom-0 right-0 rounded-full border-white dark:border-gray-950',
            onlineIndicatorSize[size],
            isOnline ? 'bg-green-500' : 'bg-gray-400'
          )}
          aria-label={isOnline ? 'Online' : 'Offline'}
        />
      )}
      {isVerified && (
        <span
          className="absolute -top-0.5 -right-0.5 bg-brand-500 rounded-full p-0.5"
          aria-label="Verified"
        >
          <svg className="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        </span>
      )}
    </div>
  );
}
