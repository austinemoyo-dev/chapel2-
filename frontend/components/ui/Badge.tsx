'use client';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info';
  size?: 'sm' | 'md';
  dot?: boolean;
  className?: string;
}

export default function Badge({
  children,
  variant = 'default',
  size = 'md',
  dot = false,
  className = '',
}: BadgeProps) {
  const variants: Record<string, string> = {
    default: 'bg-surface-3 text-foreground/70 border-border',
    primary: 'bg-primary-muted text-primary border-primary/20',
    success: 'bg-success-muted text-success border-success/20',
    warning: 'bg-warning-muted text-warning border-warning/20',
    danger:  'bg-danger-muted  text-danger  border-danger/20',
    info:    'bg-info-muted    text-info    border-info/20',
  };

  const dotColors: Record<string, string> = {
    default: 'bg-muted',
    primary: 'bg-primary',
    success: 'bg-success',
    warning: 'bg-warning',
    danger:  'bg-danger',
    info:    'bg-info',
  };

  const sizes = {
    sm: 'px-2 py-0.5 text-[10px] gap-1',
    md: 'px-2.5 py-1 text-xs gap-1.5',
  };

  return (
    <span
      className={`
        inline-flex items-center font-semibold rounded-full border
        ${variants[variant]}
        ${sizes[size]}
        ${className}
      `}
    >
      {dot && (
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColors[variant]}`}/>
      )}
      {children}
    </span>
  );
}
