# Tests

Run everything from the repository root (Node 20+, no install step):

```sh
node --test tests/*.test.cjs
```

Browser tests drive the real app in headless Chromium against a fake Supabase client
(`tests/e2e/mock-supabase.js`, fictional people only); every outside request is blocked:

```sh
npm ci && npx playwright install chromium   # once
npm run test:browser
```

They cover the Front desk (passes, return codes), the member dashboard (passport, review
request), Settings (launch checklist, review link), the workout logger and the content
security policy on every route, plus an axe-core accessibility audit (WCAG 2.1 A/AA and best
practice) of every screen in light and dark, including opened forms. `offline.e2e.cjs` runs the real service worker: after one visit the
logger opens with no signal, the pinned CDN scripts come from the cache, and a set saved offline
waits on the phone and is sent when the connection returns. GitHub Actions runs both suites on every pull request and
on `main` (`.github/workflows/tests.yml`). `shell.test.cjs` guards the static shell: every page
script exists, parses and is in the service worker's offline cache, and CDN scripts are
version-pinned with an integrity hash.

## Member interface checks

Run from the repository root with Node:

```sh
node --test tests/member-ui.test.cjs
```

The 21 deterministic tests cover published plan and member-post selection, escaping,
guest/member/coach/admin navigation, continuous wrapping, bidirectional dragging,
nonlinear coasting and immediate loop resume at rest, vertical gesture click
suppression, cancellation, keyboard-focus hold (the strip has no pause button), reduced motion (including during coasting),
cleanup, popstate-only back transitions, the same-video splash handoff and still
restoration, and video range-request cache handling.

Browser review for this pass used Chrome at desktop and 390px phone width: public
offers, phone dock and desktop rail, menu language/theme, both horizontal drag
directions, vertical drag without opening a card, tap/detail/close, browser back,
login and the retained paused video frame. At 390 CSS pixels the header starts at
the app surface with zero body/shell top padding. The public strip showed the four original training photos
plus five published plans. Member posts retain the existing members-only access
boundary; they are not exposed to signed-out visitors.

Role and member-post tests use fixtures. No authenticated member/staff session,
physical iPhone, microphone recording, Gmail connection, or external message was
used for this review. Studio's talk/history/archive/restore logic and the Gmail
wiring remain unchanged. Its preview avatar now uses the existing spike icon.

The four WebP photos, power-up MP4 and icon SVG were verified byte-for-byte
against the starting commit. No generated image assets were added.
