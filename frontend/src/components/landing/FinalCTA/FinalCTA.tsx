import { motion } from 'framer-motion';
import { FINAL_CTA } from '../../../lib/landingCopy';
import { navigate } from '../../../lib/router';
import { sectionRevealVariants } from '../../../lib/motion';
import { Button } from '../../ui/Button';

/**
 * Closing call to action. A full-bleed amber band — flat, no gradient, no
 * rounded blob, no glow.
 */
export function FinalCTA() {
  return (
    <section className="border-t border-border bg-accent">
      <motion.div
        variants={sectionRevealVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-60px' }}
        className="mx-auto max-w-6xl px-4 py-12 md:py-16"
      >
        <div className="flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-display text-xl font-semibold tracking-tight text-accent-ink [font-stretch:108%] md:text-2xl">
              {FINAL_CTA.title}
            </h2>
            <p className="mt-2 max-w-lg text-sm text-accent-ink/75">
              {FINAL_CTA.subtitle}
            </p>
          </div>
          <Button
            variant="secondary"
            size="lg"
            className="border-accent-ink/30 bg-accent-ink text-accent hover:bg-accent-ink/90 hover:text-accent"
            onClick={() => navigate('/app')}
          >
            {FINAL_CTA.cta}
          </Button>
        </div>
      </motion.div>
    </section>
  );
}
