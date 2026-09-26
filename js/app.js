/* Saiyan Gym FITT — single-page app (no build step, same pattern as ASC). */
const cfg = window.SAIYAN_CONFIG;
const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
  auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
});

const state = { session: null, profile: null, exercises: null, quotes: null };
const $view = document.getElementById("view");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nameOf = (row) => (LANG === "hr" ? row.name_hr : row.name_en);
const MUSCLE = { legs: ["noge", "legs"], back: ["leđa", "back"], chest: ["prsa", "chest"], shoulders: ["ramena", "shoulders"],
  hamstrings: ["stražnja loža", "hamstrings"], glutes: ["gluteusi", "glutes"], arms: ["ruke", "arms"] };
const muscle = (g) => (MUSCLE[g] ? MUSCLE[g][LANG === "hr" ? 0 : 1] : g);
const fmtKg = (n) => `${Number(n).toLocaleString(LANG === "hr" ? "hr-HR" : "en-GB", { maximumFractionDigits: 1 })} kg`;
const fmtDate = (d) => new Date(d).toLocaleDateString(LANG === "hr" ? "hr-HR" : "en-GB", { day: "numeric", month: "short" });

function toast(msg, ms = 2600) {
  const el = document.getElementById("toast");
  el.textContent = msg; el.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (el.hidden = true), ms);
}
function fail(e) { console.error(e); toast(t("error") + (e?.message || e), 4000); }

/* ---------- data helpers ---------- */
async function loadExercises() {
  if (state.exercises) return state.exercises;
  const { data, error } = await sb.from("exercises").select("*").order("muscle_group");
  if (error) throw error;
  return (state.exercises = data);
}
async function loadQuotes() {
  if (state.quotes) return state.quotes;
  const { data } = await sb.from("motivation").select("text_hr,text_en");
  return (state.quotes = data || []);
}
const quoteText = (q) => (LANG === "hr" ? q.text_hr : q.text_en);
function dailyQuote(quotes) {
  if (!quotes.length) return "";
  const day = Math.floor(Date.now() / 86400000);
  return quoteText(quotes[day % quotes.length]);
}
async function loadProfile() {
  if (!state.session) return (state.profile = null);
  const { data } = await sb.from("profiles").select("*").eq("id", state.session.user.id).single();
  state.profile = data;
  // Browser language wins until the member picks one; keep the profile in sync.
  if (data && data.locale !== LANG) sb.from("profiles").update({ locale: LANG }).eq("id", data.id).then(() => {});
  return data;
}
const isStaff = () => ["coach", "admin"].includes(state.profile?.role);
const isAdmin = () => state.profile?.role === "admin";
async function loadSettings() {
  const { data } = await sb.from("site_settings").select("key,value");
  return Object.fromEntries((data || []).map((r) => [r.key, r.value]));
}
async function listGallery() {
  const { data, error } = await sb.storage.from("gallery").list("", { limit: 60, sortBy: { column: "created_at", order: "desc" } });
  if (error) return [];
  return (data || []).filter((f) => f.id && /\.(jpe?g|png|webp)$/i.test(f.name))
    .map((f) => ({ name: f.name, url: sb.storage.from("gallery").getPublicUrl(f.name).data.publicUrl }));
}
function isOpenNow() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Zagreb" }));
  const h = now.getHours() + now.getMinutes() / 60;
  return now.getDay() === 0 ? h >= 6 && h < 20 : h >= 6 && h < 22;
}
function whatsappLink(text) {
  return `https://wa.me/${cfg.gym.phone.replace("+", "")}?text=${encodeURIComponent(text)}`;
}


const L = (hr, en) => (LANG === "hr" ? hr : en);
const $shell = document.getElementById("shell");
const $auth = document.getElementById("auth-root");

/* ---------- ASC motion helpers: count-up numbers + growing bars ---------- */
function animateIn(root = document) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  root.querySelectorAll("[data-count]").forEach((el) => {
    const end = Number(el.dataset.count) || 0;
    if (reduce || end === 0) { el.textContent = end.toLocaleString(LANG === "hr" ? "hr-HR" : "en-GB"); return; }
    const t0 = performance.now(), dur = 900;
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur), v = Math.round(end * (1 - Math.pow(1 - k, 3)));
      el.textContent = v.toLocaleString(LANG === "hr" ? "hr-HR" : "en-GB");
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  requestAnimationFrame(() => root.querySelectorAll("[data-w]").forEach((i) => (i.style.width = Math.max(0, Math.min(100, +i.dataset.w)) + "%")));
}
function setDevice() {
  const w = innerWidth, touch = matchMedia("(hover: none)").matches;
  document.documentElement.dataset.device = w < 700 ? "mobile" : w < 1021 && touch ? "tablet" : "desktop";
}
setDevice(); addEventListener("resize", setDevice);
document.documentElement.lang = LANG;

/* notched agent card: measure the label so the mask cut fits it exactly */
function fitNotches(root = document) {
  root.querySelectorAll(".agent-shell").forEach((sh) => {
    const tab = sh.querySelector(".notch-tab"), card = sh.querySelector(".agent-card");
    if (!tab || !card) return;
    card.style.setProperty("--tw", tab.offsetWidth + "px");
    card.style.setProperty("--th", tab.offsetHeight + "px");
  });
}
addEventListener("resize", () => fitNotches());

/* ---------- theme (ASC twin themes) ---------- */
function toggleTheme(e) {
  const dark = document.documentElement.classList.toggle("dark");
  try { localStorage.setItem("sg.theme", dark ? "dark" : "light"); } catch (err) {}
  syncThemeColor();
  syncThemeSwitches();
  const b = e?.currentTarget;
  if (b && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    b.classList.add("kick");
    const burst = document.createElement("span");
    burst.className = "ki-burst" + (dark ? " cyan" : " gold");
    const r = b.getBoundingClientRect();
    burst.style.left = (r.left + r.width / 2) + "px";
    burst.style.top = (r.top + r.height / 2) + "px";
    document.body.appendChild(burst);
    setTimeout(() => { b.classList.remove("kick"); burst.remove(); }, 700);
  }
}
function syncThemeColor() {
  document.querySelector('meta[name="theme-color"]').content = document.documentElement.classList.contains('dark')
    ? (innerWidth <= 700 ? '#14161c' : '#0a0c11') : '#e9ebee';
}
syncThemeColor();
addEventListener('resize', syncThemeColor);
function syncThemeSwitches() {
  const dark = document.documentElement.classList.contains("dark");
  document.querySelectorAll(".auth-theme, [data-theme]").forEach((b) => b.setAttribute("aria-checked", String(dark)));
}
syncThemeSwitches();
document.getElementById("mode").onclick = toggleTheme;

/* ---------- icons (ASC stroke set) ---------- */
const ICO = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4.2 10.6L12 4l7.8 6.6"/><path d="M5.8 9.4V19a2 2 0 002 2h8.4a2 2 0 002-2V9.4"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5.4v13.2M5.4 12h13.2"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19h16"/><path d="M6 15l4-4 3 3 5-6"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="7.6" r="3.4"/><path d="M5 20a7 7 0 0114 0"/></svg>',
  scan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8.2V6.4A2.4 2.4 0 016.4 4h1.8M15.8 4h1.8A2.4 2.4 0 0120 6.4v1.8M20 15.8v1.8a2.4 2.4 0 01-2.4 2.4h-1.8M8.2 20H6.4A2.4 2.4 0 014 17.6v-1.8"/><path d="M7.2 12h9.6"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 00-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 00-2-1.2L14 3h-4l-.5 2.6a7 7 0 00-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 005 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 002 1.2L10 21h4l.5-2.6a7 7 0 002-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z"/></svg>',
  globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.7 5.4 3.7 8.5s-1.2 5.9-3.7 8.5c-2.5-2.6-3.7-5.4-3.7-8.5s1.2-5.9 3.7-8.5z"/></svg>',
  out: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4H6a2 2 0 00-2 2v12a2 2 0 002 2h3M15 8l4 4-4 4M19 12H9"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  send: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M12 6l6 6-6 6"/></svg>',
  bulb: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3z"/></svg>',
  mail: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="M4.5 7l7.5 6 7.5-6"/></svg>',
  google: '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>',
};
const WORDMARK = document.querySelector(".wordmark").outerHTML;

/* ---------- navigation: pill (public) + ASC sidebar (signed in) ---------- */
function renderNav(route) {
  const pill = [["#/site", t("nav_home")]];
  if (state.session) pill.push(["#/app", t("nav_app")]); else pill.push(["#/login", t("sign_in")]);
  document.getElementById("pill-links").innerHTML = pill
    .map(([h, l]) => `<a href="${h}" class="${route === h ? "on" : ""}">${esc(l)}</a>`).join("");
  const lb = document.getElementById("lang-btn");
  lb.textContent = LANG === "hr" ? "EN" : "HR";
  lb.setAttribute("aria-label", L("Switch to English", "Prebaci na hrvatski"));
  renderSide(route);
}
function changeLanguage() {
  setLang(LANG === "hr" ? "en" : "hr");
  if (state.session) sb.from("profiles").update({ locale: LANG }).eq("id", state.session.user.id).then(() => {});
  route();
}
document.getElementById("lang-btn").onclick = changeLanguage;

function renderSide(route) { renderDock(route); }

/* ---------- shared fragments ---------- */
const PHOTOS = [
  { src: "assets/hero.webp", hr: "Ploče", en: "Plates" },
  { src: "assets/log.webp", hr: "Mrtvo dizanje", en: "Deadlift" },
  { src: "assets/squat.webp", hr: "Čučanj", en: "Squat" },
  { src: "assets/checkin.webp", hr: "Bučice", en: "Dumbbells" },
];
function greetWord() {
  const h = new Date().getHours();
  return h < 12 ? L("Dobro jutro", "Good morning") : h < 18 ? L("Dobar dan", "Good afternoon") : L("Dobra večer", "Good evening");
}
function todayLine() {
  const d = new Date().toLocaleDateString(LANG === "hr" ? "hr-HR" : "en-GB", { weekday: "long", day: "numeric", month: "long" });
  return d.charAt(0).toUpperCase() + d.slice(1);
}
function agentCard({ tab, hooks, placeholder, chips }) {
  return `
    <div class="agent-shell slot-a reveal" style="animation-delay:230ms">
      <span class="notch-tab">${esc(tab)}</span>
      <section class="agent-card" role="group" aria-label="${esc(t("ask_title"))}">
        <div class="agent-body">
          <span class="agent-hook l1">${esc(hooks[0] || "")}</span>
          <span class="agent-hook l2" aria-hidden="true">${esc(hooks[1] || "")}</span>
          <span class="agent-hook l3" aria-hidden="true">${esc(hooks[2] || "")}</span>
          <div class="agent-reveal">
            <div class="tb-reply" id="tbReply" aria-live="polite"></div>
            <div class="text-bubble">
              <input class="tb-input" id="tbInput" type="text" autocomplete="off" maxlength="300" placeholder="${esc(placeholder)}" aria-label="${esc(t("ask_title"))}">
              <button class="tb-send" id="tbSend" type="button" aria-label="${L("Pošalji", "Send")}">${ICO.send}</button>
            </div>
            <div class="chips">
              ${chips.map((q, i) => `<button class="qchip" type="button" style="--ci:${i}" data-q="${esc(q)}">${esc(q)}</button>`).join("")}
            </div>
          </div>
        </div>
      </section>
    </div>`;
}
function wireConcierge(quotes) {
  const card = document.querySelector(".agent-card");
  if (!card) return;
  const input = document.getElementById("tbInput"), reply = document.getElementById("tbReply");
  const ask = async (q) => {
    q = (q || "").trim(); if (!q) return;
    card.classList.add("agent-live");
    reply.classList.add("on");
    reply.innerHTML = `<span class="tb-me">${esc(q)}</span><span class="tb-ans">…</span>`;
    const { data, error } = await sb.functions.invoke("concierge", { body: { question: q, lang: LANG } });
    reply.querySelector(".tb-ans").textContent = error
      ? L("Trenutno ne mogu odgovoriti — javi se na WhatsApp.", "I can't answer right now — message us on WhatsApp.")
      : data.answer;
    if (!reply.querySelector(".tb-hint")) reply.insertAdjacentHTML("beforeend", `<span class="tb-hint">${esc(t("ask_hint"))}</span>`);
    input.value = "";
  };
  document.getElementById("tbSend").onclick = () => ask(input.value);
  input.onkeydown = (e) => { if (e.key === "Enter") ask(input.value); };
  card.querySelectorAll(".qchip").forEach((c) => (c.onclick = () => ask(c.dataset.q)));
  // rotate the three hook lines through the gym's own motivational lines
  const lines = quotes.map(quoteText).filter((x) => x.toLowerCase() !== t("hero_title").toLowerCase());
  clearInterval(wireConcierge._iv);
  if (lines.length > 3 && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    let k = 3;
    wireConcierge._iv = setInterval(() => {
      const hooks = card.querySelectorAll(".agent-hook");
      if (!hooks.length || !document.body.contains(card)) return clearInterval(wireConcierge._iv);
      const el = hooks[k % 3]; el.classList.add("out");
      setTimeout(() => { el.textContent = lines[k % lines.length]; el.classList.remove("out"); el.classList.add("in");
        requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove("in"))); k++; }, 480);
    }, 3800);
  }
  fitNotches();
}
/* =========================================================
   LANDING — ASC dashboard composition, public face of the gym
   ========================================================= */
