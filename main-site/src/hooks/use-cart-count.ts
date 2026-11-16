import { useQuery } from '@tanstack/react-query';
import { fetchMyCart } from '@/lib/mk/mk-cart-query';
import { useAuthStore } from '@/store/auth-store';

/**
 * Cart item count for the global header. It reads the same query key as
 * `useMyCart` so the badge and the cart page share one cache entry. It imports
 * only `mk-cart-query`, not the whole marketplace repository, so the header
 * does not pull every marketplace route into the entry bundle.
 */
export function useCartCount(): number {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const { data } = useQuery({
    queryKey: ['mk', 'cart', uid],
    queryFn: fetchMyCart,
    enabled: uid !== null,
    staleTime: 5_000,
  });
  return (data ?? []).reduce((sum, line) => sum + line.qty, 0);
}
