'use client';

import Image from 'next/image';

interface LogoProps {
  size?: number;
  className?: string;
  variant?: 'color' | 'white' | 'dark';
  showText?: boolean;
}

/**
 * VU Chapel Logo.
 *
 * HOW TO USE YOUR ACTUAL LOGO IMAGE:
 *   1. Copy your logo PNG/SVG to: frontend/public/logo.png
 *   2. That's it — this component will automatically use it.
 *
 * The SVG fallback is used when logo.png is not found.
 */
export default function Logo({
  size = 80,
  className = '',
  variant = 'color',
  showText = true,
}: LogoProps) {
  const h = Math.round(size * 0.9);

  // When logo.png is placed in /public — use it directly
  // For white/dark variants we apply CSS filters
  const filterStyle: React.CSSProperties =
    variant === 'white'
      ? { filter: 'brightness(0) invert(1)' }
      : variant === 'dark'
      ? { filter: 'brightness(0)' }
      : {};

  return (
    <div
      className={`inline-flex shrink-0 ${className}`}
      style={{ width: size, height: h }}
    >
      <Image
        src="/logo.png"
        alt="VU Chapel"
        width={size}
        height={h}
        priority
        style={{ objectFit: 'contain', ...filterStyle }}
        onError={() => {/* handled by next/image — falls back to alt text */}}
      />
    </div>
  );
}

/**
 * Horizontal lockup: logo mark + "VU Chapel" wordmark.
 * Use this in headers and navbars.
 */
export function LogoLockup({
  size = 36,
  className = '',
  variant = 'color',
}: Omit<LogoProps, 'showText'>) {
  const purple = variant === 'color' ? '#8B00FF'
               : variant === 'white' ? '#FFFFFF'
               : '#0D0B1A';
  const sub    = variant === 'color' ? 'rgba(139,0,255,0.55)'
               : variant === 'white' ? 'rgba(255,255,255,0.60)'
               : 'rgba(13,11,26,0.45)';

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <Logo size={size} variant={variant} showText={false} />
      <div className="flex flex-col leading-none select-none">
        <span
          className="font-black tracking-tight"
          style={{
            fontSize: size * 0.40,
            color: purple,
            fontFamily: "'Outfit',sans-serif",
          }}
        >
          VU Chapel
        </span>
        <span
          className="font-semibold tracking-widest uppercase"
          style={{
            fontSize: size * 0.22,
            color: sub,
            fontFamily: "'Outfit',sans-serif",
            letterSpacing: '0.14em',
          }}
        >
          Attendance
        </span>
      </div>
    </div>
  );
}
