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
        'rounded-xl border border-slate-800/80 bg-[#12121a] p-6 shadow-sm transition-all hover:border-slate-700/80',
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
      className={cn('text-xs font-semibold uppercase tracking-wider text-slate-400', className)}
      {...props}
    >
      {children}
    </h3>
  );
}

export function Metric({ className, children, ...props }) {
  return (
    <div
      className={cn('text-2xl sm:text-3xl font-extrabold tracking-tight text-white mt-1', className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function Text({ className, children, ...props }) {
  return (
    <p className={cn('text-sm text-slate-400 mt-1', className)} {...props}>
      {children}
    </p>
  );
}
