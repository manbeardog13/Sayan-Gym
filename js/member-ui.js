/* Member navigation and the training / offers strip. Built by Nero. */
function renderDock(route) {
  renderDock.cleanup?.();
  document.querySelector('.member-dock')?.remove();
  document.documentElement.classList.remove('has-side', 'side-open');
  document.documentElement.classList.add('has-member-nav');
  const member = state.session;
  const groups = [
    { key: 'gym', label: L('Teretana', 'Gym'), icon: ICO.globe, links: [
      ['#/site', L('Početna', 'Home')],
      ['#/site?section=prices', L('Cijene', 'Prices')],
      ['#/site?section=hours', L('Radno vrijeme', 'Hours')],
      ['#/site?section=contact', L('Kontakt', 'Contact')]] },
    { key: 'train', label: L('Trening', 'Train'), icon: ICO.plus, links: member ? [
      ['#/app', L('Moj trening', 'My training')],
      ['#/log', L('Dnevnik', 'Log')],
      ['#/progress', L('Napredak', 'Progress')]] : [['#/login', t('sign_in')]] },
    { key: 'me', label: L('Ja', 'Me'), icon: ICO.user, links: member ? [
      ['#/profile', t('nav_profile')]] : [] },
  ];
  if (isStaff()) groups.push({ key: 'staff', label: L('Osoblje', 'Staff'), icon: ICO.scan, links: [
    ['#/desk', L('Recepcija', 'Desk')], ...(isAdmin() ? [
      ['#/admin', t('nav_admin')], ['#/studio', 'Studio']] : [])] });
  const active = ['#/desk', '#/admin', '#/studio', '#/ideas'].includes(route) ? 'staff'
    : route === '#/profile' ? 'me' : ['#/app', '#/log', '#/progress', '#/login'].includes(route) ? 'train' : 'gym';
  const dock = document.createElement('nav');
  dock.className = 'member-dock';
  dock.setAttribute('aria-label', L('Glavna navigacija', 'Main navigation'));
  dock.innerHTML = groups.map(g => `<div class="dock-group">
    <button class="dock-trigger${active === g.key ? ' on' : ''}" type="button" aria-expanded="false" aria-controls="dock-${g.key}">${g.icon}<span>${esc(g.label)}</span></button>
    <section class="dock-panel" id="dock-${g.key}" aria-label="${esc(g.label)}" hidden>
      <h2>${esc(g.label)}</h2>${g.links.map(([href, label]) => `<a href="${href}"${location.hash === href ? ' aria-current="page"' : ''}>${esc(label)}<span aria-hidden="true">↗</span></a>`).join('')}
      ${g.key === 'me' ? `<button type="button" data-language><span>${esc(L('Jezik', 'Language'))}</span><b>${LANG === 'hr' ? 'English' : 'Hrvatski'}</b></button>
        <button type="button" data-theme role="switch" aria-checked="${document.documentElement.classList.contains('dark')}" aria-label="${esc(L('Tamna tema', 'Dark theme'))}"><span>${esc(L('Tema', 'Theme'))}</span><i class="dock-theme-dot" aria-hidden="true"></i></button>
        ${member ? `<button type="button" data-logout>${ICO.out}${esc(t('sign_out'))}</button>` : ''}` : ''}
    </section></div>`).join('');
  const close = () => {
    dock.querySelectorAll('.dock-panel').forEach(p => p.hidden = true);
    dock.querySelectorAll('.dock-trigger').forEach(b => b.setAttribute('aria-expanded', 'false'));
  };
  dock.addEventListener('click', e => {
    const trigger = e.target.closest('.dock-trigger');
    if (trigger) {
      const open = trigger.getAttribute('aria-expanded') === 'true';
      close();
      if (!open) {
        trigger.setAttribute('aria-expanded', 'true');
        document.getElementById(trigger.getAttribute('aria-controls')).hidden = false;
      }
    } else if (e.target.closest('a')) close();
    else if (e.target.closest('[data-language]')) changeLanguage();
    else if (e.target.closest('[data-theme]')) toggleTheme({ currentTarget: e.target.closest('[data-theme]') });
    else if (e.target.closest('[data-logout]')) signOut();
  });
  dock.addEventListener('keydown', e => {
    if (e.key === 'Escape') { dock.querySelector('[aria-expanded="true"]')?.focus(); close(); }
    if (e.key === 'ArrowDown' && e.target.matches('.dock-trigger')) {
      e.preventDefault();
      if (e.target.getAttribute('aria-expanded') === 'false') e.target.click();
      e.target.parentElement.querySelector('.dock-panel a')?.focus();
    }
  });
  dock.addEventListener('focusout', e => { if (!dock.contains(e.relatedTarget)) close(); });
  // One outside-click listener for the current dock, with explicit teardown on navigation.
  const outside = e => { if (!dock.contains(e.target)) close(); };
  document.addEventListener('pointerdown', outside);
  renderDock.cleanup = () => document.removeEventListener('pointerdown', outside);
  document.body.appendChild(dock);
}

