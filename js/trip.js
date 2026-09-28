// Saiyan Gym FITT — trip passport, return-visit code and the Google review prompt.
// Passport: one stamp per day the member trained here (from their own check-ins), and a
// "Trained at Saiyan Gym" card drawn on the phone. Return code: only when the gym has
// written an offer in Settings; used once at the desk. Review prompt: the same neutral
// link for everyone after a finished visit, never tied to the offer (Google's rules).

const REVIEW_SNOOZE_DAYS = 30;
const RETURN_CODE_RE = /^BACK-[0-9A-F]{6}$/;
// Same hosts the database accepts (site_settings_review_url_google).
const REVIEW_URL_RE = /^https:\/\/(g\.page|search\.google\.com|(www\.|maps\.)?google\.(com|hr)|maps\.app\.goo\.gl)\/[^\s"'<>]*$/;

const zagrebDay = (ts) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zagreb", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ts));

// Distinct training days, oldest first.
function passportDays(checkins) {
  return [...new Set((checkins || []).map((c) => zagrebDay(c.checked_in_at)))].sort();
}

// A visit is finished once the member checked out or came in over an hour ago.
function visitFinished(checkins, now = new Date()) {
  return (checkins || []).some((c) => c.checked_out_at || now - new Date(c.checked_in_at) >= 3600e3);
}

const reviewKey = () => `sg.review.${state.session?.user?.id || "anon"}`;
function reviewState() { try { return JSON.parse(localStorage.getItem(reviewKey()) || "{}"); } catch (e) { return {}; } }
function setReviewState(v) { try { localStorage.setItem(reviewKey(), JSON.stringify(v)); } catch (e) {} }
function reviewDue(url, checkins, st, now = new Date()) {
  if (!url || !REVIEW_URL_RE.test(url) || st.done) return false;
  if (st.snoozedAt && now - new Date(st.snoozedAt) < REVIEW_SNOOZE_DAYS * 864e5) return false;
  return visitFinished(checkins, now);
}

const stampLabel = (day) => new Date(day + "T12:00:00Z").toLocaleDateString(LANG === "hr" ? "hr-HR" : "en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

function passportHtml(days, offer, code) {
  if (!days.length) return "";
  const shown = days.slice(-12);
  return `<section class="card trip reveal" aria-labelledby="trip-h">
    <span class="tab-tl">${esc(L("putovnica", "passport"))}</span>
    <h3 id="trip-h">${esc(L("Putovnica teretane", "Gym passport"))} <span class="count-badge">${days.length}</span></h3>
    <p class="muted small">${esc(L(`Pečat za svaki dan treninga u Dubrovniku. Prvi: ${stampLabel(days[0])}.`, `A stamp for each day you trained in Dubrovnik. First: ${stampLabel(days[0])}.`))}</p>
    <ol class="stamps">${shown.map((d, i) => `<li class="stamp"><b>${days.length - shown.length + i + 1}</b><span>${esc(stampLabel(d))}</span></li>`).join("")}</ol>
    <label class="toggle-row small"><input type="checkbox" id="trip-name"> <span>${esc(L("Prikaži moje ime na kartici", "Show my first name on the card"))}</span></label>
    <button class="btn btn-primary btn-sm" id="trip-share" type="button">${esc(L("Podijeli karticu", "Share card"))}</button>
    ${offer && code ? `<div class="trip-code">
      <span class="small muted">${esc(L("Vraćaš se? Pokaži ovaj kod na recepciji:", "Coming back? Show this code at the desk:"))}</span>
      <code>${esc(code.code)}</code>
      <span class="small">${code.redeemed_at ? esc(L(`Iskorišten ${fmtDate(code.redeemed_at)}.`, `Used on ${fmtDate(code.redeemed_at)}.`)) : esc(offer)}</span>
    </div>` : ""}
  </section>`;
}

function reviewHtml(url) {
  return `<section class="card review-ask reveal" aria-labelledby="rv-h">
    <h3 id="rv-h">${esc(L("Kako ti je bilo?", "How was your training?"))}</h3>
    <p class="muted small">${esc(L("Napiši drugima na Googleu kakav je trening kod nas — što god misliš.", "Tell other people on Google what training here is like, whatever you think."))}</p>
    <div class="inline-actions">
      <a class="btn btn-primary btn-sm" id="rv-go" target="_blank" rel="noopener" href="${esc(url)}">${esc(L("Napiši Google recenziju", "Write a Google review"))}</a>
      <button class="btn btn-ghost btn-sm" id="rv-later" type="button">${esc(L("Ne sada", "Not now"))}</button>
    </div>
  </section>`;
}

// Dashboard: passport and review cards (empty when there is nothing to show).
async function tripDashHtml(settings) {
  const uid = state.session.user.id;
  const { data: ci } = await sb.from("check_ins").select("checked_in_at, checked_out_at").eq("user_id", uid)
    .order("checked_in_at", { ascending: false }).limit(400);
  const days = passportDays(ci);
  const offer = (settings.return_offer || "").trim();
  let code = null;
  if (offer && days.length) { const { data } = await sb.rpc("my_return_code"); code = (Array.isArray(data) ? data[0] : data) || null; }
  const url = settings.review_url || "";
  tripDashHtml.last = { days };
  return passportHtml(days, offer, code) + (reviewDue(url, ci, reviewState()) ? reviewHtml(url) : "");
}

function wireTrip() {
  const share = document.getElementById("trip-share");
  if (share) share.onclick = async () => {
    share.disabled = true;
    try {
      const name = document.getElementById("trip-name").checked ? (state.profile?.display_name || "").split(" ")[0] : "";
      const f = new File([await tripCardBlob(tripDashHtml.last.days, name)], "saiyan-passport.jpg", { type: "image/jpeg" });
      if (navigator.canShare && navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f], text: "#saiyangym #dubrovnik" }); } catch (e) {} }
      else { const a = document.createElement("a"); a.href = URL.createObjectURL(f); a.download = f.name; a.click(); }
    } finally { share.disabled = false; }
  };
  const go = document.getElementById("rv-go");
  if (go) {
    const hide = () => go.closest(".review-ask").remove();
    go.onclick = () => { setReviewState({ done: true }); setTimeout(hide, 300); };
    document.getElementById("rv-later").onclick = () => { setReviewState({ snoozedAt: new Date().toISOString() }); hide(); };
  }
}

