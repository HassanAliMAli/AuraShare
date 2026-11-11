import { motion } from 'framer-motion';
import { ArrowUp } from 'lucide-react';
import { FOOTER } from '../../lib/landingCopy';
import { fadeUpVariants } from '../../lib/motion';

/** Landing footer: brand, tagline, trust strip, back-to-top. */
export function LandingFooter() {
  return (
    <footer className="border-t border-bright/5 py-12 md:py-16">
      <motion.div
        variants={fadeUpVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-40px' }}
        className="max-w-6xl mx-auto px-4 md:px-8 flex flex-col items-center gap-6 text-center"
      >
        <a
          href="#top"
          className="flex items-center gap-2 md:gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
          aria-label="AuraShare — back to top"
        >
          <div className="w-8 h-8 rounded-xl overflow-hidden flex items-center justify-center bg-bright/5 border border-bright/10">
            <img src="/logo.svg" alt="" className="w-full h-full object-cover" />
          </div>
          <span className="text-lg font-bold tracking-tighter text-text-primary logo-font">
            AuraShare
          </span>
        </a>

        <p className="text-sm text-text-secondary max-w-md leading-relaxed">{FOOTER.tagline}</p>

        <div className="flex flex-wrap items-center justify-center gap-4 md:gap-8 text-[9px] md:text-[10px] uppercase tracking-[0.3em] text-text-ghost font-black">
          {FOOTER.trust.map((item, i) => (
            <span key={item} className="flex items-center gap-4 md:gap-8">
              {i > 0 && <span className="hidden xs:block opacity-50">•</span>}
              {item}
            </span>
          ))}
        </div>

        <a
          href="#top"
          className="mt-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-text-ghost hover:text-text-primary transition-colors rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
        >
          <ArrowUp className="w-3 h-3" aria-hidden="true" />
          {FOOTER.backToTop}
        </a>
      </motion.div>
    </footer>
  );
}
