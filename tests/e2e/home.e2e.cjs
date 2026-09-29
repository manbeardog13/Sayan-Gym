// Where the plain address lands: visitors (and search engines) on the public gym page,
// signed-in members on their dashboard. The installed app starts at #/app.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { serve, launch, openApp } = require("./helpers.cjs");

let srv, browser;
before(async () => { srv = await serve(); browser = await launch(); });
after(async () => { await browser?.close(); await srv?.close(); });

test("a signed-out visitor to the plain address sees the public gym page", async () => {
  const { page: p, ctx } = await openApp(browser, srv.base, { route: "", signedOut: true, wait: 1800 });
  try {
    assert.equal(new URL(p.url()).hash, "#/site");
    assert.match(await p.locator("#view").innerText(), /06–22/);
    assert.deepEqual(p.errs, []);
  } finally { await ctx.close(); }
});

test("a signed-in member to the plain address lands on the dashboard", async () => {
  const { page: p, ctx } = await openApp(browser, srv.base, { route: "", wait: 1800 });
  try { assert.equal(new URL(p.url()).hash, "#/app"); } finally { await ctx.close(); }
});

test("members-only pages still send visitors to sign-in", async () => {
  const { page: p, ctx } = await openApp(browser, srv.base, { route: "#/log", signedOut: true, wait: 1500 });
  try { assert.equal(new URL(p.url()).hash, "#/login"); } finally { await ctx.close(); }
});

test("the installed app still starts on the members area", () => {
  assert.equal(JSON.parse(fs.readFileSync("manifest.webmanifest", "utf8")).start_url, "./#/app");
});
