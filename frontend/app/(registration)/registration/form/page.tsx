'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { registrationService } from '@/lib/api/registrationService';
import { useToast } from '@/providers/ToastProvider';
import { ApiError } from '@/lib/api/client';
import { toTitleCase } from '@/lib/utils/formatters';
import { LEVELS, GENDERS } from '@/lib/utils/constants';
import Spinner from '@/components/ui/Spinner';
import CustomSelect from '@/components/ui/CustomSelect';

const FACULTIES_AND_DEPARTMENTS: Record<string, string[]> = {
  "FACULTY OF BASIC AND APPLIED SCIENCES": [
    "Biotechnology",
    "Microbiology",
    "Industrial Chemistry",
    "Computer Science",
    "Cyber Security",
    "Mathematics",
    "Physics with Electronics"
  ],
  "FACULTY OF HUMANITIES, MANAGEMENT AND SOCIAL SCIENCES": [
    "Accounting",
    "Entrepreneurship",
    "Business Administration",
    "Economics",
    "History and International Relations",
    "English",
    "Mass Communication",
    "Criminology and Security Studies"
  ],
  "FACULTY OF BASIC AND MEDICAL SCIENCES": [
    "Nursing",
    "Medical Laboratory Science",
    "Public Health"
  ]
};

function Section({ label, children, zIndex = 10 }: { label: string; children: React.ReactNode; zIndex?: number }) {
  return (
    <div className="space-y-3 relative group" style={{ zIndex }}>
      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-primary/70 px-1 transition-colors group-hover:text-primary">{label}</p>
      <div className="rounded-[1.4rem] space-y-px relative transition-all duration-300 ease-out shadow-sm hover:shadow-md hover:-translate-y-0.5"
        style={{
          zIndex,
          background: 'rgba(255,255,255,0.85)',
          backdropFilter: 'blur(32px) saturate(200%)',
          WebkitBackdropFilter: 'blur(32px) saturate(200%)',
          border: '1px solid rgba(255,255,255,0.9)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04), 0 1px 0 rgba(255,255,255,1) inset',
        }}>
        {children}
      </div>
    </div>
  );
}

/* ── Single field row inside a Section ────────────────────────────────────── */
function FieldRow({
  label, error, children, last = false
}: {
  label: string; error?: string; children: React.ReactNode; last?: boolean;
}) {
  return (
    <div className={`px-4 pt-3 pb-3 ${!last ? 'border-b border-white/30' : ''}`}>
      <label className="block text-[10px] font-bold uppercase tracking-widest text-foreground/50 mb-1.5">
        {label}
      </label>
      {children}
      {error && <p className="text-[11px] text-danger font-semibold mt-1.5">{error}</p>}
    </div>
  );
}

function RegistrationFormContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { addToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const studentType = params.get('type') || 'old';
  const semesterId = params.get('semester') || '';

  const [form, setForm] = useState({
    full_name: '',
    phone_number: '',
    matric_number: '',
    faculty: '',
    department: '',
    level: '',
    gender: '',
  });
  const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  /* Warn before leaving after form submit */
  useEffect(() => {
    if (!submitted) return;
    const handle = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'Registration is not complete — face capture still needed.';
      return e.returnValue;
    };
    window.addEventListener('beforeunload', handle);
    return () => window.removeEventListener('beforeunload', handle);
  }, [submitted]);

  const handleChange = (field: string, value: string) => {
    setForm(p => ({ 
      ...p, 
      [field]: value,
      ...(field === 'faculty' ? { department: '' } : {})
    }));
    setErrors(p => ({ 
      ...p, 
      [field]: '',
      ...(field === 'faculty' ? { department: '' } : {})
    }));
  };

  const handlePhotoChange = (file: File | null) => {
    if (!file) return;
    setProfilePhoto(file);
    setErrors(p => ({ ...p, profile_photo: '' }));
    const url = URL.createObjectURL(file);
    setPhotoPreview(url);
  };

  /* Clean up object URL */
  useEffect(() => () => { if (photoPreview) URL.revokeObjectURL(photoPreview); }, [photoPreview]);

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.full_name.trim() || form.full_name.trim().split(/\s+/).length < 2)
      e.full_name = 'Enter your full name (at least first and last name)';
    
    const cleanPhone = form.phone_number.replace(/\D/g, '');
    if (cleanPhone.length !== 11)
      e.phone_number = 'Phone number must be exactly 11 digits';
      
    if (studentType === 'old' && !form.matric_number.trim())
      e.matric_number = 'Matric number is required';
    if (!form.faculty)
      e.faculty = 'Select your faculty';
    if (!form.department.trim())
      e.department = 'Select your department';
    if (!form.level) e.level = 'Select your level';
    if (!form.gender) e.gender = 'Select your gender';
    if (!profilePhoto) e.profile_photo = 'A profile photo is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) {
      /* Scroll to first error */
      setTimeout(() => {
        document.querySelector('[data-error="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
      return;
    }
    setLoading(true);

    try {
      const result = await registrationService.registerStudent({
        student_type: studentType as 'old' | 'new',
        full_name: toTitleCase(form.full_name),
        phone_number: form.phone_number.trim(),
        matric_number: studentType === 'old' ? form.matric_number.trim().toUpperCase() : undefined,
        faculty: form.faculty,
        department: form.department.trim(),
        level: form.level as (typeof LEVELS)[number],
        gender: form.gender as 'male' | 'female',
        profile_photo: profilePhoto!,
        semester: semesterId,
      });

      sessionStorage.setItem('chapel_registration', JSON.stringify({
        studentId: result.id,
        studentName: result.full_name,
        systemId: result.system_id,
        serviceGroup: result.service_group,
        semesterId,
        duplicateFlag: result.duplicate_flag,
      }));

      setSubmitted(true);

      if (result.duplicate_flag) {
        addToast('Registration submitted — flagged for admin review.', 'warning');
      } else {
        addToast('Details saved! Now complete face capture.', 'success');
      }

      // Hard redirect to force a clean camera initialization on mobile browsers.
      // Next.js client-side routing often breaks getUserMedia on iOS/Android.
      window.location.href = `/registration/face-capture?student=${result.id}&semester=${semesterId}`;
    } catch (err) {
      if (err instanceof ApiError && err.data && typeof err.data === 'object') {
        const fieldErrors: Record<string, string> = {};
        Object.entries(err.data).forEach(([k, v]) => {
          if (Array.isArray(v)) fieldErrors[k] = v.join(', ');
          else if (typeof v === 'string') fieldErrors[k] = v;
        });
        setErrors(fieldErrors);
      }
      addToast(err instanceof ApiError ? err.message : 'Something went wrong', 'error');
    } finally {
      setLoading(false);
    }
  };

  const isOld = studentType === 'old';

  return (
    <div className="px-5 pt-5 pb-8 animate-slide-up-fade">

      {/* ── Header ── */}
      <div className="mb-6">
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full mb-3
                        text-xs font-bold"
          style={{
            background: isOld ? 'rgba(124,58,237,0.12)' : 'rgba(168,85,247,0.12)',
            border: isOld ? '1px solid rgba(124,58,237,0.18)' : '1px solid rgba(168,85,247,0.18)',
            color: isOld ? '#7C3AED' : '#A855F7',
          }}>
          {isOld ? '🎓 Returning Student' : '✨ New Student'}
        </div>
        <h2 className="text-xl font-black text-foreground tracking-tight leading-tight">
          Your Details
        </h2>
        <p className="text-xs text-muted mt-1">
          All fields are required. Face capture follows after this.
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-5">

        {/* ── Profile Photo (top, prominent, required) ──────────────────── */}
        <div className="flex flex-col items-center gap-3 py-2">
          {/* Photo circle */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="relative w-24 h-24 rounded-full shrink-0 touch-manipulation group"
            style={{
              background: photoPreview ? 'transparent' : 'rgba(124,58,237,0.08)',
              border: errors.profile_photo
                ? '2.5px solid rgba(220,38,38,0.6)'
                : photoPreview
                  ? '2.5px solid rgba(124,58,237,0.5)'
                  : '2px dashed rgba(124,58,237,0.30)',
              boxShadow: photoPreview ? '0 8px 32px rgba(124,58,237,0.20)' : 'none',
            }}
          >
            {photoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoPreview}
                alt="Profile preview"
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              <div className="flex flex-col items-center gap-1">
                <svg className="w-7 h-7 text-primary/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                </svg>
                <span className="text-[9px] font-bold text-primary/60 uppercase tracking-wide">Tap to add</span>
              </div>
            )}

            {/* Edit badge on hover when photo is set */}
            {photoPreview && (
              <div className="absolute inset-0 rounded-full bg-black/30 opacity-0 group-active:opacity-100
                              flex items-center justify-center transition-opacity">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
              </div>
            )}
          </button>

          <div className="text-center">
            <p className="text-xs font-bold text-foreground/80">
              {photoPreview ? 'Profile photo selected' : 'Profile Photo'}
              <span className="ml-1 text-danger">*</span>
            </p>
            <p className="text-[10px] text-muted mt-0.5">
              {photoPreview ? 'Tap to change' : 'A clear photo of your face'}
            </p>
          </div>

          {errors.profile_photo && (
            <p data-error="true" className="text-[11px] text-danger font-semibold text-center">
              {errors.profile_photo}
            </p>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handlePhotoChange(e.target.files?.[0] || null)}
          />
        </div>

        {/* ── Personal Information ── */}
        <Section label="Personal Information" zIndex={30}>
          <FieldRow label="Full Name" error={errors.full_name}>
            <input
              type="text"
              placeholder="Dash & Co."
              value={form.full_name}
              onChange={(e) => handleChange('full_name', e.target.value)}
              onBlur={(e) => handleChange('full_name', toTitleCase(e.target.value))}
              data-error={!!errors.full_name}
              className="w-full bg-transparent text-sm text-foreground placeholder:text-muted/40
                         focus:outline-none py-0.5"
              style={{ fontSize: '16px' }}
            />
          </FieldRow>

          <FieldRow label="Phone Number" error={errors.phone_number}>
            <input
              type="tel"
              placeholder="08100000000"
              maxLength={11}
              value={form.phone_number}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '');
                if (val.length <= 11) handleChange('phone_number', val);
              }}
              data-error={!!errors.phone_number}
              className="w-full bg-transparent text-sm text-foreground placeholder:text-muted/40
                         focus:outline-none py-0.5"
              style={{ fontSize: '16px' }}
            />
          </FieldRow>

          {isOld && (
            <FieldRow label="Matric Number" error={errors.matric_number} last>
              <input
                type="text"
                placeholder="23CM2000"
                value={form.matric_number}
                onChange={(e) => handleChange('matric_number', e.target.value.toUpperCase())}
                data-error={!!errors.matric_number}
                className="w-full bg-transparent text-sm text-foreground placeholder:text-muted/40
                           focus:outline-none py-0.5 font-mono tracking-wide"
                style={{ fontSize: '16px' }}
              />
            </FieldRow>
          )}

          {!isOld && (
            <FieldRow label="Note" last>
              <p className="text-xs text-muted py-0.5">
                Your matric number will be assigned by the university and can be added later via a secure link from the admin.
              </p>
            </FieldRow>
          )}
        </Section>

        {/* ── Academic Information ── */}
        <Section label="Academic Information" zIndex={20}>
          <FieldRow label="Faculty" error={errors.faculty}>
            <CustomSelect
              id="faculty"
              data-error={!!errors.faculty}
              value={form.faculty}
              onChange={(val) => handleChange('faculty', val)}
              options={Object.keys(FACULTIES_AND_DEPARTMENTS).map((fac) => ({ value: fac, label: toTitleCase(fac) }))}
              placeholder="Select faculty"
            />
          </FieldRow>

          <FieldRow label="Department" error={errors.department}>
            <CustomSelect
              id="department"
              data-error={!!errors.department}
              value={form.department}
              onChange={(val) => handleChange('department', val)}
              options={(form.faculty ? FACULTIES_AND_DEPARTMENTS[form.faculty] : []).map((dept) => ({ value: dept, label: dept }))}
              placeholder={form.faculty ? "Select department" : "Select faculty first"}
              className={!form.faculty ? "opacity-50 pointer-events-none" : ""}
            />
          </FieldRow>

          <FieldRow label="Level" error={errors.level}>
            <CustomSelect
              id="level"
              data-error={!!errors.level}
              value={form.level}
              onChange={(val) => handleChange('level', val)}
              options={LEVELS.map((l) => ({ value: l, label: `${l} Level` }))}
              placeholder="Select level"
            />
          </FieldRow>

          <FieldRow label="Gender" error={errors.gender} last>
            <div className="flex gap-3 py-0.5">
              {GENDERS.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => handleChange('gender', g)}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all duration-200
                    ${form.gender === g
                      ? 'bg-primary text-white shadow-[0_4px_12px_rgba(124,58,237,0.35)]'
                      : 'bg-white/50 text-muted border border-white/60'
                    }`}
                >
                  {g.charAt(0).toUpperCase() + g.slice(1)}
                </button>
              ))}
            </div>
          </FieldRow>
        </Section>

        {/* ── Submit ── */}
        <button
          type="submit"
          disabled={loading}
          className="btn-liquid w-full py-4 rounded-[1.2rem] font-black text-[0.95rem] text-white
                     disabled:opacity-50 touch-manipulation mt-1"
          style={{
            background: 'linear-gradient(135deg, #7C3AED 0%, #A855F7 100%)',
            boxShadow: '0 6px 24px rgba(124,58,237,0.42), 0 1px 0 rgba(255,255,255,0.20) inset',
          }}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Saving…
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              Continue to Face Capture
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </span>
          )}
        </button>

        <p className="text-center text-[10px] text-muted pt-1">
          By continuing you confirm this is your own personal information
        </p>
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
