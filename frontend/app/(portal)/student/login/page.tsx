'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { portalService } from '@/lib/api/portalService';
import { usePortalAuth } from '../../layout';

type Screen = 'identifier' | 'login' | 'setup_intro' | 'setup_face' | 'no_face';

export default function StudentLoginPage() {
  const { login } = usePortalAuth();
  const router    = useRouter();

  const [screen, setScreen]         = useState<Screen>('identifier');
  const [identifier, setIdentifier] = useState('');
  const [lookupResult, setLookupResult] = useState<any>(null);
  const [password, setPassword]     = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPw, setConfirmPw]   = useState('');
  const [faceFile, setFaceFile]     = useState<File | null>(null);
  const [facePreview, setFacePreview] = useState<string | null>(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');

  async function handleLookup() {
    if (!identifier.trim()) return;
    setLoading(true); setError('');
    try {
      const result = await portalService.lookup(identifier.trim());
      setLookupResult(result);
      if (!result.face_registered)  setScreen('no_face');
      else if (result.has_account)  setScreen('login');
      else                          setScreen('setup_intro');
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function handleLogin() {
    setLoading(true); setError('');
    try {
      const res = await portalService.login(identifier.trim(), password);
      login(res.token, res.student);
      router.push('/student');
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function handleSetup() {
    if (!faceFile)              { setError('Please take or upload a photo of your face.'); return; }
    if (newPassword !== confirmPw) { setError('Passwords do not match.'); return; }
    if (newPassword.length < 6) { setError('Password must be at least 6 characters.'); return; }

    setLoading(true); setError('');
    const fd = new FormData();
    fd.append('identifier', identifier.trim());
    fd.append('password', newPassword);
    fd.append('confirm_password', confirmPw);
    fd.append('face_image', faceFile);
    try {
      const res = await portalService.setupPassword(fd);
      login(res.token, res.student);
      router.push('/student');
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  function handleFaceSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFaceFile(file);
    setFacePreview(URL.createObjectURL(file));
  }

  return (
    <div className="min-h-dvh bg-background flex flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm space-y-6">

        <div className="text-center space-y-1">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto text-3xl">⛪</div>
          <h1 className="text-2xl font-bold text-foreground mt-3">Student Portal</h1>
          <p className="text-sm text-muted">Access your attendance and profile</p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400">{error}</div>
        )}

        {screen === 'identifier' && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-muted uppercase tracking-wider block mb-2">
                Phone Number or Matric Number
              </label>
              <input
                className="w-full h-12 px-4 rounded-xl bg-surface-2 border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="e.g. 08012345678 or CHU/2021/001"
                value={identifier}
                onChange={e => { setIdentifier(e.target.value); setError(''); }}
                onKeyDown={e => e.key === 'Enter' && handleLookup()}
              />
            </div>
            <button onClick={handleLookup} disabled={loading || !identifier.trim()}
              className="w-full h-12 rounded-xl bg-primary text-white font-semibold text-sm disabled:opacity-50">
              {loading ? 'Looking up...' : 'Continue'}
            </button>
          </div>
        )}

        {screen === 'login' && (
          <div className="space-y-4">
            <div className="bg-surface-2 rounded-xl px-4 py-3">
              <p className="text-xs text-muted">Signing in as</p>
              <p className="text-sm font-bold text-foreground">{lookupResult?.full_name}</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted uppercase tracking-wider block mb-2">Password</label>
              <input type="password"
                className="w-full h-12 px-4 rounded-xl bg-surface-2 border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="Enter your password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
              />
            </div>
            <button onClick={handleLogin} disabled={loading || !password}
              className="w-full h-12 rounded-xl bg-primary text-white font-semibold text-sm disabled:opacity-50">
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
            <button onClick={() => { setScreen('setup_intro'); setError(''); }}
              className="w-full text-center text-xs text-muted underline">
              Forgot password? Reset via face verification
            </button>
            <button onClick={() => { setScreen('identifier'); setError(''); }} className="w-full text-center text-xs text-muted">
              ← Use a different number
            </button>
          </div>
        )}

        {screen === 'setup_intro' && (
          <div className="space-y-4">
            <div className="bg-surface-2 rounded-xl px-4 py-3">
              <p className="text-sm font-bold text-foreground">{lookupResult?.full_name}</p>
              <p className="text-xs text-muted mt-0.5">Setting up portal access</p>
            </div>
            <div className="bg-primary/10 border border-primary/20 rounded-xl px-4 py-3 space-y-1">
              <p className="text-xs font-bold text-primary">How it works</p>
              <p className="text-xs text-muted leading-relaxed">
                To protect your account, you need to verify your identity with a face photo before setting a password.
                This ensures nobody else can access your account.
              </p>
            </div>
            <button onClick={() => setScreen('setup_face')}
              className="w-full h-12 rounded-xl bg-primary text-white font-semibold text-sm">
              Continue with Face Verification
            </button>
            <button onClick={() => { setScreen('identifier'); setError(''); }} className="w-full text-center text-xs text-muted">← Back</button>
          </div>
        )}

        {screen === 'setup_face' && (
          <div className="space-y-4">
            <p className="text-sm font-semibold text-foreground">Take or upload a clear face photo</p>
            <label className="block cursor-pointer">
              <div className={`w-full h-48 rounded-2xl border-2 border-dashed flex items-center justify-center overflow-hidden ${facePreview ? 'border-primary' : 'border-border'}`}>
                {facePreview
                  ? <img src={facePreview} alt="face" className="w-full h-full object-cover rounded-2xl" />
                  : <div className="text-center space-y-2"><span className="text-4xl">📸</span><p className="text-xs text-muted">Tap to select a photo</p></div>
                }
              </div>
              <input type="file" accept="image/*" capture="user" className="hidden" onChange={handleFaceSelect} />
            </label>
            <div>
              <label className="text-xs font-semibold text-muted uppercase tracking-wider block mb-2">New Password</label>
              <input type="password"
                className="w-full h-12 px-4 rounded-xl bg-surface-2 border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="At least 6 characters" value={newPassword}
                onChange={e => { setNewPassword(e.target.value); setError(''); }} />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted uppercase tracking-wider block mb-2">Confirm Password</label>
              <input type="password"
                className="w-full h-12 px-4 rounded-xl bg-surface-2 border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="Repeat password" value={confirmPw}
                onChange={e => { setConfirmPw(e.target.value); setError(''); }} />
            </div>
            <button onClick={handleSetup} disabled={loading || !faceFile || !newPassword || !confirmPw}
              className="w-full h-12 rounded-xl bg-primary text-white font-semibold text-sm disabled:opacity-50">
              {loading ? 'Verifying face...' : 'Set Password & Sign In'}
            </button>
          </div>
        )}

        {screen === 'no_face' && (
          <div className="space-y-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto text-3xl">📸</div>
            <p className="text-sm font-bold text-foreground">Complete face capture first</p>
            <p className="text-xs text-muted leading-relaxed">
              Hi <strong>{lookupResult?.full_name}</strong>, your face capture is not complete.
              You need to register your face before you can access the portal.
            </p>
            <a href={`/registration/face-capture?student=${lookupResult?.student_id}`}
              className="block w-full h-12 rounded-xl bg-primary text-white font-semibold text-sm flex items-center justify-center">
              Go to Face Capture
            </a>
            <button onClick={() => { setScreen('identifier'); setError(''); }} className="w-full text-center text-xs text-muted">← Back</button>
          </div>
        )}
      </div>
    </div>
  );
}
