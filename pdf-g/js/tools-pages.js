// PDF G · organizar páginas, optimizar y seguridad
import { el, libs, openPdf, readBytes, renderPage, parseRanges, progress, toast, field, select, seg, toggle, qpdf, fmtSize } from './core.js';
import { fileDrop, pageGrid, outName, isImage } from './ui.js';
import { imageBytes } from './tools-convert.js';
import { ocrPage } from './ocr.js';
import { layoutSection, ocrLayoutSection } from './word-layout.js';

const ACCEPT_PDF = '.pdf,application/pdf';
const note = (t) => el('p', { className: 'muted', style: 'font-size:12.5px', textContent: t });
const loadLib = async (bytes) => { const { PDFDocument } = await libs.pdflib(); return PDFDocument.load(bytes, { ignoreEncryption: true }); };
const pdfBlob = async (pdf) => new Blob([await pdf.save({ useObjectStreams: true })], { type: 'application/pdf' });
const jpegOf = async (canvas, q) => new Uint8Array(await (await new Promise((r) => canvas.toBlob(r, 'image/jpeg', q))).arrayBuffer());

// ---------------- Unir ----------------
export function merge(ui) {
  let files = [];
  ui.opts.append(note('Arrastra los archivos para ordenarlos. También puedes añadir imágenes: se convierten en páginas.'));
  ui.work.append(fileDrop({ accept: '.pdf,application/pdf,image/*', multiple: true, label: 'Suelta aquí los PDF que quieres unir', onChange: (f) => { files = f; ui.ready(files.length >= 2); } }).root);
  ui.run('Unir PDF', async () => {
    const { PDFDocument } = await libs.pdflib();
    const out = await PDFDocument.create();
    for (const [k, f] of files.entries()) {
      progress(`Añadiendo ${f.name}…`, k / files.length);
      if (isImage(f)) {
        const { kind, bytes } = await imageBytes(f);
        const img = kind === 'jpg' ? await out.embedJpg(bytes) : await out.embedPng(bytes);
        const [pw, ph] = img.width > img.height ? [841.89, 595.28] : [595.28, 841.89];
        const s = Math.min((pw - 40) / img.width, (ph - 40) / img.height);
        out.addPage([pw, ph]).drawImage(img, { x: (pw - img.width * s) / 2, y: (ph - img.height * s) / 2, width: img.width * s, height: img.height * s });
        continue;
      }
      const src = await loadLib(await readBytes(f));
      for (const p of await out.copyPages(src, src.getPageIndices())) out.addPage(p);
    }
    return [{ name: 'unido.pdf', blob: await pdfBlob(out), note: `${out.getPageCount()} páginas` }];
  });
}

// ---------------- Dividir ----------------
export function split(ui) {
  let file = null;
  const n = el('input', { type: 'number', min: 1, value: 2 });
  const ranges = el('input', { type: 'text', placeholder: 'p. ej. 1-3, 4-7, 8' });
  const nRow = field('Páginas por archivo', n); nRow.hidden = true;
  const rRow = field('Rangos (un archivo por rango)', ranges, 'Separa los rangos con comas'); rRow.hidden = true;
  const mode = seg([['each', 'Cada página'], ['n', 'Cada N páginas'], ['ranges', 'Por rangos']], 'each', (v) => { nRow.hidden = v !== 'n'; rRow.hidden = v !== 'ranges'; });
  ui.opts.append(field('Cómo dividir', mode), nRow, rRow);
  ui.work.append(fileDrop({ accept: ACCEPT_PDF, onChange: (f) => { file = f[0]; ui.ready(!!file); } }).root);
  ui.run('Dividir PDF', async () => {
    const src = await loadLib(await readBytes(file));
    const N = src.getPageCount();
    let groups = [];
    if (mode.value === 'each') groups = [...Array(N).keys()].map((i) => [i]);
    else if (mode.value === 'n') { const k = Math.max(1, Number(n.value) || 1); for (let i = 0; i < N; i += k) groups.push([...Array(Math.min(k, N - i)).keys()].map((j) => i + j)); }
    else groups = ranges.value.split(',').map((r) => parseRanges(r, N)).filter((g) => g.length);
    if (!groups.length) throw new Error('Escribe al menos un rango válido');
    const { PDFDocument } = await libs.pdflib();
    const out = [];
    for (const [k, g] of groups.entries()) {
      progress(`Creando el archivo ${k + 1} de ${groups.length}…`, k / groups.length);
      const d = await PDFDocument.create();
      for (const p of await d.copyPages(src, g)) d.addPage(p);
      const label = g.length === 1 ? `p${g[0] + 1}` : `p${g[0] + 1}-${g[g.length - 1] + 1}`;
      out.push({ name: outName(file, label), blob: await pdfBlob(d), note: `${g.length} pág.` });
    }
    return out;
  });
}

