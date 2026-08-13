import { useState } from 'react';
import { motion } from 'framer-motion';
import { FAQS } from '../../../lib/landingCopy';
import { Section, SectionHeader } from '../Section';
import { FAQItem } from './FAQItem';
import { staggerContainer, staggerItem } from '../../../lib/motion';

/** FAQ accordion — single-open, keyboard accessible, grid-rows reveal. */
export function FAQSection() {
  const [openId, setOpenId] = useState<string | null>(FAQS[0]?.id ?? null);

  const handleToggle = (id: string) => {
    setOpenId((current) => (current === id ? null : id));
  };

  return (
    <Section id="faq">
      <SectionHeader eyebrow="FAQ" title="Questions, answered." subtitle="Everything you need to know before your first transfer." />

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-80px' }}
        className="mt-12 md:mt-16 max-w-2xl mx-auto bg-bright/5 backdrop-blur-xl border border-bright/10 rounded-2xl md:rounded-3xl px-5 md:px-8"
      >
        {FAQS.map((item) => (
          <motion.div key={item.id} variants={staggerItem}>
            <FAQItem item={item} open={openId === item.id} onToggle={handleToggle} />
          </motion.div>
        ))}
      </motion.div>
    </Section>
  );
}
