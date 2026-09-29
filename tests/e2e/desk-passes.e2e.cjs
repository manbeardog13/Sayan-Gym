// Front desk → Members and passes (admin and coach).
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { serve, launch, openApp, mockCalls, toast, noHorizontalScroll } = require("./helpers.cjs");

let srv, browser;
before(async () => { srv = await serve(); browser = await launch(); });
after(async () => { await browser?.close(); await srv?.close(); });

const search = async (p, s) => { await p.fill("#pd-q", s); await p.waitForTimeout(600); };
const rpcs = async (p, name) => (await mockCalls(p)).filter((c) => c.rpc === name);

test("admin: search, renew keeps the plan, ending-soon list", async () => {
  const { page: p, ctx } = await openApp(browser, srv.base, { route: "#/desk" });
  try {
    const card = await p.locator("#pd-h").locator("xpath=..").innerText();
    assert.match(card, /Ending in the next 7 days · 1/);
    assert.match(card, /Marko Perić/);
    await search(p, "mar");
    assert.equal(await p.locator(".pd-member").count(), 2);
    const marko = p.locator('.pd-member[data-member="u4"]');
    assert.match(await marko.innerText(), /until .*\(3 d left\)/);
    assert.equal(await marko.locator(".pd-soon").count(), 1);
    await marko.locator("[data-pd-give]").click(); await p.waitForTimeout(300);
    assert.equal(await p.locator("#pd-plan").inputValue(), "p3");
    assert.ok(!(await p.locator("#pd-plan option").allInnerTexts()).some((t) => /Towel/.test(t)), "add-ons are not passes");
    await p.fill("#pd-days", "30"); await p.click("#pd-give"); await p.waitForTimeout(400);
    assert.match(await toast(p), /Extended to .* Same QR code\./);
    assert.deepEqual((await rpcs(p, "give_pass")).map((c) => c.args), [{ p_user: "u4", p_plan: "p3", p_days: 30, p_source: "desk" }]);
    assert.deepEqual(p.errs, []);
  } finally { await ctx.close(); }
});

test("admin: new pass, days checked before the server, cancel, check in by name", async () => {
  const { page: p, ctx } = await openApp(browser, srv.base, { route: "#/desk" });
  try {
    await search(p, "luka");
    const luka = p.locator('.pd-member[data-member="u6"]');
    assert.match(await luka.innerText(), /No valid pass/);
    assert.equal(await luka.locator("[data-pd-in]").count(), 0);
    await luka.locator("[data-pd-give]").click(); await p.waitForTimeout(300);
    assert.equal(await p.locator("#pd-days").inputValue(), "1");
    await p.selectOption("#pd-plan", "p4");
    assert.equal(await p.locator("#pd-days").inputValue(), "");
    await p.click("#pd-give"); await p.waitForTimeout(200);
    assert.match(await toast(p), /Enter the number of days/);
    assert.equal((await rpcs(p, "give_pass")).length, 0);
    await p.selectOption("#pd-src", "multisport"); await p.fill("#pd-days", "90"); await p.click("#pd-give"); await p.waitForTimeout(400);
    assert.deepEqual((await rpcs(p, "give_pass")).map((c) => c.args), [{ p_user: "u6", p_plan: "p4", p_days: 90, p_source: "multisport" }]);
    await search(p, "marko");
    await p.locator('[data-pd-cancel="m4"]').click(); await p.waitForTimeout(400);
    assert.deepEqual((await rpcs(p, "cancel_pass")).map((c) => c.args), [{ p_membership: "m4" }]);
    await search(p, "marko");
    await p.locator('[data-pd-in="u4"]').click(); await p.waitForTimeout(400);
    assert.ok((await mockCalls(p)).some((c) => c.table === "check_ins" && c.op === "insert" && c.payload?.user_id === "u4"));
    assert.deepEqual(p.errs, []);
  } finally { await ctx.close(); }
});

test("coach: can check in, cannot give, renew or cancel", async () => {
  const { page: p, ctx } = await openApp(browser, srv.base, { route: "#/desk", role: "coach" });
  try {
    await search(p, "mar");
    assert.equal(await p.locator("[data-pd-give], [data-pd-cancel], [data-pd-renew]").count(), 0);
    assert.equal(await p.locator('[data-pd-in="u4"]').count(), 1);
    assert.deepEqual(p.errs, []);
  } finally { await ctx.close(); }
});

test("desk fits phone and desktop widths", async () => {
  for (const [theme, width] of [["light", 390], ["dark", 1280]]) {
    const { page: p, ctx } = await openApp(browser, srv.base, { route: "#/desk", theme, width });
    try { assert.ok(await noHorizontalScroll(p), `${width}px ${theme}`); } finally { await ctx.close(); }
  }
});
