// Saiyan Gym FITT — AI concierge (deployed as Edge Function "concierge", verify_jwt = true)
// Semantic FAQ search using Supabase's built-in gte-small embedding model.
// Runs entirely inside Supabase: no third-party AI API key, no metered LLM calls.
// Public (anon key), so it is guarded: browser calls only from the gym's site, the question is
// validated before any work, callers are rate-limited, and errors never expose internals.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const model = new Supabase.ai.Session("gte-small");
const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const ORIGINS = (Deno.env.get("APP_ORIGINS") ?? "https://manbeardog13.github.io,http://localhost:8765").split(",");
const corsFor = (origin: string | null) => ({
  ...(origin && ORIGINS.includes(origin) ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
});

// Lexical gate: the semantic score alone cannot separate off-topic questions (gte-small scores
// overlap), so an answer also needs one meaningful word stem shared with the matched fact.
const STOP = new Set(("je li da se su za na u i a o ili ne koja koji koje što sto kako gdje kada kad imate ima imam mogu " +
  "možete mozete vi vas vam ti te tu to ovo the a an is are am do does did you your yours there can could i what whats where " +
  "when how much many it its of to in on for with have has my me we us our bring who get any some be at by from this that").split(" "));
const tokens = (t: string) => t.toLowerCase().replace(/[’']/g, "").split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3 && !STOP.has(w));
const stem = (w: string) => (w.length >= 5 ? w.slice(0, 4) : w.length === 4 ? w.slice(0, 3) : w);
function overlap(q: string, factText: string): number {
  const words = tokens(factText);
  return new Set(tokens(q).map(stem).filter((s) => words.some((f) => f.startsWith(s)))).size;
}

async function embed(text: string): Promise<number[]> {
  const out = await model.run(text, { mean_pool: true, normalize: true });
  return out as number[];
}

// A one-day hash of the caller's address: enough to rate-limit, not enough to track anyone.
async function callerKey(req: Request): Promise<string> {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const day = new Date().toISOString().slice(0, 10);
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${ip}|${day}|saiyan`));
  return [...new Uint8Array(buf)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Fact texts for the lexical gate, keyed by id, cached for a minute per instance.
let factCache: { at: number; text: Record<string, string> } | null = null;
async function factTexts(): Promise<Record<string, string>> {
  if (factCache && Date.now() - factCache.at < 60_000) return factCache.text;
  const { data, error } = await svc.from("gym_facts").select("id, questions, content_hr, content_en");
  if (error) throw error;
  const text = Object.fromEntries((data ?? []).map((f: any) => [f.id, `${f.questions ?? ""} ${f.content_hr} ${f.content_en}`]));
  factCache = { at: Date.now(), text };
  return text;
}

// Re-learn facts an admin just edited (embedding set to null), at most a few per call.
async function embedMissing() {
  const { data: missing } = await svc.from("gym_facts").select("id, questions, content_hr, content_en").is("embedding", null).limit(3);
  for (const f of missing ?? []) {
    const e = await embed(`${f.questions ?? ""} ${f.content_en} ${f.content_hr}`);
    const { error } = await svc.from("gym_facts").update({ embedding: JSON.stringify(e) }).eq("id", f.id);
    if (error) console.error("embed update", f.id, error.message);
  }
  if ((missing ?? []).length) factCache = null;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const cors = corsFor(origin);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (origin && !ORIGINS.includes(origin)) return json({ error: "origin" }, 403);

  // Validate before doing anything that costs.
  const body = await req.json().catch(() => null);
  const isHr = body?.lang === "hr";
  const q = typeof body?.question === "string" ? body.question.trim() : "";
  if (!q) return json({ answer: isHr ? "Postavi pitanje." : "Ask a question." });
  if (q.length > 500) return json({ error: "too_long" }, 400);

  try {
    const { data: allowed, error: rlErr } = await svc.rpc("concierge_allow", { p_key: await callerKey(req) });
    if (rlErr) throw rlErr;
    if (!allowed) {
      return json({ error: "rate_limited", answer: isHr ? "Previše pitanja odjednom — pokušaj za minutu." : "Too many questions at once — try again in a minute." }, 429);
    }

    await embedMissing();
    const { data: matches, error } = await svc.rpc("match_gym_facts", { query_embedding: JSON.stringify(await embed(q)), match_count: 3 });
    if (error) throw error;

    const fallback = isHr
      ? "Nisam siguran u odgovor. Javi se Zrinku na WhatsApp +385 91 602 2843 ili na Instagram @saiyan_gym_fitt."
      : "I'm not sure about that one. Message Zrinko on WhatsApp +385 91 602 2843 or Instagram @saiyan_gym_fitt.";

    // Semantic floor + lexical gate; among the top-3 that pass, the most shared word stems wins
    // (ties go to the higher semantic score).
    const THRESHOLD = Number(Deno.env.get("CONCIERGE_THRESHOLD") ?? "0.76");
    const text = await factTexts();
    const hit = ((matches ?? []) as any[])
      .map((m) => ({ ...m, ov: overlap(q, text[m.id] ?? "") }))
      .filter((m) => m.similarity >= THRESHOLD && m.ov > 0)
      .sort((a, b) => b.ov - a.ov || b.similarity - a.similarity)[0];
    return json({ answer: hit ? (isHr ? hit.content_hr : hit.content_en) : fallback });
  } catch (e) {
    console.error("concierge", e);
    return json({ error: "unavailable" }, 500);
  }
});
