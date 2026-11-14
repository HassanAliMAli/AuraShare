import { motion } from 'motion/react';
import { COMPARISON } from '../../../lib/landingCopy';
import { Section, SectionHeader } from '../Section';
import { sectionRevealVariants } from '../../../lib/motion';

/**
 * How AuraShare compares with the tools people already use. A real table with
 * verifiable cells — the AuraShare column is marked with an accent rule, not
 * with a badge.
 */
export function Comparison() {
  const selfIndex = COMPARISON.columns.indexOf('AuraShare');

  return (
    <Section id="comparison">
      <SectionHeader
        eyebrow={COMPARISON.eyebrow}
        title={COMPARISON.title}
        subtitle={COMPARISON.subtitle}
      />

      <motion.div
        variants={sectionRevealVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-60px' }}
        className="mt-10 overflow-x-auto"
      >
        <table className="w-full min-w-[640px] border-collapse text-left">
          <caption className="sr-only">
            AuraShare compared with WeTransfer, Google Drive and AirDrop.
          </caption>
          <thead>
            <tr className="border-b border-border-strong">
              <th scope="col" className="w-48 py-3 pr-4">
                <span className="font-mono text-xs uppercase tracking-[0.14em] text-text-3">
                  Property
                </span>
              </th>
              {COMPARISON.columns.map((column, i) => (
                <th
                  key={column}
                  scope="col"
                  className={
                    i === selfIndex
                      ? 'border-l-2 border-accent py-3 pl-4 text-sm font-medium text-accent'
                      : 'py-3 pl-4 text-sm font-medium text-text-2'
                  }
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPARISON.rows.map((row) => (
              <tr key={row.label} className="border-b border-border">
                <th
                  scope="row"
                  className="py-4 pr-4 font-mono text-xs font-normal uppercase tracking-[0.14em] text-text-3"
                >
                  {row.label}
                </th>
                {row.values.map((value, i) => (
                  <td
                    key={value + i}
                    className={
                      i === selfIndex
                        ? 'border-l-2 border-accent py-4 pl-4 text-sm text-text'
                        : 'py-4 pl-4 text-sm text-text-2'
                    }
                  >
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </motion.div>
    </Section>
  );
}