// ---------------- Organizar (reordenar, girar, borrar, duplicar, insertar) ----------------
export function organize(ui, preset) {
  let file = null, grid = null, extra = [];
  const tools = el('div', { className: 'row2' });
  const btn = (t, fn) => { const b = el('button', { className: 'btn sm', textContent: t, type: 'button' }); b.onclick = () => { if (grid) { fn(); grid.draw(); } }; return b; };
  const sel = () => grid.order.filter((p) => p.sel);
  tools.append(
    btn('Seleccionar todas', () => grid.order.forEach((p) => { p.sel = true; })), btn('Quitar selección', () => grid.order.forEach((p) => { p.sel = false; })),
    btn('↺ Girar selección', () => (sel().length ? sel() : grid.order).forEach((p) => { p.rot = (p.rot + 270) % 360; })), btn('↻ Girar selección', () => (sel().length ? sel() : grid.order).forEach((p) => { p.rot = (p.rot + 90) % 360; })),
    btn('🗑 Borrar selección', () => sel().forEach((p) => { p.del = true; })), btn('+ Página en blanco', () => { const i = Math.max(-1, ...grid.order.map((p, k) => (p.sel ? k : -1))); grid.order.splice(i + 1, 0, { src: -1, blank: true, rot: 0, del: false, sel: false }); }));
  const addFile = el('input', { type: 'file', accept: ACCEPT_PDF, hidden: true });
  const addBtn = el('button', { className: 'btn sm', textContent: '+ Añadir páginas de otro PDF', type: 'button', style: 'width:100%;margin-top:8px' });
  addBtn.onclick = () => addFile.click();
  addFile.onchange = async () => {
    const f = addFile.files[0]; addFile.value = ''; if (!f || !grid) return;
    const d = await openPdf(await readBytes(f));
    extra.push({ file: f, n: d.numPages });
    toast(`Se añadirán ${d.numPages} páginas de ${f.name} al final`);
  };
  const hint = { rotate: 'Selecciona páginas (o ninguna para todas) y gíralas.', delete: 'Selecciona las páginas que quieres borrar y pulsa "Borrar selección".', organize: 'Arrastra las miniaturas para reordenar. Pasa el ratón por una página para girarla, duplicarla o borrarla. Mayús+clic selecciona varias.' }[preset || 'organize'];
  ui.opts.append(note(hint), tools, addBtn, addFile);
  const area = el('div');
  ui.work.append(fileDrop({ accept: ACCEPT_PDF, onChange: async (f) => {
    file = f[0]; area.replaceChildren(); grid = null; extra = [];
    if (file) { progress('Cargando páginas…'); grid = await pageGrid(area, await openPdf(await readBytes(file)), { editable: true }); progress(null); }
    ui.ready(!!file);
  } }).root, area);
  ui.run('Guardar PDF', async () => {
    const { PDFDocument, degrees } = await libs.pdflib();
    const src = await loadLib(await readBytes(file));
    const out = await PDFDocument.create();
    const keep = grid.order.filter((p) => !p.del);
    const realIdx = [...new Set(keep.filter((p) => !p.blank).map((p) => p.src))];
    const copied = new Map((await out.copyPages(src, realIdx)).map((pg, i) => [realIdx[i], pg]));
    const used = new Set();
    const { width: bw, height: bh } = src.getPage(0).getSize();
    for (const p of keep) {
      if (p.blank) { out.addPage([bw, bh]); continue; }
      let pg = copied.get(p.src);
      if (used.has(p.src)) [pg] = await out.copyPages(src, [p.src]);   // páginas duplicadas
      used.add(p.src);
      out.addPage(pg);
      if (p.rot) pg.setRotation(degrees((pg.getRotation().angle + p.rot) % 360));
    }
    for (const x of extra) { const d = await loadLib(await readBytes(x.file)); for (const pg of await out.copyPages(d, d.getPageIndices())) out.addPage(pg); }
    return [{ name: outName(file, preset === 'delete' ? 'sin_paginas' : preset === 'rotate' ? 'girado' : 'organizado'), blob: await pdfBlob(out), note: `${out.getPageCount()} páginas` }];
  });
}

