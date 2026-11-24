// Arranque: si este dispositivo ya tiene una copia del cancionero compartido (Google Drive),
// se usa en lugar de las canciones incluidas en la web. cloud.js la actualiza después.
(function () {
  'use strict';
  window.CLOUD_URL = 'https://script.google.com/macros/s/AKfycbyqMIX5rAA4rqAb_TrbIkUfMqlX8zwH5KMLIw3pSF12DIj329Md5vkbMCjzA35iP_MsCQ/exec';
  // canciones incluidas en la web: las que aún no estén en Drive se suben (cloud.js)
  try { window.BUNDLE_SONGS = JSON.parse(JSON.stringify(window.SONGS || [])); } catch (e) { window.BUNDLE_SONGS = []; }
  try { window.BUNDLE_LISTS = JSON.parse(JSON.stringify(window.LISTS || [])); } catch (e) { window.BUNDLE_LISTS = []; }
  let doc = null;
  try { doc = JSON.parse(localStorage.getItem('cm:cloud')); } catch (e) { doc = null; }
  if (doc && Array.isArray(doc.songs) && doc.songs.length && Array.isArray(doc.lists) && doc.lists.length) {
    window.SONGS = doc.songs;
    window.LISTS = doc.lists;
    window.CLOUD_CATS = Array.isArray(doc.customCats) ? doc.customCats : [];
    window.CLOUD_SETTINGS = doc.settings && typeof doc.settings === 'object' ? doc.settings : {};
    window.CLOUD_SEL = doc.selections && typeof doc.selections === 'object' ? doc.selections : {};
    window.CLOUD_MEDIA = Array.isArray(doc.media) ? doc.media : [];
    window.CLOUD_SEL_OLD = Array.isArray(doc.selection) ? doc.selection : null; // formato antiguo (una sola)
  } else doc = null;
  window.CLOUD_BOOT = doc;
})();
