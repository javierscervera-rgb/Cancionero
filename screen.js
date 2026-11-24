// Modo "Pantalla": proyección de la letra (sin acordes), blanca sobre negro y centrada.
// Muestra el párrafo seleccionado; con el modo en directo sigue al párrafo del emisor.
(function () {
  'use strict';
  const A = window.App;
  if (!A) return;
  const $ = (id) => document.getElementById(id);
  const store = {
    get(k, d) { try { const v = localStorage.getItem('cm:' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('cm:' + k, JSON.stringify(v)); } catch (e) { /* nada */ } }
  };

  const FONTS = {
    sans: { label: 'Helvetica / Arial', css: '"Helvetica Neue", Helvetica, Arial, "Liberation Sans", sans-serif' },
    montserrat: { label: 'Montserrat', css: '"Montserrat", sans-serif', g: 'Montserrat:wght@500;700' },
    lato: { label: 'Lato', css: '"Lato", sans-serif', g: 'Lato:wght@400;700' },
    nunito: { label: 'Nunito (redondeada)', css: '"Nunito", sans-serif', g: 'Nunito:wght@500;700' },
    oswald: { label: 'Oswald (estrecha)', css: '"Oswald", sans-serif', g: 'Oswald:wght@400;600' },
    serif: { label: 'Georgia (serif)', css: 'Georgia, "Times New Roman", serif' },
    merriweather: { label: 'Merriweather (serif)', css: '"Merriweather", serif', g: 'Merriweather:wght@400;700' },
    playfair: { label: 'Playfair Display', css: '"Playfair Display", serif', g: 'Playfair+Display:wght@500;700' }
  };

  const cfg = Object.assign({ size: 7, t: 8, b: 8, l: 6, r: 6, font: 'sans', bold: false }, store.get('screen', {}));
  if (!FONTS[cfg.font]) cfg.font = 'sans';
  const save = () => store.set('screen', cfg);
  let on = false, clean = false, uiTimer = null, guideTimer = null;

  // ---------- Interfaz ----------
  const el = document.createElement('div');
  el.id = 'screen'; el.className = 'screen'; el.hidden = true;
  el.innerHTML = `
    <div class="scr-stage" id="scrStage"><div class="scr-text" id="scrText"></div></div>
    <div class="scr-guide" id="scrGuide"></div>
    <div class="scr-line h" data-m="t" title="Arrastra: borde superior del texto"></div>
    <div class="scr-line h" data-m="b" title="Arrastra: borde inferior del texto"></div>
    <div class="scr-line v" data-m="l" title="Arrastra: borde izquierdo del texto"></div>
    <div class="scr-line v" data-m="r" title="Arrastra: borde derecho del texto"></div>
    <div class="scr-ui" id="scrUi">
      <div class="scr-row">
        <button class="sb" id="scrExit" title="Salir del modo Pantalla (Esc)">✕<span class="txt"> Salir</span></button>
        <span class="sg">
          <button class="sb" id="scrPrev" title="Párrafo anterior (←)">◀</button>
          <span class="sv" id="scrPos"></span>
          <button class="sb" id="scrNext" title="Párrafo siguiente (→ o espacio)">▶</button>
        </span>
        <button class="sb blank-sb" id="scrBlank" aria-pressed="false" title="Pantalla en negro, sin letra (B)"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/><path d="M3.5 2.5l17 17"/></svg><span class="txt"> En negro</span></button>
        <span class="sg">
          <button class="sb" data-k="size" data-d="-0.5" title="Letra más pequeña">A−</button>
          <span class="sv" id="scrSize"></span>
          <button class="sb" data-k="size" data-d="0.5" title="Letra más grande">A+</button>
        </span>
        <button class="sb" id="scrCfg" aria-expanded="false" title="Fuente y negrita">Aa</button>
        <button class="sb accent" id="scrFs" title="Pantalla completa (F)">⛶<span class="txt"> Pantalla completa</span></button>
      </div>
      <div class="scr-row cfg">
        <span class="sg"><span class="sl">Fuente</span>
          <select id="scrFont" aria-label="Fuente de la letra"></select>
          <button class="sb" id="scrBold" aria-pressed="false" title="Negrita"><b>N</b></button>
        </span>
      </div>
    </div>`;
  document.body.appendChild(el);

  const sel = $('scrFont');
  Object.entries(FONTS).forEach(([k, f]) => {
    const o = document.createElement('option');
    o.value = k; o.textContent = f.label; o.style.fontFamily = f.css;
    sel.appendChild(o);
  });

  const loadedFonts = {};
  function loadFont(k) {
    const f = FONTS[k];
    if (!f || !f.g || loadedFonts[k]) return;
    loadedFonts[k] = true;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=' + f.g + '&display=swap';
    link.onload = () => fit();
    document.head.appendChild(link);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => fit());
  }

  // ---------- Contenido y ajuste ----------
  // Los párrafos ya vienen partidos según el máximo de caracteres común (lo decide el líder)
  function chunksOf(lines) { return [lines]; }
  const curChunks = () => { const i = A.para(); return i === null || i === undefined ? [] : chunksOf(A.lyricParas()[i] || []); };
  // Solo se proyectan estrofas, nunca el título. Al cambiar de canción (sin párrafo elegido)
  // la pantalla no cambia: sigue la última estrofa hasta que se marque una de la nueva canción.
  let shown = '', shownCita = false;
  function content() {
    const i = A.para();
    if (A.blank && A.blank()) return '';
    if (!A.title() || i === null || i === undefined) return shown;
    const ch = curChunks();
    shown = (ch[Math.min(A.sub(), ch.length - 1)] || []).join('\n');
    shownCita = !!(A.paraCita && A.paraCita());
    return shown;
  }
  // avanzar o retroceder: primero por los trozos del párrafo, luego al párrafo siguiente/anterior
  function stepScreen(d) {
    const i = A.para(), n = curChunks().length, sub = Math.min(A.sub(), Math.max(0, n - 1));
    if (i !== null && d > 0 && sub < n - 1) { A.setSub(sub + 1); return; }
    if (i !== null && d < 0 && sub > 0) { A.setSub(sub - 1); return; }
    A.step(d);
    if (d < 0) { const m = curChunks().length; if (m > 1) A.setSub(m - 1); }
  }

  // modo Cita: el elegido por el líder, o automático si la estrofa está entre ~ … ~
  const citaNow = () => !!((A.pres && A.pres().mode === 'cita') || shownCita);
  function fit() {
    if (!on) return;
    const stage = $('scrStage'), txt = $('scrText');
    const p = A.pres ? A.pres() : { scale: 1, mode: 'song' };
    const max = cfg.size * p.scale * (citaNow() ? 0.42 : 1) * window.innerHeight / 100;
    txt.style.fontSize = max + 'px';
    const fits = () => txt.scrollHeight + (txt.offsetHeight - txt.clientHeight) <= stage.clientHeight + 1 && txt.scrollWidth + (txt.offsetWidth - txt.clientWidth) <= stage.clientWidth + 1;
    if (fits()) return;
    // búsqueda binaria del mayor tamaño que cabe
    let lo = 6, hi = max;
    for (let k = 0; k < 14; k++) {
      const mid = (lo + hi) / 2;
      txt.style.fontSize = mid + 'px';
      if (fits()) lo = mid; else hi = mid;
    }
    txt.style.fontSize = lo + 'px';
  }

  function render() {
    if (!on) return;
    const stage = $('scrStage');
    stage.style.top = cfg.t + 'vh'; stage.style.bottom = cfg.b + 'vh';
    stage.style.left = cfg.l + 'vw'; stage.style.right = cfg.r + 'vw';
    const txt = $('scrText');
    txt.style.fontFamily = FONTS[cfg.font].css;
    txt.style.fontWeight = cfg.bold ? '700' : '400';
    const c = content();
    el.classList.toggle('cita', citaNow());
    if (txt.textContent !== c) {
      txt.classList.remove('show'); void txt.offsetWidth;
      txt.textContent = c;
      txt.classList.add('show');
    }
    const n = A.paraCount(), i = A.para();
    const nc = curChunks().length;
    $('scrPos').textContent = n ? ((i === null ? '–' : i + 1) + (nc > 1 ? '.' + (Math.min(A.sub(), nc - 1) + 1) : '') + ' / ' + n) : '';
    $('scrSize').textContent = cfg.size.toFixed(1);
    placeLines();
    sel.value = cfg.font;
    $('scrBold').setAttribute('aria-pressed', String(cfg.bold));
    $('scrBlank').setAttribute('aria-pressed', String(!!(A.blank && A.blank())));
    loadFont(cfg.font);
    fit();
  }

  function showGuide() {
    const g = $('scrGuide');
    g.style.top = cfg.t + 'vh'; g.style.bottom = cfg.b + 'vh'; g.style.left = cfg.l + 'vw'; g.style.right = cfg.r + 'vw';
    g.classList.add('on');
    clearTimeout(guideTimer);
    guideTimer = setTimeout(() => g.classList.remove('on'), 1500);
  }

  // ---------- Entrar / salir / pantalla completa ----------
  const isFs = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  function open() {
    on = true; el.hidden = false;
    document.body.classList.add('screen-mode');
    document.documentElement.classList.add('screen-on');
    wake(); render();
  }
  function close() {
    if (isFs()) exitFs();
    setClean(false);
    on = false; el.hidden = true;
    document.body.classList.remove('screen-mode');
    document.documentElement.classList.remove('screen-on');
    const i = A.para();
    if (i !== null) A.selectPara(i); // recoloca el párrafo en la vista normal
  }
  function setClean(c) {
    clean = c;
    el.classList.toggle('clean', c);
    if (window.Live && window.Live.setFs) window.Live.setFs(c); // los demás saben que esta pantalla está en pantalla completa
    document.dispatchEvent(new CustomEvent('screen-clean', { detail: c }));
    document.body.classList.toggle('screen-clean', c);
    if (!c) wake();
    setTimeout(fit, 60);
  }
  // Recibiendo en pantalla completa: no se puede navegar por cuenta propia
  const locked = () => clean && window.Live && window.Live.receiving();
  function enterFs() {
    if (window.Live && window.Live.receiving()) window.Live.resume();
    const d = document.documentElement;
    const req = d.requestFullscreen || d.webkitRequestFullscreen;
    setClean(true);
    if (req) {
      try {
        const p = req.call(d, { navigationUI: 'hide' });
        if (p && p.catch) p.catch(() => { /* sin pantalla completa real: queda el modo limpio */ });
      } catch (e) { /* idem */ }
    }
  }
  function exitFs() {
    const ex = document.exitFullscreen || document.webkitExitFullscreen;
    if (ex && isFs()) { try { ex.call(document); } catch (e) { /* nada */ } }
  }
  ['fullscreenchange', 'webkitfullscreenchange'].forEach((t) => document.addEventListener(t, () => {
    if (!isFs() && clean) setClean(false);
    setTimeout(fit, 80);
  }));

  // ---------- Controles ----------
  el.querySelectorAll('[data-k]').forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation();
      const k = b.dataset.k, d = +b.dataset.d;
      if (k === 'size') cfg.size = Math.max(2, Math.min(20, Math.round((cfg.size + d) * 10) / 10));
      else { cfg[k] = Math.max(0, Math.min(40, cfg[k] + d)); showGuide(); }
      save(); render();
    };
  });
  sel.onchange = () => { cfg.font = sel.value; save(); render(); };
  $('scrBold').onclick = (e) => { e.stopPropagation(); cfg.bold = !cfg.bold; save(); render(); };
  $('scrExit').onclick = (e) => { e.stopPropagation(); close(); };
  $('scrFs').onclick = (e) => { e.stopPropagation(); enterFs(); };
  function setCfgOpen(o) {
    el.classList.toggle('cfg-open', o);
    $('scrCfg').setAttribute('aria-expanded', String(o));
    store.set('screenCfgOpen', o);
  }
  $('scrCfg').onclick = (e) => { e.stopPropagation(); setCfgOpen(!el.classList.contains('cfg-open')); };
  setCfgOpen(store.get('screenCfgOpen', false));
  $('scrPrev').onclick = (e) => { e.stopPropagation(); stepScreen(-1); };
  $('scrNext').onclick = (e) => { e.stopPropagation(); stepScreen(1); };
  $('scrUi').addEventListener('click', (e) => e.stopPropagation());

  // Tocar la letra: tercio izquierdo = anterior, resto = siguiente.
  // Mantener pulsado 0,7 s sale de la pantalla completa / modo limpio.
  let pressTimer = null, longPressed = false;
  $('scrStage').parentElement.addEventListener('pointerdown', (e) => {
    if (e.target.closest('#scrUi') || e.target.closest('.scr-line')) return;
    longPressed = false;
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => { longPressed = true; if (clean) { exitFs(); setClean(false); } }, 700);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) =>
    el.addEventListener(t, () => clearTimeout(pressTimer)));
  el.addEventListener('click', (e) => {
    if (!on || longPressed || justDragged || e.target.closest('#scrUi') || e.target.closest('.scr-line') || locked()) return;
    if (e.clientX < window.innerWidth / 3) stepScreen(-1); else stepScreen(1);
  });

  document.addEventListener('keydown', (e) => {
    if (!on || e.target.matches('input, textarea')) return;
    const k = e.key;
    if (locked() && !['f', 'F', 'Escape'].includes(k)) { e.preventDefault(); return; }
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(k)) { e.preventDefault(); stepScreen(1); }
    else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(k)) { e.preventDefault(); stepScreen(-1); }
    else if (k === 'f' || k === 'F') { if (isFs() || clean) { exitFs(); setClean(false); } else enterFs(); }
    else if (k === 'Escape') { if (clean && !isFs()) setClean(false); else if (!isFs()) close(); }
    else if ((k === 'b' || k === 'B') && !(window.Live && window.Live.receiving())) A.setBlank(!A.blank());
    else if (k === 'n' || k === 'N') A.song(1);
    else if (k === 'p' || k === 'P') A.song(-1);
  });

  // Controles semitransparentes tras 5 s sin actividad
  function wake() {
    el.classList.remove('idle');
    clearTimeout(uiTimer);
    uiTimer = setTimeout(() => el.classList.add('idle'), 5000);
  }
  ['pointermove', 'pointerdown', 'keydown', 'touchstart'].forEach((t) =>
    window.addEventListener(t, () => { if (on && !clean) wake(); }, { passive: true }));
  window.addEventListener('resize', () => { if (on) fit(); });

  // ---------- Cuadro del texto: cuatro rayas que se arrastran (forman un #) ----------
  function placeLines() {
    el.querySelectorAll('.scr-line').forEach((ln) => {
      const m = ln.dataset.m;
      if (m === 't') ln.style.top = cfg.t + 'vh';
      if (m === 'b') ln.style.top = (100 - cfg.b) + 'vh';
      if (m === 'l') ln.style.left = cfg.l + 'vw';
      if (m === 'r') ln.style.left = (100 - cfg.r) + 'vw';
    });
  }
  let dragLine = null, justDragged = false;
  el.querySelectorAll('.scr-line').forEach((ln) => {
    ln.addEventListener('pointerdown', (e) => {
      e.stopPropagation(); e.preventDefault();
      dragLine = ln; ln.classList.add('drag'); ln.setPointerCapture(e.pointerId);
    });
    ln.addEventListener('pointermove', (e) => {
      if (dragLine !== ln) return;
      const m = ln.dataset.m, W = window.innerWidth, H = window.innerHeight;
      const r1 = (v) => Math.round(v * 2) / 2; // medio punto porcentual
      if (m === 't') cfg.t = r1(Math.max(0, Math.min(100 - cfg.b - 10, e.clientY / H * 100)));
      if (m === 'b') cfg.b = r1(Math.max(0, Math.min(100 - cfg.t - 10, (H - e.clientY) / H * 100)));
      if (m === 'l') cfg.l = r1(Math.max(0, Math.min(100 - cfg.r - 10, e.clientX / W * 100)));
      if (m === 'r') cfg.r = r1(Math.max(0, Math.min(100 - cfg.l - 10, (W - e.clientX) / W * 100)));
      render();
    });
    const end = () => {
      if (dragLine !== ln) return;
      dragLine = null; ln.classList.remove('drag'); save();
      justDragged = true; setTimeout(() => { justDragged = false; }, 250);
    };
    ln.addEventListener('pointerup', end);
    ln.addEventListener('pointercancel', end);
    ln.addEventListener('click', (e) => e.stopPropagation());
  });

  $('scrBlank').onclick = (e) => { e.stopPropagation(); A.setBlank(!A.blank()); };
  A.onView(render);

  window.ScreenMode = { el, isOn: () => on, isClean: () => clean, refit: () => fit() };

  // Botón en la barra de controles
  const btn = $('screenBtn');
  if (btn) btn.onclick = open;
})();
