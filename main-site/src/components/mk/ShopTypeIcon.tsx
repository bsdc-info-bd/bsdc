import { SHOP_TYPE_ICONS, type ShopType } from '@/lib/mk/mk-logic';

/**
 * The vector icon for a shop type.
 *
 * One component so every place that names a shop type draws the same picture at
 * the same optical size. It used to be an emoji string interpolated into text,
 * which meant the icon was also, accidentally, a word: screen readers announced it,
 * and its baseline came from whichever font the device had for that code point.
 *
 * `aria-hidden` is always true: the type's name is always rendered as text next to
 * it, so announcing the icon as well would read the same thing twice.
 */
export function ShopTypeIcon({
  type,
  size = 16,
  className,
}: {
  type: ShopType;
  size?: number;
  className?: string;
}) {
  const Icon = SHOP_TYPE_ICONS[type];
  return <Icon size={size} aria-hidden className={className} />;
}
