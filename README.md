<div align="center">

<img src="./docs/screenshots/inicio.png" alt="PDF G: pantalla de inicio con las 28 herramientas" width="820"/>

<br/>
<br/>

# 📄 SanPDF — Todo para tus PDF, sin subir nada

<img src="./docs/diagrams/hero.svg" width="100%" alt="SanPDF: un PDF entra en la extensión PDF G y sale convertido a Word con el diseño original, a Excel con números reales, de escaneado a Word con OCR, a imágenes, firmado o comprimido. 28 herramientas, 100 % en tu navegador."/>

</div>

<div align="center">

### Extensión de Chrome con 28 herramientas para PDF. Todo se procesa en tu ordenador: tus archivos nunca salen de él.

![Chrome](https://img.shields.io/badge/Chrome-Manifest_V3-1c69d4?style=for-the-badge&logo=googlechrome&logoColor=white)
![Versión](https://img.shields.io/badge/versión-1.3.2-0066b1?style=for-the-badge)
![Herramientas](https://img.shields.io/badge/herramientas-28-e22718?style=for-the-badge)
![Privacidad](https://img.shields.io/badge/archivos_subidos-0-0fa336?style=for-the-badge)

<table>
  <tr>
    <td align="right"><b>🚀 Empezar</b></td>
    <td align="center"><a href="#-instalación">📦 Instalación (Windows: 1 doble clic)</a></td>
    <td align="center"><a href="#-en-tres-pasos">👣 En tres pasos</a></td>
    <td align="center"><a href="#%EF%B8%8F-acceso-directo-en-el-escritorio">🖥️ Acceso directo</a></td>
  </tr>
  <tr>
    <td align="right"><b>⭐ Destacado</b></td>
    <td align="center"><a href="#-pdf-a-word-con-el-diseño-original">📝 PDF a Word</a></td>
    <td align="center"><a href="#-ocr-de-escaneado-a-word-editable">🔍 OCR a Word</a></td>
    <td align="center"><a href="#-pdf-a-excel">📊 PDF a Excel</a></td>
  </tr>
  <tr>
    <td align="right"><b>🧰 Todo</b></td>
    <td align="center"><a href="#-las-28-herramientas">🧰 Herramientas</a></td>
    <td align="center"><a href="#-privacidad">🔒 Privacidad</a></td>
    <td align="center"><a href="#-capturas">🎬 Capturas</a></td>
  </tr>
  <tr>
    <td align="right"><b>🛠️ Proyecto</b></td>
    <td align="center"><a href="#-pruebas-automáticas">✅ Pruebas</a></td>
    <td align="center"><a href="#%EF%B8%8F-cómo-está-hecho">🏗️ Arquitectura</a></td>
    <td align="center"><a href="#-limitaciones-conocidas">⚠️ Limitaciones</a></td>
  </tr>
</table>

</div>

---

## 📦 Instalación

### ⚡ Windows: con el instalador

1. Descarga este repositorio (**Code → Download ZIP**) y descomprímelo.
2. Haz doble clic en **`Instalar extensiones.cmd`** y elige **PDF G** en la lista (si Windows avisa: *Más información → Ejecutar de todas formas*).
3. Se abre la página de extensiones con la ruta ya copiada. Haz los **dos clics** que Chrome exige hacer a mano: activa **Modo de desarrollador** y pulsa **Cargar descomprimida** → `Ctrl+V` en la barra de dirección → **Seleccionar carpeta**.
4. El instalador lo detecta solo, **crea el acceso directo "PDF G" en el escritorio** y abre la aplicación.

<img src="./docs/diagrams/instalador.svg" width="100%" alt="Instalador para Windows: copia la extensión, abre la página de extensiones con la ruta copiada, tú activas el modo de desarrollador y pulsas Cargar descomprimida, y se crea el acceso directo."/>

- Funciona con **Chrome, Edge y Brave** (si tienes varios, te pregunta en cuál).
- La extensión se copia a `%LOCALAPPDATA%\Extensiones\PDF G`, así que puedes borrar la carpeta descargada.
- **Para eliminarla**, ejecuta el instalador y elige *Eliminar una extensión instalada*: abre la página de extensiones para que pulses *Quitar* y después borra su carpeta y su acceso directo.
- **Para actualizar**, sustituye la carpeta por la versión nueva y vuelve a ejecutar el instalador: reemplaza los archivos sin repetir los clics.
- Como el instalador crea el acceso directo, PDF G ya no muestra su aviso de bienvenida al instalarse así.

#### Instalar otras extensiones con el mismo archivo

`Instalar extensiones.cmd` sirve para cualquier extensión: lista todas las carpetas que tengan un `manifest.json` junto a él y te deja elegir.

```
Mis extensiones/
├── Instalar extensiones.cmd
├── pdf-g/            → "PDF G  v1.3.2"
└── incidencias-g/    → "Incidencias G  v0.4.2"
```

Para añadir otra, copia su carpeta al lado: no hay que editar el `.cmd`. Del `manifest.json` toma el nombre (también si está traducido con `__MSG_…__`), la versión y el icono del acceso directo. El acceso directo abre `app.html`, `index.html`, la ventana emergente o la página de opciones, la primera que exista. Cada extensión se copia a `%LOCALAPPDATA%\Extensiones\<nombre>`.

> **¿Por qué no es 100 % automático?** Chrome no deja que ningún programa active el modo de desarrollador ni cargue extensiones por su cuenta (desde Chrome 137 ignora incluso la opción `--load-extension`). Saltarse esa protección exigiría manipular archivos protegidos del perfil, que es lo que hace el malware. La instalación en un clic real llegará publicando PDF G en la Chrome Web Store.

### 🛠️ Manual (cualquier sistema)

1. Descomprime el ZIP en una carpeta que no vayas a borrar.
2. Abre `chrome://extensions` y activa el **Modo de desarrollador**.
3. Pulsa **Cargar descomprimida** y elige la carpeta **`pdf-g`**.
4. Fija el icono en la barra de Chrome: al pulsarlo se abre PDF G.

## 👣 En tres pasos

<img src="./docs/diagrams/como-funciona.svg" width="100%" alt="Tres pasos: instala la extensión, suelta tu PDF en la herramienta y descarga el resultado en Descargas/PDF G."/>

Cada resultado tiene **Ver** y **Descargar**, y los PDF se pueden encadenar con **Seguir trabajando con este PDF…** (por ejemplo: unir → numerar → comprimir) sin volver a subir nada.

---

## 📝 PDF a Word con el diseño original

<img src="./docs/diagrams/pdf-a-word.svg" width="100%" alt="La página se separa en dos capas: el fondo con imágenes y colores, y el texto en marcos editables; juntas forman un Word igual que el PDF."/>

Como cuando abres un PDF con Word: cada página del documento tiene **el mismo tamaño que el PDF**, con el **fondo** (imágenes, colores y formas) detrás y el **texto editable** encima, en marcos colocados en su sitio, con su fuente, tamaño, negrita y color. Se conservan los saltos de línea, la alineación y las columnas.

| Modo | Qué obtienes |
| --- | --- |
| **Diseño original** *(por defecto)* | Mismo aspecto que el PDF, con el texto editable. |
| **Solo texto** | Documento fluido con títulos, párrafos y tablas reconstruidas. |
| **Idéntico** | Cada página como imagen (no editable). |
| **Ambos** | Imagen + texto fluido. |

## 🔍 OCR: de escaneado a Word editable

<img src="./docs/diagrams/ocr-a-word.svg" width="100%" alt="Una línea recorre el escaneado y marca cada palabra; la página queda limpia y el texto aparece editable en su posición."/>

Para PDF escaneados o hechos con imágenes (carteles, infografías, fotos de documentos):

1. **Reconoce** el texto con Tesseract (español e inglés incluidos, sin conexión), en varias pasadas para leer tanto la letra pequeña como los títulos grandes.
2. **Lo borra de la imagen**, rellenando cada palabra con el color de fondo que la rodea.
3. **Lo coloca encima, editable**, con su color, tamaño, negrita y el mismo ancho que en la imagen.

Los iconos, fotos y la letra manuscrita se quedan como imagen. También puede generar un **PDF buscable** (mismo aspecto, con una capa de texto invisible para buscar y copiar).

<div align="center">
<img src="./docs/comparativas/ocr-boletin.png" width="820" alt="Comparación: a la izquierda el boletín escaneado (imagen) y a la derecha el Word generado, con el mismo aspecto y el texto editable."/>
<br/><sub>Boletín de ejemplo (<code>tests/boletin.html</code>) convertido con la herramienta OCR. A la derecha, el Word abierto con LibreOffice.</sub>
</div>

## 📊 PDF a Excel

<img src="./docs/diagrams/pdf-a-excel.svg" width="100%" alt="Las filas de la factura se iluminan una a una y aparecen en la hoja de cálculo con fechas e importes como valores reales."/>

- Tablas **con bordes** (facturas) y **sin bordes** (extractos bancarios, listados).
- Números en formato español o inglés, importes con €, negativos, % y fechas se guardan como **valores reales de Excel**: se pueden sumar y filtrar.
- Une los conceptos partidos en dos líneas y escribe una sola vez la cabecera que se repite en cada página.
- **Vista previa editable** antes de descargar. Salida en una hoja, una por página o una por tabla, o CSV.

---

## 🧰 Las 28 herramientas

<img src="./docs/diagrams/herramientas.svg" width="100%" alt="Las 28 herramientas agrupadas en Convertir, Organizar, Editar y firmar, Optimizar y proteger, y Crear."/>

<details>
<summary><b>Ver la lista con lo que hace cada una</b></summary>

| Categoría | Herramienta | Qué hace |
| --- | --- | --- |
| Convertir | PDF a Excel | Tablas a Excel con números y fechas reales (OCR si es escaneado). |
| | PDF a Word | Diseño original editable, texto fluido o imagen. |
| | PDF a imágenes | JPG, PNG o WEBP a 72–300 ppp. |
| | PDF a texto | Todo el texto, con columnas separadas por tabuladores (OCR si hace falta). |
| | Imágenes a PDF | Une fotos y capturas; tamaño de página, orientación y margen. |
| | Word a PDF | `.docx` a PDF con el motor de impresión de Chrome. |
| | Excel a PDF | `.xlsx`, `.xls` (XML de Excel 2003 y tablas HTML) y CSV; ajusta las columnas al ancho de la página. |
| | Página web a PDF | Cualquier pestaña abierta, con texto seleccionable. |
| Organizar | Unir PDF | Varios PDF (e imágenes) en uno, en el orden que quieras. |
| | Dividir PDF | Cada página, cada N páginas o por rangos. |
| | Organizar páginas | Reordena, gira, duplica, borra, inserta en blanco o añade otro PDF. |
| | Extraer páginas | Las que elijas, juntas o una por archivo. |
| | Girar PDF | Las seleccionadas o todas. |
| | Eliminar páginas | Quita las que sobran. |
| Editar y firmar | Editar PDF | Texto, imágenes, dibujo, resaltar, tapar y tachar. |
| | Firmar PDF | Dibuja o escribe tu firma; se guardan las últimas. |
| | Rellenar formulario | Campos de texto, casillas y listas; opción de aplanar. |
| | Marca de agua | Texto o imagen, en diagonal, centrada, en mosaico o en una esquina. |
| | Numerar páginas | "Página 1 de 10" con formato y posición a elegir. |
| | Datos del documento | Título, autor, asunto y palabras clave. |
| Optimizar y proteger | Comprimir PDF | 4 niveles: sin pérdida, recomendada, fuerte y máxima. |
| | OCR: escaneado a Word o PDF | Word editable con el diseño original o PDF buscable. |
| | Proteger con contraseña | Cifrado AES de 256 bits y permisos. |
| | Quitar contraseña | Si conoces la contraseña. |
| | Aplanar PDF | Fija formularios y anotaciones (o cada página como imagen). |
| | Reparar PDF | Reconstruye la estructura interna. |
| Crear | Crear PDF | Documento nuevo en blanco con el editor. |
| | Texto a PDF | Pega un texto o carga un `.txt`. |

</details>

## 🔒 Privacidad

<img src="./docs/diagrams/privacidad.svg" width="100%" alt="Todo se procesa en el navegador con pdf.js, pdf-lib, Tesseract y qpdf; no se envía ningún archivo a ningún servidor."/>

- Todas las librerías van **dentro de la extensión** (sin CDN, sin servidor, sin telemetría).
- Permisos: `storage` (firmas guardadas) y `downloads` (guardar en *Descargas/PDF G*). "Página web a PDF" pide `debugger` y acceso a las webs **solo cuando la usas**.

## 🖥️ Acceso directo en el escritorio

<img src="./docs/diagrams/acceso-directo.svg" width="100%" alt="El botón Acceso directo descarga un instalador .cmd que, con doble clic, crea PDF G en el escritorio."/>

Chrome no permite que una extensión escriba en el escritorio, así que el botón **Acceso directo** (y el aviso que aparece al instalarla) descarga un pequeño instalador:

- **Windows:** `Crear acceso directo PDF G.cmd` → doble clic → aparece **PDF G** en el escritorio con su icono, y abre la aplicación en su propia ventana. Si Windows avisa, *Más información → Ejecutar de todas formas*.
- **Linux:** `PDF G.desktop` → muévelo al escritorio y marca *Permitir ejecutar*.
- **macOS:** no se puede crear automáticamente; usa un marcador o fija la pestaña.

---

## 🎬 Capturas

| | |
| :---: | :---: |
| <img src="./docs/screenshots/pdf-a-excel.png" alt="PDF a Excel con la vista previa de la tabla" width="420"/> | <img src="./docs/screenshots/ocr-a-word.png" alt="OCR con el resultado Word listo para descargar" width="420"/> |
| **PDF a Excel** · vista previa editable | **OCR** · escaneado a Word editable |
| <img src="./docs/screenshots/organizar.png" alt="Organizar páginas con miniaturas" width="420"/> | <img src="./docs/screenshots/firmar.png" alt="Firmar PDF con la firma escrita" width="420"/> |
| **Organizar páginas** · arrastra, gira, duplica | **Firmar PDF** · dibujada o escrita |

## ✅ Pruebas automáticas

Las pruebas cargan **la extensión real** en Chromium y usan cada herramienta como lo haría una persona (subir archivos, pulsar, escribir, arrastrar, firmar). Después se comprueba el contenido de cada archivo generado (páginas, texto, giros, campos, cifrado, celdas de Excel…).

```bash
cd tests
npm install              # instala Playwright
python3 fixtures.py      # crea los documentos de prueba (reportlab, Pillow, poppler, LibreOffice)
node run.mjs             # 32 casos; resultados en tests/out
python3 check.py         # valida el contenido de cada resultado
```

Puedes probar solo algunas: `node run.mjs pdf2word,ocr_demo,excel2pdf`.

## 🏗️ Cómo está hecho

| Pieza | Para qué |
| --- | --- |
| [pdf.js](https://mozilla.github.io/pdf.js/) | Leer y dibujar PDF, extraer texto. |
| [pdf-lib](https://pdf-lib.js.org/) | Crear y modificar PDF (unir, firmar, formularios, marcas…). |
| [docx](https://docx.js.org/) | Generar los Word. |
| [ExcelJS](https://github.com/exceljs/exceljs) | Leer y escribir Excel. |
| [mammoth](https://github.com/mwilliamson/mammoth.js) | Word a HTML para imprimir. |
| [Tesseract.js](https://tesseract.projectnaptha.com/) | OCR en el navegador (WebAssembly). |
| [qpdf](https://qpdf.sourceforge.io/) (WASM) | Cifrar, descifrar, reparar y optimizar. |

Más detalle en **[docs/ARQUITECTURA.md](docs/ARQUITECTURA.md)**. Las licencias de cada librería están en [`pdf-g/lib/LICENCIAS.txt`](pdf-g/lib/LICENCIAS.txt).

## ⚠️ Limitaciones conocidas

- **PDF a Word / OCR a Word:** las imágenes forman parte del fondo de la página (no se mueven por separado). Se conservan los saltos de línea del original, así que si escribes mucho texto nuevo no se reparte solo entre líneas.
- **OCR:** depende de la calidad de la imagen. La letra manuscrita, los textos muy decorados y algunos títulos muy grandes se quedan como imagen. Para letra condensada se usa *Arial Narrow* si está instalada (viene con Office); si no, Arial con el espaciado ajustado.
- **Excel a PDF:** el `.xls` binario antiguo no se puede leer; guárdalo como `.xlsx`.
- **Word / Excel a PDF:** se abren en la vista de impresión de Chrome (elige *Guardar como PDF*); maquetaciones muy complejas pueden variar.

---

<div align="center">
<sub>Hecho por <a href="https://github.com/Smith-Develop">Smith-Develop</a> · La extensión se llama <b>PDF G</b></sub>
</div>
