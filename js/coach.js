/* Saiyan Gym FITT — Wave 1 engagement layer (see RESEARCH.md).
   Workout mode (rest timer, screen stays on, beeps, voice, plate math), PR celebration,
   first-4-in-4 onboarding, install coach and the staff "greet today" list.
   Loaded before app.js; uses its globals (sb, esc, L, t, toast, fail, fmtKg, nameOf) at call time. */

const PREF_KEY = "sg.coach";
const coachPrefs = (() => { try { return JSON.parse(localStorage.getItem(PREF_KEY) || "{}"); } catch (e) { return {}; } })();
function setCoachPref(k, v) { coachPrefs[k] = v; try { localStorage.setItem(PREF_KEY, JSON.stringify(coachPrefs)); } catch (e) {} }
const e1rm = (load, reps) => (reps === 1 ? load : load * (1 + reps / 30));
const todayZagreb = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Zagreb" });
const buzz = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} }; // Android; iOS has no web vibration

/* ---------- Workout mode ---------- */
const Workout = {
  lock: null, audio: null, end: 0, total: 0, iv: null, spoke: false, el: null,
  async keepAwake(on) {
    try {
      if (on && "wakeLock" in navigator && !this.lock) {
        this.lock = await navigator.wakeLock.request("screen");
        this.lock.addEventListener("release", () => (this.lock = null));
      } else if (!on && this.lock) { await this.lock.release(); this.lock = null; }
    } catch (e) { /* not supported or denied: the timer still works */ }
  },
  // Web Audio beeps; "playback" session lets them sound with the iPhone silent switch on.
  unlockAudio() {
    if (this.audio) return;
    try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) {}
    try { this.audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
  },
  beep(freq = 880, ms = 140, when = 0) {
    if (!this.audio || coachPrefs.sound === false) return;
    const a = this.audio, o = a.createOscillator(), g = a.createGain(), t0 = a.currentTime + when;
    o.frequency.value = freq; o.type = "sine";
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
    o.connect(g).connect(a.destination); o.start(t0); o.stop(t0 + ms / 1000 + 0.02);
  },
  say(textHr, textEn) {
    if (!coachPrefs.voice || !("speechSynthesis" in window)) return;
    const want = LANG === "hr" ? "hr" : "en", voices = speechSynthesis.getVoices();
    const v = voices.find((x) => x.lang.toLowerCase().startsWith(want)) || voices.find((x) => x.lang.toLowerCase().startsWith("en"));
    const u = new SpeechSynthesisUtterance(v && v.lang.toLowerCase().startsWith("hr") ? textHr : textEn);
    if (v) { u.voice = v; u.lang = v.lang; }
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  },
  start(sec) {
    this.unlockAudio(); this.keepAwake(true);
    this.total = sec; this.end = Date.now() + sec * 1000; this.spoke = false;
    clearInterval(this.iv); this.iv = setInterval(() => this.tick(), 250); this.tick();
  },
  add(sec) { if (this.end) { this.end += sec * 1000; this.total = Math.max(this.total + sec, 1); this.tick(); } },
  stop() { clearInterval(this.iv); this.iv = null; this.end = 0; this.render(0); },
  tick() {
    const left = Math.max(0, Math.round((this.end - Date.now()) / 1000));
    if (left === 10 && !this.spoke) { this.spoke = true; this.beep(660, 90); this.say("Još deset sekundi", "Ten seconds"); }
    if (left === 0 && this.iv) {
      clearInterval(this.iv); this.iv = null; this.end = 0;
      this.beep(880, 160); this.beep(880, 160, 0.22); this.beep(1175, 260, 0.44); buzz([120, 80, 120]);
      this.say("Vrijeme je, sljedeća serija", "Time. Next set");
    }
    this.render(left);
  },
  render(left) {
    const el = document.getElementById("wm-time"); if (!el) return;
    el.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
    const bar = document.getElementById("wm-bar");
    if (bar) bar.style.transform = `scaleX(${this.total && left ? left / this.total : 0})`;
    document.getElementById("wm")?.classList.toggle("running", left > 0);
  },
};
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && Workout.iv) { Workout.keepAwake(true); Workout.tick(); } });

