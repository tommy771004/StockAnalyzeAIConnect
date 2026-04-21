const CACHE_NAME = 'quantum-ai-cache-v1';

// URLs required for basic offline functioning
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

self.addEventListener('fetch', event => {
  // Stale-while-revalidate / Network falling back to cache
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return cache hit if available, but fetch new quietly
        const fetchPromise = fetch(event.request).then(networkResponse => {
          // If response is valid, update cache
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        }).catch(() => {
           // Network fetch failed (e.g. offline)
           console.log('[SW] Network fetch failed, relying on cache');
        });
        
        // Return cached response immediately if there is one, otherwise wait for network
        return response || fetchPromise;
      })
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
