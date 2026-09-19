/**
 * BSDC — src/shared/ui/Accordion.tsx
 * Purpose : Collapsible sections for FAQ, filters and settings groups (PART 08.09).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Height animation uses Radix CSS variables, so it needs no measurement and collapses to
 *           an instant switch under reduced motion.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import type { ReactNode } from 'react';
import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { cn } from '@/shared/lib/cn';
import { Icon } from './Icon';

/** An accordion entry. */
export interface AccordionEntry {
  readonly value: string;
  readonly title: string;
  readonly content: ReactNode;
}

/** Props for the Accordion component. */
export interface AccordionProps {
  readonly items: readonly AccordionEntry[];
  readonly type?: ('single' | 'multiple') | undefined;
  readonly defaultValue?: string | undefined;
  readonly className?: string | undefined;
}

/**
 * Renders an accordion.
 * @param props component props
 * @returns an accordion element
 */
export function Accordion({
  items,
  type = 'single',
  defaultValue,
  className,
}: AccordionProps): React.ReactElement {
  const content = items.map((item) => (
    <AccordionPrimitive.Item key={item.value} value={item.value} className="bsdc-accordion__item">
      <AccordionPrimitive.Header asChild>
        <AccordionPrimitive.Trigger className="bsdc-accordion__trigger">
          <span>{item.title}</span>
          <Icon name="chevronDown" size={16} className="bsdc-accordion__icon" />
        </AccordionPrimitive.Trigger>
      </AccordionPrimitive.Header>
      <AccordionPrimitive.Content className="bsdc-accordion__content">
        <div className="pb-3">{item.content}</div>
      </AccordionPrimitive.Content>
    </AccordionPrimitive.Item>
  ));

  return (
    <div className={cn('w-full', className)}>
      {type === 'single' ? (
        <AccordionPrimitive.Root
          type="single"
          collapsible
          {...(defaultValue !== undefined ? { defaultValue } : {})}
        >
          {content}
        </AccordionPrimitive.Root>
      ) : (
        <AccordionPrimitive.Root
          type="multiple"
          {...(defaultValue !== undefined ? { defaultValue: [defaultValue] } : {})}
        >
          {content}
        </AccordionPrimitive.Root>
      )}
    </div>
  );
}
