/**
 * BSDC — src/shared/ui/index.ts
 * Purpose : Public surface of the design-system primitives (ADR-004: narrow public APIs).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Product code imports primitives from '@/shared/ui' only. Internal files are not
 *           imported directly, which keeps the design system free to refactor.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
export { Accordion, type AccordionEntry, type AccordionProps } from './Accordion';
export { Avatar, AvatarGroup, type AvatarProps, type PresenceState } from './Avatar';
export { Badge, type BadgeTone } from './Badge';
export { BottomNav, type BottomNavProps } from './BottomNav';
export { BrandLogo, type LogoVariant } from './BrandLogo';
export { Button, type ButtonProps, type ButtonSize, type ButtonVariant } from './Button';
export {
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  CardTitle,
  type CardProps,
  type CardVariant,
} from './Card';
export { Checkbox, type CheckboxProps } from './Checkbox';
export { Chip, ChipGroup, ChipRail, type ChipProps } from './Chip';
export { ConfirmDialog, type ConfirmDialogProps } from './Dialog';
export { Container, Grid, ResponsiveContainer, Stack, type ContainerProps } from './Container';
export { Drawer, type DrawerProps } from './Drawer';
export { DropdownMenu, MenuGroup, type MenuItem } from './DropdownMenu';
export { EmptyState, ErrorState, type EmptyStateProps, type ErrorStateProps } from './EmptyState';
export { FeedSkeleton, Skeleton, type SkeletonProps } from './Skeleton';
export { Icon, ICON_REGISTRY, UI_ICONS, type IconProps } from './Icon';
export { IconButton, type IconButtonProps } from './IconButton';
export { InfiniteScrollSentinel, type InfiniteScrollSentinelProps } from './InfiniteScrollSentinel';
export { Input, Textarea, type InputProps, type TextareaProps } from './Input';
export { Kbd } from './Kbd';
export { Modal, type ModalProps } from './Modal';
export { Popover, type PopoverProps } from './Popover';
export { Progress, ProgressRing, type ProgressProps, type ProgressRingProps } from './ProgressRing';
export { PullToRefresh, type PullToRefreshProps } from './PullToRefresh';
export { RadioGroup, type RadioOption } from './RadioGroup';
export { RailNav, type RailNavProps } from './RailNav';
export { SafeArea, type SafeAreaProps } from './SafeArea';
export { ScrollArea, type ScrollAreaProps } from './ScrollArea';
export { Select, type SelectOption } from './Select';
export { Separator, type SeparatorProps } from './Separator';
export { Sheet, type SheetProps, type SheetSide } from './Sheet';
export { Slider, type SliderProps } from './Slider';
export { Spinner, type SpinnerProps } from './Spinner';
export { StickyHeader, type StickyHeaderProps } from './StickyHeader';
export { Switch, type SwitchProps } from './Switch';
export { Tabs, type TabItem, type TabsProps } from './Tabs';
export {
  showToast,
  toastError,
  toastSuccess,
  type BsdcToastPayload,
  type ToastTone,
} from './toast';
export { Tooltip, type TooltipProps } from './Tooltip';
export { Heading, Text, type HeadingProps, type TextProps } from './Typography';
export { VirtualList, type VirtualListProps } from './VirtualList';
