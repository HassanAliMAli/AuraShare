import { motion } from 'motion/react';
import { ArrowUp } from 'lucide-react';
import { FOOTER, NAV_LINKS } from '../../lib/landingCopy';
import { fadeUpVariants } from '../../lib/motion';

/** Landing footer: brand, explore links, guarantees, back-to-top. */
export function LandingFooter() {
  return (
    <footer className="border-t border-border px-4 py-12 md:py-16">
      <motion.div
        variants={fadeUpVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-40px' }}
        className="mx-auto grid max-w-6xl gap-10 md:grid-cols-12"
      >
        <div className="md:col-span-5">
          <a
            href="#top"
            className="flex items-center gap-2.5 py-2 -my-2"
            aria-label="AuraShare — back to top"
          >
            <img src="/logo.svg" alt="" className="h-6 w-6" />
            <span className="font-display text-md font-semibold tracking-tight text-text [font-stretch:108%]">
              AuraShare
            </span>
          </a>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-text-2">{FOOTER.tagline}</p>
        </div>

        <div className="md:col-span-4">
          <h2 className="font-mono text-xs uppercase tracking-[0.14em] text-text-3">Explore</h2>
          <ul className="mt-4 space-y-2">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="inline-flex min-h-6 items-center text-sm text-text-2 transition-colors hover:text-text"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="md:col-span-3">
          <h2 className="font-mono text-xs uppercase tracking-[0.14em] text-text-3">Guarantees</h2>
          <ul className="mt-4 space-y-2.5">
            {FOOTER.trust.map((item) => (
              <li
                key={item}
                className="font-mono text-xs uppercase tracking-[0.14em] text-text-2"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>
      </motion.div>

      <div className="mx-auto mt-12 max-w-6xl border-t border-border pt-6">
        <a
          href="#top"
          className="inline-flex min-h-6 items-center gap-1.5 font-mono text-xs uppercase tracking-[0.14em] text-text-3 transition-colors hover:text-accent"
        >
          <ArrowUp className="h-3 w-3" aria-hidden="true" />
          {FOOTER.backToTop}
        </a>
      </div>
    </footer>
  );
}
