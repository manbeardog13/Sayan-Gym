const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

// coach.js runs in the browser; give it just enough of one to load its helpers.
const ctx = vm.createContext({ localStorage: { getItem: () => null, setItem() {} }, addEventListener() {}, document: { addEventListener() {}, getElementById: () => null }, JSON, Math, Number, String, parseFloat, parseInt, isNaN });
vm.runInContext(fs.readFileSync('js/coach.js', 'utf8'), ctx);
const { newSet, nextSet, tickSet, logRows } = vm.runInContext('({ newSet, nextSet, tickSet, logRows })', ctx);
const plain = (x) => JSON.parse(JSON.stringify(x));

test('suggestions are placeholders, never values', () => {
  const s = newSet(142.5, 5);
  assert.deepEqual(plain(s), { load: '', reps: '', rpe: '', sugLoad: '142.5', sugReps: '5' });
  assert.deepEqual(plain(newSet(undefined, null)), { load: '', reps: '', rpe: '', sugLoad: '', sugReps: '' });
});

test('untouched suggested sets are never saved', () => {
  const blocks = [{ exercise_id: 'squat', sets: [newSet(140, 5)] }, { exercise_id: 'bench', sets: [newSet(100, 6)] }];
  assert.equal(logRows(blocks).length, 0);
});

test('a tick means done as suggested and fills the suggestion in', () => {
  const s = newSet(140, 5);
  assert.equal(tickSet(s), true);
  assert.equal(s.done, true);
  assert.deepEqual(plain(logRows([{ exercise_id: 'squat', sets: [s] }])), [{ exercise_id: 'squat', set_no: 1, load_kg: 140, reps: 5, rpe: null }]);
});

test('typed numbers win over the suggestion, also when ticked', () => {
  const s = newSet(140, 5); s.load = '145'; s.reps = '3';
  tickSet(s);
  assert.deepEqual(plain(logRows([{ exercise_id: 'squat', sets: [s] }]))[0], { exercise_id: 'squat', set_no: 1, load_kg: 145, reps: 3, rpe: null });
});

test('a half-typed set is not saved until it is complete', () => {
  const s = newSet(140, 5); s.load = '150';
  assert.equal(logRows([{ exercise_id: 'squat', sets: [s] }]).length, 0);
  tickSet(s);   // the tick fills only the missing reps from the suggestion
  assert.equal(s.load, '150'); assert.equal(s.reps, '5');
});

test('nothing to tick without numbers or a suggestion', () => {
  const s = newSet();
  assert.equal(tickSet(s), false);
  assert.notEqual(s.done, true);
});

test('untick keeps the numbers; the set still counts as entered', () => {
  const s = newSet(100, 8); tickSet(s); tickSet(s);
  assert.equal(s.done, false);
  assert.equal(logRows([{ exercise_id: 'b', sets: [s] }]).length, 1);
});

test('only real sets are saved and numbered in order per exercise', () => {
  const a = newSet(140, 5), b = newSet(140, 5), c = newSet(140, 5);
  tickSet(a); c.load = '150'; c.reps = '3';   // b was never done
  const other = newSet(60, 10); tickSet(other);
  const rows = logRows([{ exercise_id: 'squat', sets: [a, b, c] }, { exercise_id: 'ohp', sets: [other] }]);
  assert.deepEqual(plain(rows.map((r) => `${r.exercise_id}#${r.set_no}:${r.load_kg}x${r.reps}`)), ['squat#1:140x5', 'squat#2:150x3', 'ohp#1:60x10']);
});

test('the next set suggests what was just done', () => {
  const s = newSet(140, 5); s.load = '145'; s.reps = '4';
  assert.deepEqual(plain(nextSet(s)), { load: '', reps: '', rpe: '', sugLoad: '145', sugReps: '4' });
  assert.deepEqual(plain(nextSet(newSet(140, 5))), { load: '', reps: '', rpe: '', sugLoad: '140', sugReps: '5' });
});

test('database limits still apply and RPE is optional', () => {
  const mk = (load, reps, rpe = '') => ({ load, reps, rpe });
  const rows = logRows([{ exercise_id: 'x', sets: [mk('700', '5'), mk('100', '0'), mk('100', '101'), mk('100', '5', '8.5'), mk('100', '5', '3')] }]);
  assert.deepEqual(plain(rows.map((r) => [r.load_kg, r.reps, r.rpe])), [[100, 5, 8.5], [100, 5, null]]);
});
