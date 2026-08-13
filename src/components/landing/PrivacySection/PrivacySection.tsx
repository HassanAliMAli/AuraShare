import { motion } from 'framer-motion';
import { Smartphone, Laptop, Cloud } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PRIVACY } from '../../../lib/landingCopy';
import { Section, SectionHeader } from '../Section';
import { sectionRevealVariants, staggerContainer, staggerItem } from '../../../lib/motion';

function NodeIcon({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="p-3 rounded-2xl bg-bright/5 border border-bright/10 text-text-primary">
        <Icon className="w-5 h-5 md:w-6 md:h-6" aria-hidden="true" />
      </span>
      <span className="text-[10px] font-bold uppercase tracking-widest text-text-secondary">
        {label}
      </span>
    </div>
  );
}

/** Privacy: money-line statement, trust chips, and the connection diagram. */
export function PrivacySection() {
  return (
    <Section id="privacy">
      <SectionHeader eyebrow={PRIVACY.eyebrow} title={PRIVACY.title} subtitle={PRIVACY.subtitle} />

      <motion.ul
        variants={staggerContainer}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-80px' }}
        className="mt-10 flex flex-wrap items-center justify-center gap-2 md:gap-3"
      >
        {PRIVACY.chips.map((chip) => (
          <motion.li
            key={chip}
            variants={staggerItem}
            className="bg-bright/5 border border-bright/10 rounded-full px-4 py-2 text-xs font-bold text-text-secondary"
          >
            {chip}
          </motion.li>
        ))}
      </motion.ul>

      <motion.div
        variants={sectionRevealVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-80px' }}
        className="mt-10 md:mt-14 bg-aura-2 border border-bright/10 rounded-3xl p-6 md:p-10"
      >
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-text-ghost mb-6 text-center">
          How the connection works
        </p>

        {/* Relay row: A ──cloud── B */}
        <div className="flex items-center justify-between gap-3 md:gap-6">
          <NodeIcon icon={Smartphone} label="Device A" />
          <div className="flex-1 flex items-center">
            <span className="flex-1 h-px border-t border-dashed border-aura-edge" aria-hidden="true" />
            <div className="px-2 flex flex-col items-center gap-1">
              <Cloud className="w-6 h-6 text-text-ghost" aria-hidden="true" />
              <span className="text-[9px] font-bold uppercase tracking-widest text-text-ghost text-center">
                {PRIVACY.relayLabel}
              </span>
            </div>
            <span className="flex-1 h-px border-t border-dashed border-aura-edge" aria-hidden="true" />
          </div>
          <NodeIcon icon={Laptop} label="Device B" />
        </div>

        {/* Direct data beam below, bypassing the cloud */}
        <div className="mt-8 relative">
          <motion.div
            className="h-0.5 bg-gradient-transfer origin-left shadow-glow-transfer"
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
          />
          <div className="mt-3 flex items-center justify-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-transfer" aria-hidden="true" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-transfer">
              {PRIVACY.directLabel}
            </span>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-text-ghost leading-relaxed">{PRIVACY.caption}</p>
      </motion.div>
    </Section>
  );
}
