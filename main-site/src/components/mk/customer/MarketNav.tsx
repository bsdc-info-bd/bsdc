import { ClipboardList, ShoppingBag, Store } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useMyCart } from '@/hooks/use-mk';
import type { MkCopy } from '@/lib/mk/mk-copy';
import { ROUTES } from '@/lib/site';

/** Top navigation for the marketplace: browse, cart with live count, and orders. */
export function MarketNav({ copy }: { copy: MkCopy }) {
  const location = useLocation();
  const cart = useMyCart();
  const count = (cart.data ?? []).reduce((sum, line) => sum + line.qty, 0);
  const items = [
    { to: ROUTES.market, label: copy.buyer.marketTitle, icon: Store, match: (p: string) => p === ROUTES.market },
    { to: ROUTES.marketCart, label: copy.buyer.cartTitle, icon: ShoppingBag, match: (p: string) => p === ROUTES.marketCart },
    { to: ROUTES.marketOrders, label: copy.buyer.myOrders, icon: ClipboardList, match: (p: string) => p === ROUTES.marketOrders },
  ];
  return (
    <nav aria-label={copy.buyer.marketTitle} className="mb-6">
      <ul className="flex gap-2 overflow-x-auto rounded-2xl bg-surface-2 p-1">
        {items.map(({ to, label, icon: Icon, match }) => {
          const active = match(location.pathname);
          return (
            <li key={to} className="shrink-0">
              <Link
                to={to}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  active ? 'bg-surface text-text shadow-sm' : 'text-muted hover:text-text'
                }`}
              >
                <Icon size={16} aria-hidden />
                {label}
                {to === ROUTES.marketCart && count > 0 ? (
                  <span className="ml-1 rounded-full bg-green-700 px-2 py-0.5 text-xs font-bold text-white tabular-nums">{count}</span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
