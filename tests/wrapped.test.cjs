const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('js/wrapped.js', 'utf8');

function context() {
  const ctx = vm.createContext({ L: (hr, en) => en, LANG: 'en', esc: (s) => String(s), nameOf: (x) => x?.name_en, fmtKg: (n) => `${n} kg`,
    Intl, Date, JSON, Math, Object, Array, String, Number, Set, Map, Promise });
  vm.runInContext(source, ctx);
  return ctx;
}
const EX = [{ id: 'sq', name_en: 'Back squat' }, { id: 'dl', name_en: 'Deadlift' }];

test('season: 1 Dec to 15 Jan (Zagreb dates), otherwise none', () => {
  const { wrappedSeasonYear: s } = context();
  assert.equal(s(new Date('2026-12-01T08:00:00Z')), 2026);
  assert.equal(s(new Date('2026-11-30T23:30:00Z')), 2026, 'already 1 Dec in Zagreb');
  assert.equal(s(new Date('2027-01-15T12:00:00Z')), 2026);
  assert.equal(s(new Date('2027-01-16T12:00:00Z')), null);
  assert.equal(s(new Date('2026-09-29T12:00:00Z')), null);
});

test('tonnes become buses or small cars, never zero', () => {
  const { tonnesPicture: t } = context();
  assert.equal(t(36000).en, '3 city buses');
  assert.equal(t(12000).en, '1 city bus');
  assert.equal(t(5200).en, '4 small cars');
  assert.equal(t(300).en, '1 small car');
  assert.equal(t(36000).hr, '3 gradskih autobusa');
});

test('stats count each Zagreb day once across workouts and visits, and only this year', () => {
  const ctx = context();
  const workouts = [{ id: 'a', performed_on: '2026-03-02' }, { id: 'b', performed_on: '2026-03-04' }, { id: 'old', performed_on: '2025-12-30' }];
  const sets = [
    { workout_id: 'a', exercise_id: 'sq', load_kg: 100, reps: 5 }, { workout_id: 'a', exercise_id: 'sq', load_kg: 110, reps: 3 },
    { workout_id: 'b', exercise_id: 'dl', load_kg: 180, reps: 2 }, { workout_id: 'b', exercise_id: 'dl', load_kg: 0, reps: 5 },
    { workout_id: 'old', exercise_id: 'dl', load_kg: 999, reps: 1 },
  ];
  const checkins = [
    { checked_in_at: '2026-03-02T06:10:00Z' },   // same day as workout a (07:10 Zagreb)
    { checked_in_at: '2026-03-06T06:30:00Z' },   // 07:30
    { checked_in_at: '2025-12-31T23:30:00Z' },   // already 1 Jan 2026 in Zagreb (00:30)
    { checked_in_at: '2025-12-31T10:00:00Z' },   // 2025
  ];
  const s = ctx.wrappedStats(2026, workouts, sets, checkins, EX);
  assert.equal(s.days, 4);                         // 1 Jan, 2 Mar, 4 Mar, 6 Mar
  assert.equal(s.firstDay, '2026-01-01');
  assert.equal(s.volumeKg, 100 * 5 + 110 * 3 + 180 * 2);
  assert.equal(s.sets, 3, 'empty and other-year sets ignored');
  assert.equal(s.heaviest.load, 180); assert.equal(s.heaviest.ex.id, 'dl');
  assert.equal(s.topExercise.ex.id, 'sq'); assert.equal(s.topExercise.sets, 2);
  assert.equal(s.favHour, 7);
  assert.equal(s.busiestMonth, 3);
});

test('no training gives empty stats without crashing', () => {
  const s = context().wrappedStats(2026, [], [], [], EX);
  assert.equal(s.days, 0); assert.equal(s.heaviest, null); assert.equal(s.topExercise, null); assert.equal(s.favHour, null);
});

test('tiles skip what the member has no data for', () => {
  const ctx = context();
  const onlyVisits = ctx.wrappedStats(2026, [], [], [{ checked_in_at: '2026-05-05T15:00:00Z' }], EX);
  const labels = Array.from(ctx.wrappedTiles(onlyVisits), (t) => t[0]);
  assert.deepEqual(labels, ['days trained', 'favourite time', 'strongest month']);
});
