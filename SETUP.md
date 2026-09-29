# Go-live setup

The backend is already live: Supabase project **saiyan-gym-fitt** (`oftgleobgcqdavnabfzr`, Frankfurt).
Schema, security rules, seed content and the concierge function are deployed and tested.
The steps below need your own logins, so they can't be automated from here.

## 1. Publish the site (GitHub Pages)

1. Copy all files from this folder into the `Sayan-Gym` repository (root) and push.
2. GitHub → repo **Settings → Pages** → Source: *Deploy from a branch* → `main` / `/ (root)`.
3. The site appears at `https://manbeardog13.github.io/Sayan-Gym/` (or your custom domain).

## 2. Google sign-in

**Google Cloud Console** (console.cloud.google.com)
1. Create or select a project → **APIs & Services → OAuth consent screen**: External, app name "Saiyan Gym FITT", support email, publish.
2. **Credentials → Create credentials → OAuth client ID** → type *Web application*.
   - Authorized JavaScript origins: `https://manbeardog13.github.io` (plus a custom domain if used)
   - Authorized redirect URI: `https://oftgleobgcqdavnabfzr.supabase.co/auth/v1/callback`
3. Copy the **Client ID** and **Client secret**.

**Supabase dashboard** → project *saiyan-gym-fitt*
4. **Authentication → Sign In / Providers → Google**: enable, paste the Client ID and secret, save.
5. **Authentication → URL Configuration**:
   - Site URL: `https://manbeardog13.github.io/Sayan-Gym/`
   - Redirect URLs: add the same URL (and `http://localhost:8765/` for local testing).

The client secret only goes into the Supabase dashboard. It never goes into this repository.

## 3. Become admin (one tap, no SQL)

Sign in on the live site, open **Profile**, and tap **Become admin**.
This works only while the gym has no admin, so do it before sharing the link.
A **Settings** tab then appears in the menu.

To make Zrinko admin (or desk staff coach): he signs in once, then you open **Settings → Team and roles**,
search his name and pick *Admin*. (Requires `supabase/ideas.sql`, which also fixes the role guard so this works.)

## 4. Fill in the details later (Settings tab)

Nothing below is required to launch. Everything shows sensible placeholders until filled in.

| What | Where in Settings | Until you fill it in |
|---|---|---|
| Monthly, multi-day, PT prices | Prices and packages | Shows "Na upit / On request" |
| New packages | Prices and packages → Add package | Hidden until "Show on site" is ticked |
| Payment link (Stripe, SumUp…) | Online payment | "Buy a day pass" opens WhatsApp |
| Gym photos | Gym photos | Gallery section stays hidden |
| "Ask the gym" answers | "Ask the gym" answers | Uses the verified facts from research |
| Motivational lines | Motivational lines | 10 lines in the gym's voice |
| Official gym Gmail and app password | Official gym email | Member email-link sign-in stays off |
| Gemini key | Official gym email | Studio stays "not switched on" |

Edited answers are re-learned automatically on the next question.

## 5. Give members passes

Admins give and renew passes on **Front desk → Members and passes** (see section 15).
The pass code appears as a QR on the member's dashboard; staff scan it on the Front desk screen.
**Settings** opens with a **Ready to launch?** checklist of what is still missing.

## 6. Still worth asking the client

- Logo files, so the palette can be matched to the real logo.
- Whether the old Iva Vojnovića 108 location still operates.
- Trademark clearance for "Saiyan" (EUIPO / DZIV) before more brand investment.


## 7. Ideas lab (Zrinko → Nero)

See [IDEAS_PIPELINE.md](IDEAS_PIPELINE.md): run `supabase/ideas.sql`, deploy `supabase/functions/idea-agent`,
add the free `GEMINI_API_KEY` secret, and add yourself to `app_owners`.

## 8. Studio: member news and Instagram

