// Offline promise, with the real service worker: after one visit the app opens with no signal,
// the pinned CDN scripts come from the cache, and a set saved offline waits on the phone and is
// sent once the connection returns. The "CDN" is a second local origin: index.html and the worker
// are served with the jsdelivr prefix rewritten to it, so the worker's prefix match still applies.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..", "..");
const MOCK = fs.readFileSync(path.join(__dirname, "mock-supabase.js"), "utf8");
const CACHE = fs.readFileSync(path.join(ROOT, "service-worker.js"), "utf8").match(/const CACHE = "([^"]+)"/)[1];
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".webp": "image/webp", ".jpg": "image/jpeg", ".webmanifest": "application/manifest+json", ".mp4": "video/mp4" };

let cdn, app, browser, cdnOrigin, base, cdnHits = 0;
before(async () => {
  cdn = http.createServer((q, r) => { cdnHits++;
    r.writeHead(200, { "Content-Type": "text/javascript", "Access-Control-Allow-Origin": "*" });
    r.end(q.url.includes("supabase") ? MOCK : "/* qrcode not needed offline */"); });
  await new Promise((r) => cdn.listen(0, "127.0.0.1", r));
  cdnOrigin = `http://127.0.0.1:${cdn.address().port}`;
  app = http.createServer((q, r) => {
    const rel = decodeURIComponent(new URL(q.url, "http://x").pathname.replace(/^\/Sayan-Gym\//, "")) || "index.html";
    fs.readFile(path.join(ROOT, path.normalize(rel)), (e, b) => {
      if (e) { r.writeHead(404); return r.end(); }
      if (rel === "index.html" || rel === "service-worker.js") {
        let s = String(b).replaceAll("https://cdn.jsdelivr.net", cdnOrigin);
        // the mock can't match the real bundle's hash, and the CSP only allows the real CDN
        if (rel === "index.html") s = s.replace(/ integrity="[^"]+"/g, "").replace(/<meta http-equiv="Content-Security-Policy"[^>]+>/, "");
        b = Buffer.from(s);
      }
      r.writeHead(200, { "Content-Type": TYPES[path.extname(rel)] || "application/octet-stream" }); r.end(b);
    });
  });
  // "localhost" (not 127.0.0.1) so the app and the CDN are different origins
  await new Promise((r) => app.listen(0, "127.0.0.1", r));
  base = `http://localhost:${app.address().port}/Sayan-Gym/`;
  browser = await chromium.launch({ channel: "chromium" });
});
after(async () => { await browser?.close(); app?.close(); cdn?.close(); });

const outbox = (p) => p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("sg.outbox.")).reduce((n, k) => n + JSON.parse(localStorage.getItem(k)).length, 0));

test("after one visit the logger opens offline and keeps a set until the signal returns", async () => {
  const ctx = await browser.newContext({ serviceWorkers: "allow", viewport: { width: 390, height: 844 }, timezoneId: "Europe/Zagreb" });
  await ctx.addInitScript(() => { try { localStorage.setItem("sg_lang", "en"); sessionStorage.setItem("sg.splash", "1"); } catch (e) {} });
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  try {
    await p.goto(base + "#/log"); await p.waitForTimeout(1500);
    await p.evaluate(() => navigator.serviceWorker.ready);
    await p.reload(); await p.waitForTimeout(1500);
    assert.ok(await p.evaluate(() => !!navigator.serviceWorker.controller), "page is controlled by the worker");
    const cached = await p.evaluate(async (c) => (await (await caches.open(c)).keys()).map((r) => r.url), CACHE);
    assert.equal(cached.filter((u) => u.startsWith("http://127.0.0.1") && u.includes("/npm/")).length, 2, "both pinned CDN scripts cached");

    const hits = cdnHits;
    await ctx.setOffline(true);
    await p.reload(); await p.waitForTimeout(1800);
    assert.equal(cdnHits - hits, 0, "no CDN request while offline");
    assert.ok(await p.evaluate(() => !!window.supabase), "Supabase client from cache");
    assert.equal(new URL(p.url()).hash, "#/log");
    assert.ok(await p.locator(".ex-block").count() > 0, "exercises shown from the phone's copy");

    await p.fill('[data-b="0"][data-s="0"][data-f="load"]', "150"); await p.fill('[data-b="0"][data-s="0"][data-f="reps"]', "3");
    await p.click("#save"); await p.waitForTimeout(800);
    assert.equal(await outbox(p), 1, "the workout waits on the phone");

    await ctx.setOffline(false); await p.waitForTimeout(1500);
    assert.equal(await outbox(p), 0, "sent once back online");
    assert.deepEqual(errs, []);
  } finally { await ctx.close(); }
});
