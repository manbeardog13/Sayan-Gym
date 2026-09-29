// Workout logger: only sets the member did are saved.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { serve, launch, openApp, mockCalls, toast } = require("./helpers.cjs");

let srv, browser;
before(async () => { srv = await serve(); browser = await launch(); });
after(async () => { await browser?.close(); await srv?.close(); });

const savedSets = async (p) => (await mockCalls(p)).filter((c) => ["insert", "upsert"].includes(c.op) && c.table === "workout_sets").flatMap((c) => [].concat(c.payload));

test("saving untouched suggestions stores nothing and says what to do", async () => {
  const { page: p, ctx } = await openApp(browser, srv.base, { route: "#/log" });
  try {
    assert.ok(await p.locator(".ex-block").count() > 0);
    await p.click("#save"); await p.waitForTimeout(700);
    assert.equal((await savedSets(p)).length, 0);
    assert.match(await toast(p), /Tick ✓ the sets you did/);
  } finally { await ctx.close(); }
});

test("a ticked set and a typed set are saved; an added empty set is not", async () => {
  const { page: p, ctx } = await openApp(browser, srv.base, { route: "#/log" });
  try {
    await p.click('[data-done="0:0"]'); await p.waitForTimeout(100);
    await p.fill('[data-b="1"][data-s="0"][data-f="load"]', "90"); await p.fill('[data-b="1"][data-s="0"][data-f="reps"]', "8");
    await p.click('[data-add="0"]'); await p.waitForTimeout(100);
    await p.click("#save"); await p.waitForTimeout(700);
    const sets = await savedSets(p);
    assert.equal(sets.length, 2);
    assert.ok(sets.every((s) => s.load_kg > 0 && s.reps > 0 && s.set_no === 1));
    assert.ok(sets.some((s) => s.load_kg === 90 && s.reps === 8));
    assert.deepEqual(p.errs, []);
  } finally { await ctx.close(); }
});
