// Arranque: si este dispositivo ya tiene una copia del cancionero compartido (Google Drive),
// se usa en lugar de las canciones incluidas en la web. cloud.js la actualiza después.
(function () {
  'use strict';
  window.CLOUD_URL = 'https://script.google.com/macros/s/AKfycbyqMIX5rAA4rqAb_TrbIkUfMqlX8zwH5KMLIw3pSF12DIj329Md5vkbMCjzA35iP_MsCQ/exec';
  let doc = null;
  try { doc = JSON.parse(localStorage.getItem('cm:cloud')); } catch (e) { doc = null; }
  if (doc && Array.isArray(doc.songs) && doc.songs.length && Array.isArray(doc.lists) && doc.lists.length) {
    window.SONGS = doc.songs;
    window.LISTS = doc.lists;
    window.CLOUD_CATS = Array.isArray(doc.customCats) ? doc.customCats : [];
  } else doc = null;
  window.CLOUD_BOOT = doc;
})();
