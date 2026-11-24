// Multimedia: fotos, vídeos y audios guardados en Google Drive (a través del script del cancionero).
// - Se suben con el botón o arrastrándolos a la lista (en trozos de 3 MB).
// - Cada dispositivo los descarga una vez y los guarda en su navegador (IndexedDB).
// - En la lista se ven con su miniatura; se pueden renombrar, borrar y deslizar a la Selección.
// - Al proyectarlos, la pantalla completa los muestra sin ningún control; el líder o Letras
//   los controlan (reproducir, pausa, volumen, bucle) y el resto de dispositivos ve la miniatura.
(function () {
  'use strict';
  const A = window.App;
  if (!A || !A.media) return;
  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const MAX = 100 * 1024 * 1024;   // tamaño máximo por archivo
  const PART = 3 * 1024 * 1024;    // trozo que se sube en cada petición
  const cloud = () => window.Cloud && window.Cloud.post ? window.Cloud : null;

  // ---------- Caché en el navegador (IndexedDB) ----------
  let dbp = null;
  function db() {
    if (!dbp) dbp = new Promise((ok, ko) => {
      if (!window.indexedDB) return ko(new Error('idb'));
      const r = indexedDB.open('cancionero-media', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('files');
      r.onsuccess = () => ok(r.result);
      r.onerror = () => ko(r.error);
    });
    return dbp;
  }
  const idbGet = (id) => db().then((d) => new Promise((ok) => {
    const q = d.transaction('files').objectStore('files').get(id);
    q.onsuccess = () => ok(q.result || null); q.onerror = () => ok(null);
  })).catch(() => null);
  const idbPut = (id, blob) => db().then((d) => new Promise((ok) => {
    const t = d.transaction('files', 'readwrite'); t.objectStore('files').put(blob, id);
    t.oncomplete = () => ok(true); t.onerror = () => ok(false);
  })).catch(() => false);
  const idbDel = (id) => db().then((d) => { d.transaction('files', 'readwrite').objectStore('files').delete(id); }).catch(() => {});

  // ---------- Descargar (una vez) ----------
  const urls = {}, loading = {};
  const b64ToBytes = (b64) => { const bin = atob(b64); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; };
  function blobUrl(m) {
    if (urls[m.id]) return Promise.resolve(urls[m.id]);
    if (loading[m.id]) return loading[m.id];
    loading[m.id] = (async () => {
      let blob = await idbGet(m.id);
      if (!blob) {
        const c = cloud();
        if (!c) throw new Error('sin-drive');
        const parts = [];
        for (const fid of m.parts || []) {
          const r = await c.get('mpart=' + encodeURIComponent(fid));
          if (!r || !r.ok) throw new Error((r && r.error) || 'descarga');
          parts.push(b64ToBytes(r.data));
        }
        blob = new Blob(parts, { type: m.type });
        idbPut(m.id, blob);
      }
      urls[m.id] = URL.createObjectURL(blob);
      return urls[m.id];
    })().finally(() => { delete loading[m.id]; });
    return loading[m.id];
  }

  // ---------- Subir ----------
  const newId = () => '@' + Array.from({ length: 8 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
  const readB64 = (blob) => new Promise((ok, ko) => {
    const fr = new FileReader();
    fr.onload = () => ok(String(fr.result).replace(/^data:[^,]*,/, ''));
    fr.onerror = () => ko(fr.error);
    fr.readAsDataURL(blob);
  });
  // miniatura (primer fotograma o la imagen reducida) y duración
  function preview(file) {
    return new Promise((done) => {
      const url = URL.createObjectURL(file);
      const fin = (thumb, dur) => { URL.revokeObjectURL(url); done({ thumb: thumb || '', dur: dur || 0 }); };
      const snap = (el, w, h) => {
        try {
          const k = Math.min(1, 320 / Math.max(w, h));
          const cv = document.createElement('canvas');
          cv.width = Math.max(1, Math.round(w * k)); cv.height = Math.max(1, Math.round(h * k));
          cv.getContext('2d').drawImage(el, 0, 0, cv.width, cv.height);
          return cv.toDataURL('image/jpeg', 0.62);
        } catch (e) { return ''; }
      };
      const to = setTimeout(() => fin('', 0), 8000);
      if (/^image\//.test(file.type)) {
        const im = new Image();
        im.onload = () => { clearTimeout(to); fin(snap(im, im.naturalWidth, im.naturalHeight), 0); };
        im.onerror = () => { clearTimeout(to); fin('', 0); };
        im.src = url;
      } else if (/^video\//.test(file.type)) {
        const v = document.createElement('video');
        v.muted = true; v.preload = 'auto'; v.playsInline = true;
        v.onloadeddata = () => { try { v.currentTime = Math.min(0.5, (v.duration || 1) / 10); } catch (e) { /* nada */ } };
        v.onseeked = () => { clearTimeout(to); fin(snap(v, v.videoWidth, v.videoHeight), v.duration); };
        v.onerror = () => { clearTimeout(to); fin('', 0); };
        v.src = url;
      } else {
        const au = document.createElement('audio');
        au.preload = 'metadata';
        au.onloadedmetadata = () => { clearTimeout(to); fin('', au.duration); };
        au.onerror = () => { clearTimeout(to); fin('', 0); };
        au.src = url;
      }
    });
  }
  let busy = false;
  const queue = [];
  function progress(t, kind) {
    let p = $('mediaProg');
    if (!p) { p = document.createElement('div'); p.id = 'mediaProg'; p.className = 'media-prog'; $('mediaBar').before(p); }
    p.hidden = !t; p.textContent = t || ''; p.className = 'media-prog' + (kind ? ' ' + kind : '');
    if (kind === 'ok' || kind === 'err') setTimeout(() => { if (p.textContent === t) p.hidden = true; }, kind === 'err' ? 9000 : 3500);
  }
  function upload(files) {
    [...files].forEach((f) => queue.push(f));
    if (!busy) next();
  }
  async function next() {
    const f = queue.shift();
    if (!f) { busy = false; return; }
    busy = true;
    try {
      if (!/^(image|video|audio)\//.test(f.type)) throw new Error('«' + f.name + '» no es una foto, un vídeo ni un audio');
      if (f.size > MAX) throw new Error('«' + f.name + '» ocupa más de 100 MB');
      const c = cloud();
      if (!c) throw new Error('No hay conexión con Drive');
      progress('Preparando «' + f.name + '»…');
      const pv = await preview(f);
      const id = newId(), n = Math.max(1, Math.ceil(f.size / PART)), parts = [];
      for (let i = 0; i < n; i++) {
        progress('Subiendo «' + f.name + '» · ' + Math.round(i / n * 100) + ' %');
        const r = await c.post({ op: 'mediaPart', id, i, data: await readB64(f.slice(i * PART, (i + 1) * PART)) });
        if (!r || !r.ok) throw new Error(r && r.error === 'operacion' ? 'hay que actualizar el script de Drive' : 'error al subir (' + ((r && r.error) || 'conexión') + ')');
        parts.push(r.file);
      }
      const name = f.name.replace(/\.[a-z0-9]{2,5}$/i, '');
      const r = await c.post({ op: 'mediaAdd', media: { id, name, type: f.type, size: f.size, dur: Math.round((pv.dur || 0) * 10) / 10, thumb: pv.thumb, parts } });
      if (!r || !r.ok) throw new Error(r && r.error === 'operacion' ? 'hay que actualizar el script de Drive' : 'error al guardar (' + ((r && r.error) || 'conexión') + ')');
      await idbPut(id, f);
      await c.refresh();
      progress('«' + name + '» subido', 'ok');
    } catch (e) {
      progress('No se pudo subir: ' + (e.message || e), 'err');
    }
    next();
  }

  // ---------- Lista: subir, arrastrar, renombrar, borrar ----------
  let pick = null;
  function chooseFiles() {
    if (!pick) {
      pick = document.createElement('input');
      pick.type = 'file'; pick.multiple = true; pick.accept = 'image/*,video/*,audio/*'; pick.hidden = true;
      pick.onchange = () => { if (pick.files.length) upload(pick.files); pick.value = ''; };
      document.body.appendChild(pick);
    }
    pick.click();
  }
  let bound = false;
  function bindList(list) {
    const up = $('mediaUpBtn');
    if (up) up.onclick = (e) => { e.preventDefault(); chooseFiles(); };
    if (bound) return;
    bound = true;
    // botones ✎ y 🗑 dentro de cada pastilla (no abren el archivo)
    list.addEventListener('click', (e) => {
      const b = e.target.closest('.mact button');
      if (!b) return;
      e.preventDefault(); e.stopImmediatePropagation();
      const li = b.closest('li[data-code]'), id = li && li.dataset.code, m = id && A.mediaById(id);
      if (!m) return;
      if (b.dataset.act === 'ren') rename(li, m);
      else if (b.dataset.act === 'del') del(b, m);
    }, true);
    ['pointerdown', 'touchstart'].forEach((t) => list.addEventListener(t, (e) => { if (e.target.closest('.mact, .rn-in')) e.stopPropagation(); }, true));
    // arrastrar archivos sobre la lista
    const sb = $('sidebar');
    const hasFiles = (e) => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
    sb.addEventListener('dragover', (e) => { if (!hasFiles(e)) return; e.preventDefault(); sb.classList.add('drop-on'); if (!A.mediaMode()) A.setMediaMode(true); });
    sb.addEventListener('dragleave', (e) => { if (e.target === sb || !sb.contains(e.relatedTarget)) sb.classList.remove('drop-on'); });
    sb.addEventListener('drop', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault(); sb.classList.remove('drop-on');
      if (e.dataTransfer.files.length) upload(e.dataTransfer.files);
    });
  }
  function rename(li, m) {
    const t = li.querySelector('.t');
    if (!t || li.querySelector('.rn-in')) return;
    const inp = document.createElement('input');
    inp.className = 'rn-in'; inp.value = m.name; inp.maxLength = 120;
    t.replaceWith(inp);
    inp.focus(); inp.select();
    let done = false;
    const save = async (ok) => {
      if (done) return; done = true;
      const v = inp.value.trim();
      if (ok && v && v !== m.name) {
        const c = cloud();
        const r = c ? await c.post({ op: 'mediaRename', id: m.id, name: v }) : null;
        if (r && r.ok) { await c.refresh(); return; }
        progress('No se pudo cambiar el nombre' + (r && r.error === 'operacion' ? ': hay que actualizar el script de Drive' : ''), 'err');
      }
      inp.replaceWith(t);
    };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(true); if (e.key === 'Escape') save(false); e.stopPropagation(); });
    inp.addEventListener('blur', () => save(true));
    inp.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });
  }
  async function del(b, m) {
    // primer toque: pide confirmación; segundo: borra
    if (!b.classList.contains('confirm')) {
      b.classList.add('confirm'); b.textContent = '¿Borrar?';
      setTimeout(() => { b.classList.remove('confirm'); b.textContent = '🗑'; }, 3500);
      return;
    }
    const c = cloud();
    const r = c ? await c.post({ op: 'mediaDel', id: m.id }) : null;
    if (r && r.ok) { idbDel(m.id); if (urls[m.id]) { URL.revokeObjectURL(urls[m.id]); delete urls[m.id]; } progress('«' + m.name + '» borrado', 'ok'); await c.refresh(); }
    else progress('No se pudo borrar' + (r && r.error === 'operacion' ? ': hay que actualizar el script de Drive' : ''), 'err');
  }

  // ---------- Vista del archivo abierto ----------
  const canControl = () => !document.body.classList.contains('receiving') || document.body.classList.contains('lyrics-op');
  const fmt = (s) => { s = Math.max(0, Math.round(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  let viewId = null;
  function renderView(m) {
    viewId = m.id;
    const pv = $('mvPrev');
    if (!pv) return;
    const isImg = /^image\//.test(m.type), isAud = /^audio\//.test(m.type);
    pv.innerHTML = m.thumb ? `<img alt="" src="${m.thumb}">` : `<div class="mv-icon">${isAud ? '♫' : '▶'}</div>`;
    if (isAud) pv.insertAdjacentHTML('beforeend', `<div class="mv-name">${esc(m.name)}</div>`);
    // las imágenes se ven enteras (en cuanto se descargan)
    if (isImg) blobUrl(m).then((u) => { if (viewId === m.id && $('mvPrev')) { const im = $('mvPrev').querySelector('img') || document.createElement('img'); im.src = u; if (!im.parentNode) $('mvPrev').appendChild(im); } }).catch(() => {});
    renderCtl();
  }
  function renderCtl() {
    const box = $('mvCtl'), m = A.mediaCur();
    if (!box || !m) return;
    const isImg = /^image\//.test(m.type);
    box.hidden = isImg || !canControl();
    if (box.hidden) { box.innerHTML = ''; return; }
    const ms = A.mstate(), mine = ms.id === m.id;
    const play = mine && ms.play;
    box.innerHTML =
      `<button type="button" data-c="start" title="Al principio" aria-label="Al principio">⏮</button>` +
      `<button type="button" data-c="play" class="big" title="${play ? 'Pausa' : 'Reproducir'}" aria-label="${play ? 'Pausa' : 'Reproducir'}">${play ? '⏸' : '▶'}</button>` +
      `<span class="mv-time" id="mvTime">${fmt(mine ? A.msPos() : 0)} / ${fmt(m.dur)}</span>` +
      `<button type="button" data-c="loop" aria-pressed="${mine && ms.loop}" title="Repetir en bucle" aria-label="Repetir en bucle">🔁</button>` +
      `<label class="mv-vol" title="Volumen">🔊<input type="range" min="0" max="100" step="5" value="${Math.round((ms.vol == null ? 1 : ms.vol) * 100)}" aria-label="Volumen"></label>` +
      (mine ? '' : '<span class="mv-note">Tócalo arriba para proyectarlo; luego dale a ▶</span>');
    box.querySelectorAll('button').forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        const cur = A.mstate(), id = m.id, now = Date.now();
        const base = cur.id === id ? cur : { id, play: false, pos: 0, at: now, loop: false };
        if (b.dataset.c === 'play') A.setMState(base.play ? { id, play: false, pos: A.msPos(base), at: now } : { id, play: true, pos: A.msPos(base) >= (m.dur || Infinity) - 0.2 ? 0 : A.msPos(base), at: now });
        if (b.dataset.c === 'start') A.setMState({ id, pos: 0, at: now, play: base.play });
        if (b.dataset.c === 'loop') A.setMState({ id, loop: !base.loop, pos: A.msPos(base), at: now, play: base.play });
      };
    });
    const vol = box.querySelector('input');
    vol.oninput = () => A.setMState({ vol: vol.value / 100 });
  }
  setInterval(() => { const t = $('mvTime'), m = A.mediaCur(); if (t && m) { const ms = A.mstate(); t.textContent = fmt(ms.id === m.id ? A.msPos() : 0) + ' / ' + fmt(m.dur); } }, 500);
  let lastSig = '';
  A.onView(() => {
    const m = A.mediaCur(), ms = A.mstate();
    const sig = m ? [m.id, ms.id, ms.play, ms.loop, ms.vol, canControl()].join('|') : '';
    if (sig !== lastSig) { lastSig = sig; if (m && !(document.activeElement && document.activeElement.type === 'range')) renderCtl(); }
    syncScreen();
  });

  // ---------- Pantalla completa: el archivo sin ningún control ----------
  let scr = null; // { id, el }
  function showOnScreen(stage, id) {
    const m = A.mediaById(id);
    if (!m) return hideOnScreen();
    if (scr && scr.id === id && scr.el.isConnected) { syncScreen(); return; }
    hideOnScreen();
    const kind = /^video\//.test(m.type) ? 'video' : /^audio\//.test(m.type) ? 'audio' : 'img';
    const el = document.createElement(kind);
    el.className = 'scr-media';
    if (kind !== 'img') { el.playsInline = true; el.preload = 'auto'; el.controls = false; el.disablePictureInPicture = true; }
    if (m.thumb && kind === 'video') el.poster = m.thumb;
    if (kind === 'img' && m.thumb) el.src = m.thumb;
    stage.appendChild(el);
    scr = { id, el, kind };
    blobUrl(m).then((u) => { if (scr && scr.el === el) { el.src = u; if (kind !== 'img') el.addEventListener('loadedmetadata', syncScreen, { once: true }); syncScreen(); } }).catch(() => {});
  }
  function hideOnScreen() {
    if (!scr) return;
    try { if (scr.kind !== 'img') scr.el.pause(); } catch (e) { /* nada */ }
    scr.el.remove();
    scr = null;
  }
  function syncScreen() {
    if (!scr || scr.kind === 'img' || !scr.el.src) return;
    const el = scr.el, ms = A.mstate();
    const mine = ms.id === scr.id;
    el.loop = mine && !!ms.loop;
    el.volume = Math.max(0, Math.min(1, ms.vol == null ? 1 : ms.vol));
    if (!mine) { if (!el.paused) el.pause(); return; }
    const want = A.msPos(ms);
    if (el.readyState >= 1 && Math.abs((el.currentTime || 0) - want) > 0.6) { try { el.currentTime = want; } catch (e) { /* nada */ } }
    if (ms.play && el.paused) el.play().catch(() => { el.muted = true; el.play().catch(() => {}); });
    if (!ms.play && !el.paused) el.pause();
  }
  setInterval(syncScreen, 1000);
  // en cuanto se abre un archivo, la pantalla completa lo va descargando para tenerlo listo
  A.onView(() => { const m = A.mediaCur(); if (m && window.ScreenMode && window.ScreenMode.isOn()) blobUrl(m).catch(() => {}); });

  window.Media = { bindList, renderView, showOnScreen, hideOnScreen, upload, blobUrl, active: () => !!scr };
  // la lista ya se pintó antes de cargar este archivo
  const l = $('songList'); if (l) bindList(l);
})();
