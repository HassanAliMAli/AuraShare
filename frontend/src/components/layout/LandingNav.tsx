import { Brand } from '../ui/Brand';
import { motion } from 'motion/react';
import { NAV_LINKS, HERO } from '../../lib/landingCopy';
import { fadeLeftVariants, fadeRightVariants } from '../../lib/motion';
import { LinkButton } from '../ui/Button';

/** Landing top navigation: brand, anchor links, and the Start Sharing action. */
export function LandingNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-canvas">
      <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 md:h-16 md:px-8">
        <Brand element="link" href="#top" label="AuraShare — back to top" variants={fadeLeftVariants} />

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
                  className="inline-flex min-h-6 items-center text-sm text-text-2 transition-colors hover:text-text"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
          <LinkButton href="/app" variant="secondary" size="sm">
            {HERO.ctaPrimary}
          </LinkButton>
        </motion.div>
      </nav>
    </header>
  );
}
