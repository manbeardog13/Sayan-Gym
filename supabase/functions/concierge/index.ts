// Saiyan Gym FITT — AI concierge (deployed as Edge Function "concierge", verify_jwt = true)
// Semantic FAQ search using Supabase's built-in gte-small embedding model.
// Runs entirely inside Supabase: no third-party AI API key, no metered LLM calls.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const model = new Supabase.ai.Session("gte-small");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Lazily embed any new or edited fact (set embedding = null after editing a fact).
    const { data: missing } = await admin.from("gym_facts").select("id, questions, content_hr, content_en").is("embedding", null);
    for (const f of missing ?? []) {
      const e = await embed(`${f.questions ?? ""} ${f.content_en} ${f.content_hr}`);
      await admin.from("gym_facts").update({ embedding: JSON.stringify(e) }).eq("id", f.id);
    }

    const { question, lang } = await req.json();
    const q = String(question ?? "").slice(0, 500).trim();
    const isHr = lang === "hr";
    if (!q) {
      return new Response(JSON.stringify({ answer: isHr ? "Postavi pitanje." : "Ask a question." }),
        { headers: { ...cors, "Content-Type": "application/json" } });
    }

    const { data: matches, error } = await admin.rpc("match_gym_facts", {
      query_embedding: JSON.stringify(await embed(q)), match_count: 3,
    });
    if (error) throw error;

    const ranked = (matches ?? []) as any[];
    const top = ranked[0];
    const fallback = isHr
      ? "Nisam siguran u odgovor. Javi se Zrinku na WhatsApp +385 91 602 2843 ili na Instagram @saiyan_gym_fitt."
      : "I'm not sure about that one. Message Zrinko on WhatsApp +385 91 602 2843 or Instagram @saiyan_gym_fitt.";

    // Semantic floor + lexical gate; among the top-3 that pass, the most shared word stems wins
    // (ties go to the higher semantic score).
    const THRESHOLD = Number(Deno.env.get("CONCIERGE_THRESHOLD") ?? "0.76");
    const { data: facts } = await admin.from("gym_facts").select("topic, questions, content_hr, content_en");
    const text = Object.fromEntries((facts ?? []).map((f: any) => [f.topic, `${f.questions} ${f.content_hr} ${f.content_en}`]));
    const hit = ranked
      .map((m) => ({ ...m, ov: overlap(q, text[m.topic] ?? "") }))
      .filter((m) => m.similarity >= THRESHOLD && m.ov > 0)
      .sort((a, b) => b.ov - a.ov || b.similarity - a.similarity)[0];
    if (!hit) {
      return new Response(JSON.stringify({ answer: fallback, sources: [], candidate: top?.topic ?? null, score: top?.similarity ?? 0 }),
        { headers: { ...cors, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ answer: isHr ? hit.content_hr : hit.content_en, sources: [hit.topic], score: hit.similarity }),
      { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
