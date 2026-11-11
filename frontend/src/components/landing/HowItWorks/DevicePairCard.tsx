import { motion } from 'framer-motion';
import { Smartphone, Laptop, Monitor, ArrowRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { DeviceKind } from '../../../lib/landingCopy';
import { usePrefersReducedMotion } from '../../../hooks';
import { staggerItem } from '../../../lib/motion';

const FROM_ICONS: Record<DeviceKind, LucideIcon> = {
  phone: Smartphone,
  computer: Laptop,
};

const TO_ICONS: Record<DeviceKind, LucideIcon> = {
  phone: Smartphone,
  computer: Monitor,
};

interface DevicePairCardProps {
  index: string;
  from: DeviceKind;
  to: DeviceKind;
  title: string;
  description: string;
}

/** Pulsing direction arrow between the two device icons. */
function FlowArrow({ reduced }: { reduced: boolean }) {
  return (
    <span className="relative flex-1 min-w-8 mx-2 flex items-center justify-center" aria-hidden="true">
      <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-signal/40" />
      <motion.span
        className="relative bg-bright/5 rounded-full p-1"
        animate={reduced ? {} : { x: [0, 3, 0], opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 2, repeat: Infinity, repeatDelay: 0.4, ease: 'easeInOut' }}
      >
        <ArrowRight className="w-3 h-3 md:w-4 md:h-4 text-signal" />
      </motion.span>
    </span>
  );
}

/** One step card: a device pair with an animated direction arrow. */
export function DevicePairCard({ index, from, to, title, description }: DevicePairCardProps) {
  const prefersReduced = usePrefersReducedMotion();
  const FromIcon = FROM_ICONS[from];
  const ToIcon = TO_ICONS[to];

  return (
    <motion.div
      variants={staggerItem}
      className="flex flex-col bg-bright/5 backdrop-blur-xl border border-bright/10 rounded-2xl md:rounded-3xl p-6 md:p-8"
    >
      <span className="text-[10px] font-black tracking-[0.4em] text-text-ghost">{index}</span>

      <div className="mt-6 flex items-center justify-between" aria-label={title}>
        <span className="p-3 rounded-2xl bg-signal/10 text-signal">
          <FromIcon className="w-5 h-5 md:w-6 md:h-6" aria-hidden="true" />
        </span>
        <FlowArrow reduced={prefersReduced} />
        <span className="p-3 rounded-2xl bg-transfer/10 text-transfer">
          <ToIcon className="w-5 h-5 md:w-6 md:h-6" aria-hidden="true" />
        </span>
      </div>

      <h3 className="mt-6 text-lg md:text-xl font-bold text-text-primary tracking-tight">
        {title}
      </h3>
      <p className="mt-2 text-sm text-text-secondary leading-relaxed">{description}</p>
    </motion.div>
  );
}