// "Trained at Saiyan Gym" card, drawn on the phone: 1080×1350 JPEG. Nothing is uploaded.
async function tripCardBlob(days, firstName) {
  const W = 1080, H = 1350, c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d");
  const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, "#15171d"); g.addColorStop(1, "#0a0c11"); x.fillStyle = g; x.fillRect(0, 0, W, H);
  const r = x.createRadialGradient(880, 200, 0, 880, 200, 900); r.addColorStop(0, "rgba(255,174,26,.26)"); r.addColorStop(1, "rgba(255,174,26,0)"); x.fillStyle = r; x.fillRect(0, 0, W, H);
  try { await document.fonts.load("800 80px Sora"); } catch (e) {}
  x.fillStyle = "rgba(244,245,247,.72)"; x.font = "700 34px Sora, sans-serif"; x.fillText(L("TRENIRAO/LA U", "TRAINED AT"), 90, 170);
  x.fillStyle = "#ffae1a"; x.font = "italic 800 120px Sora, sans-serif"; x.fillText("SAIYAN", 84, 300);
  x.fillStyle = "#f4f5f7"; x.font = "700 40px Sora, sans-serif"; x.fillText("GYM FITT · DUBROVNIK", 90, 360);
  x.fillStyle = "#ffd566"; x.font = "800 200px Sora, sans-serif"; x.fillText(String(days.length), 84, 600);
  x.fillStyle = "#f4f5f7"; x.font = "600 48px Inter, sans-serif";
  x.fillText(days.length === 1 ? L("dan treninga", "day trained") : L("dana treninga", "days trained"), 90, 670);
  // up to 12 stamps, 4 per row
  const shown = days.slice(-12);
  shown.forEach((d, i) => {
    const cx = 170 + (i % 4) * 246, cy = 800 + Math.floor(i / 4) * 150;
    x.save(); x.translate(cx, cy); x.rotate(((i * 37) % 11 - 5) * Math.PI / 180);
    x.strokeStyle = "rgba(255,174,26,.9)"; x.lineWidth = 5; x.beginPath(); x.arc(0, 0, 62, 0, Math.PI * 2); x.stroke();
    const dt = new Date(d + "T12:00:00Z");
    x.fillStyle = "#ffae1a"; x.textAlign = "center"; x.font = "800 46px Sora, sans-serif"; x.fillText(String(dt.getUTCDate()), 0, 8);
    x.font = "700 22px Inter, sans-serif"; x.fillText(dt.toLocaleDateString(LANG === "hr" ? "hr-HR" : "en-GB", { month: "short", timeZone: "UTC" }).toUpperCase().replace(".", ""), 0, 38);
    x.restore();
  });
  x.textAlign = "left";
  if (firstName) { x.fillStyle = "#f4f5f7"; x.font = "700 44px Sora, sans-serif"; x.fillText(firstName, 90, 1230); }
  x.fillStyle = "rgba(244,245,247,.55)"; x.font = "500 34px Inter, sans-serif"; x.fillText("@saiyan_gym_fitt", 90, 1285);
  return new Promise((res) => c.toBlob(res, "image/jpeg", 0.92));
}

