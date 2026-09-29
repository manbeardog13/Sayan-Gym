// Shared setup for the browser tests: a static server for the app, and pages whose
// Supabase client is the fake in mock-supabase.js. Every other outside request is blocked.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..", "..");
const MOCK = fs.readFileSync(path.join(__dirname, "mock-supabase.js"), "utf8");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".webp": "image/webp", ".jpg": "image/jpeg", ".webmanifest": "application/manifest+json", ".mp4": "video/mp4" };

async function serve() {
  const srv = http.createServer((q, r) => {
    const rel = decodeURIComponent(new URL(q.url, "http://x").pathname.replace(/^\/Sayan-Gym\//, "")) || "index.html";
    const file = path.join(ROOT, path.normalize(rel));
    if (!file.startsWith(ROOT)) { r.writeHead(403); return r.end(); }
    fs.readFile(file, (e, b) => {
      if (e) { r.writeHead(404); return r.end(); }
      // The fake Supabase client can't match the real bundle's integrity hash.
      if (rel === "index.html") b = Buffer.from(String(b).replace(/(supabase-js@[^"]+")\s+integrity="[^"]+"/, "$1"));
      r.writeHead(200, { "Content-Type": TYPES[path.extname(rel)] || "application/octet-stream" }); r.end(b);
    });
  });
  await new Promise((res) => srv.listen(0, "127.0.0.1", res));
  return { base: `http://127.0.0.1:${srv.address().port}/Sayan-Gym/`, close: () => new Promise((res) => srv.close(res)) };
}

const launch = () => chromium.launch();

// opts: route, role (admin|coach|member), trip (""|off|none|used), theme, width, signedOut, csp
async function openApp(browser, base, opts = {}) {
  const { route = "#/app", role = "admin", trip = "", theme = "light", width = 390, signedOut = false, wait = 1400 } = opts;
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: "block", timezoneId: "Europe/Zagreb", colorScheme: theme, reducedMotion: "reduce", acceptDownloads: true });
  await ctx.addInitScript(([role, trip, theme, so]) => {
    window.__SG_MOCK = { signedOut: so };
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(e.violatedDirective + " " + e.blockedURI));
    try {
      localStorage.setItem("sg_lang", "en"); localStorage.setItem("sg.theme", theme);
      localStorage.setItem("mock_role", role); localStorage.setItem("mock_trip", trip); sessionStorage.setItem("sg.splash", "1");
    } catch (e) {}
  }, [role, trip, theme, signedOut]);
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.request().url().includes("@supabase/supabase-js")
    ? r.fulfill({ contentType: "text/javascript", body: MOCK }) : r.abort());
  const page = await ctx.newPage();
  page.errs = [];
  page.on("pageerror", (e) => page.errs.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto(base + route);
  await page.waitForTimeout(wait);
  return { page, ctx };
}

// Every call the fake client recorded: { table, op, filters, payload } or { rpc, args }.
const mockCalls = (page) => page.evaluate(() => window.__SG_MOCK_CALLS || []);
const toast = (page) => page.locator("#toast").textContent().then((t) => t || "");
const noHorizontalScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

module.exports = { serve, launch, openApp, mockCalls, toast, noHorizontalScroll };
