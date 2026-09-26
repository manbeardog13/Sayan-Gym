# Member interface checks

Run from the repository root with Node:

```sh
node --test tests/member-ui.test.cjs
```

The deterministic tests cover published plan and member-post selection, escaping,
guest/member/coach/admin navigation, continuous wrapping, bidirectional dragging,
resume on release or stopped movement, vertical-scroll gestures, cancellation,
pause, reduced motion, cleanup, and the same-video splash handoff.

Browser review for this pass used Chrome at desktop and 390px phone width: public
offers, dock sections, offer detail/close, login, the settled video frame, and
light/dark controls. The public strip showed the four original training photos
plus five published plans. Member posts retain the existing members-only access
boundary; they are not exposed to signed-out visitors.

Role and member-post tests use fixtures. No authenticated member/staff session,
physical iPhone, microphone recording, Gmail connection, or external message was
used for this review. Studio's talk/history/archive/restore logic and the Gmail
wiring remain unchanged. Its preview avatar now uses the existing spike icon.

The four WebP photos, power-up MP4 and icon SVG were verified byte-for-byte
against the starting commit. No generated image assets were added.
