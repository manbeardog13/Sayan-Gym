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

Edited answers are re-learned automatically on the next question.

## 5. Give members passes

Staff create passes in Supabase → Table Editor → `memberships` (pick user, plan, `ends_at`).
The pass code appears as a QR on the member's dashboard; staff scan it on the Front desk screen.

## 6. Still worth asking the client

- Logo files, so the palette can be matched to the real logo.
- Whether the old Iva Vojnovića 108 location still operates.
- Trademark clearance for "Saiyan" (EUIPO / DZIV) before more brand investment.


## 7. Ideas lab (Zrinko → Claude)

See [IDEAS_PIPELINE.md](IDEAS_PIPELINE.md): run `supabase/ideas.sql`, deploy `supabase/functions/idea-agent`,
add the free `GEMINI_API_KEY` secret, and add yourself to `app_owners`.
