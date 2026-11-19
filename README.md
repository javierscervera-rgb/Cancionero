# Cancionero

Dirección: https://cancionero.sansebastianmartir.es/ (subdominio de IONOS con un CNAME a `javierscervera-rgb.github.io`).

Web con cancioneros (listas de reproducción), sus acordes y un **controlador de tono** que transpone todos los acordes al instante.

## Listas de reproducción

En el lateral izquierdo se elige el cancionero; cada uno tiene sus propias colecciones:

- **Cancionero Meribá** (94 canciones, de `CANCIONERO MERIBÁ.pages`) — `songs.js`.
- **Adoración** (47 canciones, del PDF «ADORACIÓN NATALIA») — `songs-adoracion.js`. El PDF mezcla capturas, escaneos y anotaciones a mano, así que se transcribió página a página (OCR + revisión). Las canciones que coinciden con el Cancionero Meribá se toman de él, en el tono del PDF. Colecciones: Entrada, Adorando, Espíritu Santo, Virgen María, Bendición y Navidad.
- **Cancionero Parroquia** — San Sebastián Mártir (119 canciones, del PDF) — `songs-parroquia.js`. Colecciones según su índice. De los acordes dobles se conserva solo el primero; la minúscula indica acorde menor (lam → LAm). *Quebrántame (Jesed)*, que en el PDF es una imagen, está transcrita a mano.

## Funciones

- Índice con búsqueda por título o letra y filtro por categoría (Espíritu Santo, Alabanza, Adoración, Blessing, Sanación, Virgen María).
- Controlador de tono: botones **−/+** (medio tono), selector directo de tonalidad y botón para volver al tono original.
- Cuando el cancionero tenía la misma canción en otro tono, aparece un acceso directo a ese tono.
- Notación latina o americana con el botón **DO/C** (en negrita la elegida).
- Tamaño de letra, modo "solo letra", tema claro/oscuro. Los controles de la derecha se recogen solos tras 30 s sin tocarlos. El zoom de la página está desactivado.
- Las canciones están en párrafos: al tocar uno se resalta y se centra en la pantalla.
- Atajos de teclado: `+` / `-` cambian el tono, `↑` / `↓` cambian de párrafo, `←` / `→` pasan de canción.
- El tono elegido para cada canción se recuerda en el navegador.

## Comentarios

Botón **💬 Comentario** junto al título: una nota para la canción (p. ej. «empezar solo voz», «capo 2») que se ve encima de la letra pero **no** en el modo Pantalla. Se guarda en el dispositivo y se exporta/importa con el resto de cambios.

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

## Modo Pantalla (proyección)

Botón **Pantalla** en la barra de la derecha: fondo negro y solo la letra (sin acordes), blanca y centrada.

- Muestra el párrafo seleccionado (o el título si no hay ninguno). Con el modo en directo sigue el párrafo del emisor.
- Ajustes (⚙): tamaño de letra, fuente (Helvetica, Montserrat, Lato, Nunito, Oswald, Georgia, Merriweather, Playfair), negrita y márgenes arriba/abajo/izquierda/derecha. Se recuerdan en el navegador.
- Si la letra no cabe en el espacio de proyección, se reduce automáticamente.
- **Cuadro del texto**: antes de expandir a pantalla completa se ve un # con cuatro rayas (arriba, abajo, izquierda, derecha) que se arrastran para fijar dónde va la letra; A− / A+ cambian el tamaño máximo y «Aa» la fuente y la negrita. Las rayas desaparecen en pantalla completa.
- **Máximo de caracteres por párrafo** (lo fija el **Líder** en el panel del directo; se guarda en Drive como `settings.maxChars` y lo siguen todos): los párrafos con más letra se dividen en varios, cortando por líneas (acordes y letra van juntos) y, en los textos sin acordes, también por puntos, comas o palabras. Afecta a la vista normal, a Pantalla y al directo; el texto guardado no cambia.
- **Pantalla en negro** (botón de la pantalla tachada, debajo del engranaje, o tecla `B`): la presentación se queda en negro, sin letra, hasta que se vuelve a pulsar. En el directo lo pueden usar el líder y Letras, y lo ven todos los receptores.
- **Pantalla completa** (⛶ o tecla `F`): oculta todo, solo letra blanca sobre negro. Para salir: `Esc`, `F` o mantener pulsado. Si estás **recibiendo**, en pantalla completa solo se ve lo que marca el emisor (no se puede navegar por cuenta propia).
- Navegación: tocar el tercio izquierdo = párrafo anterior, resto = siguiente; teclas `←` `→` `↑` `↓` `Espacio` `RePág` `AvPág` (sirve con un mando de presentaciones); `N` / `P` canción siguiente / anterior.

