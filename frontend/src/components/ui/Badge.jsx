import React from 'react';
import { cn } from './Card';

const badgeVariants = {
  default: 'bg-[#F5F2EA] text-[#1C1B19] border-[#E8E3D8]',
  success: 'bg-[#EBF3F0] text-[#2D5C4E] border-[#D2E4DC]',
  warning: 'bg-[#FAF5EA] text-[#8C6D23] border-[#EFE2C5]',
  danger: 'bg-[#FBF0F0] text-[#B33F3F] border-[#F4D6D6]',
  ghost: 'bg-[#F8F6F0] text-[#8C6D23] border-[#D0CBBF] border-dashed font-mono font-medium',
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
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-medium border transition-colors',
        badgeVariants[variant.toLowerCase()] || badgeVariants.default,
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

