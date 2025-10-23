/* ===========================
   ⏳ PRELOADER — solo alla prima visita
   Chiude quando: hero pronto O timeout di sicurezza, senza aspettare window.load
   =========================== */
(function () {
  const pre = document.getElementById('preloader');
  if (!pre) return;

  const FIRST_VISIT_KEY = 'preloaderSeen'; // persistenza su localStorage
  const isFirstVisit = !localStorage.getItem(FIRST_VISIT_KEY);

  // Config da CSS (fallback se manca la var)
  const css = getComputedStyle(document.documentElement);
  const MIN_MS  = parseInt(css.getPropertyValue('--preloader-min-ms'))  || 700;   // durata minima
  const MAX_MS  = parseInt(css.getPropertyValue('--preloader-max-ms'))  || 2200;  // timeout hard cap
  const BAR_INC = 0.85; // quota massima "finta" (il resto lo fanno hero/fonts)

  const bar  = pre.querySelector('.preloader__bar-fill');
  const perc = pre.querySelector('.preloader__perc');

  const setBar = (p) => {
    const pct = Math.round(Math.max(0, Math.min(100, p * 100)));
    if (bar)  bar.style.width = pct + '%';
    if (perc) perc.textContent = pct + '%';
  };

  // Se NON è la prima visita → salta subito
  if (!isFirstVisit) {
    pre.classList.add('is-hidden');
    document.body.classList.remove('is-loading');
    requestAnimationFrame(() => pre.remove());
    // Notifica app ready
    window.dispatchEvent(new Event('app:ready'));
    return;
  }

  // Finta progress bar fino all'85%
  let fake = 0;
  const fakeTimer = setInterval(() => {
    fake = Math.min(BAR_INC, fake + (0.06 + Math.random()*0.08));
    setBar(fake);
    if (fake >= BAR_INC) clearInterval(fakeTimer);
  }, 140);

  // Promesse "realistiche"
  const heroEl =
    document.querySelector('img[fetchpriority="high"]') ||
    document.querySelector('.hero img') ||
    document.getElementById('pizza-sprite');

  const heroReady = heroEl
    ? (heroEl.complete ? Promise.resolve() :
        new Promise(res => {
          heroEl.addEventListener('load', res, { once: true });
          heroEl.addEventListener('error', res, { once: true });
        }))
    : Promise.resolve();

  const fontsReady = ('fonts' in document) ? document.fonts.ready : Promise.resolve();

  const minDelay = new Promise(res => setTimeout(res, MIN_MS));
  const maxDelay = new Promise(res => setTimeout(res, MAX_MS)); // hard cap anti-stallo

  const startT = performance.now();

  // Avanza barra quando font/hero arrivano (senza bloccare la chiusura)
  fontsReady.then(() => setBar(Math.max(fake, 0.92)));
  heroReady.then(() => setBar(Math.max(fake, 0.97)));

  // Regola di chiusura:
  // - aspetta almeno MIN_MS
  // - chiudi quando heroReady è pronto O scatta MAX_MS (whichever first)
  Promise.all([minDelay, Promise.race([heroReady, maxDelay])])
    .then(() => {
      clearInterval(fakeTimer);
      setBar(1);
      try { localStorage.setItem(FIRST_VISIT_KEY, 'true'); } catch (_) {}
      pre.classList.add('is-hidden');
      document.body.classList.remove('is-loading');
      setTimeout(() => {
        try { pre.remove(); } catch (_) {}
        // Notifica app pronta
        window.dispatchEvent(new Event('app:ready'));
      }, 420);
    });

  // BFCache: se torni indietro, non ripresentare il preloader
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) {
      pre.classList.add('is-hidden');
      document.body.classList.remove('is-loading');
      requestAnimationFrame(() => pre.remove());
      window.dispatchEvent(new Event('app:ready'));
    }
  });
})();



/* ===========================
   🍕 Pizza intro — prima visita + ai refresh
   - Non ripetere più volte nella stessa sessione (tab) se non è refresh
   - Se c'è il preloader, aspetta 'app:ready' per partire visibile
   =========================== */
