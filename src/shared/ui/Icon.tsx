/**
 * BSDC — src/shared/ui/Icon.tsx
 * Purpose : The component icon registry. Icons are SVG only — the product ships no emoji (LAW-01).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : lucide-react is tree-shaken per icon; this registry is the only place that maps a
 *           semantic name to a glyph, so swapping an icon library later is a one-file change
 *           (ADR-011). Brand marks live in BrandLogo.tsx, not here.
 *           The registry is intentionally minimal: an icon is added when a surface uses it, never
 *           "just in case", because every entry ships to the browser (PART 25 bundle budget).
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Award,
  BadgeCheck,
  Bell,
  Bookmark,
  Briefcase,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Code2,
  Compass,
  Copy,
  Eye,
  ExternalLink,
  Filter,
  Flag,
  Flame,
  Send,
  Globe,
  Heart,
  Home,
  ImagePlus,
  Info,
  Layers,
  Link2,
  Loader2,
  MapPin,
  Megaphone,
  Menu,
  MessageSquare,
  Minus,
  Moon,
  Plus,
  Palette,
  Pencil,
  Rocket,
  Search,
  Settings,
  Share2,
  Shield,
  ShieldCheck,
  Sparkles,
  Star,
  Store,
  Sun,
  Target,
  Trash2,
  TrendingUp,
  Trophy,
  User,
  Users,
  Wallet,
  WifiOff,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { IconName } from '@/core/config/navigation';

/** Registry mapping semantic navigation names to lucide components. */
export const ICON_REGISTRY: Readonly<Record<IconName, LucideIcon>> = {
  home: Home,
  compass: Compass,
  users: Users,
  bell: Bell,
  message: MessageSquare,
  bookmark: Bookmark,
  search: Search,
  settings: Settings,
  store: Store,
  briefcase: Briefcase,
  calendar: CalendarDays,
};

/** Additional icons used by components that are not navigation destinations. */
export const UI_ICONS = {
  alert: AlertTriangle,
  arrowLeft: ArrowLeft,
  arrowUp: ArrowUp,
  building: Building2,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  eye: Eye,
  filter: Filter,
  flag: Flag,
  flame: Flame,
  heart: Heart,
  imageAdd: ImagePlus,
  layers: Layers,
  link: Link2,
  mapPin: MapPin,
  pencil: Pencil,
  plus: Plus,
  send: Send,
  share: Share2,
  sparkles: Sparkles,
  spinner: Loader2,
  star: Star,
  target: Target,
  trash: Trash2,
  trendingUp: TrendingUp,
  trophy: Trophy,
  wallet: Wallet,
  arrowRight: ArrowRight,
  award: Award,
  badgeCheck: BadgeCheck,
  check: Check,
  chevronDown: ChevronDown,
  clock: Clock,
  code: Code2,
  close: X,
  copy: Copy,
  externalLink: ExternalLink,
  globe: Globe,
  info: Info,
  megaphone: Megaphone,
  menu: Menu,
  minus: Minus,
  moon: Moon,
  palette: Palette,
  rocket: Rocket,
  shield: Shield,
  shieldCheck: ShieldCheck,
  sun: Sun,
  user: User,
  verified: BadgeCheck,
  offline: WifiOff,
} as const satisfies Readonly<Record<string, LucideIcon>>;

/** Props for the Icon component. */
export interface IconProps {
  /** Semantic icon name. */
  readonly name: IconName | keyof typeof UI_ICONS;
  /** Edge length in pixels. */
  readonly size?: number | undefined;
  readonly className?: string | undefined;
  /** Decorative by default; provide a label to expose the icon to assistive technology. */
  readonly label?: string | undefined;
  readonly strokeWidth?: number | undefined;
}

/**
 * Renders a registered SVG icon.
 * @param props icon props
 * @returns the icon element
 */
export function Icon({
  name,
  size = 20,
  className,
  label,
  strokeWidth = 1.9,
}: IconProps): React.ReactElement {
  const registry = ICON_REGISTRY as unknown as Readonly<Record<string, LucideIcon>>;
  const Component =
    registry[name] ?? (UI_ICONS as Readonly<Record<string, LucideIcon>>)[name] ?? Info;
  return (
    <Component
      width={size}
      height={size}
      strokeWidth={strokeWidth}
      className={className}
      aria-hidden={label === undefined ? true : undefined}
      aria-label={label}
      role={label === undefined ? undefined : 'img'}
      focusable={false}
    />
  );
}

export type { LucideIcon };