// Rest defaults: longer for heavy compounds, shorter for isolation (per-member override remembered).
const restFor = (ex) => coachPrefs.rest || (ex?.is_compound ? 150 : 90);

function workoutBarHtml() {
  return `<div class="wm" id="wm" role="timer" aria-live="off">
    <div class="wm-main">
      <span class="wm-label">${esc(L("Odmor", "Rest"))}</span>
      <b id="wm-time">0:00</b>
      <div class="wm-ctl">
        <button type="button" class="chip" data-wm="-15" aria-label="${esc(L("15 sekundi manje", "15 seconds less"))}">−15</button>
        <button type="button" class="chip" data-wm="15" aria-label="${esc(L("15 sekundi više", "15 seconds more"))}">+15</button>
        <button type="button" class="chip" data-wm="stop">${esc(L("Preskoči", "Skip"))}</button>
      </div>
    </div>
    <div class="wm-track"><i id="wm-bar"></i></div>
    <div class="wm-opts">
      ${[60, 90, 120, 180].map((s) => `<button type="button" class="chip" data-wm-set="${s}" aria-pressed="${coachPrefs.rest === s}">${s < 120 ? s + " s" : s / 60 + " min"}</button>`).join("")}
      <label class="wm-tog"><input type="checkbox" id="wm-sound" ${coachPrefs.sound === false ? "" : "checked"}> ${esc(L("Zvuk", "Sound"))}</label>
      <label class="wm-tog"><input type="checkbox" id="wm-voice" ${coachPrefs.voice ? "checked" : ""}> ${esc(L("Glas", "Voice"))}</label>
    </div>
    <p class="small muted wm-note">${esc(L("Tijekom treninga ekran ostaje upaljen.", "The screen stays on while you train."))}</p>
  </div>`;
}
function wireWorkoutBar() {
  const wm = document.getElementById("wm"); if (!wm) return;
  wm.addEventListener("click", (e) => {
    const b = e.target.closest("[data-wm],[data-wm-set]"); if (!b) return;
    if (b.dataset.wm === "stop") Workout.stop();
    else if (b.dataset.wm) Workout.add(+b.dataset.wm);
    else {
      const s = +b.dataset.wmSet; setCoachPref("rest", coachPrefs.rest === s ? null : s);
      wm.querySelectorAll("[data-wm-set]").forEach((x) => x.setAttribute("aria-pressed", String(coachPrefs.rest === +x.dataset.wmSet)));
      if (coachPrefs.rest) Workout.start(s);
    }
  });
  document.getElementById("wm-sound").onchange = (e) => { setCoachPref("sound", e.target.checked); Workout.unlockAudio(); };
  document.getElementById("wm-voice").onchange = (e) => { setCoachPref("voice", e.target.checked); if (e.target.checked) Workout.say("Glas uključen", "Voice on"); };
  Workout.render(0);
}
function leaveWorkout() { Workout.stop(); Workout.keepAwake(false); }