Run `supabase/ideas.sql` (includes the `studio_posts` part) and deploy `supabase/functions/social-publish` (verify_jwt on).
Posting to **members** works right away. **Share from phone** works without any setup: it opens the phone's
share sheet with the finished photos (choose Instagram) and copies the caption to paste.

To post **straight to Instagram** from the app (free, one-time setup, done by the account owner):
1. In the Instagram app: make @saiyan_gym_fitt a **Professional** account (Business or Creator).
2. developers.facebook.com → **Create app** → use case *Manage messaging & content on Instagram* →
   **API setup with Instagram login** → add the Instagram account and **Generate token**
   (needs the `instagram_business_content_publish` permission). Note the Instagram user ID it shows.
   While the app is in development mode this works for accounts that have a role on the app, which is all we need.
3. Supabase → SQL Editor (never paste the token into chat or the repo):
   ```sql
   insert into public.social_accounts(provider, account_id, username, access_token, expires_at)
   values ('instagram', 'IG_USER_ID', 'saiyan_gym_fitt', 'LONG_LIVED_TOKEN', now() + interval '60 days');
   ```
   The token is refreshed automatically whenever you publish with less than 10 days left. If nobody posts for
   60 days it expires; generate a new one the same way.

Meta changes these screens often; if a step looks different, follow Meta's current "Instagram API with
Instagram Login → Content publishing" guide. Instagram allows up to 100 API posts per day, JPEG only
(the Studio exports JPEG), 1–10 photos per post.

## 9. Wave 1 (engagement)

Run `supabase/wave1.sql` once. It replaces `my_power_level` (new XP formula: sessions and consistent weeks
count more than raw volume, plus comeback bonus and rest tokens), so existing members' levels will shift.
Adds `my_onboarding`, `greet_today`, `staff_touches` and `pr_bells`. Mention the staff greet list and the PR
bell in the privacy notice. See RESEARCH.md for the reasoning.

## 10. GDPR and staff permissions

`supabase/gdpr_staff_rls.sql` (applied): consents are append-only for members and withdrawn with
`withdraw_consent()`; withdrawing the health consent deletes body measurements; members can always
delete their own measurements; coaches can check people in and out but only admins manage memberships,
exercises, visits and other people's profiles. It also fixes the profile update policy (it failed with
"infinite recursion") and the role guard's admin check.

## 11. "Ask the gym" limits

