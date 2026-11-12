import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';
import { sectionRevealVariants } from '../../lib/motion';
import { Eyebrow } from '../ui/Eyebrow';

interface SectionHeaderProps {
  eyebrow: string;
  title: string;
  subtitle?: string;
}

/** Eyebrow + headline + subtitle. Left-aligned — the page has one axis. */
export function SectionHeader({ eyebrow, title, subtitle }: SectionHeaderProps) {
  return (
    <motion.div
      variants={sectionRevealVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-80px' }}
      className="max-w-2xl"
    >
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-4 font-display text-lg font-semibold tracking-tight text-text [font-stretch:108%] md:text-xl">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-text-2 md:text-base">
          {subtitle}
        </p>
      )}
    </motion.div>
  );
}

interface SectionProps {
  id: string;
  children: ReactNode;
  className?: string;
}

/**
 * A landing section. A hairline rule across the top gives the page the
 * rhythm of a spec sheet rather than a stack of floating cards.
 */
export function Section({ id, children, className }: SectionProps) {
  return (
    <section
      id={id}
      className={cn('scroll-mt-20 border-t border-border px-4 py-14 md:py-20', className)}
    >
      <div className="mx-auto max-w-6xl">{children}</div>
    </section>
  );
}
