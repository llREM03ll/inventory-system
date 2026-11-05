/**
 * service-worker.js
 * Offline support.
 *  - App files (HTML, JS, CSS): network first, so an update shows up as soon as you are online.
 *    Falls back to the saved copy when offline.
 *  - Libraries, fonts, images: cache first (they never change for a given version).
 * Bump CACHE_NAME on every release so old copies are cleared.
 */
const CACHE_NAME = "brews-inventory-v16";

const APP_FILES = [
  "./", "./index.html", "./calculate.html", "./pos.html", "./calendar.html", "./settings.html",
  "./manifest.json", "./css/styles.css",
  "./js/util.js", "./js/theme.js", "./js/appstyle.js", "./js/nav.js", "./js/header.js", "./js/layout.js",
  "./js/settings.js", "./js/menu.js", "./js/sync.js",
  "./js/InventorySystem.js", "./js/storage.js", "./js/history.js", "./js/ui.js", "./js/main.js",
  "./js/home.js", "./js/pos.js", "./js/calendar.js", "./js/calc-page.js", "./js/settings-page.js",
];
const STATIC_FILES = [
  "./vendor/firebase-app-compat.js", "./vendor/firebase-firestore-compat.js", "./vendor/html2canvas.min.js",
  "./vendor/THIRD_PARTY_NOTICES.md", "./LICENSE",
  "./fonts/plus-jakarta-sans-latin-400-normal.woff2", "./fonts/plus-jakarta-sans-latin-500-normal.woff2",
  "./fonts/plus-jakarta-sans-latin-600-normal.woff2", "./fonts/plus-jakarta-sans-latin-700-normal.woff2",
  "./fonts/plus-jakarta-sans-latin-800-normal.woff2",
  "./fonts/cormorant-garamond-latin-400-normal.woff2", "./fonts/cormorant-garamond-latin-600-normal.woff2",
  "./fonts/cormorant-garamond-latin-700-normal.woff2",
  "./fonts/cormorant-garamond-latin-400-italic.woff2", "./fonts/cormorant-garamond-latin-600-italic.woff2",
  "./icon-192.png", "./icon-512.png", "./Image1.jpg",
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(APP_FILES.concat(STATIC_FILES).map(url =>
        cache.add(url).catch(err => console.warn("SW: failed to cache", url, err))
      ))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;            // never touch cloud sync traffic

  const isStatic = /\/(vendor|fonts)\//.test(url.pathname) || /\.(png|woff2)$/.test(url.pathname);

  if (isStatic) {
    event.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone(); caches.open(CACHE_NAME).then(c => c.put(req, copy)); return res;
    })));
    return;
  }

  event.respondWith(
    fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE_NAME).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then(hit => hit || (req.mode === "navigate" ? caches.match("./index.html") : Response.error())))
  );
});