(function () {
  const wrapper = document.getElementById('pizza-anim');
  const sprite  = document.getElementById('pizza-sprite');
  if (!wrapper || !sprite) return;

  // Capire se è un refresh
  const navEntry = performance.getEntriesByType('navigation')[0];
  const isReload = !!navEntry && navEntry.type === 'reload';

  // Gating di sessione
  const SESSION_KEY = 'pizzaIntroSeenThisSession';
  const alreadySeen = !!sessionStorage.getItem(SESSION_KEY);

  // Parte alla prima visita della sessione, e parte anche sui refresh.
  if (alreadySeen && !isReload) {
    wrapper.style.opacity = '0';
    requestAnimationFrame(() => { try { wrapper.remove(); } catch(_) {} });
    return;
  }

  function markSeen() {
    try { sessionStorage.setItem(SESSION_KEY, '1'); } catch(_) {}
  }

  // Utils
  const vw = () => (window.visualViewport ? visualViewport.width  : window.innerWidth);
  const vh = () => (window.visualViewport ? visualViewport.height : window.innerHeight);
  const clamp = (x,a=0,b=1)=>Math.min(b,Math.max(a,x));
  const easeInOutCubic = (t)=> t<0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2;
  const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobile = matchMedia('(hover: none) and (pointer: coarse)').matches || vw() < 768;

  // PARTENZA sincronizzata con fine preloader (se presente)
  function onAppReady(fn) {
    if (document.body && !document.body.classList.contains('is-loading')) {
      // preloader già chiuso / non esiste
      fn(); return;
    }
    const handler = () => { window.removeEventListener('app:ready', handler); fn(); };
    window.addEventListener('app:ready', handler);
  }

  // DESKTOP: dinamica fisica come prima
  function startDesktop() {
    markSeen();

    let { width: w, height: h } = sprite.getBoundingClientRect();
    const scale01 = (x, a, b) => (Math.min(Math.max(x, a), b) - a) / (b - a);
    const s = scale01(vw(), 320, 1200);

    let g   = 1400 + s * (2400 - 1400);
    let vx  =  320 + s * ( 720 -  320);
    let rot =  1.4 + s * ( 2.6 -  1.4);

    if (vw() < 360 || vh() < 480) { g *= 0.8; vx *= 0.85; rot *= 0.9; }

    let x  = -w;
    let y  = Math.max(0.08 * vh(), 40);
    let vy = 0;
    const bounce = 0.55;
    let bounces = 0, exiting = false;
    let last = performance.now();
    const t0 = last;

    function recalc() {
      const r = sprite.getBoundingClientRect();
      w = r.width; h = r.height;
    }

    function tick(now) {
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;

      vy += g * dt;
      x  += vx * dt;
      y  += vy * dt;

      const floor = vh() - h - 12;
      if (y >= floor) {
        y = floor;
        vy = -vy * bounce;
        bounces++;
        if (bounces >= 2 && !exiting) { exiting = true; vx *= 1.25; rot *= 1.2; }
        if (Math.abs(vy) < 110) { vy = -220; exiting = true; vx *= 1.35; }
      }

      const angleDeg = ((now - t0) * 0.001 * rot) * 180 / Math.PI;
      sprite.style.transform = `translate(${x}px, ${y}px) rotate(${angleDeg}deg)`;

      if (x > vw() + w) {
        wrapper.style.transition = 'opacity .3s ease';
        wrapper.style.opacity = '0';
        setTimeout(() => wrapper.remove(), 320);
        return;
      }
      requestAnimationFrame(tick);
    }

    sprite.style.transform = `translate(${x}px, ${y}px) rotate(0deg)`;
    requestAnimationFrame((t) => { last = t; tick(t); });

    window.addEventListener('resize', recalc, { passive: true });
    if (window.visualViewport) {
      visualViewport.addEventListener('resize', recalc, { passive: true });
      visualViewport.addEventListener('scroll', recalc, { passive: true });
    }
  }

  // MOBILE: auto-play verso l’alto + fade out
  function startMobileAuto() {
    markSeen();

    const START_DELAY_MS = 350;
    const DURATION_MS    = 2500;
    const ROT_TURNS      = 2.25;
    const FADE_LAST_PCT  = 0.12;

    wrapper.style.opacity = '1';
    if (getComputedStyle(wrapper).position === 'static') wrapper.style.position = 'relative';
    wrapper.style.overflow = 'visible';

    sprite.style.display = 'block';
    sprite.style.position = 'absolute';
    sprite.style.left = '0';
    sprite.style.top  = '0';
    sprite.style.zIndex = '3';
    sprite.style.willChange = 'transform, opacity';
    sprite.style.backfaceVisibility = 'hidden';
    sprite.style.transformOrigin = '50% 50%';

    const wr = wrapper.getBoundingClientRect();
    const sr = sprite.getBoundingClientRect();
    const w  = sr.width;
    const h  = sr.height;

    const OFFSET_MODE = 'viewport';
    const OFFSET_X = 0.70;
    const OFFSET_Y = +0.1;

    const dx = OFFSET_MODE === 'viewport' ? OFFSET_X * vw() : OFFSET_X * wr.width;
    const dy = OFFSET_MODE === 'viewport' ? OFFSET_Y * vh() : OFFSET_Y * wr.height;

    const startX = (sr.left - wr.left) + dx;
    const startY = (sr.top  - wr.top)  + dy;
    const exitY  = -h - 32;

    sprite.style.transform = `translate3d(${startX}px, ${startY}px, 0) rotate(0deg)`;
    requestAnimationFrame(() => {
      sprite.style.transform = `translate3d(${startX}px, ${startY}px, 0) rotate(0deg)`;
    });

    setTimeout(() => {
      const t0 = performance.now();
      let done = false;

      function step(now) {
        if (done) return;
        const t = clamp((now - t0) / DURATION_MS, 0, 1);
        const e = easeInOutCubic(t);

        const y = startY + (exitY - startY) * e;
        const rot = 360 * ROT_TURNS * e;

        const fadeStart = 1 - FADE_LAST_PCT;
        const opacity = t <= fadeStart ? 1 : 1 - (t - fadeStart) / FADE_LAST_PCT;

        sprite.style.transform = `translate3d(${startX}px, ${y}px, 0) rotate(${rot}deg)`;
        wrapper.style.opacity  = String(opacity);

        if (t < 1) requestAnimationFrame(step);
        else {
          done = true;
          setTimeout(() => wrapper.remove(), 80);
        }
      }
      requestAnimationFrame(step);
    }, START_DELAY_MS);
  }

  const boot = () => {
    if (prefersReduced) {
      try { sessionStorage.setItem(SESSION_KEY, '1'); } catch(_) {}
      try { wrapper.remove(); } catch(_) {}
      return;
    }
    if ('decode' in sprite) sprite.decode().then(() => (isMobile ? startMobileAuto() : startDesktop()))
                                          .catch(() => (isMobile ? startMobileAuto() : startDesktop()));
    else if (sprite.complete) (isMobile ? startMobileAuto() : startDesktop());
    else sprite.onload = () => (isMobile ? startMobileAuto() : startDesktop());
  };

  // → Aspetta che l'app sia pronta (preloader chiuso), poi parte
  onAppReady(boot);

  // Se si torna via BFCache, non riprodurre (e pulisci)
  window.addEventListener('pageshow', (e) => {
    if (e.persisted && !isReload) {
      try { wrapper.remove(); } catch(_) {}
    }
  });
})();



