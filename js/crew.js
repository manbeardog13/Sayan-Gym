/* Wave 2: crew (seasons, quests, the kg club, kudos), best time to come, push, gym TV,
   and offline-safe workout logging. Points reward showing up, never kilos or bodyweight. Built by Nero. */

const TEAM_COLORS = ["var(--lava)", "var(--green)", "#5C7C9D", "var(--muted)"];
const zagrebDow = () => ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
  .indexOf(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Zagreb", weekday: "short" }).format(new Date())) + 1;
const DAYS = () => L(["Pon", "Uto", "Sri", "Čet", "Pet", "Sub", "Ned"], ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
const isNetErr = (e) => !!e && !e.code;   // PostgREST errors carry a code; a failed fetch does not
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
const lsDel = (k) => { try { localStorage.removeItem(k); } catch (e) {} };

/* =========================================================
   OFFLINE-SAFE LOGGING
   Every set lives on the phone first. The phone makes the ids, so sending the same
   workout twice (flaky gym Wi-Fi) can never create a duplicate.
   ========================================================= */
const Outbox = {
  key: () => "sg.outbox." + (state.session?.user?.id || "anon"),
  read() { return lsGet(this.key(), []); },
  add(entry) { const l = this.read(); l.push(entry); return lsSet(this.key(), l); },
  has(id) { return this.read().some((e) => e.workout.id === id); },
  async send(entry) {
    const w = await sb.from("workouts").upsert(entry.workout, { onConflict: "id", ignoreDuplicates: true });
    return w.error || (await sb.from("workout_sets").upsert(entry.sets, { onConflict: "id", ignoreDuplicates: true })).error;
  },
  async flush() {
    if (this.busy || !state.session) return;
    this.busy = true;
    try {
      for (const entry of this.read()) {
        const error = await this.send(entry);
        if (error && isNetErr(error)) break;   // still offline: keep everything, try later
        if (error) { console.error("outbox", error); toast(L("Jedan trening nije spremljen: ", "One workout could not be saved: ") + error.message, 6000); }
        lsSet(this.key(), this.read().filter((e) => e.workout.id !== entry.workout.id));
      }
    } finally {
      this.busy = false;
      if (!this.read().length) document.querySelectorAll?.(".outbox-note").forEach((n) => n.remove());
    }
  },
};
addEventListener("online", () => Outbox.flush());
document.addEventListener("visibilitychange", () => { if (!document.hidden) Outbox.flush(); });

// The workout being logged, kept on the phone until it is saved.
const Draft = {
  key: () => "sg.draft." + (state.session?.user?.id || "anon"),
  read() { const d = lsGet(this.key(), null); return d && Date.now() - d.at < 18 * 3600e3 && d.blocks?.length ? d : null; },
  save(day, blocks) { if (blocks.length) lsSet(this.key(), { day, blocks, at: Date.now() }); else this.clear(); },
  clear() { lsDel(this.key()); },
};

function outboxNoteHtml() {
  const n = Outbox.read().length;
  return n ? `<p class="small outbox-note" role="status">⏳ ${esc(L(`Treninga na mobitelu koji čekaju slanje: ${n}. Šalju se sami kad se vrati internet.`,
    `Workouts on your phone waiting to sync: ${n}. They send themselves when you're back online.`))}</p>` : "";
}

/* =========================================================
   BEST TIME TO COME
   ========================================================= */
async function loadBestTimes() {
  const { data, error } = await sb.rpc("best_times");
  return error ? [] : data || [];
}
function bestTimesHtml(rows, dow = zagrebDow(), { compact = false } = {}) {
  const close = dow === 7 ? 20 : 22;
  const byHour = Object.fromEntries(rows.filter((r) => r.dow === dow).map((r) => [r.hour, r.level]));
  const label = [L("tiho", "quiet"), L("srednje", "medium"), L("gužva", "busy")];
  const bars = [];
  for (let h = 6; h < close; h++) {
    const lv = byHour[h];
    bars.push(`<span class="bt-bar${lv == null ? " none" : " lv" + lv}" title="${h}:00 · ${esc(lv == null ? L("premalo podataka", "not enough data") : label[lv])}">
      <i style="height:${lv == null ? 8 : 30 + lv * 35}%"></i><em>${h % 3 === 0 ? h : ""}</em></span>`);
  }
  const quiet = Object.entries(byHour).filter(([, v]) => v === 0).map(([h]) => +h);
  const tip = !rows.length ? L("Još nema dovoljno dolazaka — graf se puni kako recepcija skenira karte.", "Not enough check-ins yet — this fills in as the desk scans passes.")
    : quiet.length ? L(`Najmirnije: ${quiet.slice(0, 3).map((h) => h + ":00").join(", ")}`, `Quietest: ${quiet.slice(0, 3).map((h) => h + ":00").join(", ")}`)
    : L("Za ovaj dan još nema mirnih sati u podacima.", "No quiet hours in the data for this day yet.");
  return `<div class="bt${compact ? " compact" : ""}" role="img" aria-label="${esc(tip)}"><div class="bt-bars">${bars.join("")}</div></div>
    <p class="small bt-tip">${esc(tip)}</p>
    ${compact ? "" : `<p class="small muted">${esc(L("Prema dolascima u zadnjih 8 tjedana. Sati s premalo dolazaka su skriveni.", "From the last 8 weeks of check-ins. Hours with too few visits are hidden."))}
      <span class="bt-key"><i class="lv0"></i>${esc(label[0])} <i class="lv1"></i>${esc(label[1])} <i class="lv2"></i>${esc(label[2])}</span></p>`}`;
}
function bestTimesCard(rows) {
  const dow = zagrebDow();
  return `<section class="card span-12" aria-labelledby="bt-h" data-tab="${esc(L("kada doći", "when to come"))}">
    <h2 id="bt-h">${esc(L("Najbolje vrijeme za dolazak", "Best time to come"))}</h2>
    <div class="bt-days" role="group" aria-label="${esc(L("Dan u tjednu", "Day of the week"))}">
      ${DAYS().map((d, i) => `<button class="chip" type="button" data-bt-day="${i + 1}" aria-pressed="${i + 1 === dow}">${esc(d)}</button>`).join("")}</div>
    <div id="bt-body">${bestTimesHtml(rows, dow)}</div>
  </section>`;
}
function wireBestTimes(rows) {
  document.querySelectorAll("[data-bt-day]").forEach((b) => (b.onclick = () => {
    document.querySelectorAll("[data-bt-day]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    document.getElementById("bt-body").innerHTML = bestTimesHtml(rows, +b.dataset.btDay);
  }));
}

/* =========================================================
   KI BLAST — one-tap kudos on PR bells
   ========================================================= */
function kudosButton(b, mine) {
  const n = b.pr_kudos?.[0]?.count ?? 0, on = mine.has(b.id);
  return `<button class="kudos" type="button" data-kudos="${b.id}" aria-pressed="${on}"
    aria-label="${esc(L(`Ki blast za ${b.first_name || "člana"}`, `Ki blast for ${b.first_name || "a member"}`))}">⚡<span>${n}</span></button>`;
}
async function myKudos() {
  const { data } = await sb.from("pr_kudos").select("bell_id").eq("user_id", state.session.user.id);
  return new Set((data || []).map((k) => k.bell_id));
}
function wireKudos(root = document) {
  root.querySelectorAll("[data-kudos]").forEach((b) => (b.onclick = async () => {
    const on = b.getAttribute("aria-pressed") === "true", span = b.querySelector("span");
    b.disabled = true;
    const { error } = on
      ? await sb.from("pr_kudos").delete().eq("bell_id", b.dataset.kudos).eq("user_id", state.session.user.id)
      : await sb.from("pr_kudos").insert({ bell_id: +b.dataset.kudos });
    b.disabled = false;
    if (error) return toast(L("Ki blast sada ne radi.", "Ki blast isn't working right now."));
    b.setAttribute("aria-pressed", String(!on));
    span.textContent = Math.max(0, +span.textContent + (on ? -1 : 1));
    if (!on) { buzz(25); b.classList.remove("zap"); void b.offsetWidth; b.classList.add("zap"); }
  }));
}

/* =========================================================
   CREW PAGE — season, quests, club, bells, best time
   ========================================================= */
const QUEST_KINDS = {
  days: ["Dana treninga", "Training days"], checkins: ["Dolazaka na recepciji", "Desk check-ins"],
  strong_weeks: ["Tjedana s 2+ treninga", "Weeks with 2+ sessions"], sets: ["Upisanih serija", "Logged sets"],
};
function questsHtml(quests) {
  if (!quests.length) return `<p class="small muted">${esc(L("Zrinko još nije postavio izazove za ovaj mjesec.", "Zrinko hasn't set this month's quests yet."))}</p>`;
  return quests.map((q) => `<div class="obar quest${q.done ? " done" : ""}"><div class="t"><span>${q.done ? "✓ " : ""}${esc(L(q.title_hr, q.title_en))}</span>
    <b>${q.progress}/${q.target}</b></div><div class="bar"><i data-w="${Math.round((q.progress / q.target) * 100)}"${q.done ? ' style="background:var(--green)"' : ""}></i></div></div>`).join("");
}

function seasonHtml(open, standings, mine) {
  const pts = L("10 bodova za svaki dan treninga (najviše 4 tjedno) i +10 za tjedan s 2 ili više. Dolazak na recepciji ili upisan trening. Kilaža se ne broji.",
    "10 points for each training day (up to 4 a week) and +10 for a week with 2 or more. A desk check-in or a logged workout counts. Kilos don't.");
  if (!open && !standings.length) return `<p class="small muted">${esc(L("Trenutno nema sezone. Zrinko je pokreće — 6 do 8 tjedana, male ekipe.", "No season right now. Zrinko starts them — 6 to 8 weeks, small teams."))}</p>
    <p class="small">${esc(pts)}</p>`;
  const s = standings[0] || open;
  const name = s.season_name || s.name;
  const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Zagreb" }));
  const start = new Date(s.starts_on + "T00:00"), end = new Date(s.ends_on + "T23:59");
  const phase = today < start ? L(`Počinje ${fmtDate(s.starts_on)}`, `Starts ${fmtDate(s.starts_on)}`)
    : today > end ? L("Završeno — konačni poredak", "Finished — final table")
    : L(`Još ${Math.ceil((end - today) / 864e5)} dana · do ${fmtDate(s.ends_on)}`, `${Math.ceil((end - today) / 864e5)} days left · ends ${fmtDate(s.ends_on)}`);
  const max = Math.max(1, ...standings.map((t) => t.avg_points));
  const myTeam = mine[0]?.team_id;
  const table = standings.map((t, i) => `<div class="obar team${t.team_id === myTeam ? " mine" : ""}"><div class="t">
      <span><i class="team-dot" style="background:${TEAM_COLORS[t.color] || TEAM_COLORS[0]}"></i>${i + 1}. ${esc(t.team_name)}${t.team_id === myTeam ? ` · ${esc(L("tvoja ekipa", "your team"))}` : ""}</span>
      <b>${t.avg_points} <small>${esc(L("prosjek", "avg"))} · ${t.members} ${esc(L("čl.", "mbr"))}</small></b></div>
      <div class="bar"><i data-w="${Math.round((t.avg_points / max) * 100)}" style="background:${TEAM_COLORS[t.color] || TEAM_COLORS[0]}"></i></div></div>`).join("");
  const team = mine.length ? `<h3 class="sub-h">${esc(mine[0].team_name)}</h3>${mine.map((m) => `<div class="row${m.is_me ? " me" : ""}"><span>${esc(m.first_name)}${m.is_me ? ` (${esc(L("ti", "you"))})` : ""}</span><b>${m.points}</b></div>`).join("")}` : "";
  const canJoin = open && !open.joined && today <= end;
  return `<p class="small"><b>${esc(name)}</b> · ${esc(phase)}</p>
    ${table || `<p class="small muted">${esc(L("Ekipe se pune.", "Teams are filling up."))}</p>`}
    ${team}
    ${canJoin ? `<p class="small muted" style="margin-top:12px">${esc(pts)} ${esc(L("Ulaskom tvoje ime i bodovi vidljivi su tvojoj ekipi, a zbroj ekipe na ekranu u teretani.",
      "Joining shows your first name and points to your team, and your team's total on the gym screen."))}</p>
      <button class="btn btn-primary" id="season-join" type="button">${esc(L("Uđi u sezonu", "Join the season"))}</button>`
    : `<p class="small muted" style="margin-top:10px">${esc(pts)}</p>`}
    ${mine.length ? `<button class="btn btn-ghost btn-sm" id="season-leave" type="button">${esc(L("Izađi iz sezone", "Leave the season"))}</button>` : ""}`;
}

function clubHtml(own, board) {
  const tier = (t) => (t >= 500 ? 500 : t >= 400 ? 400 : t >= 300 ? 300 : 0);
  const mine = own ? `<div class="health club-own">
      <div class="hstat">${esc(L("Čučanj", "Squat"))}<b>${fmtKg(own.squat_kg)}</b></div>
      <div class="hstat">${esc(L("Bench", "Bench"))}<b>${fmtKg(own.bench_kg)}</b></div>
      <div class="hstat">${esc(L("Mrtvo", "Deadlift"))}<b>${fmtKg(own.deadlift_kg)}</b></div></div>
    <p class="small"><b>${esc(L("Ukupno", "Total"))} ${fmtKg(own.total_kg)}</b>${tier(own.total_kg) ? ` · 🏆 ${tier(own.total_kg)} kg ${esc(L("klub", "club"))}` : ` · ${esc(L(`još ${fmtKg(300 - own.total_kg)} do 300`, `${fmtKg(300 - own.total_kg)} to 300`))}`}
      · <span class="muted">${esc(L("potvrđeno", "verified"))} ${fmtDate(own.verified_at)}</span></p>`
    : `<p class="small muted">${esc(L("Čučanj + bench + mrtvo dizanje. Trener potvrdi tvoje dizanje na recepciji i upiše ga.", "Squat + bench + deadlift. A coach watches your lifts and records them at the desk."))}</p>`;
  const tiers = [500, 400, 300].map((t) => {
    const rows = board.filter((b) => b.tier === t);
    if (!rows.length) return "";
    const named = rows.filter((r) => r.first_name), anon = rows.length - named.length;
    return `<div class="row"><span>🏆 ${t} kg</span><span class="small">${named.map((r) => `${esc(r.first_name)} <span class="muted">${fmtKg(r.total_kg)}</span>`).join(" · ")}
      ${anon ? `${named.length ? " · " : ""}+${anon}` : ""}</span></div>`;
  }).join("");
  return `${mine}${tiers ? `<h3 class="sub-h">${esc(L("Članovi kluba", "Club members"))}</h3>${tiers}` : ""}`;
}

async function viewCrew() {
  $view.innerHTML = `<div class="loading">…</div>`;
  const uid = state.session.user.id;
  const [open, standings, mine, quests, own, board, bells, kudos, best] = await Promise.all([
    sb.rpc("open_season"), sb.rpc("season_standings"), sb.rpc("my_season"), sb.rpc("my_quests"),
    sb.from("club_lifts").select("*").eq("user_id", uid).maybeSingle(), sb.rpc("club_board"),
    sb.from("pr_bells").select("id, first_name, load_kg, reps, created_at, exercises(name_hr,name_en), pr_kudos(count)").order("created_at", { ascending: false }).limit(12),
    myKudos(), loadBestTimes(),
  ]);
  for (const r of [open, standings, mine, quests]) if (r.error) return fail(r.error);
  const boards = !!state.profile?.show_on_boards;
  $view.innerHTML = `
  <div class="page">
    <div class="phead"><div><h1>${esc(L("Ekipa", "Crew"))}</h1>
      <p class="muted">${esc(L("Sezone, izazovi i klub. Bodovi su za dolaske, ne za kilažu.", "Seasons, quests and the club. Points are for showing up, not for kilos."))}</p></div></div>
    <div class="grid">
      <section class="card span-7" aria-labelledby="se-h" data-tab="${esc(L("sezona", "season"))}">
        <h2 id="se-h">${esc(L("Sezona ekipa", "Team season"))}</h2>
        ${seasonHtml((open.data || [])[0], standings.data || [], mine.data || [])}
      </section>
      <section class="card span-5" aria-labelledby="qu-h" data-tab="${esc(L("izazovi", "quests"))}">
        <h2 id="qu-h">${esc(L("Izazovi ovog mjeseca", "This month's quests"))} <span class="count-badge">${(quests.data || []).filter((q) => q.done).length}/${(quests.data || []).length}</span></h2>
        ${questsHtml(quests.data || [])}
      </section>
      <section class="card span-6" aria-labelledby="pb-h" data-tab="${esc(L("zvono", "bell"))}">
        <h2 id="pb-h">🔔 ${esc(L("Zvono rekorda", "PR bell"))}</h2>
        <p class="small muted">${esc(L("Rekordi članova iz zadnjih 14 dana. Jedan dodir za Ki blast — bez komentara.", "Members' PRs from the last 14 days. One tap for a Ki blast — no comments."))}</p>
        ${(bells.data || []).map((b) => `<div class="row bell-row"><span><b>${esc(b.first_name || "—")}</b> ${esc(b.exercises ? nameOf(b.exercises) : "")}
          <span class="muted">${fmtKg(b.load_kg)} × ${b.reps} · ${fmtDate(b.created_at)}</span></span>${kudosButton(b, kudos)}</div>`).join("")
          || `<p class="small muted">${esc(L("Još nitko nije zazvonio. Budi prvi!", "Nobody has rung the bell yet. Be the first!"))}</p>`}
      </section>
      <section class="card span-6" aria-labelledby="cl-h" data-tab="${esc(L("klub", "club"))}">
        <h2 id="cl-h">300 / 400 / 500 kg ${esc(L("klub", "club"))}</h2>
        ${clubHtml(own.data, board.data || [])}
        <label class="toggle-row" style="margin-top:14px"><input type="checkbox" id="boards" ${boards ? "checked" : ""}>
          <span>${esc(L("Pokaži moje ime na pločama i ekranu u teretani", "Show my first name on the boards and the gym screen"))}</span></label>
        <p class="small muted">${esc(L("Isključeno: ostaješ u klubu kao „+1”. Tjelesna težina se nikad ne prikazuje.", "Off: you stay in the club as “+1”. Bodyweight is never shown."))}</p>
      </section>
      ${bestTimesCard(best)}
    </div>
  </div>`;
  animateIn($view); wireKudos($view); wireBestTimes(best);
  const join = document.getElementById("season-join");
  if (join) join.onclick = async () => {
    join.disabled = true;
    const { error } = await sb.rpc("join_season");
    if (error) { join.disabled = false; return fail(error); }
    toast(L("Unutra si! Svaki dolazak se broji.", "You're in! Every visit counts.")); viewCrew();
  };
  const leave = document.getElementById("season-leave");
  if (leave) leave.onclick = async () => {
    if (!confirm(L("Izaći iz sezone? Tvoji bodovi nestaju iz ekipe.", "Leave the season? Your points leave the team."))) return;
    const { data: s } = await sb.rpc("current_season_id");
    const { error } = await sb.from("season_members").delete().eq("season_id", s).eq("user_id", uid);
    error ? fail(error) : viewCrew();
  };
  document.getElementById("boards").onchange = (e) => setBoards(e.target);
}

async function setBoards(box) {
  const { error } = await sb.from("profiles").update({ show_on_boards: box.checked }).eq("id", state.session.user.id);
  if (error) { box.checked = !box.checked; return fail(error); }
  state.profile.show_on_boards = box.checked; toast(t("saved_ok"));
}

// Small dashboard line pointing at the crew page, only when there is something to show.
async function crewTeaserHtml() {
  const [st, mine, q] = await Promise.all([sb.rpc("season_standings"), sb.rpc("my_season"), sb.rpc("my_quests")]);
  const standings = st.data || [], team = (mine.data || [])[0], quests = q.data || [];
  if (!standings.length && !quests.length) return "";
  const place = team ? standings.findIndex((s) => s.team_id === team.team_id) + 1 : 0;
  const bits = [];
  if (team) bits.push(L(`${team.team_name}: ${place}. mjesto`, `${team.team_name}: ${place}${["st", "nd", "rd"][place - 1] || "th"} place`));
  else if (standings.length) bits.push(L("Sezona je u tijeku — uđi", "A season is on — join in"));
  if (quests.length) bits.push(L(`Izazovi ${quests.filter((x) => x.done).length}/${quests.length}`, `Quests ${quests.filter((x) => x.done).length}/${quests.length}`));
  return `<a class="crew-teaser reveal" href="#/crew"><span class="bells-k">${esc(L("Ekipa", "Crew"))}</span><span>${esc(bits.join(" · "))}</span><span aria-hidden="true">→</span></a>`;
}

/* =========================================================
   PUSH NOTIFICATIONS (opt-in, at most one a day)
   ========================================================= */
const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
// The page's current registration, without waiting on a worker that may not be installed yet.
const swReg = async () => (await navigator.serviceWorker.getRegistration()) || Promise.race([navigator.serviceWorker.ready,
  new Promise((_, rej) => setTimeout(() => rej(new Error(L("Aplikacija se još instalira — pokušaj za trenutak.", "The app is still installing — try again in a moment."))), 4000))]);
const keyBytes = (b64) => Uint8Array.from(atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64.length + 3) % 4)), (c) => c.charCodeAt(0));

