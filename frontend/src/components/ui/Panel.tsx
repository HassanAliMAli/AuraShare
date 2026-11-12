import { cn } from '../../lib/utils';

interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  /** `surface` is the default panel; `raised` sits one step above it. */
  tone?: 'surface' | 'raised';
}

/**
 * A bordered surface. Depth comes from a 1px rule and a background step —
 * never from a shadow.
 */
export function Panel({ tone = 'surface', className, ...props }: PanelProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border',
        tone === 'surface' ? 'bg-surface' : 'bg-raised',
        className,
      )}
      {...props}
    />
  );
}
