# Arquitectura de PDF G

PDF G es una extensión de Chrome (Manifest V3) sin servidor: una página (`app.html`) con módulos ES que cargan las librerías solo cuando una herramienta las necesita.

```
pdf-g/
├── manifest.json        permisos: storage, downloads (+ debugger y webs, opcionales)
├── background.js        abre la app al pulsar el icono; aviso del acceso directo al instalar
├── app.html / app.css   interfaz (sistema de diseño: lienzo negro, 0 px de radio, franja tricolor)
├── print.html           vista de impresión para Word/Excel a PDF
├── js/
│   ├── main.js          catálogo de las 28 herramientas y navegación
│   ├── core.js          utilidades: carga de librerías, pdf.js, descargas, avisos, controles
│   ├── ui.js            zona de archivos, cuadrícula de páginas, resultados
│   ├── tools-convert.js PDF ↔ Excel, Word, imágenes, texto, web
│   ├── tools-pages.js   unir, dividir, organizar, comprimir, proteger, OCR, aplanar, reparar
│   ├── tools-edit.js    editor visual, firmas, formularios, marca de agua, numerar, metadatos
│   ├── table.js         detección de tablas (con y sin bordes) para PDF a Excel
│   ├── excel.js         libro de Excel y vista previa
│   ├── ocr.js           Tesseract: palabras con línea base y tamaño de letra, en varias pasadas
│   ├── word-layout.js   PDF/OCR a Word con el diseño original
│   └── shortcut.js      instalador del acceso directo (Windows .cmd / Linux .desktop)
├── lib/                 pdf.js, pdf-lib, docx, ExcelJS, mammoth, Tesseract (+ idiomas), qpdf
└── fonts/               Inter (OFL)
```

## PDF a Word con el diseño original (`word-layout.js`)

1. **Fondo.** La página se dibuja dos veces con pdf.js: completa y sin texto (se anulan `fillText`/`strokeText` del lienzo, salvo el texto girado). La versión sin texto es el fondo, detrás del documento.
2. **Texto.** De `getTextContent` salen los fragmentos con posición, tamaño y fuente (nombre real de la fuente incrustada). El **color** se obtiene comparando píxeles entre las dos versiones; palabra a palabra, para no perder enlaces o resaltados.
3. **Líneas y bloques.** Los fragmentos se agrupan en el orden en que el PDF los dibuja (así no se mezclan columnas cercanas) y las líneas en bloques con el mismo interlineado y alineados entre sí.
4. **Word.** Cada bloque es un marco (`w:framePr`) en su posición absoluta, con interlineado exacto y los saltos de línea del original. Cada página es una sección del tamaño del PDF.

## OCR a Word

1. `ocrPage` reconoce la página con Tesseract en **tres pasadas** (imagen completa, al 40 % y al 25 %). La primera lee la letra pequeña; las reducidas solo rellenan huecos donde no se leyó nada (títulos muy grandes, texto claro sobre fondo oscuro), y solo si el tamaño que dan sus letras coincide con el de la tinta.
2. Para cada palabra: **línea base y tamaño** a partir de sus letras (mayúsculas y letras altas ≈ 0,72 em; minúsculas ≈ 0,53 em); **fondo** interpolado a izquierda y derecha; **color** y **grosor del trazo** (negrita) comparando con ese fondo.
3. **Filtros:** iconos (manchas casi macizas, letras sueltas fuera de una línea de texto), letra manuscrita (proporciones irregulares o trazo muy fino) y palabras dudosas en líneas dudosas se quedan en la imagen.
4. Las palabras aceptadas se **borran** de la imagen y se colocan como marcos, con **una fuente por línea** (Arial, o Arial Narrow si el texto es condensado y está instalada) y un espaciado moderado; si no cabe, la letra se reduce un poco antes que montar letras.

## Pruebas

`tests/run.mjs` carga la extensión en Chromium con Playwright (con los permisos opcionales concedidos en una copia temporal), ejecuta 32 casos y guarda los resultados en `tests/out`. `tests/check.py` valida el contenido con pypdf, openpyxl y poppler.
