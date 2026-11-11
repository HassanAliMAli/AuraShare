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
    <div className="border-b border-bright/5">
      <button
        type="button"
        id={`faq-button-${item.id}`}
        aria-expanded={open}
        aria-controls={`faq-panel-${item.id}`}
        onClick={() => onToggle(item.id)}
        className="w-full flex items-center justify-between gap-4 text-left py-5 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
      >
        <span className="text-sm md:text-base font-bold text-text-primary">{item.q}</span>
        <ChevronDown
          className={cn(
            'w-4 h-4 text-text-ghost shrink-0 transition-transform duration-300',
            open && 'rotate-180 text-signal'
          )}
          aria-hidden="true"
        />
      </button>

      <div
        id={`faq-panel-${item.id}`}
        role="region"
        aria-labelledby={`faq-button-${item.id}`}
        className={cn(
          'grid transition-[grid-template-rows] duration-300 ease-out',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        )}
      >
        <div className="overflow-hidden">
          <p className="pb-5 text-sm text-text-secondary leading-relaxed max-w-2xl">{item.a}</p>
        </div>
      </div>
    </div>
  );
}
