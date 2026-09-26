// Cache the app shell only. Supabase API calls always go to the network.
const CACHE = "saiyan-v4-zoomlock";
const SHELL = ["./", "index.html", "css/asc.css", "css/saiyan.css", "js/config.js", "js/i18n.js", "js/app.js", "icons/icon.svg", "manifest.webmanifest", "assets/hero.webp", "assets/log.webp", "assets/checkin.webp", "assets/squat.webp"];
self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
));
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => {
    const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r;
  }).catch(() => caches.match(e.request)));
});
