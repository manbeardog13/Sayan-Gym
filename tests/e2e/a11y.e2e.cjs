// Accessibility: axe-core (WCAG 2.x A/AA rules) finds no violations on any screen,
// signed out and in, light and dark, including opened forms.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { serve, launch, openApp } = require("./helpers.cjs");

// Injected through the debugger, because the app's CSP (rightly) blocks inline scripts.
const AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
let srv, browser;
before(async () => { srv = await serve(); browser = await launch(); });
after(async () => { await browser?.close(); await srv?.close(); });

async function audit(p) {
  await p.evaluate(AXE);
  return p.evaluate(async () => (await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] } }))
    .violations.map((v) => `${v.id} [${v.impact}] ${v.nodes.length}× ${v.nodes[0].target.join(" ")}`));
}

const ROUTES = [["#/site", true], ["#/login", true], ["#/app"], ["#/log"], ["#/progress"], ["#/profile"], ["#/crew"], ["#/desk"], ["#/admin"], ["#/tv"], ["#/studio?tab=idea"], ["#/wrapped"]];
for (const theme of ["light", "dark"]) {
  for (const [route, signedOut = false] of ROUTES) {
    test(`${theme} ${route}${signedOut ? " (signed out)" : ""}`, async () => {
      const { page: p, ctx } = await openApp(browser, srv.base, { route, signedOut, theme, wait: 1800 });
      try { assert.deepEqual(await audit(p), []); } finally { await ctx.close(); }
    });
  }
}

test("opened states: desk search and pass form, member review request", async () => {
  let { page: p, ctx } = await openApp(browser, srv.base, { route: "#/desk" });
  try {
    await p.fill("#pd-q", "mar"); await p.waitForTimeout(600);
    await p.locator('.pd-member[data-member="u4"] [data-pd-give]').click(); await p.waitForTimeout(300);
    assert.deepEqual(await audit(p), []);
  } finally { await ctx.close(); }
  ({ page: p, ctx } = await openApp(browser, srv.base, { role: "member", theme: "dark" }));
  try {
    assert.equal(await p.locator("section.review-ask").count(), 1);
    assert.deepEqual(await audit(p), []);
  } finally { await ctx.close(); }
});

test("pinch zoom is allowed and double-tap zoom is off", async () => {
  const html = fs.readFileSync("index.html", "utf8");
  const vp = html.match(/<meta name="viewport" content="([^"]+)"/)[1];
  assert.doesNotMatch(vp, /user-scalable\s*=\s*(no|0)|maximum-scale/);
  const { page: p, ctx } = await openApp(browser, srv.base, { route: "#/log" });
  try { assert.equal(await p.evaluate(() => getComputedStyle(document.body).touchAction), "manipulation"); } finally { await ctx.close(); }
});
