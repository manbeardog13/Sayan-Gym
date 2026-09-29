// Guards for the static app shell: every page script is on disk, parses, and is in the
// service worker's offline cache; CDN scripts are pinned and carry an integrity hash.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync('index.html', 'utf8');
const sw = fs.readFileSync('service-worker.js', 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g)].map((m) => ({ src: m[1], tag: m[0] }));
const local = scripts.filter((s) => !/^https?:/.test(s.src)).map((s) => s.src);
const shell = JSON.parse(sw.match(/const SHELL = (\[[^\]]*\]);/)[1]);
const cdnPrefixes = JSON.parse(sw.match(/const CDN = (\[[^\]]*\]);/)[1]);

test('every local page script exists and parses', () => {
  assert.ok(local.length >= 5, 'found the page scripts');
  for (const f of [...local, 'service-worker.js']) {
    assert.ok(fs.existsSync(f), `${f} exists`);
    assert.doesNotThrow(() => new vm.Script(fs.readFileSync(f, 'utf8'), { filename: f }), `${f} parses`);
  }
});

test('every js file in js/ is loaded by the page', () => {
  for (const f of fs.readdirSync('js').filter((n) => n.endsWith('.js')))
    assert.ok(local.includes(`js/${f}`), `js/${f} is in index.html`);
});

test('the offline cache holds every page script, and every cached file exists', () => {
  for (const f of local) assert.ok(shell.includes(f), `${f} is in the service worker SHELL`);
  for (const f of shell.filter((x) => x !== './')) assert.ok(fs.existsSync(path.normalize(f)), `${f} exists`);
});

test('CDN scripts are pinned to a version and carry an integrity hash', () => {
  const cdn = scripts.filter((s) => /^https?:/.test(s.src));
  assert.ok(cdn.length > 0);
  for (const s of cdn) {
    assert.match(s.src, /@\d+\.\d+\.\d+\//, `${s.src} is pinned`);
    assert.match(s.tag, /integrity="sha(256|384|512)-[A-Za-z0-9+/=]+"/, `${s.src} has SRI`);
    assert.match(s.tag, /crossorigin="anonymous"/, `${s.src} is fetched anonymously`);
    assert.ok(cdnPrefixes.some((p) => s.src.startsWith(p)), `${s.src} is cached for offline use by the service worker`);
  }
});

test('link previews and Google business details are complete and point at real files', () => {
  const meta = (p) => (html.match(new RegExp(`<meta property="${p}" content="([^"]*)"`)) || [])[1];
  const base = (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
  assert.equal(base, 'https://manbeardog13.github.io/Sayan-Gym/');
  for (const p of ['og:title', 'og:description', 'og:url', 'og:image']) assert.ok(meta(p), `${p} is set`);
  assert.ok(meta('og:image').startsWith(base), 'og:image is absolute on this site');
  assert.ok(fs.existsSync(meta('og:image').slice(base.length)), 'og:image file exists');
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(ld['@type'], 'ExerciseGym');
  assert.equal(ld.address.streetAddress, 'Ćira Carića 1');
  assert.deepEqual(ld.openingHoursSpecification.map((o) => `${o.opens}-${o.closes}`), ['06:00-22:00', '06:00-20:00']);
  assert.ok(ld.image.startsWith(base) && fs.existsSync(ld.image.slice(base.length)));
  const cfg = fs.readFileSync('js/config.js', 'utf8');
  assert.ok(cfg.includes(`phone: "${ld.telephone}"`), 'telephone matches js/config.js');
  const sitemap = fs.readFileSync('sitemap.xml', 'utf8');
  assert.ok(sitemap.includes(`<loc>${base}</loc>`));
  for (const loc of [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].slice(base.length)).filter(Boolean)) assert.ok(fs.existsSync(loc), `${loc} exists`);
});
