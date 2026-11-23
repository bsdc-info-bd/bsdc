import { Star, User, MessageSquare, Sparkles, Filter } from 'lucide-react';
import { useState } from 'react';
import { Card, EmptyState } from '@/design-system';
import type { Language } from '@/lib/mk/mk-logic';
import type { MkVendorReview } from '@/lib/mk/mk-types';

interface Props {
  rating: number;
  reviewCount: number;
  histogram?: Record<string, number> | null;
  reviews: MkVendorReview[];
  language: Language;
  onFilterChange?: (rating: number | null) => void;
  loading?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
}

function Stars({ value, size = 14 }: { value: number; size?: number }) {
  const full = Math.floor(value);
  const half = value - full >= 0.5;
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden>
      {Array.from({ length: 5 }, (_, i) => {
        const filled = i < full || (i === full && half);
        return (
          <Star
            key={i}
            size={size}
            className={filled ? 'fill-rating text-rating' : 'text-border'}
            aria-hidden
          />
        );
      })}
    </span>
  );
}

function Histogram({
  histogram,
  total,
  language,
  onSelect,
  selected,
}: {
  histogram: Record<string, number>;
  total: number;
  language: Language;
  onSelect: (r: number | null) => void;
  selected: number | null;
}) {
  const max = Math.max(1, ...Object.values(histogram));
  return (
    <div className="space-y-1.5">
      {[5, 4, 3, 2, 1].map((star) => {
        const count = histogram[String(star)] ?? 0;
        const pct = total > 0 ? (count / max) * 100 : 0;
        const isSelected = selected === star;
        return (
          <button
            key={star}
            type="button"
            onClick={() => onSelect(isSelected ? null : star)}
            className={`flex w-full items-center gap-2 rounded-lg px-1 py-0.5 text-left transition hover:bg-surface-2 ${isSelected ? 'bg-primary/10 ring-1 ring-primary/20' : ''}`}
          >
            <span className="w-8 shrink-0 text-xs font-medium text-muted" aria-hidden>
              {star} ★
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-rating transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted">{count}</span>
          </button>
        );
      })}
      <p className="pt-1 text-xs text-muted">
        {language === 'bn' ? `${total} টি রিভিউ` : `${total} reviews`} ·{' '}
        {language === 'bn' ? 'স্টার অনুযায়ী ফিল্টার করুন' : 'Tap a row to filter'}
      </p>
    </div>
  );
}

