import { cn } from '../../lib/utils';

type ButtonVariant = 'primary' | 'secondary' | 'quiet';
type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  /** Solid amber — exactly one per view. */
  primary: 'bg-accent text-accent-ink border border-accent hover:bg-accent/90',
  /** Bordered — secondary actions, header CTA. */
  secondary:
    'border border-border-strong text-text hover:border-accent hover:text-accent',
  /** Text link — tertiary actions. */
  quiet: 'border border-transparent text-accent hover:text-accent/80',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-md',
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/**
 * The one button in the system. Flat, square-cornered, no shadow, no scale on
 * hover — the accent fill and the border do the work.
 */
export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium tracking-tight',
        'transition-colors duration-[--duration-micro]',
        'disabled:cursor-not-allowed disabled:opacity-40',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
}
