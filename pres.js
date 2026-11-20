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
  btn.onclick = () => setOpen(!items.classList.contains('open'));
  function update() {
    const p = A.pres();
    $('pmSize').textContent = Math.round(p.scale * 100) + '%';
    $('pmDown').disabled = p.scale <= 0.5; $('pmUp').disabled = p.scale >= 2;
    $('pmSong').setAttribute('aria-pressed', String(p.mode === 'song'));
    $('pmCita').setAttribute('aria-pressed', String(p.mode === 'cita'));
  }
  $('pmDown').onclick = () => A.setPres({ scale: A.pres().scale - 0.1 });
  $('pmUp').onclick = () => A.setPres({ scale: A.pres().scale + 0.1 });
  $('pmSong').onclick = () => A.setPres({ mode: 'song' });
  $('pmCita').onclick = () => A.setPres({ mode: 'cita' });
  A.onView(update);
  update();
})();
