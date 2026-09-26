// Cache the app shell only. Supabase API calls always go to the network.
const CACHE = "saiyan-v17-member-refinement";
const SHELL = ["./", "index.html", "css/asc.css", "css/saiyan.css", "js/config.js", "js/i18n.js", "js/studio.js", "js/coach.js", "js/app.js", "js/member-ui.js", "icons/icon.svg", "manifest.webmanifest", "assets/hero.webp", "assets/log.webp", "assets/checkin.webp", "assets/squat.webp", "assets/aura-splash.jpg"];
self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
));
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  // Video seeks use partial responses, which Cache.put cannot store. Let the
  // browser handle byte ranges so the returning login can decode its last frame.
  if (e.request.headers.has("range") || url.pathname.endsWith(".mp4")) return;
  e.respondWith(fetch(e.request).then((r) => {
    const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r;
  }).catch(() => caches.match(e.request)));
});
