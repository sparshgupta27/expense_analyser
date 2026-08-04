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
  return <thead className={cn('border-b border-[#E8E3D8] text-xs font-semibold uppercase tracking-wider text-[#6C6A65] bg-[#F5F2EA]/60', className)} {...props} />;
}

export function TableBody({ className, ...props }) {
  return <tbody className={cn('divide-y divide-[#E8E3D8]/80', className)} {...props} />;
}

export function TableRow({ className, ...props }) {
  return <tr className={cn('transition-colors hover:bg-[#F8F6F0]', className)} {...props} />;
}

export function TableHead({ className, ...props }) {
  return <th className={cn('px-4 py-3 text-[#6C6A65] font-semibold text-xs uppercase tracking-wider', className)} {...props} />;
}

export function TableCell({ className, ...props }) {
  return <td className={cn('px-4 py-3.5 text-[#1C1B19]', className)} {...props} />;
}

