// Service Worker for Studio 12 Labs
//
// 🔼 SHELL_CACHE_VERSION — bump this ONLY when you change this file's own
// logic (the fetch/notification handlers below, cache names, etc).
// Bumping it forces `activate` to wipe every old cache so a stale service
// worker can never keep running old logic in a user's browser.
//
// You do NOT need to bump this for normal app deploys. Next.js names every
// JS/CSS build file with a content hash (e.g. main-8f3a1c.js) that changes
// automatically whenever the content changes, so old and new deploys never
// share a filename — there is no way for this cache to accidentally serve
// "old code" instead of "new code". HTML is never cached at all (see the
// fetch handler below), so users always get the latest page on every visit.
const SHELL_CACHE_VERSION = 'v2';
const OFFLINE_CACHE = `12labs-offline-${SHELL_CACHE_VERSION}`;
const STATIC_CACHE = `12labs-static-${SHELL_CACHE_VERSION}`;
const STATIC_CACHE_MAX_ENTRIES = 80; // simple FIFO cap so this cache can't grow forever

const CURRENT_CACHES = [OFFLINE_CACHE, STATIC_CACHE];

self.addEventListener('install', (event) => {
  // Pre-cache only the app icon — tiny, static, and enough for the
  // offline notice below to render with branding.
  event.waitUntil(
    caches.open(OFFLINE_CACHE)
      .then((cache) => cache.addAll(['/icon-192x192.png']))
      .catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        // Delete anything that isn't one of THIS version's caches — this is
        // what protects against overlap with a previous deploy's cached
        // files if you ever do bump SHELL_CACHE_VERSION.
        keys.filter((k) => !CURRENT_CACHES.includes(k)).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
      .catch(() => self.clients.claim())
  );
});

// Next.js build output — filenames are content-hashed and therefore
// immutable. Safe to cache aggressively: a new deploy ships new filenames,
// it never overwrites an old one. This is what actually makes repeat opens
// and notification taps fast — the big JS/CSS bundles load from disk
// instead of over the network; only the HTML/data below stays live.
function isImmutableStaticAsset(url) {
  return url.pathname.startsWith('/_next/static/');
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  const excess = keys.length - maxEntries;
  for (let i = 0; i < excess; i++) {
    await cache.delete(keys[i]);
  }
}

// 🔴 A fetch handler is REQUIRED for a browser to consider the app
// installable (and for PWABuilder to package it) — without one, there was
// no install prompt at all.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // 1. Navigations (HTML): deliberately network-ONLY, unchanged from
  //    before. This app is server-rendered with live Firebase data, auth
  //    state, and credit balances — serving any cached HTML would risk
  //    showing another user's state or a stale balance, which is far worse
  //    than simply not working offline. The only thing this adds beyond a
  //    plain passthrough is a friendly offline message when a navigation
  //    fails with no network.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(
          `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
           <title>Offline — 12Labs</title>
           <style>body{font-family:system-ui,-apple-system,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;background:#f7f8fb;color:#16181d;text-align:center;padding:24px}
           .box{max-width:320px}img{width:64px;height:64px;border-radius:16px;margin-bottom:16px}h1{font-size:18px;margin:0 0 8px}p{color:#6b7280;font-size:14px;line-height:1.5;margin:0}</style></head>
           <body><div class="box"><img src="/icon-192x192.png" alt=""><h1>You're offline</h1>
           <p>12Labs needs an internet connection. Check your network and try again.</p></div></body></html>`,
          { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 503 }
        )
      )
    );
    return;
  }

  // 2. Hashed Next.js build assets: cache-first, network fallback. This is
  //    the actual speed fix — cold opens (including from a push
  //    notification) no longer wait on downloading the whole JS bundle
  //    every single time.
  if (isImmutableStaticAsset(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        try {
          const response = await fetch(event.request);
          if (response.ok) {
            cache.put(event.request, response.clone());
            trimCache(STATIC_CACHE, STATIC_CACHE_MAX_ENTRIES);
          }
          return response;
        } catch (err) {
          return cached || Response.error();
        }
      })
    );
    return;
  }

  // Everything else (API routes, images, fonts, third-party requests) keeps
  // the browser's normal default behaviour — untouched.
});

self.addEventListener('push', (event) => {
  try {
    const data = event.data ? event.data.json() : {};
    const title = data.title || 'Studio 12 Labs';
    const options = {
      body: data.body || '',
      icon: data.icon || '/icon-192x192.png',
      badge: data.badge || '/icon-192x192.png',
      // The sender currently puts url at the top level. Preserve support for
      // nested data payloads too.
      data: { ...(data.data || {}), url: data.url || data.data?.url || '/' },
    };
    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    console.error('Error handling push event:', err);
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    })
  );
});
