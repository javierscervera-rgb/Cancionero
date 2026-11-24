// Modo "En directo": hay dos tipos de emisor y los receptores los siguen en tiempo real.
//   - Líder (role "emisor"): decide la canción, el tono y el párrafo.
//   - Letras (role "letras"): sigue la canción y el tono del líder y solo pasa los párrafos.
//
// Protocolo (capacidad `room` de la página publicada en Claude):
//   presence: { role: "emisor" | "letras" | "receptor", name, follow: { of: <peer del líder> } }
//   evento "sync" del líder:  { v: 2, seq, song, shift, para, pt, rv }
//     - estado ABSOLUTO; se reenvía en cada cambio, cuando entra alguien nuevo y cada 3 s
//     - para: índice del párrafo marcado (se centra en pantalla) o null; pt: cuándo cambió
//   evento "sync" de Letras: { v: 2, kind: "para", song, para, pt }
//     - gana el párrafo con el pt más reciente (del líder o de Letras) dentro de la misma canción
// Transporte:
//   - Dentro de Claude: capacidad `room` de la plataforma.
//   - Fuera de Claude (GitHub Pages): broker MQTT público por WebSocket seguro, sin servidor
//     propio. Hay que elegir un código de sala; todos los que usen el mismo código se ven.
(function () {
  'use strict';
  if (!window.App) return;
  const IN_CLAUDE = !!(window.claude && typeof window.claude.use === 'function');

  const $ = (id) => document.getElementById(id);
  const store = {
    get(k, d) { try { const v = localStorage.getItem('cm:' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('cm:' + k, JSON.stringify(v)); } catch (e) { /* nada */ } }
  };

  const live = {
    room: null,
    mode: 'off',            // off | emisor (líder) | letras | receptor
    name: store.get('liveName', ''),
    followScroll: store.get('liveScroll', true),
    myPeer: null,
    following: null,        // peer del líder que sigo (receptor y Letras)
    paraT: 0,               // líder: cuándo cambió el párrafo por última vez
    blankT: 0,              // cuándo se puso o quitó la pantalla en negro (líder o Letras)
    paused: false,
    last: null,             // último estado recibido del emisor seguido
    seq: 0,
    applying: false,
    heartbeat: null,
    connected: false,
    ct: 0,                  // líder: cuándo cambió su estado (para sincronizarse con un segundo líder)
    co: false,              // soy el segundo líder (autorizado por el primero)
    asking: null            // petición para ser segundo líder: { to, t }
  };

  // ---------- Emisor ----------
  function snapshot() {
    const s = window.App.getState();
    if (live.mode === 'letras') return { v: 2, kind: 'para', seq: ++live.seq, song: live.last ? live.last.song : '', para: live.last ? live.last.para : null, sub: live.last ? live.last.sub || 0 : 0, pt: live.last ? live.last.pt : 0, blank: s.blank, bt: live.blankT };
    return { v: 2, seq: ++live.seq, song: s.song, shift: s.shift, para: s.para, sub: s.sub, mc: window.App.maxChars(), pt: live.paraT, ct: live.ct, blank: s.blank, bt: live.blankT, ps: window.App.pres(), ms: window.App.mstate(), rv: window.Cloud ? window.Cloud.rev() : 0 };
  }
  const followerMode = () => live.mode === 'receptor' || live.mode === 'letras';
  function send() {
    if ((live.mode !== 'emisor' && live.mode !== 'letras') || !live.room) return;
    if (live.mode === 'letras' && !live.last) return;
    live.room.emit('sync', snapshot()).catch((e) => {
      if (e && e.code === 'not_permitted') {
        setMode('receptor');
        flash('Con tu permiso solo puedes recibir. Pide al propietario acceso de colaborador para emitir.');
      }
    });
  }
  // ---------- Receptor ----------
  function onSync(msg) {
    if (msg.sameTab) return;
    const d = msg.data;
    if (!d || typeof d !== 'object' || d.v !== 2 || typeof d.song !== 'string') return;
    const para = Number.isInteger(d.para) ? d.para : null;
    const sub = Number.isInteger(d.sub) && d.sub >= 0 ? d.sub : 0;
    const pt = typeof d.pt === 'number' ? d.pt : 0;
    // pantalla en negro: gana el cambio más reciente (del líder o de Letras)
    if (typeof d.blank === 'boolean' && typeof d.bt === 'number' && d.bt > live.blankT && live.mode !== 'off' &&
        (d.kind === 'para' ? isRole(msg.peer, 'letras') : (live.mode === 'emisor' ? isRole(msg.peer, 'emisor') : (!live.following || msg.peer === live.following)))) {
      live.blankT = d.bt;
      if (window.App.blank() !== d.blank) {
        window.App.apply({ blank: d.blank });
        if (live.mode === 'emisor') setTimeout(send, 250);
      }
    }
    // ---- Letras controla el multimedia ----
    if (d.kind === 'media') {
      if (!isRole(msg.peer, 'letras') || !d.ms || typeof d.ms !== 'object') return;
      if (live.mode === 'emisor') { if ((+d.ms.t || 0) > window.App.mstate().t) { window.App.setMState(d.ms, true); setTimeout(send, 150); } }
      else if (followerMode()) window.App.setMState(d.ms, true);
      return;
    }
    // ---- Letras ha pasado un párrafo ----
    if (d.kind === 'para') {
      if (!isRole(msg.peer, 'letras')) return;
      if (live.mode === 'emisor') {
        // el líder también lo ve, y lo incluye en su estado para todos
        const s = window.App.getState();
        if (d.song === s.song && pt > live.paraT && (para !== s.para || sub !== s.sub)) {
          live.paraT = pt;
          live.applying = true;
          window.App.apply({ song: d.song, para, sub });
          setTimeout(() => { live.applying = false; }, 200);
          setTimeout(send, 250);
        }
      } else if (followerMode() && live.last && d.song === live.last.song && pt > (live.last.pt || 0)) {
        live.last.para = para; live.last.sub = sub; live.last.pt = pt;
        if (!live.paused) applyLast();
        render();
      }
      return;
    }
    // ---- Otro líder (hay dos): el cambio más reciente gana y lo reenvía el primero ----
    if (live.mode === 'emisor' && !d.kind && isRole(msg.peer, 'emisor')) {
      if ((+d.ct || 0) > live.ct) {
        live.ct = +d.ct;
        live.applying = true;
        if (Number.isInteger(d.mc) && d.mc !== window.App.maxChars()) window.App.setMaxChars(d.mc, false);
        if (d.ps && typeof d.ps === 'object') window.App.setPres(d.ps, true);
        if (d.ms && typeof d.ms === 'object') window.App.setMState(d.ms, true);
        window.App.apply({ song: d.song, shift: d.shift, para, sub });
        setTimeout(() => { live.applying = false; }, 450);
        setTimeout(send, 500);
      }
      return;
    }
    // ---- Estado del líder ----
    if (!followerMode()) return;
    if (!live.following) setFollowing(msg.peer);
    if (msg.peer !== live.following) return;
    // el líder tiene una versión más nueva del cancionero compartido
    if (window.Cloud && Number.isInteger(d.rv)) window.Cloud.behind(d.rv);
    // mismo máximo de caracteres que el líder, para que los párrafos coincidan
    if (Number.isInteger(d.mc) && d.mc !== window.App.maxChars()) window.App.setMaxChars(d.mc, false);
    // tamaño y modo de la letra en la pantalla completa, como los decide el líder
    if (d.ps && typeof d.ps === 'object') window.App.setPres(d.ps, true);
    if (d.ms && typeof d.ms === 'object') window.App.setMState(d.ms, true);
    const prev = live.last;
    live.last = { song: d.song, shift: d.shift, para, sub, pt };
    // si Letras pasó un párrafo más reciente de esta canción, se mantiene
    if (prev && prev.song === d.song && (prev.pt || 0) > pt) { live.last.para = prev.para; live.last.sub = prev.sub; live.last.pt = prev.pt; }
    if (live.paused) { render(); return; }
    applyLast();
    render();
  }
  function isRole(peer, role) {
    const p = peersList().find((x) => x.peer === peer);
    return !!(p && p.presence && p.presence.role === role);
  }
  function applyLast() {
    const d = live.last;
    if (!d) return;
    live.applying = true;
    window.App.apply({ song: d.song, shift: d.shift, para: d.para, sub: d.sub || 0 }, { noPara: live.mode === 'receptor' && !live.followScroll });
    setTimeout(() => { live.applying = false; }, 200);
  }
  function setFollowing(peer) {
    live.following = peer;
    live.paused = false;
    if (live.room && followerMode()) {
      live.room.presence({ follow: peer ? { of: peer } : null }).catch(() => {});
    }
  }

  // Cambios hechos por la propia persona
  window.App.onChange((why) => {
    if (why === 'pres') { if (live.mode === 'emisor') { if (!live.applying) live.ct = Date.now(); send(); } return; }
    if (why === 'media') {
      // reproducción del multimedia: la controlan el líder y Letras
      if (live.mode === 'emisor') send();
      else if (live.mode === 'letras' && live.room) live.room.emit('sync', { v: 2, kind: 'media', song: '', ms: window.App.mstate() }).catch(() => {});
      return;
    }
    if (why === 'blank') {
      // poner o quitar la pantalla en negro: solo el líder o Letras lo envían
      live.blankT = Date.now();
      if (live.mode === 'emisor' || live.mode === 'letras') send();
      return;
    }
    if (live.mode === 'emisor') {
      if (!live.applying && (why === 'para' || why === 'song')) live.paraT = Date.now();
      if (!live.applying) live.ct = Date.now();
      send();
    } else if (live.mode === 'letras' && !live.applying && live.last) {
      const s = window.App.getState();
      if (s.song === live.last.song && s.shift === live.last.shift) {
        // pasar párrafo (o trozo de párrafo): es lo único que puede hacer Letras
        if (s.para !== live.last.para || s.sub !== (live.last.sub || 0)) { live.last.para = s.para; live.last.sub = s.sub; live.last.pt = Date.now(); send(); }
      } else {
        flash('Con el rol Letras solo puedes pasar los párrafos. La canción y el tono los decide el líder.');
        applyLast();
      }
    } else if (live.mode === 'receptor' && !live.applying && live.last && !live.paused) {
      const s = window.App.getState();
      if (s.song !== live.last.song || s.shift !== live.last.shift ||
          (live.followScroll && s.para !== live.last.para)) { live.paused = true; render(); }
    }
  });

  // ---------- Bloqueo de zoom y scroll horizontal al emitir ----------
  const vp = document.querySelector('meta[name="viewport"]');
  const vpDefault = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no'; // el zoom está siempre desactivado
  const noGesture = (e) => e.preventDefault();
  const noPinch = (e) => { if (e.touches && e.touches.length > 1) e.preventDefault(); };
  function lockView(on) {
    document.body.classList.toggle('emitting', on);
    document.documentElement.classList.toggle('emitting', on);
    if (vp) vp.setAttribute('content', on ? 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no' : vpDefault);
    const fn = on ? 'addEventListener' : 'removeEventListener';
    ['gesturestart', 'gesturechange'].forEach((t) => document[fn](t, noGesture, { passive: false }));
    document[fn]('touchmove', noPinch, { passive: false });
    if (on) window.scrollTo({ left: 0, top: window.scrollY });
    if (window.App.refit) window.App.refit();
  }

  // ---------- Modo ----------
  function setMode(m) {
    if (m !== 'off') live.watching = false;
    if (live.mode === 'receptor' && m !== 'receptor' && window.App.clearTemp) window.App.clearTemp();
    if (!IN_CLAUDE && m !== 'off' && !live.room) {
      if (!cleanRoom(live.sala)) { flash('Escribe primero un código de sala.'); $('liveSala').focus(); m = 'off'; }
      else connectP2P();
    }
    lockView(m === 'emisor' || m === 'letras');
    setTimeout(sharePresence, 300);
    live.mode = m;
    live.paused = false;
    live.last = null;
    clearInterval(live.heartbeat);
    if (!live.room) { render(); return; }
    if (m === 'off') {
      live.following = null;
      if (!IN_CLAUDE) { disconnectP2P(); if (!$('livePanel').hidden) watch(); render(); return; }
      live.room.presence({ role: null, follow: null, name: null }).catch(() => {});
    } else if (m === 'emisor') {
      live.following = null;
      live.paraT = Date.now();
      live.room.presence({ role: 'emisor', name: cleanName(live.name), follow: null, co: live.co || null, ask: null }).catch(() => {});
      send();
      live.heartbeat = setInterval(send, 3000);
    } else {
      if (live.room && live.room.emit && !IN_CLAUDE) live.room.emit('sync', null);
      live.following = pickEmitter();
      live.room.presence({ role: m, name: cleanName(live.name), follow: live.following ? { of: live.following } : null }).catch(() => {});
      if (m === 'letras') live.heartbeat = setInterval(send, 3000);
    }
    render();
  }
  // Si otra persona ya ocupa ese papel, devuelve el motivo (y no se puede elegir)
  function takenMsg(m) {
    if (live.mode === m || !live.room) return '';
    if (m === 'emisor') {
      // puede haber dos líderes: el segundo, con permiso del primero
      const ls = emitters();
      return ls.length >= 2 ? 'Ya hay dos líderes en la sala (' + ls.map((p) => cleanName(p.presence.name) || 'sin nombre').join(' y ') + ').' : '';
    }
    const p = peersList().find((x) => !x.sameTab && x.presence && x.presence.role === m);
    if (!p) return '';
    const n = cleanName(p.presence.name);
    return m === 'emisor'
      ? 'Ya hay un líder' + (n ? ' (' + n + ')' : '') + '. Solo puede haber uno en la sala.'
      : 'Ya hay alguien en Letras' + (n ? ' (' + n + ')' : '') + '. Solo puede haber uno en la sala.';
  }
  const cleanName = (n) => (n || '').replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁯﻿]/g, '').trim().slice(0, 40);

  function peersList() { try { return live.room ? live.room.peers() : []; } catch (e) { return []; } }
  function emitters() {
    // el primer líder antes que el segundo (los receptores siguen al primero)
    return peersList().filter((p) => !p.sameTab && p.presence && p.presence.role === 'emisor')
      .sort((a, b) => (a.presence.co ? 1 : 0) - (b.presence.co ? 1 : 0));
  }
  // Al abrir «Ver en directo» sin estar activo, se mira la sala (sin papel) para ver quién está conectado
  const escH = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function watch() {
    if (IN_CLAUDE || live.mode !== 'off' || live.room || !cleanRoom(live.sala)) { render(); return; }
    live.watching = true;
    connectP2P();
    live.room.presence({ name: cleanName(live.name) }).catch(() => {});
    render();
  }
  function unwatch() {
    if (!live.watching) return;
    live.watching = false;
    if (live.mode === 'off' && live.room && !IN_CLAUDE) { disconnectP2P(); render(); }
  }
  // ---------- Segundo líder: se pide permiso al primero ----------
  function requestLead() {
    const lead = emitters()[0];
    if (!lead || !live.room) return;
    live.asking = { to: lead.peer, t: Date.now() };
    live.room.presence({ ask: live.asking, name: cleanName(live.name) }).catch(() => {});
    flash('Pidiendo permiso a ' + (cleanName(lead.presence.name) || 'el líder') + ' para ser también líder…');
    clearTimeout(live.askTimer);
    live.askTimer = setTimeout(() => {
      if (!live.asking) return;
      live.asking = null; if (live.room) live.room.presence({ ask: null }).catch(() => {});
      flash('El líder no ha respondido. Puedes volver a pedirlo.');
    }, 60000);
  }
  const answered = {};
  function checkAsks() {
    const ps = peersList();
    // soy el que pide: ¿me han respondido?
    if (live.asking) {
      const lead = ps.find((p) => p.peer === live.asking.to);
      const pr = lead && lead.presence;
      if (!lead || pr.role !== 'emisor') { live.asking = null; if (live.room) live.room.presence({ ask: null }).catch(() => {}); }
      else if (pr.grant && pr.grant.to === live.myPeer && pr.grant.t === live.asking.t) {
        live.asking = null; clearTimeout(live.askTimer);
        live.co = true; setMode('emisor');
        flash('Ya eres el segundo líder: lo que cambies lo verán todos.');
      } else if (pr.deny && pr.deny.to === live.myPeer && pr.deny.t === live.asking.t) {
        live.asking = null; clearTimeout(live.askTimer);
        if (live.room) live.room.presence({ ask: null }).catch(() => {});
        flash((cleanName(pr.name) || 'El líder') + ' no ha autorizado un segundo líder.');
      }
    }
    // soy el primer líder: ¿alguien pide permiso?
    if (live.mode === 'emisor' && !live.co) {
      const req = ps.find((p) => !p.sameTab && p.presence && p.presence.ask && p.presence.ask.to === live.myPeer && !answered[p.peer + ':' + p.presence.ask.t]);
      showAsk(req || null);
    } else showAsk(null);
  }
  function showAsk(p) {
    let box = $('liveAsk');
    if (!p) { if (box) box.hidden = true; return; }
    if (!box) {
      box = document.createElement('div');
      box.id = 'liveAsk'; box.className = 'live-ask'; box.setAttribute('role', 'alertdialog');
      document.body.appendChild(box);
    }
    const key = p.peer + ':' + p.presence.ask.t;
    if (box.dataset.key === key && !box.hidden) return;
    box.dataset.key = key;
    box.innerHTML = '<p><b>' + escH(cleanName(p.presence.name) || 'Alguien') + '</b> quiere ser también líder.</p>' +
      '<div><button type="button" class="pill" data-a="no">Rechazar</button><button type="button" class="pill primary" data-a="yes">Aceptar</button></div>';
    box.hidden = false;
    box.querySelectorAll('button').forEach((b) => {
      b.onclick = () => {
        answered[key] = true; box.hidden = true;
        const ans = { to: p.peer, t: p.presence.ask.t };
        live.room.presence(b.dataset.a === 'yes' ? { grant: ans, deny: null } : { deny: ans, grant: null }).catch(() => {});
      };
    });
  }
  function pickEmitter() { const e = emitters(); return e.length ? e[0].peer : null; }
  function peerLabel(p, i) {
    const n = p && p.presence && typeof p.presence.name === 'string' ? cleanName(p.presence.name) : '';
    return n || ('Líder ' + (i + 1)) + (p && p.isMe ? ' (tú, otra pestaña)' : '');
  }

  // ---------- Interfaz ----------
  function render() {
    const btn = $('liveBtn'), panel = $('livePanel'), bar = $('liveBar');
    const ems = emitters();
    const followers = peersList().filter((p) => !p.sameTab && p.presence && (p.presence.role === 'receptor' || p.presence.role === 'letras') &&
      p.presence.follow && p.presence.follow.of === live.myPeer);
    const receivers = followers.filter((p) => p.presence.role === 'receptor');
    const lyricists = followers.filter((p) => p.presence.role === 'letras');

    btn.classList.toggle('on', live.mode !== 'off');
    btn.querySelector('.lbl').textContent =
      live.mode === 'emisor' ? 'Líder' : live.mode === 'letras' ? 'Letras' : live.mode === 'receptor' ? 'Recibir' : 'Desactivado';
    btn.title = 'Directo: ' + btn.querySelector('.lbl').textContent;

    panel.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === live.mode));
    // solo puede haber un líder y una persona en Letras por sala
    const notes = [];
    ['emisor', 'letras'].forEach((m) => {
      const b = panel.querySelector('[data-mode="' + m + '"]');
      const msg = takenMsg(m);
      b.classList.toggle('taken', !!msg);
      b.setAttribute('aria-disabled', String(!!msg));
      b.title = msg || '';
      if (msg) notes.push(msg);
    });
    $('liveTaken').textContent = notes.join(' ');
    $('liveTaken').hidden = !notes.length;
    $('liveFollowRow').hidden = !followerMode();
    $('liveMaxRow').hidden = live.mode !== 'emisor';
    const mc = window.App.maxChars();
    $('liveMaxVal').textContent = mc ? mc + ' caracteres' : 'Sin límite';
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

    if (!IN_CLAUDE && live.room && live.connected && peersList().some((p) => !p.isMe && !p.sameTab && p.presence && p.presence.role)) rememberSala(live.sala);
    let status = '';
    const nR = receivers.length === 1 ? '1 receptor' : receivers.length + ' receptores';
    if (!IN_CLAUDE && live.mode === 'off' && !live.room) status = 'Elige o escribe una sala y pulsa Líder, Letras o Recibir. Todos deben usar la misma.';
    else if (!live.connected) status = 'Conectando…';
    else if (live.mode === 'off') status = ems.length ? (ems.length === 1 ? 'Hay 1 líder emitiendo.' : `Hay ${ems.length} líderes emitiendo.`) : 'Nadie está emitiendo ahora.';
    else if (live.mode === 'emisor') status = 'Eres el líder: ' + nR + (lyricists.length ? ' y ' + lyricists.length + ' en Letras' : '') + '.';
    else if (!ems.length) status = IN_CLAUDE ? 'Esperando a que haya un líder…' : 'Esperando a que haya un líder en la sala «' + cleanRoom(live.sala) + '»…';
    else if (live.mode === 'letras') status = 'Letras: sigues la canción y el tono del líder y pasas los párrafos para todos.';
    else status = live.paused ? 'En pausa: estás navegando por tu cuenta.' : 'Sigues al líder.';
    $('liveStatus').textContent = status;
    // quién está conectado a la sala ahora mismo
    const people = peersList().filter((p) => !p.sameTab && p.presence && (p.presence.role || p.presence.name));
    const ROLE = { emisor: 'Líder', letras: 'Letras', receptor: 'Recibir' };
    $('livePeople').hidden = !live.room || !live.connected;
    $('livePeople').innerHTML = '<b>' + (people.length ? 'Conectados (' + people.length + ')' : 'No hay nadie más conectado') + '</b>' +
      people.map((p) => '<span class="lp"><i class="lp-' + (p.presence.role || 'off') + '"></i>' + escH(cleanName(p.presence.name) || 'Sin nombre') +
        ' · ' + (ROLE[p.presence.role] || 'Desactivado') + (p.presence.fs ? ' · pantalla completa' : '') + '</span>').join('');

    // barra inferior: completa 10 s cada vez que cambia su texto; luego se reduce al punto
    if (followerMode()) {
      bar.hidden = false;
      const idx = ems.findIndex((p) => p.peer === live.following);
      const who = idx >= 0 ? peerLabel(ems[idx], idx) : null;
      $('liveBarText').textContent = live.mode === 'letras'
        ? (who ? 'Letras · con ' + who : 'Letras · esperando líder…')
        : (!who ? 'Esperando líder…' : live.paused ? 'En pausa · ' + who : 'Siguiendo a ' + who);
      $('liveBarBtn').hidden = live.mode === 'letras' || !live.paused || !live.last;
    } else if (live.mode === 'emisor') {
      bar.hidden = false;
      $('liveBarText').textContent = 'Líder · ' + nR + (lyricists.length ? ' · ' + lyricists.length + ' Letras' : '');
      $('liveBarBtn').hidden = true;
    } else bar.hidden = true;
    const barKey = bar.hidden ? '' : $('liveBarText').textContent + '|' + $('liveBarBtn').hidden;
    if (barKey !== live.barKey) { live.barKey = barKey; if (barKey) expandBar(); }
    // aro rojo sin relleno cuando el receptor no está siguiendo a nadie (en pausa o sin emisor)
    const notFollowing = followerMode() && (live.paused || !ems.some((p) => p.peer === live.following));
    bar.classList.toggle('off', notFollowing);
    document.body.classList.toggle('live-on', live.mode !== 'off');
    document.body.classList.toggle('receiving', followerMode()); // el tono lo decide el líder
    document.body.classList.toggle('lyrics-op', live.mode === 'letras');
    // móvil en «Letras» con un líder conectado: solo la letra y los controles mínimos
    document.body.classList.toggle('letras-ui', live.mode === 'letras' && ems.length > 0 && matchMedia('(max-width: 820px)').matches);
    updateLetrasUi();
  }

  let luFs = false;
  function lockPortrait() {
    if (!document.body.classList.contains('letras-ui')) return;
    const lock = () => { try { screen.orientation && screen.orientation.lock && screen.orientation.lock('portrait').catch(() => {}); } catch (e) {} };
    const de = document.documentElement;
    if (!document.fullscreenElement && de.requestFullscreen) {
      de.requestFullscreen({ navigationUI: 'hide' }).then(() => { luFs = true; lock(); }).catch(lock);
    } else lock();
  }
  function unlockPortrait() {
    try { screen.orientation && screen.orientation.unlock && screen.orientation.unlock(); } catch (e) {}
    if (luFs && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    luFs = false;
  }
  let luWas = false;
  function updateLetrasUi() {
    const on = document.body.classList.contains('letras-ui');
    if (luWas && !on) unlockPortrait();
    luWas = on;
    const b = $('luBlank');
    if (!b) return;
    const hidden = window.App.blank();
    b.setAttribute('aria-pressed', String(hidden));
    b.innerHTML = hidden ? '<span class="lu-ico">👁</span><span>Mostrar letra</span>' : '<span class="lu-ico">⊘</span><span>Ocultar letra</span>';
  }
  window.matchMedia('(max-width: 820px)').addEventListener('change', () => render());

  function expandBar() {
    const bar = $('liveBar');
    bar.classList.remove('mini');
    clearTimeout(live.barTimer);
    live.barTimer = setTimeout(() => bar.classList.add('mini'), 10000);
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
    btn.innerHTML = '<span class="dot"></span><span class="lbl">Desactivado</span>';
    actions.insertBefore(btn, actions.firstChild);

    const panel = document.createElement('div');
    panel.id = 'livePanel'; panel.className = 'live-panel'; panel.hidden = true;
    panel.innerHTML = `
      <h3>Ver en directo</h3>
      <p class="muted small"><b>Líder</b>: elige la canción, el tono y el párrafo. <b>Letras</b>: sigue al líder y solo pasa los párrafos.
        <b>Recibir</b>: tu pantalla muestra lo que marcan.</p>
      <div class="seg seg4" role="group" aria-label="Modo">
        <button data-mode="off">Desactivado</button>
        <button data-mode="emisor">Líder</button>
        <button data-mode="letras">Letras</button>
        <button data-mode="receptor">Recibir</button>
      </div>
      <p class="live-taken" id="liveTaken" hidden></p>
      <div class="sala" id="liveSalaRow" hidden>
        <label class="field">Código de sala
          <span class="sala-in"><input id="liveSala" maxlength="40" placeholder="p. ej. misa-12" autocomplete="off" autocapitalize="off" spellcheck="false"><button type="button" class="sala-more" id="liveSalaMore" aria-label="Últimas salas" title="Últimas salas">▾</button></span>
        </label>
        <div class="sala-list" id="liveSalaList" hidden></div>
        <button class="link-btn" id="liveCopy" type="button">Copiar enlace para invitar</button>
      </div>
      <label class="field">Tu nombre (opcional)
        <input id="liveName" maxlength="40" placeholder="p. ej. Guitarra 1" autocomplete="off">
      </label>
      <div class="field live-max" id="liveMaxRow" hidden>
        <span>Máximo de caracteres por párrafo</span>
        <span class="lm-ctl">
          <button type="button" class="pill" id="liveMaxDown" aria-label="Menos caracteres">−</button>
          <b id="liveMaxVal"></b>
          <button type="button" class="pill" id="liveMaxUp" aria-label="Más caracteres">+</button>
        </span>
        <small class="muted">Los párrafos más largos se dividen. Se guarda en Drive y lo siguen todos.</small>
      </div>
      <label class="field" id="liveFollowRow" hidden>Líder al que sigues
        <select id="liveFollow"></select>
      </label>
      <label class="toggle" id="liveScrollRow" hidden><input type="checkbox" id="liveScroll"> Centrar el párrafo que marquen</label>
      <div class="live-people" id="livePeople" hidden></div>
      <p class="live-status" id="liveStatus"></p>
      <p class="live-flash" id="liveFlash" hidden></p>`;
    document.body.appendChild(panel);

    // ---- Controles del modo «Letras» en el móvil ----
    const lu = document.createElement('div');
    lu.id = 'letrasUi'; lu.className = 'letras-ui-ctl';
    lu.innerHTML = `
      <div class="lu-block" aria-hidden="true"></div>
      <button class="lu-x" id="luExit" aria-label="Salir del modo Letras" title="Salir del modo Letras">✕</button>
      <div class="lu-arrows">
        <button id="luUp" aria-label="Párrafo anterior">▲</button>
        <button id="luDown" aria-label="Párrafo siguiente">▼</button>
      </div>
      <button class="lu-blank" id="luBlank" aria-pressed="false"></button>`;
    document.body.appendChild(lu);
    $('luExit').onclick = () => setMode('off');
    const buzz = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} };
    $('luUp').onclick = () => { buzz(25); window.App.step(-1); };
    $('luDown').onclick = () => { buzz(25); window.App.step(1); };
    $('luBlank').onclick = () => { const hide = !window.App.blank(); buzz(hide ? 300 : 25); window.App.setBlank(hide); };
    // Bloquear la rotación: Android solo lo permite en pantalla completa y tras un toque
    lu.addEventListener('pointerdown', lockPortrait, true);
    // Nada más se puede tocar: sin scroll, sin zoom, sin menú contextual
    const stop = e => { if (document.body.classList.contains('letras-ui') && !(e.type === 'touchmove' && e.touches && e.touches.length === 1 && e.target.closest && e.target.closest('#content'))) e.preventDefault(); };
    ['touchmove', 'gesturestart', 'gesturechange', 'dblclick', 'contextmenu'].forEach(t => document.addEventListener(t, stop, { passive: false }));
    window.App.onView(updateLetrasUi);

    const bar = document.createElement('div');
    bar.id = 'liveBar'; bar.className = 'live-bar'; bar.hidden = true;
    bar.innerHTML = '<span class="dot"></span><span id="liveBarText"></span><button id="liveBarBtn" hidden>Volver al directo</button>';
    bar.setAttribute('role', 'status');
    bar.addEventListener('click', (e) => {
      if (!bar.classList.contains('mini')) return;
      e.stopPropagation();
      // receptor siguiendo: al pulsar el punto se pausa y aparece «En pausa · Volver al directo»
      if (live.mode === 'receptor' && !live.paused && live.last) { live.paused = true; render(); expandBar(); }
      else expandBar();
    });
    document.body.appendChild(bar);

    btn.onclick = () => {
      panel.hidden = !panel.hidden;
      btn.setAttribute('aria-expanded', String(!panel.hidden));
      if (!panel.hidden) watch(); else unwatch();
    };
    document.addEventListener('click', (e) => {
      if (!panel.hidden && !panel.contains(e.target) && !btn.contains(e.target)) {
        panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); unwatch();
      }
    });
    panel.querySelectorAll('[data-mode]').forEach((b) => {
      b.onclick = () => {
        const msg = takenMsg(b.dataset.mode);
        if (msg) { flash(msg); return; }
        if (b.dataset.mode === 'emisor' && live.mode !== 'emisor' && emitters().length === 1) { requestLead(); return; }
        live.co = false;
        setMode(b.dataset.mode);
      };
    });
    if (!IN_CLAUDE) {
      $('liveSalaRow').hidden = false;
      $('liveSala').value = live.sala;
      $('liveSala').onchange = (e) => {
        live.sala = cleanRoom(e.target.value); e.target.value = live.sala; store.set('liveSala', live.sala);
        // escrito a mano: se respeta; vacío: vuelve a ser automático
        if (live.room) { const m = live.mode; disconnectP2P(); setMode(m); }
        watch();
      };
      $('liveSalaMore').onclick = (e) => { e.preventDefault(); renderSalaList(); $('liveSalaList').hidden = !$('liveSalaList').hidden; };
      $('liveSala').oninput = () => { $('liveSalaList').hidden = true; };
      renderSalaList();
      $('liveCopy').onclick = () => {
        const code = cleanRoom($('liveSala').value);
        if (!code) { flash('Escribe primero un código de sala.'); return; }
        const u = new URL(location.href); u.hash = ''; u.searchParams.set('sala', code);
        const txt = u.toString();
        (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(
          () => flash('Enlace copiado: ' + txt), () => flash('Enlace: ' + txt));
      };
    }
    if (!live.name) {
      // nombre por defecto: el modelo o el tipo de dispositivo
      live.name = deviceName(); store.set('liveName', live.name);
      deviceModel().then((n) => { if (n && live.name === deviceName()) { live.name = n; store.set('liveName', n); $('liveName').value = n; } });
    }
    $('liveName').value = live.name;
    $('liveName').oninput = (e) => {
      live.name = e.target.value; store.set('liveName', live.name);
      if (live.mode !== 'off') live.room.presence({ name: cleanName(live.name) }).catch(() => {});
    };
    $('liveFollow').onchange = (e) => { setFollowing(e.target.value); live.last = null; render(); };
    // ∞ → 300 → … → 60 (de 20 en 20); al subir de 600 vuelve a «Sin límite»
    const stepMax = (d) => {
      let n = window.App.maxChars();
      if (!n) n = d < 0 ? 300 : 0;
      else { n += d * 20; if (n > 600) n = 0; if (n && n < 60) n = 60; }
      window.App.setMaxChars(n, true);
      render(); send();
    };
    $('liveMaxDown').onclick = () => stepMax(-1);
    $('liveMaxUp').onclick = () => stepMax(1);
    $('liveScroll').checked = live.followScroll;
    $('liveScroll').onchange = (e) => { live.followScroll = e.target.checked; store.set('liveScroll', live.followScroll); };
    $('liveBarBtn').onclick = () => { live.paused = false; applyLast(); render(); };
    $('liveBarText').onclick = (e) => { if (!bar.classList.contains('mini')) { e.stopPropagation(); btn.click(); } };
  }

  // Interfaz para screen.js: en pantalla completa el receptor solo ve lo del emisor
  // ---- Pantalla completa y Ángelus: se comparten por la presencia de cada dispositivo ----
  function sharePresence() {
    if (!live.room || live.mode === 'off') return;
    live.room.presence({ fs: live.fs ? true : null, ang: live.ang || null }).catch(() => {});
  }
  window.Live = {
    setFs(on) { live.fs = !!on; sharePresence(); },
    // dispositivos (otros) con la pantalla completa activada
    fullscreenPeers: () => peersList().filter((p) => !p.sameTab && p.presence && p.presence.fs).length,
    setAngelus(st) { live.ang = st; sharePresence(); },
    angelusFromPeers: () => peersList().filter((p) => !p.sameTab && p.presence && p.presence.ang).map((p) => p.presence.ang),
    connected: () => !!live.room && live.mode !== 'off',
    receiving: () => live.mode === 'receptor',
    resume() { if (live.mode === 'receptor' && live.paused) { live.paused = false; applyLast(); render(); } }
  };

  // ---------- Conexión ----------
  function attach(room) {
    live.room = room;
    room.on('sync', onSync, () => {});
    room.onConnection((c) => { live.connected = c; render(); }, () => {});
    room.onPeers((ch) => {
      const me = ch.peers.find((p) => p.sameTab);
      if (me) live.myPeer = me.peer;
      if ((live.mode === 'emisor' || live.mode === 'letras') && ch.joined.some((p) => !p.sameTab)) send();
      checkAsks();
      if (followerMode()) {
        if (live.following && ch.left.some((p) => p.peer === live.following)) { setFollowing(pickEmitter()); live.last = null; }
        else if (!live.following) { const e = pickEmitter(); if (e) setFollowing(e); }
      }
      render();
      if (window.Angelus) window.Angelus.sync();
    }, () => {});
  }

  // ---- Fuera de Claude (GitHub Pages): imita la API de `room` sobre MQTT por WebSocket ----
  // Se usa un broker MQTT público (sin servidor propio). Todo va por wss://, así que
  // funciona en cualquier red donde se pueda navegar (no necesita conexión directa entre dispositivos).
  //   <base>/pres/<id>  presencia (retenida; el broker la borra si el dispositivo se desconecta)
  //   <base>/sync/<id>  último estado del emisor (retenido: quien entra tarde lo recibe al instante)
  const MQTT_LIB = 'https://cdn.jsdelivr.net/npm/mqtt@5.15.2/dist/mqtt.min.js';
  const BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt'];
  const cleanRoom = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  live.sala = cleanRoom(new URLSearchParams(location.search).get('sala') || store.get('liveSala', ''));

  // ---------- Últimas salas ----------
  // Cada dispositivo recuerda las 5 últimas salas en las que ha coincidido con otros dispositivos
  const salaHist = () => (store.get('liveSalas', []) || []).filter((x) => typeof x === 'string' && x).slice(0, 5);
  function rememberSala(code) {
    code = cleanRoom(code);
    if (!code) return;
    const h = salaHist();
    if (h[0] === code) return;
    store.set('liveSalas', [code].concat(h.filter((x) => x !== code)).slice(0, 5));
    renderSalaList();
  }
  function renderSalaList() {
    const box = $('liveSalaList'); if (!box) return;
    const h = salaHist();
    $('liveSalaMore').hidden = !h.length;
    box.innerHTML = '';
    h.forEach((code) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = code; b.className = code === cleanRoom(live.sala) ? 'on' : '';
      b.onclick = () => { $('liveSala').value = code; box.hidden = true; $('liveSala').onchange({ target: $('liveSala') }); };
      box.appendChild(b);
    });
  }
  const newCode = () => Array.from({ length: 4 }, () => 'abcdefghjkmnpqrstuvwxyz23456789'[Math.floor(Math.random() * 31)]).join('');
  if (!IN_CLAUDE && !live.sala) { live.sala = salaHist()[0] || newCode(); store.set('liveSala', live.sala); }

  // ---------- Nombre del dispositivo por defecto ----------
  function deviceName() {
    const ua = navigator.userAgent || '';
    if (/iPhone/.test(ua)) return 'iPhone';
    if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad';
    if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'Android' : 'Tablet Android';
    if (/CrOS/.test(ua)) return 'Chromebook';
    if (/Windows/.test(ua)) return 'PC Windows';
    if (/Macintosh/.test(ua)) return 'Mac';
    if (/Linux/.test(ua)) return 'PC Linux';
    return 'Dispositivo';
  }
  // En Android, Chrome puede decir el modelo (p. ej. «Pixel 7», «SM-S911B»)
  function deviceModel() {
    const d = navigator.userAgentData;
    if (!d || !d.getHighEntropyValues) return Promise.resolve('');
    return d.getHighEntropyValues(['model']).then((v) => (v && v.model ? deviceName() + ' ' + v.model : '')).catch(() => '');
  }

  let mqttLoading = null;
  function loadMqtt() {
    if (window.mqtt) return Promise.resolve(window.mqtt);
    if (!mqttLoading) mqttLoading = new Promise((ok, ko) => {
      const s = document.createElement('script');
      s.src = MQTT_LIB; s.async = true;
      s.onload = () => (window.mqtt ? ok(window.mqtt) : ko(new Error('mqtt')));
      s.onerror = () => { mqttLoading = null; ko(new Error('mqtt')); };
      document.head.appendChild(s);
    });
    return mqttLoading;
  }

  function makeNetRoom(code) {
    const myId = 'p' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
    const base = 'cancionero-meriba/v1/' + code;
    const presTopic = base + '/pres/' + myId, syncTopic = base + '/sync/' + myId;
    const subs = {}, peerSubs = [], connSubs = [];
    const presences = new Map();
    let myPresence = {}, client = null, connected = false, closed = false, brokerIdx = 0, hb = null;
    const freeze = (o) => Object.freeze(o);
    const snapshot = () => [freeze({ peer: myId, isMe: true, sameTab: true, kind: 'viewer', guest: false, by: null, presence: myPresence, updatedAt: Date.now() })]
      .concat([...presences].map(([id, pr]) => freeze({ peer: id, isMe: false, sameTab: false, kind: 'viewer', guest: false, by: null, presence: pr, updatedAt: Date.now() })));
    const firePeers = (joined = [], left = []) => {
      const peers = snapshot();
      peerSubs.forEach((f) => { try { f({ peers, joined: peers.filter((p) => joined.includes(p.peer)), left: left.map((id) => freeze({ peer: id, presence: {} })), updated: [] }); } catch (e) { /* nada */ } });
    };
    const setConn = (c) => { if (c !== connected) { connected = c; connSubs.forEach((f) => f(c)); } };
    const publishPresence = () => {
      if (client && connected) client.publish(presTopic, JSON.stringify(Object.assign({}, myPresence, { t: Date.now() })), { retain: true, qos: 1 });
    };

    function connect() {
      if (closed) return;
      const url = BROKERS[brokerIdx % BROKERS.length];
      let opened = false;
      client = window.mqtt.connect(url, {
        clientId: myId, clean: true, keepalive: 20, reconnectPeriod: 3000, connectTimeout: 8000,
        will: { topic: presTopic, payload: '', retain: true, qos: 1 }
      });
      const failTimer = setTimeout(() => {
        if (!opened && !closed) { try { client.end(true); } catch (e) { /* nada */ } brokerIdx++; connect(); }
      }, 9000);
      client.on('connect', () => {
        opened = true; clearTimeout(failTimer);
        client.subscribe([base + '/pres/+', base + '/sync/+'], { qos: 1 });
        setConn(true);
        publishPresence();
        firePeers([myId]);
      });
      client.on('close', () => setConn(false));
      client.on('offline', () => setConn(false));
      client.on('message', (topic, payload) => {
        const parts = topic.split('/'); const kind = parts[3], peer = parts[4];
        if (!peer || peer === myId) return;
        const text = payload ? payload.toString() : '';
        let data = null;
        if (text) { try { data = JSON.parse(text); } catch (e) { return; } }
        if (kind === 'pres') {
          if (!data || typeof data !== 'object' || (data.t && Date.now() - data.t > 90000)) {
            if (presences.delete(peer)) firePeers([], [peer]);
            return;
          }
          const isNew = !presences.has(peer);
          presences.set(peer, freeze(data));
          firePeers(isNew ? [peer] : []);
        } else if (kind === 'sync' && data) {
          if (!presences.has(peer)) return; // solo de quien está presente
          (subs.sync || []).forEach((f) => f({ topic: 'sync', data, peer, isMe: false, sameTab: false, kind: 'viewer', guest: false, by: null }));
        }
      });
    }

    loadMqtt().then(() => {
      connect();
      // latido: mantiene la presencia fresca y limpia a quien desaparece sin avisar
      hb = setInterval(() => {
        publishPresence();
        let gone = [];
        presences.forEach((pr, id) => { if (pr.t && Date.now() - pr.t > 90000) gone.push(id); });
        gone.forEach((id) => presences.delete(id));
        if (gone.length) firePeers([], gone);
      }, 30000);
    }).catch(() => { setConn(false); flash('No se pudo cargar el modo en directo (¿sin conexión a internet?).'); });

    return {
      emit(topic, data) {
        if (topic === 'sync' && client && connected) client.publish(syncTopic, JSON.stringify(data), { retain: true, qos: 0 });
        return Promise.resolve();
      },
      on(topic, fn) { (subs[topic] = subs[topic] || []).push(fn); return () => {}; },
      presence(patch) {
        const next = Object.assign({}, myPresence);
        for (const k in patch) { if (patch[k] === null) delete next[k]; else next[k] = patch[k]; }
        myPresence = freeze(next);
        publishPresence();
        firePeers();
        return Promise.resolve();
      },
      peers: snapshot,
      onPeers(fn) { peerSubs.push(fn); return () => {}; },
      onConnection(fn) { connSubs.push(fn); setTimeout(() => fn(connected), 0); return () => {}; },
      connected: () => connected,
      leave() {
        closed = true; clearInterval(hb);
        if (client) {
          try {
            if (connected) { client.publish(presTopic, '', { retain: true, qos: 1 }); client.publish(syncTopic, '', { retain: true, qos: 0 }); }
            client.end(false);
          } catch (e) { /* nada */ }
        }
        presences.clear();
      }
    };
  }
  function connectP2P() {
    live.connected = false;
    attach(makeNetRoom(cleanRoom(live.sala)));
  }
  function disconnectP2P() {
    if (live.room && live.room.leave) live.room.leave();
    live.room = null; live.connected = false; live.following = null; live.last = null; live.myPeer = null;
  }

  window.addEventListener('pagehide', () => { if (!IN_CLAUDE && live.room && live.room.leave) live.room.leave(); });

  if (IN_CLAUDE) {
    window.claude.use('room').then((room) => {
      if (!room) return;
      buildUI();
      attach(room);
      render();
    }).catch(() => { /* sin sala: la página funciona igual */ });
  } else {
    buildUI();
    render();
    // Si llega con ?sala=… en el enlace, se abre el panel listo para recibir
    if (new URLSearchParams(location.search).get('sala')) { $('livePanel').hidden = false; }
  }
})();
