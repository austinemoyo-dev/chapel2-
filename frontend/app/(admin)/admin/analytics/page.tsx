'use client';

import { useState, useEffect } from 'react';
import { reportService, type SemesterComparisonEntry } from '@/lib/api/reportService';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Skeleton from '@/components/ui/Skeleton';
import Sparkline from '@/components/charts/Sparkline';

export default function AnalyticsPage() {
  const [semesters, setSemesters] = useState<SemesterComparisonEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    reportService.getSemesterComparison()
      .then(data => setSemesters(data.semesters))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const trendData = semesters.map(s => ({
    week: s.name,
    percentage: s.avg_percentage,
  }));

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Semester Analytics</h1>
        <p className="text-sm text-muted mt-0.5">Compare attendance trends across semesters</p>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-2xl" />)}
        </div>
      ) : semesters.length < 2 ? (
        <Card variant="glass" className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">Multi-Semester Analytics</h2>
          <p className="text-sm text-muted max-w-sm mx-auto">
            Comparison charts will appear here once you have data from at least 2 semesters.
            {semesters.length === 1 && (
              <span className="block mt-2 text-primary font-medium">
                Current semester: {semesters[0].name} ({semesters[0].total_students} students, {semesters[0].avg_percentage}% avg)
              </span>
            )}
          </p>
        </Card>
      ) : (
        <>
          {/* Trend chart */}
          <Card variant="glass">
            <h2 className="text-sm font-bold text-foreground mb-3">Average Attendance % by Semester</h2>
            <Sparkline data={trendData} height={120} />
          </Card>

          {/* Comparison table */}
          <Card variant="glass">
            <h2 className="text-sm font-bold text-foreground mb-4">Semester Comparison</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-3 text-xs font-bold text-muted uppercase tracking-wider">Semester</th>
                    <th className="text-right py-3 px-3 text-xs font-bold text-muted uppercase tracking-wider">Students</th>
                    <th className="text-right py-3 px-3 text-xs font-bold text-muted uppercase tracking-wider">Services</th>
                    <th className="text-right py-3 px-3 text-xs font-bold text-muted uppercase tracking-wider">Avg %</th>
                    <th className="text-right py-3 px-3 text-xs font-bold text-muted uppercase tracking-wider">Below 70%</th>
                    <th className="text-center py-3 px-3 text-xs font-bold text-muted uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {semesters.map(sem => (
                    <tr key={sem.semester_id} className="border-b border-border/50 hover:bg-surface-2 transition-colors">
                      <td className="py-3 px-3 font-semibold text-foreground">{sem.name}</td>
                      <td className="py-3 px-3 text-right text-muted">{sem.total_students}</td>
                      <td className="py-3 px-3 text-right text-muted">{sem.total_services}</td>
                      <td className="py-3 px-3 text-right">
                        <span className={sem.avg_percentage >= 70 ? 'text-success font-bold' : 'text-danger font-bold'}>
                          {sem.avg_percentage}%
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right text-muted">{sem.below_threshold_count}</td>
                      <td className="py-3 px-3 text-center">
                        <Badge variant={sem.is_active ? 'success' : 'info'}>
                          {sem.is_active ? 'Active' : 'Closed'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