// ---------------- Extraer páginas ----------------
export function extract(ui) {
  let file = null, grid = null;
  const sep = toggle('Un PDF por cada página seleccionada', false);
  const ranges = el('input', { type: 'text', placeholder: 'o escribe: 1-3, 7' });
  ui.opts.append(note('Haz clic en las páginas que quieres extraer (Mayús+clic para un rango).'), field('Páginas', ranges), sep);
  const area = el('div');
  ui.work.append(fileDrop({ accept: ACCEPT_PDF, onChange: async (f) => { file = f[0]; area.replaceChildren(); grid = null; if (file) { progress('Cargando páginas…'); grid = await pageGrid(area, await openPdf(await readBytes(file)), { onChange: () => ui.ready(grid.selected().length > 0) }); progress(null); } ui.ready(false); } }).root, area);
  ranges.oninput = () => { if (!grid) return; const idx = parseRanges(ranges.value, grid.order.length); grid.order.forEach((p, i) => { p.sel = idx.includes(i); }); grid.draw(); ui.ready(idx.length > 0); };
  ui.run('Extraer páginas', async () => {
    const { PDFDocument } = await libs.pdflib();
    const src = await loadLib(await readBytes(file));
    const idx = grid.selected();
    const groups = sep.input.checked ? idx.map((i) => [i]) : [idx];
    const out = [];
    for (const g of groups) { const d = await PDFDocument.create(); for (const p of await d.copyPages(src, g)) d.addPage(p); out.push({ name: outName(file, g.length === 1 ? `p${g[0] + 1}` : 'extracto'), blob: await pdfBlob(d), note: `${g.length} pág.` }); }
    return out;
  });
}

