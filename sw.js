// Service worker for offline capability
// Cleans up old caches and permits clean unregistration/updates
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.claim())
  );
});

// Pass-through fetch handler so network requests are never trapped in cache
self.addEventListener('fetch', () => {
  return;
});