export function VendorReviews({
  rating,
  reviewCount,
  histogram,
  reviews,
  language,
  onFilterChange,
  loading = false,
  hasMore = false,
  onLoadMore,
}: Props) {
  const [filter, setFilter] = useState<number | null>(null);

  const handleFilter = (r: number | null) => {
    setFilter(r);
    onFilterChange?.(r);
  };

  const filtered = filter === null ? reviews : reviews.filter((r) => r.rating === filter);

  const hist = histogram ?? {
    '1': reviews.filter((r) => r.rating === 1).length,
    '2': reviews.filter((r) => r.rating === 2).length,
    '3': reviews.filter((r) => r.rating === 3).length,
    '4': reviews.filter((r) => r.rating === 4).length,
    '5': reviews.filter((r) => r.rating === 5).length,
  };

  return (
    <div className="space-y-6">
      {/* Rating hero */}
      <div className="grid gap-4 sm:grid-cols-[1.1fr_1.4fr]">
        <Card padded className="flex flex-col items-center justify-center text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-rating/10 px-3 py-1 text-xs font-semibold text-rating">
            <Sparkles size={12} aria-hidden />
            {language === 'bn' ? 'গ্রাহক রেটিং' : 'Customer rating'}
          </div>
          <p className="mt-3 text-5xl font-black tracking-tight text-text">{rating.toFixed(1)}</p>
          <div className="mt-1.5">
            <Stars value={rating} size={18} />
          </div>
          <p className="mt-1 text-sm font-medium text-muted">
            {reviewCount === 0
              ? language === 'bn'
                ? 'এখনো কোনো রিভিউ নেই'
                : 'No reviews yet'
              : language === 'bn'
                ? `${reviewCount} টি রিভিউ`
                : `${reviewCount} reviews`}
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            {[5, 4, 3, 2, 1].map((s) => (
              <span
                key={s}
                className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-1 text-xs font-medium text-muted"
              >
                {s} <Star size={10} className="fill-rating text-rating" aria-hidden /> ·{' '}
                {hist[String(s)] ?? 0}
              </span>
            ))}
          </div>
        </Card>

        <Card padded>
          <h3 className="text-sm font-semibold text-text flex items-center gap-1.5">
            <Filter size={14} aria-hidden />
            {language === 'bn' ? 'রেটিং বিতরণ' : 'Rating breakdown'}
          </h3>
          <div className="mt-3">
            <Histogram
              histogram={hist}
              total={reviewCount}
              language={language}
              onSelect={handleFilter}
              selected={filter}
            />
          </div>
          {filter !== null && (
            <button
              type="button"
              onClick={() => handleFilter(null)}
              className="mt-3 text-xs font-semibold text-primary hover:underline"
            >
              {language === 'bn' ? 'ফিল্টার সরান' : 'Clear filter'} ({filtered.length})
            </button>
          )}
        </Card>
      </div>

      {/* Reviews list */}
      {loading && reviews.length === 0 ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="animate-pulse rounded-2xl border border-border bg-surface p-4">
              <div className="flex gap-3">
                <div className="h-9 w-9 rounded-full bg-surface-2" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-24 rounded bg-surface-2" />
                  <div className="h-3 w-full rounded bg-surface-2" />
                  <div className="h-3 w-3/4 rounded bg-surface-2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<MessageSquare size={24} />}
          title={language === 'bn' ? 'কোনো রিভিউ নেই' : 'No reviews yet'}
          description={
            filter !== null
              ? language === 'bn'
                ? `${filter} স্টার রিভিউ নেই। ফিল্টার সরান।`
                : `No ${filter}-star reviews. Clear the filter.`
              : language === 'bn'
                ? 'প্রথম রিভিউটি আপনার হতে পারে।'
                : 'Be the first to leave a review after delivery.'
          }
        />
      ) : (
        <ul className="space-y-3">
          {filtered.map((r) => (
            <li
              key={r.id}
              className="rounded-2xl border border-border bg-surface p-4 shadow-sm transition hover:shadow-md"
            >
              <div className="flex items-start gap-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-surface-2">
                  {r.customer.avatar_url ? (
                    <img
                      src={r.customer.avatar_url}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <User size={16} className="text-muted" aria-hidden />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-text">
                    {r.customer.display_name ||
                      r.customer.username ||
                      (language === 'bn' ? 'একজন গ্রাহক' : 'A customer')}
                  </p>
                  <p className="text-xs text-muted">
                    {r.customer.username ? `@${r.customer.username} · ` : ''}
                    {new Date(r.created_at).toLocaleDateString(
                      language === 'bn' ? 'bn-BD' : 'en-GB',
                      {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      },
                    )}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-rating px-2.5 py-1 text-xs font-bold text-bg">
                  {r.rating} <Star size={10} className="fill-bg text-bg" aria-hidden />
                </span>
              </div>
              <div className="mt-2.5 flex items-center gap-1">
                <Stars value={r.rating} size={12} />
                <span className="text-xs font-medium text-muted">
                  {r.rating === 5
                    ? language === 'bn'
                      ? 'অসাধারণ'
                      : 'Excellent'
                    : r.rating === 4
                      ? language === 'bn'
                        ? 'ভালো'
                        : 'Good'
                      : r.rating === 3
                        ? language === 'bn'
                          ? 'মোটামুটি'
                          : 'Average'
                        : language === 'bn'
                          ? 'খারাপ'
                          : 'Poor'}
                </span>
              </div>
              {r.body ? <p className="mt-2 text-sm leading-relaxed text-text">{r.body}</p> : null}
            </li>
          ))}
        </ul>
      )}

      {hasMore && onLoadMore ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onLoadMore}
            className="rounded-full border border-border bg-surface px-5 py-2 text-sm font-semibold text-text shadow-sm hover:bg-surface-2"
          >
            {language === 'bn' ? 'আরও দেখুন' : 'Load more'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
