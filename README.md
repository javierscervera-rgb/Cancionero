# Cancionero Meribá

Web con las canciones del cancionero Meribá, sus acordes y un **controlador de tono** que transpone todos los acordes al instante.

## Funciones

- Índice con búsqueda por título o letra y filtro por categoría (Espíritu Santo, Alabanza, Adoración, Blessing, Sanación, Virgen María).
- Controlador de tono: botones **−/+** (medio tono), selector directo de tonalidad y botón para volver al tono original.
- Cuando el cancionero tenía la misma canción en otro tono, aparece un acceso directo a ese tono.
- Notación latina (DO RE MI) o americana (C D E).
- Tamaño de letra, modo "solo letra", fuente monoespaciada opcional, tema claro/oscuro.
- Atajos de teclado: `+` / `-` cambian el tono, `←` / `→` pasan de canción.
- El tono elegido para cada canción se recuerda en el navegador.

## Uso

Abre `index.html` en el navegador (funciona sin servidor) o publícalo con GitHub Pages.

## Archivos

- `index.html`, `styles.css`, `app.js` — la web.
- `chords.js` — detección y transposición de acordes.
- `songs.js` — las canciones, extraídas del archivo `CANCIONERO MERIBÁ.pages`.

Para corregir una canción, edita su texto en `songs.js` (cada canción es una lista de líneas; las líneas de acordes se detectan automáticamente).