async function viewLanding() {
  const [quotes, settings, photos, plans] = await Promise.all([loadQuotes(), loadSettings(), listGallery(),
    sb.from("membership_plans").select("*").order("sort")]);
  const buyHref = settings.payment_url || whatsappLink(L("Bok! Želim dnevnu kartu za danas.", "Hi! I'd like a day pass for today."));
  const open = isOpenNow();
  // the stage already carries the headline; don't echo it in the assistant card
  const norm = (x) => x.toLowerCase().replace(/[^\p{L}]/gu, "");
  const hooks = quotes.map(quoteText).filter((x) => norm(x) !== norm(t("hero_title")));
  const realPhotos = photos.length > 0;
  const strip = await loadStreamItems(plans.data || []);
  const priceRows = (plans.data || []).filter((p) => p.is_published !== false).map((p) => `
    <div class="row"><span>${esc(nameOf(p))}<br><span class="small muted">${esc(L(p.description_hr, p.description_en) || "")}</span></span>
      <b>${p.price_eur == null ? `<span class="small muted" style="font:600 12px Inter">${esc(t("on_request"))}</span>` : `${Number(p.price_eur).toFixed(0)} €`}</b></div>`).join("");

  $view.innerHTML = `
  <section class="hero">
    <div class="stage reveal" style="animation-delay:110ms">
      <span class="photo" aria-hidden="true"></span><span class="scrim" aria-hidden="true"></span>
      <span class="k">Saiyan Gym FITT · Lapad · Dubrovnik</span>
      <h1 class="greet-line">${esc(t("hero_title"))}</h1>
      <p class="greet-sub" style="max-width:46ch;line-height:1.45">${esc(t("hero_sub"))}</p>
      <div class="hero-num">${open ? `<span id="occ">—</span><em>${esc(L("sada unutra", "inside now"))}</em>`
        : `<span>06:00</span><em>${esc(L("otvaramo", "we open"))}</em>`}</div>
      <div class="cap" id="occ-cap">${esc(open ? t("open_today") + " · " + t("hours") : t("closed_now") + " · " + t("hours"))}</div>
      <div class="space"></div>
      <div class="spills">
        <a class="spill" href="#/site?section=visit"><b data-count="700">0</b><span>m² ${esc(L("opreme", "of iron"))}</span></a>
        <a class="spill" href="#/site?section=visit"><b>300+</b><span>kg ${esc(L("na šipci", "on the bar"))}</span></a>
        <a class="spill" href="${cfg.gym.maps}" target="_blank" rel="noopener"><b>4.8</b><span>Google · 200+</span></a>
      </div>
      <span class="tab-corner">${esc(open ? L("uživo · Lapad", "live · Lapad") : "Lapad")}</span>
    </div>

    <a class="act gold top reveal" href="${esc(buyHref)}" target="_blank" rel="noopener" style="animation-delay:150ms">
      <span class="bg" style="background-image:url('assets/checkin.webp')"></span>
      <span class="go" aria-hidden="true">${ICO.arrow}</span>
      <span class="tab-tl">${esc(L("dnevna karta", "day pass"))}</span>
      <div class="body"><div class="eyebrow"><span class="led"></span>18 € · ${esc(L("ručnik", "towel"))} 3 €</div>
        <h2>${esc(settings.payment_url ? t("hero_cta") : "WhatsApp")}</h2><div class="desc">${esc(t("towel_note"))}</div></div>
    </a>

    <a class="act green bottom reveal" href="${state.session ? "#/app" : "#/login"}" style="animation-delay:190ms">
      <span class="bg" style="background-image:url('assets/log.webp')"></span>
      <span class="go" aria-hidden="true">${ICO.arrow}</span>
      <span class="tab-tl">${esc(state.session ? L("aplikacija", "app") : t("sign_in"))}</span>
      <div class="body"><div class="eyebrow"><span class="led"></span>${esc(state.session ? "Power Level" : t("sign_in"))}</div>
        <h2>${esc(t("hero_cta2"))}</h2><div class="desc">${esc(t("login_sub"))}</div></div>
    </a>

    ${agentCard({ tab: L("pitaj teretanu", "ask the gym"), hooks, placeholder: t("ask_ph"),
      chips: L(["Koliko košta dnevna karta?", "Primate li MultiSport?", "Radite li nedjeljom?", "Imate li parking?", "Koja je oprema?", "Personalni trening?"],
               ["How much is a day pass?", "Do you take MultiSport?", "Open on Sundays?", "Is there parking?", "What equipment?", "Personal training?"]) })}

    <section class="card slot-b reveal" id="prices" style="animation-delay:270ms">
      <span class="tab-tl">${esc(L("cijene", "prices"))}</span>
      <h3>${esc(t("prices_title"))}</h3>
      ${priceRows || `<p class="muted small">${esc(t("on_request"))}</p>`}
    </section>
  </section>

  <section class="trio" id="visit">
    <div class="card profile reveal" style="animation-delay:230ms">
      <span class="tab-tl">${esc(L("trener", "coach"))}</span>
      <div class="row1"><span class="pavatar">ZM</span><div><h2 class="pname">${esc(t("coach_title"))}</h2><div class="sub">${esc(L("Vlasnik · personalni trening", "Owner · personal training"))}</div></div></div>
      <p class="small muted" style="line-height:1.5">${esc(t("coach_body"))}</p>
      <div class="health">
        <a class="hstat" href="${whatsappLink(L("Bok Zrinko, zanima me personalni trening.", "Hi Zrinko, I'm interested in personal training."))}" target="_blank" rel="noopener">WhatsApp<b class="g">${esc(L("Piši", "Message"))}</b></a>
        <a class="hstat" href="${cfg.gym.instagram}" target="_blank" rel="noopener">Instagram<b>@saiyan_gym_fitt</b></a>
        <a class="hstat" href="tel:${cfg.gym.phone}">${esc(L("Telefon", "Phone"))}<b>${esc(cfg.gym.phoneDisplay)}</b></a>
      </div>
    </div>

    <div class="card reveal" id="hours" style="animation-delay:270ms">
      <span class="tab-tl">${esc(L("radno vrijeme", "hours"))}</span>
      <h3>${esc(open ? t("open_today") : t("closed_now"))} <span class="badge" style="margin-left:auto">${esc(open ? L("otvoreno", "open") : L("zatvoreno", "closed"))}</span></h3>
      <div class="row"><span>${esc(L("Ponedjeljak – subota", "Monday – Saturday"))}</span><b>06–22</b></div>
      <div class="row"><span>${esc(L("Nedjelja", "Sunday"))}</span><b>06–20</b></div>
      <div class="row"><span>MultiSport</span><b>${esc(L("vrijedi", "accepted"))}</b></div>
      <p class="quote-line" style="margin-top:12px">„${esc(dailyQuote(quotes))}”</p>
    </div>

    <div class="card dark reveal" id="contact" style="animation-delay:310ms">
      <span class="tab-tl">${esc(t("visit_title"))}</span>
      <h3>${esc(L("Lapad, Dubrovnik", "Lapad, Dubrovnik"))}</h3>
      <a class="mini" href="${cfg.gym.maps}" target="_blank" rel="noopener"><time>${esc(L("Adresa", "Address"))}</time><b>${esc(cfg.gym.address)}</b></a>
      <a class="mini" href="${whatsappLink(L("Bok!", "Hi!"))}" target="_blank" rel="noopener"><time>WhatsApp</time><b>${esc(cfg.gym.phoneDisplay)}</b></a>
      <a class="mini" href="${cfg.gym.instagram}" target="_blank" rel="noopener"><time>Instagram</time><b>@saiyan_gym_fitt</b></a>
      <a class="mini" href="${cfg.gym.maps}" target="_blank" rel="noopener"><time>Maps</time><b>${esc(L("Upute do teretane", "Directions"))}</b><span class="pl">↗</span></a>
    </div>
  </section>

  ${stream(strip)}
  <p class="foot builder">${esc(L("Platformu gradi Nero", "Built by Nero"))}</p>
  <p class="foot">© ${new Date().getFullYear()} Saiyan Gym FITT · Ćira Carića 1, Dubrovnik${realPhotos ? "" : ` · <a href="CREDITS.md" target="_blank" rel="noopener">${esc(L("Foto: Nenad Stojkovic (CC BY 2.0), U.S. Air Force", "Photos: Nenad Stojkovic (CC BY 2.0), U.S. Air Force"))}</a>`}</p>`;

  animateIn($view);
  wireConcierge(quotes);
  wireStream();

  sb.rpc("current_occupancy").then(({ data, error }) => {
    const n = document.getElementById("occ"), cap = document.getElementById("occ-cap");
    if (!n) return;
    if (error || !open) { n.textContent = open ? "—" : "0"; return; }
    n.dataset.count = data; animateIn(n.parentElement);
    cap.textContent = (data < 12 ? t("live_quiet") : t("live_busy")) + " · " + t("hours");
  });
}

/* =========================================================
   LOGIN — ASC auth card (Google-first, then e-mail link)
   ========================================================= */
