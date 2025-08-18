const CACHE_NAME = "brews-inventory-v1";
const urlsToCache = [
  "./",
  "./index.html",
  "./manifest.json",
  "./Image1.jpg",
  "./icon-192.png",
  "./icon-512.png"
];

// Install & cache files
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

// Serve from cache when offline
self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});
