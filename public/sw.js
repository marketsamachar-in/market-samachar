// ─── Market Samachar Service Worker ──────────────────────────────────────────
// Caches static shell + last 20 news articles for offline reading.

const CACHE_NAME    = 'ms-shell-v1';
const NEWS_CACHE    = 'ms-news-v1';
const NEWS_MAX      = 20;

const STATIC_ASSETS = [
  '/',
  '/ms-favicon.svg',
  '/ms-icon-192.svg',
  '/ms-logo-512.svg',
  '/ms-navbar.svg',
  '/manifest.json',
];

// ── Install: cache static shell ───────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(STATIC_ASSETS).catch(() => {
        // Non-fatal — some assets may not exist yet
      })
    ).then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches ────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== NEWS_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: serve from cache with network fallback ─────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin GET requests
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // /api/news — network first, cache last 20 items for offline reading
  if (url.pathname.startsWith('/api/news') && !url.pathname.includes('/article')) {
    event.respondWith(networkFirstNews(request));
    return;
  }

  // Static assets + SPA shell — cache first
  if (
    STATIC_ASSETS.includes(url.pathname) ||
    url.pathname.startsWith('/assets/') ||
    url.pathname === '/'
  ) {
    event.respondWith(cacheFirstStatic(request));
    return;
  }

  // Everything else — network only (market data, translations, etc.)
});

// ── Cache strategies ──────────────────────────────────────────────────────────

async function cacheFirstStatic(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Offline fallback for navigation requests
    if (request.mode === 'navigate') {
      const shell = await caches.match('/');
      if (shell) return shell;
    }
    return offlineFallback();
  }
}

async function networkFirstNews(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cacheNewsResponse(request, response.clone());
    }
    return response;
  } catch {
    // Offline — serve cached news
    const cached = await caches.match(request);
    if (cached) return cached;

    // Return an offline news payload
    return new Response(
      JSON.stringify({
        items: [],
        total: 0,
        offline: true,
        message: 'You are offline. Cached news unavailable for this filter.',
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function cacheNewsResponse(request, response) {
  const cache = await caches.open(NEWS_CACHE);

  // Trim old entries — keep only the last NEWS_MAX cached /api/news requests
  const keys = await cache.keys();
  const newsKeys = keys.filter((k) => new URL(k.url).pathname.startsWith('/api/news'));
  if (newsKeys.length >= NEWS_MAX) {
    await cache.delete(newsKeys[0]);
  }

  await cache.put(request, response);
}

function offlineFallback() {
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Market Samachar — Offline</title>
  <style>
    body { margin:0; background:#07070e; color:#e8eaf0;
           font-family:'DM Sans',sans-serif; display:flex;
           align-items:center; justify-content:center; min-height:100vh; }
    .wrap { text-align:center; padding:24px; }
    .dot  { width:10px; height:10px; border-radius:50%;
            background:#334466; display:inline-block; margin:0 3px; }
    h2    { color:#00ff88; font-size:22px; margin:16px 0 8px; }
    p     { color:#8899aa; font-size:14px; max-width:300px; line-height:1.6; }
    button{ margin-top:20px; background:#00ff8818; border:1px solid #00ff8840;
            color:#00ff88; padding:10px 24px; border-radius:6px; cursor:pointer;
            font-size:13px; font-family:inherit; }
  </style>
</head>
<body>
  <div class="wrap">
    <div><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>
    <h2>You're Offline</h2>
    <p>Market Samachar needs a connection to load live news and market data.</p>
    <button onclick="window.location.reload()">Try Again</button>
  </div>
</body>
</html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html' } });
}

// ── Push: handle notifications when app is closed ─────────────────────────────
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data?.json() ?? {}; } catch {}

  const title = data.notification?.title ?? 'Market Samachar';
  const body  = data.notification?.body  ?? '';
  const link  = data.fcmOptions?.link ?? data.data?.url ?? '/';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon:    '/ms-icon-192.svg',
      badge:   '/ms-favicon.svg',
      data:    { url: link },
      vibrate: [100, 50, 100],
    })
  );
});

// ── Notification click: open / focus the app ──────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url ?? '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
