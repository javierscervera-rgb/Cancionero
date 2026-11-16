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
    paused: false,
    last: null,             // último estado recibido del emisor seguido
    seq: 0,
    applying: false,
    heartbeat: null,
    connected: false
  };

  // ---------- Emisor ----------
  function snapshot() {
    const s = window.App.getState();
    if (live.mode === 'letras') return { v: 2, kind: 'para', seq: ++live.seq, song: live.last ? live.last.song : '', para: live.last ? live.last.para : null, pt: live.last ? live.last.pt : 0 };
    return { v: 2, seq: ++live.seq, song: s.song, shift: s.shift, para: s.para, pt: live.paraT, rv: window.Cloud ? window.Cloud.rev() : 0 };
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
    const pt = typeof d.pt === 'number' ? d.pt : 0;
    // ---- Letras ha pasado un párrafo ----
    if (d.kind === 'para') {
      if (!isRole(msg.peer, 'letras')) return;
      if (live.mode === 'emisor') {
        // el líder también lo ve, y lo incluye en su estado para todos
        const s = window.App.getState();
        if (d.song === s.song && pt > live.paraT && para !== s.para) {
          live.paraT = pt;
          live.applying = true;
          window.App.apply({ song: d.song, para });
          setTimeout(() => { live.applying = false; }, 200);
          setTimeout(send, 250);
        }
      } else if (followerMode() && live.last && d.song === live.last.song && pt > (live.last.pt || 0)) {
        live.last.para = para; live.last.pt = pt;
        if (!live.paused) applyLast();
        render();
      }
      return;
    }
    // ---- Estado del líder ----
    if (!followerMode()) return;
    if (!live.following) setFollowing(msg.peer);
    if (msg.peer !== live.following) return;
    // el líder tiene una versión más nueva del cancionero compartido
    if (window.Cloud && Number.isInteger(d.rv)) window.Cloud.behind(d.rv);
    const prev = live.last;
    live.last = { song: d.song, shift: d.shift, para, pt };
    // si Letras pasó un párrafo más reciente de esta canción, se mantiene
    if (prev && prev.song === d.song && (prev.pt || 0) > pt) { live.last.para = prev.para; live.last.pt = prev.pt; }
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
    window.App.apply({ song: d.song, shift: d.shift, para: d.para }, { noPara: live.mode === 'receptor' && !live.followScroll });
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
    if (live.mode === 'emisor') {
      if (!live.applying && (why === 'para' || why === 'song')) live.paraT = Date.now();
      send();
    } else if (live.mode === 'letras' && !live.applying && live.last) {
      const s = window.App.getState();
      if (s.song === live.last.song && s.shift === live.last.shift) {
        // pasar párrafo: es lo único que puede hacer Letras
        if (s.para !== live.last.para) { live.last.para = s.para; live.last.pt = Date.now(); send(); }
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
    if (live.mode === 'receptor' && m !== 'receptor' && window.App.clearTemp) window.App.clearTemp();
    if (!IN_CLAUDE && m !== 'off' && !live.room) {
      if (!cleanRoom(live.sala)) { flash('Escribe primero un código de sala.'); $('liveSala').focus(); m = 'off'; }
      else connectP2P();
    }
    lockView(m === 'emisor' || m === 'letras');
    live.mode = m;
    live.paused = false;
    live.last = null;
    clearInterval(live.heartbeat);
    if (!live.room) { render(); return; }
    if (m === 'off') {
      live.following = null;
      if (!IN_CLAUDE) { disconnectP2P(); render(); return; }
      live.room.presence({ role: null, follow: null, name: null }).catch(() => {});
    } else if (m === 'emisor') {
      live.following = null;
      live.paraT = Date.now();
      live.room.presence({ role: 'emisor', name: cleanName(live.name), follow: null }).catch(() => {});
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
  const cleanName = (n) => (n || '').replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁯﻿]/g, '').trim().slice(0, 40);

  function peersList() { try { return live.room ? live.room.peers() : []; } catch (e) { return []; } }
  function emitters() {
    return peersList().filter((p) => !p.sameTab && p.presence && p.presence.role === 'emisor');
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
      live.mode === 'emisor' ? 'Líder' : live.mode === 'letras' ? 'Letras' : live.mode === 'receptor' ? 'Recibiendo' : 'En directo';

    panel.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === live.mode));
    $('liveFollowRow').hidden = !followerMode();
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
    const nR = receivers.length === 1 ? '1 receptor' : receivers.length + ' receptores';
    if (!IN_CLAUDE && live.mode === 'off') status = 'Elige una sala y pulsa Líder, Letras o Recibir. Todos deben usar el mismo código.';
    else if (!live.connected) status = 'Conectando…';
    else if (live.mode === 'off') status = ems.length ? (ems.length === 1 ? 'Hay 1 líder emitiendo.' : `Hay ${ems.length} líderes emitiendo.`) : 'Nadie está emitiendo ahora.';
    else if (live.mode === 'emisor') status = 'Eres el líder: ' + nR + (lyricists.length ? ' y ' + lyricists.length + ' en Letras' : '') + '.';
    else if (!ems.length) status = IN_CLAUDE ? 'Esperando a que haya un líder…' : 'Esperando a que haya un líder en la sala «' + cleanRoom(live.sala) + '»…';
    else if (live.mode === 'letras') status = 'Letras: sigues la canción y el tono del líder y pasas los párrafos para todos.';
    else status = live.paused ? 'En pausa: estás navegando por tu cuenta.' : 'Sigues al líder.';
    $('liveStatus').textContent = status;

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
  }

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
    btn.innerHTML = '<span class="dot"></span><span class="lbl">En directo</span>';
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
      <div class="sala" id="liveSalaRow" hidden>
        <label class="field">Código de sala
          <input id="liveSala" maxlength="40" placeholder="p. ej. meriba-domingo" autocomplete="off" autocapitalize="off" spellcheck="false">
        </label>
        <button class="link-btn" id="liveCopy" type="button">Copiar enlace para invitar</button>
      </div>
      <label class="field">Tu nombre (opcional)
        <input id="liveName" maxlength="40" placeholder="p. ej. Guitarra 1" autocomplete="off">
      </label>
      <label class="field" id="liveFollowRow" hidden>Líder al que sigues
        <select id="liveFollow"></select>
      </label>
      <label class="toggle" id="liveScrollRow" hidden><input type="checkbox" id="liveScroll"> Centrar el párrafo que marquen</label>
      <p class="live-status" id="liveStatus"></p>
      <p class="live-flash" id="liveFlash" hidden></p>`;
    document.body.appendChild(panel);

    const bar = document.createElement('div');
    bar.id = 'liveBar'; bar.className = 'live-bar'; bar.hidden = true;
    bar.innerHTML = '<span class="dot"></span><span id="liveBarText"></span><button id="liveBarBtn" hidden>Volver al directo</button>';
    bar.setAttribute('role', 'status');
    bar.addEventListener('click', (e) => { if (bar.classList.contains('mini')) { e.stopPropagation(); expandBar(); } });
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
    if (!IN_CLAUDE) {
      $('liveSalaRow').hidden = false;
      $('liveSala').value = live.sala;
      $('liveSala').onchange = (e) => {
        live.sala = cleanRoom(e.target.value); e.target.value = live.sala; store.set('liveSala', live.sala);
        if (live.room) { const m = live.mode; disconnectP2P(); setMode(m); }
      };
      $('liveCopy').onclick = () => {
        const code = cleanRoom($('liveSala').value);
        if (!code) { flash('Escribe primero un código de sala.'); return; }
        const u = new URL(location.href); u.hash = ''; u.searchParams.set('sala', code);
        const txt = u.toString();
        (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(
          () => flash('Enlace copiado: ' + txt), () => flash('Enlace: ' + txt));
      };
    }
    $('liveName').value = live.name;
    $('liveName').oninput = (e) => {
      live.name = e.target.value; store.set('liveName', live.name);
      if (live.mode !== 'off') live.room.presence({ name: cleanName(live.name) }).catch(() => {});
    };
    $('liveFollow').onchange = (e) => { setFollowing(e.target.value); live.last = null; render(); };
    $('liveScroll').checked = live.followScroll;
    $('liveScroll').onchange = (e) => { live.followScroll = e.target.checked; store.set('liveScroll', live.followScroll); };
    $('liveBarBtn').onclick = () => { live.paused = false; applyLast(); render(); };
    $('liveBarText').onclick = (e) => { if (!bar.classList.contains('mini')) { e.stopPropagation(); btn.click(); } };
  }

  // Interfaz para screen.js: en pantalla completa el receptor solo ve lo del emisor
  window.Live = {
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
      if (followerMode()) {
        if (live.following && ch.left.some((p) => p.peer === live.following)) { setFollowing(pickEmitter()); live.last = null; }
        else if (!live.following) { const e = pickEmitter(); if (e) setFollowing(e); }
      }
      render();
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
