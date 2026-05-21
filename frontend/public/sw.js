// ============================================================================
// Service Worker — Cache static assets, offline fallback, background sync.
// ============================================================================

const CACHE_NAME = 'chapel-v1';
const STATIC_ASSETS = [
  '/offline.html',
  '/manifest.json',
];

// Install — cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — network-first for API, cache-first for static
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and API requests
  if (request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache successful responses
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => {
        // Offline — try cache
        return caches.match(request).then((cached) => {
          if (cached) return cached;
          // Fallback for navigation requests
          if (request.mode === 'navigate') {
            return caches.match('/offline.html');
          }
          return new Response('Offline', { status: 503 });
        });
      })
  );
});

// Background Sync — sync offline attendance records
self.addEventListener('sync', (event) => {
  if (event.tag === 'attendance-sync') {
    event.waitUntil(syncAttendance());
  }
});

async function syncAttendance() {
  // Signal to the main app to sync
  const clients = await self.clients.matchAll();
  clients.forEach((client) => {
    client.postMessage({ type: 'SYNC_ATTENDANCE' });
  });
}

// Web Push — show notification when backend fires a push event
self.addEventListener('push', async (event) => {
  let title = 'Chapel Attendance';
  let body  = 'A protocol member has marked attendance.';
  let url   = '/admin/attendance';

  if (event.data) {
    try {
      const data = event.data.json();
      title = data.title || title;
      body  = data.body  || body;
      url   = data.url   || url;
    } catch (_) { /* malformed payload — use defaults */ }
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon:  '/icons/icon-194.png',
      badge: '/icons/icon-194.png',
      data:  { url },
      tag:   'attendance',        // collapse rapid-fire notifications into one
      renotify: true,
    })
  );
});

// Open / focus the admin page when the notification is clicked
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/admin/attendance';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(target) && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
