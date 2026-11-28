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
- **Botones de la derecha**, en dos cajas separadas: engranaje (con sus controles) y **Presentación** (pantalla con líneas), cuyo desplegable empieza por **ocultar/mostrar la letra** (pantalla tachada). Al pulsar Presentación se recoge el engranaje. Si la letra está oculta, el botón de Presentación se pone en negro y rojo. Son el doble de grandes en ordenador/tablet y un 50 % más en el móvil.
- **Presentación**: despliega hacia abajo A+ / tamaño / A− de la letra en la pantalla completa (50–200 %) y modo **Canción** o **Cita** (letra más pequeña, centrada, en un recuadro del 70 % del ancho de la zona marcada); se queda abierto hasta volver a pulsarlo. Lo decide el líder y se aplica en todas las pantallas completas que le siguen. En «Letras» solo aparece ocultar/mostrar.
- **Selección / Todas**: pestañas siempre visibles, debajo de las listas de reproducción y encima del buscador. Al pulsar una colección estando en Selección se pasa a Todas.
- **Anotaciones en la línea de acordes** (x2, punteando, rasgado…): se ven en la hoja en cursiva gris, en su sitio encima de la letra; si van al principio de la línea, en una línea propia encima.
- **Negrita**: cualquier texto entre `**` … `**` se ve en negrita (aunque abarque varias líneas); también en la pantalla completa; si es la estrofa entera, además algo más grande en la hoja. Los `**` no se ven. Cita y negrita funcionan aunque la estrofa se parta por el máximo de caracteres. El texto entre corchetes dentro de una línea (repeticiones) se ve algo más pequeño, y las estrofas Cita también.
- **Modo Cita automático**: una estrofa entera entre corchetes `[` … `]` se proyecta en modo Cita (los corchetes no se ven; en la hoja sale en cursiva). Los corchetes dentro de una línea, como las repeticiones, no cuentan.
- **Presentación**: sus botones solo se pueden pulsar si algún dispositivo tiene la pantalla completa activada.
- **Ver en directo**: al abrir el panel se conecta a la sala (sin papel) y muestra quién está conectado y con qué papel; al cerrarlo sin activarse, se desconecta.
- **Autor**: bajo el título de cada canción (tocarlo para escribirlo o cambiarlo; vacío = sin autor). También se pide al añadir una canción. Se guarda en Drive (operación `author`) y el buscador encuentra por autor. Los autores encontrados con seguridad (por el título o por ser canciones conocidas) están en `authors-seed.js` y se suben una sola vez (operación `seed`), solo donde no haya autor.
- **✎ Edición** (última pastilla de la barra de colecciones, antes «Nueva colección»): crear colecciones eligiendo en qué cancioneros aparecen, cambiar en qué cancioneros aparece cada una (casillas) y borrarlas (✕, dos toques; las canciones no se borran). Se guarda en Drive para todos (operaciones `catLists` y `delCat`). Las colecciones de la web ya no se vuelven a añadir solas a Drive.
- **Marcador y orden**: el marcador de cada canción (A01, B02…) se cambia tocándolo en la cabecera de la canción; se guarda en Drive (operación `mark`, o `marks` para varios a la vez; vacío = vuelve al código). En el Cancionero Parroquia los marcadores son la inicial de la colección y su número dentro de ella (T01…, AD01… Adoración, AL Aleluya, AV Adviento, CA Canciones entrada, CO Cordero; el resto con una letra). El botón «01 / A–Z» junto a ABC ordena la lista por marcador o por nombre (se recuerda en el dispositivo). El buscador también encuentra por marcador.
- **Multimedia** (botón 🎞 junto a ABC, o la barra «🎞 Multimedia» bajo la lista): la lista pasa a mostrar fotos, vídeos y audios (y la barra «♪ Canciones» vuelve). Se suben con «＋ Subir…» o arrastrándolos a la lista (máx. 100 MB por archivo); se guardan en Drive (`Cancionero/Multimedia`, en trozos de 3 MB) y cada dispositivo los descarga una vez y los guarda en su navegador. Se pueden renombrar (✎), borrar (🗑, dos toques) y deslizar a la Selección como las canciones. Al abrir uno la pantalla no cambia; al tocar la vista previa se proyecta a pantalla completa sin ningún control. El líder y Letras tienen ⏮ ▶/⏸ 🔁 y volumen, que sigue la pantalla completa; los demás ven la miniatura (primer fotograma o la imagen entera).
- **Dos líderes**: si ya hay un líder, al pulsar «Líder» se le pide permiso; si acepta, hay dos líderes y lo que cambie cualquiera lo ven todos (los receptores siguen al primero, que reenvía los cambios del segundo). Con dos líderes ya no se puede pedir más.
- **📚 Cancioneros** (junto a 🏷 Colecciones en cada canción): marca en qué cancionero/s aparece la canción (al menos uno). Se guarda en Drive (operación `songLists`, campo `lists` de la canción) para todos; la canción sigue teniendo su código y su cancionero de origen.
- **Alineación en la pantalla completa**: en la barra de la pantalla (donde se ajusta el cuadro con las cuatro líneas) hay tres botones para alinear el texto a la izquierda, al centro o a la derecha del cuadro; se guarda en el dispositivo. Las estrofas Cita (entre corchetes) van siempre centradas: recuadro y texto.
- **Pantalla completa**: solo se proyectan estrofas, nunca el título. Al elegir otra canción la pantalla no cambia (sigue la última estrofa) hasta que el líder o Letras marque una estrofa de la nueva canción; así se puede navegar por las canciones sin que se note en la pantalla.
- **Tema «Color»** (botón ☀︎/☾/✦ de la cabecera: día → noche → color): fondo pastel, tarjetas blancas, colecciones y canciones con bordes de neón (rosa, turquesa, morado, verde), título grande con brillo, letra centrada con acordes en magenta y separadores entre párrafos, y botones de la derecha como círculos de colores. Se guarda en el dispositivo.
- **Textos del Ángelus**: a la izquierda Ángelus o Regina Coeli (Reina del cielo); a la derecha Ave María, Gloria, por los fieles difuntos y bendición papal. Con el estilo del libro: títulos en rojo, V/. en rojo y R/. en rojo con la respuesta en negrita. Cada columna tiene scroll propio; A−/A+ arriba a la izquierda cambian el tamaño de la letra; los márgenes de los lados se cambian arrastrando una línea que solo se ve al hacer scroll. Todo se guarda en el dispositivo.
- **Ángelus**: el vídeo ocupa todo el ancho de la pantalla (recortado arriba/abajo si hace falta). Dentro de su marco se puede acercar (rueda del ratón o pellizco), mover arrastrando y volver al encuadre inicial con doble clic; el encuadre se recuerda en ese dispositivo. Suena por defecto (arranca silenciado, como exigen los navegadores, y enseguida se le pone el volumen); abajo a la izquierda hay un botón 🔊/🔇, y si el navegador no deja activar el sonido solo, el primer toque sobre el vídeo lo activa.
- **Letras en el móvil** (con un líder conectado): solo se ve la letra (sin acordes ni título), con una ✕ arriba a la izquierda para salir, ▲ ▼ ocupando todo el ancho del 25 % inferior para cambiar de párrafo y, a la derecha justo encima, un botón para ocultar/mostrar la letra en la pantalla completa (pantalla en negro). En Android las flechas vibran corto y ocultar la letra vibra largo; se bloquea el giro (pide pantalla completa al primer toque) y se puede tocar un párrafo para ir a él y hacer scroll sobre la letra, pero no zoom.
- **Botón de directo**: siempre parpadea; círculo rojo vacío si está desactivado y relleno si está activo, con el estado al lado (Desactivado, Líder, Letras o Recibir), también en el móvil.
- **Sala**: se escribe o se elige con ▾ entre las **5 últimas salas** en las que este dispositivo ha coincidido con otros (se guardan en el propio dispositivo). La primera vez se propone un código de 4 letras/números al azar. Un enlace con `?sala=` también manda.
- **Nombre por defecto**: el tipo de dispositivo (iPhone, iPad, Android, Tablet Android, PC Windows, Mac…) y, en Android con Chrome, también el modelo. El navegador no deja leer el nombre puesto en los ajustes del dispositivo.
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