/* ---------- Plate math ---------- */
const PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];
const PLATE_CLASS = { 25: "p25", 20: "p20", 15: "p15", 10: "p10", 5: "p5", 2.5: "p2", 1.25: "p1" };
function platesFor(total, bar = 20) {
  let side = Math.round(((total - bar) / 2) * 100) / 100; const out = [];
  if (side < 0) return { out, rest: 0, under: true };
  for (const p of PLATES) while (side >= p - 1e-9) { out.push(p); side = Math.round((side - p) * 100) / 100; }
  return { out, rest: side, under: false };
}
function openPlates(load) {
  const dlg = document.createElement("dialog"); dlg.className = "plates-dlg";
  const render = (kg, bar) => {
    const { out, rest, under } = platesFor(kg, bar);
    return `<div class="bar-viz" aria-hidden="true"><span class="sleeve"></span>${out.map((p) => `<span class="plate ${PLATE_CLASS[p]}">${p}</span>`).join("")}<span class="collar"></span></div>
      <p class="plates-txt">${under ? esc(L("Manje od šipke.", "Less than the bar.")) : out.length ? `${esc(L("Po strani", "Each side"))}: <b>${out.join(" + ")}</b> kg${rest ? ` <span class="muted">(+${rest} kg ${esc(L("nedostaje", "missing"))})</span>` : ""}` : esc(L("Samo šipka.", "Just the bar."))}</p>`;
  };
  dlg.innerHTML = `<form method="dialog" class="plates-card">
    <button class="x" value="x" aria-label="${esc(L("Zatvori", "Close"))}">✕</button>
    <h3>${esc(L("Utezi na šipci", "Plates on the bar"))}</h3>
    <div class="form-grid"><div><label for="pl-kg">${esc(t("load"))} (kg)</label><input id="pl-kg" inputmode="decimal" value="${esc(load || "")}"></div>
      <div><label for="pl-bar">${esc(L("Šipka", "Bar"))}</label><select id="pl-bar"><option value="20">20 kg</option><option value="15">15 kg</option><option value="10">10 kg</option></select></div></div>
    <div id="pl-out">${render(+load || 20, 20)}</div></form>`;
  document.body.append(dlg);
  const upd = () => (dlg.querySelector("#pl-out").innerHTML = render(parseFloat(dlg.querySelector("#pl-kg").value.replace(",", ".")) || 0, +dlg.querySelector("#pl-bar").value));
  dlg.querySelector("#pl-kg").oninput = upd; dlg.querySelector("#pl-bar").onchange = upd;
  dlg.addEventListener("close", () => dlg.remove());
  dlg.showModal();
}

/* ---------- PR detection + celebration ---------- */
// Compares this session's best e1RM per exercise (sets of ≤10 reps) with every earlier day's best.
async function findPRs(rows, performedOn, exercises) {
  const best = {};
  rows.forEach((r) => { if (r.reps > 10) return; const v = e1rm(r.load_kg, r.reps); if (!best[r.exercise_id] || v > best[r.exercise_id].v) best[r.exercise_id] = { v, load: r.load_kg, reps: r.reps }; });
  const ids = Object.keys(best); if (!ids.length) return [];
  const { data } = await sb.from("workout_sets").select("exercise_id, load_kg, reps, workouts!inner(performed_on, user_id)")
    .in("exercise_id", ids).lte("reps", 10).lt("workouts.performed_on", performedOn).eq("workouts.user_id", state.session.user.id);
  const prev = {};
  (data || []).forEach((r) => { const v = e1rm(+r.load_kg, r.reps); prev[r.exercise_id] = Math.max(prev[r.exercise_id] || 0, v); });
  return ids.filter((id) => prev[id] && best[id].v > prev[id] + 0.05)
    .map((id) => ({ ex: exercises.find((e) => e.id === id), ...best[id], gain: best[id].v - prev[id] }));
}

function confetti(ms = 2400) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const c = document.createElement("canvas"); c.className = "confetti"; document.body.append(c);
  const dpr = Math.min(devicePixelRatio || 1, 2), W = (c.width = innerWidth * dpr), H = (c.height = innerHeight * dpr);
  const ctx = c.getContext("2d"), cols = ["#ffd566", "#ffae1a", "#f4f5f7", "#2fbf5b", "#d98600"];
  const P = Array.from({ length: 140 }, () => ({ x: W / 2 + (Math.random() - 0.5) * W * 0.3, y: H * 0.35, vx: (Math.random() - 0.5) * 14 * dpr,
    vy: (-Math.random() * 16 - 6) * dpr, r: (4 + Math.random() * 5) * dpr, a: Math.random() * 6.28, va: (Math.random() - 0.5) * 0.3, c: cols[(Math.random() * cols.length) | 0] }));
  const t0 = performance.now();
  (function frame(now) {
    ctx.clearRect(0, 0, W, H);
    for (const p of P) { p.vy += 0.45 * dpr; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.a += p.va;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.globalAlpha = Math.max(0, 1 - (now - t0) / ms); ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); ctx.restore(); }
    if (now - t0 < ms) requestAnimationFrame(frame); else c.remove();
  })(t0);
}

