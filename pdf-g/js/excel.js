// PDF G · PDF → Excel
import { pdfjs, el, libs, renderPage } from './core.js';
import { readPage, analyzePage, detectLocale, parseValue } from './table.js';
import { ocrPage } from './ocr.js';

// Analiza todas las páginas (con OCR si una página no tiene texto)
export async function analyzeDocument(doc, opts, onProgress) {
  const raw = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    let pg = await readPage(page, pdfjs.OPS);
    let ocr = false;
    if (opts.ocr === 'always' || (opts.ocr !== 'never' && pg.items.length < 3)) {
      await libs.tesseract();
      onProgress?.(`Reconociendo texto (OCR) de la página ${i} de ${doc.numPages}…`, (i - 1) / doc.numPages);
      pg = await ocrPage(page, { lang: opts.ocrLang || 'spa+eng', onProgress: (p) => onProgress?.(`OCR página ${i}: ${Math.round(p * 100)} %`, (i - 1 + p) / doc.numPages) });
      ocr = true;
    }
    raw.push({ index: i, pg, ocr });
    onProgress?.(`Analizando la página ${i} de ${doc.numPages}…`, i / doc.numPages);
  }
  const locale = opts.locale === 'auto' ? detectLocale(raw.flatMap((r) => r.pg.items.map((x) => x.str))) : opts.locale;
  return { locale, pages: raw.map((r) => ({ index: r.index, ocr: r.ocr, width: r.pg.width, height: r.pg.height, blocks: analyzePage(r.pg, { mode: opts.mode, locale, mergeWrapped: opts.mergeWrapped }) })) };
}

// ---------- libro de Excel ----------
const sameRow = (a, b) => a && b && a.length === b.length && a.every((v, i) => String(v).trim() === String(b[i]).trim());
function cellValue(raw, opts, locale) {
  if (!opts.convert) return { value: raw };
  const p = parseValue(raw, locale);
  if (p.v == null) return { value: null };
  if (p.date) return { value: p.v, numFmt: 'dd/mm/yyyy' };
  if (p.pct) return { value: p.v, numFmt: Number.isInteger(+(p.v * 100).toFixed(6)) ? '0%' : '0.00%' };
  if (p.num) {
    const dec = p.dec ?? 0, base = dec ? `#,##0.${'0'.repeat(Math.min(dec, 4))}` : '#,##0';
    return { value: p.v, numFmt: p.cur ? `${base} "${p.cur === 'EUR' ? '€' : p.cur}"` : base };
  }
  return { value: p.v };
}
export async function buildWorkbook(result, opts) {
  const ExcelJS = await libs.excel();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PDF G'; wb.created = new Date();
  const { locale } = result;
  const thin = { style: 'thin', color: { argb: 'FFBFC5D6' } };
  const widths = new Map();
  const put = (ws, rowIdx, cells, kind) => {
    const row = ws.getRow(rowIdx);
    cells.forEach((raw, c) => {
      const cell = row.getCell(c + 1);
      const { value, numFmt } = kind === 'text' ? { value: raw } : cellValue(raw, opts, locale);
      cell.value = value;
      if (numFmt) cell.numFmt = numFmt;
      if (kind === 'header') { cell.font = { bold: true, color: { argb: 'FF1B1F30' } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E4FF' } }; }
      if (kind !== 'text') cell.border = { top: thin, bottom: thin, left: thin, right: thin };
      const len = String(raw ?? '').length;
      const key = `${ws.id}:${c}`;
      if (kind !== 'text' || cells.length > 1) widths.set(key, Math.max(widths.get(key) || 8, Math.min(60, len + 2)));
    });
  };
  const sheetName = (n) => String(n).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31);
  let single = null, r = 1, lastHeader = null, tableCount = 0;
  for (const page of result.pages) {
    let ws;
    if (opts.output === 'single') ws = single ||= wb.addWorksheet('Datos');
    else if (opts.output === 'pages') { ws = wb.addWorksheet(sheetName(`Página ${page.index}`)); r = 1; }
    for (const b of page.blocks) {
      if (b.type === 'text') {
        if (!opts.includeText || opts.output === 'tables') continue;
        put(ws, r++, [b.text], 'text');
        continue;
      }
      if (opts.output === 'tables') { tableCount++; ws = wb.addWorksheet(sheetName(`Tabla ${tableCount} (pág. ${page.index})`)); r = 1; lastHeader = null; }
      const hdr = b.header === 0 ? b.rows[0] : null;
      let rows = b.rows;
      // en una sola hoja, la cabecera repetida en cada página se escribe una vez
      if (hdr && opts.output === 'single' && sameRow(hdr, lastHeader)) rows = rows.slice(1);
      else if (opts.output !== 'single' && r > 1) r++;
      rows.forEach((row) => put(ws, r++, row, hdr && row === hdr ? 'header' : 'cell'));
      if (hdr) lastHeader = hdr;
      if (opts.output === 'tables' && hdr) { ws.views = [{ state: 'frozen', ySplit: 1 }]; ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: hdr.length } }; }
    }
  }
  if (!wb.worksheets.length) wb.addWorksheet('Datos');
  for (const ws of wb.worksheets) for (const [key, w] of widths) { const [id, c] = key.split(':').map(Number); if (id === ws.id) ws.getColumn(c + 1).width = w; }
  return new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
