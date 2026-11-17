(function () {
  'use strict';
  const C = window.Chords;
  const SONGS = window.SONGS;
  const $ = (id) => document.getElementById(id);

  // ---------- Preferencias (localStorage protegido) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem('cm:' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('cm:' + k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } }
  };
  const state = {
    notation: store.get('notation', 'latin'),
    font: store.get('font', window.innerWidth < 600 ? 14 : 16),
    lyricsOnly: store.get('lyricsOnly', false),
    shifts: store.get('shifts', {}),
    category: null,
    list: null,
    para: null,
    paraCount: 0,
    blank: false,          // pantalla de presentación en negro (sin letra)
    query: '',
    letter: null,          // filtro por inicial del título (A, B… o #)
    listFont: store.get('listFont2', 19),
    current: null
  };

  // ---------- Pre-proceso ----------
  // Listas de reproducción (cada cancionero es una lista con sus propias colecciones)
  const LISTS = (window.LISTS && window.LISTS.length) ? window.LISTS
    : [{ id: 'meriba', name: 'Cancionero Meribá', cats: ['ESPÍRITU SANTO', 'ALABANZA', 'ADORACIÓN', 'BLESSING', 'SANACIÓN', 'VIRGEN MARÍA'] }];
  SONGS.forEach((s) => { if (!s.list) s.list = LISTS[0].id; });
  const listById = (id) => LISTS.find((l) => l.id === id) || LISTS[0];
  let CATS = LISTS.flatMap((l) => l.cats || []); // colecciones de todos los cancioneros
  let UPPER_CATS = listById('meriba').cats || [];
  let baseCustom = (window.CLOUD_CATS || []).slice(); // colecciones creadas por los editores (compartidas)
  // Colecciones: las del cancionero + las creadas en este dispositivo; pertenencia editable por canción
  let coll = store.get('collections', { custom: [], songs: {} });
  if (!coll || !Array.isArray(coll.custom) || typeof coll.songs !== 'object') coll = { custom: [], songs: {} };
  if (!Array.isArray(coll.removed)) coll.removed = [];
  const customCats = () => baseCustom.concat(coll.custom).filter((c, i, a) => !CATS.includes(c) && !coll.removed.includes(c) && a.indexOf(c) === i);
  const allCats = () => CATS.concat(customCats());
  const catsFor = (listId) => (listById(listId).cats || []).concat(customCats());
  const catLabel = (c) => UPPER_CATS.includes(c) ? c.charAt(0) + c.slice(1).toLowerCase() : c;
  function applyCats(s) {
    if (!s.baseCats) s.baseCats = (s.categories || []).slice();
    const own = coll.songs[s.code];
    s.categories = (own ? own : s.baseCats).filter((c) => allCats().includes(c));
  }
  const localListeners = [];
  const localChanged = () => localListeners.forEach((f) => { try { f(); } catch (e) { /* nada */ } });
  const saveColl = () => { store.set('collections', coll); localChanged(); };
  const cleanCat = (c) => (typeof c === 'string' ? c : '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
  const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  // Contenido original, ediciones guardadas en este dispositivo y versiones temporales del emisor
  const ORIG = {};
  SONGS.forEach((s) => { ORIG[s.code] = { title: s.title, lines: s.lines.slice() }; s.baseCats = (s.categories || []).slice(); });
  // Con el cancionero compartido (Drive) solo hay una versión: los cambios antiguos de este
  // dispositivo se descartan una vez. Después, solo los editores guardan, y va directo a Drive.
  if (/^https?:/.test(window.CLOUD_URL || '') && !store.get('cloudV1', false)) {
    ['edits', 'notes', 'collections'].forEach((k) => { try { localStorage.removeItem('cm:' + k); } catch (e) { /* nada */ } });
    coll = { custom: [], songs: {}, removed: [] };
    store.set('cloudV1', true);
  }
  let edits = store.get('edits', {}); // cambios de un editor aún no confirmados por Drive
  let notes = store.get('notes', {}); // comentarios aún no confirmados por Drive
  const temp = {}; // code -> {title, lines} | 'orig'  (mientras se recibe en directo)

  function prep(s) {
    s.key = C.detectKey(s.lines);
    s.chordFlags = s.lines.map(C.isChordLine);
    s.searchText = fold(s.title + ' ' + s.lines.filter((_, j) => !s.chordFlags[j]).join(' '));
    s.altShifts = [];
    s.paras = [];
    let curP = [];
    s.lines.forEach((line, j) => {
      if (!line.trim()) { if (curP.length) { s.paras.push(curP); curP = []; } }
      else curP.push(j);
    });
    if (curP.length) s.paras.push(curP);
    (s.variants || []).forEach((v) => {
      const k = C.detectKey(v);
      if (k && s.key) {
        let d = ((k.semi - s.key.semi) % 12 + 12) % 12;
        if (d > 6) d -= 12;
        if (d !== 0 && !s.altShifts.includes(d)) s.altShifts.push(d);
      }
    });
  }
  function load(s) {
    const t = temp[s.code];
    const src = t === 'orig' ? ORIG[s.code] : (t || edits[s.code] || ORIG[s.code]);
    s.title = src.title;
    s.lines = src.lines.slice();
    s.edited = !!edits[s.code] && !t;
    prep(s);
  }
  // Limpieza: cambios locales que ya están incorporados al cancionero publicado
  // (también se usa al recibir una versión nueva del cancionero compartido: lo ya subido deja de estar pendiente)
  function reconcile() {
    let changed = false;
    Object.keys(edits).forEach((code) => {
      const o = ORIG[code], e = edits[code];
      if (!o || (e.title === o.title && e.lines.join('\n') === o.lines.join('\n'))) { delete edits[code]; changed = true; }
    });
    if (changed) store.set('edits', edits);
    changed = false;
    Object.keys(notes).forEach((code) => {
      const s = SONGS.find((x) => x.code === code);
      if (!s || notes[code] === (s.comment || '')) { delete notes[code]; changed = true; }
    });
    if (changed) store.set('notes', notes);
    const before = JSON.stringify(coll);
    coll.custom = coll.custom.filter((c) => !CATS.includes(c) && !baseCustom.includes(c));
    coll.removed = coll.removed.filter((c) => baseCustom.includes(c));
    SONGS.forEach((s) => {
      const own = coll.songs[s.code];
      if (own && JSON.stringify(own.slice().sort()) === JSON.stringify((s.baseCats || []).slice().sort())) delete coll.songs[s.code];
    });
    Object.keys(coll.songs).forEach((code) => { if (!SONGS.some((x) => x.code === code)) delete coll.songs[code]; });
    if (JSON.stringify(coll) !== before) store.set('collections', coll);
  }
  reconcile();
  document.body.classList.add('can-edit'); // cualquiera puede editar (se guarda en Drive)
  SONGS.forEach((s, i) => { s.index = i; load(s); applyCats(s); });
  state.list = listById(store.get('list', LISTS[0].id)).id;
  const listSongs = (id) => SONGS.filter((s) => s.list === (id || state.list));

  // ---------- Utilidades ----------
  const esc = (t) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const norm12 = (n) => ((n % 12) + 12) % 12;
  const signed = (n) => { n = norm12(n); return n > 6 ? n - 12 : n; };
  function keyName(song, shift) {
    if (!song.key) return '—';
    const semi = song.key.semi + shift;
    const flats = C.prefersFlats(semi, song.key.minor);
    return C.name(semi, song.key.minor, song.key.minor ? 'm' : '', '', flats, state.notation);
  }

  // ---------- Índice ----------
  // Al tocar una pastilla: filtra el índice; en móvil, si estás leyendo una canción, vuelve al índice
  function pickCategory(c) {
    state.category = c;
    state.letter = null;
    renderChips();
    renderList();
    if (isMobile()) setSheet(true);
    $('sidebar').scrollTop = 0;
    const on = document.querySelector('#chips .chip.on');
    if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }

  // ---------- Listas de reproducción (lateral izquierdo) ----------
  function setList(id, keepSong) {
    id = listById(id).id;
    const changed = id !== state.list;
    state.list = id;
    store.set('list', id);
    if (changed) { state.category = null; state.letter = null; }
    renderLists(); renderChips(); renderList();
    if (changed && !keepSong && state.current && state.current.list !== id) location.hash = '';
  }
  function renderLists() {
    const box = $('lists');
    if (!box) return;
    box.innerHTML = LISTS.map((l) => `<button class="list-item${l.id === state.list ? ' on' : ''}" data-list="${l.id}" aria-pressed="${l.id === state.list}">
        <span class="list-ico">♫</span><span class="list-txt"><span class="list-name">${esc(l.name)}</span>${l.sub ? `<span class="list-sub">${esc(l.sub)}</span>` : ''}</span>
        <span class="list-n">${listSongs(l.id).length}</span></button>`).join('');
    box.querySelectorAll('[data-list]').forEach((b) => {
      b.onclick = () => {
        // en el móvil es un desplegable: la lista elegida lo abre o lo cierra
        if (b.dataset.list === state.list) { box.classList.toggle('open'); return; }
        box.classList.remove('open');
        setList(b.dataset.list);
      };
    });
    updateSheetLabel();
    const cur = listById(state.list);
    const w = $('welcome');
    if (w) { w.querySelector('h1').textContent = cur.name; $('count').textContent = listSongs(cur.id).length + ' canciones'; }
  }

  function renderChips() {
    const wrap = $('chips');
    wrap.innerHTML = '';
    const all = document.createElement('button');
    all.className = 'chip' + (state.category ? '' : ' on');
    all.textContent = 'Todas';
    all.onclick = () => pickCategory(null);
    wrap.appendChild(all);
    catsFor(state.list).forEach((c) => {
      const b = document.createElement('button');
      b.className = 'chip' + (state.category === c ? ' on' : '') + (CATS.includes(c) ? '' : ' custom');
      b.textContent = catLabel(c);
      b.onclick = () => pickCategory(state.category === c ? null : c);
      wrap.appendChild(b);
    });
    const add = document.createElement('button');
    add.className = 'chip add';
    add.textContent = '+ Nueva colección';
    add.title = 'Crear una colección nueva';
    add.onclick = () => { if (window.Collections) window.Collections.openCreate(); };
    wrap.appendChild(add);
  }

  // Inicial del título para el índice alfabético (sin tildes; Ñ aparte; números → #)
  const ABC = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'L', 'M', 'N', 'Ñ', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'Y', 'Z', '#'];
  function initialOf(t) {
    const m = (t || '').replace(/^[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]+/, '');
    const c = m.charAt(0);
    if (!c) return '#';
    if (/[0-9]/.test(c)) return '#';
    if (c === 'Ñ' || c === 'ñ') return 'Ñ';
    return fold(c).toUpperCase();
  }
  function filtered(ignoreLetter) {
    const q = fold(state.query.trim());
    return SONGS.filter((s) =>
      s.list === state.list &&
      (!state.category || s.categories.includes(state.category)) &&
      (ignoreLetter || !state.letter || initialOf(s.title) === state.letter) &&
      (!q || s.searchText.includes(q) || s.code.toLowerCase().includes(q)));
  }
  function setLetter(l) {
    state.letter = l && l !== state.letter ? l : null;
    if (state.letter) {
      // por letra: todas las canciones de la lista, sin colección ni búsqueda
      state.category = null; state.query = ''; $('search').value = '';
      renderChips();
    }
    $('abcGrid').hidden = true; $('abcBtn').setAttribute('aria-expanded', 'false');
    renderList();
    $('sidebar').scrollTop = 0;
  }
  function renderAbc() {
    const have = new Set(listSongs(state.list).map((s) => initialOf(s.title)));
    $('abcGrid').innerHTML = ABC.map((l) => `<button class="abc-cell${l === state.letter ? ' on' : ''}" data-l="${l}"${have.has(l) || l === state.letter ? '' : ' disabled'}>${l}</button>`).join('');
    $('abcGrid').querySelectorAll('[data-l]').forEach((b) => { b.onclick = () => setLetter(b.dataset.l); });
    $('abcBtn').classList.toggle('on', !!state.letter);
    $('abcBtn').textContent = state.letter ? state.letter : 'ABC';
    const pill = $('letterPill');
    pill.hidden = !state.letter;
    if (state.letter) {
      pill.innerHTML = `Empiezan por <b>${state.letter === '#' ? 'un número' : state.letter}</b> <button id="letterClear" aria-label="Quitar el filtro por letra">✕</button>`;
      $('letterClear').onclick = () => setLetter(null);
    }
  }
  function applyListFont() {
    $('sidebar').style.setProperty('--lf', state.listFont + 'px');
    $('listFontDown').disabled = state.listFont <= 11;
    $('listFontUp').disabled = state.listFont >= 24;
  }
  $('listFontUp').onclick = () => { state.listFont = Math.min(24, state.listFont + 1); store.set('listFont2', state.listFont); applyListFont(); };
  $('listFontDown').onclick = () => { state.listFont = Math.max(11, state.listFont - 1); store.set('listFont2', state.listFont); applyListFont(); };
  $('abcBtn').onclick = () => {
    const open = $('abcGrid').hidden;
    renderAbc();
    $('abcGrid').hidden = !open;
    $('abcBtn').setAttribute('aria-expanded', String(open));
  };
  applyListFont();

  // ---------- Ancho de la lista de canciones (arrastrando el separador) ----------
  const SBW = 320;
  const clampW = (w) => Math.round(Math.max(220, Math.min(w, Math.min(720, window.innerWidth * 0.6))));
  function setSbw(w, save) {
    w = clampW(w);
    document.documentElement.style.setProperty('--sbw', w + 'px');
    $('sbResize').setAttribute('aria-valuenow', String(w));
    if (save) store.set('sbw', w);
  }
  setSbw(store.get('sbw', SBW), false);
  (function () {
    const h = $('sbResize');
    let x0 = 0, w0 = 0, dragging = false;
    h.addEventListener('pointerdown', (e) => {
      dragging = true; x0 = e.clientX; w0 = $('sidebar').getBoundingClientRect().width;
      h.setPointerCapture(e.pointerId); h.classList.add('drag'); document.body.classList.add('sb-dragging');
      e.preventDefault();
    });
    h.addEventListener('pointermove', (e) => { if (dragging) setSbw(w0 + e.clientX - x0, false); });
    const end = () => {
      if (!dragging) return;
      dragging = false; h.classList.remove('drag'); document.body.classList.remove('sb-dragging');
      setSbw($('sidebar').getBoundingClientRect().width, true);
    };
    h.addEventListener('pointerup', end);
    h.addEventListener('pointercancel', end);
    h.addEventListener('dblclick', () => setSbw(SBW, true));
    h.addEventListener('keydown', (e) => {
      const w = $('sidebar').getBoundingClientRect().width;
      if (e.key === 'ArrowLeft') { setSbw(w - 20, true); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { setSbw(w + 20, true); e.preventDefault(); }
    });
    window.addEventListener('resize', () => setSbw(store.get('sbw', SBW), false));
  })();

  function renderList() {
    renderAbc();
    const list = $('songList');
    const items = filtered();
    list.innerHTML = items.map((s) =>
      `<li><a href="#${s.code}" class="${state.current === s ? 'active' : ''}">` +
      `<span class="code">${s.code}</span><span class="t">${esc(s.title)}</span>` +
      `<span class="k">${keyName(s, state.shifts[s.code] || 0)}</span></a></li>`).join('') ||
 `<li class="empty">${state.letter ? 'No hay canciones que empiecen por esa letra aquí.' : state.category && !state.query ? 'Esta colección está vacía. Abre una canción y pulsa «🏷 Colecciones» para añadirla.' : 'No hay canciones que coincidan.'}</li>`;
  }

  // ---------- Canción ----------
  const isLabelLine = (line) => line.trim().length < 40 &&
    /^\s*(\(.*\)|(CORO|VERSO|PUENTE|INTRO|ESTRIBILLO|CEJILLA)\b.*)\s*$/i.test(line);

  // Solo la letra de cada párrafo (para el modo Pantalla)
  function lyricParas(s) {
    s = s || state.current;
    if (!s) return [];
    return s.paras.map((idxs) => idxs
      .filter((i) => !s.chordFlags[i] && !isLabelLine(s.lines[i]))
      .map((i) => s.lines[i].replace(/\s+/g, ' ').trim())
      .filter(Boolean));
  }

  const viewListeners = [];
  const notifyView = () => viewListeners.forEach((fn) => { try { fn(); } catch (e) { /* nada */ } });

  function renderSheet() {
    const s = state.current;
    if (!s) return;
    const shift = state.shifts[s.code] || 0;
    const flats = s.key ? C.prefersFlats(s.key.semi + shift, s.key.minor) : false;
    // Párrafos fijos (bloques separados por líneas en blanco), iguales con o sin acordes
    const paras = s.paras.map((idxs) => {
      const out = [];
      idxs.forEach((i, k) => {
        const line = s.lines[i];
        if (s.chordFlags[i]) {
          if (state.lyricsOnly) return;
          const groups = C.transposeLine(line, shift, flats, state.notation);
          // acordes encima de una línea de letra: van pegados a su sílaba (así pueden saltar de línea juntos)
          const nx = idxs[k + 1];
          if (nx !== undefined && !s.chordFlags[nx] && s.lines[nx].trim() && !isLabelLine(s.lines[nx])) {
            out.push(pairHtml(groups, s.lines[nx]));
            out.skip = nx;
            return;
          }
          out.push('<span class="cl">' + groups.map((g) => g.chord ? `<b class="ch">${esc(g.text)}</b>` : esc(g.text)).join('') + '</span>');
        } else {
          if (out.skip === i) return;
          out.push(isLabelLine(line) ? `<span class="lbl">${esc(line)}</span>` : esc(line));
        }
      });
      if (!out.length) out.push('<span class="lbl">♪</span>');
      return out;
    });
    state.paraCount = paras.length;
    if (state.para !== null && state.para >= paras.length) state.para = null;
    $('sheet').innerHTML = paras.map((p, i) =>
      `<div class="para${i === state.para ? ' sel' : ''}" data-i="${i}" tabindex="0">${p.join('\n')}</div>`).join('');
    $('sheet').style.fontSize = state.font + 'px';
    fitSheet();
    if (state.para !== null) requestAnimationFrame(() => centerPara(state.para, false));
    notifyView();

    // Controles
    const sel = $('keySelect');
    sel.innerHTML = '';
    for (let d = -6; d <= 5; d++) {
      const o = document.createElement('option');
      o.value = d;
      o.textContent = keyName(s, d) + (d === 0 ? ' · original' : ` (${d > 0 ? '+' : ''}${d})`);
      if (d === signed(shift)) o.selected = true;
      sel.appendChild(o);
    }
    sel.disabled = !s.key;
    $('upBtn').disabled = $('downBtn').disabled = !s.key;
    const sd = signed(shift);
    $('offset').textContent = sd ? (sd > 0 ? '+' : '') + sd : '';
    $('keyName').textContent = keyName(s, shift);
    $('resetBtn').disabled = !sd;
    $('lyricsOnly').setAttribute('aria-pressed', String(state.lyricsOnly));

    const v = $('variants');
    if (s.altShifts.length) {
      v.hidden = false;
      v.innerHTML = '<span class="var-label">También en el cancionero en</span>' +
        s.altShifts.map((d) => `<button class="chip${signed(shift) === d ? ' on' : ''}" data-shift="${d}">${keyName(s, d)}</button>`).join('');
      v.querySelectorAll('button').forEach((b) => b.onclick = () => setShift(+b.dataset.shift));
    } else v.hidden = true;
  }

  // Avisos de cambio para el modo en directo (live.js)
  const listeners = [];
  const notify = (why) => listeners.forEach((fn) => { try { fn(why); } catch (e) { /* ignorar */ } });

  // Al emitir: la partitura se ajusta al ancho de la pantalla (sin scroll horizontal)
  // ---------- Línea de acordes + línea de letra que se pueden partir sin descolocar los acordes ----------
  const MFONT = '"Helvetica Neue", Helvetica, Arial, "Liberation Sans", sans-serif';
  const mctx = document.createElement('canvas').getContext('2d');
  const wReg = (t) => { mctx.font = '16px ' + MFONT; return mctx.measureText(t).width; };
  const wBold = (t) => { mctx.font = '600 16px ' + MFONT; return mctx.measureText(t).width; };
  function pairHtml(groups, lyric) {
    lyric = lyric.replace(/\s+$/, '');
    // posición (en píxeles) de cada acorde en su línea → sílaba de la letra que tiene debajo
    const pre = [0];
    for (let j = 0; j < lyric.length; j++) pre.push(pre[j] + wReg(lyric[j]));
    const chords = [];
    let x = 0;
    groups.forEach((g) => {
      if (g.chord) {
        let at = lyric.length;
        if (x <= pre[lyric.length] + 2) {
          at = 0;
          for (let j = 1; j <= lyric.length; j++) if (Math.abs(pre[j] - x) < Math.abs(pre[at] - x)) at = j;
          if (at === lyric.length && x < pre[lyric.length] - 1) at = lyric.length - 1;
        }
        const prev = chords[chords.length - 1];
        if (prev && prev.at === at) prev.text += ' ' + g.text; else chords.push({ at, text: g.text });
        x += wBold(g.text);
      } else x += wReg(g.text);
    });
    // el acorde solo ocupa ancho propio si chocaría con el siguiente; si no, vuela sobre la letra
    chords.forEach((c, j) => {
      const nx = chords[j + 1];
      const room = nx ? pre[Math.min(nx.at, lyric.length)] - pre[Math.min(c.at, lyric.length)] : Infinity;
      const need = wBold(c.text) + 6;
      c.min = need > room ? (need / 16).toFixed(2) : 0;
    });
    const unit = (c, t) => `<span class="u"${c.min ? ` style="min-width:${c.min}em"` : ''}><b class="ch">${esc(c.text)}</b>${esc(t)}</span>`;
    let html = '';
    const re = /(\s+)|(\S+)/g;
    let m;
    while ((m = re.exec(lyric))) {
      const a = m.index, b = a + m[0].length;
      const inside = chords.filter((c) => c.at >= a && c.at < b);
      if (!inside.length) { html += m[1] ? m[0] : `<span class="w">${esc(m[0])}</span>`; continue; }
      const cuts = [a].concat(inside.map((c) => c.at).filter((p) => p > a), [b]);
      let w = '';
      for (let j = 0; j < cuts.length - 1; j++) {
        const c = inside.find((q) => q.at === cuts[j]);
        const t = lyric.slice(cuts[j], cuts[j + 1]);
        w += c ? unit(c, t) : esc(t);
      }
      html += `<span class="w">${w}</span>`;
    }
    chords.filter((c) => c.at >= lyric.length).forEach((c) => { html += ' ' + `<span class="w">${unit(c, '')}</span>`; });
    return `<span class="pair">${html}</span>`;
  }

  function fitSheet() {
    const sh = $('sheet');
    if (sh) sh.style.fontSize = state.font + 'px';
  }

  window.addEventListener('resize', () => fitSheet());

  // ---------- Párrafos: seleccionar uno lo centra en la pantalla ----------
  function topOffset() {
    const t = document.querySelector('.top'), b = document.querySelector('.chipbar');
    return (t ? t.offsetHeight : 0) + (b ? b.offsetHeight : 0);
  }
  // la canción se desplaza dentro de su columna (la página no tiene scroll)
  function centerPara(i, smooth) {
    const el = $('sheet').querySelector(`.para[data-i="${i}"]`);
    if (!el) return;
    const sc = $('content');
    const r = el.getBoundingClientRect(), box = sc.getBoundingClientRect(), avail = sc.clientHeight;
    const y = sc.scrollTop + r.top - box.top - Math.max(12, (avail - r.height) / 2);
    sc.scrollTo({ top: Math.max(0, y), behavior: smooth === false ? 'auto' : 'smooth' });
  }
  function selectPara(i, fromSync) {
    if (i !== null && (!Number.isInteger(i) || i < 0 || i >= state.paraCount)) return;
    state.para = i;
    $('sheet').querySelectorAll('.para').forEach((el) => el.classList.toggle('sel', +el.dataset.i === i));
    if (i !== null && !document.body.classList.contains('screen-mode')) centerPara(i);
    notifyView();
    if (!fromSync) notify('para');
  }
  $('sheet').addEventListener('click', (e) => {
    const el = e.target.closest('.para');
    if (el) selectPara(+el.dataset.i);
  });

  function setShift(n, fromSync) {
    const s = state.current;
    if (!s) return;
    n = signed(n);
    if (n) state.shifts[s.code] = n; else delete state.shifts[s.code];
    if (!fromSync) store.set('shifts', state.shifts);
    renderSheet();
    renderList();
    if (!fromSync) notify('shift');
  }

  // ---------- Pantalla en negro (la presentación se queda sin letra) ----------
  function setBlank(b, fromSync) {
    b = !!b;
    if (b === state.blank) return;
    state.blank = b;
    $('blankBtn').setAttribute('aria-pressed', String(b));
    document.body.classList.toggle('blanked', b);
    notifyView();
    if (!fromSync) notify('blank');
  }
  $('blankBtn').onclick = () => setBlank(!state.blank);

  // ---------- Comentario de la canción (no se ve en el modo Pantalla) ----------
  const noteOf = (s) => (notes[s.code] !== undefined ? notes[s.code] : (s.comment || ''));
  function renderNote(s) {
    const box = $('songNote');
    if (!box) return;
    const t = noteOf(s);
    box.classList.remove('editing');
    box.hidden = !t;
    box.innerHTML = t ? `<span class="note-ico" aria-hidden="true">💬</span><div class="note-txt">${esc(t)}</div>` : '';
    $('noteBtn').textContent = t ? '💬 Editar comentario' : '💬 Comentario';
  }
  function editNote() {
    const s = state.current;
    if (!s) return;
    const box = $('songNote');
    box.hidden = false;
    box.classList.add('editing');
    box.innerHTML = `<textarea id="noteText" rows="3" maxlength="2000" placeholder="Escribe un comentario para esta canción (p. ej. «empezar solo voz», «capo 2», «la canta María»)…"></textarea>
      <div class="note-actions">${noteOf(s) ? '<button class="link-btn" id="noteDel">Borrar comentario</button>' : ''}<span class="ed-spacer"></span>
      <button class="pill" id="noteCancel">Cancelar</button><button class="pill primary" id="noteSave">Guardar</button></div>`;
    const ta = $('noteText');
    ta.value = noteOf(s);
    ta.focus();
    const save = (v) => {
      v = v.replace(/\s+$/, '');
      if (v === (s.comment || '')) delete notes[s.code]; else notes[s.code] = v;
      store.set('notes', notes);
      localChanged();
      renderNote(s);
    };
    $('noteSave').onclick = () => save(ta.value);
    $('noteCancel').onclick = () => renderNote(s);
    if ($('noteDel')) $('noteDel').onclick = () => save('');
    ta.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); save(ta.value); }
      else if (e.key === 'Escape') { e.preventDefault(); renderNote(s); }
      e.stopPropagation();
    });
  }
  $('noteBtn').onclick = editNote;
  $('songNote').addEventListener('click', (e) => {
    // los clics en Guardar/Cancelar/Borrar no deben reabrir el editor
    if (!e.target.isConnected || e.target.closest('button, textarea') || $('songNote').classList.contains('editing')) return;
    if (!document.body.classList.contains('can-edit')) return;
    editNote();
  });

  function showSong(code) {
    const s = SONGS.find((x) => x.code === code);
    document.body.classList.toggle('reading', !!s);
    $('toolbar').hidden = !s;
    $('screenBtn').hidden = !s;
    $('backBtn').hidden = !s;
    if (!s) {
      state.current = null;
      $('song').hidden = true;
      $('welcome').hidden = false;
      document.title = 'Cancionero';
      renderList();
      notifyView();
      return;
    }
    if (state.current !== s) state.para = null;
    state.current = s;
    $('welcome').hidden = true;
    $('song').hidden = false;
    $('songCode').textContent = s.code;
    $('songTitle').textContent = s.title;
    renderNote(s);
    $('songTags').innerHTML = s.categories.map((c) => `<span class="tag">${esc(catLabel(c))}</span>`).join('') +
      '<button class="tag tag-btn" id="collBtn" title="Añadir o quitar esta canción de colecciones">🏷 Colecciones</button>' +
      (s.edited ? '<span class="tag edited" title="Se está guardando en Drive; si no hay conexión, se subirá en cuanto vuelva">⏳ Guardando en Drive…</span>' : '');
    document.title = s.title + ' · Cancionero';
    if (s.list !== state.list) setList(s.list, true);
    const ls = listSongs(s.list), li = ls.indexOf(s);
    const prev = ls[li - 1], next = ls[li + 1];
    $('prevLink').style.visibility = prev ? 'visible' : 'hidden';
    $('nextLink').style.visibility = next ? 'visible' : 'hidden';
    if (prev) { $('prevLink').href = '#' + prev.code; $('prevLink').textContent = '← ' + prev.title; }
    if (next) { $('nextLink').href = '#' + next.code; $('nextLink').textContent = next.title + ' →'; }
    renderSheet();
    renderList();
    notifyView();
    $('content').scrollTop = 0;
    const a = document.querySelector('.song-list a.active');
    if (a && a.scrollIntoView) a.scrollIntoView({ block: 'nearest' });
  }

  let syncHash = null; // hash que viene del emisor (no cuenta como navegación propia)
  function route() {
    const code = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
    showSong(code);
    // móvil: al abrir una canción se recoge la lista; sin canción, se despliega
    if (isMobile()) setSheet(!state.current);
    const fromSync = syncHash !== null && syncHash === code;
    syncHash = null;
    if (!fromSync) notify('song');
  }

  // ---------- Móvil: lista de canciones en un panel deslizable desde abajo ----------
  const mq = matchMedia('(max-width: 820px)');
  function isMobile() { return mq.matches; }
  function setSheet(open) {
    const b = document.body;
    if (!isMobile()) { b.classList.remove('sheet-open', 'sheet-closed'); return; }
    if (!open && !state.current) open = true; // sin canción abierta no hay nada detrás
    b.classList.toggle('sheet-open', open);
    b.classList.toggle('sheet-closed', !open);
    $('sheetHandle').setAttribute('aria-expanded', String(open));
    if (!open) { $('lists').classList.remove('open'); $('sidebar').scrollTop = 0; }
    updateSheetLabel();
  }
  function updateSheetLabel() {
    const l = $('sheetLabel');
    if (!l) return;
    const cur = listById(state.list);
    const open = document.body.classList.contains('sheet-open');
    l.textContent = open || !state.current ? 'Lista de canciones' : state.current.code + ' · ' + state.current.title;
  }
  (function () {
    const h = $('sheetHandle'), sb = $('sidebar');
    let y0 = 0, startOpen = false, moved = false, dragging = false, travel = 0, last = 0;
    const PEEK = 58;
    h.addEventListener('pointerdown', (e) => {
      if (!isMobile()) return;
      dragging = true; moved = false; y0 = e.clientY; last = 0;
      startOpen = document.body.classList.contains('sheet-open');
      travel = sb.getBoundingClientRect().height - PEEK;
      h.setPointerCapture(e.pointerId);
    });
    h.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dy = e.clientY - y0;
      if (!moved && Math.abs(dy) < 6) return;
      if (!moved) { moved = true; document.body.classList.add('sheet-dragging'); }
      last = dy;
      const t = Math.max(0, Math.min(travel, (startOpen ? 0 : travel) + dy));
      sb.style.transform = 'translateY(' + t + 'px)';
    });
    const end = () => {
      if (!dragging) return;
      dragging = false;
      document.body.classList.remove('sheet-dragging');
      sb.style.transform = '';
      if (!moved) { setSheet(!document.body.classList.contains('sheet-open')); return; }
      if (last < -40) setSheet(true);
      else if (last > 40) setSheet(false);
      else setSheet(startOpen);
    };
    h.addEventListener('pointerup', end);
    h.addEventListener('pointercancel', end);
    // tocar una canción (aunque sea la que ya está abierta) recoge el panel
    $('songList').addEventListener('click', (e) => { if (isMobile() && e.target.closest('a')) setTimeout(() => setSheet(false), 0); });
    mq.addEventListener('change', () => setSheet(!state.current));
  })();

  // Interfaz para live.js
  window.App = {
    getState() {
      const s = state.current;
      return { song: s ? s.code : '', shift: s ? (state.shifts[s.code] || 0) : 0, para: s ? state.para : null, blank: state.blank };
    },
    apply({ song, shift, para, blank }, opts) {
      if (typeof blank === 'boolean') setBlank(blank, true);
      const cur = state.current ? state.current.code : '';
      if (typeof song === 'string' && song !== cur) {
        if (song && !SONGS.some((x) => x.code === song)) return;
        syncHash = song;
        location.hash = song ? '#' + song : '';
      }
      const target = song ? SONGS.find((x) => x.code === song) : null;
      if (target && Number.isInteger(shift) && shift >= -11 && shift <= 11 &&
          signed(shift) !== signed(state.shifts[target.code] || 0)) {
        if (signed(shift)) state.shifts[target.code] = signed(shift); else delete state.shifts[target.code];
        if (state.current === target) { renderSheet(); renderList(); }
      }
      if (target && (para === null || Number.isInteger(para)) && !(opts && opts.noPara)) {
        // tras cambiar de canción, esperar a que se pinte
        const go = () => { if (state.current === target && para !== state.para) selectPara(para, true); };
        if (state.current === target) go(); else setTimeout(go, 120);
      }
    },
    onChange(fn) { listeners.push(fn); },
    blank: () => state.blank,
    setBlank: (b) => setBlank(b),
    refit: fitSheet,
    // Para el modo Pantalla (screen.js)
    lyricParas: () => lyricParas(),
    title: () => (state.current ? state.current.title : ''),
    para: () => state.para,
    paraCount: () => state.paraCount,
    selectPara: (i) => selectPara(i),
    step(d) {
      if (!state.current || !state.paraCount) return;
      const n = state.para === null ? 0 : state.para + d;
      if (n >= 0 && n < state.paraCount) selectPara(n);
    },
    // ---- Edición de canciones ----
    editData() {
      const s = state.current;
      if (!s) return null;
      const shift = state.shifts[s.code] || 0;
      const flats = s.key ? C.prefersFlats(s.key.semi + shift, s.key.minor) : false;
      const text = s.lines.map((line, i) => s.chordFlags[i] && (shift || state.notation !== 'latin')
        ? C.transposeLine(line, shift, flats, state.notation).map((g) => g.text).join('') : line).join('\n');
      return { code: s.code, title: s.title, text, shift, keyName: keyName(s, shift), edited: !!edits[s.code], temp: !!temp[s.code], notation: state.notation };
    },
    saveEdit(code, title, text) {
      const s = SONGS.find((x) => x.code === code);
      if (!s) return false;
      const shift = state.shifts[code] || 0;
      let lines = text.replace(/\r/g, '').replace(/\t/g, '    ').split('\n').map((l) => l.replace(/\s+$/, ''));
      while (lines.length && !lines[0].trim()) lines.shift();
      while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
      // colapsa varias líneas en blanco seguidas en una sola (un salto de párrafo)
      lines = lines.filter((l, i) => l.trim() || (i > 0 && lines[i - 1].trim()));
      if (shift) {
        const k = C.detectKey(lines);
        const flats = k ? C.prefersFlats(k.semi - shift, k.minor) : false;
        lines = lines.map((l) => C.isChordLine(l) ? C.transposeLine(l, -shift, flats, state.notation).map((g) => g.text).join('').replace(/\s+$/, '') : l);
      }
      title = (title || '').trim() || ORIG[code].title;
      const o = ORIG[code];
      if (title === o.title && lines.join('\n') === o.lines.join('\n')) delete edits[code];
      else edits[code] = { title, lines };
      store.set('edits', edits);
      localChanged();
      load(s);
      if (state.current === s) showSong(code);
      renderList();
      notify('edit');
      return true;
    },
    resetEdit(code) {
      const s = SONGS.find((x) => x.code === code);
      if (!s) return;
      delete edits[code];
      store.set('edits', edits);
      localChanged();
      load(s);
      if (state.current === s) showSong(code);
      renderList();
      notify('edit');
    },
    exportEdits: () => ({ formato: 'cancionero-meriba', version: 3, canciones: JSON.parse(JSON.stringify(edits)), colecciones: JSON.parse(JSON.stringify(coll)), comentarios: JSON.parse(JSON.stringify(notes)) }),
    hasChanges: () => Object.keys(edits).length > 0 || coll.custom.length > 0 || coll.removed.length > 0 || Object.keys(coll.songs).length > 0 || Object.keys(notes).length > 0,
    importEdits(obj) {
      if (!obj || typeof obj !== 'object') return 0;
      let n = 0;
      if (obj.formato === 'cancionero-meriba' && obj.colecciones && Array.isArray(obj.colecciones.custom)) {
        obj.colecciones.custom.forEach((c) => { c = cleanCat(c); if (c && !allCats().includes(c)) { coll.custom.push(c); coll.removed = coll.removed.filter((x) => x !== c); } });
        Object.entries(obj.colecciones.songs || {}).forEach(([code, list]) => {
          if (SONGS.some((x) => x.code === code) && Array.isArray(list)) { coll.songs[code] = list.filter((c) => allCats().includes(c)); n++; }
        });
        saveColl(); SONGS.forEach(applyCats); renderChips();
      }
      if (obj.formato === 'cancionero-meriba' && obj.comentarios && typeof obj.comentarios === 'object') {
        Object.entries(obj.comentarios).forEach(([code, t]) => {
          if (SONGS.some((x) => x.code === code) && typeof t === 'string') { notes[code] = t.slice(0, 2000); n++; }
        });
        store.set('notes', notes);
        reconcile();
      }
      if (obj.formato === 'cancionero-meriba') obj = obj.canciones || {};
      Object.entries(obj).forEach(([code, v]) => {
        const s = SONGS.find((x) => x.code === code);
        if (!s || !v || typeof v.title !== 'string' || !Array.isArray(v.lines)) return;
        edits[code] = { title: v.title.slice(0, 200), lines: v.lines.filter((l) => typeof l === 'string').map((l) => l.slice(0, 400)).slice(0, 400) };
        load(s); n++;
      });
      store.set('edits', edits);
      localChanged();
      if (state.current) showSong(state.current.code);
      renderList();
      return n;
    },
    // ---- Colecciones ----
    collections: () => catsFor(state.current ? state.current.list : state.list).map((c) => ({ name: c, label: catLabel(c), custom: !CATS.includes(c), count: SONGS.filter((s) => s.categories.includes(c)).length })),
    songCats: () => (state.current ? state.current.categories.slice() : []),
    setSongCats(code, list) {
      const s = SONGS.find((x) => x.code === code);
      if (!s) return;
      list = allCats().filter((c) => list.includes(c));
      if (JSON.stringify(list) === JSON.stringify(s.baseCats.filter((c) => allCats().includes(c)))) delete coll.songs[code];
      else coll.songs[code] = list;
      saveColl(); applyCats(s);
      if (state.current === s) showSong(code);
      renderList();
    },
    createCollection(name) {
      name = cleanCat(name);
      if (!name) return { error: 'Escribe un nombre.' };
      if (allCats().some((c) => fold(c) === fold(name))) return { error: 'Ya existe una colección con ese nombre.' };
      coll.removed = coll.removed.filter((c) => fold(c) !== fold(name));
      coll.custom.push(name); saveColl(); renderChips();
      return { name };
    },
    deleteCollection(name) {
      const i = coll.custom.indexOf(name);
      if (i < 0 && !baseCustom.includes(name)) return;
      if (i >= 0) coll.custom.splice(i, 1);
      if (baseCustom.includes(name) && !coll.removed.includes(name)) coll.removed.push(name);
      Object.keys(coll.songs).forEach((code) => { coll.songs[code] = coll.songs[code].filter((c) => c !== name); });
      saveColl(); SONGS.forEach(applyCats);
      if (state.category === name) state.category = null;
      renderChips(); renderList();
      if (state.current) showSong(state.current.code);
    },
    pickCategory: (c) => pickCategory(c),
    // ---- Versión temporal del emisor (directo) ----
    songContent(code) {
      const s = SONGS.find((x) => x.code === code);
      return s && s.edited ? { t: s.title, l: s.lines } : null;
    },
    setTemp(code, content) {
      const s = SONGS.find((x) => x.code === code);
      if (!s) return;
      let next;
      if (content && typeof content.t === 'string' && Array.isArray(content.l)) {
        next = { title: content.t.slice(0, 200), lines: content.l.filter((x) => typeof x === 'string').map((x) => x.slice(0, 400)).slice(0, 400) };
      } else next = edits[code] ? 'orig' : undefined; // el emisor usa la versión original
      const same = JSON.stringify(temp[code]) === JSON.stringify(next);
      if (same) return;
      if (next === undefined) delete temp[code]; else temp[code] = next;
      load(s);
      if (state.current === s) showSong(code);
    },
    clearTemp() {
      Object.keys(temp).forEach((code) => {
        delete temp[code];
        const s = SONGS.find((x) => x.code === code);
        if (s) { load(s); if (state.current === s) showSong(code); }
      });
    },
    song(d) {
      if (!state.current) return;
      const ls = listSongs(state.current.list);
      const t = ls[ls.indexOf(state.current) + d];
      if (t) location.hash = '#' + t.code;
    },
    onView(fn) { viewListeners.push(fn); },
    // ---- Cancionero compartido (cloud.js) ----
    onLocalChange(fn) { localListeners.push(fn); },
    // Cambios hechos en este dispositivo que aún no están en el cancionero compartido
    pending() {
      const out = { addCats: coll.custom.slice(), delCats: coll.removed.slice(), songs: [], notes: [], cats: [] };
      Object.entries(edits).forEach(([code, e]) => out.songs.push({ code, title: e.title, lines: e.lines.slice() }));
      Object.entries(notes).forEach(([code, text]) => out.notes.push({ code, text }));
      Object.entries(coll.songs).forEach(([code, list]) => out.cats.push({ code, categories: list.slice() }));
      return out;
    },
    // El cancionero tal como viene de la fuente (sin cambios locales), para subirlo la primera vez
    baseDoc() {
      return {
        lists: JSON.parse(JSON.stringify(LISTS)),
        customCats: baseCustom.slice(),
        songs: SONGS.map((s) => {
          const o = { code: s.code, title: ORIG[s.code].title, lines: ORIG[s.code].lines.slice(), variants: s.variants || [], categories: (s.baseCats || []).slice(), list: s.list };
          if (s.comment) o.comment = s.comment;
          return o;
        })
      };
    },
    // Sustituye el cancionero base por una versión nueva (de Drive) sin recargar la página
    loadDoc(doc) {
      if (!doc || !Array.isArray(doc.songs) || !Array.isArray(doc.lists) || !doc.songs.length) return;
      const cur = state.current;
      const sig = (s) => s && JSON.stringify([s.title, s.lines, s.categories, s.comment || '', s.list, s.edited]);
      const before = sig(cur);
      LISTS.splice(0, LISTS.length, ...doc.lists);
      CATS = LISTS.flatMap((l) => l.cats || []);
      UPPER_CATS = listById('meriba').cats || [];
      baseCustom = Array.isArray(doc.customCats) ? doc.customCats.slice() : [];
      const byCode = {};
      SONGS.forEach((s) => { byCode[s.code] = s; });
      const next = doc.songs.filter((d) => d && typeof d.code === 'string' && Array.isArray(d.lines)).map((d) => {
        const s = byCode[d.code] || { code: d.code };
        s.variants = d.variants || [];
        s.list = d.list || LISTS[0].id;
        s.baseCats = (d.categories || []).slice();
        if (d.comment) s.comment = d.comment; else delete s.comment;
        ORIG[d.code] = { title: d.title, lines: d.lines.slice() };
        return s;
      });
      SONGS.splice(0, SONGS.length, ...next);
      reconcile();
      SONGS.forEach((s, i) => { s.index = i; load(s); applyCats(s); });
      if (state.category && !allCats().includes(state.category)) state.category = null;
      renderLists(); renderChips(); renderList();
      if (!cur) { const h = decodeURIComponent(location.hash.replace(/^#\/?/, '')); if (h && SONGS.some((x) => x.code === h)) showSong(h); }
      else if (!SONGS.includes(cur)) location.hash = '';
      else if (cur && sig(cur) !== before) {
        const y = $('content').scrollTop, para = state.para;
        showSong(cur.code);
        if (para !== null && para < state.paraCount) selectPara(para, true); else $('content').scrollTop = y;
      }
    },
    refreshTags() { if (state.current) { const y = $('content').scrollTop; showSong(state.current.code); $('content').scrollTop = y; } }
  };

  // ---------- Eventos ----------
  $('upBtn').onclick = () => setShift((state.shifts[state.current.code] || 0) + 1);
  $('downBtn').onclick = () => setShift((state.shifts[state.current.code] || 0) - 1);
  $('keySelect').onchange = (e) => setShift(+e.target.value);
  $('resetBtn').onclick = () => setShift(0);
  $('fontUp').onclick = () => { state.font = Math.min(30, state.font + 1); store.set('font', state.font); renderSheet(); };
  $('fontDown').onclick = () => { state.font = Math.max(11, state.font - 1); store.set('font', state.font); renderSheet(); };
  $('lyricsOnly').onclick = () => { state.lyricsOnly = !state.lyricsOnly; store.set('lyricsOnly', state.lyricsOnly); renderSheet(); };

  // Sin zoom en ningún caso (pellizco, doble toque, Ctrl+rueda, Ctrl +/-)
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((t) => document.addEventListener(t, (e) => e.preventDefault(), { passive: false }));
  document.addEventListener('touchmove', (e) => { if (e.touches && e.touches.length > 1) e.preventDefault(); }, { passive: false });
  let lastTouchEnd = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    // los toques seguidos en botones (A+, A−, ◀ ▶…) cuentan todos: el zoom ya lo impide touch-action
    if (now - lastTouchEnd < 320 && !e.target.closest('input, textarea, select, button, a, label, .sb, .tb')) e.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });
  window.addEventListener('wheel', (e) => { if (e.ctrlKey || e.metaKey) e.preventDefault(); }, { passive: false });
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0', '_'].includes(e.key)) e.preventDefault();
  });

  // Engranaje: contraer / expandir la barra
  function setCollapsed(c) {
    $('toolbar').classList.toggle('collapsed', c);
    $('gearBtn').setAttribute('aria-expanded', String(!c));
    document.body.classList.toggle('tb-collapsed', c);
    store.set('tbCollapsed', c);
    fitSheet();
    armAutoCollapse();
  }
  // Los botones del engranaje se recogen solos tras 30 s sin tocarlos
  let tbTimer = null;
  function armAutoCollapse() {
    clearTimeout(tbTimer);
    if ($('toolbar').classList.contains('collapsed')) return;
    tbTimer = setTimeout(() => setCollapsed(true), 30000);
  }
  ['pointerdown', 'keydown', 'focusin', 'wheel'].forEach((t) => $('toolbar').addEventListener(t, armAutoCollapse, { passive: true }));
  $('toolbar').addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') armAutoCollapse(); }, { passive: true });
  $('gearBtn').onclick = () => setCollapsed(!$('toolbar').classList.contains('collapsed'));
  setCollapsed(store.get('tbCollapsed', false));

  // Barra vertical: se vuelve semitransparente tras 5 s sin actividad
  let idleTimer = null;
  function wake() {
    $('toolbar').classList.remove('idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => $('toolbar').classList.add('idle'), 5000);
  }
  ['scroll', 'pointermove', 'pointerdown', 'touchstart', 'keydown', 'wheel'].forEach((t) =>
    window.addEventListener(t, wake, { passive: true }));
  wake();
  $('search').oninput = (e) => { state.query = e.target.value; renderList(); };
  $('backBtn').onclick = () => { location.hash = ''; };

  function updateNotationBtn() {
    $('notationBtn').innerHTML = state.notation === 'latin' ? '<b>DO</b>/C' : 'DO/<b>C</b>';
  }
  $('notationBtn').onclick = () => {
    state.notation = state.notation === 'latin' ? 'us' : 'latin';
    store.set('notation', state.notation);
    updateNotationBtn(); renderSheet(); renderList();
  };

  const theme = store.get('theme', null);
  if (theme) document.documentElement.dataset.theme = theme;
  $('themeBtn').onclick = () => {
    const cur = document.documentElement.dataset.theme ||
      (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const nx = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = nx;
    store.set('theme', nx);
  };

  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, select, textarea') || !state.current || document.body.classList.contains('screen-mode')) return;
    const receiving = document.body.classList.contains('receiving'); // el tono lo decide el emisor
    if (receiving && ['+', '=', '-'].includes(e.key)) return;
    if (e.key === '+' || e.key === '=') setShift((state.shifts[state.current.code] || 0) + 1);
    else if (e.key === '-') setShift((state.shifts[state.current.code] || 0) - 1);
    else if ((e.key === 'b' || e.key === 'B') && !(receiving && !document.body.classList.contains('lyrics-op'))) setBlank(!state.blank);
    else if (e.key === 'ArrowDown' && state.paraCount) { e.preventDefault(); selectPara(state.para === null ? 0 : Math.min(state.paraCount - 1, state.para + 1)); }
    else if (e.key === 'ArrowUp' && state.paraCount) { e.preventDefault(); selectPara(state.para === null ? 0 : Math.max(0, state.para - 1)); }
    else if (e.key === 'ArrowRight' && SONGS[state.current.index + 1]) location.hash = '#' + SONGS[state.current.index + 1].code;
    else if (e.key === 'ArrowLeft' && SONGS[state.current.index - 1]) location.hash = '#' + SONGS[state.current.index - 1].code;
  });

  renderLists();
  updateNotationBtn();
  renderChips();
  window.addEventListener('hashchange', route);
  route();
})();
