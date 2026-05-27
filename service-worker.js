const CACHE_NAME = "brews-inventory-v8";
const urlsToCache = [
  "./",
  "./index.html",
  "./calculate.html",
  "./pos.html",
  "./calendar.html",
  "./manifest.json",
  "./css/styles.css",
  "./js/settings.js",
  "./js/sync.js",
  "./js/InventorySystem.js",
  "./js/storage.js",
  "./js/history.js",
  "./js/ui.js",
  "./js/main.js",
  "./Image1.jpg",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(urlsToCache.map(url =>
        cache.add(url).catch(err => console.warn("SW: failed to cache", url, err))
      ))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});
