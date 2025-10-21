
/* ===========================
   ⏳ PRELOADER (immagini + font) — solo alla prima visita
   =========================== */
(function () {
  const pre = document.getElementById('preloader');
  if (!pre) return;

  const FIRST_VISIT_KEY = 'preloaderSeen';        // flag persistenza
  const isFirstVisit = !localStorage.getItem(FIRST_VISIT_KEY);

  // Se NON è la prima visita: nascondi subito e salta tutta la trafila
  if (!isFirstVisit) {
    pre.classList.add('is-hidden');
    document.body.classList.remove('is-loading');
    // rimuovi il nodo appena possibile
    requestAnimationFrame(() => pre.remove());
    return;
  }

  const bar  = pre.querySelector('.preloader__bar-fill');
  const perc = pre.querySelector('.preloader__perc');

  const minMs = parseInt(getComputedStyle(document.documentElement)
    .getPropertyValue('--preloader-min-ms')) || 600;

  // Colleziona risorse da caricare: immagini DOM + fonts
  const imgs = Array.from(document.images || []);
  const totalImages = imgs.length;
  let loaded = 0;

  const update = (p) => {
    const pct = Math.max(0, Math.min(100, Math.round(p * 100)));
    if (bar)  bar.style.width = pct + '%';
    if (perc) perc.textContent = pct + '%';
  };

  let progress = 0; // 0..1
  const bump = (delta) => {
    progress = Math.max(progress, Math.min(1, delta));
    update(progress);
  };

  // 1) immagini
  if (totalImages === 0) bump(0.6);
  else {
    imgs.forEach(img => {
      const done = () => { loaded++; bump(0.2 + 0.6 * (loaded / totalImages)); };
      if (img.complete) done();
      else {
        img.addEventListener('load',  done, { once: true });
        img.addEventListener('error', done, { once: true });
      }
    });
  }

  // 2) fonts
  const fontsReady = ('fonts' in document) ? document.fonts.ready : Promise.resolve();
  fontsReady.then(() => bump(0.95));

  // 3) all done (window load) + durata minima
  const start = performance.now();
  window.addEventListener('load', () => {
    const elapsed = performance.now() - start;
    const delay = Math.max(0, minMs - elapsed);
    setTimeout(() => {
      bump(1);
      // segna che il preloader è già stato visto
      try { localStorage.setItem(FIRST_VISIT_KEY, 'true'); } catch (_) {}
      pre.classList.add('is-hidden');
      document.body.classList.remove('is-loading');
      setTimeout(() => pre.remove(), 450);
    }, delay);
  });

  // 🚫 Evita “fantasmi” tornando indietro con bfcache
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) {
      pre.classList.add('is-hidden');
      document.body.classList.remove('is-loading');
      requestAnimationFrame(() => pre.remove());
    }
  });
})();











