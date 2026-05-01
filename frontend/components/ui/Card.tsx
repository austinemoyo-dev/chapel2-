'use client';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'glass' | 'elevated' | 'outline' | 'primary';
  onClick?: () => void;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const paddingMap = {
  none: '',
  sm:   'p-4',
  md:   'p-5',
  lg:   'p-7',
};

export default function Card({
  children,
  className = '',
  variant = 'default',
  onClick,
  padding = 'md',
}: CardProps) {
  const base = `rounded-2xl ${paddingMap[padding]} transition-all duration-300`;

  const variants = {
    default:  'bg-surface border border-border/70 shadow-[var(--shadow-card)]',
    glass:    'glass',
    elevated: 'bg-surface shadow-[var(--shadow-premium)] border border-border/40',
    outline:  'bg-surface border-2 border-border',
    primary:  'bg-primary-muted border border-primary/15',
  };

  const interactive = onClick
    ? `cursor-pointer hover:shadow-[var(--shadow-card-hover)] hover:-translate-y-0.5
       hover:border-primary/15 active:scale-[0.985] active:translate-y-0`
    : '';

  return (
    <div
      className={`${base} ${variants[variant]} ${interactive} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
