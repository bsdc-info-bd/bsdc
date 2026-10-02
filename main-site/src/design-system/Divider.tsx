import { cn } from '@/lib/cn';

export function Divider({ className }: { className?: string }) {
  return <hr className={cn('fab-divider border-0', className)} />;
}
