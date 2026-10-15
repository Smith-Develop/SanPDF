// PDF G · herramientas de conversión
import { pdfjs, el, libs, openPdf, readBytes, renderPage, parseRanges, progress, toast, field, select, seg, toggle, baseName, safe } from './core.js';
import { fileDrop, outName } from './ui.js';
import { analyzeDocument, buildWorkbook, toCsv, renderPreview } from './excel.js';
import { readPage, analyzePage, detectLocale } from './table.js';
import { ocrPage } from './ocr.js';
import { layoutSection, ocrLayoutSection } from './word-layout.js';

const ACCEPT_PDF = '.pdf,application/pdf';
const note = (t) => el('p', { className: 'muted', style: 'font-size:12.5px', textContent: t });

// ---------------- PDF → Excel ----------------
export function pdf2excel(ui) {
  let doc = null, file = null, result = null;
  const o = {
    mode: seg([['auto', 'Automático'], ['lattice', 'Con bordes'], ['stream', 'Sin bordes']], 'auto', () => analyze()),
    output: seg([['single', 'Una hoja'], ['pages', 'Hoja por página'], ['tables', 'Hoja por tabla']], 'single'),
    locale: select([['auto', 'Detectar'], ['es', 'Español (1.234,56)'], ['en', 'Inglés (1,234.56)']], 'auto'),
    ocr: select([['auto', 'Solo si la página no tiene texto'], ['always', 'Siempre (escaneados con texto erróneo)'], ['never', 'Nunca']], 'auto'),
    format: seg([['xlsx', 'Excel (.xlsx)'], ['csv', 'CSV']], 'xlsx'),
    includeText: toggle('Incluir texto fuera de tablas (títulos, datos de cabecera…)', true),
    convert: toggle('Convertir números, importes, % y fechas en valores de Excel', true),
    merge: toggle('Unir líneas partidas (conceptos en dos líneas)', true),
  };
  for (const s of [o.locale, o.ocr]) s.onchange = () => analyze();
  o.merge.input.onchange = () => analyze();
  ui.opts.append(field('Detección de tablas', o.mode), field('Salida', o.output), field('Formato de números', o.locale), field('OCR para PDF escaneados', o.ocr), field('Formato', o.format), o.includeText, o.convert, o.merge,
    note('Puedes corregir cualquier celda en la vista previa antes de descargar.'));
  const preview = el('div');
  const fd = fileDrop({ accept: ACCEPT_PDF, label: 'Suelta aquí el PDF con tablas', onChange: async (files) => { file = files[0]; doc = file ? await openPdf(await readBytes(file)) : null; result = null; preview.replaceChildren(); ui.ready(false); if (doc) analyze(); } });
  ui.work.append(fd.root, preview);
  async function analyze() {
    if (!doc) return;
    try {
      progress('Analizando el PDF…', 0);
      result = await analyzeDocument(doc, { mode: o.mode.value, locale: o.locale.value, ocr: o.ocr.value, mergeWrapped: o.merge.input.checked }, (t, v) => progress(t, v));
      progress('Preparando la vista previa…');
      await renderPreview(preview, doc, result);
      const n = result.pages.reduce((s, p) => s + p.blocks.filter((b) => b.type === 'table').length, 0);
      toast(`${n} ${n === 1 ? 'tabla detectada' : 'tablas detectadas'} en ${doc.numPages} ${doc.numPages === 1 ? 'página' : 'páginas'}`);
      ui.ready(true);
    } catch (e) { toast(`Error al analizar: ${e.message}`, 6000); }
    progress(null);
  }
  ui.run('Convertir a Excel', async () => {
    const opts = { output: o.output.value, includeText: o.includeText.input.checked, convert: o.convert.input.checked };
    if (o.format.value === 'csv') return [{ name: outName(file, '', 'csv'), blob: toCsv(result, opts) }];
    progress('Creando el libro de Excel…');
    return [{ name: outName(file, '', 'xlsx'), blob: await buildWorkbook(result, opts) }];
  });
}

