import { ChevronDown } from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { FAQS } from '../../../lib/landingCopy';

type FaqItem = (typeof FAQS)[number];

interface FAQItemProps {
  item: FaqItem;
  open: boolean;
  onToggle: (id: string) => void;
}

/** One FAQ row. Reveal uses the CSS grid-rows 0fr→1fr trick (never height). */
export function FAQItem({ item, open, onToggle }: FAQItemProps) {
  return (
    <div className="border-b border-border">
      <h3>
        <button
          type="button"
          id={`faq-button-${item.id}`}
          aria-expanded={open}
          aria-controls={`faq-panel-${item.id}`}
          onClick={() => onToggle(item.id)}
          className="flex w-full items-center justify-between gap-4 py-5 text-left"
        >
          <span className="text-md font-medium text-text">{item.q}</span>
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-text-3 transition-transform duration-[--duration-standard]',
              open && 'rotate-180 text-accent',
            )}
            aria-hidden="true"
          />
        </button>
      </h3>

      <div
        id={`faq-panel-${item.id}`}
        role="region"
        aria-labelledby={`faq-button-${item.id}`}
        className={cn(
          'grid transition-[grid-template-rows] duration-[--duration-standard] ease-[--ease-standard]',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="overflow-hidden">
          <p className="max-w-2xl pb-5 text-sm leading-relaxed text-text-2">{item.a}</p>
        </div>
      </div>
    </div>
  );
}
