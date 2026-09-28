// Saiyan Gym FITT — "Ready to launch" checklist at the top of Settings (admin only).
// It reads what is already set and ticks itself off; each open item jumps to the
// place where it gets done. Nothing here changes data.

const zagrebMonthStart = (now = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zagreb", year: "numeric", month: "2-digit" }).format(now) + "-01";

// facts: { pass, mail, gemini (true/false/null = couldn't check), plans, review, photos, quests }
function launchItems(f) {
  const unpriced = (f.plans || []).filter((p) => p.is_published && p.kind !== "addon" && p.kind !== "pt" && p.price_eur == null);
  return [
    { key: "pass", need: true, done: !!f.pass, go: "#/desk",
      title: L("Daj prvu članarinu", "Give the first pass"),
      why: L("Bez važeće članarine nema QR koda ni prijave na ulazu.", "Without a valid pass there is no QR code and no check-in.") },
    { key: "mail", need: true, done: f.mail, go: "amail",
      title: L("Uključi službeni Gmail", "Switch on the gym Gmail"),
      why: L("Članovi bez Google računa prijavljuju se poveznicom e-poštom.", "Members without a Google account sign in with an email link.") },
    { key: "prices", need: false, done: unpriced.length === 0, go: "ap",
      title: L("Upiši cijene", "Add prices"),
      why: unpriced.length ? L(`Bez cijene: ${unpriced.map(nameOf).join(", ")} — prikazuje se „Na upit”.`, `No price: ${unpriced.map(nameOf).join(", ")}, shown as "On request".`) : "" },
    { key: "review", need: false, done: !!f.review, go: "atrip",
      title: L("Dodaj poveznicu za Google recenzije", "Add the Google review link"),
      why: L("Bez nje članovi ne vide poziv za recenziju.", "Without it members never see the review request.") },
    { key: "photos", need: false, done: (f.photos || 0) > 0, go: "agal",
      title: L("Dodaj fotografije teretane", "Add gym photos"),
      why: L("Galerija na stranici ostaje skrivena.", "The gallery on the site stays hidden.") },
    { key: "quests", need: false, done: (f.quests || 0) > 0, go: "acrew",
      title: L("Postavi izazove za ovaj mjesec", "Set this month's quests"),
      why: L("Kartica izazova ostaje prazna.", "The quests card stays empty.") },
    { key: "gemini", need: false, done: f.gemini, go: "amail",
      title: L("Uključi Studio (Gemini ključ)", "Switch on Studio (Gemini key)"),
      why: L("Neobavezno. Besplatni Googleov ključ za pisanje objava.", "Optional. A free Google key for writing posts.") },
  ];
}

function launchHtml(items) {
  const open = items.filter((i) => i.done !== true);
  if (!open.length) return `<section class="card span-12 launch done" aria-labelledby="alaunch">
    <h2 id="alaunch">${esc(L("Spremno za rad", "Ready to launch"))} ✓</h2>
    <p class="muted small">${esc(L("Sve je postavljeno.", "Everything is set."))}</p></section>`;
  const needLeft = open.filter((i) => i.need && i.done === false).length, unchecked = open.some((i) => i.done == null);
  const row = (i) => `<li class="launch-item ${i.done === true ? "ok" : i.done == null ? "unknown" : "todo"}">
    <span class="launch-mark" aria-hidden="true">${i.done === true ? "✓" : i.done == null ? "?" : ""}</span>
    <div><b>${esc(i.title)}</b>${i.need && i.done !== true ? ` <span class="launch-need">${esc(L("potrebno", "needed"))}</span>` : ""}
      <span class="sr-only">${esc(i.done === true ? L("gotovo", "done") : i.done == null ? L("nije provjereno", "couldn't check") : L("nije gotovo", "not done"))}</span>
      ${i.done !== true && (i.done == null || i.why) ? `<br><span class="small muted">${esc(i.done == null ? L("Nije moguće provjeriti sada.", "Couldn't check right now.") : i.why)}</span>` : ""}</div>
    ${i.done !== true ? `<button class="btn btn-ghost btn-sm" type="button" data-launch-go="${esc(i.go)}">${esc(L("Idi", "Go"))}</button>` : ""}
  </li>`;
  return `<section class="card span-12 launch" aria-labelledby="alaunch">
    <h2 id="alaunch">${esc(L("Spremno za rad?", "Ready to launch?"))} <span class="count-badge">${items.length - open.length}/${items.length}</span></h2>
    <p class="muted small">${esc(needLeft
      ? L(`Još ${needLeft} potrebno za rad, ostalo je preporuka.`, `${needLeft} still needed to launch; the rest are recommended.`)
      : unchecked ? L("Neke stavke sada nije moguće provjeriti.", "Some items couldn't be checked right now.")
      : L("Potrebno je gotovo. Ostalo je preporuka.", "The essentials are done. The rest are recommended."))}</p>
    <ol class="launch-list">${items.map(row).join("")}</ol>
  </section>`;
}

async function launchFacts({ plans, settings, photos, wire }) {
  const [ms, qs] = await Promise.all([
    sb.from("memberships").select("id").limit(1),
    sb.from("quests").select("id").eq("month", zagrebMonthStart()).limit(1),
  ]);
  return {
    pass: (ms.data || []).length > 0, quests: (qs.data || []).length,
    mail: wire ? !!wire.wired : null, gemini: wire ? !!wire.gemini : null,
    plans, review: !!settings.review_url, photos: (photos || []).length,
  };
}

function wireLaunch() {
  document.querySelectorAll("[data-launch-go]").forEach((b) => (b.onclick = () => {
    const go = b.dataset.launchGo;
    if (go.startsWith("#")) { location.hash = go; return; }
    const h = document.getElementById(go);
    if (!h) return;
    const card = h.closest("section") || h;
    card.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    const field = card.querySelector("input, select, textarea, button");
    if (field) setTimeout(() => field.focus({ preventScroll: true }), 350);
  }));
}
