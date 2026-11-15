// Modo "En directo": un emisor comparte lo que ve (canción, tono y desplazamiento)
// y los receptores lo siguen en tiempo real.
//
// Protocolo (capacidad `room` de la página publicada en Claude):
//   presence: { role: "emisor" | "receptor", name, follow: { of: <peer del emisor> } }
//   evento "sync" (solo emisores): { v: 1, seq, song, shift, scroll }
//     - estado ABSOLUTO; se reenvía en cada cambio, cuando entra alguien nuevo y cada 3 s
//     - scroll: fracción 0..1 de la partitura que está en lo alto de la pantalla (o null)
// Fuera de Claude (GitHub Pages, archivo local) no hay sala y el botón no aparece.
(function () {
  'use strict';
  if (!window.claude || typeof window.claude.use !== 'function' || !window.App) return;

  const $ = (id) => document.getElementById(id);
  const store = {
    get(k, d) { try { const v = localStorage.getItem('cm:' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('cm:' + k, JSON.stringify(v)); } catch (e) { /* nada */ } }
  };

  const live = {
    room: null,
    mode: 'off',            // off | emisor | receptor
    name: store.get('liveName', ''),
    followScroll: store.get('liveScroll', true),
    myPeer: null,
    following: null,        // peer del emisor que sigo
    paused: false,
    last: null,             // último estado recibido del emisor seguido
    seq: 0,
    applying: false,
    heartbeat: null,
    connected: false
  };

  // ---------- Medición del desplazamiento ----------
  function topOffset() {
    const top = document.querySelector('.top'), bar = document.querySelector('.chipbar');
    return (top ? top.offsetHeight : 0) + (bar ? bar.offsetHeight : 0);
  }
  function currentScroll() {
    const sheet = $('sheet');
    if (!sheet || $('song').hidden) return null;
    const r = sheet.getBoundingClientRect();
    if (!r.height) return null;
    const f = (topOffset() + 8 - r.top) / r.height;
    return Math.max(0, Math.min(1, Math.round(f * 1000) / 1000));
  }
  function applyScroll(f) {
    if (typeof f !== 'number' || !isFinite(f)) return;
    const sheet = $('sheet');
    if (!sheet || $('song').hidden) return;
    const r = sheet.getBoundingClientRect();
    const y = window.scrollY + r.top + Math.max(0, Math.min(1, f)) * r.height - topOffset() - 8;
    live.applying = true;
    window.scrollTo({ top: f <= 0 ? 0 : y, behavior: 'smooth' });
    setTimeout(() => { live.applying = false; }, 600);
  }

  // ---------- Emisor ----------
  function snapshot() {
    const s = window.App.getState();
    return { v: 1, seq: ++live.seq, song: s.song, shift: s.shift, scroll: currentScroll() };
  }
  function send() {
    if (live.mode !== 'emisor' || !live.room) return;
    live.room.emit('sync', snapshot()).catch((e) => {
      if (e && e.code === 'not_permitted') {
        setMode('receptor');
        flash('Con tu permiso solo puedes recibir. Pide al propietario acceso de colaborador para emitir.');
      }
    });
  }
  let scrollTimer = null, lastScrollSend = 0;
  function onScroll() {
    if (live.mode !== 'emisor') return;
    const now = Date.now();
    clearTimeout(scrollTimer);
    if (now - lastScrollSend > 250) { lastScrollSend = now; send(); }
    else scrollTimer = setTimeout(() => { lastScrollSend = Date.now(); send(); }, 250);
  }

  // ---------- Receptor ----------
  function onSync(msg) {
    if (live.mode !== 'receptor' || msg.sameTab) return;
    const d = msg.data;
    if (!d || typeof d !== 'object' || d.v !== 1 || typeof d.song !== 'string') return;
    if (!live.following) setFollowing(msg.peer);
    if (msg.peer !== live.following) return;
    const prevSong = live.last && live.last.song;
    live.last = { song: d.song, shift: d.shift, scroll: d.scroll };
    if (live.paused) { render(); return; }
    applyLast(prevSong !== d.song);
    render();
  }
  function applyLast(songChanged) {
    const d = live.last;
    if (!d) return;
    live.applying = true;
    window.App.apply({ song: d.song, shift: d.shift });
    live.applying = false;
    if (live.followScroll && d.scroll !== null && d.scroll !== undefined) {
      // tras cambiar de canción, esperar a que se pinte
      if (songChanged) setTimeout(() => applyScroll(d.scroll), 80);
      else applyScroll(d.scroll);
    }
  }
  function setFollowing(peer) {
    live.following = peer;
    live.paused = false;
    if (live.room && live.mode === 'receptor') {
      live.room.presence({ follow: peer ? { of: peer } : null }).catch(() => {});
    }
  }

  // Cambios hechos por la propia persona
  window.App.onChange(() => {
    if (live.mode === 'emisor') send();
    else if (live.mode === 'receptor' && !live.applying && live.last && !live.paused) {
      const s = window.App.getState();
      if (s.song !== live.last.song || s.shift !== live.last.shift) { live.paused = true; render(); }
    }
  });

  // ---------- Modo ----------
  function setMode(m) {
    live.mode = m;
    live.paused = false;
    live.last = null;
    clearInterval(live.heartbeat);
    if (!live.room) { render(); return; }
    if (m === 'off') {
      live.following = null;
      live.room.presence({ role: null, follow: null, name: null }).catch(() => {});
    } else if (m === 'emisor') {
      live.following = null;
      live.room.presence({ role: 'emisor', name: cleanName(live.name), follow: null }).catch(() => {});
      send();
      live.heartbeat = setInterval(send, 3000);
    } else {
      live.following = pickEmitter();
      live.room.presence({ role: 'receptor', name: cleanName(live.name), follow: live.following ? { of: live.following } : null }).catch(() => {});
    }
    render();
  }
  const cleanName = (n) => (n || '').replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁯﻿]/g, '').trim().slice(0, 40);

  function peersList() { try { return live.room ? live.room.peers() : []; } catch (e) { return []; } }
  function emitters() {
    return peersList().filter((p) => !p.sameTab && p.presence && p.presence.role === 'emisor');
  }
  function pickEmitter() { const e = emitters(); return e.length ? e[0].peer : null; }
  function peerLabel(p, i) {
    const n = p && p.presence && typeof p.presence.name === 'string' ? cleanName(p.presence.name) : '';
    return n || ('Emisor ' + (i + 1)) + (p && p.isMe ? ' (tú, otra pestaña)' : '');
  }

  // ---------- Interfaz ----------
  function render() {
    const btn = $('liveBtn'), panel = $('livePanel'), bar = $('liveBar');
    const ems = emitters();
    const receivers = peersList().filter((p) => !p.sameTab && p.presence && p.presence.role === 'receptor' &&
      p.presence.follow && p.presence.follow.of === live.myPeer);

    btn.classList.toggle('on', live.mode !== 'off');
    btn.querySelector('.lbl').textContent =
      live.mode === 'emisor' ? 'Emitiendo' : live.mode === 'receptor' ? 'Recibiendo' : 'En directo';

    panel.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === live.mode));
    $('liveFollowRow').hidden = live.mode !== 'receptor';
    $('liveScrollRow').hidden = live.mode !== 'receptor';

    const sel = $('liveFollow');
    sel.innerHTML = '';
    ems.forEach((p, i) => {
      const o = document.createElement('option');
      o.value = p.peer; o.textContent = peerLabel(p, i);
      if (p.peer === live.following) o.selected = true;
      sel.appendChild(o);
    });
    sel.disabled = ems.length < 2;

    let status = '';
    if (!live.connected) status = 'Conectando…';
    else if (live.mode === 'off') status = ems.length ? (ems.length === 1 ? 'Hay 1 persona emitiendo.' : `Hay ${ems.length} personas emitiendo.`) : 'Nadie está emitiendo ahora.';
    else if (live.mode === 'emisor') status = receivers.length === 1 ? '1 persona sigue tu pantalla.' : `${receivers.length} personas siguen tu pantalla.`;
    else if (!ems.length) status = 'Esperando a que alguien emita…';
    else status = live.paused ? 'En pausa: estás navegando por tu cuenta.' : 'Sigues la pantalla del emisor.';
    $('liveStatus').textContent = status;

    // barra inferior
    if (live.mode === 'receptor') {
      bar.hidden = false;
      const idx = ems.findIndex((p) => p.peer === live.following);
      const who = idx >= 0 ? peerLabel(ems[idx], idx) : null;
      $('liveBarText').textContent = !who ? 'Esperando emisor…' : live.paused ? 'En pausa · ' + who : 'Siguiendo a ' + who;
      $('liveBarBtn').hidden = !live.paused || !live.last;
    } else if (live.mode === 'emisor') {
      bar.hidden = false;
      $('liveBarText').textContent = 'Emitiendo · ' + (receivers.length === 1 ? '1 receptor' : receivers.length + ' receptores');
      $('liveBarBtn').hidden = true;
    } else bar.hidden = true;
    document.body.classList.toggle('live-on', live.mode !== 'off');
  }

  let flashTimer = null;
  function flash(t) {
    const el = $('liveFlash');
    el.textContent = t; el.hidden = false;
    clearTimeout(flashTimer); flashTimer = setTimeout(() => { el.hidden = true; }, 6000);
  }

  function buildUI() {
    const actions = document.querySelector('.top-actions');
    const btn = document.createElement('button');
    btn.id = 'liveBtn'; btn.className = 'pill live-btn';
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<span class="dot"></span><span class="lbl">En directo</span>';
    actions.insertBefore(btn, actions.firstChild);

    const panel = document.createElement('div');
    panel.id = 'livePanel'; panel.className = 'live-panel'; panel.hidden = true;
    panel.innerHTML = `
      <h3>Ver en directo</h3>
      <p class="muted small">Quien emite comparte su canción, el tono y por dónde va. Quien recibe lo ve igual en su pantalla.</p>
      <div class="seg" role="group" aria-label="Modo">
        <button data-mode="off">Desactivado</button>
        <button data-mode="emisor">Emitir</button>
        <button data-mode="receptor">Recibir</button>
      </div>
      <label class="field">Tu nombre (opcional)
        <input id="liveName" maxlength="40" placeholder="p. ej. Guitarra 1" autocomplete="off">
      </label>
      <label class="field" id="liveFollowRow" hidden>Seguir a
        <select id="liveFollow"></select>
      </label>
      <label class="toggle" id="liveScrollRow" hidden><input type="checkbox" id="liveScroll"> Seguir también el desplazamiento</label>
      <p class="live-status" id="liveStatus"></p>
      <p class="live-flash" id="liveFlash" hidden></p>`;
    document.body.appendChild(panel);

    const bar = document.createElement('div');
    bar.id = 'liveBar'; bar.className = 'live-bar'; bar.hidden = true;
    bar.innerHTML = '<span class="dot"></span><span id="liveBarText"></span><button id="liveBarBtn" hidden>Volver al directo</button>';
    document.body.appendChild(bar);

    btn.onclick = () => {
      panel.hidden = !panel.hidden;
      btn.setAttribute('aria-expanded', String(!panel.hidden));
    };
    document.addEventListener('click', (e) => {
      if (!panel.hidden && !panel.contains(e.target) && !btn.contains(e.target)) {
        panel.hidden = true; btn.setAttribute('aria-expanded', 'false');
      }
    });
    panel.querySelectorAll('[data-mode]').forEach((b) => { b.onclick = () => setMode(b.dataset.mode); });
    $('liveName').value = live.name;
    $('liveName').oninput = (e) => {
      live.name = e.target.value; store.set('liveName', live.name);
      if (live.mode !== 'off') live.room.presence({ name: cleanName(live.name) }).catch(() => {});
    };
    $('liveFollow').onchange = (e) => { setFollowing(e.target.value); live.last = null; render(); };
    $('liveScroll').checked = live.followScroll;
    $('liveScroll').onchange = (e) => { live.followScroll = e.target.checked; store.set('liveScroll', live.followScroll); };
    $('liveBarBtn').onclick = () => { live.paused = false; applyLast(true); render(); };
    $('liveBarText').onclick = () => btn.click();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // ---------- Conexión ----------
  window.claude.use('room').then((room) => {
    if (!room) return;
    live.room = room;
    buildUI();
    room.on('sync', onSync, () => {});
    room.onConnection((c) => { live.connected = c; render(); }, () => {});
    room.onPeers((ch) => {
      const me = ch.peers.find((p) => p.sameTab);
      if (me) live.myPeer = me.peer;
      if (live.mode === 'emisor' && ch.joined.some((p) => !p.sameTab)) send();
      if (live.mode === 'receptor') {
        if (live.following && ch.left.some((p) => p.peer === live.following)) { setFollowing(pickEmitter()); live.last = null; }
        else if (!live.following) { const e = pickEmitter(); if (e) setFollowing(e); }
      }
      render();
    }, () => {});
    render();
  }).catch(() => { /* sin sala: la página funciona igual */ });
})();