## Modo en directo

En la versión publicada en Claude aparece el botón **En directo**:

- **Líder**: comparte tu canción, el tono y el párrafo que marcas (al tocar un párrafo se centra en la pantalla).
- **Letras**: sigue la canción y el tono del líder y solo puede pasar los párrafos; lo que pasa lo ven los receptores y también el líder. Si intenta cambiar de canción, vuelve a la del líder.
- **Recibir**: tu pantalla sigue al emisor, también en el tono (el receptor no ve los controles de tono). Si navegas por tu cuenta, el seguimiento se pausa y aparece "Volver al directo".
- El aviso de estado se ve completo 10 s cada vez que cambia y luego queda como un punto rojo; si no estás siguiendo al emisor, es un aro rojo sin relleno. Si recibes y pulsas el punto, se pausa el seguimiento y aparece «En pausa · Volver al directo».
- **Letras en el móvil** (con un líder conectado): solo se ve la letra (sin acordes ni título), con una ✕ arriba a la izquierda para salir, ▲ ▼ abajo a la izquierda (primer cuarto) para cambiar de párrafo y, en el centro del segundo cuarto, un botón para ocultar/mostrar la letra en la pantalla completa (pantalla en negro). En Android las flechas vibran corto y ocultar la letra vibra largo; se bloquea el giro (pide pantalla completa al primer toque) y el resto de la pantalla no admite toques, scroll ni zoom.
- Solo puede haber un líder y una persona en Letras por sala: si ya están ocupados, esas opciones salen en gris con un aviso.
- Al emitir (Líder o Letras) no hay scroll horizontal: los párrafos que no caben a lo ancho se reducen solos, y el resto mantiene el tamaño de letra elegido.

Transporte:

- **En Claude**: la capacidad `room` de la plataforma (solo emite quien tiene permiso de colaborador).
- **En GitHub Pages**: sin servidor propio, a través de un broker MQTT público por WebSocket seguro (`broker.emqx.io`, con `broker.hivemq.com` de reserva). Funciona en cualquier red donde se pueda navegar. Todos escriben el mismo **código de sala** (o abren un enlace `?sala=codigo`). El estado del emisor queda retenido en el broker, así que quien entra tarde lo recibe al instante. Los mensajes del broker público no van cifrados de extremo a extremo (solo contienen el código de canción, el tono y la posición). Cualquiera que conozca el código puede emitir; cada receptor elige a quién sigue.

Protocolo: cada participante publica `presence { role: emisor|letras|receptor, name, follow }`. El líder envía en el tema `sync` el estado absoluto `{ v: 2, seq, song, shift, para, pt, rv }` en cada cambio, cuando entra alguien y cada 3 s; Letras envía `{ v: 2, kind: "para", song, para, pt }`. Gana el párrafo con el `pt` más reciente dentro de la misma canción. Sin internet el resto de la web funciona igual.

## Uso

Abre `index.html` en el navegador (funciona sin servidor) o publícalo con GitHub Pages.

## Archivos

- `index.html`, `styles.css`, `app.js` — la web.
- `chords.js` — detección y transposición de acordes.
- `songs.js` — Cancionero Meribá (extraído de `CANCIONERO MERIBÁ.pages`).
- `songs-parroquia.js` — Cancionero Parroquia (extraído del PDF).
- `songs-adoracion.js` — Adoración (transcrito del PDF).

Para corregir una canción, edita su texto en `songs.js` (cada canción es una lista de líneas; las líneas de acordes se detectan automáticamente).


## Cancionero compartido (Google Drive)

Solo hay una versión del cancionero: la guardada en Google Drive (cuenta de la parroquia, carpeta `Cancionero/cancionero.json`). La web la carga al abrirse y la comprueba cada poco tiempo; cualquiera puede editar letras, acordes, comentarios y colecciones, y el cambio se guarda en Drive para todos.

