// Presentación en la pantalla completa (debajo del engranaje). Igual que el engranaje:
// el primer botón despliega hacia abajo los demás y se quedan abiertos hasta volver a pulsarlo.
// Ocultar/mostrar la letra, tamaño de la letra (A+/A−) y modo Canción / Cita.
// Tamaño y modo los decide el líder (o quien está fuera del directo); en «Letras» solo se oculta/muestra.
(function () {
  'use strict';
  const A = window.App, $ = (id) => document.getElementById(id);
  const btn = $('presBtn'), items = $('presItems');
  if (!A || !btn || !items || !A.pres) return;
  const KEY = 'cm:presOpen';
  function setOpen(o) {
    items.classList.toggle('open', o);
    btn.setAttribute('aria-expanded', String(o));
    try { localStorage.setItem(KEY, o ? '1' : '0'); } catch (e) { /* nada */ }
  }
  let o0 = false; try { o0 = localStorage.getItem(KEY) === '1'; } catch (e) { /* nada */ }
  setOpen(o0);
  btn.onclick = () => {
    // al pulsar el botón de pantalla, se recoge el engranaje si estaba desplegado
    const tb = $('toolbar');
    if (tb && !tb.classList.contains('collapsed')) $('gearBtn').click();
    setOpen(!items.classList.contains('open'));
  };
  function update() {
    const p = A.pres();
    $('pmSize').textContent = Math.round(p.scale * 100) + '%';
    $('pmDown').disabled = p.scale <= 0.5; $('pmUp').disabled = p.scale >= 2;
    $('pmSong').setAttribute('aria-pressed', String(p.mode === 'song'));
    $('pmCita').setAttribute('aria-pressed', String(p.mode === 'cita'));
    btn.classList.toggle('blanked', A.blank()); // se nota aunque el desplegable esté recogido
  }
  $('pmDown').onclick = () => A.setPres({ scale: A.pres().scale - 0.1 });
  $('pmUp').onclick = () => A.setPres({ scale: A.pres().scale + 0.1 });
  $('pmSong').onclick = () => A.setPres({ mode: 'song' });
  $('pmCita').onclick = () => A.setPres({ mode: 'cita' });
  A.onView(update);
  update();
  // Sin ningún dispositivo en pantalla completa, los botones del desplegable no se pueden pulsar
  function fsAvailable() {
    const here = window.ScreenMode && window.ScreenMode.isClean && window.ScreenMode.isClean();
    const there = window.Live && window.Live.fullscreenPeers ? window.Live.fullscreenPeers() : 0;
    return !!(here || there);
  }
  function gate() {
    const ok = fsAvailable();
    items.classList.toggle('no-fs', !ok);
    items.title = ok ? '' : 'Ningún dispositivo tiene la pantalla completa activada';
    items.querySelectorAll('button').forEach((b) => {
      if (!ok) { b.disabled = true; b.dataset.gated = '1'; }
      else if (b.dataset.gated) { delete b.dataset.gated; b.disabled = false; }
    });
    if (ok) update();
  }
  setInterval(gate, 1000);
  document.addEventListener('screen-clean', gate);
  gate();
})();