export function toCsv(result, opts) {
  const sep = result.locale === 'es' ? ';' : ',';
  const lines = []; let lastHeader = null;
  for (const page of result.pages) for (const b of page.blocks) {
    if (b.type === 'text') { if (opts.includeText) lines.push([b.text]); continue; }
    let rows = b.rows;
    if (b.header === 0 && sameRow(b.rows[0], lastHeader)) rows = rows.slice(1);
    if (b.header === 0) lastHeader = b.rows[0];
    lines.push(...rows);
  }
  const q = (v) => (/[";\n,]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : v);
  return new Blob([`\ufeff${lines.map((r) => r.map((v) => q(v ?? '')).join(sep)).join('\r\n')}`], { type: 'text/csv' });
}

// ---------- vista previa editable ----------
export async function renderPreview(container, doc, result, onEdit) {
  container.replaceChildren();
  for (const page of result.pages) {
    const tables = page.blocks.filter((b) => b.type === 'table');
    const canvas = await renderPage(await doc.getPage(page.index), { width: 260 });
    const k = canvas.width / page.width;
    const thumb = el('div', { className: 'xl-thumb' }, canvas);
    tables.forEach((t, n) => {
      if (!t.bbox) return;
      const [x0, y0, x1, y1] = t.bbox;
      const box = el('div', { className: 'xl-box', textContent: n + 1 });
      Object.assign(box.style, { left: `${x0 * k - 3}px`, top: `${y0 * k - 3}px`, width: `${(x1 - x0) * k + 6}px`, height: `${(y1 - y0) * k + 6}px` });
      thumb.append(box);
    });
    const right = el('div', { className: 'xl-tables' });
    if (!tables.length) right.append(el('p', { className: 'muted', textContent: 'No se ha detectado ninguna tabla en esta página (su texto se incluirá si activas "Incluir texto fuera de tablas").' }));
    tables.forEach((t, n) => {
      const tbl = el('table', { className: 'xl-table' });
      t.rows.slice(0, 200).forEach((row, ri) => {
        const tr = el('tr');
        row.forEach((v, ci) => {
          const td = el(ri === t.header ? 'th' : 'td', { textContent: v, contentEditable: 'true', spellcheck: false });
          const p = parseValue(v, result.locale);
          if (p.num || p.date) td.className = 'num';
          td.oninput = () => { t.rows[ri][ci] = td.textContent; onEdit?.(); };
          tr.append(td);
        });
        tbl.append(tr);
      });
      right.append(el('div', { className: 'xl-tcap' }, el('b', { textContent: `Tabla ${n + 1}` }), el('span', { className: 'muted', textContent: ` · ${t.rows.length} filas × ${t.rows[0]?.length || 0} columnas${t.ruled ? ' · con bordes' : ''}` })), el('div', { className: 'xl-scroll' }, tbl));
    });
    container.append(el('section', { className: 'xl-page' }, el('div', { className: 'xl-ph' }, el('b', { textContent: `Página ${page.index}` }), page.ocr ? el('span', { className: 'pill', textContent: 'OCR' }) : null), el('div', { className: 'xl-row' }, thumb, right)));
  }
}
