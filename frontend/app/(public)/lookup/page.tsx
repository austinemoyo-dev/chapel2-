'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { registrationService, type PublicStudentLookupResponse } from '@/lib/api/registrationService';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Logo from '@/components/ui/Logo';

export default function LookupPage() {
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
      setError(err?.response?.data?.error || 'Could not find a student matching that identifier.');
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
            Service Check
          </h2>
          <p className="mt-2 text-sm text-muted">
            Find your assigned Service Group and check your face capture status.
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
              Check Status
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
              <div className="bg-primary/10 p-6 text-center border-b border-primary/20">
                <p className="text-sm font-medium text-primary mb-1">Your Assigned Service Group</p>
                <h3 className="text-4xl font-extrabold text-foreground">
                  {result.service_group || 'Unassigned'}
                </h3>
              </div>
              
              <div className="p-6 space-y-4">
                <div className="text-center mb-6">
                  <p className="text-xl font-bold text-foreground">{result.full_name}</p>
                  <p className="text-sm text-muted">{result.department}</p>
                </div>

                <div className="p-4 rounded-xl bg-surface-2 border border-border">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium">Face Capture Status</span>
                    <Badge variant={result.face_registered ? 'success' : 'warning'}>
                      {result.face_registered ? 'Registered' : 'Pending'}
                    </Badge>
                  </div>
                  {!result.face_registered && (
                    <p className="text-xs text-muted mt-2 leading-relaxed">
                      Your face has not been captured yet. Please proceed to the Chapel admin desk during the <strong className="text-foreground">{result.service_group || 'service'}</strong> to complete your registration.
                    </p>
                  )}
                  {result.face_registered && (
                    <p className="text-xs text-success mt-2 leading-relaxed">
                      You are fully registered! You can proceed directly to the smart scanners for attendance.
                    </p>
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