async function viewLogin() {
  if (state.session) return (location.hash = "#/app");
  const quotes = await loadQuotes();
  document.body.classList.add("is-auth");
  $view.innerHTML = "";
  $auth.innerHTML = `
  <main class="auth-card">
    <div class="auth-rise" id="auth-rise"></div>
    <div class="auth-top">
      <a href="#/site" aria-label="Saiyan FITT — početna / home">${WORDMARK.replace('class="logo wordmark"', 'class="auth-logo wordmark"').replace('id="wmg"', 'id="wmg-auth"').replace("url(#wmg)", "url(#wmg-auth)")}</a>
      <a class="auth-home" href="#/site">${esc(t("nav_home"))}</a>
      <button class="auth-theme" id="theme" type="button" role="switch" aria-checked="${document.documentElement.classList.contains("dark")}" aria-label="${L("Tamna tema", "Dark theme")}"><i></i></button>
    </div>
    <h1 class="auth-title">${esc(t("sign_in"))}</h1>
    <p class="auth-sub">${esc(t("login_sub"))}</p>
    <button class="btn-google" id="g-btn" type="button">${ICO.google} ${esc(t("google"))}</button>
    <div class="auth-div">${esc(t("or_email"))}</div>
    <label class="fieldx f-email"><span class="fx-ic">${ICO.mail}</span>
      <input id="em" type="email" inputmode="email" autocomplete="email" aria-label="${esc(L('E-pošta', 'Email'))}" placeholder="${esc(t("email_ph"))}" required></label>
    <button class="btn-amber" id="ml-btn" type="button">${esc(t("send_link"))} ${ICO.arrow}</button>
    <p class="auth-msg" id="login-msg" role="status" aria-live="polite"></p>
    <p class="auth-legal">${esc(t("login_legal"))}</p>
    <p class="auth-switch" id="lq" style="transition:opacity .4s">„${esc(quotes.length ? quoteText(quotes[0]) : "")}”</p>
    <p class="auth-switch" style="font-size:14px;margin-top:6px"><button type="button" id="auth-lang">${LANG === "hr" ? "English" : "Hrvatski"}</button></p>
  </main>`;
  document.getElementById("theme").onclick = toggleTheme;
  document.getElementById("auth-lang").onclick = changeLanguage;
  restoreAuthFrame();
  let i = 0;
  clearInterval(viewLogin._iv);
  if (quotes.length > 1 && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    viewLogin._iv = setInterval(() => {
      const el = document.getElementById("lq");
      if (!el) return clearInterval(viewLogin._iv);
      el.style.opacity = 0;
      setTimeout(() => { i = (i + 1) % quotes.length; el.textContent = `„${quoteText(quotes[i])}”`; el.style.opacity = 1; }, 400);
    }, 4200);
  }
  const redirectTo = location.origin + location.pathname;
  const msg = (text, err) => { const m = document.getElementById("login-msg"); m.textContent = text; m.style.color = err ? "#c13a31" : "var(--green-ink)"; };
  document.getElementById("g-btn").onclick = async () => {
    const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    if (error) msg(error.message, true);
  };
  const send = async () => {
    const field = document.getElementById("em");
    if (!field.reportValidity()) return;
    const email = field.value.trim();
    const b = document.getElementById("ml-btn"); b.disabled = true;
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
    b.disabled = false;
    error ? msg(mailFail(error), true) : msg(t("link_sent"));
  };
  document.getElementById("ml-btn").onclick = send;
  document.getElementById("em").onkeydown = (e) => e.key === "Enter" && send();
}

function mailFail(error) {
  const m = String(error?.message || "").toLowerCase();
  if (m.includes("error sending") || m.includes("smtp") || m.includes("rate limit") || m.includes("over_email_send_rate_limit")) {
    return L(
      "Slanje e-pošte još nije uključeno. Zrinko to uključuje u Postavkama, službenim Gmailom teretane.",
      "Email sending is not switched on yet. Zrinko turns it on in Settings, with the gym's official Gmail.");
  }
  return error.message;
}

/* =========================================================
   DASHBOARD — ASC ploča: stage = Power Level
   ========================================================= */
const PLAN_SCHEMES = {
  strength:    { sets: 5, reps: "3–5",   hr: "Teške serije, dugi odmori (3 min).", en: "Heavy sets, long rests (3 min)." },
  hypertrophy: { sets: 4, reps: "8–10",  hr: "Kontrolirana negativna faza, 90 s odmora.", en: "Controlled eccentric, 90 s rest." },
  fat_loss:    { sets: 3, reps: "12–15", hr: "Kratki odmori (45 s) i 10 min kardija na kraju.", en: "Short rests (45 s) and 10 min cardio to finish." },
  general:     { sets: 3, reps: "8–12",  hr: "Stabilan tempo, 60–90 s odmora.", en: "Steady pace, 60–90 s rest." },
};
const PAIRS = { chest: ["chest", "shoulders", "arms"], back: ["back", "arms"], legs: ["legs", "glutes", "hamstrings"],
  shoulders: ["shoulders", "chest", "arms"], hamstrings: ["hamstrings", "glutes", "legs"], glutes: ["glutes", "hamstrings", "legs"], arms: ["arms", "back"] };

function buildTodayPlan(exercises, recovery, targets, profile) {
  const rec = Object.fromEntries(recovery.map((r) => [r.muscle_group, r.recovery_pct]));
  const groups = ["legs", "back", "chest", "shoulders", "hamstrings", "glutes", "arms"];
  const ranked = groups.map((g) => ({ g, pct: rec[g] ?? 100 })).sort((a, b) => b.pct - a.pct);
  const lead = ranked[0].g;
  const focus = PAIRS[lead].filter((g) => (rec[g] ?? 100) >= 60);
  const tmap = Object.fromEntries(targets.map((x) => [x.exercise_id, x]));
  const pool = exercises
    .filter((e) => focus.includes(e.muscle_group))
    .sort((a, b) => (tmap[b.id] ? 1 : 0) - (tmap[a.id] ? 1 : 0) || b.is_compound - a.is_compound);
  const beginner = profile?.experience === "beginner";
  const picked = pool.slice(0, beginner ? 4 : 5);
  return { focus, list: picked.map((e) => ({ e, target: tmap[e.id] })), scheme: PLAN_SCHEMES[profile?.goal || "general"] };
}

