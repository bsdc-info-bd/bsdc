import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
}

export interface TabsProps {
  items: readonly TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  label: string;
  className?: string;
}

/** Keyboard-accessible tabs with arrow-key roving focus. */
export function Tabs({ items, activeId, onChange, label, className }: TabsProps) {
  const baseId = useId();
  const activeIndex = Math.max(
    0,
    items.findIndex((item) => item.id === activeId),
  );
  const active = items[activeIndex];

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    const next = items[(activeIndex + delta + items.length) % items.length];
    if (next) onChange(next.id);
  }

  return (
    <div className={className}>
      <div role="tablist" aria-label={label} className="fab-rail border-b border-border">
        {items.map((item) => {
          const selected = item.id === active?.id;
          return (
            <button
              key={item.id}
              id={`${baseId}-tab-${item.id}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              onKeyDown={onKeyDown}
              onClick={() => onChange(item.id)}
              className={cn(
                'fab-tap whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold transition-colors',
                selected
                  ? 'border-green-700 text-green-700'
                  : 'border-transparent text-muted hover:text-text',
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {active ? (
        <div
          id={`${baseId}-panel-${active.id}`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-${active.id}`}
          tabIndex={0}
          className="pt-3"
        >
          {active.content}
        </div>
      ) : null}
    </div>
  );
}
