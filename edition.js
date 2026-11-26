// ✎ Edición: crear y borrar colecciones y elegir en qué cancioneros aparece cada una.
// Se guarda directamente en Drive (para todos).
(function () {
  'use strict';
  const A = window.App;
  if (!A || !A.catMatrix) return;
  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const short = (n) => n.replace(/^Cancionero\s+/i, '');

  const el = document.createElement('div');
  el.id = 'editionDlg'; el.className = 'coll-dlg'; el.hidden = true;
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'edHead');
  el.innerHTML = `
    <div class="coll-card ed-card">
      <div class="ed-top">
        <h2 id="edHead">Edición de colecciones</h2>
        <button class="icon-btn" id="edClose" aria-label="Cerrar">✕</button>
      </div>
      <p class="coll-sub muted">Marca en qué cancioneros aparece cada colección. Se guarda en Drive para todos.</p>
      <form class="ed-new" id="edForm">
        <input id="edName" maxlength="40" placeholder="Nueva colección, p. ej. Navidad" autocomplete="off" aria-label="Nombre de la nueva colección">
        <div class="ed-lists" id="edNewLists"></div>
        <button class="pill primary" type="submit">Crear</button>
      </form>
      <p class="coll-msg" id="edMsg"></p>
      <div class="ed-table" id="edTable"></div>
      <div class="ed-foot"><span class="ed-spacer"></span><button class="pill primary" id="edDone">Listo</button></div>
    </div>`;
  document.body.appendChild(el);

  let busy = false;
  function msg(t, bad) { const m = $('edMsg'); m.textContent = t || ''; m.classList.toggle('bad', !!bad); }
  async function post(body, ok) {
    const c = window.Cloud;
    if (!c || !c.post) { msg('No hay conexión con Drive.', true); return false; }
    busy = true; el.classList.add('busy');
    try {
      const r = await c.post(body);
      if (!r || !r.ok) { msg(r && r.error === 'operacion' ? 'Hay que actualizar el script de Drive para poder hacerlo.' : 'No se pudo guardar (' + ((r && r.error) || 'conexión') + ').', true); return false; }
      await c.refresh();
      if (ok) msg(ok);
      return true;
    } catch (e) { msg('Sin conexión: inténtalo de nuevo.', true); return false; }
    finally { busy = false; el.classList.remove('busy'); render(); }
  }
  function render() {
    const lists = A.listsInfo(), rows = A.catMatrix();
    const cur = A.getState ? null : null;
    $('edNewLists').innerHTML = lists.map((l) =>
      `<label><input type="checkbox" value="${esc(l.id)}"${l.id === document.body.dataset.list ? ' checked' : ''}> ${esc(short(l.name))}</label>`).join('');
    $('edTable').innerHTML =
      `<div class="ed-row ed-headrow" style="--n:${lists.length}"><span>Colección</span>${lists.map((l) => `<span class="ed-lh">${esc(short(l.name))}</span>`).join('')}<span></span></div>` +
      rows.map((r) => `<div class="ed-row" style="--n:${lists.length}" data-name="${esc(r.name)}">
        <span class="ed-name">${esc(r.label)} <small>${r.count}</small></span>
        ${lists.map((l) => `<label class="ed-cell" title="${esc(short(l.name))}"><input type="checkbox" value="${esc(l.id)}"${r.lists.includes(l.id) ? ' checked' : ''}></label>`).join('')}
        <button type="button" class="coll-del" title="Borrar la colección (las canciones no se borran)">✕</button>
      </div>`).join('');
    $('edTable').querySelectorAll('.ed-row[data-name]').forEach((row) => {
      const name = row.dataset.name;
      row.querySelectorAll('input').forEach((cb) => {
        cb.onchange = () => {
          if (busy) { cb.checked = !cb.checked; return; }
          const ids = [...row.querySelectorAll('input:checked')].map((x) => x.value);
          post({ op: 'catLists', name, lists: ids }, ids.length ? '«' + name + '» aparece en ' + ids.length + ' cancionero' + (ids.length > 1 ? 's' : '') + '.' : '«' + name + '» ya no aparece en ningún cancionero (las canciones conservan la colección).');
        };
      });
      const del = row.querySelector('.coll-del');
      del.onclick = () => {
        if (busy) return;
        if (del.dataset.armed !== '1') {
          del.dataset.armed = '1'; del.textContent = '¿Borrar?'; del.classList.add('armed');
          setTimeout(() => { if (del.isConnected) { del.dataset.armed = ''; del.textContent = '✕'; del.classList.remove('armed'); } }, 3500);
          return;
        }
        post({ op: 'delCat', name }, 'Colección «' + name + '» borrada. Las canciones siguen en el cancionero.');
      };
    });
  }
  $('edForm').onsubmit = (e) => {
    e.preventDefault();
    if (busy) return;
    const name = $('edName').value.replace(/[<>\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
    const ids = [...$('edNewLists').querySelectorAll('input:checked')].map((x) => x.value);
    if (!name) { msg('Escribe el nombre de la colección.', true); return; }
    if (!ids.length) { msg('Marca al menos un cancionero.', true); return; }
    if (A.catMatrix().some((r) => r.name.toLowerCase() === name.toLowerCase())) { msg('Ya existe una colección con ese nombre: marca abajo sus cancioneros.', true); return; }
    post({ op: 'catLists', name, lists: ids }, 'Creada «' + name + '». Para añadir canciones, usa 🏷 Colecciones en cada canción.').then((ok) => { if (ok) $('edName').value = ''; });
  };
  function open() { msg(''); $('edName').value = ''; el.hidden = false; render(); setTimeout(() => $('edName').focus(), 30); }
  function close() { el.hidden = true; }
  $('edClose').onclick = close;
  $('edDone').onclick = close;
  el.addEventListener('click', (e) => { if (e.target === el) close(); });
  el.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } e.stopPropagation(); });
  window.Edition = { open };
})();