async function loadStreamItems(plans) {
  const items = PHOTOS.map(p => ({ src: p.src, label: L(p.hr, p.en), chip: L('Trening', 'Training'), kind: 'photo' }));
  const [planResult, postResult] = await Promise.all([
    plans ? Promise.resolve({ data: plans }) : sb.from('membership_plans').select('*').eq('is_published', true).order('sort'),
    state.session ? sb.from('posts').select('id,title,caption,images,published_at').eq('status', 'published')
      .contains('channels', ['members']).order('published_at', { ascending: false }).limit(12) : Promise.resolve({ data: [] }),
  ]);
  (planResult.data || []).filter(p => p.is_published === true).forEach(p => items.push({
    kind: 'plan', label: nameOf(p), chip: L('Članarina', 'Membership'),
    detail: L(p.description_hr, p.description_en) || '',
    price: p.price_eur == null ? t('on_request') : new Intl.NumberFormat(LANG === 'hr' ? 'hr-HR' : 'en-GB', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(p.price_eur),
  }));
  (postResult.data || []).forEach(p => items.push({ kind: 'post', label: p.title || L('Novosti iz teretane', 'Gym news'),
    chip: L('Zrinkove novosti', "Zrinko’s news"), detail: p.caption || '',
    src: p.images?.[0] ? sb.storage.from('posts').getPublicUrl(p.images[0]).data.publicUrl : '' }));
  return items;
}

function stream(items, title = L('Treniraj. Otkrij. Ponovi.', 'Train. Discover. Repeat.'), liveLabel = L('Iz teretane', 'From the gym'), sub = L('Treninzi, članarine i Zrinkove novosti. Povuci za pregled.', 'Training, memberships and news from Zrinko. Swipe to explore.')) {
  // Full content stays in an escaped data attribute so every duplicate opens the same detail.
  const slides = items.map((it, i) => `<button type="button" class="slide slide-${it.kind || 'photo'}" data-item="${esc(JSON.stringify(it))}" aria-label="${esc(it.label)}">
    <span class="tab-tl">${String(i + 1).padStart(2, '0')}</span>
    ${it.src ? `<img class="thumb" src="${esc(it.src)}" alt="" loading="lazy" draggable="false">` : `<span class="offer-art">${it.kind === 'plan' ? `<b>${esc(it.price)}</b><small>${esc(L('Tvoj sljedeći korak', 'Your next step'))}</small>` : ICO.bulb}</span>`}
    <span class="meta"><span class="who">${esc(it.label)}</span><span class="chip">${esc(it.chip || '')}</span></span>
  </button>`).join('');
  return `<section class="recent reveal" style="animation-delay:350ms">
    <div class="head"><h3>${esc(title)}</h3><span class="live">${esc(liveLabel)}</span>
      <button class="stream-pause" type="button" aria-pressed="false">${esc(L('Pauziraj', 'Pause'))}</button></div>
    <p class="recent-sub">${esc(sub)}</p>
    <div class="stream" tabindex="0" aria-label="${esc(title)}"><div class="stream-track"><div class="stream-set">${slides}</div></div></div></section>`;
}

function wireStream() {
  wireStream.cleanup?.();
  const viewport = document.querySelector('.stream');
  if (!viewport) return;
  const track = viewport.querySelector('.stream-track'), original = track.querySelector('.stream-set');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const pause = viewport.closest('.recent').querySelector('.stream-pause');
  let width = 0, position = 0, target = 0, last = 0, raf = 0, pointer = null, lastX = 0, startX = 0, startY = 0, moved = false, manualAt = 0, paused = false, focused = false;
  let velocity = 0, sampleAt = 0, axis = null;
  const draw = () => { track.style.transform = `translate3d(${-position}px,0,0)`; };
  const wrap = () => {
    if (!width) return;
    const shift = Math.floor(position / width) * width;
    position -= shift; target -= shift;
  };
  const resize = () => {
    track.querySelectorAll('[data-copy]').forEach(el => el.remove());
    width = original.getBoundingClientRect().width;
    if (!width) return;
    // Enough repeated sets for even a wide monitor; copies are not keyboard stops.
    for (let i = 0; i < Math.ceil(viewport.clientWidth / width) + 1; i++) {
      const copy = original.cloneNode(true); copy.dataset.copy = '1'; copy.setAttribute('aria-hidden', 'true');
      copy.querySelectorAll('button').forEach(b => b.tabIndex = -1); track.appendChild(copy);
    }
    wrap(); draw();
  };
  const step = now => {
    const dt = Math.min(last ? now - last : 16, 40); last = now;
    const dragging = pointer !== null && axis === 'x' && now - manualAt < 64;
    if (dragging) {
      const delta = (target - position) * (reduce.matches ? 1 : 1 - Math.exp(-dt / 42));
      position += delta;
      velocity = reduce.matches ? 0 : delta / dt;
    } else {
      target = position;
      if (!reduce.matches && !paused && !focused && !document.hidden) {
        // Exponential friction, in pixels/ms, is independent of display refresh rate.
        // At rest there is no delayed restart: the loop owns this same frame.
        velocity *= Math.exp(-dt / 90);
        if (Math.abs(velocity) > .02) position += velocity * dt;
        else { velocity = 0; position += dt * .028; }
      } else velocity = 0;
    }
    wrap(); draw(); raf = requestAnimationFrame(step);
  };
  const open = slide => {
    const item = JSON.parse(slide.dataset.item), dlg = document.createElement('dialog');
    dlg.className = 'photo-dlg';
    dlg.innerHTML = `<form method="dialog"><button class="btn btn-ghost btn-sm">${esc(L('Zatvori', 'Close'))}</button></form>
      ${item.src ? `<img src="${esc(item.src)}" alt="${esc(item.label)}">` : ''}
      <div class="offer-detail"><h2>${esc(item.label)}</h2>${item.price ? `<b class="offer-price">${esc(item.price)}</b>` : ''}
      ${item.detail ? `<p>${esc(item.detail)}</p>` : ''}
      ${item.kind === 'plan' ? `<a class="btn btn-primary" href="${whatsappLink(L('Bok! Zanima me ', "Hi! I'm interested in ") + item.label)}" target="_blank" rel="noopener">${esc(L('Pitaj Zrinka', 'Ask Zrinko'))}</a>` : ''}</div>`;
    document.body.appendChild(dlg); dlg.showModal();
    dlg.addEventListener('close', () => { dlg.remove(); viewport.focus({ preventScroll: true }); });
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  };
  viewport.addEventListener('pointerdown', e => {
    if (e.button !== 0 || pointer !== null) return;
    pointer = e.pointerId; startX = lastX = e.clientX; startY = e.clientY; moved = false; focused = false; target = position;
    velocity = 0; axis = null; sampleAt = performance.now();
    // Capture only once the gesture is horizontal, preserving native taps and vertical page scroll.
  });
  viewport.addEventListener('pointermove', e => {
    if (pointer !== e.pointerId) return;
    const dx = e.clientX - startX, dy = e.clientY - startY;
    if (!axis && Math.hypot(dx, dy) <= 6) return;
    moved = true; // Every gesture consumes its click, including a vertical pan.
    if (!axis && Math.abs(dy) >= Math.abs(dx)) { axis = 'y'; pointer = null; velocity = 0; return; }
    axis = 'x';
    moved = true; viewport.setPointerCapture(e.pointerId);
    const now = performance.now(), delta = lastX - e.clientX;
    velocity = reduce.matches ? 0 : Math.max(-2.5, Math.min(2.5, delta / Math.max(8, now - sampleAt)));
    target += delta; lastX = e.clientX; manualAt = sampleAt = now;
  });
  const release = e => {
    if (pointer !== e.pointerId) return;
    pointer = null; target = position;
    velocity = reduce.matches || paused || axis !== 'x' || performance.now() - manualAt >= 64 ? 0 : velocity;
    if (viewport.hasPointerCapture(e.pointerId)) viewport.releasePointerCapture(e.pointerId);
  };
  viewport.addEventListener('pointerup', release);
  const cancel = e => { if (pointer === e.pointerId) { moved = true; release(e); velocity = 0; } };
  viewport.addEventListener('pointercancel', cancel);
  viewport.addEventListener('lostpointercapture', cancel);
  viewport.addEventListener('pointerleave', e => { if (!viewport.hasPointerCapture(e.pointerId)) cancel(e); });
  viewport.addEventListener('click', e => {
    const slide = e.target.closest('.slide');
    if (moved && e.detail !== 0) { e.preventDefault(); return; }
    if (slide) open(slide);
  });
  viewport.addEventListener('wheel', e => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return; // Keep ordinary page scrolling natural.
    e.preventDefault(); velocity = 0; position += e.deltaX; target = position; wrap(); draw();
  }, { passive: false });
  viewport.addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault(); velocity = 0;
    position = e.key === 'Home' ? 0 : e.key === 'End' ? Math.max(0, width - viewport.clientWidth) : position + (e.key === 'ArrowRight' ? 240 : -240);
    target = position; wrap(); draw();
  });
  viewport.addEventListener('focusin', e => {
    // Keyboard focus pauses motion and brings each original card into view.
    if (!e.target.matches(':focus-visible')) return;
    focused = true;
    const slide = e.target.closest('.slide');
    if (slide) { position = slide.offsetLeft; target = position; wrap(); draw(); }
    viewport.scrollLeft = 0;
  });
  viewport.addEventListener('focusout', e => { if (!viewport.contains(e.relatedTarget)) focused = false; });
  pause.onclick = () => {
    paused = !paused; focused = false; pause.setAttribute('aria-pressed', String(paused));
    pause.textContent = paused ? L('Pokreni', 'Play') : L('Pauziraj', 'Pause');
  };
  const motion = () => { pause.hidden = reduce.matches; if (reduce.matches) { velocity = 0; target = position; } };
  reduce.addEventListener('change', motion); motion();
  const observer = new ResizeObserver(resize); observer.observe(viewport); resize();
  raf = requestAnimationFrame(step);
  wireStream.cleanup = () => { cancelAnimationFrame(raf); observer.disconnect(); reduce.removeEventListener('change', motion); };
}

