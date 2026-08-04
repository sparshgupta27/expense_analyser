import React from 'react';
import { cn } from './Card';

export function Table({ className, ...props }) {
  return (
    <div className="w-full overflow-auto">
      <table className={cn('w-full border-collapse text-left text-sm', className)} {...props} />
    </div>
  );
}

export function TableHeader({ className, ...props }) {
  return <thead className={cn('border-b border-slate-800 text-xs font-semibold uppercase tracking-wider text-slate-400', className)} {...props} />;
}

export function TableBody({ className, ...props }) {
  return <tbody className={cn('divide-y divide-slate-800/60', className)} {...props} />;
}

export function TableRow({ className, ...props }) {
  return <tr className={cn('transition-colors hover:bg-slate-850/60', className)} {...props} />;
}

export function TableHead({ className, ...props }) {
  return <th className={cn('px-4 py-3 text-slate-400 font-semibold', className)} {...props} />;
}

export function TableCell({ className, ...props }) {
  return <td className={cn('px-4 py-3.5 text-slate-300', className)} {...props} />;
}
