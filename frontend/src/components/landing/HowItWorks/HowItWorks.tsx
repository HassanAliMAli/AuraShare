import { motion } from 'framer-motion';
import { HOW_IT_WORKS } from '../../../lib/landingCopy';
import { Section, SectionHeader } from '../Section';
import { DevicePairGlyph } from './DevicePairGlyph';
import { staggerContainer, staggerItem } from '../../../lib/motion';

/**
 * How it works: a numbered protocol list. Each row is one step of the
 * handshake, ruled like a table rather than boxed like a card.
 */
export function HowItWorks() {
  return (
    <Section id="how-it-works">
      <SectionHeader
        eyebrow={HOW_IT_WORKS.eyebrow}
        title={HOW_IT_WORKS.title}
        subtitle={HOW_IT_WORKS.subtitle}
      />

      <motion.ol
        variants={staggerContainer}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-60px' }}
        className="mt-10 border-t border-border"
      >
        {HOW_IT_WORKS.steps.map((step) => (
          <motion.li
            key={step.id}
            variants={staggerItem}
            className="grid items-start gap-x-8 gap-y-3 border-b border-border py-6 md:grid-cols-12"
          >
            <span className="font-mono text-xs text-text-3 md:col-span-1">{step.id}</span>
            <div className="md:col-span-3">
              <DevicePairGlyph from={step.from} to={step.to} />
            </div>
            <h3 className="text-md font-medium text-text md:col-span-3">{step.title}</h3>
            <p className="text-sm leading-relaxed text-text-2 md:col-span-5">
              {step.description}
            </p>
          </motion.li>
        ))}
      </motion.ol>

      <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1">
        {HOW_IT_WORKS.mechanism.map((step, i) => (
          <span key={step} className="flex items-center gap-3">
            {i > 0 && (
              <span className="text-text-3" aria-hidden="true">
                →
              </span>
            )}
            <span className="font-mono text-xs uppercase tracking-[0.14em] text-text-3">
              {step}
            </span>
          </span>
        ))}
      </div>

      <p className="mt-4 text-sm text-text-2">{HOW_IT_WORKS.mechanismTail}</p>
    </Section>
  );
}
