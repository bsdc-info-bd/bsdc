import { useCartCount } from '@/hooks/use-cart-count';

/** The item-count pill on the cart icon. Loaded lazily; see AppBar CartLink. */
export function CartCountBadge() {
  const count = useCartCount();
  if (count <= 0) return null;
  return (
    <span className="absolute end-1 top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-green-700 px-1 text-2xs font-semibold leading-4 text-white">
      {count > 99 ? '99+' : count}
    </span>
  );
}
