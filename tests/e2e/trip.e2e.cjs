// Gym passport, return code and the Google review request (member, desk, settings).
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { serve, launch, openApp, mockCalls, toast, noHorizontalScroll } = require("./helpers.cjs");

let srv, browser;
before(async () => { srv = await serve(); browser = await launch(); });
after(async () => { await browser?.close(); await srv?.close(); });

test("member: stamps, code with offer, neutral review request, share card", async () => {
  const { page: p, ctx } = await openApp(browser, srv.base, { role: "member" });
  try {
    const trip = p.locator("section.trip");
    assert.equal(await trip.locator(".stamp").count(), 3);
    const text = await trip.innerText();
    assert.match(text, /BACK-1A2B3C/); assert.match(text, /10% off your next day pass/);
    const rv = p.locator("section.review-ask");
    assert.equal(await rv.count(), 1);
    assert.doesNotMatch(await rv.innerText(), /%|off|offer|code/i);
    assert.equal(await rv.locator("#rv-go").getAttribute("href"), "https://g.page/r/CSaiyanTest/review");
    assert.equal(await rv.locator("#rv-go").getAttribute("target"), "_blank");
    const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 5000 }), p.click("#trip-share")]);
    assert.equal(dl.suggestedFilename(), "saiyan-passport.jpg");
    await p.click("#rv-later"); await p.waitForTimeout(200);
    assert.equal(await p.locator("section.review-ask").count(), 0);
    await p.reload(); await p.waitForTimeout(1400);
    assert.equal(await p.locator("section.review-ask").count(), 0, "snoozed after reload");
    assert.deepEqual(p.errs, []);
  } finally { await ctx.close(); }
});

test("member: opening the review link hides the request for good", async () => {
  const { page: p, ctx } = await openApp(browser, srv.base, { role: "member" });
  try {
    const popup = ctx.waitForEvent("page", { timeout: 3000 }).catch(() => null);
    await p.click("#rv-go"); await popup; await p.waitForTimeout(500);
    assert.equal(await p.locator("section.review-ask").count(), 0);
    const st = await p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("sg.review.")).map((k) => localStorage.getItem(k)));
    assert.ok(st.some((v) => /"done":true/.test(v)));
  } finally { await ctx.close(); }
});

test("member: used code, no settings, no visits", async () => {
  let o = await openApp(browser, srv.base, { role: "member", trip: "used" });
  assert.match(await o.page.locator("section.trip").innerText(), /Used on/); await o.ctx.close();
  o = await openApp(browser, srv.base, { role: "member", trip: "off" });
  assert.equal(await o.page.locator(".trip-code").count(), 0);
  assert.equal(await o.page.locator("section.review-ask").count(), 0);
  assert.equal((await mockCalls(o.page)).filter((c) => c.rpc === "my_return_code").length, 0, "no code made without an offer");
  await o.ctx.close();
  o = await openApp(browser, srv.base, { role: "member", trip: "none" });
  assert.equal(await o.page.locator("section.trip, section.review-ask").count(), 0);
  assert.deepEqual(o.page.errs, []); await o.ctx.close();
});

test("desk: return codes are checked before the server and used once", async () => {
  const { page: p, ctx } = await openApp(browser, srv.base, { route: "#/desk", role: "coach" });
  try {
    await p.fill("#rd-code", "back-1a2b3c"); await p.click("#rd-use"); await p.waitForTimeout(300);
    assert.match(await toast(p), /Valid: Marko Perić/);
    await p.fill("#rd-code", "BACK-AAAAAA"); await p.press("#rd-code", "Enter"); await p.waitForTimeout(300);
    assert.match(await toast(p), /Already used on .*Ana Babić/);
    await p.fill("#rd-code", "BACK-FFFFFF"); await p.click("#rd-use"); await p.waitForTimeout(300);
    assert.match(await toast(p), /doesn't exist/);
    await p.fill("#rd-code", "hello"); await p.click("#rd-use"); await p.waitForTimeout(300);
    assert.match(await toast(p), /looks like/);
    assert.deepEqual((await mockCalls(p)).filter((c) => c.rpc === "redeem_return_code").map((c) => c.args.p_code), ["BACK-1A2B3C", "BACK-AAAAAA", "BACK-FFFFFF"]);
  } finally { await ctx.close(); }
  const off = await openApp(browser, srv.base, { route: "#/desk", role: "coach", trip: "off" });
  assert.equal(await off.page.locator("#rd-h").count(), 0); await off.ctx.close();
});

test("settings: look-alike review link refused, both saved, empty clears", async () => {
  const { page: p, ctx } = await openApp(browser, srv.base, { route: "#/admin" });
  try {
    const upserts = async () => (await mockCalls(p)).filter((c) => c.table === "site_settings" && c.op === "upsert");
    await p.fill("#rv-url", "https://www.google.com.evil.example/x"); await p.click("#save-trip"); await p.waitForTimeout(300);
    assert.match(await toast(p), /Paste Google's own link/); assert.equal((await upserts()).length, 0);
    await p.fill("#rv-url", "https://maps.app.goo.gl/Ab12"); await p.fill("#rv-offer", "Free towel next time"); await p.click("#save-trip"); await p.waitForTimeout(300);
    const saved = JSON.stringify((await upserts())[0].payload);
    assert.match(saved, /maps\.app\.goo\.gl\/Ab12/); assert.match(saved, /Free towel next time/);
    await p.fill("#rv-url", ""); await p.fill("#rv-offer", ""); await p.click("#save-trip"); await p.waitForTimeout(300);
    assert.ok((await upserts()).pop().payload.every((r) => r.value === null));
    assert.deepEqual(p.errs, []);
  } finally { await ctx.close(); }
});

test("dashboard fits phone and desktop widths", async () => {
  for (const [theme, width] of [["dark", 390], ["light", 1280]]) {
    const { page: p, ctx } = await openApp(browser, srv.base, { role: "member", theme, width });
    try { assert.ok(await noHorizontalScroll(p), `${width}px ${theme}`); } finally { await ctx.close(); }
  }
});