async function pushCardHtml() {
  const ios = /iphone|ipad/i.test(navigator.userAgent);
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  let body;
  if (!pushSupported()) {
    body = `<p class="small muted">${esc(ios && !standalone
      ? L("Na iPhoneu obavijesti rade kad je aplikacija na početnom zaslonu: Dijeli → „Dodaj na početni zaslon”, pa je otvori odande.",
          "On iPhone, notifications work once the app is on your home screen: Share → “Add to Home Screen”, then open it from there.")
      : L("Ovaj preglednik ne podržava obavijesti.", "This browser doesn't support notifications."))}</p>`;
  } else {
    const reg = await navigator.serviceWorker.getRegistration().catch(() => null);
    const sub = reg ? await reg.pushManager.getSubscription().catch(() => null) : null;
    const { data } = sub ? await sb.from("push_subscriptions").select("topics").eq("endpoint", sub.endpoint).maybeSingle() : { data: null };
    const on = !!(sub && data), topics = data?.topics || ["news", "quiet"];
    const blocked = Notification.permission === "denied";
    body = `<label class="toggle-row"><input type="checkbox" id="push-on" ${on ? "checked" : ""} ${blocked ? "disabled" : ""}>
        <span>${esc(L("Obavijesti na ovom uređaju", "Notifications on this device"))}</span></label>
      <div class="push-topics" ${on ? "" : "hidden"}>
        <label class="toggle-row"><input type="checkbox" data-topic="news" ${topics.includes("news") ? "checked" : ""}> <span>${esc(L("Zrinkove novosti", "News from Zrinko"))}</span></label>
        <label class="toggle-row"><input type="checkbox" data-topic="quiet" ${topics.includes("quiet") ? "checked" : ""}>
          <span>${esc(L("„Tiho je sada” — kad je teretana prazna blizu tvog uobičajenog vremena", "“Quiet now” — when the gym is empty near the time you usually come"))}</span></label>
      </div>
      <p class="small muted">${esc(blocked ? L("Obavijesti su blokirane u postavkama preglednika.", "Notifications are blocked in your browser settings.")
        : L("Najviše jedna dnevno. Nikad poruke krivnje.", "At most one a day. Never guilt messages."))}</p>`;
  }
  return `<section class="card span-6" aria-labelledby="pn-h" data-tab="${esc(L("obavijesti", "alerts"))}"><h2 id="pn-h">${esc(L("Obavijesti", "Notifications"))}</h2>${body}</section>`;
}

