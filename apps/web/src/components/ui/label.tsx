import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

/** Vendored shadcn label on a plain <label> (no radix label dependency). */
function Label({ className, ...props }: ComponentProps<'label'>) {
  return (
    <label
      data-slot="label"
      className={cn(
        'flex select-none items-center gap-2 text-sm font-medium leading-none',
        className,
      )}
      {...props}
    />
  );
}

export { Label };
