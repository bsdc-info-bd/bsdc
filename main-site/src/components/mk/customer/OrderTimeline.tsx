import { motion, useReducedMotion } from 'framer-motion';
import { Check, Bike, PackageCheck, ChefHat, CircleCheck } from 'lucide-react';
import { timelineIndex, type OrderStatus } from '@/lib/mk/mk-logic';
import type { MkCopy } from '@/lib/mk/mk-copy';

const STEPS: { status: OrderStatus; icon: typeof Check }[] = [
  { status: 'placed', icon: ChefHat },
  { status: 'accepted', icon: Check },
  { status: 'packaged', icon: PackageCheck },
  { status: 'out_for_delivery', icon: Bike },
  { status: 'delivered', icon: CircleCheck },
];

/** The five-step tracker. Cancelled orders are shown as a single red line instead. */
export function OrderTimeline({ status, copy }: { status: OrderStatus; copy: MkCopy }) {
  const reduce = useReducedMotion() ?? false;
  if (status === 'cancelled') {
    return (
      <p className="rounded-xl bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-600">{copy.statusLabels.cancelled}</p>
    );
  }
  const current = timelineIndex(status);
  const progress = current / (STEPS.length - 1);
  return (
    <ol aria-label={copy.statusLabels[status]} className="relative grid grid-cols-5 gap-1">
      <div className="absolute left-[10%] right-[10%] top-4 h-1 rounded-full bg-surface-2" aria-hidden />
      <motion.div
        className="absolute left-[10%] top-4 h-1 origin-left rounded-full bg-green-600"
        style={{ width: '80%' }}
        initial={reduce ? false : { scaleX: 0 }}
        animate={{ scaleX: progress }}
        transition={{ duration: reduce ? 0 : 0.6, ease: 'easeOut' }}
        aria-hidden
      />
      {STEPS.map((step, i) => {
        const done = i <= current;
        const active = i === current;
        const Icon = step.icon;
        return (
          <li key={step.status} className="relative flex flex-col items-center gap-1 text-center">
            <motion.span
              className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${
                done ? 'border-green-600 bg-green-600 text-white' : 'border-border bg-surface text-muted'
              }`}
              animate={active && !reduce ? { scale: [1, 1.15, 1] } : { scale: 1 }}
              transition={{ duration: 1.4, repeat: active && !reduce ? Infinity : 0, repeatDelay: 0.6 }}
            >
              <Icon size={14} aria-hidden />
            </motion.span>
            <span className={`text-[11px] leading-tight ${done ? 'font-semibold text-text' : 'text-muted'}`}>
              {copy.statusLabels[step.status]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