function wirePush() {
  const box = document.getElementById("push-on");
  if (!box) return;
  const topics = () => [...document.querySelectorAll("[data-topic]")].filter((c) => c.checked).map((c) => c.dataset.topic);
  const save = async (sub) => {
    const j = sub.toJSON();
    const { error } = await sb.rpc("save_push_subscription", { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_topics: topics() });
    if (error) throw error;
    return j.endpoint;
  };
  box.onchange = async () => {
    box.disabled = true;
    try {
      const reg = await swReg();
      if (box.checked) {
        if (await Notification.requestPermission() !== "granted") throw new Error(L("Dopuštenje nije dano.", "Permission not given."));
        const { data, error } = await sb.functions.invoke("push", { body: { action: "key" } });
        if (error || !data?.key) throw new Error(L("Obavijesti trenutno nisu dostupne.", "Notifications aren't available right now."));
        const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(data.key) });
        const endpoint = await save(sub);
        sb.functions.invoke("push", { body: { action: "hello", endpoint } });
        document.querySelector(".push-topics").hidden = false;
        toast(L("Obavijesti su uključene.", "Notifications are on."));
      } else {
        const sub = await reg.pushManager.getSubscription();
        if (sub) { await sb.from("push_subscriptions").delete().eq("endpoint", sub.endpoint); await sub.unsubscribe(); }
        document.querySelector(".push-topics").hidden = true;
        toast(L("Obavijesti su isključene.", "Notifications are off."));
      }
    } catch (e) { box.checked = !box.checked; toast(e.message || t("error"), 4000); }
    box.disabled = false;
  };
  document.querySelectorAll("[data-topic]").forEach((c) => (c.onchange = async () => {
    const sub = await swReg().then((r) => r.pushManager.getSubscription()).catch(() => null);
    if (!sub) return;
    try { await save(sub); toast(t("saved_ok")); } catch (e) { c.checked = !c.checked; fail(e); }
  }));
}

