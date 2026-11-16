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
function find_(doc, code) {
  for (var i = 0; i < doc.songs.length; i++) if (doc.songs[i].code === code) return doc.songs[i];
  return null;
}

function doGet(e) {
  var q = (e && e.parameter) || {};
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
    doc.log.push({ t: doc.updated, op: req.op, what: str_(req.code || req.name || '', 60), by: str_(req.by, 40) });
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
