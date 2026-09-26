/* Saiyan Gym FITT — Studio (admin): ideas, bug reports and the post composer.
   Loaded before app.js; uses its globals (sb, esc, L, t, toast, fail, $view, isAdmin) at call time. */

/* ---------- Studio shell: Idea · Bug · Post ---------- */
function studioTabs(active) {
  const tab = (key, href, label, sub) => `<a class="studio-tab${active === key ? " on" : ""}" href="${href}"${active === key ? ' aria-current="page"' : ""}>
    <b>${esc(label)}</b><span>${esc(sub)}</span></a>`;
  return `<nav class="studio-tabs" aria-label="Studio">
    ${tab("idea", "#/studio?tab=idea", L("Ideja", "Idea"), L("Nešto novo za aplikaciju", "Something new for the app"))}
    ${tab("bug", "#/studio?tab=bug", L("Greška", "Bug"), L("Nešto ne radi", "Something is broken"))}
    ${tab("post", "#/studio?tab=post", L("Objava", "Post"), L("Novosti i Instagram", "News and Instagram"))}
  </nav>`;
}
function studioParams() { return new URLSearchParams(location.hash.split("?")[1] || ""); }

/* Hold-to-talk fills the composer. Zrinko can still type, paste, and edit before sending. */
function wireStudioTalk(textarea, logEl, messages) {
  const ptt = document.getElementById("ptt");
  const live = document.getElementById("ptt-live");
  const copy = document.getElementById("copy-chat");
  if (copy) copy.onclick = async () => {
    const text = (messages || []).map((m) => `${m.role === "user" ? "Zrinko" : "Studio"}: ${m.content}`).join("\n\n");
    try { await navigator.clipboard.writeText(text || textarea?.value || ""); toast(L("Razgovor je kopiran.", "Chat copied.")); }
    catch (e) { toast(L("Kopiranje nije uspjelo. Označi tekst ručno.", "Copy failed. Select the text yourself.")); }
  };
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!ptt || !Rec) {
    if (ptt) ptt.hidden = true;
    if (live) live.textContent = L("Govor nije dostupan u ovom pregledniku. Piši ili zalijepi.", "Speech isn't available in this browser. Type or paste.");
    return;
  }
  const rec = new Rec();
  rec.lang = (typeof LANG !== "undefined" && LANG === "en") ? "en-US" : "hr-HR";
  rec.continuous = true;
  rec.interimResults = true;
  let holding = false, finalText = "";
  const stop = () => {
    holding = false; ptt.classList.remove("on");
    try { rec.stop(); } catch (e) {}
  };
  rec.onresult = (ev) => {
    let interim = "";
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const bit = ev.results[i][0].transcript;
      if (ev.results[i].isFinal) finalText += bit;
      else interim += bit;
    }
    if (live) live.textContent = (finalText + interim).trim();
  };
  rec.onend = () => {
    const said = (finalText || live?.textContent || "").trim();
    finalText = "";
    if (said && textarea) {
      const cur = textarea.value.trim();
      textarea.value = cur ? `${cur} ${said}` : said;
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }
    if (live) live.textContent = said ? L("Možeš ispraviti tekst, pa poslati.", "You can correct the text, then send.") : "";
    ptt.classList.remove("on");
  };
  rec.onerror = () => { if (live) live.textContent = L("Nisam čuo. Drži tipku i govori opet, ili piši.", "I didn't hear that. Hold the button and speak again, or type."); stop(); };
  const start = (e) => {
    e.preventDefault();
    if (holding) return;
    holding = true; finalText = ""; ptt.classList.add("on");
    if (live) live.textContent = L("Slušam…", "Listening…");
    try { rec.start(); } catch (err) { stop(); }
  };
  ptt.addEventListener("pointerdown", start);
  ptt.addEventListener("pointerup", stop);
  ptt.addEventListener("pointercancel", stop);
  ptt.addEventListener("pointerleave", (e) => { if (holding && e.pointerType === "mouse") stop(); });
  ptt.addEventListener("contextmenu", (e) => e.preventDefault());
  if (logEl) logEl.scrollTop = logEl.scrollHeight;
}
async function viewStudio() {
  if (!isAdmin()) { $view.innerHTML = `<div class="page"><p>${esc(t("staff_only"))}</p></div>`; return; }
  const tab = studioParams().get("tab") || "idea";
  if (tab === "post") return viewPostStudio();
  return viewIdeas(tab === "bug" ? "bug" : "idea");
}

