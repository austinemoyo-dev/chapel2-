'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Logo from '@/components/ui/Logo';

const STEPS = [
  { label: 'Type',    path: '/registration',              icon: '👤' },
  { label: 'Details', path: '/registration/form',         icon: '📝' },
  { label: 'Face ID', path: '/registration/face-capture', icon: '📷' },
  { label: 'Done',    path: '/registration/status',       icon: '✅' },
];

function StepBar() {
  const pathname = usePathname();
  const idx = STEPS.findIndex((s) => pathname?.endsWith(s.path.split('/').pop()!));
  const active = idx >= 0 ? idx : 0;

  return (
    <div className="flex items-center justify-center gap-0 px-2 py-4">
      {STEPS.map((step, i) => {
        const done    = i < active;
        const current = i === active;
        return (
          <div key={step.path} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5 relative">
              <div
                className={`
                  w-10 h-10 rounded-2xl flex items-center justify-center text-sm
                  font-bold transition-all duration-500
                  ${done
                    ? 'bg-success text-white shadow-[0_4px_16px_rgba(5,150,105,0.5)]'
                    : current
                      ? 'bg-white text-primary shadow-[0_4px_20px_rgba(255,255,255,0.4)]'
                      : 'bg-white/15 text-white/50 border border-white/20'}
                `}
              >
                {done ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                  </svg>
                ) : current ? (
                  <span>{step.icon}</span>
                ) : (
                  <span className="text-xs">{i + 1}</span>
                )}
              </div>
              <span className={`text-[10px] font-bold tracking-wide transition-colors ${
                current ? 'text-white' : done ? 'text-success' : 'text-white/35'
              }`}>
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className="mb-5 mx-1 w-8 h-0.5 rounded-full transition-all duration-700"
                   style={{ background: i < active ? 'rgba(5,150,105,0.8)' : 'rgba(255,255,255,0.15)' }}/>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function RegistrationLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-purple-gradient relative overflow-hidden">

      {/* Ambient orbs */}
      <div className="absolute -top-40 -left-20 w-80 h-80 rounded-full bg-[rgba(200,80,255,0.2)] blur-3xl pointer-events-none" aria-hidden/>
      <div className="absolute -bottom-32 -right-16 w-72 h-72 rounded-full bg-[rgba(60,0,160,0.3)] blur-3xl pointer-events-none" aria-hidden/>

      {/* Dot grid */}
      <div className="absolute inset-0 opacity-[0.06] pointer-events-none"
           style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '28px 28px' }}
           aria-hidden/>

      {/* ── Header ── */}
      <header className="relative z-20 flex items-center justify-between px-6 pt-6 pb-2 max-w-lg mx-auto">
        <Link href="/" className="flex items-center gap-2.5 group">
          <Logo size={40} variant="white" showText={false}/>
          <div>
            <p className="text-white font-black text-sm leading-none">VU Chapel</p>
            <p className="text-white/50 text-[10px] font-semibold tracking-wider">Registration</p>
          </div>
        </Link>

        <Link href="/"
              className="px-4 py-2 rounded-xl bg-white/10 border border-white/20
                         text-white/80 text-xs font-semibold hover:bg-white/18 transition-colors">
          Back to Home
        </Link>
      </header>

      {/* ── Step progress ── */}
      <div className="relative z-10 max-w-lg mx-auto px-4">
        <StepBar />
      </div>

      {/* ── Content inside glass card ── */}
      <main className="relative z-10 max-w-lg mx-auto px-4 pb-12">
        <div className="glass-panel rounded-3xl overflow-hidden shadow-[0_24px_64px_rgba(0,0,0,0.25)]">
          {children}
        </div>
      </main>

      {/* Footer credit */}
      <p className="relative z-10 text-center text-[10px] text-white/25 pb-6 px-4 font-medium">
        Powered by <span className="text-white/40 font-bold">Dash &amp; Co.</span> × <span className="text-white/40 font-bold">FY Creative</span>
      </p>
    </div>
  );
}