// ---------------- PDF → Word ----------------
export function pdf2word(ui) {
  let file = null;
  const mode = seg([['layout', 'Diseño original'], ['edit', 'Solo texto'], ['image', 'Idéntico'], ['both', 'Ambos']], 'layout');
  ui.opts.append(field('Tipo de documento', mode, 'Diseño original: mismo aspecto que el PDF (colores, imágenes y posiciones) con el texto editable. Solo texto: texto, títulos y tablas en un documento fluido. Idéntico: cada página como imagen (no editable).'), note('En PDF escaneados o hechos con imágenes se usa OCR automáticamente: el texto reconocido se coloca editable sobre la imagen.'));
  ui.work.append(fileDrop({ accept: ACCEPT_PDF, onChange: (f) => { file = f[0]; ui.ready(!!file); } }).root);
  ui.run('Convertir a Word', async () => {
    const D = await libs.docx();
    const doc = await openPdf(await readBytes(file));
    const sections = [];
    let children = null;   // sección de texto fluido en curso
    for (let i = 1; i <= doc.numPages; i++) {
      progress(`Convirtiendo la página ${i} de ${doc.numPages}…`, (i - 1) / doc.numPages);
      const page = await doc.getPage(i);
      if (mode.value === 'layout') {
        let s = await layoutSection(D, page);
        // página escaneada o imagen: se reconoce el texto con OCR y se coloca sobre la imagen sin texto
        if (!s) { await libs.tesseract(); progress(`OCR de la página ${i}…`, (i - 1) / doc.numPages); s = await ocrLayoutSection(D, page, await ocrPage(page)); }
        if (s) { sections.push(s); children = null; continue; }
      }
      // sin texto reconocible en "Diseño original": imagen + texto OCR, como en "Ambos"
      const m = mode.value === 'layout' ? 'both' : mode.value;
      if (!children) { children = []; sections.push({ properties: { page: { margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } } }, children }); }
      else children.push(new D.Paragraph({ children: [new D.PageBreak()] }));
      await flowPage(D, page, m, children, i);
    }
    progress('Creando el documento Word…');
    const out = new D.Document({ creator: 'PDF G', sections });
    return [{ name: outName(file, '', 'docx'), blob: await D.Packer.toBlob(out) }];
  });
}
// Una página como imagen y/o texto fluido (títulos, párrafos y tablas)
async function flowPage(D, page, mode, children, i) {
  if (mode !== 'edit') {
    const c = await renderPage(page, { scale: 2 });
    const data = new Uint8Array(await (await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.88))).arrayBuffer());
    const w = 600, h = Math.round((w * c.height) / c.width);
    children.push(new D.Paragraph({ children: [new D.ImageRun({ type: 'jpg', data, transformation: { width: w, height: h } })] }));
    if (mode === 'image') return;
    children.push(new D.Paragraph({ children: [new D.PageBreak()] }));
  }
  let pg = await readPage(page, pdfjs.OPS);
  if (pg.items.length < 3) { await libs.tesseract(); progress(`OCR de la página ${i}…`); pg = await ocrPage(page); }
  const blocks = analyzePage(pg, { locale: detectLocale(pg.items.map((x) => x.str)) });
  // tamaño de letra normal: el más frecuente en toda la página (texto y tablas)
  const hs = pg.items.map((x) => x.h).sort((a, b) => a - b);
  const bodyH = hs.length ? hs[Math.floor(hs.length / 2)] : 10;
  let para = null;
  const flush = () => { if (para) { children.push(para.make()); para = null; } };
  for (const b of blocks) {
    if (b.type === 'table') {
      flush();
      const cols = Math.max(...b.rows.map((r) => r.length));
      children.push(new D.Table({
        width: { size: 100, type: D.WidthType.PERCENTAGE },
        rows: b.rows.map((r, ri) => new D.TableRow({ tableHeader: ri === b.header, children: [...Array(cols)].map((_, c) => new D.TableCell({ children: [new D.Paragraph({ children: [new D.TextRun({ text: r[c] || '', bold: ri === b.header, size: 18 })] })] })) })),
      }));
      children.push(new D.Paragraph(''));
      continue;
    }
    const heading = b.h > bodyH * 1.35;
    const cont = para && !heading && !para.heading && b.y - para.bottom < b.h * 0.9 && Math.abs(b.x - para.x) < b.h * 2;
    if (cont) { para.text += ` ${b.text.replace(/\s{2,}/g, ' ')}`; para.bottom = b.bottom; continue; }
    flush();
    const level = b.h > bodyH * 1.8 ? D.HeadingLevel.HEADING_1 : D.HeadingLevel.HEADING_2;
    para = { text: b.text.replace(/\s{2,}/g, '    '), bottom: b.bottom, x: b.x, heading,
      make() { return new D.Paragraph({ heading: this.heading ? level : undefined, spacing: { after: 120 }, children: [new D.TextRun({ text: this.text })] }); } };
  }
  flush();
}

