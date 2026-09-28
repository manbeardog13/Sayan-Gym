// Saiyan Gym FITT — Members and passes at the Front desk.
// Staff find a member by name, see their pass and check them in without the QR code.
// Admins give a pass (renewing the same plan extends it, so the member's QR keeps working),
// cancel one, and renew the passes that end this week. The database does the checks
// (give_pass / cancel_pass are admin-only) and keeps the audit log.

const SOON_DAYS = 7;

// The member's pass that counts now: active, not ended, latest end first.
function currentPass(rows, now = new Date()) {
  const end = (m) => (m.ends_at ? new Date(m.ends_at).getTime() : Infinity);
  return (rows || []).filter((m) => m.status === "active" && end(m) > now.getTime()).sort((a, b) => end(b) - end(a))[0] || null;
}

// Whole days left, counting today; null for a pass with no end date.
function daysLeft(endsAt, now = new Date()) {
  if (!endsAt) return null;
  return Math.max(0, Math.ceil((new Date(endsAt) - now) / 864e5));
}

function passLine(m, now = new Date()) {
  if (!m) return { cls: "none", text: L("Nema važeću članarinu", "No valid pass") };
  const d = daysLeft(m.ends_at, now);
  const name = nameOf(m.membership_plans) || L("Članarina", "Membership");
  if (d == null) return { cls: "ok", text: name };
  return { cls: d <= SOON_DAYS ? "soon" : "ok", text: `${name} · ${L("do", "until")} ${fmtDate(m.ends_at)} (${L(`još ${d} d`, `${d} d left`)})` };
}

// Days to prefill for a plan: its own length, a day pass is 1, otherwise the desk types it in.
const planDays = (p) => (p?.duration_days ? String(p.duration_days) : p?.kind === "day" ? "1" : "");

function passFormHtml(plans, pickPlan) {
  const opts = plans.map((p) => `<option value="${esc(p.id)}" data-days="${esc(planDays(p))}"${p.id === pickPlan ? " selected" : ""}>${esc(nameOf(p))}${p.price_eur != null ? ` · €${esc(p.price_eur)}` : ""}</option>`).join("");
  const first = plans.find((p) => p.id === pickPlan) || plans[0];
  return `<div class="form-grid pd-form" style="margin-top:10px">
    <div><label for="pd-plan">${esc(L("Članarina", "Plan"))}</label><select id="pd-plan">${opts}</select></div>
    <div><label for="pd-days">${esc(L("Dana", "Days"))}</label><input id="pd-days" inputmode="numeric" value="${esc(planDays(first))}"></div>
    <div><label for="pd-src">${esc(L("Plaćeno", "Paid via"))}</label><select id="pd-src">
      <option value="desk">${esc(L("Na recepciji", "At the desk"))}</option>
      <option value="multisport">Multisport</option>
      <option value="online">${esc(L("Online", "Online"))}</option></select></div>
    <div><button class="btn btn-primary btn-sm" id="pd-give" type="button">${esc(L("Potvrdi", "Confirm"))}</button>
      <button class="btn btn-ghost btn-sm" id="pd-close" type="button">${esc(L("Zatvori", "Close"))}</button></div>
  </div>`;
}

function memberRowHtml(p, m, admin, now = new Date()) {
  const s = passLine(m, now);
  return `<div class="risk pd-member" data-member="${esc(p.id)}">
    <div><strong>${esc(p.display_name || "—")}</strong><br><span class="small pd-${s.cls}">${esc(s.text)}</span></div>
    <div class="pd-actions">
      ${m ? `<button class="btn btn-primary btn-sm" type="button" data-pd-in="${esc(p.id)}">${esc(L("Prijavi ulazak", "Check in"))}</button>` : ""}
      ${admin ? `<button class="btn btn-ghost btn-sm" type="button" data-pd-give="${esc(p.id)}" data-pd-plan="${esc(m?.plan_id || "")}">${esc(m ? L("Produži", "Renew") : L("Daj članarinu", "Give pass"))}</button>` : ""}
      ${admin && m ? `<button class="btn btn-ghost btn-sm" type="button" data-pd-cancel="${esc(m.id)}">${esc(L("Poništi", "Cancel pass"))}</button>` : ""}
    </div>
  </div>`;
}

async function passesDeskHtml() {
  const now = new Date(), soon = new Date(now.getTime() + SOON_DAYS * 864e5);
  const { data: ending } = await sb.from("memberships").select("id, user_id, plan_id, ends_at, membership_plans(name_hr,name_en)")
    .eq("status", "active").gt("ends_at", now.toISOString()).lte("ends_at", soon.toISOString()).order("ends_at").limit(30);
  const ids = [...new Set((ending || []).map((m) => m.user_id))];
  const { data: names } = ids.length ? await sb.from("profiles").select("id, display_name").in("id", ids) : { data: [] };
  const nm = Object.fromEntries((names || []).map((n) => [n.id, n.display_name]));
  return `<section class="card span-12" aria-labelledby="pd-h" data-tab="${esc(L("članarine", "passes"))}">
    <h2 id="pd-h">${esc(L("Članovi i članarine", "Members and passes"))}</h2>
    <p class="muted small">${esc(isAdmin()
      ? L("Nađi člana po imenu. Produženje iste članarine zadržava njegov QR kod.", "Find a member by name. Renewing the same plan keeps their QR code.")
      : L("Nađi člana po imenu i prijavi ulazak bez QR koda.", "Find a member by name and check them in without the QR code."))}</p>
    <label for="pd-q">${esc(L("Član", "Member"))}</label>
    <input id="pd-q" type="search" autocomplete="off" placeholder="${esc(L("Traži po imenu", "Search by name"))}">
    <div id="pd-hits" aria-live="polite"></div>
    <h3 style="margin-top:16px">${esc(L(`Ističe u ${SOON_DAYS} dana`, `Ending in the next ${SOON_DAYS} days`))} · ${(ending || []).length}</h3>
    ${(ending || []).length ? ending.map((m) => `<div class="row"><span>${esc(nm[m.user_id] || "—")} <span class="small muted">${esc(nameOf(m.membership_plans))}</span></span>
      <span class="small">${esc(fmtDate(m.ends_at))} · ${esc(L(`još ${daysLeft(m.ends_at, now)} d`, `${daysLeft(m.ends_at, now)} d left`))}
      ${isAdmin() ? ` <button class="btn btn-ghost btn-sm" type="button" data-pd-renew="${esc(m.user_id)}" data-pd-plan="${esc(m.plan_id)}">${esc(L("Produži", "Renew"))}</button>` : ""}</span></div>`).join("")
      : `<p class="muted small">${esc(L("Nitko ovaj tjedan.", "Nobody this week."))}</p>`}
  </section>`;
}

