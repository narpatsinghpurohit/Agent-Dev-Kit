import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

/** Vendored shadcn badge with the design's soft pill tones. */
const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-[9px] py-[3px] text-[11px] font-medium [&_svg]:pointer-events-none [&_svg]:size-3',
  {
    variants: {
      variant: {
        default: 'bg-accent-soft text-accent',
        secondary: 'bg-secondary text-secondary-foreground',
        success: 'bg-ok-soft text-ok',
        'destructive-soft': 'bg-danger-soft text-danger',
        purple: 'bg-badge-purple text-badge-purple-fg',
        green: 'bg-badge-green text-badge-green-fg',
        blue: 'bg-badge-blue text-badge-blue-fg',
        outline: 'border border-edge text-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : 'span';
  return (
    <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
