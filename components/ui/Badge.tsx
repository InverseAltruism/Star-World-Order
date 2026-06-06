'use client';

import { forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './cn';

/** SWO V2 Badge — composes `.pixel-badge`; tone maps to centralized CSS. */
export const badgeVariants = cva('pixel-badge inline-flex items-center gap-1', {
  variants: {
    tone: {
      purple: '',
      gold: 'pixel-badge-gold',
      cyan: 'pixel-badge-cyan',
      green: 'pixel-badge-green',
      magenta: 'pixel-badge-magenta',
      danger: 'pixel-badge-danger',
    },
  },
  defaultVariants: { tone: 'purple' },
});

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { className, tone, ...props },
  ref
) {
  return <span ref={ref} className={cn(badgeVariants({ tone }), className)} {...props} />;
});
