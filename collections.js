// Colecciones: añadir o quitar la canción de una o varias colecciones y crear colecciones nuevas.
(function () {
  'use strict';
  const A = window.App;
  if (!A) return;
  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const el = document.createElement('div');
  el.id = 'collDlg'; el.className = 'coll-dlg'; el.hidden = true;
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'collHead');
  el.innerHTML = `
    <div class="coll-card">
      <div class="ed-top">
        <h2 id="collHead">Colecciones</h2>
        <button class="icon-btn" id="collClose" aria-label="Cerrar">✕</button>
      </div>
      <p class="coll-sub muted" id="collSub"></p>
      <ul class="coll-list" id="collList"></ul>
      <form class="coll-new" id="collForm">
        <input id="collName" maxlength="40" placeholder="Nueva colección, p. ej. Navidad" autocomplete="off" aria-label="Nombre de la nueva colección">
        <button class="pill primary" type="submit">Crear</button>
      </form>
      <p class="coll-msg" id="collMsg"></p>
      <div class="ed-foot">
        <span class="muted small-note">Se guarda en este dispositivo. Para pasarlo a otro, usa Exportar en ✎ Editar.</span>
        <span class="ed-spacer"></span>
        <button class="pill primary" id="collDone">Listo</button>
      </div>
    </div>`;
  document.body.appendChild(el);

  let code = null; // canción que se está clasificando (null = solo crear)

  function render() {
    const cats = A.collections();
    const mine = code ? A.songCats() : [];
    $('collHead').textContent = code ? 'Colecciones' : 'Nueva colección';
    $('collSub').textContent = code ? 'Marca las colecciones en las que debe aparecer «' + A.title() + '».' : 'Crea una colección y después añade canciones desde 🏷 Colecciones en cada canción.';
    $('collList').hidden = !code && !cats.some((c) => c.custom);
    $('collList').innerHTML = cats.filter((c) => code || c.custom).map((c) => `
      <li>
        <label class="coll-item">
          ${code ? `<input type="checkbox" value="${esc(c.name)}" ${mine.includes(c.name) ? 'checked' : ''}>` : ''}
          <span class="coll-name">${esc(c.label)}</span>
          <span class="coll-count">${c.count}</span>
        </label>
        ${c.custom ? `<button class="coll-del" data-name="${esc(c.name)}" title="Borrar la colección «${esc(c.label)}» (las canciones no se borran)">✕</button>` : ''}
      </li>`).join('');
    $('collList').querySelectorAll('input[type=checkbox]').forEach((cb) => {
      cb.onchange = () => {
        const list = [...$('collList').querySelectorAll('input[type=checkbox]:checked')].map((x) => x.value);
        A.setSongCats(code, list);
        render();
      };
    });
    $('collList').querySelectorAll('.coll-del').forEach((b) => {
      b.onclick = (e) => {
        e.preventDefault();
        if (b.dataset.armed !== '1') {
          b.dataset.armed = '1'; b.textContent = '¿Borrar?'; b.classList.add('armed');
          setTimeout(() => { if (b.isConnected) { b.dataset.armed = ''; b.textContent = '✕'; b.classList.remove('armed'); } }, 3500);
          return;
        }
        const name = b.dataset.name;
        A.deleteCollection(name);
        msg('Colección «' + name + '» borrada. Las canciones siguen en el cancionero.');
        render();
      };
    });
  }

  function msg(t, bad) { const m = $('collMsg'); m.textContent = t || ''; m.classList.toggle('bad', !!bad); }

  function open(forSong) {
    code = forSong ? (A.getState().song || null) : null;
    msg('');
    $('collName').value = '';
    el.hidden = false;
    render();
    setTimeout(() => (forSong ? $('collDone') : $('collName')).focus(), 30);
  }
  function close() { el.hidden = true; }

  $('collForm').onsubmit = (e) => {
    e.preventDefault();
    const r = A.createCollection($('collName').value);
    if (r.error) { msg(r.error, true); return; }
    $('collName').value = '';
    if (code) {
      A.setSongCats(code, A.songCats().concat([r.name]));
      msg('Creada «' + r.name + '» y añadida esta canción.');
    } else {
      msg('Creada «' + r.name + '». Ábrela desde la barra de colecciones; para añadir canciones, usa 🏷 Colecciones en cada canción.');
      A.pickCategory(r.name);
    }
    render();
  };
  $('collClose').onclick = close;
  $('collDone').onclick = close;
  el.addEventListener('click', (e) => { if (e.target === el) close(); });
  el.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } e.stopPropagation(); });
  document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('#collBtn')) open(true); });

  window.Collections = { openCreate: () => open(false), openForSong: () => open(true) };
})();
