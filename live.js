// Modo "En directo": un emisor comparte lo que ve (canción, tono y desplazamiento)
// y los receptores lo siguen en tiempo real.
//
// Protocolo (capacidad `room` de la página publicada en Claude):
//   presence: { role: "emisor" | "receptor", name, follow: { of: <peer del emisor> } }
//   evento "sync" (solo emisores): { v: 2, seq, song, shift, para }
//     - estado ABSOLUTO; se reenvía en cada cambio, cuando entra alguien nuevo y cada 3 s
//     - para: índice del párrafo seleccionado por el emisor (se centra en pantalla) o null
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

  // ---------- Emisor ----------
  function snapshot() {
    const s = window.App.getState();
    const snap = { v: 2, seq: ++live.seq, song: s.song, shift: s.shift, para: s.para, ed: null, rv: window.Cloud ? window.Cloud.rev() : 0 };
    return snap;
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
  // ---------- Receptor ----------
  function onSync(msg) {
    if (live.mode !== 'receptor' || msg.sameTab) return;
    const d = msg.data;
    if (!d || typeof d !== 'object' || d.v !== 2 || typeof d.song !== 'string') return;
    if (!live.following) setFollowing(msg.peer);
    if (msg.peer !== live.following) return;
    // el emisor tiene una versión más nueva del cancionero compartido
    if (window.Cloud && Number.isInteger(d.rv)) window.Cloud.behind(d.rv);
    const prevSong = live.last && live.last.song;
    live.last = { song: d.song, shift: d.shift, para: Number.isInteger(d.para) ? d.para : null, ed: d.ed || null };
    if (live.paused) { render(); return; }
    applyLast();
    render();
  }
  function applyLast() {
    const d = live.last;
    if (!d) return;
    live.applying = true;
    window.App.apply({ song: d.song, shift: d.shift, para: d.para }, { noPara: !live.followScroll });
    setTimeout(() => { live.applying = false; }, 200);
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
    lockView(m === 'emisor');
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
      live.room.presence({ role: 'emisor', name: cleanName(live.name), follow: null }).catch(() => {});
      send();
      live.heartbeat = setInterval(send, 3000);
    } else {
      if (live.room && live.room.emit && !IN_CLAUDE) live.room.emit('sync', null);
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
    if (!IN_CLAUDE && live.mode === 'off') status = 'Elige una sala y pulsa Emitir o Recibir. Todos deben usar el mismo código.';
    else if (!live.connected) status = 'Conectando…';
    else if (live.mode === 'off') status = ems.length ? (ems.length === 1 ? 'Hay 1 persona emitiendo.' : `Hay ${ems.length} personas emitiendo.`) : 'Nadie está emitiendo ahora.';
    else if (live.mode === 'emisor') status = receivers.length === 1 ? '1 persona sigue tu pantalla.' : `${receivers.length} personas siguen tu pantalla.`;
    else if (!ems.length) status = IN_CLAUDE ? 'Esperando a que alguien emita…' : 'Esperando a que alguien emita en la sala «' + cleanRoom(live.sala) + '»…';
    else status = live.paused ? 'En pausa: estás navegando por tu cuenta.' : 'Sigues la pantalla del emisor.';
    $('liveStatus').textContent = status;

    // barra inferior: completa 10 s cada vez que cambia su texto; luego se reduce al punto
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
    const barKey = bar.hidden ? '' : $('liveBarText').textContent + '|' + $('liveBarBtn').hidden;
    if (barKey !== live.barKey) { live.barKey = barKey; if (barKey) expandBar(); }
    // aro rojo sin relleno cuando el receptor no está siguiendo a nadie (en pausa o sin emisor)
    const notFollowing = live.mode === 'receptor' && (live.paused || !ems.some((p) => p.peer === live.following));
    bar.classList.toggle('off', notFollowing);
    document.body.classList.toggle('live-on', live.mode !== 'off');
    document.body.classList.toggle('receiving', live.mode === 'receptor'); // el tono lo decide el emisor
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
      <p class="muted small">Quien emite comparte su canción, el tono y el párrafo que marca. Quien recibe lo ve igual en su pantalla.</p>
      <div class="seg" role="group" aria-label="Modo">
        <button data-mode="off">Desactivado</button>
        <button data-mode="emisor">Emitir</button>
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
      <label class="field" id="liveFollowRow" hidden>Seguir a
        <select id="liveFollow"></select>
      </label>
      <label class="toggle" id="liveScrollRow" hidden><input type="checkbox" id="liveScroll"> Centrar el párrafo que marque el emisor</label>
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
      if (live.mode === 'emisor' && ch.joined.some((p) => !p.sameTab)) send();
      if (live.mode === 'receptor') {
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
