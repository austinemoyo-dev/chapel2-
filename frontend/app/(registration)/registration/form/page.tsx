'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { registrationService } from '@/lib/api/registrationService';
import { useToast } from '@/providers/ToastProvider';
import { ApiError } from '@/lib/api/client';
import { toTitleCase } from '@/lib/utils/formatters';
import { LEVELS, GENDERS } from '@/lib/utils/constants';
import Spinner from '@/components/ui/Spinner';

function RegistrationFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { addToast } = useToast();
  const studentType = searchParams.get('type') || 'old';
  const semesterId = searchParams.get('semester') || '';

  const [form, setForm] = useState({
    full_name: '',
    phone_number: '',
    matric_number: '',
    department: '',
    level: '' as string,
    gender: '' as string,
  });
  const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [duplicateWarning, setDuplicateWarning] = useState<Record<string, unknown> | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // Prevent leaving the page after form submission (before face capture completes)
  useEffect(() => {
    if (!submitted) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'Registration is not complete. You still need to capture your face. Are you sure you want to leave?';
      return e.returnValue;
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [submitted]);

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.full_name.trim() || form.full_name.trim().split(/\s+/).length < 2) {
      errs.full_name = 'Enter your full name (at least 2 words)';
    }
    if (!form.phone_number.trim()) errs.phone_number = 'Phone number is required';
    if (studentType === 'old' && !form.matric_number.trim()) {
      errs.matric_number = 'Matric number is required for old students';
    }
    if (!form.department.trim()) errs.department = 'Department is required';
    if (!form.level) errs.level = 'Select your level';
    if (!form.gender) errs.gender = 'Select your gender';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    setDuplicateWarning(null);

    try {
      const result = await registrationService.registerStudent({
        student_type: studentType as 'old' | 'new',
        full_name: toTitleCase(form.full_name),
        phone_number: form.phone_number.trim(),
        matric_number: studentType === 'old' ? form.matric_number.trim().toUpperCase() : undefined,
        department: form.department.trim(),
        level: form.level as typeof LEVELS[number],
        gender: form.gender as 'male' | 'female',
        profile_photo: profilePhoto || undefined,
        semester: semesterId,
      });

      // Store student info in sessionStorage for the face capture step
      sessionStorage.setItem('chapel_registration', JSON.stringify({
        studentId: result.id,
        studentName: result.full_name,
        systemId: result.system_id,
        serviceGroup: result.service_group,
        semesterId: semesterId,
        duplicateFlag: result.duplicate_flag,
      }));

      setSubmitted(true);

      // Check for duplicate flags
      if (result.duplicate_flag && result.duplicate_results) {
        setDuplicateWarning(result.duplicate_results);
        addToast('Registration submitted but flagged for review', 'warning');
      } else {
        addToast('Details saved! Now complete face capture.', 'success');
      }

      // Navigate to face capture
      router.push(`/registration/face-capture?student=${result.id}&semester=${semesterId}`);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.data && typeof err.data === 'object') {
          const fieldErrors: Record<string, string> = {};
          Object.entries(err.data).forEach(([k, v]) => {
            if (Array.isArray(v)) fieldErrors[k] = v.join(', ');
            else if (typeof v === 'string') fieldErrors[k] = v;
          });
          setErrors(fieldErrors);
        }
        addToast(err.message, 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-5 sm:p-7 animate-fade-in">

      {/* Header */}
      <div className="mb-6">
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full
                        bg-primary-muted border border-primary/15 text-primary text-xs font-bold mb-3">
          {studentType === 'old' ? '🎓 Returning Student' : '✨ New Student'}
        </div>
        <h2 className="text-xl font-black text-foreground tracking-tight">Your Details</h2>
        <p className="text-sm text-muted mt-0.5">All fields required. Face capture comes next.</p>
      </div>

      {/* Duplicate warning */}
      {duplicateWarning && (
        <div className="glass-purple rounded-2xl p-4 mb-5 border border-warning/20">
          <p className="font-bold text-warning text-sm mb-1">Possible duplicate detected</p>
          <p className="text-muted text-xs">Flagged for admin review — you can still continue.</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Full name */}
        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-foreground/70 uppercase tracking-wide">
            Full Name
          </label>
          <input
            id="reg-full-name"
            type="text"
            placeholder="John Emmanuel Doe"
            value={form.full_name}
            onChange={(e) => handleChange('full_name', e.target.value)}
            onBlur={(e) => handleChange('full_name', toTitleCase(e.target.value))}
            required
            className="input-glass w-full rounded-2xl px-4 py-3.5 text-sm text-foreground
                       placeholder:text-muted/45 focus:outline-none"
            style={{ fontSize: '16px' /* prevent iOS zoom */ }}
          />
          {errors.full_name && <p className="text-xs text-danger font-medium">{errors.full_name}</p>}
        </div>

        {/* Phone */}
        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-foreground/70 uppercase tracking-wide">
            Phone Number
          </label>
          <input
            id="reg-phone"
            type="tel"
            placeholder="+234 xxx xxx xxxx"
            value={form.phone_number}
            onChange={(e) => handleChange('phone_number', e.target.value)}
            required
            className="input-glass w-full rounded-2xl px-4 py-3.5 text-sm text-foreground
                       placeholder:text-muted/45 focus:outline-none"
            style={{ fontSize: '16px' }}
          />
          {errors.phone_number && <p className="text-xs text-danger font-medium">{errors.phone_number}</p>}
        </div>

        {/* Matric (old students) */}
        {studentType === 'old' && (
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-foreground/70 uppercase tracking-wide">
              Matric Number
            </label>
            <input
              id="reg-matric"
              type="text"
              placeholder="CSC/2023/001"
              value={form.matric_number}
              onChange={(e) => handleChange('matric_number', e.target.value)}
              required
              className="input-glass w-full rounded-2xl px-4 py-3.5 text-sm text-foreground
                         placeholder:text-muted/45 focus:outline-none"
              style={{ fontSize: '16px' }}
            />
            {errors.matric_number && <p className="text-xs text-danger font-medium">{errors.matric_number}</p>}
          </div>
        )}

        {/* Department */}
        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-foreground/70 uppercase tracking-wide">
            Department
          </label>
          <input
            id="reg-department"
            type="text"
            placeholder="Computer Science"
            value={form.department}
            onChange={(e) => handleChange('department', e.target.value)}
            required
            className="input-glass w-full rounded-2xl px-4 py-3.5 text-sm text-foreground
                       placeholder:text-muted/45 focus:outline-none"
            style={{ fontSize: '16px' }}
          />
          {errors.department && <p className="text-xs text-danger font-medium">{errors.department}</p>}
        </div>

        {/* Level + Gender */}
        <div className="grid grid-cols-2 gap-3">
          {[
            {
              id: 'reg-level', label: 'Level', field: 'level',
              options: LEVELS.map((l) => ({ value: l, label: `${l} Level` })),
            },
            {
              id: 'reg-gender', label: 'Gender', field: 'gender',
              options: GENDERS.map((g) => ({ value: g, label: g.charAt(0).toUpperCase() + g.slice(1) })),
            },
          ].map(({ id, label, field, options }) => (
            <div key={id} className="space-y-1.5">
              <label className="block text-xs font-bold text-foreground/70 uppercase tracking-wide">{label}</label>
              <select
                id={id}
                value={form[field as keyof typeof form]}
                onChange={(e) => handleChange(field, e.target.value)}
                required
                className="input-glass w-full rounded-2xl px-4 py-3.5 text-sm text-foreground
                           focus:outline-none appearance-none bg-no-repeat"
                style={{ fontSize: '16px', backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'8\' viewBox=\'0 0 12 8\'%3E%3Cpath d=\'M1 1l5 5 5-5\' stroke=\'%236E6A8A\' stroke-width=\'1.5\' fill=\'none\'/%3E%3C/svg%3E")', backgroundPosition: 'right 14px center', backgroundSize: '12px 8px' }}
              >
                <option value="">Select</option>
                {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {errors[field] && <p className="text-xs text-danger font-medium">{errors[field]}</p>}
            </div>
          ))}
        </div>

        {/* Profile photo */}
        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-foreground/70 uppercase tracking-wide">
            Profile Photo <span className="font-normal text-muted normal-case">(optional)</span>
          </label>
          <label className="flex items-center gap-3 input-glass rounded-2xl px-4 py-3.5 cursor-pointer">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
            </div>
            <span className="text-sm text-muted flex-1">
              {profilePhoto ? profilePhoto.name : 'Tap to choose a photo'}
            </span>
            <input type="file" accept="image/*" capture="user" className="hidden"
                   onChange={(e) => setProfilePhoto(e.target.files?.[0] || null)}/>
          </label>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="btn-liquid w-full py-4 rounded-2xl bg-primary text-white font-black text-base
                     shadow-[0_6px_24px_rgba(139,0,255,0.40)] disabled:opacity-50
                     active:scale-[0.97] touch-manipulation mt-2"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Saving…
            </span>
          ) : 'Continue to Face Capture →'}
        </button>
      </form>
    </div>
  );
}

export default function RegistrationFormPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Spinner /></div>}>
      <RegistrationFormContent />
    </Suspense>
  );
}
