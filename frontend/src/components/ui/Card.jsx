import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function Card({ className, children, ...props }) {
  return (
    <div
      className={cn(
        'rounded-lg border border-[#E8E3D8] bg-white p-5 shadow-[0_1px_3px_rgba(28,27,25,0.04)] transition-all hover:border-[#D8D2C4]',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...props }) {
  return (
    <h3
      className={cn('text-xs font-semibold uppercase tracking-wider text-[#6C6A65]', className)}
      {...props}
    >
      {children}
    </h3>
  );
}

export function Metric({ className, children, ...props }) {
  return (
    <div
      className={cn('text-2xl sm:text-3xl font-bold font-mono tracking-tight text-[#1C1B19] mt-1', className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function Text({ className, children, ...props }) {
  return (
    <p className={cn('text-sm text-[#6C6A65] mt-1', className)} {...props}>
      {children}
    </p>
  );
}

