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
    query: '',
    current: null
  };

  // ---------- Pre-proceso ----------
  const CATS = ['ESPÍRITU SANTO', 'ALABANZA', 'ADORACIÓN', 'BLESSING', 'SANACIÓN', 'VIRGEN MARÍA'];
  const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  SONGS.forEach((s, i) => {
    s.index = i;
    s.key = C.detectKey(s.lines);
    s.chordFlags = s.lines.map(C.isChordLine);
    s.searchText = fold(s.title + ' ' + s.lines.filter((_, j) => !s.chordFlags[j]).join(' '));
    s.altShifts = [];
    (s.variants || []).forEach((v) => {
      const k = C.detectKey(v);
      if (k && s.key) {
        let d = ((k.semi - s.key.semi) % 12 + 12) % 12;
        if (d > 6) d -= 12;
        if (d !== 0 && !s.altShifts.includes(d)) s.altShifts.push(d);
      }
    });
  });

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

  function renderChips() {
    const wrap = $('chips');
    wrap.innerHTML = '';
    const all = document.createElement('button');
    all.className = 'chip' + (state.category ? '' : ' on');
    all.textContent = 'Todas';
    all.onclick = () => pickCategory(null);
    wrap.appendChild(all);
    CATS.forEach((c) => {
      const b = document.createElement('button');
      b.className = 'chip' + (state.category === c ? ' on' : '');
      b.textContent = c.charAt(0) + c.slice(1).toLowerCase();
      b.onclick = () => pickCategory(state.category === c ? null : c);
      wrap.appendChild(b);
    });
  }

  function filtered() {
    const q = fold(state.query.trim());
    return SONGS.filter((s) =>
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
      '<li class="empty">No hay canciones que coincidan.</li>';
  }

  // ---------- Canción ----------
  function renderSheet() {
    const s = state.current;
    if (!s) return;
    const shift = state.shifts[s.code] || 0;
    const flats = s.key ? C.prefersFlats(s.key.semi + shift, s.key.minor) : false;
    const out = [];
    let blank = 0;
    s.lines.forEach((line, i) => {
      if (s.chordFlags[i]) {
        if (state.lyricsOnly) return;
        out.push('<span class="cl">' + C.transposeLine(line, shift, flats, state.notation)
          .map((g) => g.chord ? `<b class="ch">${esc(g.text)}</b>` : esc(g.text)).join('') + '</span>');
        blank = 0;
      } else {
        if (!line.trim()) { blank++; if (blank > (state.lyricsOnly ? 1 : 2)) return; }
        else blank = 0;
        const isLabel = line.trim().length < 40 &&
          /^\s*(\(.*\)|(CORO|VERSO|PUENTE|INTRO|ESTRIBILLO|CEJILLA)\b.*)\s*$/i.test(line);
        out.push(isLabel ? `<span class="lbl">${esc(line)}</span>` : esc(line));
      }
    });
    $('sheet').innerHTML = out.join('\n');
    $('sheet').style.fontSize = state.font + 'px';
    $('sheet').classList.toggle('mono', state.mono);

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
    $('offset').textContent = sd ? (sd > 0 ? '+' : '') + sd + ' st' : '';
    $('resetBtn').hidden = !sd;

    const v = $('variants');
    if (s.altShifts.length) {
      v.hidden = false;
      v.innerHTML = '<span class="ctrl-label">En el cancionero también en</span>' +
        s.altShifts.map((d) => `<button class="chip${signed(shift) === d ? ' on' : ''}" data-shift="${d}">${keyName(s, d)}</button>`).join('');
      v.querySelectorAll('button').forEach((b) => b.onclick = () => setShift(+b.dataset.shift));
    } else v.hidden = true;
  }

  function setShift(n) {
    const s = state.current;
    if (!s) return;
    n = signed(n);
    if (n) state.shifts[s.code] = n; else delete state.shifts[s.code];
    store.set('shifts', state.shifts);
    renderSheet();
    renderList();
  }

  function showSong(code) {
    const s = SONGS.find((x) => x.code === code);
    document.body.classList.toggle('reading', !!s);
    $('backBtn').hidden = !s;
    if (!s) {
      state.current = null;
      $('song').hidden = true;
      $('welcome').hidden = false;
      document.title = 'Cancionero Meribá';
      renderList();
      return;
    }
    state.current = s;
    $('welcome').hidden = true;
    $('song').hidden = false;
    $('songCode').textContent = s.code;
    $('songTitle').textContent = s.title;
    $('songTags').innerHTML = s.categories.map((c) => `<span class="tag">${c.charAt(0) + c.slice(1).toLowerCase()}</span>`).join('');
    document.title = s.title + ' · Cancionero Meribá';
    const prev = SONGS[s.index - 1], next = SONGS[s.index + 1];
    $('prevLink').style.visibility = prev ? 'visible' : 'hidden';
    $('nextLink').style.visibility = next ? 'visible' : 'hidden';
    if (prev) { $('prevLink').href = '#' + prev.code; $('prevLink').textContent = '← ' + prev.title; }
    if (next) { $('nextLink').href = '#' + next.code; $('nextLink').textContent = next.title + ' →'; }
    renderSheet();
    renderList();
    window.scrollTo(0, 0);
    const a = document.querySelector('.song-list a.active');
    if (a && a.scrollIntoView) a.scrollIntoView({ block: 'nearest' });
  }

  function route() { showSong(decodeURIComponent(location.hash.replace(/^#\/?/, ''))); }

  // ---------- Eventos ----------
  $('upBtn').onclick = () => setShift((state.shifts[state.current.code] || 0) + 1);
  $('downBtn').onclick = () => setShift((state.shifts[state.current.code] || 0) - 1);
  $('keySelect').onchange = (e) => setShift(+e.target.value);
  $('resetBtn').onclick = () => setShift(0);
  $('fontUp').onclick = () => { state.font = Math.min(30, state.font + 1); store.set('font', state.font); renderSheet(); };
  $('fontDown').onclick = () => { state.font = Math.max(11, state.font - 1); store.set('font', state.font); renderSheet(); };
  $('lyricsOnly').checked = state.lyricsOnly;
  $('lyricsOnly').onchange = (e) => { state.lyricsOnly = e.target.checked; store.set('lyricsOnly', state.lyricsOnly); renderSheet(); };
  $('monoFont').checked = state.mono;
  $('monoFont').onchange = (e) => { state.mono = e.target.checked; store.set('mono', state.mono); renderSheet(); };
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
    if (e.target.matches('input, select, textarea') || !state.current) return;
    if (e.key === '+' || e.key === '=') setShift((state.shifts[state.current.code] || 0) + 1);
    else if (e.key === '-') setShift((state.shifts[state.current.code] || 0) - 1);
    else if (e.key === 'ArrowRight' && SONGS[state.current.index + 1]) location.hash = '#' + SONGS[state.current.index + 1].code;
    else if (e.key === 'ArrowLeft' && SONGS[state.current.index - 1]) location.hash = '#' + SONGS[state.current.index - 1].code;
  });

  $('count').textContent = SONGS.length + ' canciones';
  updateNotationBtn();
  renderChips();
  window.addEventListener('hashchange', route);
  route();
})();
