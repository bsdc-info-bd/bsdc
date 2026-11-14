import { Star } from 'lucide-react';

/** Five-star input and display. Pass onChange for an editable control. */
export function StarRating({
  value,
  onChange,
  label,
  size = 20,
}: {
  value: number;
  onChange?: (next: number) => void;
  label: string;
  size?: number;
}) {
  const editable = onChange !== undefined;
  return (
    <div
      role={editable ? 'radiogroup' : 'img'}
      aria-label={`${label}: ${value}/5`}
      className="inline-flex gap-1"
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= Math.round(value);
        const icon = (
          <Star
            size={size}
            className={filled ? 'fill-amber-400 text-amber-400' : 'text-muted'}
            aria-hidden
          />
        );
        if (!editable) return <span key={n}>{icon}</span>;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n}/5`}
            onClick={() => onChange(n)}
            className="transition hover:scale-110"
          >
            {icon}
          </button>
        );
      })}
    </div>
  );
}