// ---------------- Comprimir ----------------
function ascii85(bytes) {
  const s = new TextDecoder('latin1').decode(bytes).replace(/^<~/, '').replace(/~>[\s\S]*$/, '').replace(/\s/g, '');
  const out = []; let tuple = 0, n = 0;
  for (const ch of s) {
    if (ch === 'z' && n === 0) { out.push(0, 0, 0, 0); continue; }
    const c = ch.charCodeAt(0) - 33; if (c < 0 || c > 84) continue;
    tuple = tuple * 85 + c; n++;
    if (n === 5) { out.push((tuple >>> 24) & 255, (tuple >>> 16) & 255, (tuple >>> 8) & 255, tuple & 255); tuple = 0; n = 0; }
  }
  if (n > 1) { for (let k = n; k < 5; k++) tuple = tuple * 85 + 84; for (let k = 0; k < n - 1; k++) out.push((tuple >>> (24 - k * 8)) & 255); }
  return new Uint8Array(out);
}
async function inflate(bytes) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer()); }
function unpredictPng(data, w, comps) {
  const stride = w * comps, rows = Math.floor(data.length / (stride + 1)), out = new Uint8Array(rows * stride);
  for (let y = 0; y < rows; y++) {
    const f = data[y * (stride + 1)], row = data.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), o = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= comps ? out[o + x - comps] : 0, b = y ? out[o - stride + x] : 0, c = x >= comps && y ? out[o - stride + x - comps] : 0;
      let v = row[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[o + x] = v & 255;
    }
  }
  return out;
}
// Recomprime las imágenes internas del PDF (las reduce y las guarda en JPEG)
async function compressImages(pdf, { maxDim, quality }, onProgress) {
  const { PDFName, PDFRawStream, PDFNumber, PDFArray } = await libs.pdflib();
  const ctx = pdf.context;
  const N = (d, k) => { const v = d.lookup(PDFName.of(k)); return v instanceof PDFNumber ? v.asNumber() : null; };
  const objs = ctx.enumerateIndirectObjects().filter(([, o]) => o instanceof PDFRawStream && o.dict.lookup(PDFName.of('Subtype'))?.toString() === '/Image');
  let done = 0, saved = 0;
  for (const [ref, obj] of objs) {
    onProgress?.(++done / objs.length);
    const d = obj.dict;
    if (d.lookup(PDFName.of('ImageMask'))?.toString() === 'true' || d.has(PDFName.of('Decode'))) continue;
    const w = N(d, 'Width'), h = N(d, 'Height'), bpc = N(d, 'BitsPerComponent');
    // filtros: se admite ASCII85 delante de Flate/DCT (habitual en PDF generados por programas)
    let filters = d.lookup(PDFName.of('Filter'));
    filters = filters instanceof PDFArray ? [...Array(filters.size()).keys()].map((k) => filters.lookup(k).toString()) : filters ? [filters.toString()] : [];
    let data = obj.contents;
    if (filters[0] === '/ASCII85Decode' || filters[0] === '/A85') { data = ascii85(data); filters.shift(); }
    if (filters.length !== 1) continue;
    const filter = filters[0];
    const cs = d.lookup(PDFName.of('ColorSpace'));
    let comps = null;
    if (cs?.toString() === '/DeviceRGB') comps = 3; else if (cs?.toString() === '/DeviceGray') comps = 1;
    else if (cs instanceof PDFArray && cs.lookup(0)?.toString() === '/ICCBased') { const n = cs.lookup(1)?.dict?.lookup(PDFName.of('N')); comps = n instanceof PDFNumber ? n.asNumber() : null; if (comps === 4) comps = null; }
    if (!w || !h || w * h < 40000) continue;
    let bmp = null;
    try {
      if (filter === '/DCTDecode' && comps) bmp = await createImageBitmap(new Blob([data], { type: 'image/jpeg' }));
      else if (filter === '/FlateDecode' && bpc === 8 && comps) {
        let raw = await inflate(data);
        const parms = d.lookup(PDFName.of('DecodeParms'));
        const pred = parms?.lookup?.(PDFName.of('Predictor'));
        if (pred && pred.asNumber() >= 10) raw = unpredictPng(raw, w, comps);
        if (raw.length < w * h * comps) continue;
        const rgba = new Uint8ClampedArray(w * h * 4);
        for (let i = 0, j = 0; i < w * h; i++, j += comps) { rgba[i * 4] = raw[j]; rgba[i * 4 + 1] = raw[j + (comps === 3 ? 1 : 0)]; rgba[i * 4 + 2] = raw[j + (comps === 3 ? 2 : 0)]; rgba[i * 4 + 3] = 255; }
        bmp = await createImageBitmap(new ImageData(rgba, w, h));
      }
    } catch { bmp = null; }
    if (!bmp) continue;
    const k = Math.min(1, maxDim / Math.max(w, h));
    const nw = Math.max(1, Math.round(w * k)), nh = Math.max(1, Math.round(h * k));
    const c = new OffscreenCanvas(nw, nh); const cx = c.getContext('2d');
    cx.fillStyle = '#fff'; cx.fillRect(0, 0, nw, nh); cx.drawImage(bmp, 0, 0, nw, nh);
    const jpg = new Uint8Array(await (await c.convertToBlob({ type: 'image/jpeg', quality })).arrayBuffer());
    if (jpg.length >= obj.contents.length * 0.92) continue;
    const nd = d.clone(ctx);
    nd.set(PDFName.of('Width'), PDFNumber.of(nw)); nd.set(PDFName.of('Height'), PDFNumber.of(nh));
    nd.set(PDFName.of('Filter'), PDFName.of('DCTDecode')); nd.set(PDFName.of('BitsPerComponent'), PDFNumber.of(8));
    nd.set(PDFName.of('ColorSpace'), PDFName.of('DeviceRGB')); nd.delete(PDFName.of('DecodeParms'));
    saved += obj.contents.length - jpg.length;
    ctx.assign(ref, PDFRawStream.of(nd, jpg));
  }
  return saved;
}
export const COMPRESS_LEVELS = { med: { maxDim: 1700, quality: 0.72 }, high: { maxDim: 1150, quality: 0.5 } };
export function compress(ui) {
  let files = [];
  const level = seg([['low', 'Ligera'], ['med', 'Recomendada'], ['high', 'Fuerte'], ['max', 'Máxima']], 'med');
  ui.opts.append(field('Nivel de compresión', level),
    el('p', { className: 'muted', style: 'font-size:12px', textContent: 'Ligera: sin pérdida (optimiza la estructura). Recomendada y Fuerte: además recomprime las imágenes. Máxima: convierte cada página en imagen (el texto deja de ser seleccionable).' }));
  ui.work.append(fileDrop({ accept: ACCEPT_PDF, multiple: true, onChange: (f) => { files = f; ui.ready(files.length > 0); } }).root);
  ui.run('Comprimir', async () => {
    const out = [];
    for (const f of files) {
      const orig = await readBytes(f);
      let bytes;
      if (level.value === 'max') {
        const { PDFDocument } = await libs.pdflib();
        const doc = await openPdf(orig), d = await PDFDocument.create();
        for (let i = 1; i <= doc.numPages; i++) {
          progress(`${f.name}: página ${i} de ${doc.numPages}…`, i / doc.numPages);
          const page = await doc.getPage(i), vp = page.getViewport({ scale: 1 });
          const img = await d.embedJpg(await jpegOf(await renderPage(page, { scale: 1.4 }), 0.6));
          d.addPage([vp.width, vp.height]).drawImage(img, { x: 0, y: 0, width: vp.width, height: vp.height });
        }
        bytes = await d.save({ useObjectStreams: true });
      } else {
        const pdf = await loadLib(orig);
        if (level.value !== 'low') await compressImages(pdf, COMPRESS_LEVELS[level.value], (v) => progress(`${f.name}: recomprimiendo imágenes…`, v));
        progress(`${f.name}: optimizando…`);
        bytes = await pdf.save({ useObjectStreams: true });
      }
      try { bytes = await qpdf(bytes, ['--object-streams=generate', '--compress-streams=y', '--recompress-flate', '--compression-level=9']); } catch {}
      const final = bytes.length < orig.length ? bytes : orig;
      const pct = Math.round((1 - final.length / orig.length) * 100);
      out.push({ name: outName(f, 'comprimido'), blob: new Blob([final], { type: 'application/pdf' }), note: pct > 0 ? `antes ${fmtSize(orig.length)} · −${pct} %` : 'ya estaba optimizado' });
    }
    return out;
  });
}

