const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('js/trip.js', 'utf8');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function context() {
  const store = new Map();
  const ctx = vm.createContext({
    L: (hr, en) => en, LANG: 'en', esc, t: s => s, fmtDate: d => String(d).slice(0, 10),
    state: { session: { user: { id: 'u1' } } },
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    Intl, Date, JSON, Math, Object, Array, String, Number, Set,
  });
  vm.runInContext(source, ctx);
  Object.assign(ctx, vm.runInContext('({ REVIEW_URL_RE, RETURN_CODE_RE, zagrebDay })', ctx));
  return ctx;
}
const NOW = new Date('2026-09-29T10:00:00Z');
const URL_OK = 'https://g.page/r/CSaiyan/review';

test('training days follow Zagreb dates and count each day once', () => {
  const ctx = context();
  // 23:30 UTC on the 27th is already the 28th in Zagreb
  const days = ctx.passportDays([{ checked_in_at: '2026-09-27T23:30:00Z' }, { checked_in_at: '2026-09-28T17:00:00Z' }, { checked_in_at: '2026-09-20T08:00:00Z' }]);
  assert.deepEqual(Array.from(days), ['2026-09-20', '2026-09-28']);
  assert.equal(ctx.passportDays([]).length, 0);
});

test('review link must be Google\'s own', () => {
  const { REVIEW_URL_RE: re } = context();
  for (const ok of [URL_OK, 'https://search.google.com/local/writereview?placeid=ChIJ', 'https://maps.app.goo.gl/Ab12', 'https://www.google.com/maps/place/x', 'https://google.hr/maps'])
    assert.ok(re.test(ok), ok);
  for (const bad of ['https://www.google.com.evil.example/x', 'https://g.page.evil.example/x', 'http://g.page/r/x', 'javascript:alert(1)', 'https://g.page/r/x"onclick', 'https://evil.example/'])
    assert.ok(!re.test(bad), bad);
});

test('review prompt: only after a finished visit, never without a link, snoozed 30 days, gone once used', () => {
  const ctx = context();
  const finished = [{ checked_in_at: '2026-09-28T08:00:00Z', checked_out_at: '2026-09-28T09:10:00Z' }];
  const justIn = [{ checked_in_at: '2026-09-29T09:30:00Z', checked_out_at: null }];
  assert.equal(ctx.reviewDue(URL_OK, finished, {}, NOW), true);
  assert.equal(ctx.reviewDue(URL_OK, justIn, {}, NOW), false);
  assert.equal(ctx.reviewDue(URL_OK, [{ checked_in_at: '2026-09-29T08:30:00Z' }], {}, NOW), true);   // in for 90 min
  assert.equal(ctx.reviewDue(URL_OK, [], {}, NOW), false);
  assert.equal(ctx.reviewDue('', finished, {}, NOW), false);
  assert.equal(ctx.reviewDue('https://evil.example/x', finished, {}, NOW), false);
  assert.equal(ctx.reviewDue(URL_OK, finished, { snoozedAt: '2026-09-10T10:00:00Z' }, NOW), false);
  assert.equal(ctx.reviewDue(URL_OK, finished, { snoozedAt: '2026-08-20T10:00:00Z' }, NOW), true);
  assert.equal(ctx.reviewDue(URL_OK, finished, { done: true }, NOW), false);
});

test('review card is neutral: no offer, no stars, no reward', () => {
  const ctx = context();
  const html = ctx.reviewHtml(URL_OK);
  assert.match(html, /href="https:\/\/g\.page\/r\/CSaiyan\/review"/);
  assert.match(html, /rel="noopener"/);
  assert.ok(!/offer|off |discount|%|★|5 star|happy|enjoy/i.test(html), html);
});

test('passport shows stamps and the return code only when there is an offer', () => {
  const ctx = context();
  assert.equal(ctx.passportHtml([], 'x', null), '');
  const days = Array.from({ length: 15 }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`);
  const html = ctx.passportHtml(days, '', null);
  assert.equal((html.match(/class="stamp"/g) || []).length, 12);
  assert.match(html, /<b>15<\/b>/); assert.match(html, /count-badge">15</);
  assert.ok(!/trip-code/.test(html));
  const withCode = ctx.passportHtml(days, '10% off <b>', { code: 'BACK-1A2B3C', redeemed_at: null });
  assert.match(withCode, /BACK-1A2B3C/); assert.match(withCode, /10% off &lt;b&gt;/);
  assert.match(ctx.passportHtml(days, 'x', { code: 'BACK-1A2B3C', redeemed_at: '2026-09-28T10:00:00Z' }), /Used on 2026-09-28/);
});

test('return code format and desk card only with an offer', () => {
  const ctx = context();
  assert.ok(ctx.RETURN_CODE_RE.test('BACK-1A2B3C'));
  assert.ok(!ctx.RETURN_CODE_RE.test('BACK-1a2b3c') && !ctx.RETURN_CODE_RE.test('BACK-1A2B3') && !ctx.RETURN_CODE_RE.test('x BACK-1A2B3C'));
  assert.equal(ctx.returnDeskHtml({ return_offer: null }), '');
  assert.equal(ctx.returnDeskHtml({ return_offer: '  ' }), '');
  assert.match(ctx.returnDeskHtml({ return_offer: 'Free towel' }), /Offer: Free towel/);
});
