import Logo from '@/components/ui/Logo';
import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-purple-gradient relative overflow-hidden flex flex-col">

      {/* Ambient orbs */}
      <div className="absolute -top-40 -right-28 w-96 h-96 rounded-full bg-[rgba(200,80,255,0.22)] blur-3xl pointer-events-none" aria-hidden/>
      <div className="absolute -bottom-40 -left-28 w-80 h-80 rounded-full bg-[rgba(40,0,140,0.35)] blur-3xl pointer-events-none" aria-hidden/>
      <div className="absolute top-1/3 left-1/4 w-64 h-64 rounded-full bg-[rgba(139,0,255,0.10)] blur-3xl pointer-events-none" aria-hidden/>

      {/* Dot grid */}
      <div className="absolute inset-0 opacity-[0.06] pointer-events-none"
           style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '28px 28px' }}
           aria-hidden/>

      {/* Arch decorative SVGs */}
      <div className="absolute top-0 right-0 w-56 h-72 pointer-events-none select-none opacity-40" aria-hidden>
        <svg viewBox="0 0 200 280" fill="none">
          <path d="M20,270 L20,110 C20,28 180,28 180,110 L180,270 Z" stroke="rgba(255,255,255,0.18)" strokeWidth="2" fill="none"/>
          <path d="M55,270 L55,128 C55,78 145,78 145,128 L145,270 Z" stroke="rgba(255,255,255,0.10)" strokeWidth="1.5" fill="none"/>
          <circle cx="100" cy="82" r="30" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" fill="none"/>
          <line x1="100" y1="52" x2="100" y2="112" stroke="rgba(255,255,255,0.08)" strokeWidth="1"/>
          <line x1="70"  y1="82" x2="130" y2="82"  stroke="rgba(255,255,255,0.08)" strokeWidth="1"/>
        </svg>
      </div>

      {/* Nav */}
      <nav className="relative z-20 flex items-center justify-between px-6 pt-8 pb-4 max-w-md mx-auto w-full">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo size={38} variant="white" showText={false}/>
          <div>
            <p className="text-white font-black text-sm leading-none">VU Chapel</p>
            <p className="text-white/45 text-[10px] font-semibold tracking-wider uppercase">Staff Portal</p>
          </div>
        </Link>
        <Link href="/"
              className="text-xs text-white/60 hover:text-white font-semibold transition-colors
                         px-3 py-1.5 rounded-xl bg-white/10 border border-white/15 hover:bg-white/18">
          ← Home
        </Link>
      </nav>

      {/* Main card */}
      <div className="relative z-10 flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md animate-scale-in">
          <div className="glass-panel rounded-3xl shadow-[0_32px_80px_rgba(0,0,0,0.30)] overflow-hidden">
            {children}
          </div>
        </div>
      </div>

      {/* Footer credits */}
      <p className="relative z-10 text-center text-[10px] text-white/20 pb-6 px-4 font-medium">
        Powered by <span className="text-white/35 font-bold">Dash &amp; Co.</span> × <span className="text-white/35 font-bold">FY Creative</span>
      </p>
    </div>
  );
}
