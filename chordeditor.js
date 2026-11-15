// Editor visual de acordes: cada acorde va ligado a una sílaba de la letra.
// Se pulsa una sílaba y aparece un menú para poner, cambiar o quitar el acorde.
// Trabaja sobre el texto del editor (línea de acordes encima de la línea de letra).
(function () {
  'use strict';
  const C = window.Chords;
  if (!C) return;
  const host = () => window.EditorHost;
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- Separación en sílabas (aproximada, castellano) ----------
  const VOW = 'aeiouáéíóúüAEIOUÁÉÍÓÚÜ';
  const STRONG = 'aeoáéíóúAEOÁÉÍÓÚ';
  const isLetter = (c) => /\p{L}/u.test(c);
  const isV = (c) => VOW.includes(c);
  const INSEP = ['pl', 'pr', 'bl', 'br', 'fl', 'fr', 'cl', 'cr', 'gl', 'gr', 'dr', 'tr', 'kl', 'kr'];
  const DIG = ['ch', 'll', 'rr'];

  function syllables(word) {
    const ch = [...word];
    // núcleos vocálicos (separando hiatos entre vocales fuertes)
    const nuclei = [];
    let i = 0;
    while (i < ch.length) {
      if (isV(ch[i]) && isLetter(ch[i])) {
        let s = i;
        let j = i + 1;
        while (j < ch.length && isV(ch[j])) {
          // hiato: dos vocales fuertes seguidas
          if (STRONG.includes(ch[j - 1]) && STRONG.includes(ch[j])) break;
          j++;
        }
        nuclei.push([s, j]); // [inicio, fin)
        i = j;
      } else i++;
    }
    if (nuclei.length <= 1) return [word];
    const cuts = [];
    for (let k = 0; k < nuclei.length - 1; k++) {
      const a = nuclei[k][1], b = nuclei[k + 1][0];
      if (a === b) { cuts.push(a); continue; } // hiato
      // consonantes entre núcleos agrupadas en unidades (ch, ll, rr cuentan como una)
      const units = [];
      let p = a;
      while (p < b) {
        const two = (ch[p] + (ch[p + 1] || '')).toLowerCase();
        if (p + 1 < b && DIG.includes(two)) { units.push([p, 2]); p += 2; } else { units.push([p, 1]); p += 1; }
      }
      const n = units.length;
      const pair = (u, v) => units[u][1] === 1 && units[v][1] === 1 && INSEP.includes((ch[units[u][0]] + ch[units[v][0]]).toLowerCase());
      let cutUnit;
      if (n === 1) cutUnit = 0;
      else if (n === 2) cutUnit = pair(0, 1) ? 0 : 1;
      else if (n === 3) cutUnit = pair(1, 2) ? 1 : 2;
      else cutUnit = 2;
      if (units.slice(0, cutUnit).some((u) => !isLetter(ch[u[0]]))) cutUnit = units.findIndex((u) => !isLetter(ch[u[0]])) + 1;
      cuts.push(units[cutUnit] ? units[cutUnit][0] : b);
    }
    const out = [];
    let last = 0;
    cuts.forEach((c) => { if (c > last) { out.push(ch.slice(last, c).join('')); last = c; } });
    out.push(ch.slice(last).join(''));
    return out.filter(Boolean);
  }

  // ---------- Modelo: filas a partir del texto ----------
  // fila: { kind: 'pair'|'chords'|'lyric'|'blank', c: índice línea acordes|null, l: índice línea letra|null }
  function parse(text) {
    const lines = text.split('\n');
    const rows = [];
    for (let i = 0; i < lines.length; i++) {
      const L = lines[i];
      if (!L.trim()) { rows.push({ kind: 'blank', c: null, l: i }); continue; }
      if (C.isChordLine(L)) {
        const nx = lines[i + 1];
        if (nx !== undefined && nx.trim() && !C.isChordLine(nx)) { rows.push({ kind: 'pair', c: i, l: i + 1 }); i++; }
        else rows.push({ kind: 'chords', c: i, l: null });
      } else rows.push({ kind: 'lyric', c: null, l: i });
    }
    return { lines, rows };
  }
  // Tokens de una línea de acordes con su columna
  function tokens(line) {
    const out = []; const re = /\S+/g; let m;
    while ((m = re.exec(line || ''))) {
      const parts = m[0].split(/[-()\[\],.;:…]+/).filter(Boolean);
      const isChord = parts.length > 0 && parts.every((p) => C.parseChord(p));
      out.push({ pos: m.index, text: m[0], chord: isChord });
    }
    return out;
  }
  // Construye la línea de acordes colocando cada token en su columna (sin solaparse)
  function build(toks) {
    toks = toks.slice().sort((a, b) => a.pos - b.pos);
    let s = '';
    toks.forEach((t) => {
      const col = Math.max(t.pos, s.length ? s.length + 1 : 0);
      s += ' '.repeat(col - s.length) + t.text;
    });
    return s;
  }
  // Sílabas de una línea de letra con su columna de inicio
  function sylls(line) {
    const out = []; const re = /\S+/g; let m;
    while ((m = re.exec(line))) {
      let p = m.index;
      const arr = syllables(m[0]);
      arr.forEach((sy, k) => { out.push({ pos: p, text: sy, wordEnd: k === arr.length - 1 }); p += sy.length; });
    }
    return out;
  }

  // ---------- Pintado ----------
  let model = null, pick = null; // pick = { row, from, to, el }
  function render() {
    const h = host(); if (!h) return;
    const box = h.container();
    model = parse(h.getText());
    const paras = [[]];
    model.rows.forEach((r, ri) => { if (r.kind === 'blank') { if (paras[paras.length - 1].length) paras.push([]); } else paras[paras.length - 1].push(ri); });
    if (!paras[paras.length - 1].length) paras.pop();
    let html = '';
    paras.forEach((p, pi) => {
      html += '<div class="cv-para">';
      p.forEach((ri, k) => {
        const r = model.rows[ri];
        const split = k > 0 ? `<button class="cv-split" data-row="${ri}" title="Empezar un párrafo nuevo en esta línea">¶</button>` : '<span class="cv-split-ph"></span>';
        html += `<div class="cv-row">${split}<div class="cv-line">${renderRow(r, ri)}</div></div>`;
      });
      html += '</div>';
      if (pi < paras.length - 1) html += `<div class="cv-join-wrap"><button class="cv-join" data-row="${paras[pi + 1][0]}" title="Unir este párrafo con el siguiente">⇣ Unir párrafos</button></div>`;
    });
    box.innerHTML = html || '<p class="muted">La canción está vacía. Escribe la letra en la pestaña Texto.</p>';
  }

  function renderRow(r, ri) {
    const ctoks = r.c !== null ? tokens(model.lines[r.c]) : [];
    if (r.kind === 'chords') {
      // fila solo de acordes (introducciones, puentes instrumentales…)
      return '<div class="cv-chordsonly">' + ctoks.map((t, ti) =>
        `<button class="cv-chip${t.chord ? '' : ' note'}" data-row="${ri}" data-tok="${ti}">${esc(t.text)}</button>`).join('') +
        `<button class="cv-chip add" data-row="${ri}" data-add="1" title="Añadir acorde al final">+</button></div>`;
    }
    const lyric = model.lines[r.l];
    const ss = sylls(lyric);
    if (!ss.length) return esc(lyric);
    // asigna cada token de acordes a la sílaba en cuyo tramo cae
    const owner = ctoks.map((t) => {
      let k = 0;
      while (k + 1 < ss.length && ss[k + 1].pos <= t.pos) k++;
      return t.pos > ss[ss.length - 1].pos + ss[ss.length - 1].text.length ? -1 : k; // -1: más allá del final
    });
    let html = '';
    ss.forEach((sy, k) => {
      const mine = ctoks.map((t, ti) => ({ t, ti })).filter((x) => owner[x.ti] === k);
      const to = k + 1 < ss.length ? ss[k + 1].pos : Infinity;
      html += `<span class="cv-syl${mine.length ? ' has' : ''}${sy.wordEnd ? ' we' : ''}" data-row="${ri}" data-from="${sy.pos}" data-to="${to}" role="button" tabindex="0">` +
        `<span class="cv-ch">${mine.map((x) => `<b class="${x.t.chord ? '' : 'note'}">${esc(x.t.text)}</b>`).join(' ') || '&nbsp;'}</span>` +
        `<span class="cv-tx">${esc(sy.text)}</span></span>`;
    });
    const tail = ctoks.map((t, ti) => ({ t, ti })).filter((x) => owner[x.ti] === -1);
    const end = ss[ss.length - 1].pos + ss[ss.length - 1].text.length + 1;
    html += `<span class="cv-syl tail${tail.length ? ' has' : ''}" data-row="${ri}" data-from="${end}" data-to="Infinity" role="button" tabindex="0" title="Acorde al final de la línea">` +
      `<span class="cv-ch">${tail.map((x) => `<b class="${x.t.chord ? '' : 'note'}">${esc(x.t.text)}</b>`).join(' ') || '&nbsp;'}</span><span class="cv-tx">＋</span></span>`;
    return html;
  }

  // ---------- Cambios ----------
  function commit(lines) {
    host().setText(lines.join('\n'));
    render();
  }
  function setChordsInRange(ri, from, to, newText, add) {
    const r = model.rows[ri];
    const lines = model.lines.slice();
    let ctoks = r.c !== null ? tokens(lines[r.c]) : [];
    if (!add) ctoks = ctoks.filter((t) => !(t.pos >= from && t.pos < to) && !(to === Infinity && t.pos >= from));
    if (newText) {
      let pos = from;
      if (add) { const inR = ctoks.filter((t) => t.pos >= from && t.pos < to); if (inR.length) { const l = inR[inR.length - 1]; pos = l.pos + l.text.length + 1; } }
      ctoks.push({ pos, text: newText });
    }
    const line = build(ctoks);
    if (r.c !== null) {
      if (line.trim()) lines[r.c] = line; else lines.splice(r.c, 1);
    } else if (line.trim()) lines.splice(r.l, 0, line);
    commit(lines);
  }
  function setChordOnly(ri, ti, newText, isAdd) {
    const r = model.rows[ri];
    const lines = model.lines.slice();
    let ctoks = tokens(lines[r.c]);
    if (isAdd) { if (newText) { const last = ctoks[ctoks.length - 1]; ctoks.push({ pos: last ? last.pos + last.text.length + 3 : 0, text: newText }); } }
    else if (newText) ctoks[ti].text = newText;
    else ctoks.splice(ti, 1);
    const line = build(ctoks);
    if (line.trim()) lines[r.c] = line; else lines.splice(r.c, 1);
    commit(lines);
  }
  function splitAt(ri) {
    const r = model.rows[ri];
    const first = r.c !== null ? r.c : r.l;
    const lines = model.lines.slice();
    lines.splice(first, 0, '');
    commit(lines);
  }
  function joinAt(ri) {
    // quita las líneas en blanco justo antes de la fila ri
    const r = model.rows[ri];
    let first = r.c !== null ? r.c : r.l;
    const lines = model.lines.slice();
    while (first > 0 && !lines[first - 1].trim()) { lines.splice(first - 1, 1); first--; }
    commit(lines);
  }

  // ---------- Menú de acordes ----------
  const ROOTS = { latin: ['DO', 'RE', 'MI', 'FA', 'SOL', 'LA', 'SI'], us: ['C', 'D', 'E', 'F', 'G', 'A', 'B'] };
  const QUALS = [['', 'Mayor'], ['m', 'm'], ['7', '7'], ['m7', 'm7'], ['maj7', 'maj7'], ['sus4', 'sus4'], ['sus2', 'sus2'], ['dim', 'dim'], ['aug', 'aug'], ['6', '6'], ['9', '9'], ['add9', 'add9']];
  const menu = document.createElement('div');
  menu.className = 'cv-menu'; menu.hidden = true;
  menu.setAttribute('role', 'dialog'); menu.setAttribute('aria-label', 'Elegir acorde');
  document.body.appendChild(menu);
  let comp = { root: null, acc: '', q: '', bass: '' };

  function usedChords() {
    const set = new Map();
    model.rows.forEach((r) => { if (r.c !== null) tokens(model.lines[r.c]).forEach((t) => { if (t.chord) set.set(t.text, (set.get(t.text) || 0) + 1); }); });
    return [...set.entries()].sort((a, b) => b[1] - a[1]).map((x) => x[0]).slice(0, 16);
  }
  function composed() { return comp.root ? comp.root + comp.acc + comp.q + (comp.bass ? '/' + comp.bass : '') : ''; }

  function openMenu(target) {
    const ri = +target.dataset.row;
    pick = target.dataset.tok !== undefined || target.dataset.add
      ? { ri, tok: target.dataset.tok !== undefined ? +target.dataset.tok : null, add: !!target.dataset.add, el: target }
      : { ri, from: +target.dataset.from, to: target.dataset.to === 'Infinity' ? Infinity : +target.dataset.to, el: target };
    comp = { root: null, acc: '', q: '', bass: '' };
    const cur = pick.from !== undefined
      ? [...target.querySelectorAll('.cv-ch b')].map((b) => b.textContent)
      : (pick.tok !== null ? [target.textContent] : []);
    const word = pick.from !== undefined ? target.querySelector('.cv-tx').textContent : 'acorde';
    const notation = host().notation() === 'us' ? 'us' : 'latin';
    menu.innerHTML = `
      <div class="cv-mh"><span>${pick.from !== undefined ? 'Sílaba «' + esc(word.trim()) + '»' : (pick.add ? 'Añadir acorde' : 'Acorde')}</span>
        <button class="cv-x" data-act="close" aria-label="Cerrar">✕</button></div>
      ${cur.length ? `<div class="cv-cur">Ahora: ${cur.map((c) => '<b>' + esc(c) + '</b>').join(' ')}
        <button class="cv-rm" data-act="remove">Quitar</button></div>` : ''}
      ${usedChords().length ? `<div class="cv-lbl">En esta canción</div><div class="cv-grid used">${usedChords().map((c) => `<button data-set="${esc(c)}">${esc(c)}</button>`).join('')}</div>` : ''}
      <div class="cv-lbl">Componer</div>
      <div class="cv-grid roots">${ROOTS[notation].map((r) => `<button data-root="${r}">${r}</button>`).join('')}</div>
      <div class="cv-grid accs"><button data-acc="b">♭</button><button data-acc="" class="on">♮</button><button data-acc="#">♯</button></div>
      <div class="cv-grid quals">${QUALS.map(([q, n]) => `<button data-q="${q}" class="${q === '' ? 'on' : ''}">${n}</button>`).join('')}</div>
      <div class="cv-bass"><label>Bajo <select data-bass><option value="">—</option>${ROOTS[notation].flatMap((r) => [r, r + '#', r + 'b']).map((r) => `<option>${r}</option>`).join('')}</select></label></div>
      <div class="cv-foot">
        ${pick.from !== undefined && cur.length ? '<label class="cv-addchk"><input type="checkbox" data-addmode> Añadir otro (no reemplazar)</label>' : ''}
        <span class="ed-spacer"></span>
        <b class="cv-prev" data-prev>—</b>
        <button class="pill primary" data-act="apply" disabled>Poner</button>
      </div>`;
    menu.hidden = false;
    place(target);
    const first = menu.querySelector('[data-set], [data-root]');
    if (first) first.focus();
  }
  function place(target) {
    const r = target.getBoundingClientRect();
    const mw = Math.min(360, window.innerWidth - 16);
    menu.style.width = mw + 'px';
    if (window.innerWidth < 600) { menu.classList.add('sheet'); menu.style.left = ''; menu.style.top = ''; return; }
    menu.classList.remove('sheet');
    let left = Math.min(Math.max(8, r.left), window.innerWidth - mw - 8);
    let top = r.bottom + 6;
    menu.style.left = left + 'px'; menu.style.top = top + 'px';
    const mh = menu.offsetHeight;
    if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 6);
    menu.style.top = top + 'px';
  }
  function closeMenu() { menu.hidden = true; pick = null; }
  function apply(text) {
    if (!pick) return;
    const p = pick;
    closeMenu();
    if (p.from !== undefined) {
      const add = !!(menu.querySelector('[data-addmode]') || {}).checked;
      setChordsInRange(p.ri, p.from, p.to, text, add);
    } else setChordOnly(p.ri, p.tok, text, p.add);
  }
  function refreshComp() {
    menu.querySelectorAll('[data-root]').forEach((b) => b.classList.toggle('on', b.dataset.root === comp.root));
    menu.querySelectorAll('[data-acc]').forEach((b) => b.classList.toggle('on', b.dataset.acc === comp.acc));
    menu.querySelectorAll('[data-q]').forEach((b) => b.classList.toggle('on', b.dataset.q === comp.q));
    const c = composed();
    menu.querySelector('[data-prev]').textContent = c || '—';
    menu.querySelector('[data-act="apply"]').disabled = !c;
  }
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.act === 'close') closeMenu();
    else if (b.dataset.act === 'remove') apply('');
    else if (b.dataset.act === 'apply') apply(composed());
    else if (b.dataset.set !== undefined) apply(b.dataset.set);
    else if (b.dataset.root !== undefined) { comp.root = b.dataset.root; refreshComp(); }
    else if (b.dataset.acc !== undefined) { comp.acc = b.dataset.acc; refreshComp(); }
    else if (b.dataset.q !== undefined) { comp.q = b.dataset.q; refreshComp(); }
  });
  menu.addEventListener('change', (e) => { if (e.target.matches('[data-bass]')) { comp.bass = e.target.value; refreshComp(); } });
  menu.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); const el = pick && pick.el; closeMenu(); if (el) el.focus(); }
    else if (e.key === 'Enter' && composed() && !e.target.matches('button')) { e.preventDefault(); apply(composed()); }
  });
  document.addEventListener('pointerdown', (e) => {
    if (!menu.hidden && !menu.contains(e.target) && !(e.target.closest && e.target.closest('.cv-syl, .cv-chip'))) closeMenu();
  });

  // Clicks en el editor visual
  document.addEventListener('click', (e) => {
    const box = host() && host().container();
    if (!box || !box.contains(e.target)) return;
    const s = e.target.closest('.cv-syl, .cv-chip');
    if (s) { openMenu(s); return; }
    const sp = e.target.closest('.cv-split');
    if (sp) { splitAt(+sp.dataset.row); return; }
    const jn = e.target.closest('.cv-join');
    if (jn) joinAt(+jn.dataset.row);
  });
  document.addEventListener('keydown', (e) => {
    const s = e.target.closest && e.target.closest('.cv-syl');
    if (s && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openMenu(s); }
  });
  window.addEventListener('resize', () => { if (!menu.hidden && pick && pick.el && pick.el.isConnected) place(pick.el); });

  window.ChordEditor = { render, syllables, close: closeMenu };
})();
