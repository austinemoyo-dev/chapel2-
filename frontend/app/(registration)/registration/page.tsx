'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { registrationService } from '@/lib/api/registrationService';
import Spinner from '@/components/ui/Spinner';

export default function RegistrationPage() {
  const router = useRouter();
  const [loading, setLoading]   = useState(true);
  const [isOpen, setIsOpen]     = useState(false);
  const [semesterId, setSemId]  = useState('');
  const [hovering, setHovering] = useState<'old' | 'new' | null>(null);

  useEffect(() => {
    let cancelled = false;
    registrationService.getStatus()
      .then((d) => {
        if (cancelled) return;
        setIsOpen(d.registration_open);
        setSemId(d.semester_id || '');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Spinner size="lg" />
        <p className="text-sm font-semibold text-muted">Checking registration status…</p>
      </div>
    );
  }

  if (!isOpen) {
    return (
      <div className="p-8 text-center animate-fade-in">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-warning-muted flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008z"/>
          </svg>
        </div>
        <h2 className="text-xl font-black text-foreground mb-2">Registration Closed</h2>
        <p className="text-muted text-sm leading-relaxed">
          The registration window is currently closed. Please check back later or contact the chapel administration.
        </p>
      </div>
    );
  }

  const navigate = (type: 'old' | 'new') =>
    router.push(`/registration/form?type=${type}&semester=${semesterId}`);

  return (
    <div className="p-6 sm:p-8 animate-fade-in">
      {/* Heading */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full
                        bg-success-muted border border-success/20 text-success text-xs font-bold mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse"/>
          Registration Open
        </div>
        <h1 className="text-2xl font-black text-foreground tracking-tight mb-1.5">
          Create Your Profile
        </h1>
        <p className="text-muted text-sm">
          Select your student type to get started
        </p>
      </div>

      {/* Student type cards */}
      <div className="space-y-3 mb-6">
        {/* Old student */}
        <button
          onClick={() => navigate('old')}
          onMouseEnter={() => setHovering('old')}
          onMouseLeave={() => setHovering(null)}
          className="w-full text-left group"
        >
          <div className={`
            relative p-5 rounded-2xl border-2 transition-all duration-300
            ${hovering === 'old'
              ? 'border-primary bg-primary-muted shadow-[0_4px_24px_rgba(139,0,255,0.15)]'
              : 'border-border bg-surface hover:border-primary/40'}
          `}>
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors
                              ${hovering === 'old' ? 'bg-primary' : 'bg-primary-muted'}`}>
                <svg className={`w-6 h-6 transition-colors ${hovering === 'old' ? 'text-white' : 'text-primary'}`}
                     fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}
                        d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0"/>
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="font-black text-foreground text-base">Returning Student</h3>
                <p className="text-sm text-muted mt-0.5">I already have a matric number</p>
              </div>
              <svg className={`w-5 h-5 transition-all duration-300 ${hovering === 'old' ? 'text-primary translate-x-1' : 'text-muted/40'}`}
                   fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
              </svg>
            </div>
          </div>
        </button>

        {/* New student */}
        <button
          onClick={() => navigate('new')}
          onMouseEnter={() => setHovering('new')}
          onMouseLeave={() => setHovering(null)}
          className="w-full text-left group"
        >
          <div className={`
            relative p-5 rounded-2xl border-2 transition-all duration-300
            ${hovering === 'new'
              ? 'border-accent bg-[rgba(168,85,247,0.08)] shadow-[0_4px_24px_rgba(168,85,247,0.15)]'
              : 'border-border bg-surface hover:border-accent/40'}
          `}>
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors
                              ${hovering === 'new' ? 'bg-accent' : 'bg-[rgba(168,85,247,0.1)]'}`}>
                <svg className={`w-6 h-6 transition-colors ${hovering === 'new' ? 'text-white' : 'text-accent'}`}
                     fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}
                        d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/>
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="font-black text-foreground text-base">New Student</h3>
                <p className="text-sm text-muted mt-0.5">I don&apos;t have a matric number yet</p>
              </div>
              <svg className={`w-5 h-5 transition-all duration-300 ${hovering === 'new' ? 'text-accent translate-x-1' : 'text-muted/40'}`}
                   fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
              </svg>
            </div>
          </div>
        </button>
      </div>

      <p className="text-center text-xs text-muted">
        Your data is secured and used only for chapel attendance tracking.
      </p>
    </div>
  );
}
