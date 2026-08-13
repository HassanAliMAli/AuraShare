import { motion } from 'framer-motion';
import { Zap, MonitorSmartphone, Infinity as InfinityIcon } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { WHY_AURASHARE } from '../../../lib/landingCopy';
import type { FeatureIconKey } from '../../../lib/landingCopy';
import { Section, SectionHeader } from '../Section';
import { staggerContainer, staggerItem } from '../../../lib/motion';

const ICONS: Record<FeatureIconKey, LucideIcon> = {
  zap: Zap,
  'monitor-smartphone': MonitorSmartphone,
  infinity: InfinityIcon,
};

/** Why AuraShare: three differentiated value cards with organic asymmetry. */
export function WhyAuraShare() {
  return (
    <Section id="why-aurashare">
      <SectionHeader
        eyebrow={WHY_AURASHARE.eyebrow}
        title={WHY_AURASHARE.title}
        subtitle="Three reasons the direct route wins."
      />

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-80px' }}
        className="mt-12 md:mt-16 grid gap-5 md:grid-cols-3"
      >
        {WHY_AURASHARE.features.map((feature, i) => {
          const Icon = ICONS[feature.icon];
          const offset = i === 1 ? 'md:mt-10' : i === 2 ? 'md:mt-5' : 'md:mt-0';
          return (
            <motion.div
              key={feature.title}
              variants={staggerItem}
              className={`flex flex-col ${offset} bg-bright/5 backdrop-blur-xl border border-bright/10 rounded-2xl md:rounded-3xl p-6 md:p-8`}
            >
              <span className="p-3 rounded-2xl bg-signal/10 text-signal w-fit">
                <Icon className="w-5 h-5 md:w-6 md:h-6" aria-hidden="true" />
              </span>
              <h3 className="mt-6 text-lg md:text-xl font-bold text-text-primary tracking-tight">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm text-text-secondary leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          );
        })}
      </motion.div>
    </Section>
  );
}