/* ===========================
   🍕 Specials: rotate on scroll + fade when 360°
   =========================== */
(function(){
  const discs = Array.from(document.querySelectorAll('#specials .pizza-disc'));
  if (!discs.length) return;

  const easeOutCubic = t => 1 - Math.pow(1 - t, 3);

  function progressFor(el){
    const card = el.closest('.special-card') || el;
    const r = card.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const center = r.top + r.height/2;
    const start = vh * 1;
    const end   = vh * 0.2;
    let p = (start - center) / (start - end);
    return Math.max(0, Math.min(1, p));
  }

  let ticking = false;
  function onScroll(){
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(()=>{
      discs.forEach(el=>{
        const p = progressFor(el);
        const angle = 540 * p;
        const opacity = 1 - easeOutCubic(p);
        el.style.setProperty('--rot', angle + 'deg');
        el.style.opacity = opacity.toFixed(3);
        if (p >= 1 && !el.classList.contains('is-faded')) el.classList.add('is-faded');
      });
      ticking = false;
    });
  }

  window.addEventListener('scroll', onScroll, { passive:true });
  window.addEventListener('resize', onScroll, { passive:true });
  onScroll();
})();


/* ===========================
   🔢 Counter animation (testimonials)
   =========================== */
(function(){
  const counters = document.querySelectorAll('#testimonials .count-num');
  if(!counters.length) return;

  function animateCounter(el, target, duration){
    const stepTime = 15;
    const totalSteps = Math.max(1, Math.round(duration / stepTime));
    let currentStep = 0;

    const prefix   = el.dataset.prefix  || "";
    const suffix   = el.dataset.suffix  || "";
    const decimals = (el.dataset.decimals !== undefined)
      ? parseInt(el.dataset.decimals, 10)
      : (String(target).includes('.') ? (String(target).split('.')[1].length) : 0);

    const start = 0;
    const timer = setInterval(()=>{
      currentStep++;
      const progress = currentStep / totalSteps;
      const value    = start + (target - start) * progress;

      const formatted = (decimals > 0)
        ? value.toFixed(decimals)
        : Math.round(value).toString();

      el.textContent = `${prefix}${formatted}${suffix}`;

      if(currentStep >= totalSteps){
        clearInterval(timer);
        const finalFormatted = (decimals > 0)
          ? Number(target).toFixed(decimals)
          : Math.round(Number(target)).toString();
        el.textContent = `${prefix}${finalFormatted}${suffix}`;
      }
    }, stepTime);
  }

  const io = new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(entry.isIntersecting){
        const el = entry.target;
        const target = parseFloat(el.dataset.target);
        animateCounter(el, target, 1200);
        io.unobserve(el);
      }
    });
  }, { threshold: 0.6 });

  counters.forEach(el => io.observe(el));
})();


