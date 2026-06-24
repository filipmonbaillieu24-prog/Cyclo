const CACHE_NAME = 'cyclo-cache-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './redesign.css',
  './bug-reporter.css',
  './bike-computer.css',
  './fit-parser.vendor.js',
  './activity-parser.js',
  './app.js',
  './bug-reporter.js',
  './ble-sensors.js',
  './desktop-view.js',
  './mobile-view.js',
  './mode-bikecomputer.js',
  './state.js',
  './auth.js',
  './calendar.js',
  './activities.js',
  './equipment.js',
  './onboarding.js',
  './profile-avatar.js',
  './zones.js',
  './social.js',
  './realtime.js',
  './route-builder.js',
  './zwift-importer.js',
  './manifest.json',
  './icon.svg',
  './activity-pipeline.js',
  './strava-sync.js',
  './garmin-sync.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://unpkg.com/lucide@latest',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://cdn.jsdelivr.net/npm/chart.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Use allSettled to ensure that single failed cache requests do not block installation
      return Promise.allSettled(
        ASSETS_TO_CACHE.map((url) => {
          return cache.add(url).catch((err) => {
            console.warn(`[PWA Service Worker] failed to cache asset: ${url}`, err);
          });
        })
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
  // Skip non-GET requests, Supabase API calls and local authentication endpoint
  if (
    event.request.method !== 'GET' || 
    event.request.url.includes('/rest/v1/') || 
    event.request.url.includes('/auth/v1/') ||
    event.request.url.includes('/api/report-bug')
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch in background (stale-while-revalidate)
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, networkResponse);
            });
          }
        }).catch(() => {});
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse;
        }

        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      }).catch((err) => {
        console.warn(`[PWA Service Worker] offline fetch failed for: ${event.request.url}`, err);
      });
    })
  );
});