// Only an actual popstate to an older stamped history entry yields a back step.
// Returning to a familiar URL by clicking a link remains forward navigation.
function createNavigationMotion(history) {
  let index = Number.isInteger(history.state?.sgNavIndex) ? history.state.sgNavIndex : 0;
  let pending = 'fwd';
  history.replaceState({ ...history.state, sgNavIndex: index }, '');
  return {
    onPop(event) {
      const next = event.state?.sgNavIndex;
      pending = Number.isInteger(next) && next < index ? 'back' : 'fwd';
      if (Number.isInteger(next)) index = next;
    },
    take() {
      if (!Number.isInteger(history.state?.sgNavIndex)) {
        history.replaceState({ ...history.state, sgNavIndex: ++index }, '');
      }
      const direction = pending; pending = 'fwd'; return direction;
    },
  };
}

let authFilm = null;
let splashActive = false;
function restoreAuthFrame() {
  const rise = document.getElementById('auth-rise');
  if (!rise || splashActive) return;
  if (authFilm?.dataset.finalFrame === '1') { rise.appendChild(authFilm); return; }
  // A paused video decoded at its end is the still. No alternate image or crop.
  const film = document.createElement('video');
  film.muted = true; film.playsInline = true; film.preload = 'auto';
  film.setAttribute('aria-hidden', 'true'); film.className = 'frame-loading';
  film.addEventListener('loadedmetadata', () => {
    if (Number.isFinite(film.duration)) film.currentTime = Math.max(0, film.duration - .001);
  }, { once: true });
  film.addEventListener('seeked', () => {
    film.pause(); film.dataset.finalFrame = '1'; film.className = ''; authFilm = film;
  }, { once: true });
  film.src = 'assets/saiyan-rise.mp4';
  rise.appendChild(film);
}