// ---------------- PDF → imágenes ----------------
export function pdf2img(ui) {
  let file = null;
  const fmt = seg([['jpg', 'JPG'], ['png', 'PNG'], ['webp', 'WEBP']], 'jpg');
  const dpi = select([[72, '72 ppp (pantalla)'], [150, '150 ppp (recomendado)'], [200, '200 ppp'], [300, '300 ppp (impresión)']], 150);
  const quality = el('input', { type: 'range', min: 40, max: 100, value: 88 });
  const pages = el('input', { type: 'text', placeholder: 'Todas (o p. ej. 1-3, 5)' });
  ui.opts.append(field('Formato', fmt), field('Resolución', dpi), field('Calidad (JPG/WEBP)', quality), field('Páginas', pages));
  ui.work.append(fileDrop({ accept: ACCEPT_PDF, onChange: (f) => { file = f[0]; ui.ready(!!file); } }).root);
  ui.run('Convertir a imágenes', async () => {
    const doc = await openPdf(await readBytes(file));
    const idx = pages.value.trim() ? parseRanges(pages.value, doc.numPages) : [...Array(doc.numPages).keys()];
    const out = [];
    for (const [k, i] of idx.entries()) {
      progress(`Página ${i + 1} (${k + 1} de ${idx.length})…`, k / idx.length);
      const c = await renderPage(await doc.getPage(i + 1), { scale: Number(dpi.value) / 72 });
      const type = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[fmt.value];
      const blob = await new Promise((r) => c.toBlob(r, type, Number(quality.value) / 100));
      out.push({ name: `${baseName(file.name)}_p${String(i + 1).padStart(String(doc.numPages).length, '0')}.${fmt.value}`, blob, note: `${c.width}×${c.height}` });
    }
    return out;
  });
}

// ---------------- PDF → texto ----------------
export function pdf2txt(ui) {
  let file = null;
  const layout = toggle('Mantener columnas (separadas por tabuladores)', true);
  ui.opts.append(layout);
  ui.work.append(fileDrop({ accept: ACCEPT_PDF, onChange: (f) => { file = f[0]; ui.ready(!!file); } }).root);
  ui.run('Extraer texto', async () => {
    const doc = await openPdf(await readBytes(file));
    const parts = [];
    for (let i = 1; i <= doc.numPages; i++) {
      progress(`Página ${i} de ${doc.numPages}…`, i / doc.numPages);
      const page = await doc.getPage(i);
      let pg = await readPage(page, null);
      if (pg.items.length < 3) { await libs.tesseract(); pg = await ocrPage(page); }
      const blocks = analyzePage(pg, { mode: 'stream', locale: 'es' });
      parts.push(blocks.map((b) => (b.type === 'table' ? b.rows.map((r) => r.join(layout.input.checked ? '\t' : ' ')).join('\n') : (layout.input.checked ? b.cells.join('\t') : b.text.replace(/\s{2,}/g, ' ')))).join('\n'));
    }
    return [{ name: outName(file, '', 'txt'), blob: new Blob([parts.join('\n\n\f\n')], { type: 'text/plain;charset=utf-8' }) }];
  });
}

