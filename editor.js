// Editor de canciones: título, letra, acordes y saltos de párrafo.
// Los cambios se guardan en este dispositivo (localStorage) y se pueden exportar/importar.
(function () {
  'use strict';
  const A = window.App, C = window.Chords;
  if (!A || !C) return;
  const $ = (id) => document.getElementById(id);
  const esc = (t) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  const el = document.createElement('div');
  el.id = 'editor'; el.className = 'editor'; el.hidden = true;
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'edHead');
  el.innerHTML = `
    <div class="ed-card">
      <div class="ed-top">
        <h2 id="edHead">Editar canción <span class="code" id="edCode"></span></h2>
        <button class="icon-btn" id="edClose" aria-label="Cerrar sin guardar">✕</button>
      </div>
      <label class="field">Título <input id="edTitle" maxlength="200" autocomplete="off"></label>
      <p class="ed-help">Escribe los acordes en la línea de encima de la letra, alineados con la sílaba. Una <b>línea en blanco</b> separa párrafos.
        Los acordes están en <b id="edKey"></b>, tal como estás viendo la canción.</p>
      <div class="ed-tools">
        <button class="pill" id="edSplit" title="Inserta un salto de párrafo antes de la línea donde está el cursor">¶ Separar párrafo aquí</button>
        <button class="pill" id="edJoin" title="Quita los saltos de párrafo de la selección, o une el párrafo del cursor con el siguiente">⇣ Unir con el siguiente</button>
      </div>
      <div class="ed-main">
        <textarea id="edText" spellcheck="false" autocapitalize="off" autocomplete="off" wrap="off" aria-label="Letra y acordes"></textarea>
        <div class="ed-prev-wrap"><div class="ed-prev-label">Vista previa</div><div class="sheet ed-prev" id="edPrev"></div></div>
      </div>
      <div class="ed-foot">
        <button class="link-btn" id="edReset" hidden>Restaurar la versión original</button>
        <span class="ed-spacer"></span>
        <button class="pill" id="edCancel">Cancelar</button>
        <button class="pill primary" id="edSave">Guardar</button>
      </div>
      <div class="ed-foot small">
        <span class="muted" id="edNote">Los cambios se guardan en este dispositivo.</span>
        <span class="ed-spacer"></span>
        <button class="link-btn" id="edExport">Exportar mis cambios y colecciones</button>
        <label class="link-btn">Importar<input type="file" id="edImport" accept="application/json,.json" hidden></label>
      </div>
    </div>`;
  document.body.appendChild(el);

  let code = null, initial = '', initialTitle = '', armedCancel = false, prevTimer = null;
  const ta = $('edText');

  function preview() {
    const lines = ta.value.replace(/\t/g, '    ').split('\n');
    const paras = []; let cur = [];
    lines.forEach((l) => {
      if (!l.trim()) { if (cur.length) { paras.push(cur); cur = []; } return; }
      cur.push(C.isChordLine(l) ? '<span class="cl"><b class="ch">' + esc(l) + '</b></span>' : esc(l));
    });
    if (cur.length) paras.push(cur);
    $('edPrev').innerHTML = paras.map((p, i) => `<pre class="para"><span class="ed-n">${i + 1}</span>${p.join('\n')}</pre>`).join('') ||
      '<p class="muted">La canción está vacía.</p>';
  }
  const schedulePreview = () => { clearTimeout(prevTimer); prevTimer = setTimeout(preview, 120); };

  function open() {
    const d = A.editData();
    if (!d) return;
    code = d.code;
    $('edCode').textContent = d.code;
    $('edTitle').value = initialTitle = d.title;
    ta.value = initial = d.text;
    $('edKey').textContent = d.keyName + (d.shift ? ' (tono transpuesto: al guardar se pasan al tono original)' : '');
    $('edReset').hidden = !d.edited;
    $('edNote').textContent = d.temp
      ? 'Estás viendo la versión del emisor. Si guardas, se crea tu propia versión en este dispositivo.'
      : 'Los cambios se guardan en este dispositivo.';
    armedCancel = false; $('edCancel').textContent = 'Cancelar';
    el.hidden = false;
    document.body.classList.add('editing');
    preview();
    setTimeout(() => ta.focus(), 30);
  }
  const dirty = () => ta.value !== initial || $('edTitle').value !== initialTitle;
  function close(force) {
    if (!force && dirty() && !armedCancel) {
      armedCancel = true; $('edCancel').textContent = 'Pulsa otra vez para descartar';
      return;
    }
    el.hidden = true; code = null;
    document.body.classList.remove('editing');
  }
  function save() {
    if (!code) return;
    A.saveEdit(code, $('edTitle').value, ta.value);
    close(true);
  }

  // Herramientas de párrafo
  function lineStart(pos) { return ta.value.lastIndexOf('\n', pos - 1) + 1; }
  function replaceRange(start, end, text, caret) {
    ta.focus();
    ta.setSelectionRange(start, end);
    // execCommand mantiene el deshacer (Ctrl+Z) del navegador cuando está disponible
    let ok = false;
    try { ok = document.execCommand('insertText', false, text); } catch (e) { ok = false; }
    if (!ok) ta.setRangeText(text, start, end, 'end');
    if (caret !== undefined) ta.setSelectionRange(caret, caret);
    schedulePreview();
  }
  $('edSplit').onclick = () => {
    const ls = lineStart(ta.selectionStart);
    const before = ta.value.slice(0, ls);
    if (ls === 0 || /\n\s*\n$/.test(before) || /^\s*$/.test(before)) return; // ya hay salto
    replaceRange(ls, ls, '\n', ls + 1);
  };
  $('edJoin').onclick = () => {
    const v = ta.value;
    let a = ta.selectionStart, b = ta.selectionEnd;
    if (a !== b) {
      const seg = v.slice(a, b).replace(/\n[ \t]*(?=\n)/g, '');
      replaceRange(a, b, seg);
      return;
    }
    // sin selección: quitar el primer salto de párrafo después del cursor
    const re = /\n([ \t]*\n)+/g;
    re.lastIndex = a;
    const m = re.exec(v);
    if (m) replaceRange(m.index, m.index + m[0].length, '\n', m.index + 1);
  };

  ta.addEventListener('input', () => { armedCancel = false; $('edCancel').textContent = 'Cancelar'; schedulePreview(); });
  $('edTitle').addEventListener('input', () => { armedCancel = false; $('edCancel').textContent = 'Cancelar'; });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') { e.preventDefault(); replaceRange(ta.selectionStart, ta.selectionEnd, '    '); }
  });
  el.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(); }
    else if (e.key === 'Escape') { e.preventDefault(); close(false); }
    e.stopPropagation();
  });
  $('edSave').onclick = save;
  $('edCancel').onclick = () => close(false);
  $('edClose').onclick = () => close(false);
  $('edReset').onclick = () => {
    if ($('edReset').dataset.armed !== '1') {
      $('edReset').dataset.armed = '1'; $('edReset').textContent = 'Pulsa otra vez para restaurar el original';
      setTimeout(() => { $('edReset').dataset.armed = ''; $('edReset').textContent = 'Restaurar la versión original'; }, 4000);
      return;
    }
    $('edReset').dataset.armed = '';
    A.resetEdit(code);
    close(true);
  };
  $('edExport').onclick = () => {
    const data = A.exportEdits();
    const n = Object.keys(data.canciones).length;
    if (!A.hasChanges()) { $('edNote').textContent = 'No tienes cambios guardados todavía.'; return; }
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'cancionero-meriba-cambios.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    $('edNote').textContent = `Exportados: ${n} canción(es) editada(s) y tus colecciones.`;
  };
  $('edImport').onchange = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    f.text().then((t) => {
      let n = 0;
      try { n = A.importEdits(JSON.parse(t)); } catch (err) { n = -1; }
      $('edNote').textContent = n < 0 ? 'El archivo no es válido.' : `Importados ${n} cambio(s) de canciones y colecciones.`;
      if (n > 0 && code) { const d = A.editData(); if (d) { ta.value = initial = d.text; $('edTitle').value = initialTitle = d.title; preview(); } }
    });
    e.target.value = '';
  };

  $('editBtn').onclick = open;
})();