/* ---------- Front desk: use a return code ---------- */
function returnDeskHtml(settings) {
  const offer = (settings.return_offer || "").trim();
  if (!offer) return "";
  return `<section class="card span-6" aria-labelledby="rd-h">
    <h2 id="rd-h">${esc(L("Kod za povratak", "Return code"))}</h2>
    <p class="muted small">${esc(L("Ponuda:", "Offer:"))} ${esc(offer)}</p>
    <div class="inline-form">
      <label class="sr-only" for="rd-code">${esc(L("Kod", "Code"))}</label>
      <input id="rd-code" placeholder="BACK-XXXXXX" autocapitalize="characters" autocomplete="off">
      <button class="btn btn-primary" id="rd-use" type="button">${esc(L("Iskoristi", "Use code"))}</button>
    </div>
  </section>`;
}

function wireReturnDesk() {
  const btn = document.getElementById("rd-use");
  if (!btn) return;
  const input = document.getElementById("rd-code");
  const use = async () => {
    const code = input.value.trim().toUpperCase();
    if (!RETURN_CODE_RE.test(code)) return toast(L("Kod izgleda ovako: BACK-1A2B3C", "A code looks like BACK-1A2B3C"));
    btn.disabled = true;
    const { data, error } = await sb.rpc("redeem_return_code", { p_code: code });
    btn.disabled = false;
    if (error) return toast(/not found/.test(error.message) ? L("Taj kod ne postoji.", "That code doesn't exist.") : error.message, 4000);
    const r = Array.isArray(data) ? data[0] : data;
    toast(r?.already_used
      ? L(`Već iskorišten ${fmtDate(r.used_at)} (${r.display_name || "—"}).`, `Already used on ${fmtDate(r.used_at)} (${r.display_name || "—"}).`)
      : L(`Vrijedi — ${r?.display_name || "—"}. Primijeni ponudu.`, `Valid: ${r?.display_name || "—"}. Apply the offer.`), 5000);
    if (!r?.already_used) input.value = "";
  };
  btn.onclick = use;
  input.onkeydown = (e) => e.key === "Enter" && use();
}

/* ---------- Settings: review link and return offer ---------- */
function tripSettingsHtml(settings) {
  return `<section class="card span-6" aria-labelledby="atrip">
    <h2 id="atrip">${esc(L("Google recenzije i povratak", "Google reviews and return visits"))}</h2>
    <label for="rv-url">${esc(L("Poveznica za Google recenziju", "Google review link"))}</label>
    <input id="rv-url" type="url" placeholder="https://g.page/r/…/review" value="${esc(settings.review_url || "")}">
    <p class="muted small">${esc(L("Svi članovi vide isti poziv nakon posjeta. Google zabranjuje nagrade za recenzije i traženje recenzija samo od zadovoljnih.", "Every member sees the same request after a visit. Google bans rewards for reviews and asking only happy customers."))}</p>
    <label for="rv-offer">${esc(L("Ponuda za povratak (neobavezno)", "Return-visit offer (optional)"))}</label>
    <input id="rv-offer" maxlength="140" placeholder="${esc(L("npr. 10 % popusta na sljedeću dnevnu kartu", "e.g. 10% off your next day pass"))}" value="${esc(settings.return_offer || "")}">
    <p class="muted small">${esc(L("Kad je upisana, član nakon prvog posjeta dobije osobni kod. Nikad nije vezana uz recenziju.", "When set, members get a personal code after their first visit. It is never linked to a review."))}</p>
    <button class="btn btn-primary btn-sm" id="save-trip" type="button" style="margin-top:10px">${esc(t("save"))}</button>
  </section>`;
}

function wireTripSettings() {
  const btn = document.getElementById("save-trip");
  if (!btn) return;
  btn.onclick = async () => {
    const url = document.getElementById("rv-url").value.trim(), offer = document.getElementById("rv-offer").value.trim();
    if (url && !REVIEW_URL_RE.test(url)) return toast(L("Zalijepi Googleovu poveznicu (g.page, search.google.com ili maps.app.goo.gl).", "Paste Google's own link (g.page, search.google.com or maps.app.goo.gl)."), 4500);
    if (offer.length > 140) return toast(L("Ponuda najviše 140 znakova.", "Offer: 140 characters at most."));
    const at = new Date().toISOString();
    const { error } = await sb.from("site_settings").upsert([{ key: "review_url", value: url || null, updated_at: at }, { key: "return_offer", value: offer || null, updated_at: at }]);
    error ? fail(error) : toast(t("saved_ok"));
  };
}
