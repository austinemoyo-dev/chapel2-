'use client';

import { useState, useEffect } from 'react';
import { serviceService, type Service } from '@/lib/api/serviceService';
import Spinner from '@/components/ui/Spinner';
import Badge from '@/components/ui/Badge';

export default function MonitorIndexPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    serviceService.listServices({ is_cancelled: 'false' }).then((data) => {
      const list = Array.isArray(data) ? data : data.results || [];
      setServices(list);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <div className="max-w-lg mx-auto p-4 space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold gradient-text">Live Monitor</h1>
      <p className="text-sm text-muted">Select a service to monitor</p>
      <div className="space-y-2">
        {services.map((s) => (
          <a key={s.id} href={`/monitor/live/${s.id}`} className="block p-4 rounded-xl bg-surface border border-border hover:border-primary/50 transition-all">
            <div className="flex justify-between items-center">
              <div>
                <p className="font-medium">{s.name || `${s.service_type} ${s.service_group}`}</p>
                <p className="text-xs text-muted">{s.scheduled_date}</p>
              </div>
              <Badge variant="info">{s.service_group}</Badge>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
