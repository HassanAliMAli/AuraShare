import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';
import { sectionRevealVariants } from '../../lib/motion';

interface SectionHeaderProps {
  eyebrow: string;
  title: string;
  subtitle?: string;
  align?: 'center' | 'left';
}

/** Eyebrow + headline + subtitle block shared by every landing section. */
export function SectionHeader({ eyebrow, title, subtitle, align = 'center' }: SectionHeaderProps) {
  const centered = align === 'center';
  return (
    <motion.div
      variants={sectionRevealVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-80px' }}
      className={cn('max-w-2xl', centered ? 'mx-auto text-center' : 'text-left')}
    >
      <p className="text-[10px] md:text-xs font-black uppercase tracking-[0.4em] text-signal">
        {eyebrow}
      </p>
      <h2 className="mt-3 text-2xl md:text-4xl font-black tracking-tighter text-text-primary font-display leading-tight">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-4 text-sm md:text-base text-text-secondary leading-relaxed">{subtitle}</p>
      )}
    </motion.div>
  );
}

interface SectionProps {
  id: string;
  children: ReactNode;
  className?: string;
}

/** Standard landing section wrapper with anchor offset + bottom padding. */
export function Section({ id, children, className }: SectionProps) {
  return (
    <section id={id} className={cn('scroll-mt-24 px-4 py-16 md:py-24', className)}>
      <div className="max-w-6xl mx-auto">{children}</div>
    </section>
  );
}
