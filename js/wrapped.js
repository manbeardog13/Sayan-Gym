// Saiyan Wrapped: a member's training year in one screen and one shareable picture.
// Everything is computed on the phone from the member's own rows (workouts, sets, check-ins),
// so nobody else's data is read and nothing new is stored. The dashboard card shows from
// 1 December to 15 January; #/wrapped works any time ("your year so far").

const WRAPPED_MIN_DAYS = 3;
const BUS_T = 12, CAR_T = 1.3; // a city bus is about 12 tonnes, a small car about 1.3

const zDay = (ts) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zagreb", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ts));
const zHour = (ts) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Zagreb", hour: "2-digit", hourCycle: "h23" }).format(new Date(ts)));

// Which year the dashboard card is about, or null outside the season (1 Dec – 15 Jan, Zagreb dates).
function wrappedSeasonYear(now = new Date()) {
  const [y, m, d] = zDay(now).split("-").map(Number);
  if (m === 12) return y;
  if (m === 1 && d <= 15) return y - 1;
  return null;
}

// "About 3 city buses" / "about 5 small cars": a picture of the tonnes lifted.
function tonnesPicture(kg) {
  const t = kg / 1000;
  if (t >= BUS_T) { const n = Math.round(t / BUS_T); return { n, hr: `${n} gradskih autobusa`, en: n === 1 ? "1 city bus" : `${n} city buses` }; }
  const n = Math.max(1, Math.round(t / CAR_T));
  return { n, hr: n === 1 ? "1 mali automobil" : `${n} malih automobila`, en: n === 1 ? "1 small car" : `${n} small cars` };
}

const mode = (arr) => {
  const c = new Map(); let best = null, bestN = 0;
  for (const v of arr) { const n = (c.get(v) || 0) + 1; c.set(v, n); if (n > bestN || (n === bestN && v < best)) { best = v; bestN = n; } }
  return best;
};

// workouts: [{id, performed_on}], sets: [{workout_id, exercise_id, load_kg, reps}], checkins: [{checked_in_at}]
function wrappedStats(year, workouts, sets, checkins, exercises) {
  const inYear = (d) => d.startsWith(`${year}-`);
  const ws = (workouts || []).filter((w) => inYear(w.performed_on));
  const wIds = new Set(ws.map((w) => w.id));
  const ss = (sets || []).filter((s) => wIds.has(s.workout_id) && s.load_kg > 0 && s.reps > 0);
  const cs = (checkins || []).filter((c) => inYear(zDay(c.checked_in_at)));
  const days = [...new Set([...ws.map((w) => w.performed_on), ...cs.map((c) => zDay(c.checked_in_at))])].sort();
  const volumeKg = Math.round(ss.reduce((n, s) => n + Number(s.load_kg) * s.reps, 0));
  const exName = Object.fromEntries((exercises || []).map((e) => [e.id, e]));
  const top = ss.length ? mode(ss.map((s) => s.exercise_id)) : null;
  const heaviest = ss.reduce((b, s) => (!b || Number(s.load_kg) > Number(b.load_kg) ? s : b), null);
  const months = days.map((d) => Number(d.slice(5, 7)));
  return {
    year, days: days.length, visits: cs.length, workouts: ws.length, sets: ss.length, volumeKg,
    firstDay: days[0] || null,
    topExercise: top ? { ex: exName[top] || null, sets: ss.filter((s) => s.exercise_id === top).length } : null,
    heaviest: heaviest ? { ex: exName[heaviest.exercise_id] || null, load: Number(heaviest.load_kg), reps: heaviest.reps } : null,
    favHour: cs.length ? mode(cs.map((c) => zHour(c.checked_in_at))) : null,
    busiestMonth: months.length ? mode(months) : null,
  };
}

const monthName = (m) => new Date(Date.UTC(2026, m - 1, 15)).toLocaleDateString(LANG === "hr" ? "hr-HR" : "en-GB", { month: "long", timeZone: "UTC" });

function wrappedTiles(s) {
  const tiles = [
    [L("dana treninga", "days trained"), String(s.days)],
  ];
  if (s.volumeKg > 0) {
    const p = tonnesPicture(s.volumeKg);
    tiles.push([L("podignuto", "lifted"), `${(s.volumeKg / 1000).toLocaleString(LANG === "hr" ? "hr-HR" : "en-GB", { maximumFractionDigits: 1 })} t`, L(`otprilike ${p.hr}`, `about ${p.en}`)]);
  }
  if (s.heaviest?.ex) tiles.push([L("najteže dizanje", "heaviest lift"), `${fmtKg(s.heaviest.load)} × ${s.heaviest.reps}`, nameOf(s.heaviest.ex)]);
  if (s.topExercise?.ex) tiles.push([L("omiljena vježba", "favourite exercise"), nameOf(s.topExercise.ex), L(`${s.topExercise.sets} serija`, `${s.topExercise.sets} sets`)]);
  if (s.favHour != null) tiles.push([L("omiljeno vrijeme", "favourite time"), `${String(s.favHour).padStart(2, "0")}:00`]);
  if (s.busiestMonth) tiles.push([L("najjači mjesec", "strongest month"), monthName(s.busiestMonth)]);
  return tiles;
}

async function loadWrapped(year) {
  const uid = state.session.user.id;
  const [w, c, ex] = await Promise.all([
    sb.from("workouts").select("id, performed_on").eq("user_id", uid).gte("performed_on", `${year}-01-01`).lte("performed_on", `${year}-12-31`),
    sb.from("check_ins").select("checked_in_at").eq("user_id", uid).gte("checked_in_at", `${year - 1}-12-31T00:00:00Z`).lt("checked_in_at", `${year + 1}-01-02T00:00:00Z`),
    loadExercises(),
  ]);
  if (w.error) throw w.error;
  const ids = (w.data || []).map((x) => x.id);
  const s = ids.length ? await sb.from("workout_sets").select("workout_id, exercise_id, load_kg, reps").in("workout_id", ids) : { data: [] };
  if (s.error) throw s.error;
  return wrappedStats(year, w.data, s.data, c.data, ex);
}