// ---------------- Imágenes → PDF ----------------
export const PAGE_SIZES = { a4: [595.28, 841.89], letter: [612, 792], legal: [612, 1008], a5: [419.53, 595.28] };
export async function imageBytes(file) {
  if (/jpe?g$/i.test(file.type) || /\.jpe?g$/i.test(file.name)) return { kind: 'jpg', bytes: await readBytes(file) };
  if (file.type === 'image/png' || /\.png$/i.test(file.name)) return { kind: 'png', bytes: await readBytes(file) };
  const bmp = await createImageBitmap(file);
  const c = new OffscreenCanvas(bmp.width, bmp.height); c.getContext('2d').drawImage(bmp, 0, 0);
  return { kind: 'png', bytes: new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer()) };
}
export function img2pdf(ui) {
  let files = [];
  const size = select([['fit', 'Igual que la imagen'], ['a4', 'A4'], ['letter', 'Carta'], ['legal', 'Oficio'], ['a5', 'A5']], 'a4');
  const orient = seg([['auto', 'Automática'], ['p', 'Vertical'], ['l', 'Horizontal']], 'auto');
  const margin = select([[0, 'Sin margen'], [20, 'Pequeño'], [40, 'Mediano'], [72, 'Grande']], 20);
  ui.opts.append(field('Tamaño de página', size), field('Orientación', orient), field('Margen', margin), note('Arrastra las imágenes para cambiar el orden.'));
  ui.work.append(fileDrop({ accept: 'image/*', multiple: true, label: 'Suelta aquí tus imágenes', onChange: (f) => { files = f; ui.ready(files.length > 0); } }).root);
  ui.run('Crear PDF', async () => {
    const { PDFDocument } = await libs.pdflib();
    const pdf = await PDFDocument.create();
    for (const [k, f] of files.entries()) {
      progress(`Imagen ${k + 1} de ${files.length}…`, k / files.length);
      const { kind, bytes } = await imageBytes(f);
      const img = kind === 'jpg' ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes);
      const m = Number(margin.value);
      let [pw, ph] = size.value === 'fit' ? [img.width * 0.75 + m * 2, img.height * 0.75 + m * 2] : PAGE_SIZES[size.value];
      const landscape = orient.value === 'l' || (orient.value === 'auto' && img.width > img.height);
      if (size.value !== 'fit' && landscape !== pw > ph) [pw, ph] = [ph, pw];
      const page = pdf.addPage([pw, ph]);
      const k2 = Math.min((pw - m * 2) / img.width, (ph - m * 2) / img.height);
      const w = img.width * k2, h = img.height * k2;
      page.drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
    }
    return [{ name: files.length === 1 ? outName(files[0]) : 'imagenes.pdf', blob: new Blob([await pdf.save()], { type: 'application/pdf' }) }];
  });
}

