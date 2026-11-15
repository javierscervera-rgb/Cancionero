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
    mono: store.get('mono', false),
    shifts: store.get('shifts', {}),
    category: null,
    list: null,
    para: null,
    paraCount: 0,
    query: '',
    current: null
  };

  // ---------- Pre-proceso ----------
  // Listas de reproducción (cada cancionero es una lista con sus propias colecciones)
  const LISTS = (window.LISTS && window.LISTS.length) ? window.LISTS
    : [{ id: 'meriba', name: 'Cancionero Meribá', cats: ['ESPÍRITU SANTO', 'ALABANZA', 'ADORACIÓN', 'BLESSING', 'SANACIÓN', 'VIRGEN MARÍA'] }];
  SONGS.forEach((s) => { if (!s.list) s.list = LISTS[0].id; });
  const listById = (id) => LISTS.find((l) => l.id === id) || LISTS[0];
  const CATS = LISTS.flatMap((l) => l.cats || []); // colecciones de todos los cancioneros
  const UPPER_CATS = listById('meriba').cats || [];
  // Colecciones: las del cancionero + las creadas en este dispositivo; pertenencia editable por canción
  let coll = store.get('collections', { custom: [], songs: {} });
  if (!coll || !Array.isArray(coll.custom) || typeof coll.songs !== 'object') coll = { custom: [], songs: {} };
  const allCats = () => CATS.concat(coll.custom.filter((c) => !CATS.includes(c)));
  const catsFor = (listId) => (listById(listId).cats || []).concat(coll.custom.filter((c) => !CATS.includes(c)));
  const catLabel = (c) => UPPER_CATS.includes(c) ? c.charAt(0) + c.slice(1).toLowerCase() : c;
  function applyCats(s) {
    if (!s.baseCats) s.baseCats = (s.categories || []).slice();
    const own = coll.songs[s.code];
    s.categories = (own ? own : s.baseCats).filter((c) => allCats().includes(c));
  }
  const saveColl = () => store.set('collections', coll);
  const cleanCat = (c) => (typeof c === 'string' ? c : '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
  const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  // Contenido original, ediciones guardadas en este dispositivo y versiones temporales del emisor
  const ORIG = {};
  SONGS.forEach((s) => { ORIG[s.code] = { title: s.title, lines: s.lines.slice() }; });
  let edits = store.get('edits', {});
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
    renderChips();
    renderList();
    if (state.current && matchMedia('(max-width: 820px)').matches) location.hash = '';
    else $('sidebar').scrollTop = 0;
    const on = document.querySelector('#chips .chip.on');
    if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }

  // ---------- Listas de reproducción (lateral izquierdo) ----------
  function setList(id, keepSong) {
    id = listById(id).id;
    const changed = id !== state.list;
    state.list = id;
    store.set('list', id);
    if (changed) state.category = null;
    renderLists(); renderChips(); renderList();
    if (changed && !keepSong && state.current && state.current.list !== id) location.hash = '';
  }
  function renderLists() {
    const box = $('lists');
    if (!box) return;
    box.innerHTML = LISTS.map((l) => `<button class="list-item${l.id === state.list ? ' on' : ''}" data-list="${l.id}" aria-pressed="${l.id === state.list}">
        <span class="list-ico">♫</span><span class="list-txt"><span class="list-name">${esc(l.name)}</span>${l.sub ? `<span class="list-sub">${esc(l.sub)}</span>` : ''}</span>
        <span class="list-n">${listSongs(l.id).length}</span></button>`).join('');
    box.querySelectorAll('[data-list]').forEach((b) => { b.onclick = () => setList(b.dataset.list); });
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

  function filtered() {
    const q = fold(state.query.trim());
    return SONGS.filter((s) =>
      s.list === state.list &&
      (!state.category || s.categories.includes(state.category)) &&
      (!q || s.searchText.includes(q) || s.code.toLowerCase().includes(q)));
  }

  function renderList() {
    const list = $('songList');
    const items = filtered();
    list.innerHTML = items.map((s) =>
      `<li><a href="#${s.code}" class="${state.current === s ? 'active' : ''}">` +
      `<span class="code">${s.code}</span><span class="t">${esc(s.title)}</span>` +
      `<span class="k">${keyName(s, state.shifts[s.code] || 0)}</span></a></li>`).join('') ||
      `<li class="empty">${state.category && !state.query ? 'Esta colección está vacía. Abre una canción y pulsa «🏷 Colecciones» para añadirla.' : 'No hay canciones que coincidan.'}</li>`;
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
      idxs.forEach((i) => {
        const line = s.lines[i];
        if (s.chordFlags[i]) {
          if (state.lyricsOnly) return;
          out.push('<span class="cl">' + C.transposeLine(line, shift, flats, state.notation)
            .map((g) => g.chord ? `<b class="ch">${esc(g.text)}</b>` : esc(g.text)).join('') + '</span>');
        } else {
          out.push(isLabelLine(line) ? `<span class="lbl">${esc(line)}</span>` : esc(line));
        }
      });
      if (!out.length) out.push('<span class="lbl">♪</span>');
      return out;
    });
    state.paraCount = paras.length;
    if (state.para !== null && state.para >= paras.length) state.para = null;
    $('sheet').innerHTML = paras.map((p, i) =>
      `<pre class="para${i === state.para ? ' sel' : ''}" data-i="${i}" tabindex="0">${p.join('\n')}</pre>`).join('');
    $('sheet').style.fontSize = state.font + 'px';
    $('sheet').classList.toggle('mono', state.mono);
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
    $('monoFont').setAttribute('aria-pressed', String(state.mono));

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
  function fitSheet() {
    const sh = $('sheet');
    if (!sh) return;
    sh.style.fontSize = state.font + 'px';
    if (!document.body.classList.contains('emitting') || $('song').hidden) return;
    let size = state.font;
    for (let i = 0; i < 4 && sh.scrollWidth > sh.clientWidth + 1 && size > 11; i++) {
      size = Math.max(11, Math.floor(size * sh.clientWidth / sh.scrollWidth * 10) / 10);
      sh.style.fontSize = size + 'px';
    }
  }
  window.addEventListener('resize', () => fitSheet());

  // ---------- Párrafos: seleccionar uno lo centra en la pantalla ----------
  function topOffset() {
    const t = document.querySelector('.top'), b = document.querySelector('.chipbar');
    return (t ? t.offsetHeight : 0) + (b ? b.offsetHeight : 0);
  }
  function centerPara(i, smooth) {
    const el = $('sheet').querySelector(`.para[data-i="${i}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect(), top = topOffset(), avail = window.innerHeight - top;
    let y = window.scrollY + r.top - top - Math.max(12, (avail - r.height) / 2);
    window.scrollTo({ top: Math.max(0, y), behavior: smooth === false ? 'auto' : 'smooth' });
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

  function showSong(code) {
    const s = SONGS.find((x) => x.code === code);
    document.body.classList.toggle('reading', !!s);
    $('toolbar').hidden = !s;
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
    $('songTags').innerHTML = s.categories.map((c) => `<span class="tag">${esc(catLabel(c))}</span>`).join('') +
      '<button class="tag tag-btn" id="collBtn" title="Añadir o quitar esta canción de colecciones">🏷 Colecciones</button>' +
      (s.edited ? '<span class="tag edited" title="Modificada en este dispositivo">✎ Editada</span>' : '') +
      (temp[s.code] ? '<span class="tag edited" title="Versión del emisor">↻ Versión del emisor</span>' : '');
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
    window.scrollTo(0, 0);
    const a = document.querySelector('.song-list a.active');
    if (a && a.scrollIntoView) a.scrollIntoView({ block: 'nearest' });
  }

  let syncHash = null; // hash que viene del emisor (no cuenta como navegación propia)
  function route() {
    const code = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
    showSong(code);
    const fromSync = syncHash !== null && syncHash === code;
    syncHash = null;
    if (!fromSync) notify('song');
  }

  // Interfaz para live.js
  window.App = {
    getState() {
      const s = state.current;
      return { song: s ? s.code : '', shift: s ? (state.shifts[s.code] || 0) : 0, para: s ? state.para : null };
    },
    apply({ song, shift, para }, opts) {
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
      load(s);
      if (state.current === s) showSong(code);
      renderList();
      notify('edit');
    },
    exportEdits: () => ({ formato: 'cancionero-meriba', version: 2, canciones: JSON.parse(JSON.stringify(edits)), colecciones: JSON.parse(JSON.stringify(coll)) }),
    hasChanges: () => Object.keys(edits).length > 0 || coll.custom.length > 0 || Object.keys(coll.songs).length > 0,
    importEdits(obj) {
      if (!obj || typeof obj !== 'object') return 0;
      let n = 0;
      if (obj.formato === 'cancionero-meriba' && obj.colecciones && Array.isArray(obj.colecciones.custom)) {
        obj.colecciones.custom.forEach((c) => { c = cleanCat(c); if (c && !allCats().includes(c)) coll.custom.push(c); });
        Object.entries(obj.colecciones.songs || {}).forEach(([code, list]) => {
          if (SONGS.some((x) => x.code === code) && Array.isArray(list)) { coll.songs[code] = list.filter((c) => allCats().includes(c)); n++; }
        });
        saveColl(); SONGS.forEach(applyCats); renderChips();
      }
      if (obj.formato === 'cancionero-meriba') obj = obj.canciones || {};
      Object.entries(obj).forEach(([code, v]) => {
        const s = SONGS.find((x) => x.code === code);
        if (!s || !v || typeof v.title !== 'string' || !Array.isArray(v.lines)) return;
        edits[code] = { title: v.title.slice(0, 200), lines: v.lines.filter((l) => typeof l === 'string').map((l) => l.slice(0, 400)).slice(0, 400) };
        load(s); n++;
      });
      store.set('edits', edits);
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
      coll.custom.push(name); saveColl(); renderChips();
      return { name };
    },
    deleteCollection(name) {
      const i = coll.custom.indexOf(name);
      if (i < 0) return;
      coll.custom.splice(i, 1);
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
    onView(fn) { viewListeners.push(fn); }
  };

  // ---------- Eventos ----------
  $('upBtn').onclick = () => setShift((state.shifts[state.current.code] || 0) + 1);
  $('downBtn').onclick = () => setShift((state.shifts[state.current.code] || 0) - 1);
  $('keySelect').onchange = (e) => setShift(+e.target.value);
  $('resetBtn').onclick = () => setShift(0);
  $('fontUp').onclick = () => { state.font = Math.min(30, state.font + 1); store.set('font', state.font); renderSheet(); };
  $('fontDown').onclick = () => { state.font = Math.max(11, state.font - 1); store.set('font', state.font); renderSheet(); };
  $('lyricsOnly').onclick = () => { state.lyricsOnly = !state.lyricsOnly; store.set('lyricsOnly', state.lyricsOnly); renderSheet(); };
  $('monoFont').onclick = () => { state.mono = !state.mono; store.set('mono', state.mono); renderSheet(); };

  // Engranaje: contraer / expandir la barra
  function setCollapsed(c) {
    $('toolbar').classList.toggle('collapsed', c);
    $('gearBtn').setAttribute('aria-expanded', String(!c));
    document.body.classList.toggle('tb-collapsed', c);
    store.set('tbCollapsed', c);
    fitSheet();
  }
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

  function updateNotationBtn() { $('notationBtn').textContent = state.notation === 'latin' ? 'DO RE MI' : 'C D E'; }
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
    if (e.key === '+' || e.key === '=') setShift((state.shifts[state.current.code] || 0) + 1);
    else if (e.key === '-') setShift((state.shifts[state.current.code] || 0) - 1);
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
