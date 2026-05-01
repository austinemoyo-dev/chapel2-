'use client';

import { useState, useEffect, Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { registrationService } from '@/lib/api/registrationService';
import Spinner from '@/components/ui/Spinner';

// ============================================================================
// Confetti particle component
// ============================================================================

function Confetti() {
  const particles = useMemo(() => {
    const colors = ['#6366f1', '#a855f7', '#10b981', '#f59e0b', '#ec4899', '#3b82f6'];
    return Array.from({ length: 40 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      color: colors[Math.floor(Math.random() * colors.length)],
      delay: `${Math.random() * 2}s`,
      duration: `${2 + Math.random() * 3}s`,
      size: `${4 + Math.random() * 6}px`,
      rotate: `${Math.random() * 360}deg`,
    }));
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-sm"
          style={{
            left: p.left,
            top: '-10px',
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            transform: `rotate(${p.rotate})`,
            animation: `confetti-fall ${p.duration} ${p.delay} ease-out forwards`,
          }}
        />
      ))}
    </div>
  );
}

// ============================================================================
// Main Status Content
// ============================================================================

function StatusContent() {
  const searchParams = useSearchParams();
  const studentId = searchParams.get('student') || '';

  const [status, setStatus] = useState<{
    approved_samples: number;
    face_registered: boolean;
    is_active: boolean;
    message: string;
  } | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [regData, setRegData] = useState<{
    studentName?: string;
    systemId?: string;
    serviceGroup?: string;
    duplicateFlag?: boolean;
  } | null>(null);

  // Load registration data from sessionStorage
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('chapel_registration');
      if (stored) {
        setRegData(JSON.parse(stored));
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!studentId) return;
    let active = true;

    const fetchStatus = async () => {
      try {
        const data = await registrationService.getFaceStatus(studentId);
        if (!active) return;
        setStatus(data);

        if (data.face_registered && !showConfetti) {
          setShowConfetti(true);
          // Clean up sessionStorage — registration is complete
          setTimeout(() => sessionStorage.removeItem('chapel_registration'), 1000);
        }
      } catch { /* retry on next poll */ }
    };

    fetchStatus();
    const poll = setInterval(fetchStatus, 3000);

    return () => {
      active = false;
      clearInterval(poll);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  if (!status) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Spinner size="lg" />
        <p className="text-sm text-muted">Loading registration status...</p>
      </div>
    );
  }

  // ============================================================================
  // Complete state
  // ============================================================================

  if (status.face_registered) {
    const isDuplicate = regData?.duplicateFlag;

    return (
      <>
        {showConfetti && <Confetti />}

        <div className="text-center space-y-6 py-6 animate-fade-in">
          {/* Success icon */}
          <div className="flex justify-center">
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-success-muted flex items-center justify-center animate-success-check">
                <svg className="w-12 h-12 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              {/* Glow rings */}
              <div className="absolute inset-0 rounded-full border-2 border-success/20 animate-ping" style={{ animationDuration: '2s' }} />
              <div className="absolute -inset-2 rounded-full border border-success/10 animate-ping" style={{ animationDuration: '3s' }} />
            </div>
          </div>

          {/* Title */}
          <div>
            <h2 className="text-2xl font-bold gradient-text">Registration Complete!</h2>
            <p className="text-muted text-sm mt-1">{status.message}</p>
          </div>

          {/* Student info card */}
          <div className="bg-surface-2 border border-border rounded-2xl p-5 text-left space-y-3.5 mx-auto max-w-sm">
            {regData?.studentName && (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary-muted flex items-center justify-center">
                  <span className="text-lg">👤</span>
                </div>
                <div>
                  <p className="text-xs text-muted">Full Name</p>
                  <p className="text-sm font-semibold">{regData.studentName}</p>
                </div>
              </div>
            )}

            {regData?.systemId && (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
                  <span className="text-lg">🆔</span>
                </div>
                <div>
                  <p className="text-xs text-muted">System ID</p>
                  <p className="text-sm font-semibold font-mono tracking-wider">{regData.systemId}</p>
                </div>
              </div>
            )}

            {regData?.serviceGroup && (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-success-muted flex items-center justify-center">
                  <span className="text-lg">⛪</span>
                </div>
                <div>
                  <p className="text-xs text-muted">Assigned Service</p>
                  <p className="text-sm font-semibold">Service {regData.serviceGroup.replace('S', '')}</p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary-muted flex items-center justify-center">
                <span className="text-lg">📷</span>
              </div>
              <div>
                <p className="text-xs text-muted">Face Samples</p>
                <p className="text-sm font-semibold">{status.approved_samples} verified</p>
              </div>
            </div>
          </div>

          {/* Status badge */}
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium ${
            isDuplicate
              ? 'bg-warning-muted text-warning border border-warning/30'
              : status.is_active
                ? 'bg-success-muted text-success border border-success/30'
                : 'bg-primary-muted text-primary border border-primary/30'
          }`}>
            <div className={`w-2 h-2 rounded-full ${
              isDuplicate ? 'bg-warning animate-pulse' : status.is_active ? 'bg-success' : 'bg-primary animate-pulse'
            }`} />
            {isDuplicate
              ? 'Under Review — Admin will verify'
              : status.is_active
                ? 'Account Active — You can attend services'
                : 'Processing — Your account is being activated'}
          </div>

          {/* Help text */}
          {isDuplicate && (
            <div className="bg-warning-muted/50 border border-warning/20 rounded-xl p-3.5 text-sm text-left">
              <p className="font-medium text-warning mb-1">⚠️ Duplicate Review</p>
              <p className="text-muted text-xs">
                Your registration matched an existing record. An administrator will review and approve your account. 
                This usually takes less than 24 hours.
              </p>
            </div>
          )}

          {/* Save reminder */}
          {regData?.systemId && (
            <div className="bg-surface-2 border border-border rounded-xl p-3 text-xs text-muted">
              <p className="font-medium text-foreground mb-1">📌 Save your System ID</p>
              <p>Keep <span className="font-mono font-bold text-primary">{regData.systemId}</span> safe. You may need it to update your matric number later.</p>
            </div>
          )}
        </div>
      </>
    );
  }

  // ============================================================================
  // Processing state (face not yet registered)
  // ============================================================================

  return (
    <div className="text-center space-y-6 py-8 animate-fade-in">
      <div className="flex justify-center">
        <div className="relative">
          <Spinner size="lg" />
          <div className="absolute -inset-4 rounded-full border border-primary/10 animate-ping" style={{ animationDuration: '3s' }} />
        </div>
      </div>
      <div>
        <h2 className="text-xl font-semibold">Processing Face Samples...</h2>
        <p className="text-muted text-sm mt-1">
          {status.approved_samples}/3 samples approved
        </p>
      </div>

      {/* Progress bar */}
      <div className="max-w-xs mx-auto">
        <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-success rounded-full transition-all duration-700"
            style={{ width: `${Math.min(100, (status.approved_samples / 3) * 100)}%` }}
          />
        </div>
      </div>

      <p className="text-xs text-muted">This page will update automatically</p>
    </div>
  );
}

export default function StatusPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Spinner /></div>}>
      <StatusContent />
    </Suspense>
  );
}
