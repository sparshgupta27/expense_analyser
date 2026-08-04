import React from 'react';
import { cn } from './Card';
import { AlertTriangle, AlertCircle, Info, Ghost } from 'lucide-react';

const alertVariants = {
  warning: 'bg-[#FAF5EA] border-[#EFE2C5] text-[#8C6D23]',
  danger: 'bg-[#FBF0F0] border-[#F4D6D6] text-[#B33F3F]',
  ghost: 'bg-[#F8F6F0] border-[#D0CBBF] text-[#8C6D23]',
  info: 'bg-[#EBF3F0] border-[#D2E4DC] text-[#2D5C4E]',
};

const icons = {
  warning: AlertTriangle,
  danger: AlertCircle,
  ghost: Ghost,
  info: Info,
};

export function Alert({ variant = 'warning', title, children, className }) {
  const IconComponent = icons[variant] || AlertTriangle;

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-4 rounded-lg border mb-4 transition-all',
        alertVariants[variant] || alertVariants.warning,
        className
      )}
    >
      <IconComponent className="w-5 h-5 mt-0.5 flex-shrink-0 opacity-90" />
      <div className="flex-1 text-sm leading-relaxed">
        {title && <div className="font-semibold mb-0.5 text-[#1C1B19]">{title}</div>}
        <div>{children}</div>
      </div>
    </div>
  );
}

