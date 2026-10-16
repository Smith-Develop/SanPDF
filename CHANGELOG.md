# Cambios

## Instalador (sin cambios en la extensión)
- `Instalar extensiones.cmd` instala todas las extensiones en `%LOCALAPPDATA%\Extensiones\<nombre>`.
- Nueva opción **Eliminar una extensión instalada**: abre la página de extensiones para quitarla, espera a que desaparezca del navegador y borra su carpeta y su acceso directo. También lista las instalaciones antiguas (`%LOCALAPPDATA%\<nombre>\extension`) para limpiarlas.
- Al terminar una instalación o eliminación (o si algo falla) pregunta si quieres volver al menú principal o cerrar.

## 1.3.2
- **Instalador genérico** `Instalar extensiones.cmd` (sustituye a `Instalar PDF G.cmd`): lista las carpetas con `manifest.json` que hay junto a él (pdf-g, incidencias-g…) para elegir cuál instalar, sin editar el archivo. Toma del manifiesto el nombre (también traducido con `__MSG_…__`), la versión y el icono; el acceso directo abre `app.html`, `index.html`, la ventana emergente o las opciones.
- PDF G ya no muestra el aviso para crear el acceso directo cuando se instala con el `.cmd` (el instalador deja `instalado.json` y crea el acceso directo él mismo). Instalada a mano, el aviso sigue apareciendo.

## 1.3.1
- **Instalador para Windows** (`Instalar PDF G.cmd`): copia la extensión a la carpeta del usuario, abre la página de extensiones de Chrome, Edge o Brave con la ruta en el portapapeles, detecta cuándo la has cargado y crea el acceso directo en el escritorio (con el perfil correcto) y abre PDF G. Volver a ejecutarlo actualiza la extensión.
- El instalador abre directamente `chrome://extensions` (o `edge://extensions`, `brave://extensions`): como el navegador ignora esas direcciones cuando se las pasa otro programa, si no se abre sola la escribe en una pestaña nueva, comprobando antes que la ventana activa es la del navegador.

## 1.3.0
- **OCR a Word:** una sola fuente por línea (Arial o Arial Narrow) y espaciado moderado; si el texto no cabe, la letra se reduce un poco en vez de montar letras. Se elimina Bahnschrift, que Word interpretaba distinto.
- **OCR:** tres pasadas (imagen completa y reducida) para leer también títulos grandes y texto claro sobre fondo oscuro.
- **OCR:** las palabras cortas ("a", "y", "la") y los números sueltos ya no desaparecen dejando su sombra en la imagen; los iconos leídos como letras ("O", "Q", "(A)") se quedan como imagen.
- **PDF a Word:** una línea solo se une a un bloque si está alineada con él.
- Interfaz: los resultados con nombres largos ya no se salen del panel.
- Documentación con diagramas animados y pruebas automáticas portables.

## 1.2.0
- **OCR: escaneado a Word o PDF.** Nuevo resultado *Word editable* con el diseño original: el texto reconocido se borra de la imagen y se coloca encima, editable.
- **PDF a Word:** las páginas escaneadas o hechas con imágenes usan el mismo método.

## 1.1.0
- Nuevo sistema de diseño (lienzo negro, tipografía Inter 700/300, esquinas rectas, franja tricolor) e icono nuevo.
- **Excel a PDF:** admite `.xls` en formato XML de Excel 2003 y tablas HTML; ajusta las columnas al ancho de la página y repite la cabecera.
- **Acceso directo en el escritorio** (Windows y Linux) desde la barra superior y al instalar.
- Correcciones verificadas con pruebas de las 28 herramientas.

## 1.0.0
- **PDF a Word con el diseño original:** fondo de la página y texto editable en marcos, como al abrir el PDF con Word.
- Versión inicial con 28 herramientas.
