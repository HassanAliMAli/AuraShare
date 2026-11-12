import { cn } from '../../lib/utils';

interface EyebrowProps {
  children: React.ReactNode;
  className?: string;
}

/** Monospace section label. Amber, uppercase, tracked out. */
export function Eyebrow({ children, className }: EyebrowProps) {
  return (
    <p
      className={cn(
        'font-mono text-xs uppercase tracking-[0.18em] text-accent',
        className,
      )}
    >
      {children}
    </p>
  );
}
