import { motion } from 'framer-motion';
import { NAV_LINKS, HERO } from '../../lib/landingCopy';
import { navigate } from '../../lib/router';
import { fadeLeftVariants, fadeRightVariants } from '../../lib/motion';

/** Landing top navigation: brand, anchor links, and the Start Sharing CTA. */
export function LandingNav() {
  return (
    <header className="sticky top-0 z-50 bg-void/70 backdrop-blur-xl border-b border-bright/5">
      <nav className="max-w-6xl mx-auto px-4 md:px-8 h-16 md:h-20 flex items-center justify-between gap-4">
        <motion.a
          href="#top"
          variants={fadeLeftVariants}
          initial="hidden"
          animate="visible"
          className="flex items-center gap-2 md:gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
          aria-label="AuraShare — back to top"
        >
          <div className="w-8 h-8 md:w-9 md:h-9 rounded-xl md:rounded-2xl overflow-hidden flex items-center justify-center bg-bright/5 border border-bright/10">
            <img src="/logo.svg" alt="" className="w-full h-full object-cover" />
          </div>
          <span className="text-lg md:text-xl font-bold tracking-tighter text-text-primary logo-font">
            AuraShare
          </span>
        </motion.a>

        <motion.div
          variants={fadeRightVariants}
          initial="hidden"
          animate="visible"
          className="flex items-center gap-5 md:gap-8"
        >
          <ul className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="text-xs font-bold uppercase tracking-widest text-text-secondary hover:text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal rounded-xl"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => navigate('/app')}
            className="bg-bright text-void font-black uppercase tracking-widest rounded-xl px-5 py-2.5 md:px-6 md:py-3 text-xs hover:scale-105 active:scale-95 transition-all shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
          >
            {HERO.ctaPrimary}
          </button>
        </motion.div>
      </nav>
    </header>
  );
}
