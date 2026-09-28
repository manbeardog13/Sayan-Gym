const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('js/passes.js', 'utf8');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function context() {
  const ctx = vm.createContext({
    L: (hr, en) => en, esc, t: s => s, nameOf: x => x?.name_en, fmtDate: d => String(d).slice(0, 10),
    Date, Math, JSON, Object, Array, String, Number, Infinity,
  });
  vm.runInContext(source, ctx);
  Object.assign(ctx, vm.runInContext('({ SOON_DAYS, planDays })', ctx));
  return ctx;
}
const NOW = new Date('2026-09-29T10:00:00Z');
const pass = (id, ends, status = 'active') => ({ id, user_id: 'u', plan_id: 'p', status, ends_at: ends, membership_plans: { name_en: 'Month' } });

test('current pass is the active one that ends last; ended and cancelled ones do not count', () => {
  const ctx = context();
  const rows = [pass('old', '2026-09-28T22:00:00Z'), pass('a', '2026-10-05T22:00:00Z'), pass('b', '2026-10-20T22:00:00Z'), pass('c', '2026-12-01T22:00:00Z', 'cancelled')];
  assert.equal(ctx.currentPass(rows, NOW).id, 'b');
  assert.equal(ctx.currentPass([pass('old', '2026-09-28T22:00:00Z')], NOW), null);
  assert.equal(ctx.currentPass([], NOW), null);
  assert.equal(ctx.currentPass([pass('a', '2026-10-05T22:00:00Z'), pass('open', null)], NOW).id, 'open');
});

test('days left counts part of a day as a day and never goes negative', () => {
  const ctx = context();
  assert.equal(ctx.daysLeft('2026-09-29T22:00:00Z', NOW), 1);
  assert.equal(ctx.daysLeft('2026-10-29T22:00:00Z', NOW), 31);
  assert.equal(ctx.daysLeft('2026-09-01T00:00:00Z', NOW), 0);
  assert.equal(ctx.daysLeft(null, NOW), null);
});

test('pass line says no pass, ok or ending soon', () => {
  const ctx = context();
  assert.equal(ctx.passLine(null, NOW).cls, 'none');
  assert.equal(ctx.passLine(pass('a', '2026-10-29T22:00:00Z'), NOW).cls, 'ok');
  const soon = ctx.passLine(pass('a', '2026-10-02T22:00:00Z'), NOW);
  assert.equal(soon.cls, 'soon'); assert.match(soon.text, /Month · until 2026-10-02 \(4 d left\)/);
});

test('plan days prefill from the plan; a day pass is 1; a multi-entry card is typed in', () => {
  const ctx = context();
  assert.equal(ctx.planDays({ kind: 'month', duration_days: 30 }), '30');
  assert.equal(ctx.planDays({ kind: 'day', duration_days: null }), '1');
  assert.equal(ctx.planDays({ kind: 'multi', duration_days: null }), '');
});

test('member row: check-in only with a valid pass, give/renew/cancel only for admins, names escaped', () => {
  const ctx = context();
  const p = { id: 'u1', display_name: '<img src=x>' };
  const m = pass('m1', '2026-10-29T22:00:00Z');
  const coach = ctx.memberRowHtml(p, m, false, NOW);
  assert.match(coach, /data-pd-in="u1"/);
  assert.ok(!/data-pd-give|data-pd-cancel/.test(coach));
  assert.ok(!coach.includes('<img'));
  const admin = ctx.memberRowHtml(p, m, true, NOW);
  assert.match(admin, /data-pd-give="u1" data-pd-plan="p">Renew/);
  assert.match(admin, /data-pd-cancel="m1"/);
  const none = ctx.memberRowHtml(p, null, true, NOW);
  assert.ok(!/data-pd-in|data-pd-cancel/.test(none));
  assert.match(none, /Give pass/);
});

test('pass form preselects the renewed plan and its days', () => {
  const ctx = context();
  const plans = [{ id: 'd', kind: 'day', name_en: 'Day', price_eur: 18 }, { id: 'm', kind: 'month', name_en: 'Month', duration_days: 30 }];
  const html = ctx.passFormHtml(plans, 'm');
  assert.match(html, /value="m" data-days="30" selected/);
  assert.match(html, /id="pd-days" inputmode="numeric" value="30"/);
  assert.match(ctx.passFormHtml(plans, ''), /id="pd-days" inputmode="numeric" value="1"/);
});
