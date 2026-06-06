'use client';

import * as TabsPrimitive from '@radix-ui/react-tabs';
import { forwardRef } from 'react';
import { cn } from './cn';

/**
 * SWO V2 Tabs — accessible (Radix) tab pattern with the pixel skin.
 * Replaces the hand-rolled tab rows repeated across DAO/Raffle/Casino/etc.
 */
export const Tabs = TabsPrimitive.Root;

export const TabsList = forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(function TabsList({ className, ...props }, ref) {
  return (
    <TabsPrimitive.List
      ref={ref}
      className={cn('flex flex-wrap items-center gap-2', className)}
      {...props}
    />
  );
});

export const TabsTrigger = forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(function TabsTrigger({ className, ...props }, ref) {
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        'pixel-badge cursor-pointer transition-all',
        // active state: brighter gold-bordered chip
        'data-[state=active]:pixel-badge-gold data-[state=active]:text-gold',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-bg)]',
        className
      )}
      {...props}
    />
  );
});

export const TabsContent = forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(function TabsContent({ className, ...props }, ref) {
  return (
    <TabsPrimitive.Content
      ref={ref}
      className={cn(
        'mt-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold',
        className
      )}
      {...props}
    />
  );
});