// Share card rendered on the phone (no server): 1080×1350 JPEG.
async function prCardBlob(prs) {
  const c = document.createElement("canvas"); c.width = 1080; c.height = 1350;
  const x = c.getContext("2d");
  const g = x.createLinearGradient(0, 0, 1080, 1350); g.addColorStop(0, "#15171d"); g.addColorStop(1, "#0a0c11"); x.fillStyle = g; x.fillRect(0, 0, 1080, 1350);
  const r = x.createRadialGradient(200, 150, 0, 200, 150, 900); r.addColorStop(0, "rgba(255,174,26,.28)"); r.addColorStop(1, "rgba(255,174,26,0)"); x.fillStyle = r; x.fillRect(0, 0, 1080, 1350);
  try { await document.fonts.load("800 80px Sora"); } catch (e) {}
  x.fillStyle = "#ffae1a"; x.font = "italic 800 64px Sora, sans-serif"; x.fillText("SAIYAN", 90, 150);
  x.fillStyle = "#f4f5f7"; x.font = "700 26px Sora, sans-serif"; x.fillText("FITT · DUBROVNIK", 90, 195);
  x.font = "800 150px Sora, sans-serif"; x.fillStyle = "#ffd566"; x.fillText(L("NOVI PR", "NEW PR"), 84, 420);
  let y = 560;
  for (const p of prs.slice(0, 3)) {
    x.fillStyle = "#f4f5f7"; x.font = "700 58px Sora, sans-serif"; x.fillText(nameOf(p.ex), 90, y);
    x.fillStyle = "rgba(244,245,247,.72)"; x.font = "500 44px Inter, sans-serif";
    x.fillText(`${p.load} kg × ${p.reps}  ·  e1RM ${Math.round(p.v * 10) / 10} kg`, 90, y + 64);
    y += 190;
  }
  x.fillStyle = "rgba(244,245,247,.55)"; x.font = "500 34px Inter, sans-serif"; x.fillText("@saiyan_gym_fitt", 90, 1260);
  return new Promise((res) => c.toBlob(res, "image/jpeg", 0.92));
}

function celebratePRs(prs) {
  confetti(); buzz([60, 40, 60, 40, 180]);
  Workout.beep(784, 120); Workout.beep(988, 120, 0.13); Workout.beep(1319, 320, 0.26);
  const dlg = document.createElement("dialog"); dlg.className = "pr-dlg";
  dlg.innerHTML = `<div class="pr-card">
    <span class="pr-kicker">${esc(L("Osobni rekord", "Personal record"))}</span>
    <h2>${esc(prs.length > 1 ? L(`${prs.length} nova rekorda!`, `${prs.length} new PRs!`) : L("Novi rekord!", "New PR!"))}</h2>
    ${prs.map((p) => `<div class="pr-row"><b>${esc(nameOf(p.ex))}</b><span>${fmtKg(p.load)} × ${p.reps}</span>
      <em>e1RM ${fmtKg(Math.round(p.v * 10) / 10)} · +${Math.round(p.gain * 10) / 10}</em></div>`).join("")}
    <div class="pr-actions">
      <button class="btn btn-primary" id="pr-bell" type="button">🔔 ${esc(L("Zvoni zvonom", "Ring the bell"))}</button>
      <button class="btn btn-ghost" id="pr-share" type="button">${esc(L("Podijeli karticu", "Share card"))}</button>
      <button class="btn btn-ghost" id="pr-done" type="button">${esc(L("Gotovo", "Done"))}</button>
    </div>
    <p class="small muted">${esc(L("Zvono pokazuje tvoje ime i dizanje članovima 14 dana.", "The bell shows your first name and lift to members for 14 days."))}</p>
  </div>`;
  document.body.append(dlg);
  const close = () => { dlg.close(); dlg.remove(); location.hash = "#/app"; };
  dlg.querySelector("#pr-done").onclick = close;
  dlg.addEventListener("cancel", (e) => { e.preventDefault(); close(); });
  dlg.querySelector("#pr-bell").onclick = async (e) => {
    e.target.disabled = true;
    const top = prs[0];
    const { error } = await sb.from("pr_bells").insert({ exercise_id: top.ex.id, load_kg: top.load, reps: top.reps });
    if (error) { e.target.disabled = false; return toast(L("Zvono sada ne radi.", "The bell isn't working right now.")); }
    e.target.textContent = "🔔 " + L("Odzvonjeno!", "Rung!"); confetti(1400);
  };
  dlg.querySelector("#pr-share").onclick = async () => {
    const f = new File([await prCardBlob(prs)], "saiyan-pr.jpg", { type: "image/jpeg" });
    if (navigator.canShare && navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f], text: "#saiyangym" }); } catch (e) {} }
    else { const a = document.createElement("a"); a.href = URL.createObjectURL(f); a.download = f.name; a.click(); }
  };
  dlg.showModal();
}

