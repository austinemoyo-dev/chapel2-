// ============================================================================
// Sync Manager — Background sync orchestration for offline attendance records.
// ============================================================================

import { getQueue, removeFromQueue, clearEmbeddings } from './db';
import { attendanceService, type OfflineSyncRecord } from '@/lib/api/attendanceService';

export interface SyncResult {
  total: number;
  accepted: number;
  rejected: number;
  errors: string[];
}

/**
 * Sync all queued offline attendance records to the backend.
 * Called when device comes back online.
 */
export async function syncOfflineRecords(): Promise<SyncResult> {
  const queue = await getQueue();

  if (queue.length === 0) {
    return { total: 0, accepted: 0, rejected: 0, errors: [] };
  }

  // Transform queued records to the backend sync format
  const records: OfflineSyncRecord[] = queue.map((r) => ({
    student_id: r.student_id,
    service_id: r.service_id,
    attendance_type: r.attendance_type,
    device_id: r.device_id,
    gps_lat: r.gps_lat,
    gps_lng: r.gps_lng,
    timestamp: r.timestamp,
    protocol_member_id: r.protocol_member_id,
  }));

  try {
    const response = await attendanceService.syncOffline(records);

    // Remove accepted records from queue
    const errors: string[] = [];
    for (const result of response.results) {
      if (result.status === 'accepted') {
        await removeFromQueue(queue[result.index].id);
      } else {
        errors.push(result.reason || 'Unknown error');
        // Remove rejected records too (they won't be accepted on retry)
        await removeFromQueue(queue[result.index].id);
      }
    }

    // Clear embeddings cache after successful sync
    await clearEmbeddings();

    return {
      total: response.total,
      accepted: response.accepted,
      rejected: response.rejected,
      errors,
    };
  } catch (err) {
    return {
      total: queue.length,
      accepted: 0,
      rejected: 0,
      errors: [err instanceof Error ? err.message : 'Sync failed'],
    };
  }
}

/**
 * Register for Background Sync (if supported).
 */
export async function registerBackgroundSync(): Promise<void> {
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    try {
      const reg = await navigator.serviceWorker.ready;
      await (reg as ServiceWorkerRegistration & { sync: { register: (tag: string) => Promise<void> } })
        .sync.register('attendance-sync');
    } catch {
      // Background sync not available — rely on manual sync
    }
  }
}
