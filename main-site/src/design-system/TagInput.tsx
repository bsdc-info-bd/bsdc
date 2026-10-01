import { Plus, X } from 'lucide-react';
import { useId, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';

export interface TagInputProps {
  label: string;
  hint?: string;
  value: readonly string[];
  onChange: (value: string[]) => void;
  max?: number;
  maxLength?: number;
  suggestions?: readonly string[];
  className?: string;
}

/** Chip based multi-value input used for skills and interests. */
export function TagInput({
  label,
  hint,
  value,
  onChange,
  max = 20,
  maxLength = 32,
  suggestions = [],
  className,
}: TagInputProps) {
  const { t } = useTranslation();
  const inputId = useId();
  const [draft, setDraft] = useState('');

  function add(raw: string) {
    const tag = raw.trim().slice(0, maxLength);
    if (tag.length === 0 || value.length >= max) return;
    if (value.some((item) => item.toLowerCase() === tag.toLowerCase())) return;
    onChange([...value, tag]);
    setDraft('');
  }

  function remove(tag: string) {
    onChange(value.filter((item) => item !== tag));
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      add(draft);
    }
    if (event.key === 'Backspace' && draft.length === 0 && value.length > 0) {
      remove(value[value.length - 1] as string);
    }
  }

  const available = suggestions.filter((item) => !value.includes(item)).slice(0, 8);

  return (
    <div className={cn('w-full', className)}>
      <label htmlFor={inputId} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-bg p-2">
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex max-w-full items-center gap-1 rounded-full bg-surface-2 px-2 py-1 text-xs font-medium"
          >
            <span className="fab-truncate">{tag}</span>
            <button
              type="button"
              onClick={() => remove(tag)}
              aria-label={`${t('common.close')}: ${tag}`}
              className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted hover:text-danger"
            >
              <X size={12} aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          id={inputId}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => add(draft)}
          maxLength={maxLength}
          disabled={value.length >= max}
          className="h-8 min-w-[8ch] flex-1 bg-transparent px-1 text-sm outline-none"
        />
      </div>
      {available.length > 0 ? (
        <ul className="fab-rail mt-2">
          {available.map((suggestion) => (
            <li key={suggestion}>
              <button
                type="button"
                onClick={() => add(suggestion)}
                className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-muted hover:bg-surface-2"
              >
                <Plus size={12} aria-hidden="true" />
                {suggestion}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-1 text-xs text-muted">
        {hint} ({value.length}/{max})
      </p>
    </div>
  );
}