/* =========================================================
   GYM TV — a staff-signed-in screen at the gym. First names only for members who
   opted in (bells are opt-in each time); never bodyweight.
   ========================================================= */
async function viewTv() {
  if (!isStaff()) { $view.innerHTML = `<div class="page"><p>${esc(t("staff_only"))}</p></div>`; return; }
  document.documentElement.classList.add("tv-mode");
  const draw = async () => {
    if (location.hash.split("?")[0] !== "#/tv") return;
    const { data: d, error } = await sb.rpc("tv_board");
    if (error) { document.getElementById("tv-err")?.removeAttribute("hidden"); return; }
    document.getElementById("tv-err")?.setAttribute("hidden", "");
    const best = (d.best || []).map((b) => ({ ...b, dow: zagrebDow() }));
    const max = Math.max(1, ...d.standings.map((t) => t.avg_points));
    const img = d.post?.image ? sb.storage.from("posts").getPublicUrl(d.post.image).data.publicUrl : "";
    document.getElementById("tv").innerHTML = `
      <section class="tv-card tv-now"><span class="tv-k">${esc(L("Sada unutra", "Inside now"))}</span>
        ${isOpenNow() ? `<b class="tv-big">${d.occupancy}</b>` : `<b class="tv-big closed">${esc(L("Zatvoreno", "Closed"))}</b>`}
        <span class="tv-k">${esc(L("Danas", "Today"))}</span>${bestTimesHtml(best, zagrebDow(), { compact: true })}</section>
      <section class="tv-card tv-season"><span class="tv-k">${esc(d.standings[0]?.season_name || L("Sezona", "Season"))}</span>
        ${d.standings.length ? d.standings.map((t, i) => `<div class="obar team"><div class="t"><span><i class="team-dot" style="background:${TEAM_COLORS[t.color]}"></i>${i + 1}. ${esc(t.team_name)}</span>
          <b>${t.avg_points}</b></div><div class="bar"><i data-w="${Math.round((t.avg_points / max) * 100)}" style="background:${TEAM_COLORS[t.color]}"></i></div></div>`).join("")
          : `<p>${esc(L("Nova sezona uskoro.", "New season soon."))}</p>`}</section>
      <section class="tv-card tv-bells"><span class="tv-k">🔔 ${esc(L("Zvono rekorda", "PR bell"))}</span>
        ${d.bells.map((b) => `<div class="tv-row"><b>${esc(b.first_name || "—")}</b><span>${esc(L(b.name_hr, b.name_en))} ${fmtKg(b.load_kg)} × ${b.reps}</span><em>⚡${b.kudos}</em></div>`).join("")
          || `<p>${esc(L("Tko će prvi zazvoniti?", "Who rings the bell first?"))}</p>`}</section>
      <section class="tv-card tv-club"><span class="tv-k">300 / 400 / 500 kg ${esc(L("klub", "club"))}</span>
        ${[500, 400, 300].map((t) => { const r = d.club.filter((c) => c.tier === t); if (!r.length) return "";
          const named = r.filter((c) => c.first_name); return `<div class="tv-row"><b>${t}</b><span>${named.map((c) => esc(c.first_name)).join(" · ")}${r.length > named.length ? ` +${r.length - named.length}` : ""}</span></div>`; }).join("")
          || `<p>${esc(L("Prvi član kluba — možda ti?", "First club member — maybe you?"))}</p>`}</section>
      <section class="tv-card tv-quests"><span class="tv-k">${esc(L("Izazovi mjeseca", "Monthly quests"))}</span>
        ${d.quests.map((q) => `<div class="tv-row"><span>${esc(L(q.title_hr, q.title_en))}</span></div>`).join("") || `<p>—</p>`}</section>
      <section class="tv-card tv-post">${img ? `<img src="${esc(img)}" alt="">` : ""}<span class="tv-k">${esc(L("Zrinkove novosti", "News from Zrinko"))}</span>
        <b>${esc(d.post?.title || "Saiyan Gym FITT")}</b></section>`;
    animateIn(document.getElementById("tv"));
  };
  // the header (and its gradient) is hidden on the TV, so this copy carries its own
  const mark = WORDMARK.replace('id="wmg"', 'id="wmg-tv"').replace("url(#wmg)", "url(#wmg-tv)");
  $view.innerHTML = `<div class="tv-wrap"><div class="tv-head">${mark}<span class="tv-clock" id="tv-clock"></span>
      <a class="btn btn-ghost btn-sm tv-exit" href="#/desk">${esc(L("Izlaz", "Exit"))}</a></div>
    <p class="small" id="tv-err" hidden>${esc(L("Nema veze — prikazujem zadnje podatke.", "No connection — showing the last data."))}</p>
    <div class="tv-grid" id="tv"></div></div>`;
  const clock = () => { const el = document.getElementById("tv-clock"); if (el) el.textContent = new Date().toLocaleTimeString(LANG === "hr" ? "hr-HR" : "en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Zagreb" }); };
  clock(); await draw();
  let lock = null;
  const wake = async () => { try { lock = await navigator.wakeLock?.request("screen"); } catch (e) {} };
  wake();
  const onVis = () => { if (!document.hidden) wake(); };
  document.addEventListener("visibilitychange", onVis);
  const iv = setInterval(() => { clock(); if (new Date().getSeconds() < 20) draw(); }, 20000);
  viewTv.cleanup = () => { clearInterval(iv); document.removeEventListener("visibilitychange", onVis); lock?.release?.().catch(() => {}); document.documentElement.classList.remove("tv-mode"); };
}