// ---------------- Word / Excel → PDF (motor de impresión de Chrome) ----------------
async function printHtml(html, title) {
  const w = window.open(chrome.runtime.getURL('print.html'), '_blank');
  await new Promise((r) => { const t = setInterval(() => { if (w.document?.readyState === 'complete' && w.document.getElementById('doc')) { clearInterval(t); r(); } }, 50); });
  w.document.title = title;
  w.document.getElementById('doc').innerHTML = html;
  setTimeout(() => w.print(), 500);
}
export function word2pdf(ui) {
  let file = null;
  ui.opts.append(note('Se abre el documento preparado para imprimir: en la ventana de impresión elige "Guardar como PDF". Ideal para documentos de texto, listas, tablas e imágenes. Maquetaciones complejas pueden variar.'));
  ui.work.append(fileDrop({ accept: '.docx', label: 'Suelta aquí el documento Word (.docx)', thumbs: false, onChange: (f) => { file = f[0]; ui.ready(!!file); } }).root);
  ui.run('Convertir a PDF', async () => {
    const mammoth = await libs.mammoth();
    progress('Leyendo el documento…');
    const r = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
    await printHtml(r.value, baseName(file.name));
    return [];
  });
}
// CSV con separador ; o , y comillas
export function parseCsv(text) {
  text = text.replace(/^\ufeff/, '');
  const first = text.split(/\r?\n/)[0] || '';
  const sep = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : (first.includes('\t') ? '\t' : ',');
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((v) => v !== ''));
}
// .xls que no son binarios: hoja XML de Excel 2003 (SpreadsheetML) o tabla HTML (exportaciones de muchos programas)
// Se cargan en el libro de ExcelJS para reutilizar la misma conversión que los .xlsx
export async function loadLegacySheet(wb, file) {
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (head[0] === 0xd0 && head[1] === 0xcf) throw new Error('Este .xls está en el formato binario antiguo de Excel. Ábrelo y guárdalo como .xlsx para convertirlo.');
  const text = await file.text();
  const css = document.createElement('canvas').getContext('2d');
  const argb = (c) => { if (!c) return null; css.fillStyle = '#000'; css.fillStyle = c; return /^#[0-9a-f]{6}$/i.test(css.fillStyle) ? `FF${css.fillStyle.slice(1).toUpperCase()}` : null; };
  if (/<Workbook[\s>]/.test(text.slice(0, 4000)) && /urn:schemas-microsoft-com:office:spreadsheet/.test(text.slice(0, 4000))) {
    const xml = new DOMParser().parseFromString(text, 'application/xml');
    if (xml.querySelector('parsererror')) throw new Error('El archivo .xls está dañado');
    const SS = 'urn:schemas-microsoft-com:office:spreadsheet';
    const attr = (n, a) => n.getAttributeNS(SS, a) ?? n.getAttribute(`ss:${a}`);
    const kids = (n, tag) => [...n.children].filter((c) => c.localName === tag);
    const styles = {};
    for (const st of xml.getElementsByTagNameNS(SS, 'Style')) {
      const font = kids(st, 'Font')[0], fill = kids(st, 'Interior')[0], nf = kids(st, 'NumberFormat')[0], al = kids(st, 'Alignment')[0];
      styles[attr(st, 'ID')] = { bold: font && attr(font, 'Bold') === '1', fill: fill && attr(fill, 'Pattern') !== 'None' ? argb(attr(fill, 'Color')) : null, numFmt: nf ? attr(nf, 'Format') : null, align: al ? attr(al, 'Horizontal')?.toLowerCase() : null };
    }
    for (const sheet of xml.getElementsByTagNameNS(SS, 'Worksheet')) {
      const ws = wb.addWorksheet((attr(sheet, 'Name') || `Hoja ${wb.worksheets.length + 1}`).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));
      const table = kids(sheet, 'Table')[0]; if (!table) continue;
      let r = 0;
      for (const row of kids(table, 'Row')) {
        r = Number(attr(row, 'Index')) || r + 1;
        let c = 0;
        for (const cell of kids(row, 'Cell')) {
          c = Number(attr(cell, 'Index')) || c + 1;
          const data = kids(cell, 'Data')[0], st = styles[attr(cell, 'StyleID')] || {};
          const x = ws.getCell(r, c);
          if (data) {
            const type = attr(data, 'Type'), raw = data.textContent;
            x.value = type === 'Number' ? Number(raw) : type === 'DateTime' ? new Date(`${raw.slice(0, 19)}Z`) : type === 'Boolean' ? raw === '1' : raw;
          }
          if (st.bold) x.font = { bold: true };
          if (st.fill) x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: st.fill } };
          if (st.numFmt) x.numFmt = st.numFmt;
          if (st.align) x.alignment = { horizontal: st.align };
          const across = Number(attr(cell, 'MergeAcross')) || 0, down = Number(attr(cell, 'MergeDown')) || 0;
          if (across || down) ws.mergeCells(r, c, r + down, c + across);
          c += across;
        }
      }
    }
    return;
  }
  const doc = new DOMParser().parseFromString(text, 'text/html');
  const tables = doc.querySelectorAll('table');
  if (!tables.length) throw new Error('No se reconoce el formato de este .xls. Ábrelo con Excel y guárdalo como .xlsx.');
  tables.forEach((t, k) => {
    const ws = wb.addWorksheet(`Hoja ${k + 1}`);
    for (const tr of t.rows) ws.addRow([...tr.cells].map((td) => td.innerText ?? td.textContent));
  });
}
export function excel2pdf(ui) {
  let file = null;
  const orient = seg([['portrait', 'Vertical'], ['landscape', 'Horizontal']], 'landscape');
  const grid = toggle('Mostrar las líneas de las celdas', true);
  ui.opts.append(field('Orientación', orient), grid, note('Cada hoja se imprime como una tabla. En la ventana de impresión elige "Guardar como PDF".'));
  ui.work.append(fileDrop({ accept: '.xlsx,.xls,.xml,.csv', label: 'Suelta aquí el Excel (.xlsx, .xls) o CSV', thumbs: false, onChange: (f) => { file = f[0]; ui.ready(!!file); } }).root);
  ui.run('Convertir a PDF', async () => {
    const ExcelJS = await libs.excel();
    const wb = new ExcelJS.Workbook();
    progress('Leyendo la hoja de cálculo…');
    if (/\.csv$/i.test(file.name)) { const ws = wb.addWorksheet(baseName(file.name).slice(0, 31)); for (const r of parseCsv(await file.text())) ws.addRow(r); }
    else if (/\.(xls|xml)$/i.test(file.name)) await loadLegacySheet(wb, file);
    else await wb.xlsx.load(await file.arrayBuffer());
    const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    let html = `<style>@page{size:A4 ${orient.value};margin:12mm}table{border-collapse:collapse;width:100%;font-size:10px}td{padding:3px 5px;vertical-align:top;white-space:pre-line;overflow-wrap:anywhere;${grid.input.checked ? 'border:1px solid #bbb;' : ''}}h2{font-size:14px}</style>`;
    wb.eachSheet((ws) => {
      // hojas con muchas columnas: letra más pequeña para que quepan en el ancho de la página
      const cols = ws.columnCount;
      // ancho de cada columna según su contenido para que todas quepan en la página:
      // primero lo justo para no partir palabras (hasta 14 letras); lo que sobra, para el texto largo (hasta 60)
      const min = Array(cols).fill(2), want = Array(cols).fill(2);
      ws.eachRow({ includeEmpty: false }, (row) => {
        for (let c = 1; c <= cols; c++) {
          const t = String(row.getCell(c).text || ''); if (!t) continue;
          min[c - 1] = Math.max(min[c - 1], Math.min(14, Math.max(...t.split(/\s+/).map((w) => w.length))) + 1.5);
          want[c - 1] = Math.max(want[c - 1], Math.min(60, Math.max(...t.split('\n').map((l) => l.length))) + 1.5);
        }
      });
      const total = (a) => a.reduce((x, y) => x + y, 0);
      const pagePx = orient.value === 'landscape' ? 1030 : 700;                     // ancho útil del A4 con márgenes de 12 mm
      const fontPx = Math.max(5, Math.min(10, pagePx / (total(min) * 0.55)));       // ~0,55 em por carácter
      const k = Math.max(0, Math.min(1, (pagePx / (fontPx * 0.55) - total(min)) / Math.max(1, total(want) - total(min))));
      const wch = want.map((w, i) => min[i] + (Math.max(w, min[i]) - min[i]) * k), sum = total(wch);
      html += `<h2>${esc(ws.name)}</h2><table style="table-layout:fixed;font-size:${fontPx.toFixed(1)}px"><colgroup>${wch.map((w) => `<col style="width:${((w / sum) * 100).toFixed(2)}%">`).join('')}</colgroup>`;
      let first = true;
      ws.eachRow({ includeEmpty: false }, (row) => {
        // la primera fila (cabecera) se repite en cada página impresa
        html += first ? '<thead><tr>' : '<tr>';
        for (let c = 1; c <= ws.columnCount; c++) {
          const cell = row.getCell(c);
          if (cell.isMerged && cell.master !== cell) continue;
          const align = cell.alignment?.horizontal || (typeof cell.value === 'number' ? 'right' : '');
          const st = [cell.font?.bold ? 'font-weight:bold' : '', cell.fill?.fgColor?.argb ? `background:#${cell.fill.fgColor.argb.slice(2)}` : '', align ? `text-align:${align}` : ''].filter(Boolean).join(';');
          let txt = cell.text;
          const v = cell.value?.result ?? cell.value;
          if (v instanceof Date) txt = /h|general date/i.test(cell.numFmt || '') ? v.toLocaleString('es-ES', { timeZone: 'UTC', dateStyle: 'short', timeStyle: 'short' }) : v.toLocaleDateString('es-ES', { timeZone: 'UTC' });
          else if (typeof v === 'number') {
            const dec = /0\.(0+)/.exec(cell.numFmt || '')?.[1].length ?? (Number.isInteger(v) ? 0 : 2);
            txt = v.toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + (/"€"|€/.test(cell.numFmt || '') ? ' €' : '');
            if (/%/.test(cell.numFmt || '')) txt = `${(v * 100).toLocaleString('es-ES')} %`;
          }
          html += `<td style="${st}">${esc(txt)}</td>`;
        }
        html += first ? '</tr></thead><tbody>' : '</tr>';
        first = false;
      });
      if (!first) html += '</tbody>';
      html += '</table><div style="page-break-after:always"></div>';
    });
    await printHtml(html, baseName(file.name));
    return [];
  });
}

