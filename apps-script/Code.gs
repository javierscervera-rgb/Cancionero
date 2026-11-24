// Cancionero · almacén compartido en Google Drive
// Guarda el cancionero completo en Drive/Cancionero/cancionero.json.
// Cualquiera puede leer y editar. Antes del primer cambio de cada día se guarda una copia
// de seguridad en Drive/Cancionero/Copias de seguridad/cancionero-AAAA-MM-DD.json.

var FOLDER_NAME = 'Cancionero';
var FILE_NAME = 'cancionero.json';
var BACKUP_FOLDER = 'Copias de seguridad';
var TZ = 'Europe/Madrid';

// Ejecutar una vez desde el editor: crea la carpeta y el archivo.
function setup() {
  var p = PropertiesService.getScriptProperties();
  if (!p.getProperty('FILE_ID')) {
    var it = DriveApp.getFoldersByName(FOLDER_NAME);
    var folder = it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
    var file = folder.createFile(FILE_NAME, '{}', 'application/json');
    p.setProperty('FILE_ID', file.getId());
    p.setProperty('FOLDER_ID', folder.getId());
    p.setProperty('REV', '0');
  }
  Logger.log('Archivo: ' + p.getProperty('FILE_ID'));
}

// Copia de seguridad diaria (la primera vez que se guarda algo cada día)
function backup_() {
  var p = PropertiesService.getScriptProperties();
  var today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  if (p.getProperty('LAST_BACKUP') === today) return;
  var file = file_();
  var content = file.getBlob().getDataAsString('UTF-8');
  if (content && content.length > 10) {
    var parent = DriveApp.getFolderById(p.getProperty('FOLDER_ID'));
    var it = parent.getFoldersByName(BACKUP_FOLDER);
    var folder = it.hasNext() ? it.next() : parent.createFolder(BACKUP_FOLDER);
    folder.createFile('cancionero-' + today + '.json', content, 'application/json');
    p.setProperty('LAST_BACKUP', today);
  }
}

function file_() {
  return DriveApp.getFileById(PropertiesService.getScriptProperties().getProperty('FILE_ID'));
}
function read_() {
  var t = file_().getBlob().getDataAsString('UTF-8');
  try { return t ? JSON.parse(t) : {}; } catch (e) { return {}; }
}
function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
function str_(v, max) { return typeof v === 'string' ? v.slice(0, max) : ''; }
function lines_(a) {
  if (!Array.isArray(a)) return null;
  return a.filter(function (l) { return typeof l === 'string'; }).slice(0, 400).map(function (l) { return l.slice(0, 400); });
}
function cats_(a) {
  if (!Array.isArray(a)) return null;
  return a.filter(function (c) { return typeof c === 'string' && c.trim(); }).slice(0, 60).map(function (c) { return c.slice(0, 40); });
}
// ---------- Multimedia ----------
// Cada archivo se guarda en Drive/Cancionero/Multimedia en trozos de texto base64 (≤ 4 MB de datos cada uno),
// y en el documento queda su ficha: doc.media = [{ id: '@xxxx', name, type, size, dur, thumb, parts: [fileId…], t }]
var MEDIA_FOLDER = 'Multimedia';
function mediaFolder_() {
  var parent = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('FOLDER_ID'));
  var it = parent.getFoldersByName(MEDIA_FOLDER);
  return it.hasNext() ? it.next() : parent.createFolder(MEDIA_FOLDER);
}
function mfind_(doc, id) {
  var a = Array.isArray(doc.media) ? doc.media : [];
  for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i];
  return null;
}
var MEDIA_ID = /^@[a-z0-9]{4,12}$/;

function find_(doc, code) {
  for (var i = 0; i < doc.songs.length; i++) if (doc.songs[i].code === code) return doc.songs[i];
  return null;
}

function doGet(e) {
  var q = (e && e.parameter) || {};
  // un trozo de un archivo multimedia (solo de los que están en el cancionero)
  if (q.mpart) {
    var d = read_(), ok = false;
    (Array.isArray(d.media) ? d.media : []).forEach(function (m) { if ((m.parts || []).indexOf(q.mpart) >= 0) ok = true; });
    if (!ok) return out_({ ok: false, error: 'archivo' });
    return out_({ ok: true, data: DriveApp.getFileById(q.mpart).getBlob().getDataAsString() });
  }
  var rev = PropertiesService.getScriptProperties().getProperty('REV') || '0';
  if (q.rev && q.rev === rev) return out_({ ok: true, rev: +rev, same: true });
  var doc = read_();
  return out_({ ok: true, rev: doc.rev || 0, doc: Array.isArray(doc.songs) ? doc : null });
}