async function viewDashboard() {
  $view.innerHTML = `<div class="loading">…</div>`;
  const uid = state.session.user.id;
  const [pl, tg, rc, ms, ex, quotes, hist, news, onboard, bells, strip] = await Promise.all([
    sb.rpc("my_power_level"), sb.rpc("my_next_targets"), sb.rpc("my_recovery"),
    sb.from("memberships").select("*, membership_plans(name_hr,name_en)").eq("user_id", uid).eq("status", "active")
      .order("ends_at", { ascending: false, nullsFirst: true }).limit(1),
    loadExercises(), loadQuotes(),
    sb.from("workouts").select("id, performed_on, workout_sets(count)").eq("user_id", state.session.user.id).order("performed_on", { ascending: false }).limit(4),
    newsFeedHtml().catch(() => ""), onboardingHtml().catch(() => ""), bellsHtml().catch(() => ""), loadStreamItems(),
  ]);
  for (const r of [pl, tg, rc, ms]) if (r.error) return fail(r.error);
  const p = pl.data[0];
  const targets = tg.data || [];
  const recovery = rc.data || [];
  const membership = (ms.data || []).find((m) => !m.ends_at || new Date(m.ends_at) > new Date());
  const tierFloor = { SPARK: 0, SURGE: 1000, OVERDRIVE: 5000, ASCENDED: 15000, LIMITLESS: 40000 }[p.tier];
  const pct = p.next_tier_xp ? Math.round(((p.xp - tierFloor) / (p.next_tier_xp - tierFloor)) * 100) : 100;
  const pr = state.profile || {};
  const first = (pr.display_name || "").split(" ")[0] || "Saiyan";
  const initials = (pr.display_name || "S").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const plan = buildTodayPlan(ex, recovery, targets, pr);
  const goalTxt = pr.goal ? t("goal_" + pr.goal) : "—", expTxt = pr.experience ? t("exp_" + pr.experience) : "—";

  $view.innerHTML = `${installCoachHtml()}${onboard}
  <section class="hero">
    <div class="stage reveal" style="animation-delay:110ms">
      <span class="photo" aria-hidden="true"></span><span class="scrim" aria-hidden="true"></span>
      <span class="k">${esc(t("power_level"))} · ${esc(p.tier)}</span>
      <div class="greet"><h1 class="greet-line">${esc(greetWord())}, ${esc(first)}</h1>
        <div class="greet-sub"><span>${esc(todayLine())}</span></div></div>
      <div class="hero-num"><span data-count="${p.level}">0</span><em>${esc(t("level"))}</em></div>
      <div class="cap">${p.next_tier ? esc(t("xp_to", (p.next_tier_xp - p.xp).toLocaleString(), p.next_tier)) : esc(t("max_tier"))}</div>
      <div class="meter"><i data-w="${pct}"></i></div>
      <div class="cap tokens">🛡 ${esc(L(`Žetoni odmora: ${p.tokens_left ?? 2} ovaj mjesec`, `Rest tokens: ${p.tokens_left ?? 2} this month`))}${p.comebacks ? ` · ⚡ ${esc(L(`Povratci: ${p.comebacks}`, `Comebacks: ${p.comebacks}`))}` : ""}</div>
      <div class="space"></div>
      <div class="spills">
        <a class="spill" href="#/progress"><b data-count="${Math.round(p.total_volume_kg / 1000)}">0</b><span>t · ${esc(t("volume"))}</span></a>
        <a class="spill" href="#/log"><b data-count="${p.training_days}">0</b><span>${esc(t("days"))}</span></a>
        <a class="spill" href="#/progress"><b data-count="${p.prs}">0</b><span>${esc(t("prs"))}</span></a>
      </div>
      <span class="tab-corner">${p.week_streak ? esc(t("streak", p.week_streak)) : esc(L("tjedni niz · 0", "week streak · 0"))}</span>
    </div>

    <a class="act green top reveal" href="#/log" style="animation-delay:150ms">
      <span class="bg" style="background-image:url('assets/log.webp')"></span>
      <span class="go" aria-hidden="true">${ICO.plus}</span>
      <span class="tab-tl">${esc(L("trening", "workout"))}</span>
      <div class="body"><h2>${esc(t("start_log"))}</h2><div class="desc">${esc(plan.scheme.sets + " × " + plan.scheme.reps + " · " + plan.focus.map(muscle).join(" + "))}</div></div>
    </a>

    <a class="act gold bottom reveal" href="#/app" id="pass-open" style="animation-delay:190ms">
      <span class="bg" style="background-image:url('assets/checkin.webp')"></span>
      <span class="go" aria-hidden="true">${ICO.scan}</span>
      <span class="tab-tl">${esc(t("pass_title"))}</span>
      <div class="body"><h2>${esc(membership ? L("Pokaži QR na ulazu", "Show QR at the door") : t("pass_title"))}</h2>
        <div class="desc">${esc(membership ? nameOf(membership.membership_plans) + " · " + (membership.ends_at ? t("pass_valid", fmtDate(membership.ends_at)) : t("pass_open")) : t("pass_none"))}</div></div>
    </a>

    <section class="card dark slot-a reveal" style="animation-delay:230ms">
      <span class="tab-tl">${esc(L("plan", "plan"))}</span>
      <h3>${esc(t("today_title"))} <span class="count-badge">${plan.list.length}</span></h3>
      <p class="plan-meta">${esc(t("focus"))}: ${esc(plan.focus.map(muscle).join(" + "))} · ${plan.scheme.sets} × ${plan.scheme.reps} · ${esc(L(plan.scheme.hr, plan.scheme.en))}</p>
      ${plan.list.map(({ e, target }) => `<div class="plan-row"><span>${esc(nameOf(e))}</span><b>${target ? `${fmtKg(target.suggest_load)} × ${target.suggest_reps}` : `${plan.scheme.sets} × ${plan.scheme.reps}`}</b></div>`).join("")}
      ${plan.list.length === 0 ? `<p class="plan-meta" style="margin-top:12px">${esc(t("today_empty"))}</p>` : ""}
    </section>

    <section class="card slot-b reveal" id="prices" style="animation-delay:270ms">
      <span class="tab-tl">${esc(L("oporavak", "recovery"))}</span>
      <h3>${esc(t("recovery_title"))}</h3>
      ${["legs", "back", "chest", "shoulders", "hamstrings", "glutes", "arms"].map((g) => ({ g, pct: (recovery.find((r) => r.muscle_group === g) || {}).recovery_pct ?? 100 }))
        .sort((a, b) => a.pct - b.pct).slice(0, 5).map(({ g, pct }) => `
        <div class="obar"><div class="t"><span>${esc(muscle(g))}</span><b>${pct >= 100 ? esc(t("recovery_ready")) : pct + " %"}</b></div>
          <div class="bar"><i data-w="${pct}"${pct >= 100 ? ' style="background:var(--green)"' : ""}></i></div></div>`).join("")}
    </section>
  </section>

  <section class="trio">
    <div class="card profile reveal" style="animation-delay:230ms">
      <span class="tab-tl">${esc(L("profil", "profile"))}</span>
      <div class="row1"><span class="pavatar">${esc(initials)}</span><div><h2 class="pname">${esc(pr.display_name || first)}</h2><div class="sub">${esc(todayLine())}</div></div></div>
      <p class="quote-line">„${esc(dailyQuote(quotes))}”</p>
      <div class="health">
        <a class="hstat" href="#/profile">${esc(t("goal"))}<b>${esc(goalTxt)}</b></a>
        <a class="hstat" href="#/profile">${esc(t("experience"))}<b>${esc(expTxt)}</b></a>
        <div class="hstat">${esc(L("Niz", "Streak"))}<b class="g">${p.week_streak} ${esc(L("tj.", "wk"))}</b></div>
      </div>
    </div>

    <div class="card reveal" style="animation-delay:270ms">
      <span class="tab-tl">${esc(L("ciljevi", "targets"))}</span>
      <h3>${esc(t("targets_title"))}</h3>
      ${targets.length ? targets.slice(0, 4).map((x) => `
        <div class="target"><span class="nm">${esc(nameOf(x))}</span><span class="nx">${fmtKg(x.suggest_load)} × ${x.suggest_reps}</span>
          <span class="why">${esc(t("advice_" + x.advice))} · ${esc(t("e1rm"))} ${fmtKg(x.e1rm)}${x.e1rm_trend != null ? ` <span class="${x.e1rm_trend >= 0 ? "trend-up" : "trend-down"}">(${x.e1rm_trend >= 0 ? "+" : ""}${x.e1rm_trend})</span>` : ""}</span></div>`).join("")
        : `<p class="muted small">${esc(t("today_empty"))}</p>`}
    </div>

    <div class="card dark reveal" style="animation-delay:310ms">
      <span class="tab-tl">${esc(L("povijest", "history"))}</span>
      <h3>${esc(t("history"))} <span class="count-badge">${(hist.data || []).length}</span></h3>
      ${(hist.data || []).map((w) => `<a class="mini" href="#/progress"><time>${fmtDate(w.performed_on)}</time><b>${esc(L("Trening", "Workout"))}</b><span class="pl">${w.workout_sets[0]?.count ?? 0} ${esc(t("sets"))}</span></a>`).join("")
        || `<p class="plan-meta">${esc(t("history_empty"))}</p>`}
    </div>
  </section>
  ${bells}
  ${news}
  ${stream(strip)}
  <p class="foot builder">${esc(L("Platformu gradi Nero", "Built by Nero"))}</p>

  <dialog class="pass-dialog" id="pass-dlg">
    <div class="pass-card">
      <button class="x" type="button" id="pass-x" aria-label="${L("Zatvori", "Close")}">✕</button>
      <span class="k">${esc(t("pass_title"))}</span>
      ${membership ? `<div class="qr" id="qr"></div><code>${esc(membership.pass_code.toUpperCase())}</code>
        <p class="cap" style="margin-top:8px">${esc(nameOf(membership.membership_plans))} · ${membership.ends_at ? esc(t("pass_valid", fmtDate(membership.ends_at))) : esc(t("pass_open"))}</p>`
      : `<p class="cap" style="margin:16px 0 18px">${esc(t("pass_none"))}</p>
         <a class="btn btn-primary" href="${whatsappLink(L("Bok! Želim kupiti kartu.", "Hi! I'd like to buy a pass."))}" target="_blank" rel="noopener">WhatsApp</a>`}
    </div>
  </dialog>`;

  animateIn($view); wireInstallCoach(); wireStream();
  const dlg = document.getElementById("pass-dlg");
  document.getElementById("pass-open").onclick = (e) => { e.preventDefault(); dlg.showModal(); };
  document.getElementById("pass-x").onclick = () => dlg.close();
  dlg.onclick = (e) => { if (e.target === dlg) dlg.close(); };
  if (membership && window.qrcode) {
    const q = qrcode(0, "M");
    q.addData(`SAIYAN:${membership.pass_code}`); q.make();
    document.getElementById("qr").innerHTML = q.createSvgTag({ cellSize: 5, margin: 0, scalable: true });
  }
}

/* =========================================================
   WORKOUT LOGGER
   ========================================================= */
async function viewLog() {
  const [ex, tg, hist, rc] = await Promise.all([
    loadExercises(), sb.rpc("my_next_targets"),
    sb.from("workouts").select("id, performed_on, workout_sets(count)").eq("user_id", state.session.user.id).order("performed_on", { ascending: false }).limit(10),
    sb.rpc("my_recovery"),
  ]);
  if (tg.error) return fail(tg.error);
  const targets = Object.fromEntries((tg.data || []).map((x) => [x.exercise_id, x]));
  const plan = buildTodayPlan(ex, rc.data || [], tg.data || [], state.profile);
  const blocks = plan.list.map(({ e, target }) => ({
    exercise_id: e.id,
    sets: [{ load: target ? target.suggest_load : "", reps: target ? target.suggest_reps : "", rpe: "" }],
  }));

  $view.innerHTML = `
  <div class="page">
    <div class="phead"><h1>${esc(t("log_title"))}</h1></div>
    <div class="grid">
      <section class="card span-8">
        <div class="form-grid">
          <div><label for="d">${LANG === "hr" ? "Datum" : "Date"}</label><input id="d" type="date" value="${todayZagreb()}"></div>
          <div><label for="ex-pick">${esc(t("exercise"))}</label>
            <select id="ex-pick"><option value="">${esc(t("pick_ex"))}</option>
              ${ex.map((e) => `<option value="${e.id}">${esc(nameOf(e))}</option>`).join("")}</select></div>
        </div>
        <div id="blocks" style="margin-top:18px"></div>
        ${workoutBarHtml()}
        <button class="btn btn-primary" id="save" type="button" style="width:100%;margin-top:8px">${esc(t("save_workout"))}</button>
      </section>
      <section class="card span-4">
        <h2>${esc(t("history"))}</h2>
        ${(hist.data || []).map((w) => `<div class="row"><span>${fmtDate(w.performed_on)}</span><span class="muted">${w.workout_sets[0]?.count ?? 0} ${esc(t("sets"))}</span></div>`).join("")
          || `<p class="muted">${esc(t("history_empty"))}</p>`}
      </section>
    </div>
  </div>`;

  const draw = () => {
    document.getElementById("blocks").innerHTML = blocks.map((b, bi) => {
      const e = ex.find((x) => x.id === b.exercise_id);
      const tg = targets[b.exercise_id];
      return `
      <div class="ex-block">
        <header><h3 style="margin:0">${esc(nameOf(e))}</h3>
          <span class="ex-tools"><button class="chip" data-plates="${bi}" type="button">${esc(L("Utezi", "Plates"))}</button>
          <button class="icon-btn btn-sm" data-rmb="${bi}" type="button" aria-label="${esc(L("Ukloni vježbu", "Remove exercise"))}">✕</button></span></header>
        ${tg ? `<div class="hint">${fmtDate(tg.last_date)}: ${fmtKg(tg.last_load)} × ${tg.last_reps} → ${fmtKg(tg.suggest_load)} × ${tg.suggest_reps} · ${esc(t("advice_" + tg.advice))}</div>` : ""}
        <div class="set-row lbl"><span></span><span>${esc(t("load"))}</span><span>${esc(t("reps"))}</span><span>${esc(t("rpe"))}</span><span></span><span></span></div>
        ${b.sets.map((s, si) => `
          <div class="set-row${s.done ? " done" : ""}">
            <span class="set-no">${si + 1}</span>
            <input inputmode="decimal" aria-label="${esc(t("load"))}" data-b="${bi}" data-s="${si}" data-f="load" value="${s.load}">
            <input inputmode="numeric" aria-label="${esc(t("reps"))}" data-b="${bi}" data-s="${si}" data-f="reps" value="${s.reps}">
            <input inputmode="decimal" aria-label="${esc(t("rpe"))}" data-b="${bi}" data-s="${si}" data-f="rpe" value="${s.rpe}" placeholder="—">
            <button class="icon-btn set-done" data-done="${bi}:${si}" type="button" aria-pressed="${!!s.done}" aria-label="${esc(L("Serija gotova — pokreni odmor", "Set done — start rest"))}">✓</button>
            <button class="icon-btn" data-rms="${bi}:${si}" type="button" aria-label="${esc(L("Ukloni seriju", "Remove set"))}">−</button>
          </div>`).join("")}
        <button class="btn btn-ghost btn-sm" data-add="${bi}" type="button">+ ${esc(t("add_set"))}</button>
      </div>`;
    }).join("");
    const wm = document.getElementById("wm");
    if (wm) wm.classList.toggle("is-idle", !blocks.some((b) => b.sets.some((s) => s.done)));
  };

  document.getElementById("ex-pick").onchange = (e) => {
    const id = e.target.value; if (!id) return;
    const tg = targets[id];
    blocks.push({ exercise_id: id, sets: [{ load: tg ? tg.suggest_load : "", reps: tg ? tg.suggest_reps : "", rpe: "" }] });
    e.target.value = ""; draw();
  };
  document.getElementById("blocks").addEventListener("input", (e) => {
    const { b, s, f } = e.target.dataset; if (b == null) return;
    blocks[b].sets[s][f] = e.target.value.replace(",", ".");
  });
  wireWorkoutBar();
  document.getElementById("blocks").addEventListener("click", (e) => {
    const d = e.target.closest("button")?.dataset || {};
    if (d.done != null) {
      const [b, si] = d.done.split(":"), set = blocks[b].sets[si];
      set.done = !set.done; draw();
      if (set.done) { buzz(30); Workout.start(restFor(ex.find((x) => x.id === blocks[b].exercise_id))); }
      return;
    }
    if (d.plates != null) { const cur = blocks[d.plates].sets.findLast((x) => !x.done) || blocks[d.plates].sets.at(-1); return openPlates(cur.load); }
    if (d.add != null) { const last = blocks[d.add].sets.at(-1); blocks[d.add].sets.push({ ...last, done: false }); draw(); }
    if (d.rmb != null) { blocks.splice(d.rmb, 1); draw(); }
    if (d.rms != null) { const [b, s] = d.rms.split(":"); blocks[b].sets.splice(s, 1); if (!blocks[b].sets.length) blocks.splice(b, 1); draw(); }
  });
  draw();
  document.getElementById("save").onclick = async (ev) => {
    const rows = [];
    blocks.forEach((b) => b.sets.forEach((s, i) => {
      const load = parseFloat(s.load), reps = parseInt(s.reps, 10), rpe = s.rpe === "" ? null : parseFloat(s.rpe);
      if (!isNaN(load) && reps > 0) rows.push({ exercise_id: b.exercise_id, set_no: i + 1, load_kg: load, reps, rpe: rpe && rpe >= 5 && rpe <= 10 ? rpe : null });
    }));
    if (!rows.length) return toast(t("no_sets"));
    ev.target.disabled = true;
    const day = document.getElementById("d").value || todayZagreb();
    const { data: w, error } = await sb.from("workouts").insert({ performed_on: day }).select().single();
    if (error) { ev.target.disabled = false; return fail(error); }
    const { error: e2 } = await sb.from("workout_sets").insert(rows.map((r) => ({ ...r, workout_id: w.id })));
    if (e2) { await sb.from("workouts").delete().eq("id", w.id); ev.target.disabled = false; return fail(e2); }
    leaveWorkout();
    const prs = await findPRs(rows, day, ex).catch(() => []);
    if (prs.length) return celebratePRs(prs);
    toast(t("saved")); location.hash = "#/app";
  };
}

/* =========================================================
   PROGRESS (e1RM chart)
   ========================================================= */
async function viewProgress() {
  const ex = await loadExercises();
  $view.innerHTML = `
  <div class="page">
    <div class="phead"><h1>${esc(t("progress_title"))}</h1></div>
    <section class="card">
      <label for="pex">${esc(t("exercise"))}</label>
      <select id="pex"><option value="">${esc(t("pick_ex"))}</option>${ex.map((e) => `<option value="${e.id}">${esc(nameOf(e))}</option>`).join("")}</select>
      <div id="chart" style="margin-top:20px"></div>
    </section>
  </div>`;
  const pexEl = document.getElementById("pex");
  pexEl.onchange = async (e) => {
    const id = e.target.value, box = document.getElementById("chart");
    if (!id) return (box.innerHTML = "");
    const { data, error } = await sb.from("workout_sets").select("load_kg, reps, workouts!inner(performed_on, user_id)").eq("exercise_id", id).eq("workouts.user_id", state.session.user.id);
    if (error) return fail(error);
    const best = {};
    data.forEach((s) => {
      const d = s.workouts.performed_on;
      const v = s.reps === 1 ? +s.load_kg : s.load_kg * (1 + s.reps / 30);
      best[d] = Math.max(best[d] || 0, v);
    });
    const pts = Object.entries(best).sort(([a], [b]) => a.localeCompare(b));
    if (!pts.length) return (box.innerHTML = `<p class="muted">${esc(t("no_data"))}</p>`);
    const W = Math.max(300, Math.round(box.clientWidth || 640)), H = W < 500 ? 200 : 240, P = W < 500 ? 30 : 36;
    const ys = pts.map((p) => p[1]), min = Math.min(...ys) * 0.95, max = Math.max(...ys) * 1.05;
    const prev = pts.length > 1 ? pts.at(-2)[1] : null, last = ys.at(-1);
    const trend = prev == null ? "" : last > prev + 0.5
      ? L("Jače od prošlog puta.", "Stronger than last time.")
      : last < prev - 0.5 ? L("Slabije od prošlog puta.", "Lighter than last time.")
      : L("Isto kao prošli put.", "Same as last time.");
    const x = (i) => P + (pts.length === 1 ? (W - 2 * P) / 2 : (i * (W - 2 * P)) / (pts.length - 1));
    const y = (v) => H - P - ((v - min) / (max - min || 1)) * (H - 2 * P);
    box.innerHTML = `
      <h2 class="bigstat">${fmtKg(Math.round(ys.at(-1)))}<em>${esc(t("e1rm"))} · ${esc(L("zadnji", "latest"))}</em></h2>
      ${trend ? `<p class="plan-meta">${esc(trend)} ${esc(fmtDate(pts.at(-1)[0]))}</p>` : ""}
      <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t("e1rm"))}">
        <line class="axis" x1="${P}" y1="${H - P}" x2="${W - P}" y2="${H - P}"/>
        <polyline class="line" points="${pts.map((p, i) => `${x(i)},${y(p[1])}`).join(" ")}"/>
        ${pts.map((p, i) => `<circle class="dot" cx="${x(i)}" cy="${y(p[1])}" r="5"><title>${p[0]}: ${Math.round(p[1])} kg</title></circle>`).join("")}
        <text x="${P}" y="${H - 10}">${fmtDate(pts[0][0])}</text>
        <text x="${W - P}" y="${H - 10}" text-anchor="end">${fmtDate(pts.at(-1)[0])}</text>
        <text x="${P}" y="${y(Math.max(...ys)) - 8}">${esc(L("najviše", "best"))} ${Math.round(Math.max(...ys))} kg</text>
      </svg>`;
  };
  const { data: top } = await sb.from("workout_sets").select("exercise_id, workouts!inner(user_id)").eq("workouts.user_id", state.session.user.id).limit(500);
  if (top && top.length) {
    const cnt = {}; top.forEach((r) => (cnt[r.exercise_id] = (cnt[r.exercise_id] || 0) + 1));
    pexEl.value = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0][0];
    pexEl.dispatchEvent(new Event("change"));
  }
}

/* =========================================================
   PROFILE + GDPR
   ========================================================= */
async function viewProfile() {
  const p = state.profile || {};
  const { data: cons } = await sb.from("consents").select("*").eq("purpose", "health").is("withdrawn_at", null);
  const hasHealth = (cons || []).length > 0;
  const { data: metrics } = hasHealth
    ? await sb.from("body_metrics").select("*").order("measured_on", { ascending: false }).limit(8)
    : { data: [] };
  const canClaim = !isAdmin() && (await sb.rpc("admin_exists")).data === false;
  const opt = (name, vals, cur) => vals.map((v) => `<option value="${v}" ${cur === v ? "selected" : ""}>${esc(t(name + "_" + v))}</option>`).join("");

  $view.innerHTML = `
  <div class="page">
    <div class="phead"><h1>${esc(t("profile_title"))}</h1>
      <button class="btn btn-ghost" id="so" type="button">${esc(t("sign_out"))}</button></div>
    <div class="grid">
      <section class="card span-6">
        <p class="muted small">${esc(state.session.user.email)}</p>
        <p class="small">${esc(L("Karta je pod Moj trening — „Moja karta”.", "Your pass is under My training — “My pass”."))}</p>
        <div class="form-grid">
          <div><label for="nm">${esc(L("Ime", "Name"))}</label><input id="nm" value="${esc(p.display_name || "")}" autocomplete="name"></div>
          <div><label for="goal">${esc(t("goal"))}</label><select id="goal"><option value=""></option>${opt("goal", ["strength", "hypertrophy", "fat_loss", "general"], p.goal)}</select></div>
          <div><label for="exp">${esc(t("experience"))}</label><select id="exp"><option value=""></option>${opt("exp", ["beginner", "intermediate", "advanced"], p.experience)}</select></div>
        </div>
        <button class="btn btn-primary" id="save-p" type="button" style="margin-top:14px">${esc(t("save"))}</button>
      </section>

      <section class="card span-6">
        <h2>${esc(t("privacy_title"))}</h2>
        <div class="toggle-row">
          <input type="checkbox" id="c-health" ${hasHealth ? "checked" : ""}>
          <label for="c-health" style="font-weight:500">${esc(t("consent_health"))}</label>
        </div>
        <p class="small muted" style="margin-top:8px">${esc(t("consent_health_note"))}</p>
        <button class="btn btn-ghost btn-sm" id="del" type="button">${esc(t("delete_data"))}</button>
      </section>

      ${canClaim ? `
      <section class="card span-12">
        <h2>${esc(t("claim_title"))}</h2>
        <p class="muted">${esc(t("claim_body"))}</p>
        <button class="btn btn-primary" id="claim" type="button">${esc(t("claim_btn"))}</button>
      </section>` : ""}
      ${hasHealth ? `
      <section class="card span-12">
        <h2>${esc(t("body_title"))}</h2>
        <div class="form-grid">
          <div><label for="w">${esc(t("weight"))}</label><input id="w" inputmode="decimal"></div>
          <div><label for="bf">${esc(t("bodyfat"))}</label><input id="bf" inputmode="decimal"></div>
          <div><button class="btn btn-primary" id="add-m" type="button">${esc(t("add_measure"))}</button></div>
        </div>
        ${(metrics || []).map((m) => `<div class="row"><span>${fmtDate(m.measured_on)}</span><span>${m.weight_kg ?? "—"} kg · ${m.bodyfat_pct ?? "—"}%</span></div>`).join("")}
      </section>` : ""}
    </div>
  </div>`;

  document.getElementById("so").onclick = signOut;
  document.getElementById("save-p").onclick = async () => {
    const upd = { display_name: document.getElementById("nm").value.trim() || null, goal: document.getElementById("goal").value || null, experience: document.getElementById("exp").value || null };
    const { error } = await sb.from("profiles").update(upd).eq("id", state.session.user.id);
    if (error) return fail(error);
    Object.assign(state.profile, upd); toast(t("saved_ok"));
  };
  document.getElementById("c-health").onchange = async (e) => {
    const r = e.target.checked
      ? await sb.from("consents").insert({ purpose: "health", text_version: cfg.consentVersion })
      : await sb.from("consents").update({ withdrawn_at: new Date().toISOString() }).eq("purpose", "health").is("withdrawn_at", null);
    if (r.error) return fail(r.error);
    viewProfile();
  };
  document.getElementById("del").onclick = async () => {
    if (!confirm(t("delete_confirm"))) return;
    const uid = state.session.user.id;
    const a = await sb.from("workouts").delete().eq("user_id", uid);
    if (a.error) return fail(a.error);
    if (hasHealth) await sb.from("body_metrics").delete().eq("user_id", uid);
    toast(t("deleted")); viewProfile();
  };
  const claim = document.getElementById("claim");
  if (claim) claim.onclick = async () => {
    const { data, error } = await sb.rpc("claim_first_admin");
    if (error) return fail(error);
    if (data) { await loadProfile(); toast(t("claim_ok")); location.hash = "#/admin"; } else viewProfile();
  };
  const add = document.getElementById("add-m");
  if (add) add.onclick = async () => {
    const w = parseFloat(document.getElementById("w").value.replace(",", ".")), bf = parseFloat(document.getElementById("bf").value.replace(",", "."));
    if (isNaN(w) && isNaN(bf)) return;
    const { error } = await sb.from("body_metrics").insert({ weight_kg: isNaN(w) ? null : w, bodyfat_pct: isNaN(bf) ? null : bf });
    if (error) return fail(error);
    viewProfile();
  };
}

/* =========================================================
   FRONT DESK (staff)
   ========================================================= */
async function viewDesk() {
  if (!isStaff()) { $view.innerHTML = `<div class="page"><p>${esc(t("staff_only"))}</p></div>`; return; }
  const [inside, radar, greet] = await Promise.all([
    sb.from("check_ins").select("id, user_id, checked_in_at").is("checked_out_at", null)
      .gt("checked_in_at", new Date(Date.now() - 3 * 3600e3).toISOString()).order("checked_in_at", { ascending: false }),
    sb.rpc("churn_radar"), greetHtml().catch(() => ""),
  ]);
  if (inside.error) return fail(inside.error);
  const ids = [...new Set((inside.data || []).map((c) => c.user_id))];
  const { data: names } = ids.length ? await sb.from("profiles").select("id, display_name").in("id", ids) : { data: [] };
  const nm = Object.fromEntries((names || []).map((n) => [n.id, n.display_name]));

  $view.innerHTML = `
  <div class="page">
    <div class="phead"><h1>${esc(t("desk_title"))}</h1></div>
    <div class="grid">
      ${greet}
      <section class="card span-6">
        <h2>${esc(t("checkin_title"))}</h2>
        <div class="inline-form">
          <label class="sr-only" for="code">${esc(t("code_ph"))}</label>
          <input id="code" placeholder="${esc(t("code_ph"))}" autocapitalize="characters">
          <button class="btn btn-primary" id="ci" type="button">${esc(t("checkin_btn"))}</button>
        </div>
        <button class="btn btn-ghost btn-sm" id="scan" type="button" style="margin-top:10px">${esc(t("scan_btn"))}</button>
        <div id="reader" style="margin-top:12px;max-width:360px"></div>
      </section>
      <section class="card span-6">
        <h2>${esc(t("inside_title"))} · ${(inside.data || []).length}</h2>
        ${(inside.data || []).map((c) => `
          <div class="risk"><span>${esc(nm[c.user_id] || "—")} <span class="small muted">${new Date(c.checked_in_at).toLocaleTimeString(LANG === "hr" ? "hr-HR" : "en-GB", { hour: "2-digit", minute: "2-digit" })}</span></span>
          <button class="btn btn-ghost btn-sm" data-out="${c.id}" type="button">${esc(t("checkout"))}</button></div>`).join("")}
      </section>
      <section class="card span-12">
        <h2>${esc(t("churn_title"))}</h2>
        <p class="muted">${esc(t("churn_sub"))}</p>
        ${radar.error ? esc(radar.error.message) : (radar.data || []).map((r) => `
          <div class="risk ${r.risk}">
            <div><strong>${esc(r.display_name)}</strong><br>
              <span class="small muted">${esc(r.never_visited ? L(`Još nije došao/la · član ${r.days_since_visit} d`, `No visit yet · member ${r.days_since_visit} d`) : t("churn_days", r.days_since_visit))} · ${r.visits_4w}/${r.visits_prev_4w} · ${esc(t("risk_" + r.risk))}</span></div>
            <span class="score">${r.risk_score}</span>
          </div>`).join("")}
      </section>
    </div>
  </div>`;

  wireGreet(viewDesk);
  const checkIn = async (raw) => {
    const code = String(raw).replace(/^SAIYAN:/i, "").trim().toLowerCase();
    if (!code) return;
    const { data: m, error } = await sb.from("memberships").select("user_id, ends_at").eq("pass_code", code).eq("status", "active").maybeSingle();
    if (error) return fail(error);
    if (!m || (m.ends_at && new Date(m.ends_at) < new Date())) return toast(t("bad_code"));
    const { error: e2 } = await sb.from("check_ins").insert({ user_id: m.user_id });
    if (e2) return fail(e2);
    const { data: pr } = await sb.from("profiles").select("display_name").eq("id", m.user_id).single();
    toast(t("checked_in", pr?.display_name || "")); viewDesk();
  };
  document.getElementById("ci").onclick = () => checkIn(document.getElementById("code").value);
  document.getElementById("code").onkeydown = (e) => e.key === "Enter" && checkIn(e.target.value);
  document.querySelectorAll("[data-out]").forEach((b) => (b.onclick = async () => {
    const { error } = await sb.from("check_ins").update({ checked_out_at: new Date().toISOString() }).eq("id", b.dataset.out);
    error ? fail(error) : viewDesk();
  }));
  document.getElementById("scan").onclick = async () => {
    if (!window.Html5Qrcode) {
      await new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js";
        s.onload = res; s.onerror = rej; document.head.appendChild(s);
      });
    }
    const reader = new Html5Qrcode("reader");
    reader.start({ facingMode: "environment" }, { fps: 10, qrbox: 220 }, async (text) => {
      await reader.stop(); checkIn(text);
    }).catch(fail);
  };
}

/* =========================================================
   ADMIN SETTINGS — everything the owner fills in later
   ========================================================= */
async function viewAdmin() {
  if (!isAdmin()) { $view.innerHTML = `<div class="page"><p>${esc(t("staff_only"))}</p></div>`; return; }
  const [plans, facts, quotes, settings, photos, wireRes] = await Promise.all([
    sb.from("membership_plans").select("*").order("sort"),
    sb.from("gym_facts").select("id, topic, questions, content_hr, content_en").order("topic"),
    sb.from("motivation").select("*").order("id"),
    loadSettings(), listGallery(),
    sb.functions.invoke("gym-wire", { body: { action: "status" } }),
  ]);
  const wire = wireRes?.data && !wireRes.data.error ? wireRes.data : null;
  for (const r of [plans, facts, quotes]) if (r.error) return fail(r.error);

  $view.innerHTML = `
  <div class="page">
    <div class="phead"><div><h1>${esc(t("admin_title"))}</h1><p class="muted">${esc(t("admin_intro"))}</p></div></div>
    <div class="grid">

      <section class="card span-12" aria-labelledby="amail">
        <h2 id="amail">${esc(L("Službena e-pošta teretane", "Official gym email"))}</h2>
        <p class="muted small">${esc(L(
          "Ovdje Zrinko upisuje službeni Gmail teretane i zaporku aplikacije (Google račun → Sigurnost → Zaporke aplikacija). Lozinka se ne sprema u aplikaciju. Supabase je odmah počne koristiti za prijave članova.",
          "Zrinko enters the gym's official Gmail and an app password here (Google Account → Security → App passwords). The password is not stored in the app. Supabase starts using it for member sign-in immediately."))}</p>
        <p class="small" id="mail-status">${esc(wire?.wired
          ? L("Slanje ide s ", "Sending from ") + (wire.email || "")
          : L("Slanje e-pošte još nije uključeno.", "Email sending is not switched on yet."))}${wire?.gemini ? esc(L(" Studio je uključen.", " Studio is on.")) : esc(L(" Studio još nije uključen.", " Studio is not on yet."))}</p>
        <div class="form-grid">
          <div><label for="gym-mail">${esc(L("Službeni Gmail", "Official Gmail"))}</label>
            <input id="gym-mail" type="email" inputmode="email" autocomplete="off" placeholder="ime@gmail.com" value="${esc(wire?.email || "")}"></div>
          <div><label for="gym-sender">${esc(L("Ime pošiljatelja", "Sender name"))}</label>
            <input id="gym-sender" autocomplete="off" value="${esc(wire?.sender || "Saiyan Gym FITT")}"></div>
        </div>
        <div class="form-grid" style="margin-top:8px">
          <div><label for="gym-app-pw">${esc(L("Zaporka aplikacije", "App password"))}</label>
            <input id="gym-app-pw" type="password" autocomplete="new-password" placeholder="${esc(L("16 slova", "16 letters"))}"></div>
          <div><label for="gym-gemini">${esc(L("Gemini ključ za Studio (neobavezno)", "Gemini key for Studio (optional)"))}</label>
            <input id="gym-gemini" type="password" autocomplete="new-password" placeholder="AIza…"></div>
        </div>
        <button class="btn btn-primary btn-sm" id="save-mail" type="button" style="margin-top:10px">${esc(L("Uključi slanje", "Turn on sending"))}</button>
      </section>

      <section class="card span-12" aria-labelledby="ap">
        <h2 id="ap">${esc(t("a_prices"))}</h2>
        ${plans.data.map((p) => `
          <div class="admin-row" data-plan="${p.id}">
            <div class="form-grid">
              <div><label>${esc(t("a_name_hr"))}</label><input data-f="name_hr" value="${esc(p.name_hr)}"></div>
              <div><label>${esc(t("a_name_en"))}</label><input data-f="name_en" value="${esc(p.name_en)}"></div>
              <div><label>${esc(t("a_price"))}</label><input data-f="price_eur" inputmode="decimal" placeholder="${esc(t("on_request"))}" value="${p.price_eur ?? ""}"></div>
            </div>
            <div class="form-grid" style="margin-top:8px">
              <div><label>${esc(t("a_desc_hr"))}</label><input data-f="description_hr" value="${esc(p.description_hr)}"></div>
              <div><label>${esc(t("a_desc_en"))}</label><input data-f="description_en" value="${esc(p.description_en)}"></div>
            </div>
            <div class="admin-actions">
              <label class="toggle-row" style="margin:0"><input type="checkbox" data-f="is_published" ${p.is_published ? "checked" : ""}> <span>${esc(t("a_visible"))}</span></label>
              <button class="btn btn-primary btn-sm" data-save-plan type="button">${esc(t("save"))}</button>
              <button class="btn btn-ghost btn-sm" data-del-plan type="button">${esc(t("a_delete"))}</button>
            </div>
          </div>`).join("")}
        <button class="btn btn-ghost" id="add-plan" type="button">+ ${esc(t("a_add_plan"))}</button>
      </section>

      <section class="card span-6" aria-labelledby="apay">
        <h2 id="apay">${esc(t("a_payment"))}</h2>
        <p class="muted small">${esc(t("a_payment_help"))}</p>
        <label class="sr-only" for="pay">${esc(t("a_payment"))}</label>
        <input id="pay" type="url" placeholder="${esc(t("a_payment_ph"))}" value="${esc(settings.payment_url || "")}">
        <button class="btn btn-primary btn-sm" id="save-pay" type="button" style="margin-top:10px">${esc(t("save"))}</button>
      </section>

      <section class="card span-6" aria-labelledby="agal">
        <h2 id="agal">${esc(t("a_gallery"))}</h2>
        <p class="muted small">${esc(t("a_gallery_help"))}</p>
        <label class="btn btn-ghost btn-sm" for="up" style="display:inline-flex">${esc(t("a_upload"))}</label>
        <input id="up" class="sr-only" type="file" accept="image/jpeg,image/png,image/webp" multiple>
        <div class="gallery admin-gallery">${photos.map((ph) => `
          <figure><img src="${esc(ph.url)}" alt="" loading="lazy">
          <button class="icon-btn" data-del-photo="${esc(ph.name)}" type="button" aria-label="${esc(t("a_delete"))}">✕</button></figure>`).join("")}</div>
      </section>

      <section class="card span-12" aria-labelledby="afacts">
        <h2 id="afacts">${esc(t("a_facts"))}</h2>
        <p class="muted small">${esc(t("a_facts_help"))}</p>
        ${facts.data.map((f) => `
          <div class="admin-row" data-fact="${f.id}">
            <div class="form-grid">
              <div><label>${esc(t("a_topic"))}</label><input data-f="topic" value="${esc(f.topic)}"></div>
            </div>
            <div style="margin-top:8px"><label>${esc(t("a_questions"))}</label><textarea data-f="questions" rows="2" placeholder="${esc(t("a_questions_ph"))}">${esc(f.questions || "")}</textarea></div>
            <div class="form-grid" style="margin-top:8px">
              <div><label>HR</label><textarea data-f="content_hr" rows="2">${esc(f.content_hr)}</textarea></div>
              <div><label>EN</label><textarea data-f="content_en" rows="2">${esc(f.content_en)}</textarea></div>
            </div>
            <div class="admin-actions">
              <button class="btn btn-primary btn-sm" data-save-fact type="button">${esc(t("save"))}</button>
              <button class="btn btn-ghost btn-sm" data-del-fact type="button">${esc(t("a_delete"))}</button>
            </div>
          </div>`).join("")}
        <button class="btn btn-ghost" id="add-fact" type="button">+ ${esc(t("a_add_fact"))}</button>
      </section>

      <section class="card span-12" aria-labelledby="ateam" data-tab="${esc(L("tim", "team"))}">
        <h2 id="ateam">${esc(L("Tim i uloge", "Team and roles"))}</h2>
        <p class="muted small">${esc(L("Osoba se mora prvo jednom prijaviti. Administrator vidi sve postavke i Ideje; trener vidi recepciju.",
          "The person must sign in once first. Admin sees all settings and Ideas; coach sees the front desk."))}</p>
        <label for="team-q">${esc(L("Traži po imenu", "Search by name"))}</label>
        <input id="team-q" type="search" autocomplete="off">
        <div id="team-list"></div>
      </section>

      <section class="card span-12" aria-labelledby="amot">
        <h2 id="amot">${esc(t("a_motivation"))}</h2>
        ${quotes.data.map((q) => `
          <div class="row"><span>${esc(q.text_hr)} <span class="muted">/ ${esc(q.text_en)}</span></span>
          <button class="icon-btn" style="width:40px;height:40px" data-del-quote="${q.id}" type="button" aria-label="${esc(t("a_delete"))}">✕</button></div>`).join("")}
        <div class="form-grid" style="margin-top:12px">
          <div><label for="q-hr">HR</label><input id="q-hr"></div>
          <div><label for="q-en">EN</label><input id="q-en"></div>
          <div><button class="btn btn-primary" id="add-quote" type="button">${esc(t("a_add_quote"))}</button></div>
        </div>
      </section>
    </div>
  </div>`;

  const rowVals = (row) => Object.fromEntries([...row.querySelectorAll("[data-f]")].map((el) =>
    [el.dataset.f, el.type === "checkbox" ? el.checked : el.value.trim()]));

  document.querySelectorAll("[data-save-plan]").forEach((b) => (b.onclick = async () => {
    const row = b.closest("[data-plan]"), v = rowVals(row);
    const price = v.price_eur === "" ? null : parseFloat(v.price_eur.replace(",", "."));
    if (price !== null && (isNaN(price) || price < 0)) return toast(t("a_price") + "?");
    const { error } = await sb.from("membership_plans").update({ ...v, price_eur: price }).eq("id", row.dataset.plan);
    error ? fail(error) : toast(t("saved_ok"));
  }));
  document.querySelectorAll("[data-del-plan]").forEach((b) => (b.onclick = async () => {
    if (!confirm(t("a_confirm_delete"))) return;
    const { error } = await sb.from("membership_plans").delete().eq("id", b.closest("[data-plan]").dataset.plan);
    error ? fail(error) : viewAdmin();
  }));
  document.getElementById("add-plan").onclick = async () => {
    const { error } = await sb.from("membership_plans").insert({
      code: "plan-" + Date.now().toString(36), kind: "multi", name_hr: "Novi paket", name_en: "New package",
      is_published: false, sort: plans.data.length + 1 });
    error ? fail(error) : viewAdmin();
  };

  document.getElementById("save-mail").onclick = async () => {
    const email = document.getElementById("gym-mail").value.trim();
    const app_password = document.getElementById("gym-app-pw").value;
    const sender_name = document.getElementById("gym-sender").value.trim();
    const gemini_key = document.getElementById("gym-gemini").value.trim();
    if (!email && !app_password && !gemini_key) return;
    const btn = document.getElementById("save-mail");
    btn.disabled = true;
    const { data, error } = await sb.functions.invoke("gym-wire", { body: { email, app_password, sender_name, gemini_key } });
    btn.disabled = false;
    const code = data?.error || (await error?.context?.json?.().catch(() => ({})))?.error;
    if (error || code) {
      const say = {
        gmail: L("Mora biti službeni @gmail.com teretane, ne osobni.", "It has to be the gym's official @gmail.com, not a personal one."),
        app_password: L("Zaporka aplikacije ima 16 slova. Google je pokaže samo jednom.", "An app password is 16 letters. Google shows it only once."),
        gemini: L("Gemini ključ ne izgleda ispravno.", "That Gemini key does not look valid."),
        not_configured: L("Povezivanje još nije spremno.", "Wiring is not ready yet."),
        smtp: L("Supabase nije prihvatio tu Gmail zaporku. Provjeri zaporku aplikacije.", "Supabase did not accept that Gmail password. Check the app password."),
        gemini_save: L("Gemini ključ nije spremljen.", "The Gemini key was not saved."),
        admin: L("Samo administrator može ovo uključiti.", "Only an admin can turn this on."),
      }[code];
      return toast(say || t("error"), 6000);
    }
    document.getElementById("gym-app-pw").value = "";
    document.getElementById("gym-gemini").value = "";
    toast(t("saved_ok"));
    viewAdmin();
  };

  document.getElementById("save-pay").onclick = async () => {
    const url = document.getElementById("pay").value.trim();
    if (url && !/^https:\/\//i.test(url)) return toast("https://…");
    const { error } = await sb.from("site_settings").upsert({ key: "payment_url", value: url || null, updated_at: new Date().toISOString() });
    error ? fail(error) : toast(t("saved_ok"));
  };

  document.getElementById("up").onchange = async (e) => {
    const files = [...e.target.files]; if (!files.length) return;
    toast(t("a_uploading"), 10000);
    for (const f of files) {
      const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
      const { error } = await sb.storage.from("gallery").upload(`${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`, f, { contentType: f.type });
      if (error) return fail(error);
    }
    toast(t("saved_ok")); viewAdmin();
  };
  document.querySelectorAll("[data-del-photo]").forEach((b) => (b.onclick = async () => {
    if (!confirm(t("a_confirm_delete"))) return;
    const { error } = await sb.storage.from("gallery").remove([b.dataset.delPhoto]);
    error ? fail(error) : viewAdmin();
  }));

  document.querySelectorAll("[data-save-fact]").forEach((b) => (b.onclick = async () => {
    const row = b.closest("[data-fact]"), v = rowVals(row);
    if (!v.content_hr || !v.content_en) return toast("HR + EN");
    // clearing the embedding makes the concierge re-learn this answer on the next question
    const { error } = await sb.from("gym_facts").update({ ...v, embedding: null }).eq("id", row.dataset.fact);
    error ? fail(error) : toast(t("saved_ok"));
  }));
  document.querySelectorAll("[data-del-fact]").forEach((b) => (b.onclick = async () => {
    if (!confirm(t("a_confirm_delete"))) return;
    const { error } = await sb.from("gym_facts").delete().eq("id", b.closest("[data-fact]").dataset.fact);
    error ? fail(error) : viewAdmin();
  }));
  document.getElementById("add-fact").onclick = async () => {
    const { error } = await sb.from("gym_facts").insert({ topic: "new", content_hr: "…", content_en: "…" });
    error ? fail(error) : viewAdmin();
  };

  const team = document.getElementById("team-list");
  const ROLE = { member: L("Član", "Member"), coach: L("Trener", "Coach"), admin: L("Administrator", "Admin") };
  const showTeam = async (q) => {
    let req = sb.from("profiles").select("id,display_name,role").order("role").limit(20);
    req = q ? req.ilike("display_name", `%${q.replace(/[%_]/g, "")}%`) : req.in("role", ["admin", "coach"]);
    const { data, error } = await req; if (error) return fail(error);
    team.innerHTML = (data || []).map((u) => `<div class="row"><span>${esc(u.display_name || "—")}</span>
      <label class="sr-only" for="r-${u.id}">${esc(L("Uloga", "Role"))}</label>
      <select id="r-${u.id}" data-role="${u.id}">${Object.entries(ROLE).map(([k, v]) => `<option value="${k}" ${u.role === k ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></div>`).join("")
      || `<p class="muted small">${esc(L("Nema rezultata.", "No results."))}</p>`;
    team.querySelectorAll("[data-role]").forEach((sel) => (sel.onchange = async () => {
      if (sel.value === "admin" && !confirm(L("Dati ovoj osobi puna administratorska prava?", "Give this person full admin rights?"))) return showTeam(q);
      const { error } = await sb.from("profiles").update({ role: sel.value }).eq("id", sel.dataset.role);
      error ? (fail(error), showTeam(q)) : toast(t("saved_ok"));
    }));
  };
  let teamT; document.getElementById("team-q").oninput = (e) => { clearTimeout(teamT); teamT = setTimeout(() => showTeam(e.target.value.trim()), 250); };
  showTeam("");

  document.querySelectorAll("[data-del-quote]").forEach((b) => (b.onclick = async () => {
    const { error } = await sb.from("motivation").delete().eq("id", b.dataset.delQuote);
    if (error) return fail(error);
    state.quotes = null; viewAdmin();
  }));
  document.getElementById("add-quote").onclick = async () => {
    const hr = document.getElementById("q-hr").value.trim(), en = document.getElementById("q-en").value.trim();
    if (!hr || !en) return toast("HR + EN");
    const { error } = await sb.from("motivation").insert({ text_hr: hr, text_en: en });
    if (error) return fail(error);
    state.quotes = null; viewAdmin();
  };
}