function wirePassesDesk(reload) {
  const q = document.getElementById("pd-q"), hits = document.getElementById("pd-hits");
  if (!q) return;
  let tmr, plans = null;
  const loadPlans = async () => {
    if (plans) return plans;
    const { data, error } = await sb.from("membership_plans").select("id, kind, name_hr, name_en, price_eur, duration_days, sort").neq("kind", "addon").order("sort");
    if (error) throw error;
    return (plans = data || []);
  };

  const show = async (term) => {
    const s = term.trim().replace(/[%_,()]/g, "");
    if (s.length < 2) return (hits.innerHTML = "");
    const { data: people, error } = await sb.from("profiles").select("id, display_name").ilike("display_name", `%${s}%`).order("display_name").limit(8);
    if (error) return fail(error);
    const ids = (people || []).map((p) => p.id);
    const { data: ms } = ids.length ? await sb.from("memberships").select("id, user_id, plan_id, status, ends_at, membership_plans(name_hr,name_en)")
      .in("user_id", ids).eq("status", "active") : { data: [] };
    const now = new Date();
    hits.innerHTML = (people || []).length
      ? people.map((p) => memberRowHtml(p, currentPass((ms || []).filter((m) => m.user_id === p.id), now), isAdmin(), now)).join("")
      : `<p class="muted small">${esc(L("Nitko s tim imenom.", "Nobody with that name."))}</p>`;
    wireRows();
  };

  const openForm = async (row, userId, planId) => {
    document.querySelectorAll(".pd-form").forEach((f) => f.remove());
    let list;
    try { list = await loadPlans(); } catch (e) { return fail(e); }
    if (!list.length) return toast(L("Prvo dodaj članarinu u Postavkama.", "Add a plan in Settings first."));
    row.insertAdjacentHTML("afterend", passFormHtml(list, planId));
    const plan = document.getElementById("pd-plan"), days = document.getElementById("pd-days");
    plan.onchange = () => (days.value = plan.selectedOptions[0].dataset.days);
    days.focus();
    document.getElementById("pd-close").onclick = () => document.querySelector(".pd-form")?.remove();
    document.getElementById("pd-give").onclick = async (e) => {
      const n = parseInt(days.value, 10);
      if (!(n >= 1 && n <= 400)) return toast(L("Upiši broj dana (1–400).", "Enter the number of days (1–400)."));
      e.target.disabled = true;
      const { data, error } = await sb.rpc("give_pass", { p_user: userId, p_plan: plan.value, p_days: n, p_source: document.getElementById("pd-src").value });
      if (error) { e.target.disabled = false; return fail(error); }
      const r = Array.isArray(data) ? data[0] : data;
      toast(r?.extended
        ? L(`Produženo do ${fmtDate(r.ends_at)}. QR kod ostaje isti.`, `Extended to ${fmtDate(r.ends_at)}. Same QR code.`)
        : L(`Članarina vrijedi do ${fmtDate(r?.ends_at)}.`, `Pass valid until ${fmtDate(r?.ends_at)}.`), 4000);
      reload();
    };
  };

  function wireRows() {
    hits.querySelectorAll("[data-pd-in]").forEach((b) => (b.onclick = async () => {
      b.disabled = true;
      const { error } = await sb.from("check_ins").insert({ user_id: b.dataset.pdIn });
      if (error) { b.disabled = false; return fail(error); }
      toast(t("checked_in", b.closest(".pd-member").querySelector("strong").textContent)); reload();
    }));
    hits.querySelectorAll("[data-pd-give]").forEach((b) => (b.onclick = () => openForm(b.closest(".pd-member"), b.dataset.pdGive, b.dataset.pdPlan)));
    hits.querySelectorAll("[data-pd-cancel]").forEach((b) => (b.onclick = async () => {
      const who = b.closest(".pd-member").querySelector("strong").textContent;
      if (!confirm(L(`Poništiti članarinu za ${who}? QR kod prestaje vrijediti.`, `Cancel ${who}'s pass? Their QR code stops working.`))) return;
      const { error } = await sb.rpc("cancel_pass", { p_membership: b.dataset.pdCancel });
      if (error) return fail(error);
      toast(L("Članarina poništena.", "Pass cancelled.")); show(q.value);
    }));
  }

  q.oninput = () => { clearTimeout(tmr); tmr = setTimeout(() => show(q.value), 250); };
  document.querySelectorAll("[data-pd-renew]").forEach((b) => (b.onclick = () => openForm(b.closest(".row"), b.dataset.pdRenew, b.dataset.pdPlan)));
}
