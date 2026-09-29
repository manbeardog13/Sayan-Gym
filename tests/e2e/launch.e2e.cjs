// Settings → "Ready to launch?" checklist.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { serve, launch, openApp, noHorizontalScroll } = require("./helpers.cjs");

let srv, browser;
before(async () => { srv = await serve(); browser = await launch(); });
after(async () => { await browser?.close(); await srv?.close(); });

test("checklist is first, ticks from data, Go focuses the right field", async () => {
  const { page: p, ctx } = await openApp(browser, srv.base, { route: "#/admin", wait: 1600 });
  try {
    assert.ok(await p.evaluate(() => document.querySelector(".grid > section")?.classList.contains("launch")));
    const card = p.locator("section.launch");
    assert.equal(await card.locator(".launch-item.ok").filter({ hasText: "Give the first pass" }).count(), 1);
    assert.equal(await card.locator(".launch-item.ok").filter({ hasText: "Google review link" }).count(), 1);
    assert.equal(await card.locator(".launch-item.todo").filter({ hasText: "gym Gmail" }).count(), 1);
    assert.match(await card.innerText(), /Monthly membership|10-entry card/);
    await card.locator(".launch-item").filter({ hasText: "gym Gmail" }).locator("[data-launch-go]").click(); await p.waitForTimeout(600);
    assert.equal(await p.evaluate(() => document.activeElement?.id), "gym-mail");
    await card.locator(".launch-item").filter({ hasText: "Add prices" }).locator("[data-launch-go]").click(); await p.waitForTimeout(600);
    assert.ok(await p.evaluate(() => !!document.activeElement?.closest('[aria-labelledby="ap"]')));
    assert.ok(await noHorizontalScroll(p));
    assert.deepEqual(p.errs, []);
  } finally { await ctx.close(); }
});

test("no review link shows as open; coaches don't get Settings", async () => {
  let o = await openApp(browser, srv.base, { route: "#/admin", trip: "off" });
  assert.equal(await o.page.locator("section.launch .launch-item.todo").filter({ hasText: "Google review link" }).count(), 1);
  await o.ctx.close();
  o = await openApp(browser, srv.base, { route: "#/admin", role: "coach" });
  assert.equal(await o.page.locator("section.launch").count(), 0);
  await o.ctx.close();
});
