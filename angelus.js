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
    angelus: `<p class="ttl">Angelus</p>
<p><b>V.</b> Angelus Domini nuntiavit Mariæ. <b>R.</b> Et concepit de Spiritu Sancto. <i>Ave Maria…</i></p>
<p><b>V.</b> Ecce ancilla Domini. <b>R.</b> Fiat mihi secundum verbum tuum. <i>Ave Maria…</i></p>
<p><b>V.</b> Et Verbum caro factum est. <b>R.</b> Et habitavit in nobis. <i>Ave Maria…</i></p>
<p><b>V.</b> Ora pro nobis, sancta Dei Genetrix. <b>R.</b> Ut digni efficiamur promissionibus Christi.</p>
<p><b>Oremus.</b> Gratiam tuam, quæsumus, Domine, mentibus nostris infunde; ut qui, Angelo nuntiante, Christi Filii tui incarnationem cognovimus, per passionem eius et crucem ad resurrectionis gloriam perducamur. Per eundem Christum Dominum nostrum. <b>Amen.</b></p>`,
    ave: `<p class="ttl">Ave Maria</p>
<p>Ave Maria, gratia plena, Dominus tecum. Benedicta tu in mulieribus, et benedictus fructus ventris tui, Iesus.<br>Sancta Maria, Mater Dei, ora pro nobis peccatoribus, nunc et in hora mortis nostræ. <b>Amen.</b></p>
<p class="ttl">Gloria Patri</p>
<p>Gloria Patri, et Filio, et Spiritui Sancto.<br>Sicut erat in principio, et nunc et semper, et in sæcula sæculorum. <b>Amen.</b></p>`,
    regina: `<p class="ttl">Regina Cæli</p>
<p>Regina cæli, lætare, alleluia.<br>Quia quem meruisti portare, alleluia.<br>Resurrexit, sicut dixit, alleluia.<br>Ora pro nobis Deum, alleluia.</p>
<p><b>V.</b> Gaude et lætare, Virgo Maria, alleluia.<br><b>R.</b> Quia surrexit Dominus vere, alleluia.</p>
<p><b>Oremus.</b> Deus, qui per resurrectionem Filii tui, Domini nostri Iesu Christi, mundum lætificare dignatus es: præsta, quæsumus, ut per eius Genetricem Virginem Mariam, perpetuæ capiamus gaudia vitæ. Per eundem Christum Dominum nostrum. <b>Amen.</b></p>`
  };

  // estado: { on, kind: 'angelus' | 'regina', t }
  let mine = null;   // lo último que se ha decidido en este dispositivo
  let cur = { on: false, kind: 'angelus', t: 0 };

  // ---------- Vista dentro de la pantalla completa ----------
  const view = document.createElement('div');
  view.id = 'angelusView'; view.className = 'ang-view'; view.hidden = true;
  view.innerHTML = `
    <div class="ang-video"><div class="ang-move" id="angVideo"></div><div class="ang-pan" id="angPan" title="Arrastra para mover · rueda o pellizco para acercar · doble clic para volver"></div></div>
    <div class="ang-text"><div class="ang-cols" id="angCols"></div></div>
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

  function fitCol(col) {
    // el mayor tamaño de letra con el que cabe la columna
    let lo = 8, hi = 64;
    col.style.fontSize = hi + 'px';
    if (col.scrollHeight <= col.clientHeight && col.scrollWidth <= col.clientWidth) return;
    for (let k = 0; k < 14; k++) {
      const mid = (lo + hi) / 2;
      col.style.fontSize = mid + 'px';
      if (col.scrollHeight <= col.clientHeight && col.scrollWidth <= col.clientWidth) lo = mid; else hi = mid;
    }
    col.style.fontSize = lo + 'px';
  }
  function draw() {
    const show = cur.on && window.ScreenMode.isOn();
    view.hidden = !show;
    window.ScreenMode.el.classList.toggle('angelus-on', show);
    const vid = $('angVideo');
    if (!show) { if (vid.firstChild) vid.innerHTML = ''; return; } // quita el vídeo (y su sonido)
    if (!vid.firstChild) {
      requestAnimationFrame(applyCam);
      vid.innerHTML = `<iframe src="https://www.youtube.com/embed/${VIDEO}?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1" title="Directo" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
    }
    view.querySelectorAll('.ang-sel [data-k]').forEach((b) => b.classList.toggle('on', b.dataset.k === cur.kind));
    const cols = $('angCols');
    cols.className = 'ang-cols ' + (cur.kind === 'regina' ? 'one' : 'two');
    cols.innerHTML = cur.kind === 'regina'
      ? `<div class="ang-col">${TXT.regina}</div>`
      : `<div class="ang-col">${TXT.angelus}</div><div class="ang-col">${TXT.ave}</div>`;
    requestAnimationFrame(() => cols.querySelectorAll('.ang-col').forEach(fitCol));
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