- Un script de Google Apps Script (`apps-script/Code.gs`, proyecto «Cancionero» de la cuenta de la parroquia) hace de intermediario.
- Antes del primer cambio de cada día se guarda una copia de seguridad en `Cancionero/Copias de seguridad/cancionero-AAAA-MM-DD.json`.
- El botón **☁ Drive** muestra el estado, los últimos cambios y permite poner tu nombre para el registro.
- Para volver a una copia de seguridad, hay que sustituir el contenido de `cancionero.json` y subir el número de versión (`rev`), también en la propiedad `REV` del script, para que todos los dispositivos se actualicen.
- Los archivos `songs*.js` del repositorio sirven de reserva sin conexión. Si se añade una canción nueva a esos archivos, la web la sube sola a Drive la primera vez que alguien la abre.

## Móvil

- La lista de canciones es un panel que se desliza desde abajo: al abrir una canción se recoge (queda una pestaña abajo con la canción actual) y se vuelve a abrir deslizándola hacia arriba o tocándola. La cabecera no cambia.
- El cancionero (lista de reproducción) se elige en un desplegable.
- El buscador, el tamaño de letra y el abecedario se quedan fijos arriba al desplazar la lista (también en el ordenador).

## Disposición

- La página no se desplaza: solo la columna de canciones y la de la letra.
- La letra y los acordes nunca se salen del ancho de la columna: cada acorde va pegado a su sílaba y, si la línea no cabe, salta a la siguiente con sus acordes.
- En todos los tamaños el cancionero se elige en un desplegable, y la cabecera de la lista (cancionero, buscador, tamaño de letra y abecedario) queda siempre visible.

## Selección

- Desliza una canción hacia la derecha (o la izquierda) para seleccionarla: debajo aparece «● Seleccionar» y, al pasar el umbral, se pone en rojo. Queda un punto rojo a la izquierda. Vuelve a deslizarla para quitarla («✕ Quitar»), en cualquier pestaña.
- Con alguna canción seleccionada en el cancionero elegido aparecen las pestañas «Selección» y «Todas» bajo el buscador.
- En «Selección», «↕ Ordenar» permite arrastrar cada canción (desde cualquier punto de la pastilla o desde el asa ≡) arriba o abajo; las demás se apartan mientras arrastras y no se abren ni se seleccionan.
- En pantallas táctiles el desplazamiento de la lista lo hace la web (con inercia) para que el deslizar lateral sea tolerante: un gesto inclinado hasta ~55° cuenta como deslizar. Al abrir una canción desde ahí, anterior/siguiente siguen el orden de la selección.
- Hay una selección por cancionero (Meribá, Parroquia y Adoración), compartida y guardada en Drive (`selections` en el archivo; operación `sel` del script con la lista).

## Añadir canciones desde la web

- La última pastilla de la lista («＋ Añadir una canción», con borde discontinuo; siempre al final, también en colecciones, búsquedas y en «Selección», donde la canción nueva entra además en la selección) abre un formulario: título, letra (con acordes opcionales en la línea de encima) y colecciones. La canción se añade al cancionero elegido con el siguiente código libre (p. ej. P129) y se guarda en Drive para todos.

## Textos de la Misa

- En el Cancionero Parroquia, la colección «⛪️Textos Misa» (la primera) contiene P120–P127: Credo apostólico, Credo Niceno, Primera lectura, Salmo responsorial, Segunda lectura, Evangelio, Gloria y «El Señor reciba…». Las lecturas largas están partidas en párrafos de unas pocas frases para proyectarlas.
- Las colecciones oficiales nuevas que se añadan a los archivos `songs*.js` se suben solas a Drive (operación `listCats` del script).

## Ángelus / Regina Coeli

- Con el Cancionero Parroquia elegido aparece en la cabecera el botón **Ángelus** (menú: Ángelus, Regina Coeli, Quitar).
- Solo actúa si hay algún dispositivo con la pantalla completa activada (este mismo o alguno conectado a la misma sala del directo); si no, avisa y no hace nada.
- En esas pantallas completas: arriba (2/3) el directo de YouTube (`5lfWxoaPGRg`, empieza sin sonido) y abajo (1/3), con letra negra sobre blanco, la oración en latín: Ángelus en dos columnas (oración | Ave Maria y Gloria Patri) o Regina Cæli completo. Un selector pequeño en la esquina del vídeo cambia entre las dos.
- El estado viaja en la presencia de cada dispositivo de la sala (`fs` = pantalla completa, `ang` = estado del Ángelus).