function doPost(e) {
  var req;
  try { req = JSON.parse(e.postData.contents); } catch (x) { return out_({ ok: false, error: 'formato' }); }
  var props = PropertiesService.getScriptProperties();
  if (!req || typeof req.op !== 'string') return out_({ ok: false, error: 'formato' });
  // subir un trozo de un archivo multimedia (no cambia el documento)
  if (req.op === 'mediaPart') {
    if (!MEDIA_ID.test(String(req.id)) || !(req.i >= 0 && req.i < 400) || typeof req.data !== 'string' || req.data.length > 6000000) return out_({ ok: false, error: 'trozo' });
    var pf = mediaFolder_().createFile(req.id.slice(1) + '.' + ('00' + req.i).slice(-3) + '.b64', req.data, 'text/plain');
    return out_({ ok: true, file: pf.getId() });
  }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return out_({ ok: false, error: 'ocupado' });
  try {
    var doc = read_();
    var err = apply_(doc, req);
    if (err) return out_({ ok: false, error: err });
    backup_();
    doc.rev = (doc.rev || 0) + 1;
    doc.updated = new Date().toISOString();
    doc.log = Array.isArray(doc.log) ? doc.log : [];
    doc.log.push({ t: doc.updated, op: req.op, what: str_(req.code || req.name || req.list || (req.media && req.media.name) || req.id || '', 60), by: str_(req.by, 40) });
    if (doc.log.length > 500) doc.log = doc.log.slice(-500);
    file_().setContent(JSON.stringify(doc));
    props.setProperty('REV', String(doc.rev));
    return out_({ ok: true, rev: doc.rev });
  } finally {
    lock.releaseLock();
  }
}

