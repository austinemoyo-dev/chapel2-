// ============================================================================
// IndexedDB — Offline storage for attendance queue and embedding cache.
// ============================================================================

import { IDB_NAME, IDB_VERSION } from '@/lib/utils/constants';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('attendance_queue')) {
        db.createObjectStore('attendance_queue', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('embeddings_cache')) {
        db.createObjectStore('embeddings_cache', { keyPath: 'service_id' });
      }
      if (!db.objectStoreNames.contains('sync_results')) {
        db.createObjectStore('sync_results', { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { dbPromise = null; reject(request.error); };
  });
  return dbPromise;
}

export interface QueuedRecord {
  id: string;
  student_id: string;
  service_id: string;
  attendance_type: 'sign_in' | 'sign_out';
  timestamp: string;
  gps_lat: number;
  gps_lng: number;
  device_id: string;
  protocol_member_id: string;
  created_at: string;
}

export interface CachedEmbeddings {
  service_id: string;
  embeddings: { student_id: string; student_name: string; embeddings: number[][] }[];
  cached_at: string;
}

// --- Attendance Queue ---

export async function addToQueue(record: QueuedRecord): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('attendance_queue', 'readwrite');
    tx.objectStore('attendance_queue').add(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getQueue(): Promise<QueuedRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('attendance_queue', 'readonly');
    const req = tx.objectStore('attendance_queue').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function removeFromQueue(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('attendance_queue', 'readwrite');
    tx.objectStore('attendance_queue').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearQueue(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('attendance_queue', 'readwrite');
    tx.objectStore('attendance_queue').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getQueueCount(): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('attendance_queue', 'readonly');
    const req = tx.objectStore('attendance_queue').count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// --- Embeddings Cache ---

export async function cacheEmbeddings(data: CachedEmbeddings): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('embeddings_cache', 'readwrite');
    tx.objectStore('embeddings_cache').put(data);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getCachedEmbeddings(serviceId: string): Promise<CachedEmbeddings | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('embeddings_cache', 'readonly');
    const req = tx.objectStore('embeddings_cache').get(serviceId);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function clearEmbeddings(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('embeddings_cache', 'readwrite');
    tx.objectStore('embeddings_cache').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