// ---------------- Proteger / desbloquear / reparar ----------------
export function protect(ui) {
  let file = null;
  const pw = el('input', { type: 'password', placeholder: 'Contraseña para abrir' });
  const pw2 = el('input', { type: 'password', placeholder: 'Repite la contraseña' });
  const print = toggle('Permitir imprimir', true), copy = toggle('Permitir copiar texto', false), mod = toggle('Permitir modificar', false);
  ui.opts.append(field('Contraseña', pw), field('Confirmar', pw2), print, copy, mod, el('p', { className: 'muted', style: 'font-size:12px', textContent: 'Cifrado AES de 256 bits.' }));
  ui.work.append(fileDrop({ accept: ACCEPT_PDF, onChange: (f) => { file = f[0]; ui.ready(!!file); } }).root);
  ui.run('Proteger PDF', async () => {
    if (!pw.value) throw new Error('Escribe una contraseña');
    if (pw.value !== pw2.value) throw new Error('Las contraseñas no coinciden');
    progress('Cifrando…');
    const owner = `${pw.value}#${crypto.getRandomValues(new Uint32Array(2)).join('')}`;
    const bytes = await qpdf(await readBytes(file), ['--encrypt', pw.value, owner, '256', `--print=${print.input.checked ? 'full' : 'none'}`, `--extract=${copy.input.checked ? 'y' : 'n'}`, `--modify=${mod.input.checked ? 'all' : 'none'}`, '--']);
    return [{ name: outName(file, 'protegido'), blob: new Blob([bytes], { type: 'application/pdf' }) }];
  });
}
export function unlock(ui) {
  let file = null;
  const pw = el('input', { type: 'password', placeholder: 'Contraseña del PDF' });
  ui.opts.append(field('Contraseña actual', pw, 'Si el PDF solo tiene restricciones (no pide contraseña al abrirlo), déjala en blanco.'));
  ui.work.append(fileDrop({ accept: ACCEPT_PDF, onChange: (f) => { file = f[0]; ui.ready(!!file); } }).root);
  ui.run('Quitar contraseña', async () => {
    progress('Descifrando…');
    try {
      const bytes = await qpdf(await readBytes(file), [...(pw.value ? [`--password=${pw.value}`] : []), '--decrypt']);
      return [{ name: outName(file, 'desbloqueado'), blob: new Blob([bytes], { type: 'application/pdf' }) }];
    } catch { throw new Error('Contraseña incorrecta o PDF dañado'); }
  });
}
export function repair(ui) {
  let file = null;
  ui.opts.append(note('Reconstruye la estructura interna del PDF. Útil cuando un PDF no se abre bien, da errores al imprimir o algunos programas lo rechazan.'));
  ui.work.append(fileDrop({ accept: ACCEPT_PDF, onChange: (f) => { file = f[0]; ui.ready(!!file); } }).root);
  ui.run('Reparar PDF', async () => {
    progress('Reparando…');
    const bytes = await qpdf(await readBytes(file), ['--object-streams=generate']);
    return [{ name: outName(file, 'reparado'), blob: new Blob([bytes], { type: 'application/pdf' }) }];
  });
}

