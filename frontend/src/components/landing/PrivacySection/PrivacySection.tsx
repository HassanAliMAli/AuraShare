import { motion } from 'framer-motion';
import { PRIVACY } from '../../../lib/landingCopy';
import { Section, SectionHeader } from '../Section';
import { PathDiagram } from '../../ui/PathDiagram';
import { sectionRevealVariants } from '../../../lib/motion';

/**
 * Privacy: what the server does, what it never does, and the two lanes that
 * make the difference visible.
 */
export function PrivacySection() {
  return (
    <Section id="privacy">
      <SectionHeader
        eyebrow={PRIVACY.eyebrow}
        title={PRIVACY.title}
        subtitle={PRIVACY.subtitle}
      />

      <motion.ul
        variants={sectionRevealVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-60px' }}
        className="mt-8 flex flex-wrap gap-x-8 gap-y-2"
      >
        {PRIVACY.points.map((point) => (
          <li key={point} className="flex items-center gap-2">
            <span
              className="h-1.5 w-1.5 rounded-full bg-accent"
              aria-hidden="true"
            />
            <span className="font-mono text-xs uppercase tracking-[0.14em] text-text-2">
              {point}
            </span>
          </li>
        ))}
      </motion.ul>

      <motion.div
        variants={sectionRevealVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-60px' }}
        className="mt-10 max-w-3xl"
      >
        <PathDiagram />
        <p className="mt-4 text-sm leading-relaxed text-text-2">{PRIVACY.caption}</p>
      </motion.div>
    </Section>
  );
}
