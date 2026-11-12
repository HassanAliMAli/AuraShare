import { motion } from 'framer-motion';
import { NAV_LINKS, HERO } from '../../lib/landingCopy';
import { navigate } from '../../lib/router';
import { fadeLeftVariants, fadeRightVariants } from '../../lib/motion';
import { Button } from '../ui/Button';

/** Landing top navigation: brand, anchor links, and the Start Sharing action. */
export function LandingNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-canvas">
      <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 md:h-16 md:px-8">
        <motion.a
          href="#top"
          variants={fadeLeftVariants}
          initial="hidden"
          animate="visible"
          className="flex items-center gap-2.5"
          aria-label="AuraShare — back to top"
        >
          <img src="/logo.svg" alt="" className="h-6 w-6" />
          <span className="font-display text-md font-semibold tracking-tight text-text [font-stretch:108%]">
            AuraShare
          </span>
        </motion.a>

        <motion.div
          variants={fadeRightVariants}
          initial="hidden"
          animate="visible"
          className="flex items-center gap-6 md:gap-9"
        >
          <ul className="hidden items-center gap-7 md:flex">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="text-sm text-text-2 transition-colors hover:text-text"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
          <Button variant="secondary" size="sm" onClick={() => navigate('/app')}>
            {HERO.ctaPrimary}
          </Button>
        </motion.div>
      </nav>
    </header>
  );
}