// ---------------- OCR: PDF escaneado → PDF con texto buscable ----------------
export function ocr(ui) {
  let file = null;
  const output = seg([['word', 'Word editable'], ['pdf', 'PDF buscable'], ['both', 'Ambos']], 'word', (v) => { force.hidden = v === 'word'; });
  const lang = select([['spa+eng', 'Español + inglés'], ['spa', 'Español'], ['eng', 'Inglés']], 'spa+eng');
  const force = toggle('Reconocer también las páginas que ya tienen texto', false); force.hidden = true;
  const txt = toggle('Descargar también el texto (.txt)', false);
  ui.opts.append(field('Resultado', output, 'Word editable: mismo diseño que el original (colores, imágenes y posiciones) con el texto reconocido para editarlo. PDF buscable: el PDF no cambia de aspecto y se puede buscar y copiar el texto.'), field('Idioma del documento', lang), force, txt);
  ui.work.append(fileDrop({ accept: ACCEPT_PDF, onChange: (f) => { file = f[0]; ui.ready(!!file); } }).root);
  ui.run('Reconocer texto (OCR)', async () => {
    await libs.tesseract();
    const L = await libs.pdflib();
    const wantPdf = output.value !== 'word', wantWord = output.value !== 'pdf';
    const bytes = await readBytes(file);
    const doc = await openPdf(bytes), pdf = wantPdf ? await loadLib(bytes) : null;
    const font = wantPdf ? await pdf.embedFont(L.StandardFonts.Helvetica) : null;
    const chars = new Set(font?.getCharacterSet() || []);
    const clean = (s) => [...s].map((ch) => (chars.has(ch.codePointAt(0)) ? ch : '?')).join('');
    const D = wantWord ? await libs.docx() : null;
    const texts = [], sections = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      const hasText = tc.items.filter((x) => x.str.trim()).length > 5;
      // Word: las páginas con texto visible se convierten tal cual (si la capa de texto es invisible, se hace OCR)
      let wordDone = false;
      if (wantWord && hasText) { progress(`Preparando la página ${i} de ${doc.numPages}…`, (i - 1) / doc.numPages); const s = await layoutSection(D, page); if (s) { sections.push(s); wordDone = true; } }
      const pdfOcr = wantPdf && (!hasText || force.input.checked);
      if (!pdfOcr && (!wantWord || wordDone)) { texts.push(tc.items.map((x) => x.str).join(' ')); continue; }
      const r = await ocrPage(page, { lang: lang.value, onProgress: (p) => progress(`Reconociendo la página ${i} de ${doc.numPages}…`, (i - 1 + p) / doc.numPages) });
      texts.push(r.text);
      if (pdfOcr) {
        const vp = page.getViewport({ scale: 1 }), pg = pdf.getPage(i - 1);
        for (const w of r.items) {
          const s = clean(w.str); if (!s.trim()) continue;
          const width1 = font.widthOfTextAtSize(s, 1) || 1;
          const size = Math.max(2, (w.x1 - w.x0) / width1);
          const [x, y] = vp.convertToPdfPoint(w.x0, w.bottom - (w.bottom - w.top) * 0.18);
          pg.drawText(s, { x, y, size: Math.min(size, (w.bottom - w.top) * 1.3), font, color: L.rgb(0, 0, 0), opacity: 0 });
        }
      }
      if (wantWord && !wordDone) {
        progress(`Colocando el texto de la página ${i}…`, i / doc.numPages);
        sections.push((await ocrLayoutSection(D, page, r)) || await imageSection(D, page));
      }
    }
    const out = [];
    if (wantWord) { progress('Creando el documento Word…'); out.push({ name: outName(file, '', 'docx'), blob: await D.Packer.toBlob(new D.Document({ creator: 'PDF G', sections })) }); }
    if (wantPdf) out.push({ name: outName(file, 'ocr'), blob: await pdfBlob(pdf) });
    if (txt.input.checked) out.push({ name: outName(file, 'ocr', 'txt'), blob: new Blob([texts.join('\n\n\f\n')], { type: 'text/plain;charset=utf-8' }) });
    return out;
  });
}
// Página sin texto reconocible: la imagen a página completa
async function imageSection(D, page) {
  const vp = page.getViewport({ scale: 1 });
  const data = await jpegOf(await renderPage(page, { scale: 2 }), 0.9);
  return { properties: { page: { size: { width: Math.round(vp.width * 20), height: Math.round(vp.height * 20) }, margin: { top: 0, bottom: 0, left: 0, right: 0, header: 0, footer: 0 } } },
    children: [new D.Paragraph({ children: [new D.ImageRun({ type: 'jpg', data, transformation: { width: Math.round(vp.width * 96 / 72) - 1, height: Math.round(vp.height * 96 / 72) - 2 } })] })] };
}

