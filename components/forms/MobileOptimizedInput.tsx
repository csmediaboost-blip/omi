import React, { InputHTMLAttributes } from 'react';
import { LucideIcon } from 'lucide-react';

interface MobileOptimizedInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  icon?: LucideIcon;
  error?: string;
  helper?: string;
  required?: boolean;
}

/**
 * Mobile-optimized input component with:
 * - Proper font sizing to prevent iOS auto-zoom (min 16px)
 * - Vertical spacing for touch targets (min 44px height)
 * - Clear error states
 * - Icon support
 * - Proper disabled states
 */
export function MobileOptimizedInput({
  label,
  icon: Icon,
  error,
  helper,
  required,
  className,
  disabled,
  ...props
}: MobileOptimizedInputProps) {
  const baseClasses =
    'w-full px-4 py-3.5 rounded-xl text-base text-white bg-slate-900 border focus:outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

  const borderClasses = error
    ? 'border-red-500/50 focus:border-red-500'
    : 'border-slate-700 focus:border-emerald-500';

  return (
    <div className="space-y-2">
      {label && (
        <label className={`block text-slate-400 text-xs font-semibold uppercase tracking-wide ${required ? 'after:content-["*"] after:text-red-400 after:ml-1' : ''}`}>
          {label}
        </label>
      )}
      <div className="relative">
        {Icon && (
          <Icon
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
          />
        )}
        <input
          {...props}
          disabled={disabled}
          className={`
            ${baseClasses}
            ${borderClasses}
            ${Icon ? 'pl-10' : ''}
            ${className || ''}
          `}
        />
      </div>
      {error && (
        <p className="text-red-400 text-xs font-medium">{error}</p>
      )}
      {helper && !error && (
        <p className="text-slate-500 text-xs">{helper}</p>
      )}
    </div>
  );
}
