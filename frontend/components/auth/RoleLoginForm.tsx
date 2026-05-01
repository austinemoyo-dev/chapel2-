'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { ApiError } from '@/lib/api/client';
import type { UserRole } from '@/lib/utils/constants';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

interface RoleLoginFormProps {
  title: string;
  subtitle: string;
  emailPlaceholder: string;
  accent?: 'primary' | 'accent';
  allowedRoles: UserRole[];
  redirectTo: string;
}

export default function RoleLoginForm({
  title,
  subtitle,
  emailPlaceholder,
  accent = 'primary',
  allowedRoles,
  redirectTo,
}: RoleLoginFormProps) {
  const { login } = useAuth();
  const { addToast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const accentClass = accent === 'accent'
    ? 'text-accent bg-accent/20 border-accent/30'
    : 'text-primary bg-primary/20 border-primary/30';

  const fieldPrefix = title.toLowerCase().replace(/\s+/g, '-');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password, { allowedRoles, redirectTo });
      addToast('Login successful', 'success');
    } catch (err) {
      const msg = err instanceof ApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Login failed. Please check your credentials.';
      setError(msg);
      addToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-7 animate-fade-in">
      {/* Header */}
      <div className="text-center mb-7">
        <div className={`inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 ${accentClass}`}>
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}
                  d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"/>
          </svg>
        </div>
        <h1 className="text-2xl font-black text-foreground tracking-tight">{title}</h1>
        <p className="text-muted text-sm mt-1">{subtitle}</p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          id={`${fieldPrefix}-email`}
          label="Email address"
          type="email"
          placeholder={emailPlaceholder}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="m3 8 7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2Z"/>
            </svg>
          }
        />
        <Input
          id={`${fieldPrefix}-password`}
          label="Password"
          type="password"
          placeholder="Enter your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2Zm10-10V7a4 4 0 00-8 0v4h8Z"/>
            </svg>
          }
        />

        {error && (
          <div className="bg-danger-muted text-danger text-sm rounded-xl p-3.5 border border-danger/20 font-medium">
            {error}
          </div>
        )}

        <Button type="submit" loading={loading} className="w-full mt-2" size="lg">
          Sign In
        </Button>
      </form>
    </div>
  );
}
