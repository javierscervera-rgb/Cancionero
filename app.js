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
    sub: 0,                // trozo del párrafo que se proyecta (si el párrafo es muy largo)
    // máximo de caracteres por párrafo (común, guardado en Drive; lo decide el líder). 0 = sin límite
    maxChars: (() => {
      const p = store.get('settingsPending', null);
      if (p && typeof p.maxChars === 'number') return p.maxChars;
      return (window.CLOUD_SETTINGS && +window.CLOUD_SETTINGS.maxChars) || 0;
    })(),
    query: '',
    letter: null,          // filtro por inicial del título (A, B… o #)
    tab: store.get('tab', 'all'), // pestaña de la lista: 'sel' (Selección) o 'all' (Todas)
    sorting: false,        // ordenando la selección
    listFont: store.get('listFont2', 19),
    mediaMode: store.get('mediaMode', false),
    sort: store.get('sort', 'mark'),       // orden de la lista: 'mark' (marcador A01, B02…) o 'name' (título) // la lista muestra el multimedia en vez de las canciones
    ms: { id: null, play: false, pos: 0, at: 0, vol: 1, loop: false, t: 0 }, // reproducción del multimedia
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
  // Selección (compartida en Drive): canciones elegidas, en orden. selLocal = cambio aún no guardado
  // una selección por cancionero: { idLista: [códigos en orden] }
  let baseSel = {};
  let selLocal = store.get('selPending2', null); // cambios aún no guardados en Drive, por cancionero
  if (!selLocal || typeof selLocal !== 'object' || Array.isArray(selLocal)) selLocal = null;
  const songList = (code) => { const x = SONGS.find((s) => s.code === code); return x ? x.list : null; };
  // ---------- Multimedia (archivos en Drive; código '@xxxx') ----------
  // Cada archivo se trata como un «elemento» de un solo párrafo: abrirlo no cambia la pantalla;
  // tocarlo lo proyecta. Vale para cualquier cancionero.
  let MEDIA = Array.isArray(window.CLOUD_MEDIA) ? window.CLOUD_MEDIA : [];
  const mediaObjs = {};
  function mediaObj(m) {
    const o = mediaObjs[m.id] || (mediaObjs[m.id] = { code: m.id, paras: [[0]], lines: [''], chordFlags: [false], categories: [], list: null });
    o.media = m; o.title = m.name; o.searchText = fold(m.name || '');
    return o;
  }
  const mediaItems = () => MEDIA.map(mediaObj);
  const isMediaCode = (c) => typeof c === 'string' && c.charAt(0) === '@';
  const findItem = (code) => (isMediaCode(code) ? (MEDIA.find((m) => m.id === code) ? mediaObj(MEDIA.find((m) => m.id === code)) : null) : SONGS.find((s) => s.code === code));
  const mediaKind = (m) => (/^video\//.test(m.type) ? 'VÍDEO' : /^audio\//.test(m.type) ? 'AUDIO' : 'IMAGEN');
  // ---------- Marcador de cada canción (A01, B02…): editable, guardado en Drive ----------
  // El código interno (s.code) no cambia; el marcador es lo que se ve y por lo que se ordena.
  let marks = store.get('marks', {}); // cambios aún no guardados en Drive
  if (!marks || typeof marks !== 'object' || Array.isArray(marks)) marks = {};
  const markOf = (s) => (s.media ? '' : (marks[s.code] !== undefined ? marks[s.code] : s.mark) || s.code);
  const cmpText = (a, b) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' });
  function sortItems(arr) {
    const tt = (x) => (x.title || '').replace(/^[^\p{L}\p{N}]+/u, '');
    if (state.sort === 'name') return arr.slice().sort((a, b) => cmpText(tt(a), tt(b)) || cmpText(markOf(a), markOf(b)));
    return arr.slice().sort((a, b) => cmpText(markOf(a), markOf(b)) || (a.index || 0) - (b.index || 0));
  }
  function setMark(s, v) {
    v = String(v || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 12);
    const target = v || s.code, base = s.mark || s.code;
    if (target === base) delete marks[s.code]; else marks[s.code] = target === s.code ? '' : target;
    store.set('marks', marks);
    localChanged();
    renderList();
    if (state.current === s) $('songCode').textContent = markOf(s);
  }
  // editar el marcador tocándolo en la cabecera de la canción
  function editMark() {
    const s = state.current, el = $('songCode');
    if (!s || s.media || el.querySelector('input')) return;
    const inp = document.createElement('input');
    inp.className = 'mark-in'; inp.maxLength = 12; inp.value = markOf(s);
    inp.setAttribute('aria-label', 'Marcador de la canción');
    el.textContent = ''; el.appendChild(inp); inp.focus(); inp.select();
    let done = false;
    const fin = (ok) => { if (done) return; done = true; if (ok) setMark(s, inp.value); el.textContent = markOf(s); };
    inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') fin(true); if (e.key === 'Escape') fin(false); };
    inp.onblur = () => fin(true);
  }
  // ---------- Autor de cada canción (editable, guardado en Drive) ----------
  let authors = store.get('authors', {}); // cambios aún no guardados en Drive
  if (!authors || typeof authors !== 'object' || Array.isArray(authors)) authors = {};
  const authorOf = (s) => (s.media ? '' : (authors[s.code] !== undefined ? authors[s.code] : s.author) || '');
  const cleanAuthor = (v) => String(v || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
  function setAuthor(s, v) {
    v = cleanAuthor(v);
    if (v === (s.author || '')) delete authors[s.code]; else authors[s.code] = v;
    store.set('authors', authors);
    localChanged();
    if (state.current === s) renderAuthor(s);
  }
  function renderAuthor(s) {
    const el = $('songAuthor');
    if (!s || s.media) { el.hidden = true; return; }
    el.hidden = false;
    const a = authorOf(s);
    el.classList.toggle('empty', !a);
    el.textContent = a ? a : '＋ Autor';
  }
  function editAuthor() {
    const s = state.current, el = $('songAuthor');
    if (!s || s.media || el.querySelector('input')) return;
    const inp = document.createElement('input');
    inp.className = 'author-in'; inp.maxLength = 120; inp.value = authorOf(s); inp.placeholder = 'Autor (letra y música)';
    inp.setAttribute('aria-label', 'Autor de la canción');
    el.textContent = ''; el.appendChild(inp); inp.focus();
    let done = false;
    const fin = (ok) => { if (done) return; done = true; if (ok) setAuthor(s, inp.value); renderAuthor(s); };
    inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') fin(true); if (e.key === 'Escape') fin(false); };
    inp.onblur = () => fin(true);
    inp.onclick = (e) => e.stopPropagation();
  }
  // Cancioneros a los que pertenece una canción: s.lists (si se ha cambiado) o solo el suyo (s.list)
  const listsOf = (s) => (s && Array.isArray(s.lists) && s.lists.length ? s.lists : s ? [s.list] : []);
  const inL = (s, id) => !!(s && (s.media || listsOf(s).includes(id)));
  const memberOf = (code, id) => inL(findItem(code), id);
  // en qué cancionero se usa: el elegido si la canción está en él; si no, el suyo
  const listFor = (s) => (inL(s, state.list) ? state.list : s.list);
  let memb = store.get('songLists', {}); // cambios de cancioneros aún no guardados en Drive
  if (!memb || typeof memb !== 'object' || Array.isArray(memb)) memb = {};
  function applyMemb(s) {
    if (s.baseLists === undefined) s.baseLists = Array.isArray(s.lists) ? s.lists.slice() : null;
    const own = memb[s.code];
    s.lists = own ? own.slice() : (s.baseLists ? s.baseLists.slice() : null);
  }
  function splitByList(codes) { // reparte una lista de códigos por cancionero
    const out = {};
    (codes || []).forEach((c) => { const l = songList(c); if (l) (out[l] = out[l] || []).push(c); });
    return out;
  }
  function setBaseSel(selections, old) {
    baseSel = selections && typeof selections === 'object' && !Array.isArray(selections) ? JSON.parse(JSON.stringify(selections)) : {};
    if (Array.isArray(old)) Object.entries(splitByList(old)).forEach(([l, c]) => { if (!baseSel[l]) baseSel[l] = c; });
  }
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
  let newSongs = store.get('newSongs', {}); // canciones creadas desde la web aún no guardadas en Drive
  if (!newSongs || typeof newSongs !== 'object') newSongs = {};
  const temp = {}; // code -> {title, lines} | 'orig'  (mientras se recibe en directo)

  // ---------- Máximo de caracteres por párrafo ----------
  // Una línea de texto (sin acordes encima) demasiado larga se parte: puntos, luego comas, luego palabras.
  const SEPS = [/(?<=[.;:!?»”])\s+/, /(?<=,)\s+/, /\s+/];
  function splitLong(line, max, lvl = 0) {
    if (line.length <= max || lvl >= SEPS.length) return [line];
    const parts = line.trim().split(SEPS[lvl]);
    if (parts.length < 2) return splitLong(line, max, lvl + 1);
    const out = []; let cur = '';
    parts.forEach((p) => { if (cur && (cur + ' ' + p).length > max) { out.push(cur); cur = p; } else cur = cur ? cur + ' ' + p : p; });
    if (cur) out.push(cur);
    return out.flatMap((x) => (x.length > max ? splitLong(x, max, lvl + 1) : [x]));
  }
  function fitLines(lines) {
    const max = state.maxChars;
    if (!max) return lines.slice();
    const out = [];
    lines.forEach((l, j) => {
      const afterChord = j > 0 && C.isChordLine(lines[j - 1]);
      if (!afterChord && !C.isChordLine(l) && l.length > max) out.push(...splitLong(l, max));
      else out.push(l);
    });
    return out;
  }
  // Un párrafo con más caracteres de letra que el máximo se divide en varios (línea de acordes + letra van juntas)
  function fitParas(s, paras) {
    const max = state.maxChars;
    if (!max) return paras;
    const out = [];
    paras.forEach((idxs) => {
      const units = [];
      for (let k = 0; k < idxs.length; k++) {
        const i = idxs[k];
        if (s.chordFlags[i] && k + 1 < idxs.length && !s.chordFlags[idxs[k + 1]]) { units.push([i, idxs[k + 1]]); k++; }
        else units.push([i]);
      }
      const size = (u) => u.reduce((n, i) => n + (s.chordFlags[i] ? 0 : s.lines[i].trim().length), 0);
      let cur = [], len = 0;
      units.forEach((u) => {
        const n = size(u);
        if (cur.length && len + n > max) { out.push(cur); cur = []; len = 0; }
        cur.push(...u); len += n;
      });
      if (cur.length) out.push(cur);
    });
    return out;
  }

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
    s.paras = fitParas(s, s.paras);
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
    s.srcLines = src.lines.slice(); // texto tal cual (para editar)
    s.lines = fitLines(src.lines);  // adaptado al máximo de caracteres
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
    if (selLocal) {
      Object.keys(selLocal).forEach((l) => { if (JSON.stringify(selLocal[l]) === JSON.stringify(baseSel[l] || [])) delete selLocal[l]; });
      if (!Object.keys(selLocal).length) selLocal = null;
      store.set('selPending2', selLocal);
    }
  }
  setBaseSel(window.CLOUD_SEL, window.CLOUD_SEL_OLD);
  // selección pendiente del formato antiguo (una sola): se reparte por cancionero
  (function () {
    const old = store.get('selPending', null);
    if (Array.isArray(old)) {
      selLocal = selLocal || {};
      Object.entries(splitByList(old)).forEach(([l, c]) => { if (!selLocal[l]) selLocal[l] = c; });
      store.set('selPending', null); store.set('selPending2', selLocal);
    }
  })();
  reconcile();
  document.body.classList.add('can-edit'); // cualquiera puede editar (se guarda en Drive)
  SONGS.forEach((s, i) => { s.index = i; load(s); applyCats(s); applyMemb(s); });
  state.list = listById(store.get('list', LISTS[0].id)).id;
  const listSongs = (id) => sortItems(SONGS.filter((s) => inL(s, id || state.list)));

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
    if (state.tab === 'sel') { state.tab = 'all'; state.sorting = false; store.set('tab', 'all'); }
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
    document.body.dataset.list = id;
    if (changed) { state.category = null; state.letter = null; }
    renderLists(); renderChips(); renderList();
    if (changed && !keepSong && state.current && !inL(state.current, id)) location.hash = '';
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
    add.textContent = '✎ Edición';
    add.title = 'Crear y borrar colecciones y elegir en qué cancioneros aparece cada una';
    add.onclick = () => { if (window.Edition) window.Edition.open(); else if (window.Collections) window.Collections.openCreate(); };
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
    return sortItems(SONGS.filter((s) =>
      inL(s, state.list) &&
      (!state.category || s.categories.includes(state.category)) &&
      (ignoreLetter || !state.letter || initialOf(s.title) === state.letter) &&
      (!q || s.searchText.includes(q) || s.code.toLowerCase().includes(q) || fold(markOf(s)).includes(q) || fold(authorOf(s)).includes(q))));
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

  // ---------- Selección ----------
  // selección del cancionero (por defecto, el que está elegido)
  const selCodes = (list) => {
    list = list || state.list;
    const arr = (selLocal && selLocal[list]) || baseSel[list] || [];
    return arr.filter((c, i) => arr.indexOf(c) === i && memberOf(c, list));
  };
  const selSongs = (list) => selCodes(list).map((c) => findItem(c)).filter(Boolean);
  const inSel = (code) => { const x = findItem(code); return !!x && selCodes(listFor(x)).includes(code); };
  function setSelection(codes, list) {
    list = list || state.list;
    selLocal = selLocal || {};
    selLocal[list] = codes.filter((c, i) => typeof c === 'string' && codes.indexOf(c) === i && memberOf(c, list));
    store.set('selPending2', selLocal);
    if (list === state.list && !selLocal[list].length && state.tab === 'sel') setTab('all');
    localChanged();
    renderList();
    if (state.current) { const ls = navList(state.current), li = ls.indexOf(state.current); updatePager(ls, li); }
  }
  function toggleSel(code) {
    const sx = findItem(code);
    const list = sx ? listFor(sx) : null;
    if (!list) return;
    const cur = selCodes(list);
    setSelection(cur.includes(code) ? cur.filter((c) => c !== code) : cur.concat(code), list);
  }
  // ---------- Cancioneros de una canción (📚) ----------
  function setSongLists(s, ids) {
    ids = LISTS.map((l) => l.id).filter((id) => ids.includes(id));
    if (!ids.length) return false;
    const base = s.baseLists || [s.list];
    if (JSON.stringify(ids) === JSON.stringify(base)) delete memb[s.code]; else memb[s.code] = ids;
    store.set('songLists', memb);
    applyMemb(s);
    localChanged();
    renderList();
    if (state.current) { const ls = navList(state.current); updatePager(ls, ls.indexOf(state.current)); }
    return true;
  }
  function openListsMenu(s, anchor) {
    let m = $('listsMenu');
    if (!m) {
      m = document.createElement('div');
      m.id = 'listsMenu'; m.className = 'lists-menu'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-label', 'Cancioneros');
      document.body.appendChild(m);
      m.addEventListener('click', (e) => e.stopPropagation());
      document.addEventListener('click', () => { m.hidden = true; });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') m.hidden = true; });
    }
    if (!m.hidden && m.dataset.code === s.code) { m.hidden = true; return; }
    m.dataset.code = s.code;
    const draw = () => {
      const cur = listsOf(s);
      m.innerHTML = '<p class="lm-head">Cancioneros de «' + esc(s.title) + '»</p>' +
        LISTS.map((l) => `<label class="lm-row"><input type="checkbox" value="${l.id}"${cur.includes(l.id) ? ' checked' : ''}${cur.length === 1 && cur.includes(l.id) ? ' disabled' : ''}> ${esc(l.name)}</label>`).join('') +
        '<p class="lm-note">Tiene que estar al menos en uno. Se guarda en Drive para todos.</p>';
      m.querySelectorAll('input').forEach((inp) => {
        inp.onchange = () => {
          const ids = [...m.querySelectorAll('input:checked')].map((x) => x.value);
          if (!setSongLists(s, ids)) inp.checked = true;
          draw();
        };
      });
    };
    draw();
    m.hidden = false;
    const r = anchor.getBoundingClientRect();
    m.style.top = Math.min(window.innerHeight - m.offsetHeight - 8, r.bottom + 6) + 'px';
    m.style.left = Math.max(8, Math.min(window.innerWidth - m.offsetWidth - 8, r.left)) + 'px';
  }

  function setTab(t) {
    state.tab = t === 'sel' ? 'sel' : 'all';
    store.set('tab', state.tab);
    if (state.tab !== 'sel') state.sorting = false;
    renderList();
    $('sidebar').scrollTop = 0;
  }
  // canciones por las que se avanza con ← → en la canción abierta
  function navList(s) {
    if (state.tab === 'sel' && inSel(s.code)) return selSongs(listFor(s));
    if (s.media) return mediaItems();
    return listSongs(listFor(s));
  }
  function renderSelUi() {
    const n = selCodes().length;
    $('selTabs').hidden = false; // siempre visibles
    $('tabSel').textContent = 'Selección (' + n + ')';
    $('tabSel').classList.toggle('on', state.tab === 'sel');
    $('tabAll').classList.toggle('on', state.tab !== 'sel');
    $('selBar').hidden = state.tab !== 'sel' || !n;
    $('selSort').setAttribute('aria-pressed', String(!!state.sorting));
    $('selSort').textContent = state.sorting ? '✓ Hecho' : '↕ Ordenar';
    $('selHint').textContent = state.sorting ? 'Arrastra ≡ arriba o abajo para cambiar el orden.' : 'Desliza una canción a la derecha para quitarla.';
    $('sidebar').classList.toggle('sorting', !!state.sorting);
  }

  let pendingRender = false;
  function renderList() {
    if (window.SelGesture && window.SelGesture.active()) { pendingRender = true; return; } // no repintar a mitad de un gesto
    pendingRender = false;
    renderAbc();
    renderSelUi();
    const list = $('songList');
    const sel = state.tab === 'sel';
    const mm = state.mediaMode && !sel;
    $('sidebar').classList.toggle('media-mode', !!state.mediaMode);
    $('mediaBtn').setAttribute('aria-pressed', String(!!state.mediaMode));
    $('mediaBar').innerHTML = state.mediaMode ? '<span>♪ Canciones</span><b>▾</b>' : '<span>🎞 Multimedia' + (MEDIA.length ? ' (' + MEDIA.length + ')' : '') + '</span><b>▴</b>';
    let items = filtered();
    if (mm) { const q = fold(state.query.trim()); items = mediaItems().filter((s) => !q || s.searchText.includes(q)); }
    if (sel) {
      const q = fold(state.query.trim());
      items = selSongs().filter((s) => !q || s.searchText.includes(q) || s.code.toLowerCase().includes(q));
    }
    const chosen = new Set(selCodes());
    // la pastilla para añadir va siempre al final de la lista (todas, colección, letra, búsqueda o selección)
    const addPill = mm
      ? '<li class="add-song media-up"><button id="mediaUpBtn" type="button"><span class="as-plus">＋</span> Subir foto, vídeo o audio</button><span class="mu-hint">o arrástralos aquí</span></li>'
      : '<li class="add-song"><button id="addSongBtn" type="button"><span class="as-plus">＋</span> Añadir una canción</button></li>';
    list.innerHTML = (items.map((s) =>
      `<li data-code="${s.code}"${s.media ? ' class="mli"' : ''}><a href="#${s.code}" draggable="false" class="${state.current === s ? 'active' : ''}${chosen.has(s.code) ? ' sel' : ''}">` +
      (s.media
        ? `<span class="code mthumb"${s.media.thumb ? ` style="background-image:url('${s.media.thumb}')"` : ''}>${s.media.thumb ? '' : (/^audio/.test(s.media.type) ? '♫' : '▶')}</span><span class="t">${esc(s.title)}</span>` +
          `<span class="k mk">${mediaKind(s.media)}</span>` + (mm ? '<span class="mact"><button type="button" data-act="ren" title="Cambiar el nombre" aria-label="Cambiar el nombre">✎</button><button type="button" data-act="del" title="Borrar" aria-label="Borrar">🗑</button></span>' : '')
        : `<span class="code">${esc(markOf(s))}</span><span class="t">${esc(s.title)}</span>` +
          `<span class="k">${keyName(s, state.shifts[s.code] || 0)}</span>`) +
      (sel && state.sorting ? '<span class="drag-h" aria-label="Arrastrar para ordenar">≡</span>' : '') + '</a></li>').join('') ||
      `<li class="empty">${mm ? (MEDIA.length ? 'No hay archivos que coincidan.' : 'Todavía no hay archivos multimedia.') : sel ? (selCodes().length ? 'No hay canciones seleccionadas que coincidan.' : 'La selección está vacía. Desliza una canción a la derecha para añadirla.')
        : state.letter ? 'No hay canciones que empiecen por esa letra aquí.'
        : state.category && !state.query ? 'Esta colección está vacía. Abre una canción y pulsa «🏷 Colecciones» para añadirla.'
        : 'No hay canciones que coincidan.'}</li>`) + addPill;
    const ab = $('addSongBtn');
    if (ab) ab.onclick = () => openNewSong();
    if (window.Media && window.Media.bindList) window.Media.bindList(list);
  }
  function setMediaMode(on) {
    state.mediaMode = !!on;
    store.set('mediaMode', state.mediaMode);
    if (state.tab === 'sel') { state.tab = 'all'; store.set('tab', 'all'); state.sorting = false; }
    renderList();
    $('sidebar').scrollTop = 0;
  }
  $('mediaBtn').onclick = () => setMediaMode(!state.mediaMode);
  $('songCode').onclick = editMark;
  $('songAuthor').onclick = editAuthor;
  $('songAuthor').onkeydown = (e) => { if (e.key === 'Enter' && e.target === $('songAuthor')) editAuthor(); };
  function renderSortBtn() {
    const b = $('sortBtn');
    b.innerHTML = state.sort === 'name' ? '<b>A</b>–Z' : '<b>01</b>';
    b.title = state.sort === 'name' ? 'Ordenadas por nombre (pulsa para ordenar por marcador)' : 'Ordenadas por marcador (pulsa para ordenar por nombre)';
  }
  $('sortBtn').onclick = () => {
    state.sort = state.sort === 'name' ? 'mark' : 'name';
    store.set('sort', state.sort);
    renderSortBtn(); renderList();
    if (state.current) { const ls = navList(state.current); updatePager(ls, ls.indexOf(state.current)); }
  };
  renderSortBtn();
  $('mediaBar').onclick = () => setMediaMode(!state.mediaMode);
  // reproducción del multimedia (la deciden el líder o Letras; la sigue la pantalla completa)
  function setMState(p, fromSync) {
    const n = Object.assign({}, state.ms, p);
    n.vol = Math.max(0, Math.min(1, +n.vol || 0)); n.pos = Math.max(0, +n.pos || 0);
    if (!fromSync) n.t = Date.now();
    if (fromSync && (+p.t || 0) <= state.ms.t) return;
    state.ms = n;
    notifyView();
    if (!fromSync) notify('media');
  }
  const msPos = (ms) => {
    ms = ms || state.ms;
    let p = ms.pos + (ms.play ? (Date.now() - ms.at) / 1000 : 0);
    const m = MEDIA.find((x) => x.id === ms.id);
    if (m && m.dur) p = ms.loop ? p % m.dur : Math.min(p, m.dur);
    return p;
  };

  // ---------- Canción ----------
  const isLabelLine = (line) => line.trim().length < 40 &&
    /^\s*(\(.*\)|(CORO|VERSO|PUENTE|INTRO|ESTRIBILLO|CEJILLA)\b.*)\s*$/i.test(line);

  // Una estrofa entera entre corchetes [ … ] se proyecta en modo Cita (los corchetes no se ven).
  // Los corchetes dentro de una línea (p. ej. repeticiones «[te vengo a ofrecer]») no cuentan.
  const citaLines = (s, i) => (s && s.paras[i] ? s.paras[i].filter((k) => !s.chordFlags[k] && s.lines[k].trim() && !isLabelLine(s.lines[k])) : []);
  const paraCita = (s, i) => {
    const L = citaLines(s, i);
    return L.length > 0 && /^\s*\[/.test(s.lines[L[0]]) && /\]\s*$/.test(s.lines[L[L.length - 1]]);
  };
  // quita el «[» del principio y el «]» del final de una estrofa Cita
  function citaStrip(s, i, k, text, keepWidth) {
    if (!paraCita(s, i)) return text;
    const L = citaLines(s, i);
    if (k === L[0]) text = text.replace(/^(\s*)\[/, keepWidth ? '$1 ' : '$1');
    if (k === L[L.length - 1]) text = text.replace(/\]\s*$/, '');
    return text;
  }
  // Solo la letra de cada párrafo (para el modo Pantalla)
  function lyricParas(s) {
    s = s || state.current;
    if (!s) return [];
    return s.paras.map((idxs, pi) => idxs
      .filter((i) => !s.chordFlags[i] && !isLabelLine(s.lines[i]))
      .map((i) => citaStrip(s, pi, i, s.lines[i]).replace(/\s+/g, ' ').trim())
      .filter(Boolean));
  }

  const viewListeners = [];
  const notifyView = () => viewListeners.forEach((fn) => { try { fn(); } catch (e) { /* nada */ } });

  function renderSheet() {
    const s = state.current;
    if (!s) return;
    if (s.media) {
      // una sola «estrofa»: la vista previa; al tocarla se proyecta
      state.paraCount = 1;
      $('sheet').innerHTML = `<div class="para media-para${state.para === 0 ? ' sel' : ''}" data-i="0" tabindex="0"><div class="mv-prev" id="mvPrev"></div>` +
        `<div class="mv-hint">${state.para === 0 ? '● En la pantalla completa' : 'Toca para proyectarlo en la pantalla completa'}</div></div><div class="mv-ctl" id="mvCtl"></div>`;
      $('sheet').style.fontSize = '';
      if (window.Media) window.Media.renderView(s.media);
      notifyView();
      return;
    }
    const shift = state.shifts[s.code] || 0;
    const flats = s.key ? C.prefersFlats(s.key.semi + shift, s.key.minor) : false;
    // Párrafos fijos (bloques separados por líneas en blanco), iguales con o sin acordes
    const paras = s.paras.map((idxs, pi) => {
      const out = [];
      idxs.forEach((i, k) => {
        const line = s.lines[i];
        if (s.chordFlags[i]) {
          if (state.lyricsOnly) return;
          const groups = C.transposeLine(line, shift, flats, state.notation);
          // acordes encima de una línea de letra: van pegados a su sílaba (así pueden saltar de línea juntos)
          const nx = idxs[k + 1];
          if (nx !== undefined && !s.chordFlags[nx] && s.lines[nx].trim() && !isLabelLine(s.lines[nx])) {
            out.push(pairHtml(groups, citaStrip(s, pi, nx, s.lines[nx], true)));
            out.skip = nx;
            return;
          }
          out.push('<span class="cl">' + groups.map((g) => g.chord ? `<b class="ch">${esc(g.text)}</b>` : esc(g.text)).join('') + '</span>');
        } else {
          if (out.skip === i) return;
          out.push(isLabelLine(line) ? `<span class="lbl">${esc(line)}</span>` : esc(citaStrip(s, pi, i, line)));
        }
      });
      if (!out.length) out.push('<span class="lbl">♪</span>');
      return out;
    });
    state.paraCount = paras.length;
    if (state.para !== null && state.para >= paras.length) state.para = null;
    $('sheet').innerHTML = paras.map((p, i) =>
      `<div class="para${i === state.para ? ' sel' : ''}${paraCita(s, i) ? ' cita' : ''}" data-i="${i}" tabindex="0">${p.join('\n')}</div>`).join('');
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
    state.sub = 0;
    // proyectar un archivo multimedia: empieza parado al principio (si no era el que ya estaba)
    if (i === 0 && state.current && state.current.media && state.ms.id !== state.current.code && !fromSync) {
      setMState({ id: state.current.code, play: false, pos: 0, at: Date.now(), loop: false });
    }
    $('sheet').querySelectorAll('.para').forEach((el) => el.classList.toggle('sel', +el.dataset.i === i));
    if (state.current && state.current.media) { const h = $('sheet').querySelector('.mv-hint'); if (h) h.textContent = i === 0 ? '● En la pantalla completa' : 'Toca para proyectarlo en la pantalla completa'; }
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

  // ---------- Presentación en la pantalla completa: tamaño y modo (Canción / Cita) ----------
  const presNorm = (p) => ({ scale: Math.max(0.5, Math.min(2, Math.round((+(p && p.scale) || 1) * 10) / 10)), mode: p && p.mode === 'cita' ? 'cita' : 'song' });
  state.pres = presNorm(store.get('pres', {}));
  function setPres(p, fromSync) {
    const n = presNorm(Object.assign({}, state.pres, p));
    if (n.scale === state.pres.scale && n.mode === state.pres.mode) return;
    state.pres = n;
    store.set('pres', n);
    notifyView();
    if (!fromSync) notify('pres');
  }

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

  function updatePager(ls, li) {
    const prev = li >= 0 ? ls[li - 1] : null, next = li >= 0 ? ls[li + 1] : null;
    $('prevLink').style.visibility = prev ? 'visible' : 'hidden';
    $('nextLink').style.visibility = next ? 'visible' : 'hidden';
    if (prev) { $('prevLink').href = '#' + prev.code; $('prevLink').textContent = '← ' + prev.title; }
    if (next) { $('nextLink').href = '#' + next.code; $('nextLink').textContent = next.title + ' →'; }
  }
  function showSong(code) {
    const s = findItem(code);
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
    document.body.classList.toggle('media-open', !!s.media);
    if (s.media) { showMediaItem(s); return; }
    $('songCode').textContent = markOf(s);
    $('songCode').title = 'Pulsa para cambiar el marcador';
    renderAuthor(s);
    $('songTitle').textContent = s.title;
    renderNote(s);
    $('songTags').innerHTML = s.categories.map((c) => `<span class="tag">${esc(catLabel(c))}</span>`).join('') +
      '<button class="tag tag-btn" id="collBtn" title="Añadir o quitar esta canción de colecciones">🏷 Colecciones</button>' +
      '<button class="tag tag-btn" id="listsBtn" title="Cancioneros en los que aparece esta canción">📚 Cancioneros</button>' +
      (s.edited ? '<span class="tag edited" title="Se está guardando en Drive; si no hay conexión, se subirá en cuanto vuelva">⏳ Guardando en Drive…</span>' : '');
    document.title = s.title + ' · Cancionero';
    if (!inL(s, state.list)) setList(listsOf(s)[0], true);
    $('listsBtn').onclick = (e) => { e.stopPropagation(); openListsMenu(s, e.currentTarget); };
    const ls = navList(s);
    updatePager(ls, ls.indexOf(s));
    renderSheet();
    renderList();
    notifyView();
    $('content').scrollTop = 0;
    const a = document.querySelector('.song-list a.active');
    if (a && a.scrollIntoView) a.scrollIntoView({ block: 'nearest' });
  }

  // ---------- Un archivo multimedia abierto ----------
  function showMediaItem(s) {
    const m = s.media;
    $('songCode').textContent = mediaKind(m);
    renderAuthor(null);
    $('songCode').title = '';
    $('songTitle').textContent = s.title;
    $('songNote').hidden = true;
    $('songTags').innerHTML = '';
    document.title = s.title + ' · Cancionero';
    const ls = navList(s);
    updatePager(ls, ls.indexOf(s));
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

  // ---------- Añadir una canción desde la web (con o sin acordes) ----------
  function nextCode(list) {
    const ls = SONGS.filter((x) => x.list === list);
    const last = ls[ls.length - 1];
    const m = last && /^([A-Za-z]+)(\d+)$/.exec(last.code);
    const prefix = m ? m[1] : (list.slice(0, 2).toUpperCase());
    const width = m ? m[2].length : 2;
    let n = 0;
    SONGS.forEach((x) => { const k = new RegExp('^' + prefix + '(\\d+)$').exec(x.code); if (k) n = Math.max(n, +k[1]); });
    let code;
    do { n++; code = prefix + String(n).padStart(width, '0'); } while (SONGS.some((x) => x.code === code));
    return code;
  }
  function createSong(title, text, cats, author) {
    const list = state.list;
    let lines = text.replace(/\r/g, '').replace(/\t/g, '    ').split('\n').map((l) => l.replace(/\s+$/, ''));
    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    lines = lines.filter((l, i) => l.trim() || (i > 0 && lines[i - 1].trim()));
    if (!lines.length) lines = [''];
    const code = nextCode(list);
    const n = { code, title: title.trim().slice(0, 200), lines, categories: cats.slice(), list };
    if (cleanAuthor(author)) n.author = cleanAuthor(author);
    newSongs[code] = n; store.set('newSongs', newSongs);
    const addToSel = state.tab === 'sel';
    const s = { code, title: n.title, lines: lines.slice(), variants: [], categories: cats.slice(), list, baseCats: cats.slice() };
    if (n.author) s.author = n.author;
    ORIG[code] = { title: n.title, lines: lines.slice() };
    SONGS.push(s); s.index = SONGS.length - 1; load(s); applyCats(s); applyMemb(s);
    if (addToSel) setSelection(selCodes(list).concat(code), list);
    localChanged();
    renderLists(); renderList();
    location.hash = '#' + code;
    return code;
  }
  const nsDlg = document.createElement('div');
  nsDlg.id = 'newSongDlg'; nsDlg.className = 'coll-dlg'; nsDlg.hidden = true;
  nsDlg.setAttribute('role', 'dialog'); nsDlg.setAttribute('aria-modal', 'true');
  nsDlg.innerHTML = `
    <div class="coll-card ns-card">
      <div class="ed-top"><h2>Añadir una canción</h2><button class="icon-btn" id="nsClose" aria-label="Cerrar">✕</button></div>
      <p class="muted small-note" id="nsWhere"></p>
      <label class="field">Título <input id="nsTitle" maxlength="200" autocomplete="off"></label>
      <label class="field">Autor (opcional) <input id="nsAuthor" maxlength="120" autocomplete="off" placeholder="Letra y música"></label>
      <label class="field">Letra
        <textarea id="nsText" rows="12" spellcheck="false" autocapitalize="off" placeholder="Escribe o pega la letra.&#10;&#10;Una línea en blanco separa los párrafos."></textarea>
      </label>
      <p class="muted small-note">Los acordes son opcionales: escríbelos en la línea de encima de la letra, sobre la sílaba (DO RE MI… o C D E…). Después podrás ajustarlos con ✎ Editar.</p>
      <div class="ns-cats" id="nsCats"></div>
      <p class="coll-msg" id="nsMsg"></p>
      <div class="ed-foot"><span class="ed-spacer"></span><button class="pill" id="nsCancel">Cancelar</button><button class="pill primary" id="nsSave">Añadir</button></div>
    </div>`;
  document.body.appendChild(nsDlg);
  function openNewSong() {
    $('nsWhere').textContent = 'Se añadirá al ' + listById(state.list).name + ' y se guardará en Drive para todos.';
    $('nsTitle').value = ''; $('nsAuthor').value = ''; $('nsText').value = ''; $('nsMsg').textContent = '';
    $('nsCats').innerHTML = '<span class="sl">Colecciones</span>' + catsFor(state.list).map((c) =>
      `<label class="coll-item"><input type="checkbox" value="${esc(c)}"${c === state.category ? ' checked' : ''}> <span>${esc(catLabel(c))}</span></label>`).join('');
    nsDlg.hidden = false;
    setTimeout(() => $('nsTitle').focus(), 30);
  }
  const closeNs = () => { nsDlg.hidden = true; };
  $('nsClose').onclick = closeNs; $('nsCancel').onclick = closeNs;
  nsDlg.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeNs(); e.stopPropagation(); });
  $('nsSave').onclick = () => {
    const t = $('nsTitle').value.trim(), txt = $('nsText').value;
    if (!t) { $('nsMsg').textContent = 'Escribe el título.'; $('nsTitle').focus(); return; }
    if (!txt.trim()) { $('nsMsg').textContent = 'Escribe la letra.'; $('nsText').focus(); return; }
    const cats = [...$('nsCats').querySelectorAll('input:checked')].map((x) => x.value);
    closeNs();
    createSong(t, txt, cats, $('nsAuthor').value);
  };

  // ---------- Selección: pestañas, deslizar a la derecha y ordenar arrastrando ----------
  $('tabSel').onclick = () => setTab('sel');
  $('tabAll').onclick = () => setTab('all');
  $('selSort').onclick = () => { state.sorting = !state.sorting; renderList(); };
  (function () {
    const list = $('songList'), sb = $('sidebar');
    let g = null, suppress = false, raf = 0;
    const SWIPE = 64;
    const quiet = () => { suppress = true; setTimeout(() => { suppress = false; }, 350); };
    const frame = (fn) => { cancelAnimationFrame(raf); raf = requestAnimationFrame(fn); };
    // posición natural (sin el desplazamiento del arrastre) de una pastilla
    const natTop = (li) => { const t = li.style.transform; li.style.transform = ''; const y = li.getBoundingClientRect().top; li.style.transform = t; return y; };

    list.addEventListener('pointerdown', (e) => {
      const a = e.target.closest('a');
      if (!a || e.button > 0 || g) return;
      stopFling();
      const li = a.parentElement;
      if (e.target.closest('.drag-h') || state.sorting) {
        // ordenar: la pastilla sigue al dedo y las demás se apartan
        g = { mode: 'sort', li, id: e.pointerId, y: e.clientY, top: natTop(li) };
        g.y0 = e.clientY;
        li.classList.add('dragging'); sb.classList.add('gesturing');
        list.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }
      g = { mode: 'maybe', a, li, x0: e.clientX, y0: e.clientY, id: e.pointerId, touch: e.pointerType !== 'mouse', st0: sb.scrollTop, v: 0, t: performance.now(), ly: e.clientY };
    });

    list.addEventListener('pointermove', (e) => {
      if (!g || e.pointerId !== g.id) return;
      if (g.mode === 'sort') {
        e.preventDefault();
        g.y = e.clientY;
        frame(sortStep);
        return;
      }
      const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
      if (g.mode === 'maybe') {
        if (Math.hypot(dx, dy) < 7) return;
        // cuenta como deslizar aunque el gesto vaya bastante inclinado (hasta ~55°)
        if (Math.abs(dx) >= Math.abs(dy) * 0.7) {
          g.mode = 'swipe';
          list.setPointerCapture(e.pointerId);
          g.li.dataset.act = inSel(g.li.dataset.code) ? '✕ Quitar' : '● Seleccionar';
          g.li.classList.add('swiping'); sb.classList.add('gesturing');
        } else if (g.touch) {
          g.mode = 'scroll'; // desplazamiento vertical de la lista (lo hace la web, con inercia)
          list.setPointerCapture(e.pointerId);
          sb.classList.add('scrolling'); // mientras se desplaza, las pastillas son solo texto (no botones)
        } else { g = null; return; }
      }
      if (g.mode === 'scroll') {
        e.preventDefault();
        const now = performance.now(), dt = Math.max(1, now - g.t);
        g.v = 0.8 * ((e.clientY - g.ly) / dt) + 0.2 * g.v; g.t = now; g.ly = e.clientY;
        sb.scrollTop = g.st0 - dy;
        return;
      }
      if (g.mode === 'swipe') {
        e.preventDefault();
        const d = dx > 0 ? Math.min(dx, 140) : Math.max(dx, -140); // a la derecha (o a la izquierda)
        const ok = Math.abs(d) >= SWIPE;
        frame(() => {
          if (!g || g.mode !== 'swipe') return;
          g.a.style.transform = 'translateX(' + d + 'px)';
          g.li.classList.toggle('swipe-ok', ok);
          g.li.classList.toggle('to-left', d < 0);
        });
      }
    });

    function sortStep() {
      if (!g || g.mode !== 'sort') return;
      const li = g.li;
      let dy = g.y - g.y0;
      li.style.transform = 'translateY(' + dy + 'px)';
      const mid = g.top + dy + li.offsetHeight / 2;
      const prev = li.previousElementSibling, next = li.nextElementSibling;
      const center = (x) => { const r = x.getBoundingClientRect(); return r.top + r.height / 2; };
      if (prev && prev.dataset.code && mid < center(prev)) {
        const vis = g.top + dy; list.insertBefore(li, prev);
        g.top = natTop(li); g.y0 = g.y - (vis - g.top); li.style.transform = 'translateY(' + (vis - g.top) + 'px)';
      } else if (next && next.dataset.code && mid > center(next)) {
        const vis = g.top + dy; list.insertBefore(next, li);
        g.top = natTop(li); g.y0 = g.y - (vis - g.top); li.style.transform = 'translateY(' + (vis - g.top) + 'px)';
      }
      // desplaza la lista si se arrastra cerca de los bordes
      const r = sb.getBoundingClientRect();
      if (g.y > r.bottom - 50) { sb.scrollTop += 10; frame(sortStep); }
      else if (g.y < r.top + 160) { sb.scrollTop -= 10; frame(sortStep); }
    }

    function finish(e, cancel) {
      if (!g || (e && e.pointerId !== g.id)) return;
      const cur = g; g = null;
      cancelAnimationFrame(raf);
      sb.classList.remove('gesturing');
      if (cur.mode === 'scroll') {
        quiet();
        if (!cancel && performance.now() - cur.t < 80) fling(-cur.v * 16);
        else sb.classList.remove('scrolling');
        return;
      }
      if (cur.mode === 'swipe') {
        quiet();
        const dx = e ? e.clientX - cur.x0 : 0;
        cur.a.style.transform = '';
        cur.li.classList.remove('swiping', 'swipe-ok', 'to-left');
        if (!cancel && Math.abs(dx) >= SWIPE) toggleSel(cur.li.dataset.code);
        else if (pendingRender) renderList();
      } else if (cur.mode === 'sort') {
        quiet();
        cur.li.classList.remove('dragging'); cur.li.style.transform = '';
        // el nuevo orden es el de las pastillas en pantalla (sin repetir), más las seleccionadas que no se ven
        const shown = [...list.querySelectorAll('li[data-code]')].map((x) => x.dataset.code);
        const order = shown.filter((c, i) => shown.indexOf(c) === i && inSel(c));
        const rest = selCodes().filter((c) => !order.includes(c));
        setSelection(order.concat(rest));
      }
    }
    list.addEventListener('pointerup', (e) => finish(e, false));
    list.addEventListener('pointercancel', (e) => finish(e, true));
    // solo cuenta si la lista pierde el agarre (no cuando la pastilla se lo cede a la lista)
    list.addEventListener('lostpointercapture', (e) => { if (e.target === list && g && g.mode !== 'maybe' && e.pointerId === g.id) setTimeout(() => finish(e, true), 0); });
    // tras deslizar u ordenar no se abre la canción
    list.addEventListener('click', (e) => { if (suppress || state.sorting) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
    // inercia al soltar después de desplazar la lista
    let flingRaf = 0;
    function fling(v) {
      stopFling();
      sb.classList.add('scrolling');
      const stepF = () => {
        if (Math.abs(v) < 0.4) { sb.classList.remove('scrolling'); return; }
        sb.scrollTop += v; v *= 0.95;
        flingRaf = requestAnimationFrame(stepF);
      };
      flingRaf = requestAnimationFrame(stepF);
    }
    function stopFling() { cancelAnimationFrame(flingRaf); sb.classList.remove('scrolling'); }
    window.SelGesture = { active: () => !!g && g.mode !== 'maybe' && g.mode !== 'scroll' };
  })();

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
      return { song: s ? s.code : '', shift: s ? (state.shifts[s.code] || 0) : 0, para: s ? state.para : null, sub: state.sub, blank: state.blank };
    },
    apply({ song, shift, para, sub, blank }, opts) {
      if (typeof blank === 'boolean') setBlank(blank, true);
      const cur = state.current ? state.current.code : '';
      if (typeof song === 'string' && song !== cur) {
        if (song && !findItem(song)) return;
        syncHash = song;
        location.hash = song ? '#' + song : '';
      }
      const target = song ? findItem(song) : null;
      if (target && Number.isInteger(shift) && shift >= -11 && shift <= 11 &&
          signed(shift) !== signed(state.shifts[target.code] || 0)) {
        if (signed(shift)) state.shifts[target.code] = signed(shift); else delete state.shifts[target.code];
        if (state.current === target) { renderSheet(); renderList(); }
      }
      if (target && (para === null || Number.isInteger(para)) && !(opts && opts.noPara)) {
        // tras cambiar de canción, esperar a que se pinte
        const go = () => {
          if (state.current !== target) return;
          if (para !== state.para) selectPara(para, true);
          if (Number.isInteger(sub) && sub >= 0 && sub !== state.sub) { state.sub = sub; notifyView(); }
        };
        if (state.current === target) go(); else setTimeout(go, 120);
      }
    },
    onChange(fn) { listeners.push(fn); },
    blank: () => state.blank,
    setBlank: (b) => setBlank(b),
    pres: () => Object.assign({}, state.pres),
    setPres: (p, fromSync) => setPres(p, fromSync),
    refit: fitSheet,
    // Para el modo Pantalla (screen.js)
    lyricParas: () => lyricParas(),
    paraCita: (i) => paraCita(state.current, i === undefined ? state.para : i),
    title: () => (state.current ? state.current.title : ''),
    // ---- Multimedia ----
    media: () => MEDIA.slice(),
    mediaCur: () => (state.current && state.current.media ? state.current.media : null),
    mediaById: (id) => MEDIA.find((m) => m.id === id) || null,
    mstate: () => Object.assign({}, state.ms),
    setMState: (p, fromSync) => setMState(p, fromSync),
    msPos: (ms) => msPos(ms),
    mediaMode: () => state.mediaMode,
    setMediaMode: (on) => setMediaMode(on),
    open: (code) => { location.hash = '#' + code; },
    para: () => state.para,
    paraCount: () => state.paraCount,
    selectPara: (i) => selectPara(i),
    sub: () => state.sub,
    maxChars: () => state.maxChars,
    // cambia el máximo de caracteres; persist = guardarlo en Drive (lo hace el líder)
    setMaxChars(n, persist) {
      n = Math.max(0, Math.min(2000, Math.round(+n || 0)));
      if (n === state.maxChars && !persist) return;
      const changed = n !== state.maxChars;
      state.maxChars = n;
      if (persist) { store.set('settingsPending', { maxChars: n }); localChanged(); }
      if (!changed) return;
      SONGS.forEach(load);
      if (state.current) { state.para = null; state.sub = 0; renderSheet(); }
      notifyView();
    },
    setSub(n, fromSync) {
      if (!Number.isInteger(n) || n < 0 || n === state.sub) return;
      state.sub = n;
      notifyView();
      if (!fromSync) notify('para');
    },
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
      const src = s.srcLines || s.lines;
      const text = src.map((line) => C.isChordLine(line) && (shift || state.notation !== 'latin')
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
    toggleSel: (code) => toggleSel(code),
    selection: (list) => selCodes(list),
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
    // ---- Edición de colecciones: cada colección y los cancioneros en los que aparece ----
    catMatrix: () => {
      const names = [];
      LISTS.forEach((l) => (l.cats || []).forEach((c) => { if (!names.includes(c)) names.push(c); }));
      customCats().forEach((c) => { if (!names.includes(c)) names.push(c); });
      return names.map((c) => ({ name: c, label: catLabel(c), custom: customCats().includes(c),
        lists: customCats().includes(c) ? LISTS.map((l) => l.id) : LISTS.filter((l) => (l.cats || []).includes(c)).map((l) => l.id),
        count: SONGS.filter((s) => s.categories.includes(c)).length }));
    },
    listsInfo: () => LISTS.map((l) => ({ id: l.id, name: l.name })),
    collections: () => (state.current ? listsOf(state.current) : [state.list]).flatMap((l) => catsFor(l)).filter((c, i, a) => a.indexOf(c) === i).map((c) => ({ name: c, label: catLabel(c), custom: !CATS.includes(c), count: SONGS.filter((s) => s.categories.includes(c)).length })),
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
      const ls = navList(state.current);
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
      out.sel = selLocal ? JSON.parse(JSON.stringify(selLocal)) : null; // { idLista: [códigos] }
      out.newSongs = Object.values(newSongs).map((x) => JSON.parse(JSON.stringify(x)));
      out.settings = store.get('settingsPending', null);
      out.lists = Object.entries(memb).map(([code, lists]) => ({ code, lists: lists.slice() }));
      out.marks = Object.entries(marks).map(([code, mark]) => ({ code, mark }));
      out.authors = Object.entries(authors).map(([code, author]) => ({ code, author }));
      return out;
    },
    // El cancionero tal como viene de la fuente (sin cambios locales), para subirlo la primera vez
    baseDoc() {
      return {
        lists: JSON.parse(JSON.stringify(LISTS)),
        customCats: baseCustom.slice(),
        selections: JSON.parse(JSON.stringify(baseSel)),
        songs: SONGS.map((s) => {
          const o = { code: s.code, title: ORIG[s.code].title, lines: ORIG[s.code].lines.slice(), variants: s.variants || [], categories: (s.baseCats || []).slice(), list: s.list };
          if (s.baseLists) o.lists = s.baseLists.slice();
          if (s.mark) o.mark = s.mark;
          if (s.author) o.author = s.author;
          if (s.comment) o.comment = s.comment;
          return o;
        })
      };
    },
    // Sustituye el cancionero base por una versión nueva (de Drive) sin recargar la página
    loadDoc(doc) {
      if (!doc || !Array.isArray(doc.songs) || !Array.isArray(doc.lists) || !doc.songs.length) return;
      const cur = state.current;
      const sig = (s) => s && JSON.stringify([s.title, s.lines, s.categories, s.comment || '', s.list, s.lists, s.mark, s.author, s.edited]);
      const before = sig(cur);
      LISTS.splice(0, LISTS.length, ...doc.lists);
      CATS = LISTS.flatMap((l) => l.cats || []);
      UPPER_CATS = listById('meriba').cats || [];
      baseCustom = Array.isArray(doc.customCats) ? doc.customCats.slice() : [];
      setBaseSel(doc.selections, doc.selection);
      MEDIA = Array.isArray(doc.media) ? doc.media.slice() : [];
      Object.keys(mediaObjs).forEach((id) => { if (!MEDIA.some((m) => m.id === id)) delete mediaObjs[id]; });
      MEDIA.forEach(mediaObj);
      // ajustes comunes de Drive (si no hay un cambio propio pendiente)
      const pend = store.get('settingsPending', null), ds = doc.settings || {};
      if (pend && pend.maxChars === (+ds.maxChars || 0)) store.set('settingsPending', null);
      else if (!pend && (+ds.maxChars || 0) !== state.maxChars) state.maxChars = +ds.maxChars || 0;
      const byCode = {};
      SONGS.forEach((s) => { byCode[s.code] = s; });
      const next = doc.songs.filter((d) => d && typeof d.code === 'string' && Array.isArray(d.lines)).map((d) => {
        const s = byCode[d.code] || { code: d.code };
        s.variants = d.variants || [];
        s.list = d.list || LISTS[0].id;
        s.baseLists = Array.isArray(d.lists) && d.lists.length ? d.lists.slice() : null;
        if (d.mark) s.mark = d.mark; else delete s.mark;
        if (d.author) s.author = d.author; else delete s.author;
        if (authors[d.code] !== undefined && authors[d.code] === (d.author || '')) delete authors[d.code];
        if (marks[d.code] !== undefined && (marks[d.code] || d.code) === (d.mark || d.code)) delete marks[d.code];
        // el cambio propio ya está en Drive: deja de estar pendiente
        if (memb[d.code] && JSON.stringify(memb[d.code]) === JSON.stringify(s.baseLists)) delete memb[d.code];
        s.baseCats = (d.categories || []).slice();
        if (d.comment) s.comment = d.comment; else delete s.comment;
        ORIG[d.code] = { title: d.title, lines: d.lines.slice() };
        return s;
      });
      // canciones nuevas ya guardadas en Drive dejan de estar pendientes; las demás se mantienen
      const inDoc = new Set(next.map((x) => x.code));
      Object.keys(newSongs).forEach((code) => {
        if (inDoc.has(code)) { delete newSongs[code]; return; }
        const n = newSongs[code], sx = byCode[code] || { code };
        sx.variants = []; sx.list = n.list; if (n.author) sx.author = n.author; sx.baseCats = n.categories.slice(); ORIG[code] = { title: n.title, lines: n.lines.slice() };
        next.push(sx);
      });
      store.set('newSongs', newSongs);
      SONGS.splice(0, SONGS.length, ...next);
      reconcile();
      store.set('songLists', memb);
      store.set('marks', marks);
      store.set('authors', authors);
      SONGS.forEach((s, i) => { s.index = i; load(s); applyCats(s); applyMemb(s); });
      if (state.category && !allCats().includes(state.category)) state.category = null;
      renderLists(); renderChips(); renderList();
      if (!cur) { const h = decodeURIComponent(location.hash.replace(/^#\/?/, '')); if (h && SONGS.some((x) => x.code === h)) showSong(h); }
      else if (cur.media) { if (!MEDIA.some((m) => m.id === cur.code)) location.hash = ''; else { cur.title = cur.media.name; showSong(cur.code); } }
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

  // Temas: claro → oscuro → color (alegre, con brillos de neón) → claro…
  const THEME_ICON = { light: '☀︎', dark: '☾', color: '✦' };
  function applyTheme(t) {
    document.documentElement.dataset.theme = t;
    $('themeBtn').textContent = THEME_ICON[t] || '☾';
    $('themeBtn').title = t === 'color' ? 'Tema: color' : t === 'dark' ? 'Tema: noche' : 'Tema: día';
    if (t === 'color' && !document.getElementById('fontColor')) {
      const l = document.createElement('link');
      l.id = 'fontColor'; l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=Nunito:wght@500;700;800;900&display=swap';
      document.head.appendChild(l);
    }
    if (window.App && window.App.refit) setTimeout(() => window.App.refit(), 300);
  }
  const theme = store.get('theme', null) ||
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  applyTheme(theme);
  $('themeBtn').onclick = () => {
    const cur = document.documentElement.dataset.theme || 'light';
    const nx = cur === 'light' ? 'dark' : cur === 'dark' ? 'color' : 'light';
    applyTheme(nx);
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

  document.body.dataset.list = state.list;
  renderLists();
  updateNotationBtn();
  renderChips();
  window.addEventListener('hashchange', route);
  route();
})();
