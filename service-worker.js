const CACHE_NAME = "brews-inventory-v3";
const urlsToCache = [
  "./",
  "./index.html",
  "./pos.html",
  "./calendar.html",
  "./manifest.json",
  "./css/styles.css",
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
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
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