`supabase/concierge_hardening.sql` (applied) and the `concierge` function (v7): only the gym's site may call it
from a browser (`APP_ORIGINS` secret overrides the list, comma-separated), questions are capped at 500
characters, each visitor gets 20 questions a minute and the whole site 600 an hour (keyed by a one-day hash of
the caller's address, never the address itself), and errors return a generic message.

## 12. Deleting data and accounts

`supabase/delete_my_data.sql` (applied) and the `delete-account` function: Profile → "Delete all my training data"
removes workouts, measurements, PR bells and assistant messages; "Delete my account" (member types DELETE/OBRIŠI)
deletes the account and, by cascade, profile, membership, visits, workouts, measurements and consents. Admins can
delete a member's account from Settings → Team and roles when the member asks at the desk. Admin accounts are never
deleted this way. Ask the accountant whether membership records must be kept for bookkeeping before deleting a
member who paid online.

## 13. Content security policy and script hashes

`index.html` and `privacy.html` carry a Content-Security-Policy `<meta>` tag (GitHub Pages can't send headers).
Scripts may only come from this site and cdn.jsdelivr.net, never inline; the three CDN scripts (supabase-js,
qrcode-generator, html5-qrcode) are pinned with `integrity` hashes. When you add an outside service (a new API,
image host or script), add its domain to the policy. When you upgrade a CDN script version, replace its hash:
`curl -s URL | openssl dgst -sha384 -binary | openssl base64 -A`. Styles still allow inline `style=""`.

## 14. Wave 2 (community)

`supabase/wave2.sql` (applied as migrations `wave2_community`, `wave2_best_times_levels`, `wave2_push_schedule`)
and the `push` function. Everything rewards showing up, never kilos or bodyweight.

- **Crew page** (`#/crew`): team season, monthly quests, the PR bell with Ki blast kudos (one tap, no comments),
  the 300/400/500 kg club and "best time to come".
- **Team seasons**: Settings → Seasons and quests. 6–8 weeks, 2–4 teams. Members join themselves and land in the
  smallest team. 10 points per training day (a desk check-in or a logged workout, up to 4 a week) plus 10 for a
  week with 2 or more; teams are ranked by the average per member, so team size doesn't decide the winner.
- **Monthly quests**: three standard quests (8 training days, 3 weeks with 2+ sessions, 60 logged sets) are added
  automatically in the first week of each month (job `monthly-quests`, migration `quests_auto`,
  `supabase/quests_auto.sql`). A quest you delete stays deleted; untick "Add the 3 standard quests every month"
  in Settings → Seasons and quests to stop it, or tap "Add the standard quests to this month" to get them now.
  Add your own with Add quest (training days, desk check-ins, weeks with 2+ sessions, or logged sets, optionally
  for one exercise).
- **300/400/500 kg club**: Front desk → club card. Staff record squat, bench and deadlift they watched; the database
  stamps who verified it and when. Names and totals show only for members who switch on "Show my first name on the
  boards and the gym screen" (Profile or Crew); everyone else counts as "+1".
- **Gym TV** (`#/tv`): sign in as staff on the TV browser and open Front desk → Gym TV screen. It refreshes every
  minute and keeps the screen awake.
- **Best time to come**: hourly quiet / medium / busy from the last 8 weeks of desk check-ins. Nothing shows until
  there are 30 visits, and hours with fewer than 5 are hidden. It fills in as the desk scans passes.
- **Push notifications** (Profile → Notifications): opt-in, at most one a day per device, €0 (Web Push straight to
  the browser's push service; the VAPID keys are made by the `push` function and kept in `push_config`, which only
  the server can read). Every 15 minutes `pg_cron` calls the function (job `push-tick`, authorised by the
  `push_cron_key` Vault secret). It sends "News from Zrinko" when a members post is published (08–21), or
  "Quiet at the gym" when an hour that is normally medium or busy has 3 or fewer people in and it's near the
  member's usual check-in hour. On iPhone this works only after "Add to Home Screen". `PUSH_QUIET_MAX` (secret)
  changes the 3.
- **Offline-safe logging**: sets typed in the logger are kept on the phone until saved (a reload brings them back),
  and a saved workout waits on the phone until the server has it. The phone makes the ids, so a retry can't create
  a duplicate. The app shell and the two pinned CDN scripts are cached, so the app opens with no signal.

## 15. Members and passes (Front desk)

Migration `desk_passes` (`supabase/passes.sql`) adds `give_pass`, `cancel_pass` and the
`membership_log` audit table. Nothing to configure.

- **Front desk → Members and passes**: type two letters of a name to see the member's pass.
  Coaches and admins can **Check in** a member who has a valid pass, without the QR code.
- **Admins only**: **Give pass** / **Renew** (plan, days, paid at the desk / Multisport / online)
  and **Cancel pass**. Renewing the plan the member already has adds the days to the end of
  their current pass, so their QR code keeps working. Add-ons (towel, PT) are not passes.
- A new pass runs to the end of the last day, Zagreb time (30 days given on 1 March ends at
  midnight after 30 March). Days must be 1–400.
- **Ending in the next 7 days** lists passes to renew. Every give, extend and cancel is kept in
  `membership_log` with the staff member, days and payment channel (admins can read it).

## 16. Trip passport, return code and Google reviews

Migration `wave3_trip` (`supabase/wave3.sql`) adds the `review_url` and `return_offer`
settings, the `return_codes` table and the `my_return_code` / `redeem_return_code` functions.

- **Settings → Google reviews and return visits**
  - **Google review link:** paste the link from your Google Business Profile ("Ask for
    reviews" gives a `g.page/r/…/review` link). Only Google's own addresses are accepted.
    Leave empty to hide the request.
  - **Return-visit offer (optional):** for example "10% off your next day pass". Leave empty
    and no codes are made.
- **Members:** the dashboard shows a **Gym passport** after their first check-in: one stamp
  per training day, and **Share card** (a picture made on the phone, name only if ticked).
  With an offer set, it also shows their personal code `BACK-XXXXXX`.
- **Google review request:** shown the same way to every member once a visit is finished
  (checked out or in for over an hour). "Not now" hides it for 30 days; opening the link
  hides it for good on that phone. Google forbids rewards for reviews and asking only
  happy customers, so the request never mentions the offer and nobody is filtered.
- **Front desk → Return code:** type the code. It says whose it is and uses it once; a used
  code says when it was used. Apply the offer at the till as usual.

## 17. Google and link previews

- **Front page:** visitors (and Google) land on the public gym page; signed-in members land on their
  dashboard; the installed app still opens on sign-in (`start_url` is `#/app`).
  The intro film (1.7 MB) plays only when sign-in is the first screen, so a visitor's first load is
  about 0.9 MB instead of 2.6 MB.
- **Link previews** (WhatsApp, Instagram, Facebook, X) use `assets/og.jpg`, a branded card with the
  address and opening hours and no photo (the placeholder photos don't show this gym). If the hours
  change, update the card, the hours in `index.html` (`openingHoursSpecification`) and the Hours card.
- **Google business details:** `index.html` carries schema.org `ExerciseGym` data (address, hours,
  phone, map, Instagram). The Google Business Profile itself is still the main source for Maps.
- **Sitemap:** `sitemap.xml`. Optional: add the site in Google Search Console and submit
  `https://manbeardog13.github.io/Sayan-Gym/sitemap.xml`. A `robots.txt` would only work at the domain
  root (`manbeardog13.github.io`), which this project site can't serve; none is needed to be indexed.

## 18. Access audit

`supabase/audit/access_audit.sql` checks who can read and change what. It is safe on the live
project: two throwaway users and their data exist only inside one transaction that ends with an
error, so nothing is kept. Paste it into the Supabase SQL editor and read the `RESULT` list.
**Run it after every migration** that adds a table or a `security definer` function; a new
function it doesn't know shows up as `NOT COVERED`.

Result on 29 Sep 2026 (all 33 tables and 33 member-callable functions): no findings.
- A signed-in member sees none of another member's workouts, sets, body metrics, consents,
  visits, passes, profile, devices, return code, season or club entry, and can't write any of them.
- A member can't make themselves admin (trigger `guard_role_change`), give themselves a pass, check
  themselves in, edit settings, upload photos, or ring a PR bell or give kudos as someone else
  (triggers fill in the signed-in member; the same goes for consents).
- A visitor who isn't signed in reads nothing private; members' posts and the PR bell need sign-in.
- Every staff- or admin-only function refuses a member. The rest return only the caller's own data
  or anonymous totals (best times, occupancy, club board, standings).
- All six Edge Functions check the caller: gym-wire, idea-agent and social-publish are admin only;
  delete-account is self (or an admin for a member); push needs a member or the scheduler's key;
  concierge is origin-checked and rate-limited. All are deployed with `verify_jwt`.
- Storage: the `gallery` and `posts` buckets are public to read (they're shown on the site), and
  only admins can upload or delete.

Known and accepted:
- The Supabase advisor warns about signed-in users calling `security definer` functions. Each one
  checks the caller itself (see above).
- "Leaked password protection" is off. The app has no passwords (Google and email links only), so
  it has nothing to check.
- An admin can't remove another member's PR bell. A bell has no free text and disappears after 14
  days; ask if you want a remove button for staff.
