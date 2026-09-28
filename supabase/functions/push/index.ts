// Saiyan Gym FITT — push notifications (Edge Function "push", verify_jwt = true)
// Opt-in, at most one notification a day per device, €0: plain Web Push to the browser's
// own push service with VAPID keys made here on first use (stored in public.push_config,
// service role only).
//   {action:"key"}    signed-in member → the public VAPID key for subscribing
//   {action:"hello"}  signed-in member → one confirmation to a device saved in the last 5 minutes
//   {action:"tick"}   the scheduler (x-push-key from Vault) → news from Zrinko, or "quiet now"
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { makeVapidKeys, sendPush, type VapidKeys } from "./webpush.ts";

const ORIGINS = (Deno.env.get("APP_ORIGINS") ?? "https://manbeardog13.github.io,http://localhost:8765").split(",");
const corsFor = (origin: string | null) => ({
  ...(origin && ORIGINS.includes(origin) ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
});
const SUBJECT = "https://manbeardog13.github.io/Sayan-Gym/";
const QUIET_MAX = Number(Deno.env.get("PUSH_QUIET_MAX") ?? "3");
// Same allowlist as public.push_endpoint_ok: never send anywhere but a browser push service.
const PUSH_HOST = /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.push\.apple\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)\//;

const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function vapid(): Promise<VapidKeys> {
  const { data } = await svc.from("push_config").select("vapid_public, vapid_private_jwk").eq("id", 1).single();
  if (data?.vapid_public) return { publicKey: data.vapid_public, privateJwk: data.vapid_private_jwk };
  const k = await makeVapidKeys();
  // Only the first writer wins, so two cold starts can't hand out different keys.
  await svc.from("push_config").update({ vapid_public: k.publicKey, vapid_private_jwk: k.privateJwk, updated_at: new Date().toISOString() })
    .eq("id", 1).is("vapid_public", null);
  const { data: again } = await svc.from("push_config").select("vapid_public, vapid_private_jwk").eq("id", 1).single();
  return { publicKey: again!.vapid_public, privateJwk: again!.vapid_private_jwk };
}

const zagreb = () => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zagreb", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short" }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), dow: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(p.weekday) + 1 };
};

type Row = { id: number; user_id: string; endpoint: string; p256dh: string; auth: string };

// Claims today's one notification for each device first, then sends; gone devices are removed.
async function deliver(db: SupabaseClient, ids: number[], today: string, msg: (locale: string) => unknown, ttl: number) {
  if (!ids.length) return 0;
  const { data: claimed } = await db.from("push_subscriptions").update({ last_sent_on: today })
    .in("id", ids).or(`last_sent_on.is.null,last_sent_on.lt.${today}`).select("id, user_id, endpoint, p256dh, auth");
  const rows = (claimed ?? []) as Row[];
  if (!rows.length) return 0;
  const { data: prof } = await db.from("profiles").select("id, locale").in("id", [...new Set(rows.map((r) => r.user_id))]);
  const locale = Object.fromEntries((prof ?? []).map((p: { id: string; locale: string }) => [p.id, p.locale]));
  const keys = await vapid();
  let sent = 0;
  for (let i = 0; i < rows.length; i += 10) {
    await Promise.all(rows.slice(i, i + 10).map(async (r) => {
      if (!PUSH_HOST.test(r.endpoint)) return;
      const status = await sendPush(r, msg(locale[r.user_id] ?? "hr"), keys, SUBJECT, ttl).catch(() => 0);
      if (status === 404 || status === 410) await db.from("push_subscriptions").delete().eq("id", r.id);
      else if (status >= 200 && status < 300) sent++;
    }));
  }
  return sent;
}

