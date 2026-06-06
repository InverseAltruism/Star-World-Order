'use client';

import { forwardRef } from 'react';
import Link from 'next/link';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './cn';

/**
 * SWO V2 Button — composes the proven `.pixel-btn` bevel/glow CSS behind a
 * typed, token-aware API. Renders a Next <Link> when `href` is set, else <button>.
 * Variants map to centralized CSS in globals.css (`.pixel-btn-*`).
 */
export const buttonVariants = cva(
  'pixel-btn smooth-transition inline-flex items-center justify-center gap-2 select-none',
  {
    variants: {
      variant: {
        purple: '',
        gold: 'pixel-btn-gold',
        ghost: 'pixel-btn-ghost',
        danger: 'pixel-btn-danger',
      },
      size: {
        sm: 'text-[9px] !px-3 !py-2',
        md: 'text-[10px] sm:text-xs',
        lg: 'text-xs sm:text-sm !px-7 !py-4',
      },
      block: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'purple', size: 'md', block: false },
  }
);

type ButtonBaseProps = VariantProps<typeof buttonVariants> & {
  className?: string;
  children: React.ReactNode;
};

type ButtonAsButton = ButtonBaseProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, keyof ButtonBaseProps> & {
    href?: undefined;
  };

type ButtonAsLink = ButtonBaseProps &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof ButtonBaseProps> & {
    href: string;
  };

export type ButtonProps = ButtonAsButton | ButtonAsLink;

export const Button = forwardRef<HTMLButtonElement | HTMLAnchorElement, ButtonProps>(
  function Button({ className, variant, size, block, children, ...props }, ref) {
    const classes = cn(buttonVariants({ variant, size, block }), className);
    if ('href' in props && props.href !== undefined) {
      const { href, ...rest } = props as ButtonAsLink;
      return (
        <Link
          href={href}
          ref={ref as React.Ref<HTMLAnchorElement>}
          className={classes}
          {...rest}
        >
          {children}
        </Link>
      );
    }
    return (
      <button
        ref={ref as React.Ref<HTMLButtonElement>}
        className={classes}
        {...(props as ButtonAsButton)}
      >
        {children}
      </button>
    );
  }
);
