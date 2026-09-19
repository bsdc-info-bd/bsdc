/**
 * BSDC — src/shared/ui/Slider.tsx
 * Purpose : Single and range sliders for discovery preferences and volume (F-180, PART 08.09).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Keyboard stepping and ARIA value text come from Radix; the accessible name is required
 *           because a bare slider has no visible label.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import * as SliderPrimitive from '@radix-ui/react-slider';
import { cn } from '@/shared/lib/cn';

/** Props for the Slider component. */
export interface SliderProps {
  readonly value: number;
  readonly onValueChange: (value: number) => void;
  readonly min?: number | undefined;
  readonly max?: number | undefined;
  readonly step?: number | undefined;
  /** Required accessible name. */
  readonly label: string;
  readonly disabled?: boolean | undefined;
  readonly className?: string | undefined;
}

/**
 * Renders a slider.
 * @param props component props
 * @returns a slider element
 */
export function Slider({
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  disabled = false,
  className,
}: SliderProps): React.ReactElement {
  return (
    <SliderPrimitive.Root
      className={cn('bsdc-slider', className)}
      value={[value]}
      onValueChange={(next): void => onValueChange(next[0] ?? min)}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      aria-label={label}
    >
      <SliderPrimitive.Track className="bsdc-slider__track">
        <SliderPrimitive.Range className="bsdc-slider__range" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="bsdc-slider__thumb" />
    </SliderPrimitive.Root>
  );
}