/* PIZZA – desktop: fisica; mobile: auto-play (no scroll), start con delay anti-lag */
(function () {
  const wrapper = document.getElementById('pizza-anim');
  const sprite  = document.getElementById('pizza-sprite');
  if (!wrapper || !sprite) return;

  // 🔎 Capire come sei arrivato qui (reload vs navigate/back)
  const navEntry = performance.getEntriesByType('navigation')[0];
  const isReload = !!navEntry && navEntry.type === 'reload';

  // 🎯 Target: riproduci SOLO se è la prima volta di questa sessione
  //            MA se è un refresh (reload) riproduci comunque.
  const SESSION_KEY = 'pizzaIntroSeenThisSession';
  const alreadySeen = !!sessionStorage.getItem(SESSION_KEY);

  if (alreadySeen && !isReload) {
    // Già vista in questa sessione e NON è un refresh ➜ salta e pulisci
    wrapper.style.opacity = '0';
    requestAnimationFrame(() => { try { wrapper.remove(); } catch(_) {} });
    return;
  }

  // Se si torna tramite bfcache, non riprodurre
  window.addEventListener('pageshow', (e) => {
    if (e.persisted && !isReload) {
      try { wrapper.remove(); } catch(_) {}
    }
  });

  // ========= UTIL =========
  const vw = () => (window.visualViewport ? visualViewport.width  : window.innerWidth);
  const vh = () => (window.visualViewport ? visualViewport.height : window.innerHeight);
  const clamp = (x,a=0,b=1)=>Math.min(b,Math.max(a,x));
  const easeInOutCubic = (t)=> t<0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2;
  const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobile = matchMedia('(hover: none) and (pointer: coarse)').matches || vw() < 768;

  // Al primo avvio DELL'ANIMAZIONE (sia prima visita che reload), segna come vista
  function markSeen() {
    try { sessionStorage.setItem(SESSION_KEY, '1'); } catch(_) {}
  }

  // ========= DESKTOP (come prima) =========
  function startDesktop() {
    markSeen();
    // segna come vista all’avvio dell’animazione
    try { sessionStorage.setItem(SESSION_KEY, '1'); } catch(_) {}

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

  // ========= MOBILE: auto-play dall’attuale posizione (no scroll) =========
  function startMobileAuto() {
    markSeen();
    // segna come vista all’avvio dell’animazione
    try { sessionStorage.setItem(SESSION_KEY, '1'); } catch(_) {}

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

        if (t < 1) {
          requestAnimationFrame(step);
        } else {
          done = true;
          setTimeout(() => wrapper.remove(), 80);
        }
      }

      requestAnimationFrame(step);
    }, START_DELAY_MS);
  }

  // ========= AVVIO =========
  const boot = () => {
    if (prefersReduced) {
      // Accessibilità: niente animazione
      try { sessionStorage.setItem(SESSION_KEY, '1'); } catch(_) {}
      try { wrapper.remove(); } catch(_) {}
      return;
    }
    if (isMobile) startMobileAuto(); else startDesktop();
  };

  if ('decode' in sprite) sprite.decode().then(boot).catch(boot);
  else if (sprite.complete) boot();
  else sprite.onload = boot;
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
   🧩 Piccoli helper della pagina
   - Anno nel footer
   - Lightbox per gallery
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

/*ORARI*/

/* Evidenzia giorno corrente negli orari */
(function(){
  const days = ["domenica","lunedì","martedì","mercoledì","giovedì","venerdì","sabato"];
  const todayIndex = new Date().getDay(); // 0=dom, 6=sab
  const todayName = days[todayIndex];

  const hoursList = document.querySelector('.hours-list');
  if(!hoursList) return;

  // Trova tutti i dt (giorni)
  hoursList.querySelectorAll('dt').forEach(dt => {
    if(dt.textContent.trim().toLowerCase() === todayName){
      dt.classList.add('today');
      const dd = dt.nextElementSibling;
      if(dd) dd.classList.add('today');
    }
  });
})();


/*CALL TO ACTION WHATSAPP */
/* ============================
   📱 WhatsApp CTA click handler
   ============================ */
(function(){
  const waBtn = document.getElementById('cta-whatsapp');
  if(!waBtn) return;

  waBtn.addEventListener('click', e => {
    e.preventDefault();
    const num = waBtn.dataset.wa.replace(/\D/g, '');  // pulisce il numero
    const msg = encodeURIComponent(waBtn.dataset.waText || '');
    const url = `https://wa.me/39${num}?text=${msg}`;
    window.open(url, '_blank');
  });
})();

(function(){
  const waBtn = document.getElementById('cta-whatsapp-2');
  if(!waBtn) return;

  waBtn.addEventListener('click', e => {
    e.preventDefault();
    const num = waBtn.dataset.wa.replace(/\D/g, '');  // pulisce il numero
    const msg = encodeURIComponent(waBtn.dataset.waText || '');
    const url = `https://wa.me/39${num}?text=${msg}`;
    window.open(url, '_blank');
  });
})();

(function(){
  const callBtn = document.getElementById('cta-phone');
  if(!callBtn) return;

  callBtn.addEventListener('click', e => {
    e.preventDefault();
    const num = callBtn.dataset.phone?.replace(/\D/g, ''); // pulisce il numero (solo cifre)
    if(!num) return;
    window.location.href = `tel:${num}`; // apre il dialer
  });
})();


/*FORM PRENOTAZIONI */


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
      // no-cors: il browser invia, ma la risposta è "opaque" → niente CORS error, niente status
      await fetch(form.action, {
        method: 'POST',
        mode: 'no-cors',
        body: new FormData(form)
      });
      form.reset();
      show('Richiesta inviata! Ti ricontatteremo a breve.', 'success');
    } catch (err) {
      // Se proprio esplode la rete, segnalo errore
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