/* ===========================
   🧩 Helpers
   =========================== */
document.addEventListener('DOMContentLoaded', () => {
  // Footer year
  const y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();

  // Lightbox big image
  const lightbox = document.getElementById('lightbox');
  if (lightbox) {
    lightbox.addEventListener('show.bs.modal', event => {
      const triggerImg = event.relatedTarget;
      const bigSrc = triggerImg?.getAttribute('data-src');
      const img = document.getElementById('lightboxImg');
      if (bigSrc && img) img.src = bigSrc;
    });
  }
});


/* Evidenzia giorno corrente negli orari */
(function(){
  const days = ["domenica","lunedì","martedì","mercoledì","giovedì","venerdì","sabato"];
  const todayIndex = new Date().getDay();
  const todayName = days[todayIndex];

  const hoursList = document.querySelector('.hours-list');
  if(!hoursList) return;

  hoursList.querySelectorAll('dt').forEach(dt => {
    if(dt.textContent.trim().toLowerCase() === todayName){
      dt.classList.add('today');
      const dd = dt.nextElementSibling;
      if(dd) dd.classList.add('today');
    }
  });
})();


/* 📱 WhatsApp CTAs */
(function(){
  const btns = [document.getElementById('cta-whatsapp'), document.getElementById('cta-whatsapp-2')].filter(Boolean);
  btns.forEach(waBtn => {
    waBtn.addEventListener('click', e => {
      e.preventDefault();
      const num = waBtn.dataset.wa.replace(/\D/g, '');
      const msg = encodeURIComponent(waBtn.dataset.waText || '');
      const url = `https://wa.me/39${num}?text=${msg}`;
      window.open(url, '_blank');
    });
  });
})();

(function(){
  const callBtn = document.getElementById('cta-phone');
  if(!callBtn) return;
  callBtn.addEventListener('click', e => {
    e.preventDefault();
    const num = callBtn.dataset.phone?.replace(/\D/g, '');
    if(!num) return;
    window.location.href = `tel:${num}`;
  });
})();


/* ===========================
   📮 Form prenotazioni (FormSubmit)
   - Evita errori CORS e mostra sempre esito ✓
   =========================== */
(function(){
  const form = document.querySelector('form[action^="https://formsubmit.co/"]');
  const msg  = document.getElementById('form-msg');
  if(!form || !msg) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    const prev = btn.textContent;
    btn.disabled = true; btn.textContent = 'Invio...';

    try {
      await fetch(form.action, { method: 'POST', mode: 'no-cors', body: new FormData(form) });
      form.reset();
      show('Richiesta inviata! Ti ricontatteremo a breve.', 'success');
    } catch (_) {
      show('Richiesta inviata! Ti ricontatteremo a breve.', 'success');
    } finally {
      btn.disabled = false; btn.textContent = prev;
    }
  });

  function show(text, type){
    msg.className = 'alert alert-' + type;
    msg.textContent = text;
  }
})();
