// Cache the app shell only. Supabase API calls always go to the network.
const CACHE = "saiyan-v24-trip";
const SHELL = ["./", "index.html", "css/asc.css", "css/saiyan.css", "js/boot-theme.js", "js/boot.js", "js/config.js", "js/i18n.js", "js/studio.js", "js/coach.js", "js/crew.js", "js/passes.js", "js/trip.js", "js/app.js", "js/member-ui.js", "icons/icon.svg", "manifest.webmanifest", "assets/hero.webp", "assets/log.webp", "assets/checkin.webp", "assets/squat.webp", "assets/aura-splash.jpg"];
// The two pinned CDN scripts never change at these exact versions, so the app can still
// open (and log sets) with no signal in the gym. Their SRI hashes still apply.
const CDN = ["https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/", "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/"];
self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
));
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (CDN.some((p) => e.request.url.startsWith(p))) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return r;
    })));
    return;
  }
  if (url.origin !== location.origin) return;
  // Video seeks use partial responses, which Cache.put cannot store. Let the
  // browser handle byte ranges so the returning login can decode its last frame.
  if (e.request.headers.has("range") || url.pathname.endsWith(".mp4")) return;
  e.respondWith(fetch(e.request).then((r) => {
    const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r;
  }).catch(() => caches.match(e.request)));
});

// Push: at most one a day, sent by the "push" Edge Function.
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) {}
  e.waitUntil(self.registration.showNotification(d.title || "Saiyan Gym FITT", {
    body: d.body || "", icon: "icons/icon.svg", badge: "icons/icon.svg", tag: d.tag || "saiyan",
    data: { url: typeof d.url === "string" && d.url.startsWith("#/") ? d.url : "#/app" },
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = new URL(e.notification.data?.url || "#/app", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => c.url.startsWith(self.registration.scope));
    if (open) return open.focus().then((c) => c.navigate(target)).catch(() => self.clients.openWindow(target));
    return self.clients.openWindow(target);
  }));
});