/* ---------- Members news feed (dashboard) ---------- */
async function newsFeedHtml() {
  const { data } = await sb.from("posts").select("id,title,caption,images,aspect,pinned,published_at")
    .eq("status", "published").contains("channels", ["members"])
    .order("pinned", { ascending: false }).order("published_at", { ascending: false }).limit(3);
  if (!data || !data.length) return "";
  const img = (p) => p.images?.[0] ? sb.storage.from("posts").getPublicUrl(p.images[0]).data.publicUrl : "";
  return `<section class="card news reveal" aria-labelledby="news-h" style="animation-delay:350ms">
    <span class="tab-tl">${esc(L("novosti", "news"))}</span>
    <h2 id="news-h">${esc(L("Novosti iz teretane", "News from the gym"))}</h2>
    <div class="news-list">${data.map((p) => `
      <article class="news-item">
        ${img(p) ? `<img src="${esc(img(p))}" alt="" loading="lazy" class="news-img r-${p.aspect.replace(/[:.]/g, "")}">` : ""}
        <div class="news-body">
          ${p.pinned ? `<span class="news-pin">${esc(L("Važno", "Pinned"))}</span>` : ""}
          ${p.title ? `<h3>${esc(p.title)}</h3>` : ""}
          <p>${esc(p.caption.replace(/(^|\s)#\S+/g, "").trim().slice(0, 280))}</p>
          <time>${fmtDate(p.published_at)}</time>
        </div>
      </article>`).join("")}</div>
  </section>`;
}

/* ---------- Post studio ---------- */
// Instagram-style filters. The same list drives the CSS preview and the pixel export,
// so what Zrinko sees is what gets posted (canvas `filter` is not supported everywhere).
const FILTERS = {
  normal: [], clarendon: [["contrast", 1.2], ["saturate", 1.35]], juno: [["contrast", 1.15], ["saturate", 1.6], ["sepia", 0.06]],
  lark: [["contrast", 0.9], ["brightness", 1.1], ["saturate", 1.1]], gingham: [["brightness", 1.05], ["sepia", 0.1], ["contrast", 0.92]],
  valencia: [["contrast", 1.08], ["brightness", 1.08], ["sepia", 0.12]], ludwig: [["contrast", 1.05], ["saturate", 1.3], ["brightness", 1.04]],
  moon: [["grayscale", 1], ["contrast", 1.1], ["brightness", 1.1]],
};
const FILTER_NAMES = { normal: "Normal", clarendon: "Clarendon", juno: "Juno", lark: "Lark", gingham: "Gingham", valencia: "Valencia", ludwig: "Ludwig", moon: "Moon" };
const cssFilter = (k) => (FILTERS[k] || []).map(([f, v]) => `${f}(${v})`).join(" ") || "none";
const ASPECTS = { "1:1": [1080, 1080], "4:5": [1080, 1350], "1.91:1": [1080, 566] };
const EMOJI = ["💪", "🔥", "🏋️", "⚡", "🥇", "🙌", "👊", "🎯", "📍", "🇭🇷", "⏰", "✅"];
const IG_USER = "saiyan_gym_fitt";

function applyPixelFilter(ctx, W, H, key) {
  const ops = FILTERS[key] || [];
  if (!ops.length) return;
  const img = ctx.getImageData(0, 0, W, H), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i + 1], b = d[i + 2];
    for (const [f, v] of ops) {
      if (f === "brightness") { r *= v; g *= v; b *= v; }
      else if (f === "contrast") { r = (r - 128) * v + 128; g = (g - 128) * v + 128; b = (b - 128) * v + 128; }
      else if (f === "saturate" || f === "grayscale") {
        const s = f === "saturate" ? v : 1 - v;
        const nr = (0.213 + 0.787 * s) * r + (0.715 - 0.715 * s) * g + (0.072 - 0.072 * s) * b;
        const ng = (0.213 - 0.213 * s) * r + (0.715 + 0.285 * s) * g + (0.072 - 0.072 * s) * b;
        const nb = (0.213 - 0.213 * s) * r + (0.715 - 0.715 * s) * g + (0.072 + 0.928 * s) * b;
        r = nr; g = ng; b = nb;
      } else if (f === "sepia") {
        const nr = r * (1 - 0.607 * v) + g * 0.769 * v + b * 0.189 * v;
        const ng = r * 0.349 * v + g * (1 - 0.314 * v) + b * 0.168 * v;
        const nb = r * 0.272 * v + g * 0.534 * v + b * (1 - 0.869 * v);
        r = nr; g = ng; b = nb;
      }
    }
    d[i] = r; d[i + 1] = g; d[i + 2] = b; // Uint8ClampedArray clamps
  }
  ctx.putImageData(img, 0, 0);
}

// Cover-crop: zoom >= 1 over the frame; px/py (0..1) place the overflow.
function drawCrop(ctx, W, H, it) {
  const { img } = it, w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const s = Math.max(W / w, H / h) * it.zoom, dw = w * s, dh = h * s;
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
  ctx.drawImage(img, (W - dw) * it.px, (H - dh) * it.py, dw, dh);
}
function exportJpeg(it, aspect) {
  const [W, H] = ASPECTS[aspect];
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  drawCrop(ctx, W, H, it); applyPixelFilter(ctx, W, H, it.filter);
  return new Promise((res) => c.toBlob(res, "image/jpeg", 0.9));
}
function loadImg(src) {
  return new Promise((res, rej) => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => res(i); i.onerror = rej; i.src = src; });
}
const countTags = (s) => (s.match(/(^|\s)#[\p{L}\p{N}_]+/gu) || []).length;
const countMentions = (s) => (s.match(/(^|\s)@[\w.]+/g) || []).length;

async function viewPostStudio() {
  const id = studioParams().get("id");
  const [posts, igs, sets] = await Promise.all([
    sb.from("posts").select("id,title,caption,images,aspect,channels,status,pinned,ig_permalink,error,published_at,updated_at")
      .order("updated_at", { ascending: false }).limit(30),
    sb.rpc("instagram_status"),
    sb.from("site_settings").select("value").eq("key", "hashtag_sets").maybeSingle(),
  ]);
  if (posts.error) return fail(posts.error);
  const ig = (igs.data || [])[0] || { connected: false };
  let tagSets = []; try { tagSets = JSON.parse(sets.data?.value || "[]"); } catch (e) {}
  const cur = (posts.data || []).find((p) => p.id === id) || null;
  const locked = cur && cur.status !== "draft" && cur.status !== "failed";

  // editor state
  const S = {
    items: [], sel: 0, aspect: cur?.aspect || "4:5", caption: cur?.caption || "", title: cur?.title || "",
    pinned: !!cur?.pinned, channels: new Set(cur?.channels || ["members", ...(ig.connected ? ["instagram"] : [])]), slide: 0,
  };
  if (cur?.images?.length) {
    for (const p of cur.images) {
      try { S.items.push({ img: await loadImg(sb.storage.from("posts").getPublicUrl(p).data.publicUrl + "?v=" + Date.parse(cur.updated_at)), zoom: 1, px: 0.5, py: 0.5, filter: "normal", done: true }); } catch (e) {}
    }
  }

  const statusTxt = { draft: L("Skica", "Draft"), publishing: L("Objavljuje se…", "Publishing…"), published: L("Objavljeno", "Published"), failed: L("Nije uspjelo", "Failed") };
  $view.innerHTML = `
  <div class="page studio">
    <div class="phead"><div><h1>Studio</h1>
      <p class="muted">${esc(L("Pripremi objavu za članove i Instagram: fotografije, rez, filteri, opis i hashtagovi.",
        "Make a post for members and Instagram: photos, crop, filters, caption and hashtags."))}</p></div></div>
    ${studioTabs("post")}
    <div class="post-grid">
      <div class="post-editor">
        <section class="card" aria-labelledby="ph-h" data-tab="${esc(L("fotografije", "photos"))}">
          <h2 id="ph-h">${esc(L("Fotografije", "Photos"))} <span class="muted small" id="ph-count"></span></h2>
          <div class="seg" role="radiogroup" aria-label="${esc(L("Format", "Format"))}">
            ${Object.keys(ASPECTS).map((a) => `<button type="button" role="radio" data-aspect="${a}" aria-checked="${S.aspect === a}">
              <i class="ar ar-${a.replace(/[:.]/g, "")}"></i>${{ "1:1": L("Kvadrat", "Square"), "4:5": L("Portret", "Portrait"), "1.91:1": L("Pejzaž", "Landscape") }[a]}</button>`).join("")}
          </div>
          <div class="crop-wrap" id="crop-wrap" hidden>
            <canvas id="crop" class="crop" aria-label="${esc(L("Povuci za pomicanje", "Drag to reposition"))}"></canvas>
            <div class="crop-grid" aria-hidden="true"></div>
          </div>
          <div class="crop-tools" id="crop-tools" hidden>
            <label for="zoom">${esc(L("Uvećanje", "Zoom"))}</label>
            <input id="zoom" type="range" min="1" max="3" step="0.01" value="1">
          </div>
          <div class="filters" id="filters" hidden role="radiogroup" aria-label="${esc(L("Filteri", "Filters"))}"></div>
          <div class="thumbs" id="thumbs"></div>
          <label class="drop" for="ph-in" id="drop">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="M20.5 16l-5-5-8 8.5"/></svg>
            <span>${esc(L("Dodaj fotografije (do 10)", "Add photos (up to 10)"))}</span>
          </label>
          <input id="ph-in" class="sr-only" type="file" accept="image/*" multiple>
        </section>

        <section class="card" aria-labelledby="cap-h" data-tab="${esc(L("opis", "caption"))}">
          <h2 id="cap-h">${esc(L("Opis", "Caption"))}</h2>
          <div class="ai-cap">
            <label for="ai-about">${esc(L("Pomoć asistenta: o čemu je objava?", "Assistant: what is the post about?"))}</label>
            <div class="ai-row">
              <input id="ai-about" maxlength="400" placeholder="${esc(L("npr. nove Hammer Strength sprave stigle", "e.g. new Hammer Strength machines arrived"))}">
              <select id="ai-lang" aria-label="${esc(L("Jezik", "Language"))}"><option value="both">HR + EN</option><option value="hr">HR</option><option value="en">EN</option></select>
              <button class="btn btn-ghost btn-sm" id="ai-go" type="button">${esc(L("Napiši", "Write"))}</button>
            </div>
            <div class="chips" id="ai-tone">${[["motivating", L("Motivirajuće", "Motivating")], ["fun", L("Zabavno", "Fun")], ["info", L("Informativno", "Informative")], ["hype", L("Hype", "Hype")]]
              .map(([k, v], i) => `<button type="button" class="chip" data-tone="${k}" aria-pressed="${i === 0}">${esc(v)}</button>`).join("")}</div>
          </div>
          <label for="cap">${esc(L("Tekst objave", "Post text"))}</label>
          <textarea id="cap" rows="7" maxlength="2200">${esc(S.caption)}</textarea>
          <div class="cap-meta"><div class="emoji" id="emoji">${EMOJI.map((e) => `<button type="button" data-emoji="${e}" aria-label="${e}">${e}</button>`).join("")}</div>
            <span class="counts" id="counts" aria-live="polite"></span></div>
          <div class="tagsets">
            <span class="small muted">${esc(L("Hashtag setovi", "Hashtag sets"))}</span>
            <div class="chips" id="tagsets">${tagSets.map((s, i) => `<button type="button" class="chip" data-set="${i}" title="${esc(s.tags)}">${esc(s.name)}</button>`).join("")}</div>
            <button class="btn btn-ghost btn-sm" id="save-set" type="button">${esc(L("Spremi hashtagove kao set", "Save hashtags as a set"))}</button>
          </div>
        </section>

        <section class="card" aria-labelledby="pub-h" data-tab="${esc(L("objava", "publish"))}">
          <h2 id="pub-h">${esc(L("Gdje objaviti", "Where to post"))}</h2>
          <label class="toggle-row"><input type="checkbox" data-ch="members" ${S.channels.has("members") ? "checked" : ""}> <span>${esc(L("Članovi u aplikaciji (Novosti)", "Members in the app (News)"))}</span></label>
          <div class="news-extra" id="news-extra">
            <label for="n-title">${esc(L("Naslov za članove (neobavezno)", "Headline for members (optional)"))}</label>
            <input id="n-title" maxlength="120" value="${esc(S.title)}">
            <label class="toggle-row"><input type="checkbox" id="n-pin" ${S.pinned ? "checked" : ""}> <span>${esc(L("Prikvači na vrh", "Pin to top"))}</span></label>
          </div>
          <label class="toggle-row"><input type="checkbox" data-ch="instagram" ${S.channels.has("instagram") ? "checked" : ""} ${ig.connected ? "" : "disabled"}>
            <span>Instagram ${ig.connected ? `<span class="muted small">@${esc(ig.username || IG_USER)}</span>` : `<span class="muted small">— ${esc(L("nije povezan (vidi upute u SETUP.md)", "not connected (see SETUP.md)"))}</span>`}</span></label>
          <div class="pub-actions">
            <button class="btn btn-ghost" id="save-draft" type="button" ${locked ? "disabled" : ""}>${esc(L("Spremi skicu", "Save draft"))}</button>
            <button class="btn btn-ghost" id="share" type="button">${esc(L("Podijeli s mobitela", "Share from phone"))}</button>
            <button class="btn btn-primary" id="publish" type="button" ${locked ? "disabled" : ""}>${esc(L("Objavi", "Publish"))}</button>
          </div>
          ${cur ? `<p class="small muted">${esc(statusTxt[cur.status])}${cur.error ? " · " + esc(cur.error) : ""}${cur.ig_permalink ? ` · <a href="${esc(cur.ig_permalink)}" target="_blank" rel="noopener">Instagram</a>` : ""}</p>` : ""}
        </section>
      </div>

      <aside class="post-preview" aria-label="${esc(L("Pregled na Instagramu", "Instagram preview"))}">
        <div class="phone">
          <div class="ig-head"><img class="ig-ava" src="icons/icon.svg" alt="Saiyan FITT"><b>${esc(ig.username || IG_USER)}</b><span class="ig-dots">•••</span></div>
          <div class="ig-media" id="ig-media"><div class="ig-empty">${esc(L("Ovdje se prikazuje objava", "Your post shows here"))}</div></div>
          <div class="ig-dotsbar" id="ig-dotsbar"></div>
          <div class="ig-actions" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>
            <svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12z"/></svg>
            <svg viewBox="0 0 24 24"><path d="M21 3L10 14M21 3l-7 18-4-7-7-4z"/></svg>
            <svg viewBox="0 0 24 24" class="r"><path d="M6 3h12v18l-6-4-6 4z"/></svg>
          </div>
          <p class="ig-cap" id="ig-cap"></p>
        </div>
      </aside>
    </div>

    <section class="card post-list" aria-labelledby="pl-h" data-tab="${esc(L("objave", "posts"))}">
      <h2 id="pl-h">${esc(L("Objave", "Posts"))}</h2>
      <a class="btn btn-ghost btn-sm" href="#/studio?tab=post">+ ${esc(L("Nova objava", "New post"))}</a>
      ${(posts.data || []).map((p) => `<a class="row" href="#/studio?tab=post&id=${p.id}"${p.id === id ? ' aria-current="page"' : ""}>
        <span>${esc(p.title || p.caption.slice(0, 60) || L("Bez naslova", "Untitled"))}</span>
        <span class="small muted">${esc(statusTxt[p.status])}${p.channels.includes("instagram") ? " · IG" : ""}</span></a>`).join("")
        || `<p class="muted small">${esc(L("Još nema objava.", "No posts yet."))}</p>`}
    </section>
  </div>`;

  /* --- wiring --- */
  const $ = (q) => document.getElementById(q);
  const crop = $("crop"), cctx = crop.getContext("2d");
  const cap = $("cap");

  function sizeCrop() {
    const [W, H] = ASPECTS[S.aspect];
    const w = Math.min($("crop-wrap").clientWidth || 480, 560);
    const dpr = Math.min(devicePixelRatio || 1, 2);
    crop.width = Math.round(w * dpr); crop.height = Math.round((w * H / W) * dpr);
    crop.style.width = w + "px"; crop.style.height = (w * H / W) + "px";
  }
  function drawEditor() {
    const it = S.items[S.sel];
    $("crop-wrap").hidden = $("crop-tools").hidden = $("filters").hidden = !it;
    $("ph-count").textContent = S.items.length ? `${S.items.length}/10` : "";
    $("drop").hidden = S.items.length >= 10;
    if (!it) return renderPreview();
    sizeCrop(); drawCrop(cctx, crop.width, crop.height, it);
    crop.style.filter = cssFilter(it.filter);
    $("zoom").value = it.zoom;
    renderFilters(); renderThumbs(); renderPreview();
  }
  function renderThumbs() {
    $("thumbs").innerHTML = S.items.map((it, i) => `<div class="thumb${i === S.sel ? " on" : ""}">
      <button type="button" data-pick="${i}" aria-label="${esc(L("Fotografija", "Photo"))} ${i + 1}"><canvas width="96" height="${Math.round(96 * ASPECTS[S.aspect][1] / 1080)}" style="filter:${cssFilter(it.filter)}"></canvas></button>
      <div class="thumb-ctl">
        <button type="button" data-move="${i}" data-d="-1" ${i === 0 ? "disabled" : ""} aria-label="${esc(L("Pomakni lijevo", "Move left"))}">‹</button>
        <button type="button" data-del="${i}" aria-label="${esc(t("a_delete"))}">✕</button>
        <button type="button" data-move="${i}" data-d="1" ${i === S.items.length - 1 ? "disabled" : ""} aria-label="${esc(L("Pomakni desno", "Move right"))}">›</button>
      </div></div>`).join("");
    $("thumbs").querySelectorAll("canvas").forEach((c, i) => drawCrop(c.getContext("2d"), c.width, c.height, S.items[i]));
  }
  function renderFilters() {
    const it = S.items[S.sel];
    $("filters").innerHTML = Object.keys(FILTERS).map((k) => `<button type="button" role="radio" aria-checked="${it.filter === k}" data-filter="${k}">
      <canvas width="64" height="64" style="filter:${cssFilter(k)}"></canvas><span>${FILTER_NAMES[k]}</span></button>`).join("");
    $("filters").querySelectorAll("canvas").forEach((c) => drawCrop(c.getContext("2d"), 64, 64, { ...it, zoom: 1, px: 0.5, py: 0.5 }));
  }
  let prevT;
  function renderPreview() {
    clearTimeout(prevT);
    prevT = setTimeout(() => {
      const m = $("ig-media"), [W, H] = ASPECTS[S.aspect];
      m.style.aspectRatio = `${W} / ${H}`;
      if (!S.items.length) { m.innerHTML = `<div class="ig-empty">${esc(L("Ovdje se prikazuje objava", "Your post shows here"))}</div>`; $("ig-dotsbar").innerHTML = ""; }
      else {
        S.slide = Math.min(S.slide, S.items.length - 1);
        m.innerHTML = `<canvas></canvas>${S.items.length > 1 ? `<span class="ig-count">${S.slide + 1}/${S.items.length}</span>
          <button type="button" class="ig-nav l" data-slide="-1" aria-label="${esc(L("Prethodna", "Previous"))}" ${S.slide === 0 ? "hidden" : ""}>‹</button>
          <button type="button" class="ig-nav r" data-slide="1" aria-label="${esc(L("Sljedeća", "Next"))}" ${S.slide === S.items.length - 1 ? "hidden" : ""}>›</button>` : ""}`;
        const c = m.querySelector("canvas"), w = m.clientWidth || 340, dpr = Math.min(devicePixelRatio || 1, 2);
        c.width = Math.round(w * dpr); c.height = Math.round(w * H / W * dpr);
        drawCrop(c.getContext("2d"), c.width, c.height, S.items[S.slide]); c.style.filter = cssFilter(S.items[S.slide].filter);
        $("ig-dotsbar").innerHTML = S.items.length > 1 ? S.items.map((_, i) => `<i class="${i === S.slide ? "on" : ""}"></i>`).join("") : "";
      }
      const txt = cap.value, short = txt.length > 125 ? txt.slice(0, 125).replace(/\s+\S*$/, "") : txt;
      const fmt = (s) => esc(s).replace(/(^|\s)([#@][\p{L}\p{N}_.]+)/gu, '$1<span class="ig-tag">$2</span>').replace(/\n/g, "<br>");
      $("ig-cap").innerHTML = txt ? `<b>${esc(IG_USER)}</b> ${fmt(short)}${short !== txt ? ` <span class="muted">… ${esc(L("više", "more"))}</span>` : ""}` : "";
      const n = txt.length, h = countTags(txt), at = countMentions(txt);
      $("counts").innerHTML = `<span class="${n > 2200 ? "over" : ""}">${n}/2200</span> · <span class="${h > 30 ? "over" : ""}"># ${h}/30</span> · <span class="${at > 20 ? "over" : ""}">@ ${at}/20</span>`;
    }, 40);
  }

  // add photos
  $("ph-in").onchange = async (e) => {
    const files = [...e.target.files].slice(0, 10 - S.items.length); e.target.value = "";
    for (const f of files) {
      const url = URL.createObjectURL(f);
      try { S.items.push({ img: await loadImg(url), zoom: 1, px: 0.5, py: 0.5, filter: "normal" }); } catch (err) { toast(L("Ne mogu otvoriti sliku.", "Can't open that image.")); }
    }
    S.sel = Math.max(0, S.items.length - files.length); drawEditor();
  };
  // aspect
  document.querySelectorAll("[data-aspect]").forEach((b) => (b.onclick = () => {
    S.aspect = b.dataset.aspect;
    document.querySelectorAll("[data-aspect]").forEach((x) => x.setAttribute("aria-checked", x === b));
    drawEditor();
  }));
  // drag to reposition (pointer events; touch-action:none on the canvas)
  let drag = null;
  crop.onpointerdown = (e) => { if (!S.items[S.sel]) return; crop.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY }; };
  crop.onpointermove = (e) => {
    if (!drag) return;
    const it = S.items[S.sel], W = crop.clientWidth, H = crop.clientHeight;
    const w = it.img.naturalWidth, h = it.img.naturalHeight, s = Math.max(W / w, H / h) * it.zoom;
    const ox = W - w * s, oy = H - h * s;
    if (ox < 0) it.px = Math.min(1, Math.max(0, (ox * it.px + e.clientX - drag.x) / ox));
    if (oy < 0) it.py = Math.min(1, Math.max(0, (oy * it.py + e.clientY - drag.y) / oy));
    drag = { x: e.clientX, y: e.clientY };
    drawCrop(cctx, crop.width, crop.height, it);
  };
  crop.onpointerup = crop.onpointercancel = () => { if (drag) { drag = null; renderThumbs(); renderPreview(); } };
  $("zoom").oninput = (e) => { const it = S.items[S.sel]; it.zoom = +e.target.value; drawCrop(cctx, crop.width, crop.height, it); renderPreview(); };
  $("zoom").onchange = () => renderThumbs();
  $("filters").onclick = (e) => { const b = e.target.closest("[data-filter]"); if (!b) return; S.items[S.sel].filter = b.dataset.filter; drawEditor(); };
  $("thumbs").onclick = (e) => {
    const pick = e.target.closest("[data-pick]"), mv = e.target.closest("[data-move]"), del = e.target.closest("[data-del]");
    if (pick) { S.sel = +pick.dataset.pick; S.slide = S.sel; }
    if (mv) { const i = +mv.dataset.move, j = i + +mv.dataset.d; [S.items[i], S.items[j]] = [S.items[j], S.items[i]]; S.sel = j; }
    if (del) { S.items.splice(+del.dataset.del, 1); S.sel = Math.max(0, Math.min(S.sel, S.items.length - 1)); }
    drawEditor();
  };
  $("ig-media").onclick = (e) => { const b = e.target.closest("[data-slide]"); if (!b) return; S.slide += +b.dataset.slide; renderPreview(); };
  // caption
  cap.oninput = renderPreview;
  $("emoji").onclick = (e) => {
    const b = e.target.closest("[data-emoji]"); if (!b) return;
    const a = cap.selectionStart ?? cap.value.length;
    cap.setRangeText(b.dataset.emoji, a, cap.selectionEnd ?? a, "end"); cap.focus(); renderPreview();
  };
  let tone = "motivating";
  $("ai-tone").onclick = (e) => { const b = e.target.closest("[data-tone]"); if (!b) return; tone = b.dataset.tone;
    $("ai-tone").querySelectorAll("[data-tone]").forEach((x) => x.setAttribute("aria-pressed", x === b)); };
  $("ai-go").onclick = async () => {
    const about = $("ai-about").value.trim(); if (!about) return $("ai-about").focus();
    const b = $("ai-go"); b.disabled = true; b.textContent = "…";
    const { data, error } = await sb.functions.invoke("idea-agent", { body: { action: "caption", message: about, lang: $("ai-lang").value, tone } });
    b.disabled = false; b.textContent = L("Napiši", "Write");
    if (error || !data?.caption) return toast(data?.error === "not_configured" ? L("Asistent još nije uključen.", "The assistant isn't switched on yet.") : L("Asistent sada ne može, pokušaj ponovno.", "The assistant can't right now, try again."), 4000);
    if (cap.value.trim() && !confirm(L("Zamijeniti postojeći tekst?", "Replace the current text?"))) return;
    cap.value = data.caption; renderPreview();
  };
  $("tagsets").onclick = (e) => {
    const b = e.target.closest("[data-set]"); if (!b) return;
    const tags = tagSets[+b.dataset.set].tags;
    cap.value = cap.value.replace(/\s+$/, "") + (cap.value.trim() ? "\n\n" : "") + tags; renderPreview();
  };
  $("save-set").onclick = async () => {
    const tags = (cap.value.match(/#[\p{L}\p{N}_]+/gu) || []).join(" ");
    if (!tags) return toast(L("U tekstu nema hashtagova.", "There are no hashtags in the text."));
    const name = prompt(L("Ime seta (npr. Trening):", "Set name (e.g. Training):")); if (!name) return;
    tagSets = [...tagSets.filter((s) => s.name !== name), { name: name.slice(0, 30), tags }].slice(-12);
    const { error } = await sb.from("site_settings").upsert({ key: "hashtag_sets", value: JSON.stringify(tagSets), updated_at: new Date().toISOString() });
    error ? fail(error) : viewPostStudio();
  };
  const syncNews = () => ($("news-extra").hidden = !document.querySelector('[data-ch="members"]').checked);
  document.querySelectorAll("[data-ch]").forEach((c) => (c.onchange = syncNews)); syncNews();

  // save: render JPEGs, upload, upsert the row
  async function save() {
    const channels = [...document.querySelectorAll("[data-ch]:checked")].map((c) => c.dataset.ch);
    if (!channels.length) { toast(L("Odaberi gdje objaviti.", "Choose where to post.")); return null; }
    if (channels.includes("instagram") && !S.items.length) { toast(L("Instagram treba barem jednu fotografiju.", "Instagram needs at least one photo.")); return null; }
    if (!S.items.length && !cap.value.trim() && !$("n-title").value.trim()) { toast(L("Objava je prazna.", "The post is empty.")); return null; }
    const row = { caption: cap.value.slice(0, 2200), title: $("n-title").value.trim().slice(0, 120), aspect: S.aspect, channels, pinned: $("n-pin").checked };
    let pid = cur?.id;
    if (!pid) {
      const { data, error } = await sb.from("posts").insert(row).select("id").single();
      if (error) { fail(error); return null; } pid = data.id;
    }
    toast(L("Spremam fotografije…", "Saving photos…"), 20000);
    const paths = [], stamp = Date.now().toString(36);
    for (let i = 0; i < S.items.length; i++) {
      const blob = await exportJpeg(S.items[i], S.aspect), path = `${pid}/${stamp}-${i + 1}.jpg`;
      const { error } = await sb.storage.from("posts").upload(path, blob, { contentType: "image/jpeg", upsert: true });
      if (error) { fail(error); return null; }
      paths.push(path);
    }
    const old = (cur?.images || []).filter((p) => !paths.includes(p));
    const { error } = await sb.from("posts").update({ ...row, images: paths }).eq("id", pid);
    if (error) { fail(error); return null; }
    if (old.length) sb.storage.from("posts").remove(old).then(() => {});
    return pid;
  }
  $("save-draft").onclick = async () => { const pid = await save(); if (pid) { toast(t("saved_ok")); location.hash = `#/studio?tab=post&id=${pid}`; } };
  $("publish").onclick = async () => {
    const pid = await save(); if (!pid) return;
    toast(L("Objavljujem…", "Publishing…"), 60000);
    const { data, error } = await sb.functions.invoke("social-publish", { body: { post_id: pid } });
    if (error || data?.error) {
      toast(data?.error === "instagram_not_connected" ? L("Instagram nije povezan.", "Instagram isn't connected.") : L("Objava nije uspjela. Pogledaj poruku ispod.", "Publishing failed. See the note below."), 5000);
    } else toast(data.permalink ? L("Objavljeno i na Instagramu!", "Posted, Instagram too!") : L("Objavljeno članovima!", "Posted to members!"), 4000);
    location.hash = `#/studio?tab=post&id=${pid}`; if (cur?.id === pid) viewPostStudio();
  };
  // Share sheet: works on phones without any Instagram setup. Instagram does not take
  // captions from the share sheet, so the caption is copied first.
  $("share").onclick = async () => {
    if (!S.items.length) return toast(L("Dodaj fotografiju.", "Add a photo."));
    const files = [];
    for (let i = 0; i < S.items.length; i++) files.push(new File([await exportJpeg(S.items[i], S.aspect)], `saiyan-${i + 1}.jpg`, { type: "image/jpeg" }));
    try { await navigator.clipboard.writeText(cap.value); } catch (e) {}
    if (navigator.canShare && navigator.canShare({ files })) {
      toast(L("Opis je kopiran — zalijepi ga u Instagram.", "Caption copied — paste it into Instagram."), 5000);
      try { await navigator.share({ files }); } catch (e) {}
    } else {
      files.forEach((f) => { const a = document.createElement("a"); a.href = URL.createObjectURL(f); a.download = f.name; a.click(); });
      toast(L("Fotografije preuzete, opis kopiran.", "Photos downloaded, caption copied."), 5000);
    }
  };

  addEventListener("resize", () => location.hash.startsWith("#/studio?tab=post") && S.items.length && drawEditor(), { once: true });
  drawEditor();
}