/* ---------- Dashboard: onboarding, bells, install coach ---------- */
async function onboardingHtml() {
  const { data } = await sb.rpc("my_onboarding");
  const o = (data || [])[0]; if (!o || !o.show) return "";
  const step = (done, txt) => `<li class="${done ? "done" : ""}"><span class="tick" aria-hidden="true">${done ? "✓" : ""}</span>${esc(txt)}</li>`;
  const left = Math.max(0, 28 - o.days_in);
  return `<section class="card onboard reveal" style="animation-delay:120ms" aria-labelledby="ob-h">
    <span class="tab-tl">${esc(L("start", "start"))}</span>
    <h3 id="ob-h">${esc(L("Prva 4 u 4", "First 4 in 4"))} <span class="count-badge">${Math.min(o.checkins, 4)}/4</span></h3>
    <p class="small muted">${esc(L(`Četiri dolaska u prva četiri tjedna je najbolji početak. Još ${left} dana.`, `Four visits in your first four weeks is the best start there is. ${left} days to go.`))}</p>
    <div class="ob-dots" aria-hidden="true">${[1, 2, 3, 4].map((i) => `<i class="${o.checkins >= i ? "on" : ""}"></i>`).join("")}</div>
    <ul class="ob-list">
      ${step(o.checkins >= 4, L(`Dođi 4 puta (${Math.min(o.checkins, 4)}/4)`, `Come in 4 times (${Math.min(o.checkins, 4)}/4)`))}
      ${step(o.workouts >= 1, L("Upiši prvi trening u aplikaciju", "Log your first workout in the app"))}
      ${step(o.coach_intro, L("Upoznaj Zrinka — kratki uvodni razgovor", "Meet Zrinko — a short intro chat"))}
    </ul>
    ${o.coach_intro ? "" : `<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="${whatsappLink(L("Bok Zrinko, novi/a sam član/ica. Kad mogu doći na uvodni razgovor?", "Hi Zrinko, I'm a new member. When can I come for an intro chat?"))}">WhatsApp Zrinko</a>`}
  </section>`;
}
async function bellsHtml() {
  const { data } = await sb.from("pr_bells").select("first_name, load_kg, reps, created_at, exercises(name_hr,name_en)").order("created_at", { ascending: false }).limit(6);
  if (!data || !data.length) return "";
  return `<div class="bells" aria-label="${esc(L("Zvono rekorda", "PR bell"))}"><span class="bells-k">🔔 ${esc(L("Zvono rekorda", "PR bell"))}</span>
    ${data.map((b) => `<span class="bell"><b>${esc(b.first_name || "—")}</b> ${esc(b.exercises ? nameOf(b.exercises) : "")} ${fmtKg(b.load_kg)} × ${b.reps}</span>`).join("")}</div>`;
}

// iPhone has no install prompt; show how once. Android uses the browser's prompt.
let deferredInstall = null;
addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredInstall = e; document.getElementById("inst-go")?.removeAttribute("hidden"); });
function installCoachHtml() {
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  let dismissed = false; try { dismissed = localStorage.getItem("sg.install.x") === "1"; } catch (e) {}
  const mobile = /iphone|ipad|android/i.test(navigator.userAgent);
  if (standalone || dismissed || !mobile) return "";
  const ios = /iphone|ipad/i.test(navigator.userAgent);
  return `<aside class="install reveal" id="install" aria-label="${esc(L("Instaliraj aplikaciju", "Install the app"))}">
    <img src="icons/icon.svg" alt="" width="44" height="44">
    <div><b>${esc(L("Stavi Saiyan na početni zaslon", "Put Saiyan on your home screen"))}</b>
      <span>${esc(ios ? L("Dodirni Dijeli, zatim „Dodaj na početni zaslon”. Tako rade obavijesti i ekran ostaje upaljen na treningu.",
        "Tap Share, then “Add to Home Screen”. That turns on notifications and keeps the screen on while you train.")
        : L("Instaliraj za brži pristup, obavijesti i ekran koji ostaje upaljen na treningu.", "Install for quick access, notifications and a screen that stays on while you train."))}</span></div>
    ${ios ? "" : `<button class="btn btn-primary btn-sm" id="inst-go" type="button" ${deferredInstall ? "" : "hidden"}>${esc(L("Instaliraj", "Install"))}</button>`}
    <button class="icon-btn" id="inst-x" type="button" aria-label="${esc(L("Zatvori", "Close"))}">✕</button>
  </aside>`;
}
function wireInstallCoach() {
  document.getElementById("inst-x")?.addEventListener("click", () => { try { localStorage.setItem("sg.install.x", "1"); } catch (e) {} document.getElementById("install")?.remove(); });
  document.getElementById("inst-go")?.addEventListener("click", async () => { if (!deferredInstall) return; deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null; document.getElementById("install")?.remove(); });
}

/* ---------- Front desk: greet today ---------- */
async function greetHtml() {
  const { data, error } = await sb.rpc("greet_today");
  if (error) return "";
  const why = (r) => ({
    new_7d: L("1. tjedan člana — pitaj kako ide", "1 week in — ask how it's going"),
    new_14d: L("2 tjedna — pohvali dolaske", "2 weeks in — praise the visits"),
    new_30d: L("Prvi mjesec — dogovori sljedeći cilj", "First month — agree the next goal"),
    new_member: L("Novi član — uvodni razgovor", "New member — intro chat"),
    drifting: L(`Nije bio/la ${r.detail} d — samo pozdravi`, `Away ${r.detail} d — just say hi`),
    pr: L(`Novi rekord: ${r.detail} — čestitaj!`, `New PR: ${r.detail} — congratulate!`),
  }[r.reason] || r.reason);
  const rows = (data || []).sort((a, b) => a.priority - b.priority).slice(0, 8);
  return `<section class="card span-12 greet-card" aria-labelledby="gt-h" data-tab="${esc(L("danas", "today"))}">
    <h2 id="gt-h">${esc(L("Pozdravi danas", "Greet today"))} <span class="count-badge">${rows.length}</span></h2>
    <p class="muted small">${esc(L("Članovi s kojima razgovor osoblja najviše znači. Samo prijedlog — ništa se ne šalje automatski.",
      "Members for whom a word from staff matters most. Advice only — nothing is sent automatically."))}</p>
    ${rows.map((r) => `<div class="risk greet-row"><div><strong>${esc(r.display_name || "—")}</strong><br><span class="small muted">${esc(why(r))}</span></div>
      <div class="greet-act">
        ${r.reason === "new_member" ? `<button class="btn btn-ghost btn-sm" data-touch="${r.user_id}" data-kind="intro" type="button">${esc(L("Uvod obavljen", "Intro done"))}</button>` : ""}
        <button class="btn btn-primary btn-sm" data-touch="${r.user_id}" data-kind="greet" type="button">${esc(L("Razgovarali ✓", "Talked ✓"))}</button></div></div>`).join("")
      || `<p class="small muted">${esc(L("Danas nema nikoga na popisu. 👊", "Nobody on the list today. 👊"))}</p>`}
  </section>`;
}
function wireGreet(reload) {
  document.querySelectorAll("[data-touch]").forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    const { error } = await sb.from("staff_touches").insert({ member_id: b.dataset.touch, kind: b.dataset.kind });
    if (error) { b.disabled = false; return fail(error); }
    toast(L("Zabilježeno.", "Noted.")); reload();
  }));
}