// Dashboard card, only in season and only with enough training to show.
async function wrappedTeaserHtml() {
  const year = wrappedSeasonYear();
  if (!year) return "";
  const s = await loadWrapped(year);
  if (s.days < WRAPPED_MIN_DAYS) return "";
  return `<a class="card wrapped-teaser reveal" href="#/wrapped?year=${year}">
    <span class="tab-tl">wrapped</span>
    <h3>Saiyan Wrapped ${year}</h3>
    <p class="small">${esc(L(`${s.days} dana treninga. Pogledaj svoju godinu →`, `${s.days} days trained. See your year →`))}</p></a>`;
}

async function viewWrapped() {
  $view.innerHTML = `<div class="loading">…</div>`;
  const q = new URLSearchParams(location.hash.split("?")[1] || "");
  const nowYear = Number(zDay(new Date()).slice(0, 4));
  const year = Math.min(nowYear, Math.max(2020, Number(q.get("year")) || wrappedSeasonYear() || nowYear));
  let s;
  try { s = await loadWrapped(year); } catch (e) { return fail(e); }
  const soFar = year === nowYear && wrappedSeasonYear() !== year;
  const enough = s.days >= WRAPPED_MIN_DAYS;
  $view.innerHTML = `<div class="page wrapped">
    <div class="phead"><div><h1>Saiyan Wrapped ${year}</h1>
      <p class="muted">${esc(soFar ? L("Tvoja godina do sada.", "Your year so far.") : L("Tvoja godina u teretani.", "Your year in the gym."))}</p></div></div>
    ${enough ? `<div class="wrapped-grid">${wrappedTiles(s).map(([k, v, sub]) => `<section class="card wrapped-tile">
        <span class="small muted">${esc(k)}</span><b>${esc(v)}</b>${sub ? `<span class="small">${esc(sub)}</span>` : ""}</section>`).join("")}</div>
      <label class="toggle-row small"><input type="checkbox" id="wr-name"> <span>${esc(L("Prikaži moje ime na slici", "Show my first name on the picture"))}</span></label>
      <button class="btn btn-primary" id="wr-share" type="button">${esc(L("Podijeli sliku", "Share picture"))}</button>
      <p class="small muted">${esc(L("Izračunato na tvom mobitelu iz tvojih treninga i dolazaka. Ništa se ne šalje.", "Worked out on your phone from your own workouts and visits. Nothing is uploaded."))}</p>`
    : `<section class="card"><p>${esc(L(`Još premalo treninga za ${year}. Nakon ${WRAPPED_MIN_DAYS} dana treninga ovdje se pojavi tvoja godina.`, `Not enough training in ${year} yet. After ${WRAPPED_MIN_DAYS} training days your year shows up here.`))}</p></section>`}
  </div>`;
  const share = document.getElementById("wr-share");
  if (share) share.onclick = async () => {
    share.disabled = true;
    try {
      const name = document.getElementById("wr-name").checked ? (state.profile?.display_name || "").split(" ")[0] : "";
      const f = new File([await wrappedCardBlob(s, name)], `saiyan-wrapped-${year}.jpg`, { type: "image/jpeg" });
      if (navigator.canShare && navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f], text: "#saiyangym #saiyanwrapped" }); } catch (e) {} }
      else { const a = document.createElement("a"); a.href = URL.createObjectURL(f); a.download = f.name; a.click(); }
    } finally { share.disabled = false; }
  };
}

// 1080×1350 picture drawn on the phone.
async function wrappedCardBlob(s, firstName) {
  const W = 1080, H = 1350, c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d");
  const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, "#15171d"); g.addColorStop(1, "#0a0c11"); x.fillStyle = g; x.fillRect(0, 0, W, H);
  const r = x.createRadialGradient(200, 160, 0, 200, 160, 950); r.addColorStop(0, "rgba(255,174,26,.28)"); r.addColorStop(1, "rgba(255,174,26,0)"); x.fillStyle = r; x.fillRect(0, 0, W, H);
  try { await document.fonts.load("800 80px Sora"); } catch (e) {}
  x.fillStyle = "#ffae1a"; x.font = "italic 800 96px Sora, sans-serif"; x.fillText("SAIYAN", 84, 170);
  x.fillStyle = "#f4f5f7"; x.font = "700 44px Sora, sans-serif"; x.fillText(`WRAPPED ${s.year}`, 90, 235);
  let y = 380;
  for (const [k, v, sub] of wrappedTiles(s).slice(0, 4)) {
    x.fillStyle = "rgba(244,245,247,.62)"; x.font = "600 30px Inter, sans-serif"; x.fillText(k.toUpperCase(), 90, y);
    x.fillStyle = "#ffd566"; x.font = "800 70px Sora, sans-serif"; x.fillText(v, 90, y + 76);
    if (sub) { x.fillStyle = "rgba(244,245,247,.78)"; x.font = "500 32px Inter, sans-serif"; x.fillText(sub, 90, y + 120); }
    y += sub ? 180 : 150;
  }
  if (firstName) { x.fillStyle = "#f4f5f7"; x.font = "700 44px Sora, sans-serif"; x.fillText(firstName, 90, 1230); }
  x.fillStyle = "rgba(244,245,247,.55)"; x.font = "500 34px Inter, sans-serif"; x.fillText("Saiyan Gym FITT · Dubrovnik", 90, 1285);
  return new Promise((res) => c.toBlob(res, "image/jpeg", 0.92));
}
