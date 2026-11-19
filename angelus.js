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
    <div class="ang-video" id="angVideo"></div>
    <div class="ang-text"><div class="ang-cols" id="angCols"></div></div>
    <div class="ang-sel" role="group" aria-label="Oración">
      <button data-k="angelus">Ángelus</button><button data-k="regina">Regina Coeli</button>
    </div>`;
  window.ScreenMode.el.appendChild(view);
  view.addEventListener('click', (e) => e.stopPropagation());
  view.addEventListener('pointerdown', (e) => e.stopPropagation());
  view.querySelectorAll('.ang-sel [data-k]').forEach((b) => { b.onclick = () => decide({ on: true, kind: b.dataset.k }); });

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