// Aplica una operación al documento. Devuelve un texto de error o nada.
function apply_(doc, r) {
  if (r.op === 'init') {
    if (Array.isArray(doc.songs) && doc.songs.length) return 'ya-inicializado';
    var d = r.doc;
    if (!d || !Array.isArray(d.songs) || !Array.isArray(d.lists)) return 'documento';
    doc.formato = 'cancionero'; doc.version = 1;
    doc.lists = d.lists; doc.songs = d.songs; doc.customCats = cats_(d.customCats) || [];
    return null;
  }
  if (!Array.isArray(doc.songs)) return 'sin-inicializar';
  var s;
  switch (r.op) {
    case 'song':
      s = find_(doc, r.code);
      var ls = lines_(r.lines);
      if (!s || !ls || typeof r.title !== 'string' || !r.title.trim()) return 'cancion';
      s.title = r.title.slice(0, 200); s.lines = ls;
      return null;
    case 'note':
      s = find_(doc, r.code);
      if (!s || typeof r.text !== 'string') return 'cancion';
      if (r.text) s.comment = r.text.slice(0, 2000); else delete s.comment;
      return null;
    case 'cats':
      s = find_(doc, r.code);
      var cs = cats_(r.categories);
      if (!s || !cs) return 'cancion';
      s.categories = cs;
      return null;
    case 'mediaAdd':
      var nm = r.media || {};
      if (!MEDIA_ID.test(String(nm.id)) || mfind_(doc, nm.id)) return 'multimedia';
      if (!Array.isArray(nm.parts) || !nm.parts.length || nm.parts.length > 400) return 'multimedia';
      var mt = str_(nm.type, 60);
      if (!/^(image|video|audio)\//.test(mt)) return 'tipo';
      doc.media = Array.isArray(doc.media) ? doc.media : [];
      doc.media.push({ id: nm.id, name: str_(nm.name, 120) || 'Archivo', type: mt, size: +nm.size || 0, dur: +nm.dur || 0,
        thumb: str_(nm.thumb, 200000), parts: nm.parts.map(function (x) { return str_(x, 80); }), t: new Date().toISOString() });
      return null;
    case 'mediaRename':
      var mr = mfind_(doc, r.id);
      var nn = str_(r.name, 120).trim();
      if (!mr || !nn) return 'multimedia';
      mr.name = nn;
      return null;
    case 'mediaDel':
      var md = mfind_(doc, r.id);
      if (!md) return 'multimedia';
      (md.parts || []).forEach(function (fid) { try { DriveApp.getFileById(fid).setTrashed(true); } catch (x) { /* ya no está */ } });
      doc.media = doc.media.filter(function (m) { return m.id !== r.id; });
      if (doc.selections) Object.keys(doc.selections).forEach(function (l) { doc.selections[l] = (doc.selections[l] || []).filter(function (c) { return c !== r.id; }); });
      return null;
    case 'songLists':
      // cancioneros en los que aparece una canción (al menos uno)
      s = find_(doc, r.code);
      if (!s || !Array.isArray(r.lists)) return 'cancion';
      var ids = doc.lists.map(function (l) { return l.id; }).filter(function (id) { return r.lists.indexOf(id) >= 0; });
      if (!ids.length) return 'lista';
      s.lists = ids;
      return null;
    case 'addSong':
      var ns = r.song || {};
      var nl = lines_(ns.lines);
      if (typeof ns.code !== 'string' || !/^[A-Za-z0-9_-]{1,12}$/.test(ns.code) || !nl || typeof ns.title !== 'string' || !ns.title.trim()) return 'cancion';
      if (find_(doc, ns.code)) return 'existe';
      var song = { code: ns.code, title: ns.title.slice(0, 200), lines: nl, variants: [], categories: cats_(ns.categories) || [], list: str_(ns.list, 40) || doc.lists[0].id };
      var at = -1;
      for (var k = 0; k < doc.songs.length; k++) if (doc.songs[k].list === song.list) at = k;
      if (at < 0) doc.songs.push(song); else doc.songs.splice(at + 1, 0, song);
      return null;
    case 'lists':
      // reordenar las listas de reproducción: r.order = [id, id, ...]
      if (!Array.isArray(r.order)) return 'orden';
      var byId = {};
      doc.lists.forEach(function (l) { byId[l.id] = l; });
      var nextL = [];
      r.order.forEach(function (id) { if (byId[id]) { nextL.push(byId[id]); delete byId[id]; } });
      Object.keys(byId).forEach(function (id) { nextL.push(byId[id]); });
      doc.lists = nextL;
      return null;
    case 'listCats':
      // colecciones oficiales de un cancionero (en orden): r.list, r.cats
      var L = null;
      doc.lists.forEach(function (l) { if (l.id === r.list) L = l; });
      var nc = cats_(r.cats);
      if (!L || !nc) return 'lista';
      L.cats = nc;
      return null;
    case 'settings':
      // ajustes comunes: máximo de caracteres por párrafo (0 = sin límite)
      doc.settings = doc.settings && typeof doc.settings === 'object' ? doc.settings : {};
      if (typeof r.maxChars === 'number' && r.maxChars >= 0 && r.maxChars <= 2000) doc.settings.maxChars = Math.round(r.maxChars);
      else return 'ajustes';
      return null;
    case 'sel':
      // selecciones compartidas, una por cancionero: doc.selections[lista] = [códigos en orden]
      if (!Array.isArray(r.codes)) return 'seleccion';
      doc.selections = doc.selections && typeof doc.selections === 'object' ? doc.selections : {};
      if (Array.isArray(doc.selection)) { // formato antiguo (una sola selección): se reparte por cancionero
        doc.selection.forEach(function (c) { var x = find_(doc, c); if (x) { var l = x.list; (doc.selections[l] = doc.selections[l] || []).push(c); } });
        delete doc.selection;
      }
      var groups = {};
      r.codes.forEach(function (c) {
        // los archivos multimedia valen para cualquier cancionero
        if (typeof c === 'string' && r.list && mfind_(doc, c)) { var gm = groups[r.list] = groups[r.list] || []; if (gm.indexOf(c) < 0) gm.push(c); return; }
        var x = typeof c === 'string' ? find_(doc, c) : null;
        if (!x) return;
        var ls_ = Array.isArray(x.lists) && x.lists.length ? x.lists : [x.list];
        if (r.list && ls_.indexOf(r.list) < 0) return;
        var gl = r.list || x.list;
        var g = groups[gl] = groups[gl] || [];
        if (g.indexOf(c) < 0) g.push(c);
      });
      if (r.list) doc.selections[r.list] = (groups[r.list] || []).slice(0, 300);
      else Object.keys(groups).forEach(function (l) { doc.selections[l] = groups[l].slice(0, 300); });
      return null;
    case 'addCat':
      var n = str_(r.name, 40).trim();
      if (!n) return 'nombre';
      doc.customCats = doc.customCats || [];
      if (doc.customCats.indexOf(n) < 0) doc.customCats.push(n);
      return null;
    case 'delCat':
      doc.customCats = (doc.customCats || []).filter(function (c) { return c !== r.name; });
      doc.songs.forEach(function (x) { x.categories = (x.categories || []).filter(function (c) { return c !== r.name; }); });
      return null;
  }
  return 'operacion';
}
