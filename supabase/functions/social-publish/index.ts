// Saiyan Gym FITT — publish a Studio post (Edge Function "social-publish", verify_jwt = true)
// Admin-only. Marks the post published for members and, when chosen, posts it to
// Instagram through the Instagram API with Instagram Login (Content Publishing).
// The Instagram token lives in public.social_accounts (no RLS policies: service role only)
// and is refreshed here when it has less than 10 days left.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ORIGIN = Deno.env.get("APP_ORIGIN") ?? "https://manbeardog13.github.io";
const cors = {
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const GRAPH = `https://graph.instagram.com/${Deno.env.get("IG_API_VERSION") ?? "v23.0"}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function ig(path: string, params: Record<string, string>, method = "POST") {
  const q = new URLSearchParams(params);
  const r = await fetch(method === "GET" ? `${GRAPH}/${path}?${q}` : `${GRAPH}/${path}`, {
    method, ...(method === "GET" ? {} : { body: q }),
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok || out.error) throw new Error(out?.error?.message ?? `instagram ${r.status}`);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let postId = "";
  try {
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: u } = await svc.auth.getUser(jwt);
    if (!u?.user) return json({ error: "auth" }, 401);
    const { data: prof } = await svc.from("profiles").select("role").eq("id", u.user.id).single();
    if (prof?.role !== "admin") return json({ error: "admin only" }, 403);

    const body = await req.json().catch(() => ({}));
    postId = String(body.post_id ?? "");
    const { data: post } = await svc.from("posts").select("*").eq("id", postId).single();
    if (!post) return json({ error: "post" }, 404);
    if (post.status === "publishing") return json({ error: "busy" }, 409);
    const toIg = post.channels.includes("instagram") && !post.ig_media_id;
    if (toIg && !post.images.length) return json({ error: "instagram_needs_image" }, 400);
    if (toIg && post.caption.length > 2200) return json({ error: "caption_long" }, 400);
    await svc.from("posts").update({ status: "publishing", error: null }).eq("id", postId);

    let igId: string | null = post.ig_media_id, link: string | null = post.ig_permalink;
    if (toIg) {
      const { data: acct } = await svc.from("social_accounts").select("*").eq("provider", "instagram").single();
      if (!acct) throw new Error("instagram_not_connected");
      let token = acct.access_token;
      if (new Date(acct.expires_at).getTime() - Date.now() < 10 * 86400000) {
        // refresh_access_token lives at the unversioned root
        const rr = await fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`)
          .then((x) => x.json()).catch(() => null);
        if (rr?.access_token) {
          token = rr.access_token;
          await svc.from("social_accounts").update({
            access_token: token, expires_at: new Date(Date.now() + (rr.expires_in ?? 5184000) * 1000).toISOString(), updated_at: new Date().toISOString(),
          }).eq("provider", "instagram");
        }
      }
      const pub = (p: string) => svc.storage.from("posts").getPublicUrl(p).data.publicUrl;
      const me = acct.account_id;
      let creation: string;
      if (post.images.length === 1) {
        creation = (await ig(`${me}/media`, { image_url: pub(post.images[0]), caption: post.caption, access_token: token })).id;
      } else {
        const children: string[] = [];
        for (const p of post.images) {
          children.push((await ig(`${me}/media`, { image_url: pub(p), is_carousel_item: "true", access_token: token })).id);
        }
        creation = (await ig(`${me}/media`, { media_type: "CAROUSEL", children: children.join(","), caption: post.caption, access_token: token })).id;
      }
      // wait until Instagram has fetched and processed the images (max ~50 s)
      for (let i = 0; i < 25; i++) {
        const st = await ig(creation, { fields: "status_code", access_token: token }, "GET");
        if (st.status_code === "FINISHED") break;
        if (st.status_code === "ERROR" || st.status_code === "EXPIRED") throw new Error("instagram rejected the media");
        await sleep(2000);
      }
      igId = (await ig(`${me}/media_publish`, { creation_id: creation, access_token: token })).id;
      link = (await ig(igId!, { fields: "permalink", access_token: token }, "GET").catch(() => ({}))).permalink ?? null;
    }

    await svc.from("posts").update({
      status: "published", ig_media_id: igId, ig_permalink: link, error: null,
      published_at: post.published_at ?? new Date().toISOString(),
    }).eq("id", postId);
    return json({ ok: true, permalink: link });
  } catch (e) {
    console.error(e);
    const msg = String((e as Error)?.message ?? e).slice(0, 300);
    if (postId) await svc.from("posts").update({ status: "failed", error: msg }).eq("id", postId);
    return json({ error: msg === "instagram_not_connected" ? msg : "publish_failed", detail: msg }, 502);
  }
});