// ---------------- Página web → PDF ----------------
export function web2pdf(ui) {
  const list = el('div', { className: 'flist' });
  let tabId = null;
  const paper = select([['a4', 'A4'], ['letter', 'Carta']], 'a4');
  const orient = seg([['p', 'Vertical'], ['l', 'Horizontal']], 'p');
  const bg = toggle('Incluir fondos y colores', true);
  ui.opts.append(field('Papel', paper), field('Orientación', orient), bg, note('Chrome pedirá permiso la primera vez para poder imprimir pestañas.'));
  const load = el('button', { className: 'btn', textContent: 'Ver mis pestañas abiertas', type: 'button' });
  ui.work.append(note('Elige la pestaña que quieres guardar como PDF (tal como se imprime, con texto seleccionable).'), load, list);
  load.onclick = async () => {
    const ok = await chrome.permissions.request({ permissions: ['debugger'], origins: ['<all_urls>'] }).catch(() => false);
    if (!ok) return toast('Sin ese permiso no se pueden convertir pestañas');
    const tabs = (await chrome.tabs.query({})).filter((t) => /^https?:/.test(t.url || ''));
    list.replaceChildren(...tabs.map((t) => {
      const row = el('label', { className: 'fitem', style: 'grid-template-columns:22px 24px 1fr' }, el('input', { type: 'radio', name: 'tab' }), t.favIconUrl ? el('img', { src: t.favIconUrl, style: 'width:20px;height:20px' }) : el('span'), el('div', {}, el('b', { textContent: t.title }), el('small', { textContent: t.url })));
      row.querySelector('input').onchange = () => { tabId = t.id; ui.ready(true); };
      return row;
    }));
  };
  ui.run('Guardar como PDF', async () => {
    const tab = await chrome.tabs.get(tabId);
    progress('Imprimiendo la página…');
    const [w, h] = paper.value === 'a4' ? [8.27, 11.69] : [8.5, 11];
    await chrome.debugger.attach({ tabId }, '1.3');
    try {
      const r = await chrome.debugger.sendCommand({ tabId }, 'Page.printToPDF', { printBackground: bg.input.checked, landscape: orient.value === 'l', paperWidth: w, paperHeight: h, marginTop: 0.4, marginBottom: 0.4, marginLeft: 0.4, marginRight: 0.4 });
      const bytes = Uint8Array.from(atob(r.data), (c) => c.charCodeAt(0));
      return [{ name: `${safe(tab.title || 'pagina').slice(0, 60)}.pdf`, blob: new Blob([bytes], { type: 'application/pdf' }) }];
    } finally { await chrome.debugger.detach({ tabId }).catch(() => {}); }
  });
}
