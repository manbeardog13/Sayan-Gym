// Saiyan Gym FITT — delete an account (Edge Function "delete-account", verify_jwt = true)
// A member deletes their own account, or an admin deletes a member's account on request
// (GDPR Art. 17). Deleting the auth user cascades to profile, memberships, visits, workouts,
// measurements, consents and everything else keyed to the user.
// Admin accounts are never deleted here, so the gym can't lose its admin by accident.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ORIGINS = (Deno.env.get("APP_ORIGINS") ?? "https://manbeardog13.github.io,http://localhost:8765").split(",");
const corsFor = (origin: string | null) => ({
  ...(origin && ORIGINS.includes(origin) ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
});

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const cors = corsFor(origin);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (origin && !ORIGINS.includes(origin)) return json({ error: "origin" }, 403);

  try {
    const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: u } = await svc.auth.getUser(jwt);
    const caller = u?.user?.id;
    if (!caller) return json({ error: "auth" }, 401);

    const body = await req.json().catch(() => ({}));
    if (body?.confirm !== "DELETE") return json({ error: "confirm" }, 400);
    const target = typeof body?.user_id === "string" && body.user_id ? body.user_id : caller;

    const { data: rows } = await svc.from("profiles").select("id, role").in("id", [...new Set([caller, target])]);
    const roleOf = (id: string) => (rows ?? []).find((r: { id: string }) => r.id === id)?.role;
    if (target !== caller && roleOf(caller) !== "admin") return json({ error: "admin only" }, 403);
    if (!roleOf(target)) return json({ error: "not_found" }, 404);
    if (roleOf(target) === "admin") return json({ error: "admin_account" }, 409);

    const { error } = await svc.auth.admin.deleteUser(target);
    if (error) throw error;
    console.log("account deleted", target === caller ? "self" : "by admin");
    return json({ ok: true });
  } catch (e) {
    console.error("delete-account", e);
    return json({ error: "unavailable" }, 500);
  }
});