// ---------------- Aplanar ----------------
export function flatten(ui) {
  let file = null;
  const raster = toggle('Convertir cada página en imagen (aplana todo: anotaciones, firmas, capas)', false);
  ui.opts.append(note('Fija los campos de formulario rellenados para que no se puedan modificar.'), raster);
  ui.work.append(fileDrop({ accept: ACCEPT_PDF, onChange: (f) => { file = f[0]; ui.ready(!!file); } }).root);
  ui.run('Aplanar PDF', async () => {
    const bytes = await readBytes(file);
    if (raster.input.checked) {
      const { PDFDocument } = await libs.pdflib();
      const doc = await openPdf(bytes), d = await PDFDocument.create();
      for (let i = 1; i <= doc.numPages; i++) {
        progress(`Página ${i} de ${doc.numPages}…`, i / doc.numPages);
        const page = await doc.getPage(i), vp = page.getViewport({ scale: 1 });
        const img = await d.embedJpg(await jpegOf(await renderPage(page, { scale: 2 }), 0.9));
        d.addPage([vp.width, vp.height]).drawImage(img, { x: 0, y: 0, width: vp.width, height: vp.height });
      }
      return [{ name: outName(file, 'aplanado'), blob: await pdfBlob(d) }];
    }
    const pdf = await loadLib(bytes);
    try { pdf.getForm().flatten(); } catch {}
    return [{ name: outName(file, 'aplanado'), blob: await pdfBlob(pdf) }];
  });
}
