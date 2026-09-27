// Zoom lock: iOS Safari ignores user-scalable=no, so block pinch and double-tap zoom here too.
["gesturestart", "gesturechange", "gestureend"].forEach((ev) => document.addEventListener(ev, (e) => e.preventDefault(), { passive: false }));
document.addEventListener("touchmove", (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
let lastTouchEnd = 0;
document.addEventListener("touchend", (e) => { const now = Date.now(); if (now - lastTouchEnd < 300) e.preventDefault(); lastTouchEnd = now; }, { passive: false });
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("service-worker.js").catch(() => {}));
}