/* ---------- ideas lab (admin): shape an idea with the agent, queue it for Nero ---------- */
const IDEA_STATUS = {
  drafting: ["U izradi", "Drafting"], queued: ["Poslano Nerou", "Sent to Nero"], in_progress: ["Nero radi", "Nero is building"],
  shipped: ["Objavljeno", "Live"], needs_toni: ["Čeka Tonija", "Waiting for Toni"], rejected: ["Odbijeno", "Declined"],
};
const CAT = { content: ["Tekst", "Text"], style: ["Izgled", "Look"], feature: ["Funkcija", "Feature"], data: ["Podaci i sigurnost", "Data & security"] };
const pick = (m, k) => (m[k] ? m[k][LANG === "hr" ? 0 : 1] : k || "");

async function viewIdeas(kind = "idea") {
  if (!isAdmin()) { $view.innerHTML = `<div class="page"><p>${esc(t("staff_only"))}</p></div>`; return; }
  const params = new URLSearchParams(location.hash.split("?")[1] || "");
  const sel = params.get("id");
  const archive = params.get("archive") === "1";
  const bug = kind === "bug", base = `#/studio?tab=${kind}`;
  const archivedN = await sb.rpc("ideas_auto_archive").then((r) => r.data || 0).catch(() => 0);
  let threadReq = sb.from("idea_threads").select("id,kind,title,status,category,brief,pr_url,result_note,updated_at,archived_at").eq("kind", kind).order("updated_at", { ascending: false });
  threadReq = archive ? threadReq.not("archived_at", "is", null) : threadReq.is("archived_at", null);
  const [threads, auto, owner] = await Promise.all([
    threadReq,
    sb.from("idea_autonomy").select("*"),
    sb.rpc("is_owner"),
  ]);
  if (threads.error) return fail(threads.error);
  const cur = (threads.data || []).find((x) => x.id === sel) || null;
  const msgs = cur ? (await sb.from("idea_messages").select("role,content,created_at").eq("thread_id", cur.id).order("id")).data || [] : [];
  const canChat = !cur || cur.status === "drafting";
  const autoRows = (auto.data || []).sort((a, b) => Object.keys(CAT).indexOf(a.category) - Object.keys(CAT).indexOf(b.category));

  $view.innerHTML = `
  <div class="page">
    <div class="phead"><div><h1>Studio</h1>
      <p class="muted">${esc(bug ? L("Prijavi grešku. Drži tipku i govori, ili piši. Možeš zalijepiti i ispraviti tekst prije slanja.",
        "Report a bug. Hold the button and speak, or type. You can paste and correct the text before sending.")
        : L("Zrinko, ovdje radiš dijelove aplikacije. Možeš dodati novi, promijeniti postojeći, obrisati ga, tražiti novi izgled ili vratiti obrisani. Drži tipku i govori, ili piši — tekst možeš ispraviti prije slanja.",
        "Zrinko, this is where you shape the app. You can add a section, change one, delete one, ask for a redesign, or bring a removed one back. Hold the button and speak, or type — you can correct the text before sending."))}</p></div>
      <a class="btn btn-ghost btn-sm" href="${archive ? base : base + "&archive=1"}">${archive ? esc(L("Aktivno", "Active")) : esc(L("Arhiva", "Archive"))}</a>
      <a class="btn btn-ghost btn-sm" href="${base}">+ ${esc(bug ? L("Nova prijava", "New report") : L("Nova ideja", "New idea"))}</a></div>
    ${studioTabs(kind)}
    <div class="grid">
      <section class="card span-8 idea-chat" aria-labelledby="ic" data-tab="${esc(L("razgovor", "chat"))}">
        <h2 id="ic">${esc(cur ? cur.title || L("Ideja", "Idea") : bug ? L("Nova prijava greške", "New bug report") : L("Nova ideja", "New idea"))}</h2>
        ${cur ? `<p class="small muted">${esc(pick(IDEA_STATUS, cur.status))}${cur.category ? " · " + esc(pick(CAT, cur.category)) : ""}</p>` : ""}
        <div class="idea-log" id="idea-log" aria-live="polite">
          ${msgs.length ? msgs.map((m) => `<div class="idea-msg ${m.role}"><span class="small muted">${esc(m.role === "user" ? "Zrinko" : "Studio")}${m.created_at ? " · " + fmtDate(m.created_at) : ""}</span><br>${esc(m.content)}</div>`).join("")
            : `<div class="idea-msg assistant">${esc(bug ? L("Što ne radi? Reci mi na kojem ekranu i što se dogodilo.", "What's broken? Tell me which screen and what happened.")
              : L("Bok Zrinko! Reci što želiš dodati, promijeniti, obrisati, preurediti ili vratiti.", "Hi Zrinko! Say what you want to add, change, delete, redesign, or bring back."))}</div>`}
        </div>
        ${cur?.brief ? `<details class="idea-brief" ${cur.status === "drafting" ? "open" : ""}><summary>${esc(L("Gotov opis za Nero", "Finished brief for Nero"))}</summary>
          <pre>${esc(JSON.stringify(cur.brief, null, 2))}</pre></details>` : ""}
        ${cur?.result_note ? `<p class="small">${esc(cur.result_note)}${cur.pr_url ? ` · <a href="${esc(cur.pr_url)}" target="_blank" rel="noopener">GitHub</a>` : ""}</p>` : ""}
        ${canChat && !archive ? `<form id="idea-form" class="idea-form">
          <div class="talk-row">
            <button class="ptt" id="ptt" type="button">${esc(L("Drži i govori", "Hold to talk"))}</button>
            <span class="ptt-live small muted" id="ptt-live"></span>
          </div>
          <label class="sr-only" for="idea-in">${esc(L("Poruka", "Message"))}</label>
          <textarea id="idea-in" rows="3" maxlength="2000" placeholder="${esc(L("Piši, zalijepi ili ispravi što si rekao…", "Type, paste, or correct what you said…"))}"></textarea>
          <div class="talk-tools">
            <button class="btn btn-ghost btn-sm" id="copy-chat" type="button">${esc(L("Kopiraj razgovor", "Copy chat"))}</button>
            <button class="btn btn-primary" type="submit">${esc(L("Pošalji", "Send"))}</button>
          </div>
        </form>
        <p class="small muted">${esc(L("Ne upisuj osobne podatke članova.", "Don't type members' personal data."))}</p>` : ""}
        ${cur?.status === "drafting" && cur.brief ? `<button class="btn btn-primary" id="idea-queue" type="button">${esc(L("Pošalji Nerou", "Send to Nero"))}</button>` : ""}
        ${cur?.status === "queued" ? `<button class="btn btn-ghost btn-sm" id="idea-unqueue" type="button">${esc(L("Vrati na doradu", "Take back to edit"))}</button>` : ""}
        ${cur && !archive ? `<button class="btn btn-ghost btn-sm" id="idea-archive" type="button">${esc(L("Arhiviraj", "Archive"))}</button>` : ""}
        ${cur && archive ? `<button class="btn btn-primary btn-sm" id="idea-unarchive" type="button">${esc(L("Vrati iz arhive", "Restore from archive"))}</button>` : ""}
      </section>

      <section class="card span-4" aria-labelledby="il" data-tab="${esc(L("popis", "list"))}">
        <h2 id="il">${esc(archive ? L("Arhiva", "Archive") : bug ? L("Prijave", "Reports") : L("Ideje", "Ideas"))}</h2>
        ${(threads.data || []).map((x) => `<a class="row" href="${base}${archive ? "&archive=1" : ""}&id=${x.id}"${x.id === sel ? ' aria-current="page"' : ""}>
            <span>${esc(x.title || L("Ideja", "Idea"))}</span><span class="small muted">${esc(pick(IDEA_STATUS, x.status))}</span></a>`).join("")
          || `<p class="muted small">${esc(archive ? L("Arhiva je prazna.", "The archive is empty.") : bug ? L("Nema prijava.", "No reports.") : L("Još nema ideja.", "No ideas yet."))}</p>`}
      </section>

      <section class="card span-12" aria-labelledby="ia" data-tab="${esc(L("ovlasti", "autonomy"))}">
        <h2 id="ia">${esc(L("Što Nero objavljuje sam", "What Nero ships on its own"))}</h2>
        <p class="muted small">${esc(L("Ostalo Nero pripremi i čeka Tonijevo odobrenje. Podaci i sigurnost uvijek čekaju Tonija.",
          "Everything else Nero prepares and waits for Toni's approval. Data and security always wait for Toni."))}</p>
        ${autoRows.map((a) => `<label class="toggle-row"><input type="checkbox" data-auto="${a.category}" ${a.auto_ship ? "checked" : ""}
          ${owner.data && a.category !== "data" ? "" : "disabled"}> <span>${esc(pick(CAT, a.category))}</span></label>`).join("")}
        ${owner.data ? "" : `<p class="small muted">${esc(L("Samo Toni može mijenjati ove ovlasti.", "Only Toni can change these."))}</p>`}
      </section>
    </div>
  </div>`;

  const log = document.getElementById("idea-log"); if (log) log.scrollTop = log.scrollHeight;
  if (archivedN) toast(L(`Arhivirano razgovora: ${archivedN}.`, `Archived chats: ${archivedN}.`));
  const form = document.getElementById("idea-form");
  if (form) wireStudioTalk(document.getElementById("idea-in"), log, msgs);
  if (form) form.onsubmit = async (e) => {
    e.preventDefault();
    const inp = document.getElementById("idea-in"), msg = inp.value.trim(); if (!msg) return;
    const btn = form.querySelector("button"); btn.disabled = true; inp.disabled = true;
    log.insertAdjacentHTML("beforeend", `<div class="idea-msg user">${esc(msg)}</div><div class="idea-msg assistant typing">…</div>`);
    log.scrollTop = log.scrollHeight;
    const { data, error } = await sb.functions.invoke("idea-agent", { body: { thread_id: cur?.id || null, message: msg, kind } });
    if (error || data?.error) {
      log.querySelector(".typing")?.remove(); btn.disabled = false; inp.disabled = false;
      const code = data?.error || (await error?.context?.json?.().catch(() => ({})))?.error;
      return toast({ not_configured: L("Asistent još nije uključen.", "The assistant isn't switched on yet."),
        daily_limit: L("Dosta za danas — nastavi sutra.", "That's enough for today — continue tomorrow."),
        thread_limit: L("Ova ideja ima previše poruka. Pošalji je ili počni novu.", "This idea has too many messages. Send it or start a new one."),
        model_busy: L("Asistent je zauzet, pokušaj za minutu.", "The assistant is busy, try again in a minute.") }[code] || t("error") + (code || ""), 4000);
    }
    if (!cur) { location.hash = `${base}&id=${data.thread_id}`; return; }
    if (data.ready) return viewIdeas(kind);
    else { log.querySelector(".typing").textContent = data.reply; log.querySelector(".typing").classList.remove("typing");
      inp.value = ""; btn.disabled = false; inp.disabled = false; inp.focus(); log.scrollTop = log.scrollHeight; }
  };
  const q = document.getElementById("idea-queue");
  if (q) q.onclick = async () => {
    const { error } = await sb.from("idea_threads").update({ status: "queued" }).eq("id", cur.id);
    error ? fail(error) : (toast(L("Poslano. Nero će se javiti ovdje.", "Sent. Nero will report back here.")), viewIdeas(kind));
  };
  const uq = document.getElementById("idea-unqueue");
  if (uq) uq.onclick = async () => {
    const { error } = await sb.from("idea_threads").update({ status: "drafting" }).eq("id", cur.id);
    error ? fail(error) : viewIdeas(kind);
  };
  const flipArchive = async (on) => {
    const { error } = await sb.rpc("set_idea_archive", { p_id: cur.id, p_archive: on });
    if (error) return fail(error);
    toast(on ? L("Razgovor je u arhivi.", "Chat archived.") : L("Razgovor je vraćen.", "Chat restored."));
    location.hash = on ? `${base}&archive=1` : `${base}&id=${cur.id}`;
  };
  const arch = document.getElementById("idea-archive");
  if (arch) arch.onclick = () => flipArchive(true);
  const unarch = document.getElementById("idea-unarchive");
  if (unarch) unarch.onclick = () => flipArchive(false);
  document.querySelectorAll("[data-auto]").forEach((c) => (c.onchange = async () => {
    const { error } = await sb.from("idea_autonomy").update({ auto_ship: c.checked, updated_at: new Date().toISOString() }).eq("category", c.dataset.auto);
    error ? (fail(error), (c.checked = !c.checked)) : toast(t("saved_ok"));
  }));
}


