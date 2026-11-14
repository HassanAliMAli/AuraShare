import { motion } from 'motion/react';
import { HERO } from '../../../lib/landingCopy';
import { navigate } from '../../../lib/router';
import { fadeUpVariants } from '../../../lib/motion';
import { Button } from '../../ui/Button';
import { Eyebrow } from '../../ui/Eyebrow';
import { Panel } from '../../ui/Panel';
import { PathDiagram } from '../../ui/PathDiagram';

/** Hero: the positioning statement, one action, and the two-lane diagram. */
export function Hero() {
  return (
    <section className="px-4 pb-14 pt-16 md:pb-20 md:pt-24">
      <div className="mx-auto grid max-w-6xl items-center gap-12 md:grid-cols-12 md:gap-10">
        {/* Left — the statement */}
        <motion.div
          variants={fadeUpVariants}
          initial="hidden"
          animate="visible"
          className="md:col-span-7"
        >
          <Eyebrow>{HERO.eyebrow}</Eyebrow>

          <h1 className="mt-5 max-w-2xl font-display text-2xl font-semibold leading-[1.08] tracking-tight text-text [font-stretch:112%] md:text-3xl">
            {HERO.title}
          </h1>

          <p className="mt-7 max-w-xl text-base leading-relaxed text-text-2">
            {HERO.subtitle}
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button variant="primary" size="lg" onClick={() => navigate('/app')}>
              {HERO.ctaPrimary}
            </Button>
            <a
              href="#how-it-works"
              className="inline-flex h-12 items-center rounded-md border border-border-strong px-6 text-md font-medium tracking-tight text-text transition-colors duration-(--duration-micro) hover:border-accent hover:text-accent"
            >
              {HERO.ctaSecondary}
            </a>
          </div>

          {/* Facts, not badges */}
          <dl className="mt-10 grid max-w-lg grid-cols-3 gap-4 border-t border-border pt-5">
            {HERO.specs.map((spec) => (
              <div key={spec.label}>
                <dt className="font-mono text-xs uppercase tracking-[0.14em] text-text-3">
                  {spec.label}
                </dt>
                <dd className="mt-1.5 text-sm text-text">{spec.value}</dd>
              </div>
            ))}
          </dl>
        </motion.div>

        {/* Right — the artifact and the path */}
        <motion.div
          variants={fadeUpVariants}
          initial="hidden"
          animate="visible"
          className="md:col-span-5"
        >
          <Panel className="p-6">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-text-3">
                Transmission code
              </span>
              <span className="font-mono text-xs text-text-3">6 characters</span>
            </div>
            <p className="mt-5 font-mono text-3xl font-medium tracking-[0.18em] text-accent md:text-4xl">
              A1B2C3
            </p>
            <p className="mt-5 border-t border-border pt-4 text-sm leading-relaxed text-text-2">
              Enter this code on the other device to open the link.
            </p>
          </Panel>

          <div className="mt-6">
            <PathDiagram />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
