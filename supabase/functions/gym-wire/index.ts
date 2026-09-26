// Saiyan Gym FITT — owner wiring (Edge Function "gym-wire", verify_jwt = true)
// Zrinko enters the gym's official Gmail and an optional Gemini key in Settings.
// This function writes them into Supabase Auth SMTP and Edge Function secrets.
// The password and key are never stored in the app database and never returned.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ORIGIN = Deno.env.get("APP_ORIGIN") ?? "https://manbeardog13.github.io";
const REF = "oftgleobgcqdavnabfzr";
const cors = {
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function mgmt(path: string, init: RequestInit = {}) {
  const token = Deno.env.get("GYM_WIRE_TOKEN");
  if (!token) return null;
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body) headers.set("Content-Type", "application/json");
  return fetch(`https://api.supabase.com${path}`, { ...init, headers });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const svc = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: u } = await svc.auth.getUser(jwt);
    const uid = u?.user?.id;
    if (!uid) return json({ error: "auth" }, 401);
    const { data: prof } = await svc.from("profiles").select("role").eq("id", uid).single();
    if (prof?.role !== "admin") return json({ error: "admin" }, 403);
    if (!Deno.env.get("GYM_WIRE_TOKEN")) return json({ error: "not_configured" }, 503);

    const body = await req.json().catch(() => ({}));
    if (body.action === "status") {
      const auth = await mgmt(`/v1/projects/${REF}/config/auth`);
      if (!auth || !auth.ok) return json({ error: "status" }, 502);
      const cfg = await auth.json();
      const secretsRes = await mgmt(`/v1/projects/${REF}/secrets`);
      const list = secretsRes && secretsRes.ok ? await secretsRes.json() : [];
      const names = Array.isArray(list) ? list.map((s: { name?: string }) => s.name) : [];
      return json({
        wired: Boolean(cfg.smtp_host),
        email: cfg.smtp_admin_email || null,
        sender: cfg.smtp_sender_name || null,
        gemini: names.includes("GEMINI_API_KEY"),
      });
    }

    const email = String(body.email ?? "").trim().toLowerCase();
    const pass = String(body.app_password ?? "").replace(/\s+/g, "");
    const sender = String(body.sender_name ?? "Saiyan Gym FITT").trim().slice(0, 80) || "Saiyan Gym FITT";
    const gemini = String(body.gemini_key ?? "").trim();
    if (!email && !pass && !gemini) return json({ error: "empty" }, 400);

    if (email || pass) {
      if (!/^[^\s@]+@gmail\.com$/.test(email)) return json({ error: "gmail" }, 400);
      if (!/^[a-z]{16}$/.test(pass)) return json({ error: "app_password" }, 400);
      const saved = await mgmt(`/v1/projects/${REF}/config/auth`, {
        method: "PATCH",
        body: JSON.stringify({
          external_email_enabled: true,
          smtp_admin_email: email,
          smtp_host: "smtp.gmail.com",
          smtp_port: "465",
          smtp_user: email,
          smtp_pass: pass,
          smtp_sender_name: sender,
        }),
      });
      if (!saved || !saved.ok) {
        console.error("smtp", saved?.status);
        return json({ error: "smtp" }, 502);
      }
    }

    if (gemini) {
      if (gemini.length < 20 || gemini.length > 200) return json({ error: "gemini" }, 400);
      const saved = await mgmt(`/v1/projects/${REF}/secrets`, {
        method: "POST",
        body: JSON.stringify([{ name: "GEMINI_API_KEY", value: gemini }]),
      });
      if (!saved || !saved.ok) {
        console.error("gemini", saved?.status);
        return json({ error: "gemini_save" }, 502);
      }
    }

    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: "server" }, 500);
  }
});
