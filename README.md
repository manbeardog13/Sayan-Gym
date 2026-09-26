# Saiyan Gym FITT — member platform

Web app and member portal for **Saiyan Gym FITT**, Ćira Carića 1, Dubrovnik.
Built on the same architecture as ASC: a static, no-build PWA on GitHub Pages with Supabase behind it.

## What it does

**Public site** (Croatian and English)
- Live occupancy ("In the gym right now") from real check-ins.
- Prices read from the database. Unconfirmed prices show "On request".
- "Ask the gym": answers questions from the gym's verified facts using semantic search, in both languages.
- Equipment, coach, hours, map, WhatsApp buttons.

**Members** (Google sign-in or email link)
- **Power Level:** level and tier (Spark → Surge → Overdrive → Ascended → Limitless) from lifted volume, sessions, personal records and weekly streaks.
- **Today's plan:** picks the most-recovered muscle groups and builds a session for the member's goal and experience.
- **Progressive overload coach:** next weight × reps for every exercise, within the goal's rep range. Holds when the last set was RPE 9.5+.
- **Muscle recovery** bars, **e1RM progress chart**, **QR pass** for the front desk.
- **Privacy:** health data (weight, body fat) is stored only after explicit GDPR Art. 9 consent, and becomes inaccessible when consent is withdrawn. Members can delete their own training data.

**Admin** (Settings tab)
- Edit prices and packages, add a payment link, upload gym photos, edit "Ask the gym" answers and motivational lines. All optional; placeholders show until filled in.
- First account can claim admin in one tap from Profile.

**Staff** (role `coach` or `admin`)
- Check-in by pass code or QR scan, who is inside now, check-out.
- **Churn radar:** members at risk of leaving (absence, falling visits, expiring pass, first 90 days), so Zrinko can send a personal message.

**Ideas** (admin)
- Zrinko shapes an idea with a Gemini-powered interviewer; the finished brief goes to Nero,
  who builds the platform. Text and style changes ship on their own; bigger changes wait for Toni. See IDEAS_PIPELINE.md.

The app opens on the sign-in screen; the public site is at `#/site`. Pinch and double-tap zoom are disabled.

## How the "AI" works

All intelligence runs inside Supabase. There are no third-party AI API keys and no pay-per-use calls.
- Coaching, Power Level, recovery and churn scoring are SQL functions in the database (`supabase/schema.sql`).
- "Ask the gym" uses Supabase's built-in `gte-small` embedding model and pgvector (`supabase/functions/concierge`).

The one generative piece is the admin-only idea agent (Gemini free tier, `GEMINI_API_KEY` secret); members never talk to it.
A generative chat coach for members would need an LLM provider API key. The `ai_messages` table is ready if the client later chooses that.

## Files

```
index.html            app shell (ASC chrome: canvas, glass shell, pill nav, sidebar)
css/asc.css           ASC v6 "Hanssen" design system, verbatim, re-tinted Lava -> Ki Gold
css/saiyan.css        Saiyan layer: forms, rows, logger, pass dialog, review fixes
assets/*.webp         placeholder photos (see CREDITS.md; replace with the gym's own)
js/config.js          Supabase URL + public anon key (safe to publish; RLS protects all data)
js/i18n.js            Croatian / English strings
js/app.js             router and every screen
service-worker.js     offline app shell
supabase/schema.sql   full database schema (reference; already applied)
supabase/seed.sql     prices, exercises, gym facts, motivation lines (already loaded)
supabase/functions/concierge/index.ts   "Ask the gym" edge function (already deployed)
SETUP.md              go-live steps
```

## Branding note

No Dragon Ball characters or imagery are used. Those are Toei/Shueisha IP. The UI uses the ASC design system and licensed placeholder photos (CREDITS.md).
Before investing further in the "Saiyan" name, run a trademark clearance search (EUIPO / DZIV, classes 41, 25, 32).

## "Ask the gym" — how answers are chosen

Each fact in Settings has an answer (HR + EN) and example questions. A question is embedded with Supabase's
built-in `gte-small` model and compared with every fact. An answer is given only when a fact is semantically
close (≥ 0.76) **and** shares at least one meaningful word stem with the question; among the top three, the one
sharing the most stems wins. Anything else gets the WhatsApp fallback. Calibrated on 24 in-scope and 8 off-topic
questions (24/24 correct; 7/8 off-topic fall back, "Do you sell cars?" gets the shop answer).
To improve a missed question, add its wording to that fact's example questions.