async function startSplash(render) {
  const splash = document.getElementById('splash');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let seen = false;
  try { seen = sessionStorage.getItem('sg.splash') === '1'; } catch (_) {}
  if (!splash || seen || reduce.matches) { splash?.remove(); await render(); return; }
  splashActive = true;
  const video = splash.querySelector('video');
  splash.hidden = false;
  document.documentElement.classList.add('splashing');
  const skip = document.createElement('button');
  skip.type = 'button'; skip.className = 'splash-skip'; skip.textContent = L('Preskoči', 'Skip');
  splash.appendChild(skip);
  let settled = false, renderDone;
  const ready = new Promise(resolve => { renderDone = resolve; });
  const settle = async (finished) => {
    if (settled) return;
    settled = true; clearInterval(watchdog); video.pause();
    await ready;
    if (document.fonts?.ready) await document.fonts.ready;
    try { sessionStorage.setItem('sg.splash', '1'); } catch (_) {}
    const rise = document.getElementById('auth-rise');
    document.documentElement.classList.remove('splashing');
    splashActive = false;
    if (finished) { video.dataset.finalFrame = '1'; authFilm = video; }
    if (!finished || !rise || reduce.matches) { splash.remove(); restoreAuthFrame(); return; }
    // Freeze the auth card at its FINAL geometry before measuring. Reuse the exact
    // decoded last frame and the same crop throughout; never seek or swap media.
    rise.closest('.auth-card').classList.add('splash-landed');
    rise.hidden = false;
    const from = video.getBoundingClientRect();
    const to = rise.getBoundingClientRect();
    const destination = { left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px`, borderRadius: '22px' };
    video.className = 'splash-flight';
    Object.assign(video.style, destination);
    document.body.appendChild(video);
    splash.classList.add('out');
    const flight = video.animate([
      { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`, borderRadius: '0px' },
      destination,
    ], { duration: 850, easing: 'cubic-bezier(.2,.7,.2,1)' });
    await flight.finished.catch(() => {});
    if (rise.isConnected) {
      rise.appendChild(video); video.className = ''; video.removeAttribute('style');
    } else video.remove();
    splash.remove();
  };
  video.addEventListener('ended', () => settle(true), { once: true });
  video.addEventListener('error', () => settle(false), { once: true });
  skip.onclick = () => settle(false);
  // Only fail out on stalled/blocked playback. A fixed seven-second timeout cut
  // the film short on slow connections and could freeze a non-final frame.
  let time = -1, stalledAt = performance.now();
  const watchdog = setInterval(() => {
    if (video.currentTime !== time) { time = video.currentTime; stalledAt = performance.now(); }
    if (performance.now() - stalledAt > 8000 || reduce.matches) settle(false);
  }, 1000);
  video.play().catch(() => settle(false));
  try { await render(); } finally { renderDone(); }
}
