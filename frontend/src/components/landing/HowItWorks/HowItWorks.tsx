import { motion } from 'framer-motion';
import { HOW_IT_WORKS } from '../../../lib/landingCopy';
import { Section, SectionHeader } from '../Section';
import { DevicePairCard } from './DevicePairCard';
import { staggerContainer } from '../../../lib/motion';

/** How it works: 3 device-pair step cards + the mechanism strip. */
export function HowItWorks() {
  return (
    <Section id="how-it-works">
      <SectionHeader
        eyebrow={HOW_IT_WORKS.eyebrow}
        title={HOW_IT_WORKS.title}
        subtitle={HOW_IT_WORKS.subtitle}
      />

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-80px' }}
        className="mt-12 md:mt-16 grid gap-5 md:grid-cols-3"
      >
        {HOW_IT_WORKS.steps.map((step) => (
          <DevicePairCard
            key={step.id}
            index={step.id}
            from={step.from}
            to={step.to}
            title={step.title}
            description={step.description}
          />
        ))}
      </motion.div>

      <div className="mt-10 md:mt-14 bg-bright/5 border border-bright/10 rounded-2xl px-6 py-5 flex flex-col items-center gap-2 text-center">
        <ol className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] font-bold uppercase tracking-widest text-text-secondary">
          {HOW_IT_WORKS.mechanism.map((step, i) => (
            <li key={step} className="flex items-center gap-3">
              {i > 0 && <span className="text-text-ghost opacity-60" aria-hidden="true">→</span>}
              <span>
                {i + 1} · {step}
              </span>
            </li>
          ))}
        </ol>
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-transfer">
          {HOW_IT_WORKS.mechanismTail}
        </p>
      </div>
    </Section>
  );
}
