const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('js/launch.js', 'utf8');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function context() {
  const ctx = vm.createContext({ L: (hr, en) => en, esc, nameOf: x => x?.name_en, Intl, Date, JSON, Math, Object, Array, String, Number });
  vm.runInContext(source, ctx);
  Object.assign(ctx, vm.runInContext('({ zagrebMonthStart })', ctx));
  return ctx;
}
const PLANS = [
  { kind: 'day', is_published: true, price_eur: 18, name_en: 'Day pass' },
  { kind: 'addon', is_published: true, price_eur: null, name_en: 'PT' },
  { kind: 'month', is_published: true, price_eur: null, name_en: 'Monthly' },
  { kind: 'multi', is_published: false, price_eur: null, name_en: 'Hidden card' },
];
const NONE = { pass: false, mail: false, gemini: false, plans: PLANS, review: false, photos: 0, quests: 0 };
const ALL = { pass: true, mail: true, gemini: true, plans: [PLANS[0]], review: true, photos: 3, quests: 2 };
const byKey = (items) => Object.fromEntries(Array.from(items, (i) => [i.key, i]));

test('nothing set: every item open, two marked needed, unpriced published plans named', () => {
  const ctx = context();
  const items = ctx.launchItems(NONE);
  assert.equal(items.filter((i) => i.done !== true).length, 7);
  assert.deepEqual(Array.from(items.filter((i) => i.need), (i) => i.key), ['pass', 'mail']);
  const why = byKey(items).prices.why;
  assert.match(why, /Monthly/); assert.ok(!/PT|Hidden card|Day pass/.test(why));
  const html = ctx.launchHtml(items);
  assert.match(html, /0\/7/); assert.match(html, /2 still needed to launch/);
  assert.equal((html.match(/data-launch-go=/g) || []).length, 7);
  assert.match(html, /data-launch-go="#\/desk"/);
});

test('everything set: a single done line, no buttons', () => {
  const ctx = context();
  const html = ctx.launchHtml(ctx.launchItems(ALL));
  assert.match(html, /Everything is set/); assert.ok(!/data-launch-go/.test(html));
});

test('essentials done: says so, keeps the recommended ones open', () => {
  const ctx = context();
  const html = ctx.launchHtml(ctx.launchItems({ ...NONE, pass: true, mail: true }));
  assert.match(html, /The essentials are done/); assert.match(html, /2\/7/);
});

test('when the email check fails it says so instead of claiming either way', () => {
  const ctx = context();
  const items = ctx.launchItems({ ...ALL, mail: null, gemini: null });
  assert.equal(byKey(items).mail.done, null);
  const html = ctx.launchHtml(items);
  assert.match(html, /Couldn&#39;t check right now/); assert.match(html, /launch-item unknown/);
  assert.match(html, /Some items couldn&#39;t be checked/); assert.ok(!/essentials are done|still needed/.test(html));
  assert.ok(!/Everything is set/.test(html));
});

test('plan names are escaped', () => {
  const ctx = context();
  const html = ctx.launchHtml(ctx.launchItems({ ...NONE, plans: [{ kind: 'month', is_published: true, price_eur: null, name_en: '<img src=x>' }] }));
  assert.ok(!html.includes('<img')); assert.match(html, /&lt;img/);
});

test('this month starts on the 1st in Zagreb time', () => {
  const ctx = context();
  assert.equal(ctx.zagrebMonthStart(new Date('2026-09-30T22:30:00Z')), '2026-10-01');
  assert.equal(ctx.zagrebMonthStart(new Date('2026-09-15T10:00:00Z')), '2026-09-01');
});
