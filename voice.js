// Micrófono: escucha lo que se canta y pasa al párrafo siguiente al llegar a la penúltima
// palabra del párrafo marcado. Usa el reconocimiento de voz del navegador (Chrome, Safari).
(function () {
  'use strict';
  const A = window.App;
  const $ = (id) => document.getElementById(id);
  const btn = $('micBtn');
  if (!A || !btn) return;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  // ---------- Texto ----------
  const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const NOISE = new Set(['x2', 'x3', 'x4', 'bis', 'coro', 'estrofa', 'estribillo']);
  function words(text) {
    return fold(text.replace(/\([^)]*\)/g, ' ')).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
      .filter((w) => w && !NOISE.has(w) && !/^\d+$/.test(w));
  }
  function lev1(a, b) { // ¿distancia de edición ≤ 1?
    if (Math.abs(a.length - b.length) > 1) return false;
    let i = 0, j = 0, d = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++d > 1) return false;
      if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
    }
    return d + (a.length - i) + (b.length - j) <= 1;
  }
  function same(a, b) {
    if (a === b) return true;
    if (a.length < 4 || b.length < 4) return false;
    return lev1(a, b) || (a.slice(0, 4) === b.slice(0, 4) && Math.abs(a.length - b.length) <= 2);
  }

  // ---------- Estado ----------
  const st = { on: false, rec: null, song: '', para: null, W: [], next: [], p: 0, q: 0, reps: 1, pass: 0, consumed: 0, heard: [] };

  function loadPara() {
    const g = A.getState();
    const paras = A.lyricParas();
    st.song = g.song; st.para = g.para;
    const raw = st.para === null ? '' : (paras[st.para] || []).join(' ');
    st.W = words(raw);
    // párrafos marcados para cantarse varias veces: «(x2)», «(x2 estrofa)»…
    const m = raw.match(/\(\s*x\s*(\d)/i);
    st.reps = m ? Math.min(4, +m[1]) : 1; st.pass = 0;
    st.next = st.para === null ? [] : words((paras[st.para + 1] || []).join(' ')).slice(0, 5);
    st.p = 0; st.q = 0;
  }
  function advance() {
    const n = A.paraCount(), i = A.para();
    if (i === null || i + 1 >= n) return false;
    A.selectPara(i + 1);
    loadPara();
    return true;
  }

  // Procesa una palabra oída
  function hear(h) {
    const g = A.getState();
    if (g.song !== st.song || g.para !== st.para) loadPara();
    if (st.para === null || !st.W.length) return;
    const W = st.W, target = Math.max(0, W.length - 2); // penúltima palabra
    // avanzar dentro del párrafo (tolerando palabras perdidas)
    const span = h.length <= 2 ? 1 : 5;
    for (let k = st.p; k < Math.min(W.length, st.p + span + 1); k++) {
      if (same(h, W[k])) { st.p = k + 1; break; }
    }
    if (st.p - 1 >= target && W.length) {
      if (st.pass + 1 < st.reps) { st.pass++; st.p = 0; } // falta otra vuelta del mismo párrafo
      else advance();
      return;
    }
    // ¿ya se está cantando el comienzo del párrafo siguiente?
    if (st.next.length && h.length > 2) {
      for (let k = st.q; k < Math.min(st.next.length, st.q + 2); k++) {
        if (same(h, st.next[k])) { st.q = k + 1; break; }
      }
      if (st.q >= 2) { const q = st.q; if (advance()) st.p = Math.min(q, st.W.length); }
    }
  }

  // ---------- Reconocimiento ----------
  function start() {
    if (!SR) { toast('Este navegador no permite reconocer la voz. Usa Chrome (también en Android) o Safari.', true); return; }
    if (!A.getState().song) { toast('Abre primero una canción.', true); return; }
    st.on = true;
    if (A.para() === null && A.paraCount()) A.selectPara(0);
    loadPara();
    btn.setAttribute('aria-pressed', 'true');
    document.body.classList.add('mic-on');
    toast('Escuchando…');
    listen();
  }
  function listen() {
    if (!st.on) return;
    let rec;
    try { rec = new SR(); } catch (e) { stop(); return; }
    st.rec = rec; st.consumed = 0;
    rec.lang = 'es-ES'; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      let text = '';
      for (let i = 0; i < e.results.length; i++) text += ' ' + e.results[i][0].transcript;
      const H = words(text);
      if (H.length < st.consumed) st.consumed = H.length; // el navegador corrigió lo provisional
      for (let i = st.consumed; i < H.length; i++) hear(H[i]);
      st.consumed = H.length;
      st.heard = H.slice(-6);
      toast('🎤 ' + (st.heard.join(' ') || '…'));
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        toast('No hay permiso para usar el micrófono. Actívalo en los ajustes del navegador.', true);
        stop();
      }
    };
    rec.onend = () => { if (st.on && st.rec === rec) setTimeout(listen, 150); }; // se corta solo con los silencios
    try { rec.start(); } catch (e) { setTimeout(listen, 500); }
  }
  function stop() {
    st.on = false;
    const r = st.rec; st.rec = null;
    if (r) { try { r.abort(); } catch (e) { /* nada */ } }
    btn.setAttribute('aria-pressed', 'false');
    document.body.classList.remove('mic-on');
    hideToast();
  }
  btn.onclick = () => (st.on ? stop() : start());
  if (!SR) btn.title = 'Seguir la canción con el micrófono (no disponible en este navegador: usa Chrome o Safari)';

  // Al cambiar de canción se sigue escuchando desde el primer párrafo
  A.onView(() => {
    if (!st.on) return;
    const g = A.getState();
    if (!g.song) { stop(); return; }
    if (g.song !== st.song) { if (A.para() === null && A.paraCount()) A.selectPara(0); loadPara(); }
    else if (g.para !== st.para) loadPara();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && st.on) stop(); });

  // ---------- Aviso con lo que se oye ----------
  const tip = document.createElement('div');
  tip.className = 'mic-toast'; tip.hidden = true; tip.setAttribute('role', 'status');
  document.body.appendChild(tip);
  let tipTimer = null;
  function toast(t, warn) {
    tip.textContent = t; tip.hidden = false; tip.classList.toggle('warn', !!warn);
    clearTimeout(tipTimer);
    if (warn) tipTimer = setTimeout(() => { if (!st.on) tip.hidden = true; }, 5000);
  }
  function hideToast() { tip.hidden = true; }

  window.Voice = { on: () => st.on, stop };
})();
