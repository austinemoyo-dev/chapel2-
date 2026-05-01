'use client';

import { type InputHTMLAttributes, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, icon, iconRight, className = '', id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-semibold text-foreground/80">
            {label}
          </label>
        )}
        <div className="relative group">
          {icon && (
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted
                            group-focus-within:text-primary transition-colors pointer-events-none">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={`
              w-full bg-surface border rounded-xl text-sm text-foreground
              placeholder:text-muted/45 transition-all duration-200
              px-4 py-3
              border-border
              shadow-[var(--shadow-xs)]
              focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15
              focus:shadow-[0_0_0_3px_rgba(124,58,237,0.08)]
              hover:border-border-light
              ${icon      ? 'pl-10'  : ''}
              ${iconRight ? 'pr-10'  : ''}
              ${error     ? 'border-danger focus:border-danger focus:ring-danger/15' : ''}
              ${className}
            `}
            {...props}
          />
          {iconRight && (
            <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none">
              {iconRight}
            </div>
          )}
        </div>
        {error && (
          <p className="text-xs text-danger font-medium flex items-center gap-1">
            <svg className="w-3 h-3 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"/>
            </svg>
            {error}
          </p>
        )}
        {hint && !error && (
          <p className="text-xs text-muted">{hint}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
export default Input;
