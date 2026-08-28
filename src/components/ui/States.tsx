import { cn } from '@/utils/cn';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from './Button';

interface ErrorBoundaryProps {
  error?: Error | null;
  onRetry?: () => void;
  message?: string;
  className?: string;
}

export function ErrorState({ error, onRetry, message, className }: ErrorBoundaryProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-4 p-8 text-center',
        className
      )}
      role="alert"
    >
      <AlertCircle className="h-12 w-12 text-red-400" aria-hidden="true" />
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {message || 'Something went wrong'}
        </h3>
        {error && import.meta.env.DEV && (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-md">
            {error.message}
          </p>
        )}
      </div>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" />
          Try again
        </Button>
      )}
    </div>
  );
}

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-4 p-8 text-center', className)}>
      {icon && (
        <div className="text-gray-300 dark:text-gray-600" aria-hidden="true">
          {icon}
        </div>
      )}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
        {description && (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-md">{description}</p>
        )}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

interface LoadingStateProps {
  message?: string;
  className?: string;
}

export function LoadingState({ message = 'Loading...', className }: LoadingStateProps) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-3 p-8', className)}
      role="status"
      aria-live="polite"
    >
      <div className="relative">
        <div className="h-8 w-8 rounded-full border-2 border-gray-200 dark:border-gray-700" />
        <div className="absolute inset-0 h-8 w-8 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400">{message}</p>
    </div>
  );
}
