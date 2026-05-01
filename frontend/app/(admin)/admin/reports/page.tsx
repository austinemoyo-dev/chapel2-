'use client';

import { useState, useEffect } from 'react';
import { reportService, type AttendanceReport, type ReportFilters } from '@/lib/api/reportService';
import { serviceService, type Service } from '@/lib/api/serviceService';
import { useToast } from '@/providers/ToastProvider';
import { ATTENDANCE_THRESHOLD, SERVICE_GROUPS, SERVICE_TYPES } from '@/lib/utils/constants';
import { formatPercentage } from '@/lib/utils/formatters';
import Card from '@/components/ui/Card';
import Select from '@/components/ui/Select';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Spinner from '@/components/ui/Spinner';

export default function ReportsPage() {
  const { addToast } = useToast();
  const [report, setReport] = useState<AttendanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<ReportFilters>({});
  const [semesters, setSemesters] = useState<{ id: string; name: string }[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    Promise.all([serviceService.listSemesters(), serviceService.listServices()])
      .then(([semData, svcData]) => {
        const sems = Array.isArray(semData) ? semData : semData.results || [];
        const svcs = Array.isArray(svcData) ? svcData : svcData.results || [];
        setSemesters(sems.map((s) => ({ id: s.id, name: s.name })));
        setServices(svcs);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    reportService.getAttendanceReport(filters)
      .then((data) => { if (!cancelled) setReport(data); })
      .catch(() => { if (!cancelled) addToast('Failed to load report', 'error'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [filters, addToast]);

  async function handleExport(type: 'pdf' | 'excel') {
    setExporting(true);
    try {
      const blob = type === 'pdf'
        ? await reportService.exportPDF(filters)
        : await reportService.exportExcel(filters);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendance_report.${type === 'pdf' ? 'pdf' : 'xlsx'}`;
      a.click();
      URL.revokeObjectURL(url);
      addToast(`${type.toUpperCase()} exported`, 'success');
    } catch {
      addToast('Export failed', 'error');
    } finally {
      setExporting(false);
    }
  }

  const updateFilter = (key: keyof ReportFilters, value: string) => {
    setFilters((current) => {
      const next = { ...current, [key]: value || undefined };
      Object.keys(next).forEach((k) => {
        if (!next[k as keyof ReportFilters]) delete next[k as keyof ReportFilters];
      });
      return next;
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Attendance Reports</h1>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => void handleExport('pdf')} loading={exporting}>PDF</Button>
          <Button variant="secondary" size="sm" onClick={() => void handleExport('excel')} loading={exporting}>Excel</Button>
        </div>
      </div>

      <Card className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-4 items-end">
        <Select
          id="rpt-semester"
          label="Semester"
          options={semesters.map((s) => ({ value: s.id, label: s.name }))}
          value={filters.semester_id || ''}
          onChange={(e) => updateFilter('semester_id', e.target.value)}
        />
        <Select
          id="rpt-service"
          label="Specific Service"
          options={services.map((s) => ({ value: s.id, label: s.name || `${s.service_type} ${s.service_group} ${s.scheduled_date}` }))}
          value={filters.service_id || ''}
          onChange={(e) => updateFilter('service_id', e.target.value)}
        />
        <Select
          id="rpt-type"
          label="Service Type"
          options={Object.values(SERVICE_TYPES).map((t) => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) }))}
          value={filters.service_type || ''}
          onChange={(e) => updateFilter('service_type', e.target.value)}
        />
        <Select
          id="rpt-group"
          label="Service Group"
          options={Object.values(SERVICE_GROUPS).filter((g) => g !== 'all').map((g) => ({ value: g, label: g }))}
          value={filters.service_group || ''}
          onChange={(e) => updateFilter('service_group', e.target.value)}
        />
        <Input
          id="rpt-week"
          label="Week"
          placeholder="e.g. 1"
          value={filters.week || ''}
          onChange={(e) => updateFilter('week', e.target.value)}
        />
        <label className="flex items-center gap-2 rounded-xl bg-surface-2 border border-border px-4 py-2.5 text-sm">
          <input
            type="checkbox"
            checked={filters.below_threshold === 'true'}
            onChange={(e) => updateFilter('below_threshold', e.target.checked ? 'true' : '')}
          />
          Below {ATTENDANCE_THRESHOLD}% only
        </label>
      </Card>

      {loading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : report ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="text-xs text-muted">Total students</p>
              <p className="text-2xl font-bold">{report.total_students}</p>
            </div>
            <div className="rounded-xl border border-danger/30 bg-danger/5 p-4">
              <p className="text-xs text-muted">Exam risk</p>
              <p className="text-2xl font-bold text-danger">{report.students_below_threshold}</p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-2 border-b border-border">
                  <th className="text-left px-4 py-3 font-medium text-muted">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-muted">ID</th>
                  <th className="text-center px-4 py-3 font-medium text-muted">Group</th>
                  <th className="text-center px-4 py-3 font-medium text-muted">Valid</th>
                  <th className="text-center px-4 py-3 font-medium text-muted">Required</th>
                  <th className="text-center px-4 py-3 font-medium text-muted">%</th>
                  <th className="text-center px-4 py-3 font-medium text-muted">Status</th>
                </tr>
              </thead>
              <tbody>
                {report.report.map((row) => (
                  <tr key={row.student_id} className={`border-b border-border/50 ${row.below_threshold ? 'bg-danger/5' : ''}`}>
                    <td className="px-4 py-3 font-medium">{row.student_name}</td>
                    <td className="px-4 py-3 text-muted">{row.matric_number || row.system_id}</td>
                    <td className="px-4 py-3 text-center">{row.service_group}</td>
                    <td className="px-4 py-3 text-center">{row.valid_count}</td>
                    <td className="px-4 py-3 text-center">{row.total_required}</td>
                    <td className={`px-4 py-3 text-center font-semibold ${row.below_threshold ? 'text-danger' : 'text-success'}`}>
                      {formatPercentage(row.percentage)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={row.below_threshold ? 'danger' : 'success'}>
                        {row.below_threshold ? `Below ${ATTENDANCE_THRESHOLD}%` : 'OK'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="text-center py-10 text-muted">No data available</p>
      )}
    </div>
  );
}
