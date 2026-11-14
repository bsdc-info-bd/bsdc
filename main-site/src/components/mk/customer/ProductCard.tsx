import { motion, useReducedMotion } from 'framer-motion';
import { ImageOff, Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatTaka, type Language } from '@/lib/mk/mk-logic';
import type { MkCopy } from '@/lib/mk/mk-copy';
import type { MkStorefrontProduct } from '@/lib/mk/mk-types';
import { QuantityStepper } from './QuantityStepper';

interface Props {
  product: MkStorefrontProduct;
  language: Language;
  copy: MkCopy;
  inCart: number;
  onChangeQty: (next: number) => void;
  busy: boolean;
  index: number;
}

export function ProductCard({ product, language, copy, inCart, onChangeQty, busy, index }: Props) {
  const reduce = useReducedMotion() ?? false;
  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 10) * 0.03, duration: 0.25 }}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-sm transition hover:shadow-md"
    >
      <Link
        to={`/marketplace/product/${product.id}`}
        className="relative block aspect-square overflow-hidden bg-surface-2"
      >
        {product.image_url ? (
          <img
            src={product.image_url}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <span className="grid h-full place-items-center text-muted">
            <ImageOff size={28} aria-hidden />
          </span>
        )}
        {!product.in_stock ? (
          <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-xs font-semibold text-white">
            {copy.buyer.outOfStock}
          </span>
        ) : null}
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <Link
          to={`/marketplace/product/${product.id}`}
          className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold text-text hover:underline"
        >
          {product.name}
        </Link>
        <p className="text-base font-bold text-green-700">
          {formatTaka(product.price_poisha, language)}
        </p>
        <div className="mt-auto flex items-center justify-between gap-2">
          {inCart > 0 ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700">
              <Check size={14} aria-hidden />
              {copy.buyer.inCart}
            </span>
          ) : (
            <span />
          )}
          {product.in_stock ? (
            <QuantityStepper
              value={inCart}
              max={50}
              onChange={onChangeQty}
              label={product.name}
              disabled={busy}
            />
          ) : null}
        </div>
      </div>
    </motion.li>
  );
}