/* =========================================================
   ADMIN: seasons and quests
   ========================================================= */
// The quests add_default_quests() / the monthly job create (supabase/quests_auto.sql).
const STANDARD_QUESTS = ["days", "strong_weeks", "sets"];
async function crewAdminHtml() {
  const [st, open, quests, ex, auto] = await Promise.all([
    sb.from("seasons").select("id,name,starts_on,ends_on,season_teams(name)").order("starts_on", { ascending: false }).limit(4),
    sb.rpc("season_standings"),
    sb.from("quests").select("*").eq("month", todayZagreb().slice(0, 8) + "01").order("created_at"),
    loadExercises(),
    sb.from("site_settings").select("value").eq("key", "auto_quests").maybeSingle(),
  ]);
  const autoOn = auto.data?.value !== "off";
  const kindsNow = new Set((quests.data || []).filter((q) => !q.exercise_id).map((q) => q.kind));
  const missingStd = STANDARD_QUESTS.filter((k) => !kindsNow.has(k)).length;
  const nextMon = (() => { const d = new Date(todayZagreb() + "T12:00"); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); return d.toISOString().slice(0, 10); })();
  const names = L(["Lava", "Čelik", "Grom", "Val"], ["Lava", "Steel", "Thunder", "Wave"]);
  const qk = Object.entries(QUEST_KINDS);
  return `<section class="card span-12" aria-labelledby="acrew" data-tab="${esc(L("ekipa", "crew"))}">
    <h2 id="acrew">${esc(L("Sezone i izazovi", "Seasons and quests"))}</h2>
    <p class="muted small">${esc(L("Sezona traje 6–8 tjedana. Članovi sami ulaze i aplikacija ih raspoređuje u najmanju ekipu. Bodovi su samo za dolaske.",
      "A season runs 6–8 weeks. Members join themselves and the app puts them in the smallest team. Points are for showing up only."))}</p>
    ${(st.data || []).map((s) => `<div class="row" data-season="${s.id}"><span><b>${esc(s.name)}</b> <span class="muted">${fmtDate(s.starts_on)} – ${fmtDate(s.ends_on)} · ${(s.season_teams || []).map((x) => esc(x.name)).join(", ")}</span></span>
      <button class="icon-btn" type="button" data-del-season aria-label="${esc(t("a_delete"))}">✕</button></div>`).join("")}
    ${(open.data || []).length ? "" : `<div class="form-grid" style="margin-top:10px">
      <div><label>${esc(L("Naziv sezone", "Season name"))}</label><input id="se-name" maxlength="60" value="${esc(L("Jesenska sezona", "Autumn season"))}"></div>
      <div><label>${esc(L("Početak", "Start"))}</label><input id="se-start" type="date" value="${nextMon}"></div>
      <div><label>${esc(L("Tjedana", "Weeks"))}</label><select id="se-weeks"><option>6</option><option selected>7</option><option>8</option></select></div>
    </div>
    <div class="form-grid" style="margin-top:8px">${names.map((n, i) => `<div><label>${esc(L("Ekipa", "Team"))} ${i + 1}${i > 1 ? ` (${esc(L("neobavezno", "optional"))})` : ""}</label><input data-team maxlength="30" value="${i < 3 ? esc(n) : ""}"></div>`).join("")}</div>
    <button class="btn btn-primary btn-sm" id="se-create" type="button" style="margin-top:10px">${esc(L("Pokreni sezonu", "Start the season"))}</button>`}
    <h3 class="sub-h">${esc(L("Izazovi ovog mjeseca", "This month's quests"))}</h3>
    <label class="toggle-row small"><input type="checkbox" id="qu-auto"${autoOn ? " checked" : ""}> <span>${esc(L(
      "Svaki mjesec sam dodaj 3 standardna izazova (8 dana treninga, 3 tjedna s 2+ treninga, 60 serija). Obrisani ostaju obrisani.",
      "Add the 3 standard quests every month (8 training days, 3 weeks with 2+ sessions, 60 sets). Deleted ones stay deleted."))}</span></label>
    ${missingStd ? `<button class="btn btn-ghost btn-sm" id="qu-std" type="button">${esc(L(`Dodaj standardne izazove za ovaj mjesec (${missingStd})`, `Add the standard quests to this month (${missingStd})`))}</button>` : ""}
    ${(quests.data || []).map((q) => `<div class="row" data-quest="${q.id}"><span>${esc(L(q.title_hr, q.title_en))} <span class="muted">· ${esc(L(...QUEST_KINDS[q.kind]))} ${q.target}</span></span>
      <button class="icon-btn" type="button" data-del-quest aria-label="${esc(t("a_delete"))}">✕</button></div>`).join("") || `<p class="small muted">${esc(L("Još nema izazova.", "No quests yet."))}</p>`}
    <div class="form-grid" style="margin-top:10px">
      <div><label>${esc(L("Vrsta", "Kind"))}</label><select id="qu-kind">${qk.map(([k, v]) => `<option value="${k}">${esc(L(...v))}</option>`).join("")}</select></div>
      <div><label>${esc(L("Cilj", "Target"))}</label><input id="qu-target" inputmode="numeric" value="8"></div>
      <div><label>${esc(L("Vježba (za serije)", "Exercise (for sets)"))}</label><select id="qu-ex"><option value="">${esc(L("Bilo koja", "Any"))}</option>${ex.map((e) => `<option value="${e.id}">${esc(nameOf(e))}</option>`).join("")}</select></div>
    </div>
    <div class="form-grid" style="margin-top:8px">
      <div><label>${esc(L("Naslov HR", "Title HR"))}</label><input id="qu-hr" maxlength="80" placeholder="8 dana treninga"></div>
      <div><label>${esc(L("Naslov EN", "Title EN"))}</label><input id="qu-en" maxlength="80" placeholder="8 training days"></div>
    </div>
    <button class="btn btn-primary btn-sm" id="qu-add" type="button" style="margin-top:10px">+ ${esc(L("Dodaj izazov", "Add quest"))}</button>
  </section>`;
}
function wireCrewAdmin(reload) {
  const create = document.getElementById("se-create");
  if (create) create.onclick = async () => {
    const teams = [...document.querySelectorAll("[data-team]")].map((i) => i.value.trim()).filter(Boolean);
    const name = document.getElementById("se-name").value.trim();
    if (!name || teams.length < 2) return toast(L("Treba naziv i barem 2 ekipe.", "A name and at least 2 teams are needed."));
    const { error } = await sb.rpc("create_season", { p_name: name, p_starts: document.getElementById("se-start").value,
      p_weeks: +document.getElementById("se-weeks").value, p_teams: teams });
    if (error) return toast(error.message === "overlap" ? L("Preklapa se s drugom sezonom.", "It overlaps another season.") : t("error") + error.message, 4000);
    toast(t("saved_ok")); reload();
  };
  document.querySelectorAll("[data-del-season]").forEach((b) => (b.onclick = async () => {
    if (!confirm(L("Obrisati sezonu sa svim ekipama i bodovima?", "Delete the season with all its teams and points?"))) return;
    const { error } = await sb.from("seasons").delete().eq("id", b.closest("[data-season]").dataset.season);
    error ? fail(error) : reload();
  }));
  const fill = () => {
    const k = document.getElementById("qu-kind").value, n = document.getElementById("qu-target").value || "…";
    const ex = document.getElementById("qu-ex"), exName = ex.value ? ex.options[ex.selectedIndex].text : "";
    const t2 = { days: [`${n} dana treninga`, `${n} training days`], checkins: [`${n} dolazaka`, `${n} visits`],
      strong_weeks: [`${n} tjedna s 2+ treninga`, `${n} weeks with 2+ sessions`], sets: [`${n} serija${exName ? ": " + exName : ""}`, `${n} sets${exName ? ": " + exName : ""}`] }[k];
    document.getElementById("qu-hr").placeholder = t2[0]; document.getElementById("qu-en").placeholder = t2[1];
  };
  ["qu-kind", "qu-target", "qu-ex"].forEach((id) => document.getElementById(id)?.addEventListener("input", fill));
  fill();
  document.getElementById("qu-auto").onchange = async (e) => {
    const { error } = await sb.from("site_settings").upsert({ key: "auto_quests", value: e.target.checked ? "on" : "off", updated_at: new Date().toISOString() });
    if (error) { e.target.checked = !e.target.checked; return fail(error); }
    toast(e.target.checked ? L("Izazovi će se dodavati svaki mjesec.", "Quests will be added every month.") : L("Automatski izazovi isključeni.", "Automatic quests switched off."));
  };
  const std = document.getElementById("qu-std");
  if (std) std.onclick = async () => {
    std.disabled = true;
    const { data, error } = await sb.rpc("add_default_quests");
    if (error) { std.disabled = false; return fail(error); }
    toast(L(`Dodano izazova: ${data ?? 0}.`, `Quests added: ${data ?? 0}.`)); reload();
  };
  document.getElementById("qu-add").onclick = async () => {
    const target = parseInt(document.getElementById("qu-target").value, 10);
    if (!(target >= 1 && target <= 300)) return toast(L("Cilj 1–300.", "Target 1–300."));
    const hr = document.getElementById("qu-hr"), en = document.getElementById("qu-en"), kind = document.getElementById("qu-kind").value;
    const { error } = await sb.from("quests").insert({ month: todayZagreb().slice(0, 8) + "01", kind, target,
      exercise_id: kind === "sets" ? document.getElementById("qu-ex").value || null : null,
      title_hr: hr.value.trim() || hr.placeholder, title_en: en.value.trim() || en.placeholder });
    error ? fail(error) : reload();
  };
  document.querySelectorAll("[data-del-quest]").forEach((b) => (b.onclick = async () => {
    const { error } = await sb.from("quests").delete().eq("id", b.closest("[data-quest]").dataset.quest);
    error ? fail(error) : reload();
  }));
}

