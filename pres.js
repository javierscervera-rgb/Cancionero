// Desplegable de presentación, debajo del engranaje: mostrar/ocultar la letra,
// tamaño de la letra en la pantalla completa y modo (Canción / Cita).
// Lo usa quien dirige la pantalla (líder o fuera del directo). En «Letras» el botón solo oculta/muestra.
(function () {
  'use strict';
  const A = window.App, $ = (id) => document.getElementById(id);
  const btn = $('blankBtn');
  if (!A || !btn || !A.pres) return;
  const menu = document.createElement('div');
  menu.className = 'pres-menu'; menu.id = 'presMenu'; menu.hidden = true;
  menu.setAttribute('role', 'dialog'); menu.setAttribute('aria-label', 'Presentación en la pantalla completa');
  menu.innerHTML = `
    <button class="pm-blank" id="pmBlank" aria-pressed="false"></button>
    <div class="pm-row"><span>Tamaño</span><span></span>
      <button id="pmDown" aria-label="Letra más pequeña">A−</button><output id="pmSize"></output><button id="pmUp" aria-label="Letra más grande">A+</button></div>
    <div class="pm-lbl">Modo</div>
    <div class="pm-seg"><button data-mode="song">Canción</button><button data-mode="cita">Cita</button></div>`;
  document.body.appendChild(menu);

  const lettersOnly = () => document.body.classList.contains('lyrics-op');
  function update() {
    const p = A.pres(), b = A.blank();
    $('pmBlank').setAttribute('aria-pressed', String(b));
    $('pmBlank').textContent = b ? '👁  Mostrar letra' : '⊘  Ocultar letra';
    $('pmSize').textContent = Math.round(p.scale * 100) + '%';
    $('pmDown').disabled = p.scale <= 0.5; $('pmUp').disabled = p.scale >= 2;
    menu.querySelectorAll('.pm-seg button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.mode === p.mode)));
  }
  function place() {
    const r = btn.getBoundingClientRect(), w = menu.offsetWidth || 230;
    let left = r.left - w - 8;
    if (left < 8) left = Math.min(window.innerWidth - w - 8, r.left);
    const top = left === r.left - w - 8 ? r.top : r.bottom + 8;
    menu.style.left = Math.max(8, left) + 'px';
    menu.style.top = Math.max(8, Math.min(window.innerHeight - menu.offsetHeight - 8, top)) + 'px';
  }
  function open(o) {
    menu.hidden = !o;
    btn.classList.toggle('pres-open', o);
    btn.setAttribute('aria-expanded', String(o));
    if (o) { update(); place(); }
  }
  btn.setAttribute('aria-haspopup', 'dialog');
  btn.onclick = (e) => {
    e.stopPropagation();
    if (lettersOnly()) { A.setBlank(!A.blank()); return; }
    open(menu.hidden);
  };
  $('pmBlank').onclick = () => A.setBlank(!A.blank());
  $('pmDown').onclick = () => A.setPres({ scale: A.pres().scale - 0.1 });
  $('pmUp').onclick = () => A.setPres({ scale: A.pres().scale + 0.1 });
  menu.querySelectorAll('.pm-seg button').forEach((x) => { x.onclick = () => A.setPres({ mode: x.dataset.mode }); });
  menu.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', () => { if (!menu.hidden) open(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) open(false); });
  window.addEventListener('resize', () => { if (!menu.hidden) place(); });
  // si el botón se oculta (p. ej. al pasar a receptor), se cierra el desplegable
  A.onView(() => { if (!menu.hidden) { if (!btn.offsetParent) open(false); else update(); } });
})();
