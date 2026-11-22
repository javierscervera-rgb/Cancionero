// Ángelus / Regina Coeli en la pantalla completa (Cancionero Parroquia).
// El botón de la cabecera lo activa en los dispositivos que tienen la pantalla completa:
//   arriba (2/3) el directo de YouTube; abajo (1/3) la oración en latín, letra negra sobre blanco.
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const btn = $('angelusBtn');
  if (!btn || !window.ScreenMode) return;
  const VIDEO = '5lfWxoaPGRg';
  const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  const TXT = {
    angelus: `<p class="ttl">ÁNGELUS:</p>
<p><span class="v">V/.</span> Ángelus Dómini nuntiávit Maríae.</p>
<p class="r"><span class="v">R/.</span> Et concépit de Spíritu Sancto.</p>
<p class="av">Ave Maria.</p>
<p><span class="v">V/.</span> Ecce ancílla Dómini.</p>
<p class="r"><span class="v">R/.</span> Fiat mihi secúndum verbum tuum.</p>
<p class="av">Ave Maria.</p>
<p><span class="v">V/.</span> Et Verbum caro factum est.</p>
<p class="r"><span class="v">R/.</span> Et habitavit in nobis.</p>
<p class="av">Ave Maria.</p>
<p><span class="v">V/.</span> Ora pro nobis, sancta Dei Génitrix.</p>
<p class="r"><span class="v">R/.</span> Ut digni efficiámur promissiónibus Christi.</p>
<p class="or">Orémus:<br>Grátiam tuam, quaésumus, Dómine, méntibus nostris infúnde: ut qui, Ángelo nuntiánte, Christi Fílii tui Incarnatiónem cognóvimus, per Passiónem ejus et Crucem ad resurrectiónis glóriam perducámur. Per eúmdem Christum Dóminum nostrum.</p>
<p class="r"><span class="v">R/.</span> Amen.</p>`,
    regina: `<p class="ttl">REINA DEL CIELO:</p>
<p><span class="v">V/.</span> Regina caeli, laetare, alleluia.</p>
<p class="r"><span class="v">R/.</span> Quia quem meruisti portare, alleluia.</p>
<p><span class="v">V/.</span> Resurrexit, sicut dixit, alleluia.</p>
<p class="r"><span class="v">R/.</span> Ora pro nobis Deum, alleluia.</p>
<p><span class="v">V/.</span> Gaude et laetare Virgo María, alleluia.</p>
<p class="r"><span class="v">R/.</span> Quia surrexit Dominus vere, alleluia.</p>
<p>Oremus:</p>
<p class="or">Deus, qui per resurrectionem Filii tui, Domini nostri Iesu Christi, mundum laetificare dignatus es: praesta, quaesumus; ut, per eius Genetricem Virginem Mariam, perpetuae capiamus gaudia vitae. Per eundem Christum Dominum nostrum. Amen.</p>`,
    right: `<p>Ave Maria, gratia plena, Dominus tecum,<br>benedicta tu in mulieribus,<br>et benedictus fructus ventris tui, Jesus.<br><b>Sancta Maria mater Dei,<br>ora pro nobis peccatoribus,<br>nunc et in hora mortis nostrae. Amen.</b></p>
<p class="gap"></p>
<p><span class="v">V/.</span> Gloria Patri, et Filio, et Spiritui Sancto.</p>
<p class="r"><span class="v">R/.</span> Sicut erat in principio, et nunc, et semper, et in sæcula sæculorum. Amen.</p>
<p class="gap"></p>
<p class="ttl">POR LOS FIELES DIFUNTOS:</p>
<p><span class="v">V/.</span> Pro fidelibus defunctis.</p>
<p>Réquiem ætérnam dona eis, Dómine.</p>
<p class="r"><span class="v">R/.</span> Et lux perpétua lúceat eis.</p>
<p><span class="v">V/.</span> Requiéscant in pace.</p>
<p class="r"><span class="v">R/.</span> Amen.</p>
<p class="gap"></p>
<p class="ttl">BENDICIÓN PAPAL:</p>
<p><span class="v">V/.</span> Dominus vobiscum.</p>
<p class="r"><span class="v">R/.</span> Et cum spiritu tuo.</p>
<p><span class="v">V/.</span> Sit nomen Domini benedictum.</p>
<p class="r"><span class="v">R/.</span> Ex hoc nunc et usque in sæculum.</p>
<p><span class="v">V/.</span> Adiutorium nostrum in nomine Domini.</p>
<p class="r"><span class="v">R/.</span> Qui fecit cælum et terram.</p>
<p><span class="v">V/.</span> Benedicat vos omnipotens Deus, Pater, et Filius, et Spiritus Sanctus.</p>
<p class="r"><span class="v">R/.</span> Amen.</p>`
  };

  // estado: { on, kind: 'angelus' | 'regina', t }
  let mine = null;   // lo último que se ha decidido en este dispositivo
  let cur = { on: false, kind: 'angelus', t: 0 };

  // ---------- Vista dentro de la pantalla completa ----------
  const view = document.createElement('div');
  view.id = 'angelusView'; view.className = 'ang-view'; view.hidden = true;
  view.innerHTML = `
    <div class="ang-video"><div class="ang-move" id="angVideo"></div><div class="ang-pan" id="angPan" title="Arrastra para mover · rueda o pellizco para acercar · doble clic para volver"></div><button class="ang-snd" id="angSnd" aria-label="Sonido del vídeo" title="Sonido del vídeo">🔊</button></div>
    <div class="ang-text" id="angText">
      <div class="ang-cols" id="angCols"><div class="ang-col" id="angLeft"></div><div class="ang-col" id="angRight"></div></div>
      <div class="ang-fs"><button id="angFsDown" aria-label="Letra más pequeña">A−</button><button id="angFsUp" aria-label="Letra más grande">A+</button></div>
      <div class="ang-mline" data-side="l" title="Arrastra para cambiar el margen"></div><div class="ang-mline" data-side="r" title="Arrastra para cambiar el margen"></div>
    </div>
    <div class="ang-sel" role="group" aria-label="Oración">
      <button data-k="angelus">Ángelus</button><button data-k="regina">Regina Coeli</button>
    </div>`;
  window.ScreenMode.el.appendChild(view);
  view.addEventListener('click', (e) => e.stopPropagation());
  view.addEventListener('pointerdown', (e) => e.stopPropagation());
  view.querySelectorAll('.ang-sel [data-k]').forEach((b) => { b.onclick = () => decide({ on: true, kind: b.dataset.k }); });

  // ---------- Vídeo a todo el ancho, con zoom y desplazamiento dentro de su marco ----------
  // cam: s = zoom (1 = cubre el marco), fx/fy = punto del vídeo (0–1) que queda en el centro del marco
  const CAMKEY = 'cm:angCam';
  let cam = { s: 1, fx: 0.5, fy: 0.5 };
  try { cam = Object.assign(cam, JSON.parse(localStorage.getItem(CAMKEY) || '{}')); } catch (e) { /* nada */ }
  const frame = () => $('angPan');
  function base() {
    const f = frame(), W = f.clientWidth, H = f.clientHeight;
    // tamaño 16:9 que cubre el marco entero (a todo el ancho; si hace falta, a toda la altura)
    let w = W, h = W * 9 / 16;
    if (h < H) { h = H; w = H * 16 / 9; }
    return { W, H, w, h };
  }
  function applyCam() {
    const mv = $('angVideo'); if (!mv || !frame()) return;
    const { W, H, w, h } = base();
    if (!W || !H) return;
    cam.s = Math.max(1, Math.min(5, cam.s));
    const sw = w * cam.s, sh = h * cam.s;
    let tx = W / 2 - cam.fx * sw, ty = H / 2 - cam.fy * sh;
    tx = Math.min(0, Math.max(W - sw, tx)); ty = Math.min(0, Math.max(H - sh, ty));
    cam.fx = (W / 2 - tx) / sw; cam.fy = (H / 2 - ty) / sh;
    mv.style.width = w + 'px'; mv.style.height = h + 'px';
    mv.style.transform = `translate(${tx}px, ${ty}px) scale(${cam.s})`;
    try { localStorage.setItem(CAMKEY, JSON.stringify(cam)); } catch (e) { /* nada */ }
  }
  // zoom alrededor de un punto (px dentro del marco)
  function zoomAt(px, py, factor) {
    const { W, H, w, h } = base();
    const sw = w * cam.s, sh = h * cam.s;
    const tx = W / 2 - cam.fx * sw, ty = H / 2 - cam.fy * sh;
    const vx = (px - tx) / sw, vy = (py - ty) / sh;           // punto del vídeo bajo el dedo
    const s2 = Math.max(1, Math.min(5, cam.s * factor));
    const tx2 = px - vx * w * s2, ty2 = py - vy * h * s2;
    cam.s = s2; cam.fx = (W / 2 - tx2) / (w * s2); cam.fy = (H / 2 - ty2) / (h * s2);
    applyCam();
  }
  function panBy(dx, dy) {
    const { w, h } = base();
    cam.fx -= dx / (w * cam.s); cam.fy -= dy / (h * cam.s);
    applyCam();
  }
  (function gestures() {
    const pan = frame();
    const pts = new Map();
    let last = null;
    const rel = (e) => { const r = pan.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    pan.addEventListener('pointerdown', (e) => { pan.setPointerCapture(e.pointerId); pts.set(e.pointerId, rel(e)); last = null; });
    pan.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      const prev = pts.get(e.pointerId), p = rel(e);
      pts.set(e.pointerId, p);
      if (pts.size === 1) { panBy(p[0] - prev[0], p[1] - prev[1]); return; }
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]), c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (last) { zoomAt(c[0], c[1], d / last.d); panBy(c[0] - last.c[0], c[1] - last.c[1]); }
      last = { d, c };
    });
    const up = (e) => { pts.delete(e.pointerId); last = null; };
    pan.addEventListener('pointerup', up); pan.addEventListener('pointercancel', up);
    pan.addEventListener('wheel', (e) => {
      e.preventDefault();
      const [x, y] = rel(e);
      zoomAt(x, y, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0025)));
    }, { passive: false });
    pan.addEventListener('dblclick', () => { cam = { s: 1, fx: 0.5, fy: 0.5 }; applyCam(); });
    window.addEventListener('resize', () => { if (!view.hidden) applyCam(); });
  })();

  // ---------- Sonido: activo por defecto ----------
  let muted = null; // null = aún no decidido por la persona → con volumen
  function ytCmd(func, args) {
    const fr = $('angVideo') && $('angVideo').querySelector('iframe');
    if (!fr || !fr.contentWindow) return;
    try {
      fr.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 1 }), '*');
      fr.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args: args || [] }), '*');
    } catch (e) { /* nada */ }
  }
  function setSound(on) {
    if (on) { ytCmd('unMute'); ytCmd('setVolume', [100]); ytCmd('playVideo'); } else ytCmd('mute');
    const b = $('angSnd'); if (b) { b.textContent = on ? '🔊' : '🔇'; b.classList.toggle('off', !on); }
  }
  $('angSnd').addEventListener('click', (e) => { e.stopPropagation(); muted = !(muted === true); setSound(!muted); });
  // si el navegador no dejó poner el sonido solo, el primer toque sobre el vídeo lo activa
  frame().addEventListener('pointerdown', () => { if (muted !== true) setSound(true); });

  // ---------- Texto: tamaño de letra y márgenes (se guardan en el dispositivo) ----------
  const TKEY = 'cm:angTxt';
  let tx = { fs: 2.6, ml: 4, mr: 4 };   // fs en vh; márgenes en % del ancho
  try { tx = Object.assign(tx, JSON.parse(localStorage.getItem(TKEY) || '{}')); } catch (e) { /* nada */ }
  const saveTxt = () => { try { localStorage.setItem(TKEY, JSON.stringify(tx)); } catch (e) { /* nada */ } };
  function applyTxt() {
    tx.fs = Math.max(1.2, Math.min(8, Math.round(tx.fs * 10) / 10));
    tx.ml = Math.max(0, Math.min(30, tx.ml)); tx.mr = Math.max(0, Math.min(30, tx.mr));
    const t = $('angText');
    t.style.fontSize = tx.fs + 'vh';
    $('angCols').style.left = tx.ml + '%'; $('angCols').style.right = tx.mr + '%';
    t.querySelector('[data-side="l"]').style.left = tx.ml + '%';
    t.querySelector('[data-side="r"]').style.right = tx.mr + '%';
  }
  $('angFsDown').onclick = (e) => { e.stopPropagation(); tx.fs -= 0.2; applyTxt(); saveTxt(); };
  $('angFsUp').onclick = (e) => { e.stopPropagation(); tx.fs += 0.2; applyTxt(); saveTxt(); };
  // las líneas de margen solo se ven al hacer scroll (y mientras se arrastran)
  let lineTimer = null;
  const showLines = () => { $('angText').classList.add('lines'); clearTimeout(lineTimer); lineTimer = setTimeout(() => { if (!dragSide) $('angText').classList.remove('lines'); }, 1800); };
  ['angLeft', 'angRight'].forEach((id) => $(id).addEventListener('scroll', showLines, { passive: true }));
  let dragSide = null;
  $('angText').querySelectorAll('.ang-mline').forEach((ln) => {
    ln.addEventListener('pointerdown', (e) => { e.stopPropagation(); dragSide = ln.dataset.side; ln.setPointerCapture(e.pointerId); showLines(); });
    ln.addEventListener('pointermove', (e) => {
      if (dragSide !== ln.dataset.side) return;
      const r = $('angText').getBoundingClientRect();
      const pct = (dragSide === 'l' ? (e.clientX - r.left) : (r.right - e.clientX)) / r.width * 100;
      tx[dragSide === 'l' ? 'ml' : 'mr'] = Math.round(pct * 10) / 10;
      applyTxt();
    });
    const end = () => { if (!dragSide) return; dragSide = null; saveTxt(); showLines(); };
    ln.addEventListener('pointerup', end); ln.addEventListener('pointercancel', end);
  });

  function draw() {
    const show = cur.on && window.ScreenMode.isOn();
    view.hidden = !show;
    window.ScreenMode.el.classList.toggle('angelus-on', show);
    const vid = $('angVideo');
    if (!show) { if (vid.firstChild) vid.innerHTML = ''; return; } // quita el vídeo (y su sonido)
    if (!vid.firstChild) {
      requestAnimationFrame(applyCam);
      // empieza siempre (los navegadores solo dejan arrancar solo un vídeo silenciado) y enseguida se le da volumen
      vid.innerHTML = `<iframe src="https://www.youtube.com/embed/${VIDEO}?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1&enablejsapi=1&origin=${encodeURIComponent(location.origin)}" title="Directo" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
      const fr = vid.querySelector('iframe');
      fr.addEventListener('load', () => { [300, 1200, 2500, 5000].forEach((t) => setTimeout(() => setSound(muted === false || muted === null), t)); });
    }
    view.querySelectorAll('.ang-sel [data-k]').forEach((b) => b.classList.toggle('on', b.dataset.k === cur.kind));
    // izquierda: Ángelus o Regina Coeli; derecha: Ave María, Gloria, difuntos y bendición
    const left = cur.kind === 'regina' ? TXT.regina : TXT.angelus;
    if ($('angLeft').dataset.k !== cur.kind) { $('angLeft').innerHTML = left; $('angLeft').dataset.k = cur.kind; $('angLeft').scrollTop = 0; }
    if (!$('angRight').firstChild) $('angRight').innerHTML = TXT.right;
    applyTxt();
  }
  // el estado más reciente entre este dispositivo y los del directo
  function sync() {
    let best = mine;
    const others = window.Live && window.Live.angelusFromPeers ? window.Live.angelusFromPeers() : [];
    others.forEach((a) => { if (a && typeof a.t === 'number' && (!best || a.t > best.t)) best = a; });
    cur = best && best.on ? { on: true, kind: best.kind === 'regina' ? 'regina' : 'angelus', t: best.t } : { on: false, kind: (best && best.kind) || cur.kind, t: best ? best.t : 0 };
    btn.classList.toggle('on', cur.on);
    btn.textContent = cur.on ? (cur.kind === 'regina' ? 'Regina Coeli' : 'Ángelus') + ' ●' : 'Ángelus';
    draw();
  }
  function decide(st) {
    mine = { on: !!st.on, kind: st.kind || cur.kind, t: Date.now() };
    if (window.Live && window.Live.setAngelus) window.Live.setAngelus(mine);
    sync();
  }

  // ---------- Botón y menú de la cabecera ----------
  const menu = document.createElement('div');
  menu.className = 'ang-menu'; menu.hidden = true; menu.setAttribute('role', 'menu');
  menu.innerHTML = `
    <button role="menuitem" data-k="angelus">Ángelus</button>
    <button role="menuitem" data-k="regina">Regina Coeli</button>
    <button role="menuitem" data-k="off" class="off">Quitar</button>
    <p class="ang-msg" id="angMsg" hidden></p>`;
  document.body.appendChild(menu);
  function place() {
    const r = btn.getBoundingClientRect();
    menu.style.top = (r.bottom + 6) + 'px';
    menu.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
  }
  btn.onclick = (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    btn.setAttribute('aria-expanded', String(!menu.hidden));
    $('angMsg').hidden = true;
    menu.querySelector('[data-k="off"]').hidden = !cur.on;
    place();
  };
  document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target)) { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); } });
  menu.querySelectorAll('[data-k]').forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation();
      const k = b.dataset.k;
      if (k === 'off') { decide({ on: false }); menu.hidden = true; return; }
      // solo si algún dispositivo tiene la pantalla completa activada
      const here = window.ScreenMode.isClean();
      const there = window.Live && window.Live.fullscreenPeers ? window.Live.fullscreenPeers() : 0;
      if (!here && !there) {
        $('angMsg').textContent = window.Live && window.Live.connected()
          ? 'Ningún dispositivo de la sala tiene la pantalla completa activada.'
          : 'Ningún dispositivo tiene la pantalla completa activada. Para mostrarlo en otra pantalla, conectaos a la misma sala del directo.';
        $('angMsg').hidden = false;
        return;
      }
      decide({ on: true, kind: k });
      menu.hidden = true; btn.setAttribute('aria-expanded', 'false');
    };
  });

  document.addEventListener('screen-clean', () => setTimeout(draw, 50));
  window.addEventListener('resize', () => { if (cur.on) draw(); });
  // el modo Pantalla se abre/cierra: comprobar cada poco si hay que mostrarlo
  setInterval(() => { const show = cur.on && window.ScreenMode.isOn(); if (show === view.hidden) draw(); }, 700);

  window.Angelus = { sync, state: () => cur };
  sync();
})();
