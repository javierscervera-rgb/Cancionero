# Cancionero

Web con cancioneros (listas de reproducción), sus acordes y un **controlador de tono** que transpone todos los acordes al instante.

## Listas de reproducción

En el lateral izquierdo se elige el cancionero; cada uno tiene sus propias colecciones:

- **Cancionero Meribá** (94 canciones, de `CANCIONERO MERIBÁ.pages`) — `songs.js`.
- **Adoración** (47 canciones, del PDF «ADORACIÓN NATALIA») — `songs-adoracion.js`. El PDF mezcla capturas, escaneos y anotaciones a mano, así que se transcribió página a página (OCR + revisión). Las canciones que coinciden con el Cancionero Meribá se toman de él, en el tono del PDF. Colecciones: Espíritu Santo, Virgen María, Navidad y Misa.
- **Cancionero Parroquia** — San Sebastián Mártir (119 canciones, del PDF) — `songs-parroquia.js`. Colecciones según su índice. De los acordes dobles se conserva solo el primero; la minúscula indica acorde menor (lam → LAm). *Quebrántame (Jesed)*, que en el PDF es una imagen, está transcrita a mano.

## Funciones

- Índice con búsqueda por título o letra y filtro por categoría (Espíritu Santo, Alabanza, Adoración, Blessing, Sanación, Virgen María).
- Controlador de tono: botones **−/+** (medio tono), selector directo de tonalidad y botón para volver al tono original.
- Cuando el cancionero tenía la misma canción en otro tono, aparece un acceso directo a ese tono.
- Notación latina (DO RE MI) o americana (C D E).
- Tamaño de letra, modo "solo letra", fuente monoespaciada opcional, tema claro/oscuro.
- Las canciones están en párrafos: al tocar uno se resalta y se centra en la pantalla.
- Atajos de teclado: `+` / `-` cambian el tono, `↑` / `↓` cambian de párrafo, `←` / `→` pasan de canción.
- El tono elegido para cada canción se recuerda en el navegador.

## Colecciones

- Botón **🏷 Colecciones** en cada canción: marca o desmarca las colecciones en las que debe aparecer (puede estar en varias).
- **+ Nueva colección** en la barra de colecciones (o desde el mismo diálogo) para crear una; las creadas por ti se pueden borrar (las canciones no se borran).
- Se guarda en este dispositivo y se exporta/importa junto con las canciones editadas.

## Editar canciones

Botón **✎ Editar** junto al título. Dos pestañas:

- **Acordes por sílaba**: cada acorde va ligado a una sílaba. Al pulsar una sílaba se abre un menú para poner, cambiar o quitar el acorde (acordes ya usados en la canción o compuestos: nota, ♭/♯, tipo —m, 7, maj7, sus4…— y bajo). También permite separar (¶) y unir párrafos, y deshacer.
- **Texto**: título, letra y acordes como texto (línea de acordes encima de la letra; una línea en blanco = salto de párrafo), con vista previa.

- Los acordes se editan en el tono en que estás viendo la canción; al guardar se pasan al tono original.
- Los cambios se guardan **en este dispositivo** (se marcan como "✎ Editada"). Se pueden **exportar** a un archivo `.json` e **importar** en otro dispositivo. Para que sean para todos, hay que incorporarlos a `songs.js` en el repositorio.
- En el directo, si el emisor ha editado la canción, los receptores ven temporalmente su versión ("↻ Versión del emisor") para que los párrafos coincidan.

## Modo Pantalla (proyección)

Botón **Pantalla** en la barra de la derecha: fondo negro y solo la letra (sin acordes), blanca y centrada.

- Muestra el párrafo seleccionado (o el título si no hay ninguno). Con el modo en directo sigue el párrafo del emisor.
- Ajustes (⚙): tamaño de letra, fuente (Helvetica, Montserrat, Lato, Nunito, Oswald, Georgia, Merriweather, Playfair), negrita y márgenes arriba/abajo/izquierda/derecha. Se recuerdan en el navegador.
- Si la letra no cabe en el espacio de proyección, se reduce automáticamente.
- **Pantalla completa** (⛶ o tecla `F`): oculta todo, solo letra blanca sobre negro. Para salir: `Esc`, `F` o mantener pulsado. Si estás **recibiendo**, en pantalla completa solo se ve lo que marca el emisor (no se puede navegar por cuenta propia).
- Navegación: tocar el tercio izquierdo = párrafo anterior, resto = siguiente; teclas `←` `→` `↑` `↓` `Espacio` `RePág` `AvPág` (sirve con un mando de presentaciones); `N` / `P` canción siguiente / anterior.

## Modo en directo

En la versión publicada en Claude aparece el botón **En directo**:

- **Emitir**: comparte tu canción, el tono y el párrafo que marcas (al tocar un párrafo se centra en la pantalla).
- **Recibir**: tu pantalla sigue al emisor. Si navegas por tu cuenta, el seguimiento se pausa y aparece "Volver al directo".
- El aviso de estado se ve completo 10 s cada vez que cambia y luego queda como un punto rojo; si no estás siguiendo al emisor, es un aro rojo sin relleno.
- Si hay varios emisores, cada receptor elige a quién seguir.

Transporte:

- **En Claude**: la capacidad `room` de la plataforma (solo emite quien tiene permiso de colaborador).
- **En GitHub Pages**: sin servidor propio, a través de un broker MQTT público por WebSocket seguro (`broker.emqx.io`, con `broker.hivemq.com` de reserva). Funciona en cualquier red donde se pueda navegar. Todos escriben el mismo **código de sala** (o abren un enlace `?sala=codigo`). El estado del emisor queda retenido en el broker, así que quien entra tarde lo recibe al instante. Los mensajes del broker público no van cifrados de extremo a extremo (solo contienen el código de canción, el tono y la posición). Cualquiera que conozca el código puede emitir; cada receptor elige a quién sigue.

Protocolo: cada participante publica `presence { role, name, follow }` y el emisor envía en el tema `sync` el estado absoluto `{ v: 2, seq, song, shift, para }` en cada cambio, cuando entra alguien y cada 3 s. Sin internet el resto de la web funciona igual.

## Uso

Abre `index.html` en el navegador (funciona sin servidor) o publícalo con GitHub Pages.

## Archivos

- `index.html`, `styles.css`, `app.js` — la web.
- `chords.js` — detección y transposición de acordes.
- `songs.js` — Cancionero Meribá (extraído de `CANCIONERO MERIBÁ.pages`).
- `songs-parroquia.js` — Cancionero Parroquia (extraído del PDF).
- `songs-adoracion.js` — Adoración (transcrito del PDF).

Para corregir una canción, edita su texto en `songs.js` (cada canción es una lista de líneas; las líneas de acordes se detectan automáticamente).