/* ---------- utility pages: ASC notched tab on every card ---------- */
function decorate() {
  const dict = [
    [t("history"), L("povijest", "history")], [t("privacy_title"), "gdpr"], [t("claim_title"), "admin"],
    [t("body_title"), L("mjere", "body")], [t("checkin_title"), L("ulaz", "entry")], [t("inside_title"), L("unutra", "inside")],
    [t("churn_title"), "radar"], [t("a_prices"), L("cijene", "prices")], [t("a_payment"), L("plaćanje", "payment")],
    [t("a_gallery"), L("galerija", "gallery")], [t("a_facts"), L("asistent", "assistant")], [t("a_motivation"), L("motivacija", "motivation")],
  ];
  const fallback = { "#/log": L("unos", "entry"), "#/progress": "e1RM", "#/profile": L("profil", "profile"), "#/desk": L("recepcija", "desk"), "#/admin": L("postavke", "settings"), "#/studio": "studio", "#/ideas": "studio" };
  const h = location.hash.split("?")[0];
  let n = 0;
  $view.querySelectorAll(".page label:not([for])").forEach((lab) => {
    if (lab.querySelector("input,select,textarea")) return;
    const ctl = lab.parentElement.querySelector("input,select,textarea");
    if (!ctl) return;
    if (!ctl.id) ctl.id = "f" + ++n;
    lab.htmlFor = ctl.id;
  });
  $view.querySelectorAll(".page .card").forEach((c) => {
    c.classList.add("reveal");
    if (c.querySelector(":scope > .tab-tl")) return;
    const h2 = c.querySelector(":scope > h2");
    const txt = h2 ? h2.textContent.trim() : "";
    const hit = dict.find(([k]) => txt && txt.startsWith(k));
    const tab = document.createElement("span");
    tab.className = "tab-tl"; tab.textContent = c.dataset.tab || (hit ? hit[1] : fallback[h] || "");
    c.prepend(tab);
  });
}

