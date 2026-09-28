const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('js/crew.js', 'utf8');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function context(extra = {}) {
  const store = new Map();
  const toasts = [];
  const ctx = vm.createContext({
    L: (hr, en) => en, LANG: 'en', esc, t: s => s, toasts, toast: m => toasts.push(m), console: { error() {} },
    fmtDate: d => String(d).slice(0, 10), fmtKg: n => `${n} kg`, nameOf: x => x?.name_en,
    state: { session: { user: { id: 'u1' } } },
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    addEventListener() {}, document: { addEventListener() {} },
    Intl, Date, JSON, Math, Object, Array, String, Number, Set, Promise,
    ...extra,
  });
  vm.runInContext(source, ctx);
  // top-level consts live in the script scope, not on the context object
  Object.assign(ctx, vm.runInContext('({ Outbox, Draft })', ctx));
  return ctx;
}

// A fake Supabase client: `fail` decides each call's error ('net' = no signal, 'db' = rejected row).
function fakeSb(fail) {
  const calls = [];
  const sb = { from(table) { return { upsert(rows, opts) {
    calls.push({ table, rows, opts });
    const f = fail(table, calls.length);
    return Promise.resolve({ error: f === 'net' ? { message: 'TypeError: Failed to fetch', code: '' } : f === 'db' ? { message: 'check violated', code: '23514' } : null });
  } }; } };
  return { sb, calls };
}
const entry = (id) => ({ workout: { id, performed_on: '2026-09-28' }, sets: [{ id: id + '-s1', workout_id: id, exercise_id: 'e', set_no: 1, load_kg: 100, reps: 5 }] });

test('outbox keeps workouts while offline and never drops them', async () => {
  const { sb } = fakeSb(() => 'net');
  const ctx = context({ sb });
  ctx.Outbox.add(entry('w1')); ctx.Outbox.add(entry('w2'));
  await ctx.Outbox.flush();
  assert.equal(ctx.Outbox.read().length, 2);
  assert.ok(ctx.Outbox.has('w1') && ctx.Outbox.has('w2'));
});

test('outbox sends with client ids and ignore-duplicates, then clears', async () => {
  const { sb, calls } = fakeSb(() => null);
  const ctx = context({ sb });
  ctx.Outbox.add(entry('w1'));
  await ctx.Outbox.flush();
  assert.equal(ctx.Outbox.read().length, 0);
  assert.deepEqual(calls.map(c => c.table), ['workouts', 'workout_sets']);
  assert.ok(calls.every(c => c.opts.onConflict === 'id' && c.opts.ignoreDuplicates === true));
  assert.equal(calls[0].rows.id, 'w1'); assert.equal(calls[1].rows[0].workout_id, 'w1');
});

test('outbox stops at the first network failure and keeps the rest in order', async () => {
  // first workout goes through (2 calls), the second hits no signal
  const { sb } = fakeSb((table, n) => (n <= 2 ? null : 'net'));
  const ctx = context({ sb });
  ctx.Outbox.add(entry('w1')); ctx.Outbox.add(entry('w2')); ctx.Outbox.add(entry('w3'));
  await ctx.Outbox.flush();
  assert.deepEqual(Array.from(ctx.Outbox.read(), e => e.workout.id), ['w2', 'w3']);
});

test('a row the database rejects is reported, not retried forever', async () => {
  const { sb } = fakeSb(() => 'db');
  const ctx = context({ sb });
  ctx.Outbox.add(entry('w1'));
  await ctx.Outbox.flush();
  assert.equal(ctx.Outbox.read().length, 0);
  assert.equal(ctx.toasts.length, 1);
});

test('drafts expire and empty drafts are not kept', () => {
  const ctx = context();
  ctx.Draft.save('2026-09-28', [{ exercise_id: 'e', sets: [{ load: '100', reps: '5' }] }]);
  assert.equal(ctx.Draft.read().day, '2026-09-28');
  ctx.Draft.save('2026-09-28', []);
  assert.equal(ctx.Draft.read(), null);
  ctx.localStorage.setItem('sg.draft.u1', JSON.stringify({ day: 'x', blocks: [{}], at: Date.now() - 19 * 3600e3 }));
  assert.equal(ctx.Draft.read(), null);
});

test('best time shows opening hours only and marks hidden hours as no data', () => {
  const ctx = context();
  const rows = [{ dow: 1, hour: 7, level: 0 }, { dow: 1, hour: 18, level: 2 }, { dow: 7, hour: 10, level: 1 }];
  const mon = ctx.bestTimesHtml(rows, 1);
  assert.equal((mon.match(/class="bt-bar[ "]/g) || []).length, 16);   // 06–21
  assert.equal((mon.match(/bt-bar none/g) || []).length, 14);
  assert.match(mon, /Quietest: 7:00/);
  const sun = ctx.bestTimesHtml(rows, 7);
  assert.equal((sun.match(/class="bt-bar[ "]/g) || []).length, 14);   // 06–19
  assert.match(ctx.bestTimesHtml([], 1), /Not enough check-ins yet/);
});

test('season card offers joining only when not joined, and explains what is shown', () => {
  const ctx = context();
  const open = { id: 's', name: 'S', starts_on: '2026-09-01', ends_on: '2099-10-10', teams: 2, joined: false };
  const st = [{ season_name: 'S', starts_on: '2026-09-01', ends_on: '2099-10-10', team_id: 't1', team_name: '<b>Lava</b>', color: 0, members: 1, points: 10, avg_points: 10 }];
  const html = ctx.seasonHtml(open, st, []);
  assert.match(html, /id="season-join"/);
  assert.match(html, /first name and points to your team/);
  assert.ok(!html.includes('<b>Lava</b>'));
  const joined = ctx.seasonHtml({ ...open, joined: true }, st, [{ team_id: 't1', team_name: 'Lava', first_name: 'Toni', points: 10, is_me: true }]);
  assert.ok(!joined.includes('id="season-join"'));
  assert.match(joined, /id="season-leave"/);
});

test('club board names only opted-in members and counts the rest', () => {
  const ctx = context();
  const html = ctx.clubHtml(null, [{ tier: 400, first_name: 'Toni', total_kg: 440 }, { tier: 400, first_name: null, total_kg: null }, { tier: 300, first_name: null, total_kg: null }]);
  assert.match(html, /Toni/);
  assert.match(html, /\+1/);
  assert.ok(!/null/.test(html));
});

test('kudos button reflects my kudos and the count', () => {
  const ctx = context();
  const on = ctx.kudosButton({ id: 5, first_name: 'Ana', pr_kudos: [{ count: 3 }] }, new Set([5]));
  assert.match(on, /aria-pressed="true"/); assert.match(on, /<span>3<\/span>/);
  const off = ctx.kudosButton({ id: 6, first_name: '"><x>' }, new Set());
  assert.match(off, /aria-pressed="false"/); assert.ok(!off.includes('"><x>'));
});
