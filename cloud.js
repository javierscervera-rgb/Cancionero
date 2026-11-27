// Cancionero compartido en Google Drive (a través de un script de Google).
// - Todos leen la última versión al abrir la web y cada poco tiempo.
// - Cualquiera puede editar: los cambios (canciones, comentarios, colecciones) se guardan en Drive.
// - Sin conexión, se quedan pendientes en este dispositivo y se suben en cuanto vuelve.
(function () {
  'use strict';
  const A = window.App;
  const URL_ = window.CLOUD_URL;
  if (!A || !URL_ || !/^https?:/.test(URL_)) return;
  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem('cm:' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { if (v === null) localStorage.removeItem('cm:' + k); else localStorage.setItem('cm:' + k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  };

  const st = {
    doc: store.get('cloud', null), // copia propia (no compartida con los objetos de la app)
    by: store.get('editName', ''),
    busy: false, again: false,
    status: 'Conectando…', ok: null, lastSync: 0
  };
  if (!st.doc || !Array.isArray(st.doc.songs)) st.doc = null;
  const rev = () => (st.doc ? st.doc.rev || 0 : 0);

  function setStatus(t, ok) { st.status = t; st.ok = ok; renderUi(); }
  function saveDoc(doc) {
    st.doc = doc;
    if (!store.set('cloud', doc)) { /* sin espacio: se seguirá usando en memoria */ }
  }

  async function getJson(url, opts) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 30000);
    try {
      const r = await fetch(url, Object.assign({ signal: ctl.signal, redirect: 'follow', cache: 'no-store' }, opts || {}));
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally { clearTimeout(t); }
  }
  const post = (body) => getJson(URL_, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });

  // Mismo cambio que hace el script en Drive, aplicado a la copia local
  function applyOp(doc, r) {
    const find = (code) => doc.songs.find((x) => x.code === code);
    let s;
    switch (r.op) {
      case 'song': s = find(r.code); if (s) { s.title = r.title; s.lines = r.lines.slice(); } break;
      case 'note': s = find(r.code); if (s) { if (r.text) s.comment = r.text; else delete s.comment; } break;
      case 'cats': s = find(r.code); if (s) s.categories = r.categories.slice(); break;
      case 'songLists': s = find(r.code); if (s) s.lists = r.lists.slice(); break;
      case 'marks': (r.items || []).forEach((it) => { const x = find(it.code); if (x) { if (it.mark && it.mark !== x.code) x.mark = it.mark; else delete x.mark; } }); break;
      case 'seed':
        doc.seeds = doc.seeds || {}; doc.seeds[r.id] = true;
        (r.authors || []).forEach((it) => { const x = find(it.code); if (x && !x.author && it.author) x.author = it.author; });
        break;
      case 'author': s = find(r.code); if (s) { if (r.author) s.author = r.author; else delete s.author; } break;
      case 'mark': s = find(r.code); if (s) { if (r.mark) s.mark = r.mark; else delete s.mark; } break;
      case 'addSong': {
        if (find(r.song.code)) break;
        let at = -1;
        doc.songs.forEach((x, k) => { if (x.list === r.song.list) at = k; });
        const ns = { code: r.song.code, title: r.song.title, lines: r.song.lines.slice(), variants: [], categories: r.song.categories.slice(), list: r.song.list };
        if (r.song.author) ns.author = r.song.author;
        if (at < 0) doc.songs.push(ns); else doc.songs.splice(at + 1, 0, ns);
        break;
      }
      case 'settings': doc.settings = doc.settings || {}; doc.settings.maxChars = r.maxChars; break;
      case 'listCats': (doc.lists || []).forEach((l) => { if (l.id === r.list) l.cats = r.cats.slice(); }); break;
      case 'sel': doc.selections = doc.selections || {}; delete doc.selection; doc.selections[r.list] = r.codes.slice(); break;
      case 'addCat': doc.customCats = doc.customCats || []; if (!doc.customCats.includes(r.name)) doc.customCats.push(r.name); break;
      case 'catLists':
        (doc.lists || []).forEach((l) => { l.cats = l.cats || []; const has = l.cats.includes(r.name), want = r.lists.includes(l.id); if (want && !has) l.cats.push(r.name); if (!want && has) l.cats = l.cats.filter((c) => c !== r.name); });
        doc.customCats = (doc.customCats || []).filter((c) => c !== r.name);
        break;
      case 'delCat':
        (doc.lists || []).forEach((l) => { l.cats = (l.cats || []).filter((c) => c !== r.name); });
        doc.customCats = (doc.customCats || []).filter((c) => c !== r.name);
        doc.songs.forEach((x) => { x.categories = (x.categories || []).filter((c) => c !== r.name); });
        break;
    }
  }

  // ---------- Descargar ----------
  async function refresh() {
    try {
      const d = await getJson(URL_ + '?rev=' + (st.doc ? rev() : ''));
      st.lastSync = Date.now();
      if (d.same) { setStatus('Al día', true); return push(); }
      if (d.doc && Array.isArray(d.doc.songs) && d.doc.songs.length) {
        saveDoc(d.doc);
        A.loadDoc(JSON.parse(JSON.stringify(d.doc)));
        setStatus('Al día', true);
        return push();
      }
      // Drive todavía vacío: se sube el cancionero actual
      if (!d.doc) {
        const base = A.baseDoc();
        const r = await post({ op: 'init', by: st.by, doc: base });
        if (r.ok) { base.rev = r.rev; saveDoc(base); setStatus('Cancionero subido a Drive', true); return push(); }
        if (r.error === 'ya-inicializado') return refresh();
        handleError(r.error);
      }
    } catch (e) {
      setStatus(st.doc ? 'Sin conexión: usando la última copia' : 'Sin conexión', false);
    }
  }

  // ---------- Subir los cambios pendientes ----------
  function handleError(err) {
    setStatus('No se pudo guardar en Drive (' + (err || 'error') + ')', false);
  }
  async function push() {
    if (!st.doc) return;
    if (st.busy) { st.again = true; return; }
    const p = A.pending();
    const ops = [];
    // canciones nuevas incluidas en la web que todavía no están en Drive
    const have = new Set(st.doc.songs.map((x) => x.code));
    (window.BUNDLE_SONGS || []).filter((x) => x && x.code && !have.has(x.code)).forEach((x) => ops.push({ op: 'addSong', code: x.code,
      song: { code: x.code, title: x.title, lines: x.lines, categories: x.categories || [], list: x.list || '' } }));
    // colecciones oficiales nuevas incluidas en la web (p. ej. «⛪️Textos Misa»): se añaden al cancionero en Drive
    // (las colecciones de cada cancionero ya se editan en ✎ Edición: Drive manda y no se vuelven a añadir solas)
    // canciones creadas desde la web en este dispositivo
    (p.newSongs || []).filter((x) => !have.has(x.code)).forEach((x) => ops.push({ op: 'addSong', code: x.code, song: x }));
    p.addCats.forEach((name) => ops.push({ op: 'addCat', name }));
    p.songs.forEach((x) => ops.push({ op: 'song', code: x.code, title: x.title, lines: x.lines }));
    p.notes.forEach((x) => ops.push({ op: 'note', code: x.code, text: x.text }));
    p.cats.forEach((x) => ops.push({ op: 'cats', code: x.code, categories: x.categories }));
    (p.lists || []).forEach((x) => ops.push({ op: 'songLists', code: x.code, lists: x.lists }));
    (p.marks || []).forEach((x) => ops.push({ op: 'mark', code: x.code, mark: x.mark }));
    (p.authors || []).forEach((x) => ops.push({ op: 'author', code: x.code, author: x.author }));
    // autores encontrados (una sola vez para todo el cancionero)
    const sa = window.SEED_AUTHORS;
    if (sa && !(st.doc.seeds && st.doc.seeds[sa.id]) && !st.seedTried) {
      st.seedTried = true;
      ops.push({ op: 'seed', id: sa.id, authors: Object.entries(sa.items).map(([code, author]) => ({ code, author })) });
    }
    p.delCats.forEach((name) => ops.push({ op: 'delCat', name }));
    if (p.settings && typeof p.settings.maxChars === 'number') ops.push({ op: 'settings', maxChars: p.settings.maxChars });
    if (p.sel) Object.entries(p.sel).forEach(([list, codes]) => ops.push({ op: 'sel', list, codes }));
    if (!ops.length) return;
    st.busy = true;
    setStatus('Guardando en Drive…', null);
    let stale = false, failed = false;
    try {
      for (const op of ops) {
        const r = await post(Object.assign({ by: st.by }, op));
        if (!r.ok && r.error === 'existe') { stale = true; continue; }
        if (!r.ok && r.error === 'hecho') { stale = true; continue; } // otro dispositivo ya lo subió // otro dispositivo la subió antes
        if (!r.ok && r.error === 'operacion' && (op.op === 'sel' || op.op === 'listCats' || op.op === 'settings' || op.op === 'songLists' || op.op === 'mark' || op.op === 'author' || op.op === 'seed')) continue; // script aún sin esa operación: se guarda más tarde
        if (!r.ok) { handleError(r.error); failed = true; break; }
        applyOp(st.doc, op);
        if (r.rev !== rev() + 1) stale = true; // alguien más ha guardado entretanto
        st.doc.rev = r.rev;
      }
    } catch (e) {
      failed = true;
      setStatus('Sin conexión: los cambios se subirán más tarde', false);
    }
    saveDoc(st.doc);
    A.loadDoc(JSON.parse(JSON.stringify(st.doc)));
    st.busy = false;
    if (!failed) setStatus('Guardado en Drive', true);
    if (stale) return refresh();
    if (st.again) { st.again = false; push(); }
  }

  let pushTimer = null;
  A.onLocalChange(() => {
    renderUi();
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, 400);
  });

  // ---------- Interfaz: ☁ Cancionero compartido ----------
  const dlg = document.createElement('div');
  dlg.id = 'cloudDlg'; dlg.className = 'coll-dlg'; dlg.hidden = true;
  dlg.setAttribute('role', 'dialog'); dlg.setAttribute('aria-modal', 'true'); dlg.setAttribute('aria-labelledby', 'cloudHead');
  dlg.innerHTML = `
    <div class="coll-card cloud-card">
      <div class="ed-top">
        <h2 id="cloudHead">☁ Cancionero compartido</h2>
        <button class="icon-btn" id="cloudClose" aria-label="Cerrar">✕</button>
      </div>
      <p class="cloud-status" id="cloudStatus"></p>
      <p class="muted small-note">Solo hay una versión del cancionero: la guardada en Google Drive, que se carga al abrir la página.
        Lo que cualquiera edite (letras, acordes, comentarios, colecciones) se guarda ahí para todos. Cada día se guarda una copia de seguridad.</p>
      <form class="cloud-form" id="cloudForm">
        <label class="field">Tu nombre (opcional, para el registro de cambios) <input id="cloudName" maxlength="40" autocomplete="name"></label>
        <p class="coll-msg" id="cloudMsg"></p>
      </form>
      <p class="muted small-note" id="cloudPending"></p>
      <details class="cloud-log"><summary>Últimos cambios</summary><ul id="cloudLog"></ul></details>
      <div class="ed-foot">
        <button class="link-btn" id="cloudSync">Actualizar ahora</button>
        <span class="ed-spacer"></span>
        <button class="pill primary" id="cloudDone">Listo</button>
      </div>
    </div>`;
  document.body.appendChild(dlg);

  function pendingCount() {
    const p = A.pending();
    return p.addCats.length + p.delCats.length + p.songs.length + p.notes.length + p.cats.length + (p.sel ? Object.keys(p.sel).length : 0) + (p.newSongs ? p.newSongs.length : 0) + (p.settings ? 1 : 0) + (p.lists ? p.lists.length : 0) + (p.marks ? p.marks.length : 0) + (p.authors ? p.authors.length : 0);
  }
  function label() {
    const n = pendingCount();
    return n ? '⏳ Guardando ' + n + ' cambio(s) en Drive…' : '☁ Se guarda en Drive para todos';
  }
  const OPS = { settings: 'cambió el máximo de caracteres', listCats: 'cambió las colecciones de', sel: 'cambió la selección', addSong: 'añadió', lists: 'reordenó las listas', song: 'editó', note: 'comentó', cats: 'cambió colecciones de', songLists: 'cambió los cancioneros de', mark: 'cambió el marcador de', seed: 'añadió datos a', author: 'cambió el autor de', marks: 'cambió los marcadores de', catLists: 'cambió los cancioneros de la colección', addCat: 'creó la colección', delCat: 'borró la colección', init: 'subió el cancionero' };
  function renderUi() {
    const ob = $('cloudOpen');
    if (ob) { ob.hidden = false; ob.textContent = st.ok === false ? '☁ Sin conexión' : '☁ Drive'; }
    $('cloudStatus').textContent = (st.ok === false ? '⚠ ' : st.ok ? '✓ ' : '') + st.status;
    $('cloudStatus').className = 'cloud-status' + (st.ok === false ? ' bad' : st.ok ? ' good' : '');
    $('cloudPending').textContent = label();
    const log = (st.doc && st.doc.log) || [];
    const titleOf = (code) => { const s = st.doc && st.doc.songs.find((x) => x.code === code); return s ? code + ' ' + s.title : code; };
    $('cloudLog').innerHTML = log.slice(-25).reverse().map((l) =>
      `<li><span class="muted">${esc(new Date(l.t).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}</span> ` +
      `${esc(l.by || 'alguien')} ${esc(OPS[l.op] || l.op)} <b>${esc(['song', 'note', 'cats', 'songLists', 'mark', 'author'].includes(l.op) ? titleOf(l.what) : l.what)}</b></li>`).join('') || '<li class="muted">Todavía no hay cambios.</li>';
    document.querySelectorAll('.cloud-label').forEach((el) => { el.textContent = label(); });
  }
  function open() { $('cloudMsg').textContent = ''; $('cloudName').value = st.by; dlg.hidden = false; renderUi(); refresh(); }
  function close() {
    const by = $('cloudName').value.trim().slice(0, 40);
    if (by !== st.by) { st.by = by; store.set('editName', by); }
    dlg.hidden = true;
  }
  $('cloudClose').onclick = close; $('cloudDone').onclick = close;
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  dlg.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); e.stopPropagation(); });
  $('cloudSync').onclick = () => { setStatus('Comprobando…', null); refresh(); };
  if ($('cloudOpen')) $('cloudOpen').onclick = open;
  $('cloudForm').onsubmit = (e) => { e.preventDefault(); close(); };

  // Accesos: en el editor de canciones y en Colecciones
  function addLinks() {
    const ed = $('edNote');
    if (ed && !ed.dataset.cloud) {
      ed.dataset.cloud = '1'; ed.classList.add('cloud-label');
      const b = document.createElement('button');
      b.className = 'link-btn'; b.textContent = '☁ Cancionero compartido'; b.onclick = open;
      ed.after(b);
    }
    const cn = document.querySelector('#collDlg .small-note');
    if (cn && !cn.dataset.cloud) {
      cn.dataset.cloud = '1'; cn.classList.add('cloud-label');
      const b = document.createElement('button');
      b.className = 'link-btn'; b.textContent = '☁ Compartido'; b.onclick = open;
      cn.after(b);
    }
  }
  addLinks();

  window.Cloud = {
    editor: () => true,
    label,
    rev,
    refresh,
    open,
    // para el multimedia (media.js)
    url: URL_,
    post: (body) => post(Object.assign({ by: st.by }, body)),
    get: (qs) => getJson(URL_ + '?' + qs),
    // el emisor tiene una versión más nueva: ponerse al día
    behind(r) { if (Number.isInteger(r) && r > rev()) refresh(); }
  };

  renderUi();
  A.refreshTags();
  refresh();
  setInterval(() => { if (document.visibilityState === 'visible' && Date.now() - st.lastSync > 80000) refresh(); }, 30000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - st.lastSync > 15000) refresh(); });
})();
