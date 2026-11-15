import { Panel } from './Panel';
import { cn } from '../../lib/utils';

type TransmissionCodePanelProps = {
  code: string | null;
  caption?: string;
  alignment?: 'left' | 'center';
  sample?: boolean;
};

export function TransmissionCodePanel({ code, caption = 'Enter this code on the other device to open the link.', alignment = 'left', sample = false }: TransmissionCodePanelProps) {
  return <Panel className="p-6">
    <div className="flex items-baseline justify-between">
      <span className="font-mono text-xs uppercase tracking-[0.18em] text-text-3">Transmission code{sample ? ' example' : ''}</span>
      <span className="font-mono text-xs text-text-3">6 characters</span>
    </div>
    <p className={cn('mt-5 font-mono text-3xl font-medium tracking-[0.18em] text-accent md:text-4xl', alignment === 'center' && 'text-center')}>
      {code}
    </p>
    <p className="mt-5 border-t border-border pt-4 text-sm leading-relaxed text-text-2">{caption}</p>
  </Panel>;
}
