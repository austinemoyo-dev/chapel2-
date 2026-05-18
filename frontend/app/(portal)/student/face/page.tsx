'use client';

import { useState, useEffect } from 'react';
import { portalService, type FaceStatus } from '@/lib/api/portalService';
import { usePortalAuth } from '../../layout';

export default function StudentFacePage() {
  const { student } = usePortalAuth();
  const [status, setStatus] = useState<FaceStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    portalService.getFaceStatus().then(setStatus).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const samples  = status?.approved_samples ?? 0;
  const required = status?.required_samples ?? 3;
  const pct      = Math.min(100, (samples / required) * 100);

  return (
    <div className="min-h-dvh bg-background px-4 py-6 space-y-5 max-w-lg mx-auto">
      <div>
        <h1 className="text-xl font-bold text-foreground">Face Capture</h1>
        <p className="text-xs text-muted mt-0.5">Your face registration status</p>
      </div>

      {loading ? (
        <div className="h-48 rounded-2xl bg-surface-2 animate-pulse" />
      ) : !status ? (
        <div className="glass-panel rounded-2xl p-10 text-center">
          <p className="text-sm text-muted">Could not load face status.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="glass-panel rounded-2xl p-5 border border-border space-y-4">
            <div className="flex items-center gap-4">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-3xl ${status.face_registered ? 'bg-emerald-500/10' : 'bg-amber-500/10'}`}>
                {status.face_registered ? '✅' : '📸'}
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">
                  {status.face_registered ? 'Face Registered' : 'Registration Incomplete'}
                </p>
                <p className="text-xs text-muted mt-0.5">{samples} of {required} photos approved</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="h-3 bg-surface-2 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-700 ${status.face_registered ? 'bg-emerald-400' : 'bg-amber-400'}`}
                  style={{ width: `${pct}%` }} />
              </div>
              <div className="flex justify-between text-[10px] text-muted">
                {Array.from({ length: required }).map((_, i) => (
                  <span key={i} className={i < samples ? 'text-emerald-400 font-bold' : ''}>
                    {i < samples ? '✓' : '○'} Photo {i + 1}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {status.rejected_count > 0 && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 space-y-2">
              <p className="text-xs font-bold text-red-400">
                {status.rejected_count} photo{status.rejected_count > 1 ? 's' : ''} rejected
              </p>
              {status.rejection_reasons.length > 0 && (
                <ul className="space-y-1">
                  {status.rejection_reasons.map((r, i) => <li key={i} className="text-xs text-muted">• {r}</li>)}
                </ul>
              )}
            </div>
          )}

          {!status.face_registered && (
            <a href={`/registration/face-capture?student=${student?.id}`}
              className="block w-full h-12 rounded-xl bg-primary text-white font-semibold text-sm flex items-center justify-center">
              {status.approved_samples > 0 ? `Add ${status.remaining} more photo${status.remaining > 1 ? 's' : ''}` : 'Start Face Capture'}
            </a>
          )}

          {status.face_registered && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 text-center">
              <p className="text-xs text-emerald-400 font-semibold">
                ✓ Your face is registered and active for attendance scanning
              </p>
            </div>
          )}

          <div className="glass-panel rounded-2xl p-4 border border-border space-y-2">
            <p className="text-xs font-bold text-foreground">Tips for good photos</p>
            {['Look directly at the camera', 'Ensure good lighting on your face', 'Remove sunglasses or hats', 'Keep your face centred in the frame'].map(tip => (
              <p key={tip} className="text-xs text-muted">• {tip}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
