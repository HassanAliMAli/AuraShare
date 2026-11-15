import { motion, type Variants } from 'motion/react';

type BrandProps = {
  label: string;
  logoSize?: 6 | 7;
  variants?: Variants;
} & ({ element: 'link'; href: string } | { element: 'button'; onClick: () => void });

/** Shared wordmark and accessible navigation target. */
export function Brand(props: BrandProps) {
  const content = <>
    <img src="/logo.svg" alt="" className={props.logoSize === 7 ? 'h-7 w-7' : 'h-6 w-6'} />
    <span className="font-display text-md font-semibold tracking-tight text-text [font-stretch:108%]">AuraShare</span>
  </>;
  const common = {
    'aria-label': props.label,
    className: 'flex min-h-11 items-center gap-2.5 py-2 -my-2',
    variants: props.variants,
    initial: props.variants ? 'hidden' : undefined,
    animate: props.variants ? 'visible' : undefined,
  };
  return props.element === 'link'
    ? <motion.a {...common} href={props.href}>{content}</motion.a>
    : <motion.button {...common} type="button" onClick={props.onClick}>{content}</motion.button>;
}
