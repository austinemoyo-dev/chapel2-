'use client';

import { type ButtonHTMLAttributes, forwardRef } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'success' | 'outline';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  loading?: boolean;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading,
      className = '',
      children,
      disabled,
      iconLeft,
      iconRight,
      ...props
    },
    ref
  ) => {
    const base =
      `inline-flex items-center justify-center font-semibold rounded-xl
       transition-all duration-200 ease-out select-none
       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50
       disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none
       active:scale-[0.96]`;

    const variants: Record<string, string> = {
      primary:
        `bg-primary text-white btn-liquid
         shadow-[0_4px_14px_rgba(124,58,237,0.35)]
         hover:bg-primary-hover hover:shadow-[0_6px_20px_rgba(124,58,237,0.45)]
         hover:-translate-y-0.5`,
      secondary:
        `bg-surface-2 text-foreground border border-border
         hover:bg-surface-3 hover:border-border-light hover:-translate-y-0.5
         shadow-[var(--shadow-xs)]`,
      outline:
        `bg-transparent text-primary border-2 border-primary/40
         hover:bg-primary-muted hover:border-primary/70 hover:-translate-y-0.5`,
      danger:
        `bg-danger text-white
         shadow-[0_4px_14px_rgba(220,38,38,0.30)]
         hover:bg-red-700 hover:shadow-[0_6px_20px_rgba(220,38,38,0.40)]
         hover:-translate-y-0.5`,
      ghost:
        `bg-transparent text-muted
         hover:text-foreground hover:bg-surface-2`,
      success:
        `bg-success text-white
         shadow-[0_4px_14px_rgba(5,150,105,0.30)]
         hover:bg-emerald-700 hover:shadow-[0_6px_20px_rgba(5,150,105,0.40)]
         hover:-translate-y-0.5`,
    };

    const sizes: Record<string, string> = {
      xs: 'px-3 py-1.5 text-xs gap-1.5',
      sm: 'px-3.5 py-2 text-sm gap-1.5',
      md: 'px-5 py-2.5 text-sm gap-2',
      lg: 'px-7 py-3.5 text-base gap-2.5',
    };

    return (
      <button
        ref={ref}
        className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <svg className="animate-spin h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
        ) : (
          iconLeft && <span className="shrink-0">{iconLeft}</span>
        )}

        {children && <span>{children}</span>}

        {!loading && iconRight && <span className="shrink-0">{iconRight}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';
export default Button;
