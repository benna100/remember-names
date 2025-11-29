const CACHE_NAME = "remember-names-v3";
const ASSETS_TO_CACHE = [
  "/",
  "/index.html",
  "/css/styles.css",
  "/js/app.js",
  "/js/db.js",
  "/js/contacts.js",
  "/js/connections.js",
  "/js/network.js",
  "/js/ui.js",
  "/assets/icons/icon-192.svg",
  "/assets/icons/icon-512.svg",
  "/assets/placeholder.svg",
  "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.js",
  "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.wasm",
  "https://cdnjs.cloudflare.com/ajax/libs/vis-network/9.1.9/vis-network.min.js",
];

// Install event - cache assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        console.log("Caching app assets");
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener("fetch", (event) => {
  // Skip non-GET requests
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches
      .match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(event.request).then((response) => {
          // Don't cache non-successful responses or external URLs we don't control
          if (!response || response.status !== 200) {
            return response;
          }

          // Clone the response
          const responseToCache = response.clone();

          // Cache successful responses for same-origin or CDN resources
          const url = new URL(event.request.url);
          if (
            url.origin === location.origin ||
            url.hostname === "cdnjs.cloudflare.com"
          ) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }

          return response;
        });
      })
      .catch(() => {
        // Return offline fallback if available
        if (event.request.destination === "document") {
          return caches.match("/index.html");
        }
      })
  );
});
