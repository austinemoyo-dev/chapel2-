'use client';

export default function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`shimmer-loading rounded-xl ${className}`} />
  );
}