/* =========================================================
   DESK: record a coach-verified club total
   ========================================================= */
async function clubDeskHtml() {
  const { data } = await sb.from("club_lifts").select("user_id,total_kg,verified_at").order("total_kg", { ascending: false }).limit(12);
  const ids = (data || []).map((c) => c.user_id);
  const { data: names } = ids.length ? await sb.from("profiles").select("id,display_name").in("id", ids) : { data: [] };
  const nm = Object.fromEntries((names || []).map((n) => [n.id, n.display_name]));
  return `<section class="card span-12" aria-labelledby="cd-h" data-tab="${esc(L("klub", "club"))}">
    <h2 id="cd-h">300 / 400 / 500 kg ${esc(L("klub", "club"))}</h2>
    <p class="muted small">${esc(L("Upiši samo dizanja koja si vidio/la uživo. Član sam bira hoće li mu se ime vidjeti.", "Record only lifts you watched. The member chooses whether their name is shown."))}</p>
    <label for="cd-q">${esc(L("Član", "Member"))}</label>
    <input id="cd-q" type="search" autocomplete="off" placeholder="${esc(L("Traži po imenu", "Search by name"))}">
    <div id="cd-hits"></div>
    <div class="form-grid" style="margin-top:8px">
      <div><label>${esc(L("Čučanj (kg)", "Squat (kg)"))}</label><input id="cd-sq" inputmode="decimal"></div>
      <div><label>${esc(L("Bench (kg)", "Bench (kg)"))}</label><input id="cd-bp" inputmode="decimal"></div>
      <div><label>${esc(L("Mrtvo (kg)", "Deadlift (kg)"))}</label><input id="cd-dl" inputmode="decimal"></div>
    </div>
    <button class="btn btn-primary btn-sm" id="cd-save" type="button" style="margin-top:10px" disabled>${esc(L("Potvrdi dizanja", "Verify lifts"))}</button>
    ${(data || []).map((c) => `<div class="row"><span>${esc(nm[c.user_id] || "—")}</span><span class="small">${fmtKg(c.total_kg)} · ${fmtDate(c.verified_at)}</span></div>`).join("")}
  </section>`;
}
function wireClubDesk(reload) {
  let who = null, tmr;
  const q = document.getElementById("cd-q"), hits = document.getElementById("cd-hits"), save = document.getElementById("cd-save");
  if (!q) return;
  q.oninput = () => { clearTimeout(tmr); who = null; save.disabled = true; tmr = setTimeout(async () => {
    const s = q.value.trim().replace(/[%_]/g, ""); if (s.length < 2) return (hits.innerHTML = "");
    const { data } = await sb.from("profiles").select("id,display_name").ilike("display_name", `%${s}%`).limit(6);
    hits.innerHTML = (data || []).map((p) => `<button class="chip" type="button" data-who="${p.id}">${esc(p.display_name || "—")}</button>`).join(" ");
    hits.querySelectorAll("[data-who]").forEach((b) => (b.onclick = async () => {
      who = b.dataset.who; q.value = b.textContent; hits.innerHTML = ""; save.disabled = false;
      const { data: c } = await sb.from("club_lifts").select("*").eq("user_id", who).maybeSingle();
      document.getElementById("cd-sq").value = c?.squat_kg ?? ""; document.getElementById("cd-bp").value = c?.bench_kg ?? ""; document.getElementById("cd-dl").value = c?.deadlift_kg ?? "";
    }));
  }, 250); };
  save.onclick = async () => {
    const v = (id) => parseFloat(document.getElementById(id).value.replace(",", "."));
    const row = { user_id: who, squat_kg: v("cd-sq"), bench_kg: v("cd-bp"), deadlift_kg: v("cd-dl") };
    if (!who || [row.squat_kg, row.bench_kg, row.deadlift_kg].some((x) => isNaN(x) || x < 0)) return toast(L("Upiši sva tri dizanja.", "Enter all three lifts."));
    const { error } = await sb.from("club_lifts").upsert(row, { onConflict: "user_id" });
    error ? fail(error) : (toast(t("saved_ok")), reload());
  };
}
