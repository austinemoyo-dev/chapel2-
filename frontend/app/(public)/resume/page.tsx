'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { registrationService, type PublicStudentLookupResponse } from '@/lib/api/registrationService';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Logo from '@/components/ui/Logo';

export default function ResumeCapturePage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<PublicStudentLookupResponse | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) return;

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const data = await registrationService.lookupStudent(identifier.trim());
      setResult(data);
    } catch (err: any) {
      let friendlyError = 'Could not find a student matching that identifier.';
      if (err?.response?.status === 404) {
        friendlyError = 'No student found with that Matric or Phone Number. Please check your spelling.';
      } else if (err?.response?.status >= 500) {
        friendlyError = 'Our servers are currently experiencing a slight hiccup. Please try again in a moment.';
      } else if (err?.message === 'Network Error' || err?.code === 'ERR_NETWORK') {
        friendlyError = 'Network connection failed. Please check your internet connection.';
      } else if (err?.response?.data?.error) {
        friendlyError = err.response.data.error;
      }
      setError(friendlyError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-primary/20 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[10%] -right-[10%] w-[30%] h-[30%] bg-accent/20 blur-[100px] rounded-full pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4">
        <div className="text-center mb-8">
          <Logo className="mx-auto" />
          <h2 className="mt-6 text-3xl font-extrabold text-foreground tracking-tight">
            Resume Face Capture
          </h2>
          <p className="mt-2 text-sm text-muted">
            Lost your connection? Enter your Matric or Phone Number to resume your face registration.
          </p>
        </div>

        <Card variant="glass" className="p-6 md:p-8">
          <form onSubmit={handleSearch} className="space-y-6">
            <Input
              id="identifier"
              label="Matric Number or Phone Number"
              placeholder="e.g. 210101010 or 08012345678"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
            />
            <Button
              type="submit"
              variant="primary"
              className="w-full h-12 text-lg"
              loading={loading}
              disabled={!identifier.trim() || loading}
            >
              Verify Details
            </Button>
          </form>
        </Card>

        {error && (
          <div className="mt-6 p-4 rounded-xl bg-danger/10 border border-danger/20 text-danger text-center animate-fade-in text-sm font-medium">
            {error}
          </div>
        )}

        {result && (
          <div className="mt-8 animate-slide-up">
            <Card variant="glass" className="overflow-hidden border-primary/30">
              <div className="p-6 space-y-4">
                <div className="text-center mb-6">
                  <p className="text-xl font-bold text-foreground">{result.full_name}</p>
                  <p className="text-sm text-muted">{result.department}</p>
                  <p className="text-xs font-semibold text-primary mt-1">{result.level} Level</p>
                </div>

                <div className="p-4 rounded-xl bg-surface-2 border border-border">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium">Face Capture Status</span>
                    <Badge variant={result.face_registered ? 'success' : 'warning'}>
                      {result.face_registered ? 'Registered' : 'Pending'}
                    </Badge>
                  </div>
                  
                  {result.face_registered ? (
                    <div className="mt-4 p-3 rounded-lg bg-success/10 border border-success/20 text-success text-center">
                      <p className="text-sm font-medium">Your face is already captured!</p>
                      <p className="text-xs mt-1">No further action is needed. You can safely return to the home page.</p>
                    </div>
                  ) : (
                    <div className="mt-6">
                      <Button
                        variant="primary"
                        onClick={() => router.push(`/registration/face-capture?student=${result.id}&semester=${result.semester}`)}
                        className="w-full h-12 text-lg shadow-lg"
                      >
                        Proceed to Camera
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          </div>
        )}

        <div className="mt-8 text-center relative z-10">
          <Button variant="ghost" onClick={() => router.push('/')}>
            Return Home
          </Button>
        </div>
      </div>
    </div>
  );
}
