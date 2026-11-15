// Detección y transposición de acordes en notación latina (DO RE MI…) o americana (C D E…)
(function (root) {
  'use strict';

  const LATIN_ROOTS = { DO: 0, RE: 2, MI: 4, FA: 5, SOL: 7, LA: 9, SI: 11 };
  const SHARP_LATIN = ['DO', 'DO#', 'RE', 'RE#', 'MI', 'FA', 'FA#', 'SOL', 'SOL#', 'LA', 'LA#', 'SI'];
  const FLAT_LATIN  = ['DO', 'REb', 'RE', 'MIb', 'MI', 'FA', 'SOLb', 'SOL', 'LAb', 'LA', 'SIb', 'SI'];
  const SHARP_US = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const FLAT_US  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

  // Acorde completo: raíz + alteración + calidad + extensiones + bajo opcional
  const ROOT = '(DO|RE|MI|FA|SOL|LA|SI)';
  const ACC = '(#|♯|b|♭|B(?![a-zA-Z]))?';
  const QUAL = '(m(?:aj)?(?!a)|M(?![a-z]))?';
  const ACC2 = '(#)?'; // casos como "FAm#"
  const EXT = '((?:maj|sus|dim|aug|add|º|°|\\+)?\\d*(?:sus\\d)?)';
  const BASS = '(?:/' + ROOT + '(#|b)?)?';
  const CHORD_RE = new RegExp('^' + ROOT + ACC + QUAL + ACC2 + EXT + BASS + '$', 'i');

  const US_ROOTS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const US_RE = /^([A-G])(#|b)?(maj|m|M(?![a-z]))?((?:sus|dim|aug|add|º|°|\+)?\d*(?:sus\d)?)(?:\/([A-G])(#|b)?)?$/;

  function parseUS(tok) {
    const m = tok.match(US_RE);
    if (!m) return null;
    let [, r, acc, qual, ext, bass, bassAcc] = m;
    let semi = (US_ROOTS[r] + (acc === '#' ? 1 : acc ? -1 : 0) + 12) % 12;
    const minor = !!qual && qual !== 'maj';
    let bassSemi = null;
    if (bass) bassSemi = (US_ROOTS[bass] + (bassAcc === '#' ? 1 : bassAcc ? -1 : 0) + 12) % 12;
    return { semi, minor, q: qual ? (minor ? 'm' : 'maj') : '', ext: ext || '', bassSemi };
  }

  function parseChord(tok) {
    const m = tok.match(CHORD_RE);
    if (!m) return parseUS(tok);
    let [, r, acc, qual, acc2, ext, bass, bassAcc] = m;
    // Evitar palabras: "Sola", "Mira", "Lamento" no llegan aquí porque exigimos coincidencia completa
    let semi = LATIN_ROOTS[r.toUpperCase()];
    const a = acc || acc2 || '';
    if (a === '#' || a === '♯') semi += 1;
    else if (a) semi -= 1;
    semi = (semi + 12) % 12;
    let minor = false, q = '';
    if (qual) {
      if (/^maj$/i.test(qual)) q = 'maj';
      else { minor = true; q = 'm'; }
    }
    let bassSemi = null;
    if (bass) {
      bassSemi = LATIN_ROOTS[bass.toUpperCase()];
      if (bassAcc === '#') bassSemi += 1; else if (bassAcc) bassSemi -= 1;
      bassSemi = (bassSemi + 12) % 12;
    }
    return { semi, minor, q, ext: ext || '', bassSemi };
  }

  // Divide un token tipo "RE-LA-SIm" o "(RE," en piezas de acorde y puntuación
  function splitToken(tok) {
    const parts = [];
    const re = /([^\-()\[\],.;:…]+)|([\-()\[\],.;:…]+)/g;
    let m;
    while ((m = re.exec(tok))) parts.push({ text: m[0], punct: !!m[2] });
    return parts;
  }

  const ANNOT_RE = /^(\(?x\d+\)?|\(?bis\)?|\+?7|-+|–|\d+[º°]?|\/+|\|+|\.+|…+|intro:?|\(|\))$/i;

  function isChordLine(line) {
    const toks = line.replace(/\([^)]*\)/g, ' ').trim().split(/\s+/).filter(Boolean);
    if (!toks.length) return false;
    let latin = 0, us = 0, words = 0;
    for (const t of toks) {
      const pieces = splitToken(t).filter(p => !p.punct);
      if (!pieces.length) continue;
      if (pieces.every(p => p.text.match(CHORD_RE))) latin++;
      else if (pieces.every(p => parseUS(p.text))) us++;
      else if (ANNOT_RE.test(t)) continue;
      else words++;
    }
    // Mezcla de notaciones (p. ej. «VEN A MI»): la notación minoritaria cuenta como palabra
    if (latin && us) { if (us > latin) { words += latin; latin = 0; } else { words += us; us = 0; } }
    const chords = latin + us;
    if (!chords) return false;
    return chords / (chords + words) >= 0.6;
  }

  function name(semi, minor, q, ext, useFlats, notation) {
    const tbl = notation === 'us' ? (useFlats ? FLAT_US : SHARP_US) : (useFlats ? FLAT_LATIN : SHARP_LATIN);
    return tbl[((semi % 12) + 12) % 12] + q + ext;
  }

  function chordToString(c, shift, useFlats, notation) {
    let s = name(c.semi + shift, c.minor, c.q, c.ext, useFlats, notation);
    if (c.bassSemi !== null) s += '/' + name(c.bassSemi + shift, false, '', '', useFlats, notation);
    return s;
  }

  // ¿Usar bemoles en la tonalidad resultante?
  function prefersFlats(keySemi, minor) {
    const k = ((keySemi % 12) + 12) % 12;
    return minor ? [0, 2, 5, 7, 10].includes(k) : [1, 3, 5, 8, 10].includes(k);
  }

  // Primer acorde de la canción => tonalidad de referencia
  function detectKey(lines) {
    for (const line of lines) {
      if (!isChordLine(line)) continue;
      for (const t of line.trim().split(/\s+/)) {
        for (const p of splitToken(t)) {
          if (p.punct) continue;
          const c = parseChord(p.text);
          if (c) return { semi: c.semi, minor: c.minor };
        }
      }
    }
    return null;
  }

  // Transpone una línea de acordes manteniendo las columnas en lo posible.
  // Devuelve una lista de segmentos {text, chord:boolean}
  function transposeLine(line, shift, useFlats, notation) {
    const segs = [];
    const re = /\S+/g;
    let m, last = 0, debt = 0; // debt = caracteres de más que hay que absorber con espacios
    while ((m = re.exec(line))) {
      let gap = line.slice(last, m.index);
      if (last > 0 || gap.length) {
        let n = gap.length;
        if (debt > 0) { const take = Math.min(debt, Math.max(0, n - 1)); n -= take; debt -= take; }
        else if (debt < 0) { n += -debt; debt = 0; }
        if (n) segs.push({ text: ' '.repeat(n), chord: false });
      }
      for (const p of splitToken(m[0])) {
        const c = p.punct ? null : parseChord(p.text);
        if (c) {
          const out = chordToString(c, shift, useFlats, notation);
          debt += out.length - p.text.length;
          segs.push({ text: out, chord: true });
        } else segs.push({ text: p.text, chord: false });
      }
      last = m.index + m[0].length;
    }
    return segs;
  }

  root.Chords = { parseChord, isChordLine, transposeLine, detectKey, prefersFlats, name, SHARP_LATIN };
  if (typeof module !== 'undefined') module.exports = root.Chords;
})(typeof window !== 'undefined' ? window : globalThis);
