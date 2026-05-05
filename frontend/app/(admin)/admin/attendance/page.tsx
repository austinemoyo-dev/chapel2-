'use client';

import { useState, useEffect, useCallback } from 'react';
import { attendanceService } from '@/lib/api/attendanceService';
import { adminService } from '@/lib/api/adminService';
import { serviceService, type Service } from '@/lib/api/serviceService';
import type { Student } from '@/lib/api/registrationService';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { ROLES } from '@/lib/utils/constants';
import { formatDate, formatTime } from '@/lib/utils/formatters';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Spinner from '@/components/ui/Spinner';

// ============================================================================
// Types
// ============================================================================

type Tab = 'manual' | 'bulk';

// ============================================================================
// Main Component
// ============================================================================

export default function AttendancePage() {
  const { hasRole } = useAuth();
  const { addToast } = useToast();
  const isSuperadmin = hasRole(ROLES.SUPERADMIN);

  // Data
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('manual');

  // Manual sign-in state
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [studentSearch, setStudentSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Student[]>([]);
  const [searching, setSearching] = useState(false);
  const [manualReason, setManualReason] = useState('Camera malfunction — manual override');
  const [signingIn, setSigningIn] = useState<string | null>(null);
  const [signedStudents, setSignedStudents] = useState<Set<string>>(new Set());

  // Bulk mark state
  const [bulkService, setBulkService] = useState<Service | null>(null);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [bulkReason, setBulkReason] = useState('Camera system failure — bulk manual mark');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ created: number; skipped: number; total_students: number } | null>(null);

  // ============================================================================
  // Data loading
  // ============================================================================

  const loadServices = useCallback(async () => {
    try {
      const data = await serviceService.listServices();
      const svcs = Array.isArray(data) ? data : data.results || [];
      // Show only non-cancelled services, sorted by date desc
      setServices(
        svcs
          .filter((s) => !s.is_cancelled)
          .sort((a, b) => b.scheduled_date.localeCompare(a.scheduled_date))
      );
    } catch {
      addToast('Failed to load services', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { loadServices(); }, [loadServices]);

  // ============================================================================
  // Student search (debounced)
  // ============================================================================

  useEffect(() => {
    if (!studentSearch || studentSearch.length < 2) {
      setSearchResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await adminService.listStudents({
          search: studentSearch,
          is_active: 'true',
        });
        setSearchResults(data.results || []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [studentSearch]);

  // ============================================================================
  // Manual sign-in handler
  // ============================================================================

  async function handleManualSignIn(student: Student) {
    if (!selectedService) {
      addToast('Select a service first', 'warning');
      return;
    }
    if (manualReason.length < 5) {
      addToast('Reason must be at least 5 characters', 'warning');
      return;
    }
    setSigningIn(student.id);
    try {
      const res = await attendanceService.manualSignIn({
        service_id: selectedService.id,
        student_id: student.id,
        reason_note: manualReason,
      });
      setSignedStudents((prev) => new Set(prev).add(student.id));
      addToast(`✅ ${res.student_name} marked present`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to mark attendance';
      if (msg.includes('Already marked')) {
        setSignedStudents((prev) => new Set(prev).add(student.id));
        addToast(`${student.full_name} already marked for this service`, 'info');
      } else {
        addToast(msg, 'error');
      }
    } finally {
      setSigningIn(null);
    }
  }

  // ============================================================================
  // Bulk mark handler
  // ============================================================================

  async function handleBulkMark() {
    if (!bulkService) return;
    if (bulkReason.length < 5) {
      addToast('Reason must be at least 5 characters', 'warning');
      return;
    }
    setBulkLoading(true);
    try {
      const res = await attendanceService.bulkMark({
        service_id: bulkService.id,
        mark_all_active: true,
        reason_note: bulkReason,
      });
      setBulkResult(res);
      addToast(`✅ ${res.created} students marked, ${res.skipped} already marked`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to bulk mark';
      addToast(msg, 'error');
    } finally {
      setBulkLoading(false);
    }
  }

  // ============================================================================
  // Render
  // ============================================================================

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Manual Attendance</h1>
        <p className="text-sm text-muted mt-0.5">Mark attendance manually when cameras are unavailable</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 bg-surface-2 rounded-xl border border-border">
        {([
          { key: 'manual' as Tab, label: 'Single Student', icon: '👤' },
          { key: 'bulk' as Tab, label: 'Bulk Mark', icon: '👥' },
        ]).map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
              tab === key
                ? 'bg-primary text-white shadow-md'
                : 'text-muted hover:text-foreground hover:bg-surface-3'
            }`}
          >
            <span className="mr-1.5">{icon}</span>{label}
          </button>
        ))}
      </div>

      {/* ================================================================== */}
      {/* TAB 1: SINGLE STUDENT MANUAL SIGN-IN                               */}
      {/* ================================================================== */}

      {tab === 'manual' && (
        <div className="space-y-4">
          {/* Step 1: Select service */}
          <Card variant="glass">
            <p className="text-sm font-semibold mb-3">① Select Service</p>
            <div className="grid gap-2 max-h-60 overflow-y-auto">
              {services.map((svc) => (
                <button
                  key={svc.id}
                  onClick={() => { setSelectedService(svc); setSignedStudents(new Set()); }}
                  className={`text-left p-3 rounded-xl border transition-all ${
                    selectedService?.id === svc.id
                      ? 'border-primary bg-primary/10 shadow-sm'
                      : 'border-border hover:border-primary/30 hover:bg-surface-2'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">
                        {svc.name || `${svc.service_type.charAt(0).toUpperCase() + svc.service_type.slice(1)} ${svc.service_group}`}
                      </p>
                      <p className="text-xs text-muted mt-0.5">
                        📅 {formatDate(svc.scheduled_date)} · 🕐 {formatTime(svc.window_open_time)} → {formatTime(svc.window_close_time)}
                      </p>
                    </div>
                    <Badge variant={svc.is_window_open ? 'success' : 'info'}>
                      {svc.is_window_open ? 'Live' : svc.service_group}
                    </Badge>
                  </div>
                </button>
              ))}
              {services.length === 0 && (
                <p className="text-sm text-muted text-center py-4">No services found</p>
              )}
            </div>
          </Card>

          {/* Step 2: Search & mark */}
          {selectedService && (
            <Card variant="glass">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold">② Search & Mark Student</p>
                <Badge variant="info">{selectedService.name || `${selectedService.service_type} ${selectedService.service_group}`}</Badge>
              </div>

              <Input
                id="student-search-attendance"
                placeholder="Search by name, matric, or phone..."
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>}
              />

              {/* Reason */}
              <div className="mt-3">
                <Input
                  id="manual-reason"
                  label="Reason (mandatory)"
                  value={manualReason}
                  onChange={(e) => setManualReason(e.target.value)}
                  placeholder="e.g., Camera malfunction"
                />
              </div>

              {/* Results */}
              <div className="mt-3 space-y-2 max-h-72 overflow-y-auto">
                {searching && (
                  <div className="flex justify-center py-4"><Spinner /></div>
                )}
                {!searching && searchResults.map((student) => {
                  const alreadySigned = signedStudents.has(student.id);
                  return (
                    <div
                      key={student.id}
                      className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                        alreadySigned
                          ? 'border-success/30 bg-success/5'
                          : 'border-border hover:border-primary/30'
                      }`}
                    >
                      <div>
                        <p className="text-sm font-medium">{student.full_name}</p>
                        <p className="text-xs text-muted">
                          {student.matric_number || student.system_id} · {student.service_group}
                        </p>
                      </div>
                      {alreadySigned ? (
                        <Badge variant="success">✓ Marked</Badge>
                      ) : (
                        <Button
                          size="sm"
                          loading={signingIn === student.id}
                          disabled={!!signingIn}
                          onClick={() => void handleManualSignIn(student)}
                        >
                          Mark Present
                        </Button>
                      )}
                    </div>
                  );
                })}
                {!searching && studentSearch.length >= 2 && searchResults.length === 0 && (
                  <p className="text-sm text-muted text-center py-4">No active students found</p>
                )}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ================================================================== */}
      {/* TAB 2: BULK MARK                                                    */}
      {/* ================================================================== */}

      {tab === 'bulk' && (
        <div className="space-y-4">
          {!isSuperadmin && (
            <div className="bg-warning-muted border border-warning/20 rounded-xl p-3 text-sm">
              <p className="font-medium text-warning">⚠️ Superadmin only</p>
              <p className="text-muted">Bulk marking requires Superadmin access.</p>
            </div>
          )}

          {isSuperadmin && (
            <>
              <div className="bg-warning-muted border border-warning/20 rounded-xl p-3 text-sm flex items-start gap-2.5">
                <span className="text-lg">⚠️</span>
                <div>
                  <p className="font-medium text-warning">Powerful operation</p>
                  <p className="text-muted mt-0.5">
                    This will mark ALL active students (with completed face registration) in the
                    selected service&apos;s group as present. Use only when the entire camera system has failed.
                  </p>
                </div>
              </div>

              <Card variant="glass">
                <p className="text-sm font-semibold mb-3">Select Service to Bulk Mark</p>
                <div className="grid gap-2 max-h-60 overflow-y-auto">
                  {services.map((svc) => (
                    <button
                      key={svc.id}
                      onClick={() => { setBulkService(svc); setBulkResult(null); }}
                      className={`text-left p-3 rounded-xl border transition-all ${
                        bulkService?.id === svc.id
                          ? 'border-primary bg-primary/10 shadow-sm'
                          : 'border-border hover:border-primary/30 hover:bg-surface-2'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">
                            {svc.name || `${svc.service_type.charAt(0).toUpperCase() + svc.service_type.slice(1)} ${svc.service_group}`}
                          </p>
                          <p className="text-xs text-muted mt-0.5">
                            📅 {formatDate(svc.scheduled_date)} · {svc.service_group === 'all' ? 'All Students' : svc.service_group}
                          </p>
                        </div>
                        <Badge variant={svc.is_window_open ? 'success' : 'info'}>
                          {svc.is_window_open ? 'Live' : svc.service_group}
                        </Badge>
                      </div>
                    </button>
                  ))}
                </div>
              </Card>

              {bulkService && (
                <Card variant="glass">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">
                        Bulk Mark: {bulkService.name || `${bulkService.service_type} ${bulkService.service_group}`}
                      </p>
                      <Badge variant="warning">
                        {bulkService.service_group === 'all' ? 'All Groups' : bulkService.service_group}
                      </Badge>
                    </div>

                    <Input
                      id="bulk-reason"
                      label="Reason (mandatory)"
                      value={bulkReason}
                      onChange={(e) => setBulkReason(e.target.value)}
                      placeholder="e.g., Camera system failure"
                    />

                    {bulkResult && (
                      <div className="bg-success-muted border border-success/20 rounded-xl p-3 text-sm">
                        <p className="font-medium text-success mb-1">✅ Bulk mark complete</p>
                        <p className="text-muted">
                          {bulkResult.created} students marked · {bulkResult.skipped} already marked · {bulkResult.total_students} total in group
                        </p>
                      </div>
                    )}

                    <Button
                      variant="danger"
                      className="w-full"
                      onClick={() => setShowBulkConfirm(true)}
                      disabled={bulkReason.length < 5}
                    >
                      ⚡ Mark All Active Students Present
                    </Button>
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {/* Bulk confirm modal */}
      <Modal
        open={showBulkConfirm}
        onClose={() => { if (!bulkLoading) setShowBulkConfirm(false); }}
        title="Confirm Bulk Mark"
        className="glass-panel backdrop-blur-md"
      >
        <div className="space-y-4">
          <div className="bg-danger-muted border border-danger/20 rounded-xl p-3 text-sm">
            <p className="font-medium text-danger mb-1">🚨 This is irreversible</p>
            <p className="text-muted">
              All active students with completed face registration in the &quot;{bulkService?.service_group === 'all' ? 'All Groups' : bulkService?.service_group}&quot; group
              will be marked as present for this service.
            </p>
          </div>

          {bulkService && (
            <div className="bg-surface-2 rounded-xl p-3 text-sm space-y-1">
              <p><span className="text-muted">Service:</span> <strong>{bulkService.name || `${bulkService.service_type} ${bulkService.service_group}`}</strong></p>
              <p><span className="text-muted">Date:</span> {formatDate(bulkService.scheduled_date)}</p>
              <p><span className="text-muted">Group:</span> {bulkService.service_group === 'all' ? 'All Students' : bulkService.service_group}</p>
              <p><span className="text-muted">Reason:</span> {bulkReason}</p>
            </div>
          )}

          <div className="flex gap-3">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setShowBulkConfirm(false)}
              disabled={bulkLoading}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              loading={bulkLoading}
              onClick={async () => {
                await handleBulkMark();
                setShowBulkConfirm(false);
              }}
            >
              Confirm Bulk Mark
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
