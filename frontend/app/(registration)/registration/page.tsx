'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { registrationService } from '@/lib/api/registrationService';
import Spinner from '@/components/ui/Spinner';

export default function RegistrationPage() {
  const router = useRouter();
  const [loading, setLoading]  = useState(true);
  const [isOpen, setIsOpen]    = useState(false);
  const [semesterId, setSemId] = useState('');
  const [semName, setSemName]  = useState('');
  const [pressing, setPressing] = useState<'old' | 'new' | null>(null);

  useEffect(() => {
    let cancelled = false;
    registrationService.getStatus()
      .then((d) => {
        if (cancelled) return;
        setIsOpen(d.registration_open);
        setSemId(d.semester_id || '');
        setSemName(d.semester_name || '');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Spinner size="lg" />
        <p className="text-sm font-semibold text-muted">Checking registration…</p>
      </div>
    );
  }

  if (!isOpen) {
    return (
      <div className="px-8 py-12 text-center animate-fade-in">
        <div className="w-20 h-20 mx-auto rounded-3xl glass-purple flex items-center justify-center mb-6
                        shadow-[0_8px_32px_rgba(139,0,255,0.18)]">
          <svg className="w-9 h-9 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"/>
          </svg>
        </div>
        <h2 className="text-2xl font-black text-foreground mb-3 tracking-tight">Registration Closed</h2>
        <p className="text-muted text-sm leading-relaxed max-w-xs mx-auto">
          The semester registration window is currently closed.
          Please check back later or contact the chapel office.
        </p>
        <div className="mt-8 inline-flex items-center gap-2 px-4 py-2 rounded-full glass text-xs text-muted font-semibold">
          <span className="w-2 h-2 rounded-full bg-danger" />
          Registration is not accepting new submissions
        </div>
      </div>
    );
  }

  const navigate = (type: 'old' | 'new') =>
    router.push(`/registration/form?type=${type}&semester=${semesterId}`);

  return (
    <div className="px-5 pt-6 pb-8 animate-slide-up-fade">

      {/* Live badge + heading */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-purple mb-5
                        shadow-[0_4px_16px_rgba(139,0,255,0.15)]">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping-slow absolute inline-flex h-full w-full rounded-full bg-success opacity-75"/>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-success"/>
          </span>
          <span className="text-xs font-bold text-primary tracking-wide">
            {semName ? `${semName} · Registration Open` : 'Registration Open'}
          </span>
        </div>

        <h1 className="text-[1.6rem] font-black text-foreground tracking-tight leading-tight mb-2">
          Create Your<br/>Chapel Profile
        </h1>
        <p className="text-muted text-sm leading-relaxed max-w-[220px] mx-auto">
          You only need to register once per semester
        </p>
      </div>

      {/* Option cards */}
      <div className="space-y-3 mb-8">

        {/* ── Returning Student ── */}
        <button
          onClick={() => navigate('old')}
          onPointerDown={() => setPressing('old')}
          onPointerUp={() => setPressing(null)}
          onPointerLeave={() => setPressing(null)}
          className="w-full text-left touch-manipulation"
          style={{ WebkitTapHighlightColor: 'transparent' }}
        >
          <div className={`
            relative rounded-[1.4rem] overflow-hidden
            transition-all duration-300
            ${pressing === 'old' ? 'scale-[0.97]' : 'scale-100'}
          `}
            style={{
              background: 'rgba(255,255,255,0.58)',
              backdropFilter: 'blur(32px) saturate(200%)',
              WebkitBackdropFilter: 'blur(32px) saturate(200%)',
              border: '1.5px solid rgba(255,255,255,0.60)',
              boxShadow: pressing === 'old'
                ? '0 2px 12px rgba(124,58,237,0.22), 0 1px 0 rgba(255,255,255,0.70) inset'
                : '0 1px 0 rgba(255,255,255,0.75) inset, 0 4px 20px rgba(0,0,0,0.07), 0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            {/* Top specular shimmer */}
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent" />

            <div className="flex items-center gap-4 p-5">
              {/* Icon */}
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0
                              shadow-[0_4px_16px_rgba(124,58,237,0.22)]"
                   style={{
                     background: 'linear-gradient(135deg, #7C3AED 0%, #A855F7 100%)',
                   }}>
                <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}
                        d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z"/>
                </svg>
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <p className="font-black text-foreground text-[0.95rem] leading-tight">
                  Returning Student
                </p>
                <p className="text-muted text-xs mt-1 leading-relaxed">
                  I already have a matric number from the university
                </p>
              </div>

              {/* Arrow */}
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0
                              bg-primary/8 border border-primary/15">
                <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7"/>
                </svg>
              </div>
            </div>
          </div>
        </button>

        {/* ── New Student ── */}
        <button
          onClick={() => navigate('new')}
          onPointerDown={() => setPressing('new')}
          onPointerUp={() => setPressing(null)}
          onPointerLeave={() => setPressing(null)}
          className="w-full text-left touch-manipulation"
          style={{ WebkitTapHighlightColor: 'transparent' }}
        >
          <div className={`
            relative rounded-[1.4rem] overflow-hidden
            transition-all duration-300
            ${pressing === 'new' ? 'scale-[0.97]' : 'scale-100'}
          `}
            style={{
              background: 'rgba(255,255,255,0.45)',
              backdropFilter: 'blur(32px) saturate(200%)',
              WebkitBackdropFilter: 'blur(32px) saturate(200%)',
              border: '1.5px solid rgba(255,255,255,0.52)',
              boxShadow: pressing === 'new'
                ? '0 2px 12px rgba(168,85,247,0.22), 0 1px 0 rgba(255,255,255,0.65) inset'
                : '0 1px 0 rgba(255,255,255,0.68) inset, 0 4px 20px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)',
            }}
          >
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent" />

            <div className="flex items-center gap-4 p-5">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0
                              shadow-[0_4px_16px_rgba(168,85,247,0.22)]"
                   style={{
                     background: 'linear-gradient(135deg, #A855F7 0%, #C084FC 100%)',
                   }}>
                <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}
                        d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z"/>
                </svg>
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-black text-foreground text-[0.95rem] leading-tight">
                  New Student
                </p>
                <p className="text-muted text-xs mt-1 leading-relaxed">
                  First-year or awaiting matric number assignment
                </p>
              </div>

              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0
                              bg-accent/8 border border-accent/15">
                <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7"/>
                </svg>
              </div>
            </div>
          </div>
        </button>
      </div>

      {/* Privacy note */}
      <div className="flex items-start gap-2.5 px-4 py-3 rounded-2xl"
           style={{
             background: 'rgba(255,255,255,0.32)',
             backdropFilter: 'blur(16px)',
             WebkitBackdropFilter: 'blur(16px)',
             border: '1px solid rgba(255,255,255,0.40)',
           }}>
        <svg className="w-4 h-4 text-primary shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/>
        </svg>
        <p className="text-[11px] text-muted leading-relaxed">
          Your face data is encrypted and stored only for attendance verification. It is never shared and is deleted at semester end.
        </p>
      </div>
    </div>
  );
}
