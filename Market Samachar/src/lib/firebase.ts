/// <reference types="vite/client" />
/**
 * Firebase client — FCM push notifications only.
 * All other Firebase services (Auth, Firestore, etc.) are NOT used;
 * Supabase handles auth and data.
 *
 * Required env vars (VITE_ prefix = safe to ship to browser):
 *   VITE_FIREBASE_API_KEY
 *   VITE_FIREBASE_AUTH_DOMAIN
 *   VITE_FIREBASE_PROJECT_ID
 *   VITE_FIREBASE_STORAGE_BUCKET
 *   VITE_FIREBASE_MESSAGING_SENDER_ID
 *   VITE_FIREBASE_APP_ID
 *   VITE_FIREBASE_VAPID_KEY   ← Web Push certificate public key
 */

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getMessaging,
  getToken,
  onMessage,
  type Messaging,
} from 'firebase/messaging';

// ─── Config ───────────────────────────────────────────────────────────────────

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            as string,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        as string,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         as string,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     as string,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID             as string,
};

export const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;

const isConfigured = !!(
  firebaseConfig.apiKey &&
  firebaseConfig.projectId &&
  firebaseConfig.messagingSenderId &&
  VAPID_KEY
);

// ─── Lazy singletons ──────────────────────────────────────────────────────────

let _app:       FirebaseApp | null = null;
let _messaging: Messaging   | null = null;

function getFirebaseApp(): FirebaseApp | null {
  if (!isConfigured) return null;
  if (_app) return _app;
  // Avoid double-init if HMR fires during development
  _app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
  return _app;
}

export function getFirebaseMessaging(): Messaging | null {
  if (!isConfigured || typeof window === 'undefined') return null;
  if (_messaging) return _messaging;
  const app = getFirebaseApp();
  if (!app) return null;
  try {
    _messaging = getMessaging(app);
    return _messaging;
  } catch {
    return null;
  }
}

// ─── Service worker registration + token ─────────────────────────────────────

/**
 * Register the service worker, inject Firebase config into it,
 * then request an FCM registration token.
 *
 * Returns null if Firebase isn't configured or the browser doesn't support SW.
 */
export async function registerSWAndGetToken(): Promise<string | null> {
  if (!isConfigured) return null;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;

  try {
    // Register our custom service worker
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });
    await navigator.serviceWorker.ready;

    // Inject Firebase config so the SW can initialise firebase-messaging-compat
    const sw = registration.active ?? registration.installing ?? registration.waiting;
    sw?.postMessage({ type: 'FIREBASE_CONFIG', config: firebaseConfig });

    const messaging = getFirebaseMessaging();
    if (!messaging) return null;

    const token = await getToken(messaging, {
      vapidKey:                VAPID_KEY,
      serviceWorkerRegistration: registration,
    });

    return token ?? null;
  } catch {
    return null;
  }
}

// ─── Foreground message handler ───────────────────────────────────────────────

/**
 * Listen for push messages while the app is in the foreground.
 * Shows a native notification (requires permission).
 */
export function listenForegroundMessages(): () => void {
  const messaging = getFirebaseMessaging();
  if (!messaging) return () => {};

  return onMessage(messaging, (payload) => {
    const title = payload.notification?.title ?? 'Market Samachar';
    const body  = payload.notification?.body  ?? '';
    const link  = (payload as any).fcmOptions?.link ?? '/';

    if (Notification.permission === 'granted') {
      navigator.serviceWorker.ready.then((reg) => {
        reg.showNotification(title, {
          body,
          icon:  '/ms-icon-192.svg',
          badge: '/ms-favicon.svg',
          data:  { url: link },
        });
      });
    }
  });
}
