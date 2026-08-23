/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import * as RadixSwitch from '@radix-ui/react-switch';
import { cn } from '@/lib/utils';

export function Switch({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label className={cn('flex cursor-pointer items-center justify-between gap-4 py-2', disabled && 'cursor-not-allowed opacity-60')}>
      {(label || description) && (
        <span className="min-w-0">
          {label ? <span className="block text-sm font-medium">{label}</span> : null}
          {description ? <span className="mt-0.5 block text-xs text-neutral-500 dark:text-neutral-400">{description}</span> : null}
        </span>
      )}
      <RadixSwitch.Root
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className="bsdc-tap relative h-6 w-11 shrink-0 rounded-full bg-neutral-300 transition-colors data-[state=checked]:bg-brand-600 dark:bg-neutral-700"
      >
        <RadixSwitch.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[22px]" />
      </RadixSwitch.Root>
    </label>
  );
}
