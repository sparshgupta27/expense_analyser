import React from 'react';
import { cn } from './Card';

const badgeVariants = {
  default: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
  success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  warning: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  danger: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  ghost: 'bg-amber-500/20 text-amber-300 border-amber-400/40 font-bold animate-pulse',
  food: 'category-badge-food',
  shopping: 'category-badge-shopping',
  bills: 'category-badge-bills',
  transport: 'category-badge-transport',
  entertainment: 'category-badge-entertainment',
  subscriptions: 'category-badge-subscriptions',
  other: 'category-badge-other',
};

export function Badge({ variant = 'default', className, children, ...props }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border transition-transform hover:scale-105 cursor-pointer',
        badgeVariants[variant.toLowerCase()] || badgeVariants.default,
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
