'use client';

const SUBSCRIBE_URL  = '/api/auth/push/subscribe/';
const VAPID_KEY_URL  = '/api/auth/push/vapid-key/';

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw     = atob(base64);
  const buffer  = new ArrayBuffer(raw.length);
  const view    = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return view;
}

function authHeader(): Record<string, string> {
  const token = typeof window !== 'undefined'
    ? localStorage.getItem('chapel_access_token') || ''
    : '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Request notification permission and subscribe this browser to push. */
export async function subscribeToPush(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return;

  // Fetch VAPID public key from the backend
  const keyRes = await fetch(VAPID_KEY_URL, { headers: authHeader() });
  if (!keyRes.ok) return;
  const { public_key } = await keyRes.json() as { public_key: string };
  if (!public_key) return;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(public_key),
  });

  const { endpoint, keys } = subscription.toJSON() as {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };

  await fetch(SUBSCRIBE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ endpoint, p256dh: keys.p256dh, auth: keys.auth }),
  });
}

/** Unsubscribe this browser from push and remove the subscription from the backend. */
export async function unsubscribeFromPush(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;

  const registration  = await navigator.serviceWorker.ready;
  const subscription  = await registration.pushManager.getSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();

  await fetch(SUBSCRIBE_URL, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ endpoint }),
  });
}