async function tick() {
  await vapid();   // keys exist before the first member subscribes
  const now = zagreb();
  const out: Record<string, number> = { news: 0, quiet: 0 };

  // 1. News: the newest members post published since the last run.
  const { data: cfg } = await svc.from("push_config").select("last_news_at").eq("id", 1).single();
  const { data: post } = await svc.from("posts").select("title, published_at").eq("status", "published").contains("channels", ["members"])
    .gt("published_at", cfg?.last_news_at ?? new Date().toISOString()).order("published_at", { ascending: false }).limit(1).maybeSingle();
  if (post) {
    await svc.from("push_config").update({ last_news_at: post.published_at }).eq("id", 1);
    if (now.hour >= 8 && now.hour < 21) {
      const { data: subs } = await svc.from("push_subscriptions").select("id").contains("topics", ["news"]);
      out.news = await deliver(svc, (subs ?? []).map((s: { id: number }) => s.id), now.day, (l) => ({
        title: l === "en" ? "News from Zrinko" : "Zrinkove novosti",
        body: post.title || (l === "en" ? "New post in the app." : "Nova objava u aplikaciji."),
        url: "#/app", tag: "news",
      }), 6 * 3600);
    }
  }

  // 2. Quiet now: only when this hour is normally medium or busy, the gym is nearly empty,
  //    and it's close to the hour the member usually comes in.
  if (now.hour >= 7 && now.hour < 20) {
    const { data: best } = await svc.rpc("best_times");
    const slot = (best ?? []).find((b: { dow: number; hour: number }) => b.dow === now.dow && b.hour === now.hour);
    const { data: occ } = await svc.rpc("current_occupancy");
    if (slot && slot.level >= 1 && typeof occ === "number" && occ <= QUIET_MAX) {
      const { data: who } = await svc.rpc("push_quiet_targets", { p_hour: now.hour });
      const users = (who ?? []).map((w: { user_id: string }) => w.user_id);
      if (users.length) {
        const { data: subs } = await svc.from("push_subscriptions").select("id").contains("topics", ["quiet"]).in("user_id", users);
        out.quiet = await deliver(svc, (subs ?? []).map((s: { id: number }) => s.id), now.day, (l) => ({
          title: l === "en" ? "Quiet at the gym" : "Tiho je u teretani",
          body: l === "en" ? `Only ${occ} in right now — the platforms are free.` : `Sada samo ${occ} unutra — platforme su slobodne.`,
          url: "#/app", tag: "quiet",
        }), 1800);
      }
    }
  }
  return out;
}

function sameKey(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const cors = corsFor(origin);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (origin && !ORIGINS.includes(origin)) return json({ error: "origin" }, 403);

  try {
    const body = await req.json().catch(() => ({}));
    const pushKey = req.headers.get("x-push-key");
    if (pushKey !== null) {
      const { data: key } = await svc.rpc("push_cron_key");
      if (!sameKey(pushKey, String(key ?? ""))) return json({ error: "auth" }, 401);
      if (body?.action !== "tick") return json({ error: "action" }, 400);
      return json({ ok: true, ...(await tick()) });
    }

    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: u } = await svc.auth.getUser(jwt);
    const uid = u?.user?.id;
    if (!uid) return json({ error: "auth" }, 401);

    if (body?.action === "key") return json({ key: (await vapid()).publicKey });
    if (body?.action === "hello") {
      const since = new Date(Date.now() - 5 * 60_000).toISOString();
      const { data: subs } = await svc.from("push_subscriptions").select("id").eq("user_id", uid)
        .eq("endpoint", String(body.endpoint ?? "")).gt("created_at", since);
      const sent = await deliver(svc, (subs ?? []).map((s: { id: number }) => s.id), zagreb().day, (l) => ({
        title: "Saiyan Gym FITT",
        body: l === "en" ? "Notifications are on. At most one a day." : "Obavijesti su uključene. Najviše jedna dnevno.",
        url: "#/profile", tag: "hello",
      }), 600);
      return json({ ok: true, sent });
    }
    return json({ error: "action" }, 400);
  } catch (e) {
    console.error("push", e);
    return json({ error: "unavailable" }, 500);
  }
});
