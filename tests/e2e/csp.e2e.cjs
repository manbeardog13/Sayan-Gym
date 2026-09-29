// The content security policy blocks nothing the app itself needs, on every route.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { serve, launch, openApp } = require("./helpers.cjs");

let srv, browser;
before(async () => { srv = await serve(); browser = await launch(); });
after(async () => { await browser?.close(); await srv?.close(); });

const ROUTES = [["#/site", true], ["#/login", true], ["#/app"], ["#/log"], ["#/progress"], ["#/profile"], ["#/desk"], ["#/admin"], ["#/crew"], ["#/tv"], ["#/studio?tab=idea"]];
for (const [route, signedOut = false] of ROUTES) {
  test(`${route}${signedOut ? " (signed out)" : ""}: no CSP violations, no page errors`, async () => {
    const { page: p, ctx } = await openApp(browser, srv.base, { route, signedOut, width: 1280, wait: 1800 });
    try {
      const v = await p.evaluate(() => ({ csp: window.__csp, supabase: !!window.supabase }));
      assert.ok(v.supabase, "Supabase client loaded");
      assert.deepEqual(v.csp, []);
      assert.deepEqual(p.errs, []);
    } finally { await ctx.close(); }
  });
}
