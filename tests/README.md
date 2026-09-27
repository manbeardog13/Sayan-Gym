# Member interface checks

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
