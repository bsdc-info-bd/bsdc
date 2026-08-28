import { formatDistanceToNowStrict, format, isToday, isYesterday, isThisYear, differenceInMinutes } from 'date-fns';

export const formatRelativeTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  const minutes = differenceInMinutes(Date.now(), date);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;

  return formatDistanceToNowStrict(date, { addSuffix: true });
};

export const formatDate = (timestamp: number): string => {
  const date = new Date(timestamp);
  if (isToday(date)) return `Today at ${format(date, 'h:mm a')}`;
  if (isYesterday(date)) return `Yesterday at ${format(date, 'h:mm a')}`;
  if (isThisYear(date)) return format(date, 'MMM d, h:mm a');
  return format(date, 'MMM d, yyyy');
};

export const formatFullDate = (timestamp: number): string => {
  return format(new Date(timestamp), 'MMMM d, yyyy');
};

export const formatDateTime = (timestamp: number): string => {
  return format(new Date(timestamp), 'MMM d, yyyy h:mm a');
};

export const formatNumber = (num: number): string => {
  if (num < 1000) return num.toString();
  if (num < 10000) return (num / 1000).toFixed(1) + 'K';
  if (num < 1000000) return Math.floor(num / 1000) + 'K';
  if (num < 10000000) return (num / 1000000).toFixed(1) + 'M';
  return Math.floor(num / 1000000) + 'M';
};
