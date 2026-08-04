import React from 'react';
import { cn } from './Card';
import { AlertTriangle, AlertCircle, Info, Ghost } from 'lucide-react';

const alertVariants = {
  warning: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
  danger: 'bg-rose-500/10 border-rose-500/30 text-rose-300',
  ghost: 'bg-amber-500/15 border-amber-400/40 text-amber-200',
  info: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300',
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
        'flex items-start gap-3 p-4 rounded-xl border mb-5 transition-all animate-fadeIn',
        alertVariants[variant] || alertVariants.warning,
        className
      )}
    >
      <IconComponent className="w-5 h-5 mt-0.5 flex-shrink-0" />
      <div className="flex-1 text-sm leading-relaxed">
        {title && <div className="font-semibold mb-0.5">{title}</div>}
        <div>{children}</div>
      </div>
    </div>
  );
}