// The app opens on sign-in; signed-in members land on their dashboard.
// The public site stays reachable at #/site.
async function signOut() {
  await sb.auth.signOut();
  state.session = null; state.profile = null;
  if (location.hash === "#/login") route(); else location.hash = "#/login";
}

/* =========================================================
   ROUTER
   ========================================================= */
const ROUTES = {
  "#/site": viewLanding, "#/login": viewLogin,
  "#/app": viewDashboard, "#/log": viewLog, "#/progress": viewProgress, "#/profile": viewProfile, "#/desk": viewDesk, "#/admin": viewAdmin, "#/studio": viewStudio, "#/ideas": viewStudio,
};
const PROTECTED = new Set(["#/app", "#/log", "#/progress", "#/profile", "#/desk", "#/admin", "#/studio", "#/ideas"]);

const navigationMotion = createNavigationMotion(history);
window.addEventListener("popstate", navigationMotion.onPop);
async function route() {
  let h = location.hash.split("?")[0] || "#/";
  if (!ROUTES[h]) {
    h = state.session ? "#/app" : "#/login";
    history.replaceState(history.state, "", h);
  }
  const direction = navigationMotion.take();
  delete document.documentElement.dataset.nav;
  if (PROTECTED.has(h) && !state.session) { location.hash = "#/login"; return; }
  if (h !== "#/login") { document.body.classList.remove("is-auth"); $auth.innerHTML = ""; clearInterval(viewLogin._iv); }
  document.documentElement.classList.remove("side-open");
  if (h !== "#/log") leaveWorkout();
  wireStream.cleanup?.();
  renderDock.cleanup?.();
  document.querySelectorAll("dialog.photo-dlg,dialog.pr-dlg,dialog.plates-dlg").forEach((d) => d.remove());
  renderNav(h);
  try { await ROUTES[h](); } catch (e) { fail(e); }
  document.documentElement.dataset.nav = direction;
  if (!["#/", "#/site", "#/app", "#/login"].includes(h)) decorate();
  fitNotches();
  if (h !== "#/login") $view.focus({ preventScroll: true });
  const section = new URLSearchParams(location.hash.split("?")[1] || "").get("section");
  const target = ["prices", "hours", "contact", "visit"].includes(section) ? document.getElementById(section) : null;
  if (target) target.scrollIntoView({ block: "start" });
  else window.scrollTo(0, 0);
  if (section === "pass" && h === "#/app") document.getElementById("pass-open")?.click();
}

(async function boot() {
  const { data } = await sb.auth.getSession();
  state.session = data.session;
  await loadProfile();
  if (location.search.includes("code=")) history.replaceState(null, "", location.pathname + "#/app");
  sb.auth.onAuthStateChange(async (event, session) => {
    const was = !!state.session;
    state.session = session;
    if (event === "SIGNED_IN" && !was) {
      // Supabase advises not awaiting its own calls inside this callback.
      setTimeout(async () => { await loadProfile(); if (location.hash !== "#/app") location.hash = "#/app"; else route(); }, 0);
    }
    if (event === "SIGNED_OUT" && location.hash !== "#/login") { state.profile = null; location.hash = "#/login"; }
  });
  window.addEventListener("hashchange", route);
  await startSplash(route);
})();
