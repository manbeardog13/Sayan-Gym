// Settings → Seasons and quests: standard monthly quests.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { serve, launch, openApp, mockCalls, toast } = require("./helpers.cjs");

let srv, browser;
before(async () => { srv = await serve(); browser = await launch(); });
after(async () => { await browser?.close(); await srv?.close(); });

test("admin adds the missing standard quests and can switch the monthly automation off", async () => {
  const { page: p, ctx } = await openApp(browser, srv.base, { route: "#/admin", wait: 1600 });
  try {
    assert.ok(await p.locator("#qu-auto").isChecked(), "automation is on by default");
    // this month has 'days' and an exercise-specific 'sets' quest, so 2 standard ones are missing
    assert.match(await p.locator("#qu-std").innerText(), /\(2\)/);
    await p.click("#qu-std"); await p.waitForTimeout(400);
    assert.match(await toast(p), /Quests added: 2/);
    assert.equal((await mockCalls(p)).filter((c) => c.rpc === "add_default_quests").length, 1);
    await p.locator("#qu-auto").uncheck(); await p.waitForTimeout(300);
    const up = (await mockCalls(p)).filter((c) => c.table === "site_settings" && c.op === "upsert").pop();
    assert.equal(up.payload.key, "auto_quests"); assert.equal(up.payload.value, "off");
    assert.match(await toast(p), /switched off/);
    assert.deepEqual(p.errs, []);
  } finally { await ctx.close(); }
});
