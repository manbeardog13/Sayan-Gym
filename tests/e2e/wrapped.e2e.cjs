// Saiyan Wrapped page (#/wrapped): the member's year from their own rows, and the share picture.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { serve, launch, openApp, mockCalls } = require("./helpers.cjs");

let srv, browser;
before(async () => { srv = await serve(); browser = await launch(); });
after(async () => { await browser?.close(); await srv?.close(); });

test("shows the year so far from the member's own data and shares a picture", async () => {
  const { page: p, ctx } = await openApp(browser, srv.base, { route: "#/wrapped", role: "member", wait: 1800 });
  try {
    const text = await p.locator(".wrapped").innerText();
    assert.match(text, /Saiyan Wrapped \d{4}/);
    assert.match(text, /days trained/);
    assert.match(text, /lifted[\s\S]*t[\s\S]*about \d+ (city bus|small car)/);
    assert.match(text, /heaviest lift/);
    const calls = await mockCalls(p);
    for (const c of calls.filter((c) => ["workouts", "check_ins"].includes(c.table))) assert.ok(c.filters.includes("eq:user_id"), `${c.table} limited to the member`);
    const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 5000 }), p.click("#wr-share")]);
    assert.match(dl.suggestedFilename(), /^saiyan-wrapped-\d{4}\.jpg$/);
    assert.deepEqual(p.errs, []);
  } finally { await ctx.close(); }
});

test("a member with no training sees a friendly empty state", async () => {
  const { page: p, ctx } = await openApp(browser, srv.base, { route: "#/wrapped?year=2021", role: "member", wait: 1500 });
  try {
    assert.match(await p.locator(".wrapped").innerText(), /Not enough training in 2021/);
    assert.equal(await p.locator("#wr-share").count(), 0);
  } finally { await ctx.close(); }
});

test("visitors are sent to sign-in", async () => {
  const { page: p, ctx } = await openApp(browser, srv.base, { route: "#/wrapped", signedOut: true, wait: 1500 });
  try { assert.equal(new URL(p.url()).hash, "#/login"); } finally { await ctx.close(); }
});
