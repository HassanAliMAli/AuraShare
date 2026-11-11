import { motion } from 'framer-motion';
import { FINAL_CTA } from '../../../lib/landingCopy';
import { navigate } from '../../../lib/router';
import { Section } from '../Section';
import { sectionRevealVariants } from '../../../lib/motion';

/** Closing call to action. */
export function FinalCTA() {
  return (
    <Section id="start-sharing" className="pt-4 md:pt-8">
      <motion.div
        variants={sectionRevealVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-80px' }}
        className="max-w-3xl mx-auto rounded-[2.5rem] md:rounded-[3rem] bg-gradient-to-br from-signal/15 via-bright/5 to-transfer/15 border border-bright/10 shadow-glow-transfer px-6 py-14 md:px-16 md:py-20 text-center"
      >
        <h2 className="text-2xl md:text-4xl font-black tracking-tighter text-text-primary font-display leading-tight">
          {FINAL_CTA.title}
        </h2>
        <p className="mt-4 text-sm md:text-base text-text-secondary max-w-md mx-auto leading-relaxed">
          {FINAL_CTA.subtitle}
        </p>
        <button
          type="button"
          onClick={() => navigate('/app')}
          className="mt-8 inline-block bg-bright text-void font-black uppercase tracking-widest rounded-xl md:rounded-2xl px-8 md:px-10 py-4 text-xs md:text-sm hover:scale-105 active:scale-95 transition-all shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
        >
          {FINAL_CTA.cta} →
        </button>
      </motion.div>
    </Section>
  );
}
