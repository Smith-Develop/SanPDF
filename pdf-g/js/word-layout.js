// PDF G · PDF → Word conservando el diseño (como al abrir el PDF con Word)
// Cada página se convierte en una sección del mismo tamaño que el PDF:
// - fondo: la página dibujada sin el texto (imágenes, colores, formas) detrás del documento
// - encima: el texto editable en marcos colocados en su posición, con su fuente, tamaño y color
import { pdfjs } from './core.js';

const SCALE = 2;            // resolución del fondo (2 = 144 ppp)
const TW = 20;              // twips por punto

// Dibuja la página. Con noText, el texto horizontal no se pinta (queda en el fondo solo lo demás).
async function draw(page, vp, noText) {
  const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  if (noText) {
    // pdf.js pinta el texto con fillText/strokeText; el texto girado se deja en el fondo
    for (const fn of ['fillText', 'strokeText']) {
      const orig = ctx[fn].bind(ctx);
      ctx[fn] = function (...a) { const m = this.getTransform(); if (Math.abs(m.b) > 1e-3 || Math.abs(m.c) > 1e-3) orig(...a); };
    }
  }
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  return c;
}

// "ABCDEE+Calibri,Bold" → { family: 'Calibri', bold: true }
const FAMILY = { Helvetica: 'Arial', Times: 'Times New Roman', TimesRoman: 'Times New Roman', Courier: 'Courier New', Symbol: 'Symbol', ZapfDingbats: 'Wingdings' };
function fontInfo(font) {
  const raw = String(font?.name || font?.fallbackName || 'Calibri').replace(/^[A-Z]{6}\+/, '');
  const [base, style = ''] = raw.split(/[,-]/);
  let family = base.replace(/(PS)?MT$|PS$/, '');
  family = FAMILY[family] || family.replace(/([a-z])([A-Z])/g, '$1 $2');
  const bold = !!font?.bold || !!font?.black || /bold|black|heavy|semibold|demi/i.test(style + raw);
  const italic = !!font?.italic || /italic|oblique/i.test(style);
  return { family, bold, italic };
}

// Color del texto: los píxeles que cambian entre la página completa y el fondo
function textColor(full, bg, W, H, x0, y0, x1, y1) {
  x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(W, Math.ceil(x1)); y1 = Math.min(H, Math.ceil(y1));
  let max = 0;
  const px = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * W + x) * 4;
    const d = Math.abs(full[i] - bg[i]) + Math.abs(full[i + 1] - bg[i + 1]) + Math.abs(full[i + 2] - bg[i + 2]);
    if (d > 30) { px.push([d, i]); if (d > max) max = d; }
  }
  if (!px.length) return null;                              // texto invisible (p. ej. capa OCR)
  let r = 0, g = 0, b = 0, n = 0;
  for (const [d, i] of px) if (d >= max * 0.7) { r += full[i]; g += full[i + 1]; b += full[i + 2]; n++; }
  return [r, g, b].map((v) => Math.round(v / n).toString(16).padStart(2, '0')).join('').toUpperCase();
}

// Fragmentos de texto horizontales con estilo y posición (en puntos, origen arriba a la izquierda)
async function readRuns(page, vp1, full, bg, W, H) {
  const tc = await page.getTextContent();
  const runs = [];
  for (const it of tc.items) {
    if (!it.str || !it.str.trim()) continue;
    const m = pdfjs.Util.transform(vp1.transform, it.transform);
    if (Math.abs(m[1]) > 1e-3 || Math.abs(m[2]) > 1e-3) continue;   // girado: se queda en el fondo
    const size = Math.abs(m[3]);
    if (size < 1) continue;
    const w = it.width || it.str.length * size * 0.5, per = w / it.str.length, base = m[5];
    const font = page.commonObjs.has(it.fontName) ? page.commonObjs.get(it.fontName) : null, style = fontInfo(font);
    // palabra a palabra para no perder cambios de color dentro de un mismo fragmento (enlaces, resaltados)
    const re = /\S+\s*/g; let t, prev = null;
    while ((t = re.exec(it.str))) {
      const x0 = m[4] + t.index * per, x1 = x0 + t[0].trimEnd().length * per;
      const pad = (x1 - x0) * 0.1;
      const color = textColor(full, bg, W, H, (x0 + pad) * SCALE, (base - size * 0.85) * SCALE, (x1 - pad) * SCALE, (base + size * 0.25) * SCALE);
      if (!color) { prev = null; continue; }
      if (prev && near(prev.color, color)) { prev.str += t[0]; prev.x1 = x1; continue; }
      prev = { str: t[0], x0, x1, base, size, color, ...style };
      runs.push(prev);
    }
  }
  return runs;
}

const near = (a, b) => [0, 2, 4].every((i) => Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)) < 40);

// Fragmentos → líneas, en el orden en que el PDF dibuja el texto: así cada cuadro de texto
// se lee seguido y no se mezcla con la columna de al lado aunque estén muy juntas
function toLines(runs) {
  const lines = [];
  let cur = null;
  for (const r of runs) {
    const last = cur?.runs.at(-1), gap = last ? r.x0 - last.x1 : 0;
    const same = last && Math.abs(r.base - last.base) < Math.min(r.size, last.size) * 0.35 && gap > -r.size * 0.5 && gap < Math.max(r.size, last.size) * 3;
    if (!same) { cur = { base: r.base, size: r.size, x0: r.x0, x1: r.x1, runs: [r] }; lines.push(cur); continue; }
    if ((r.word || gap > r.size * 0.15) && !/\s$/.test(last.str) && !/^\s/.test(r.str)) cur.runs.push({ ...r, str: ' ' });
    cur.runs.push(r); cur.x1 = Math.max(cur.x1, r.x1); cur.size = Math.max(cur.size, r.size);
  }
  return lines;
}

// Líneas → bloques (párrafos con el mismo interlineado y la misma columna)
function toBlocks(lines) {
  const blocks = [];
  for (const l of lines) {
    const b = blocks.find((k) => {
      const last = k.lines.at(-1), pitch = l.base - last.base;
      if (Math.abs(l.size - last.size) > last.size * 0.12 || pitch <= last.size * 0.5) return false;
      if (pitch > (k.pitch ? k.pitch * 1.25 : last.size * 1.7)) return false;
      if (k.pitch && pitch < k.pitch * 0.8) return false;
      // misma columna y alineada con el bloque (por la izquierda, la derecha o el centro)
      const tol = Math.max(3, l.size * 0.6), aligned = Math.abs(l.x0 - k.x0) < tol || Math.abs(l.x1 - k.x1) < tol || Math.abs(l.x0 + l.x1 - k.x0 - k.x1) < tol * 2;
      return aligned && Math.min(k.x1, l.x1) - Math.max(k.x0, l.x0) > Math.min(k.x1 - k.x0, l.x1 - l.x0) * 0.5;
    });
    if (b) { b.pitch ||= l.base - b.lines.at(-1).base; b.lines.push(l); b.x0 = Math.min(b.x0, l.x0); b.x1 = Math.max(b.x1, l.x1); }
    else blocks.push({ lines: [l], x0: l.x0, x1: l.x1, pitch: 0 });
  }
  return blocks;
}

function alignment(D, b) {
  const L = b.lines, tol = Math.max(2, L[0].size * 0.5);
  if (L.length < 2) return D.AlignmentType.LEFT;
  const left = L.every((l) => Math.abs(l.x0 - b.x0) < tol), body = L.slice(0, -1);
  // justificado: casi todas las líneas llegan al margen derecho (las cortas son finales de párrafo)
  if (left && body.filter((l) => Math.abs(l.x1 - b.x1) < tol).length >= body.length * 0.6) return D.AlignmentType.JUSTIFIED;
  if (left) return D.AlignmentType.LEFT;
  if (L.every((l) => Math.abs(l.x1 - b.x1) < tol)) return D.AlignmentType.RIGHT;
  const mid = (b.x0 + b.x1) / 2;
  if (L.every((l) => Math.abs((l.x0 + l.x1) / 2 - mid) < tol)) return D.AlignmentType.CENTER;
  return D.AlignmentType.LEFT;
}

// Un bloque = un marco en su posición. Se conservan los saltos de línea del PDF para que el texto
// quede igual (Word estira las líneas justificadas que acaban en salto de línea, como el PDF).
// En los justificados, cada línea corta cierra un párrafo.
function blockParagraphs(D, b, pageW) {
  let align = alignment(D, b);
  // texto del OCR: cada línea ya mide lo mismo que en la imagen (espaciado ajustado), no hace falta justificar
  if (align === D.AlignmentType.JUSTIFIED && b.lines[0].runs[0]?.spacing != null) align = D.AlignmentType.LEFT;
  const J = align === D.AlignmentType.JUSTIFIED;
  const first = b.lines[0], size = first.size;
  const lineH = b.pitch || size * 1.2;
  // margen extra por si la fuente de Word mide algo más (en justificados estiraría las líneas)
  const slack = J ? 1 : b.lines.length === 1 ? size + (b.x1 - b.x0) * 0.2 : Math.max(size, (b.x1 - b.x0) * 0.08);
  let x = b.x0, w = b.x1 - b.x0 + slack;
  if (align === D.AlignmentType.CENTER) x -= slack / 2;
  else if (align === D.AlignmentType.RIGHT) x -= slack;
  x = Math.max(0, x); w = Math.min(w, pageW - x);
  const frame = {
    type: 'absolute',
    position: { x: Math.round(x * TW), y: Math.round((first.base - lineH * 0.8) * TW) },
    width: Math.round(w * TW),
    height: Math.round(lineH * b.lines.length * TW),
    rule: 'atLeast',
    anchor: { horizontal: D.FrameAnchorType.PAGE, vertical: D.FrameAnchorType.PAGE },
    wrap: D.FrameWrap.NONE,
  };
  const paras = [[]];
  b.lines.forEach((l, i) => {
    const kids = paras.at(-1);
    if (kids.length) kids.push(new D.TextRun({ break: 1 }));
    l.runs.forEach((r, k) => {
      const text = k === l.runs.length - 1 ? r.str.trimEnd() : r.str;
      if (text) kids.push(new D.TextRun({ text, font: r.family, size: Math.max(2, Math.round(r.size * 2)), bold: r.bold, italics: r.italic, color: r.color, characterSpacing: r.spacing }));
    });
    if (J && i < b.lines.length - 1 && l.x1 < b.x1 - size * 2) paras.push([]);
  });
  // párrafos seguidos con el mismo marco: Word los muestra en un único marco
  return paras.map((children) => new D.Paragraph({ children, alignment: align, frame, spacing: { before: 0, after: 0, line: Math.round(lineH * TW), lineRule: D.LineRuleType.EXACT } }));
}

// Devuelve la sección de Word de una página, o null si no tiene texto (PDF escaneado)
export async function layoutSection(D, page) {
  const vp1 = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: SCALE });
  const fullC = await draw(page, vp, false);
  const bgC = await draw(page, vp, true);
  const W = fullC.width, H = fullC.height;
  const full = fullC.getContext('2d').getImageData(0, 0, W, H).data;
  const bg = bgC.getContext('2d').getImageData(0, 0, W, H).data;
  const runs = await readRuns(page, vp1, full, bg, W, H);
  if (runs.length < 3) return null;
  return pageSection(D, vp1.width, vp1.height, bgC, toLines(runs));
}

// Sección de Word del tamaño de la página: el fondo detrás y el texto en marcos encima
async function pageSection(D, pw, ph, bgCanvas, lines) {
  const blob = bgCanvas.convertToBlob ? await bgCanvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 }) : await new Promise((r) => bgCanvas.toBlob(r, 'image/jpeg', 0.9));
  const data = new Uint8Array(await blob.arrayBuffer());
  const background = new D.Paragraph({
    spacing: { before: 0, after: 0, line: 20, lineRule: D.LineRuleType.EXACT },
    children: [new D.ImageRun({
      type: 'jpg', data, transformation: { width: Math.round(pw * 96 / 72), height: Math.round(ph * 96 / 72) },
      floating: {
        horizontalPosition: { relative: D.HorizontalPositionRelativeFrom.PAGE, offset: 0 },
        verticalPosition: { relative: D.VerticalPositionRelativeFrom.PAGE, offset: 0 },
        behindDocument: true, allowOverlap: true, lockAnchor: true,
        wrap: { type: D.TextWrappingType.NONE },
      },
    })],
  });
  return {
    properties: { page: { size: { width: Math.round(pw * TW), height: Math.round(ph * TW) }, margin: { top: 0, bottom: 0, left: 0, right: 0, header: 0, footer: 0 } } },
    // el salto de sección va en el último párrafo: debe ser uno normal, no un marco
    children: [...toBlocks(lines).flatMap((b) => blockParagraphs(D, b, pw)), background],
  };
}

// =====================================================================
// Páginas escaneadas o imágenes: OCR + texto borrado del fondo
// =====================================================================
const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
const hex = (c) => c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();

// Media de color de una columna (o fila) corta de píxeles
function avgAt(px, W, H, xs, y) {
  let r = 0, g = 0, b = 0, n = 0;
  for (const x of xs) { if (x < 0 || x >= W || y < 0 || y >= H) continue; const i = (y * W + x) * 4; r += px[i]; g += px[i + 1]; b += px[i + 2]; n++; }
  return n ? [r / n, g / n, b / n] : null;
}
const spread = (cols) => { const L = cols.filter(Boolean).map((c) => lum(...c)); if (L.length < 2) return 999; const m = L.reduce((a, b) => a + b, 0) / L.length; return Math.sqrt(L.reduce((a, b) => a + (b - m) ** 2, 0) / L.length); };

// Estudia una palabra en la imagen: color de fondo a su alrededor, color y grosor del trazo
function study(px, W, H, x0, y0, x1, y1) {
  const p = Math.max(2, Math.round((y1 - y0) * 0.15));
  const X0 = Math.max(0, x0 - p), X1 = Math.min(W - 1, x1 + p), Y0 = Math.max(0, y0 - p), Y1 = Math.min(H - 1, y1 + p);
  const L = [], R = [];
  for (let y = Y0; y <= Y1; y++) { L.push(avgAt(px, W, H, [X0 - 1, X0 - 2, X0 - 3], y)); R.push(avgAt(px, W, H, [X1 + 1, X1 + 2, X1 + 3], y)); }
  const sl = spread(L), sr = spread(R), ok = 22;
  // fondo liso a ambos lados: se interpola de izquierda a derecha; si solo uno es liso, se usa ese
  let bgAt;
  if (sl < ok && sr < ok && L[0] && R[0]) bgAt = (x, yi) => { const t = (x - X0) / Math.max(1, X1 - X0); return [0, 1, 2].map((c) => L[yi][c] + (R[yi][c] - L[yi][c]) * t); };
  else if (sl < ok && L[0]) bgAt = (x, yi) => L[yi];
  else if (sr < ok && R[0]) bgAt = (x, yi) => R[yi];
  else return null;                                             // fondo con imagen: se deja como está
  let max = 0; const d = new Float32Array((X1 - X0 + 1) * (Y1 - Y0 + 1));
  for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
    const i = (y * W + x) * 4, b = bgAt(x, y - Y0), k = (y - Y0) * (X1 - X0 + 1) + (x - X0);
    d[k] = Math.abs(px[i] - b[0]) + Math.abs(px[i + 1] - b[1]) + Math.abs(px[i + 2] - b[2]);
    if (d[k] > max) max = d[k];
  }
  if (max < 80) return null;                                    // poco contraste: no es texto
  let ink = 0, r = 0, g = 0, b = 0, n = 0; const runs = [];
  for (let y = y0; y <= y1; y++) {
    let run = 0;
    for (let x = x0; x <= x1 + 1; x++) {
      const k = (y - Y0) * (X1 - X0 + 1) + (x - X0), on = x <= x1 && d[k] > max * 0.45;
      if (on) { ink++; run++; } else if (run) { runs.push(run); run = 0; }
      if (x <= x1 && d[k] > max * 0.7) { const i = (y * W + x) * 4; r += px[i]; g += px[i + 1]; b += px[i + 2]; n++; }
    }
  }
  runs.sort((a, c) => a - c);
  let inkTop = y1, inkBottom = y0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (d[(y - Y0) * (X1 - X0 + 1) + (x - X0)] > max * 0.45) { if (y < inkTop) inkTop = y; if (y > inkBottom) inkBottom = y; break; }
  return {
    inkTop, inkBottom: inkBottom + 1,
    color: hex([r / n, g / n, b / n]), density: ink / ((x1 - x0 + 1) * (y1 - y0 + 1)), stroke: runs[Math.floor(runs.length / 2)] || 0,
    erase(out) { for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) { const i = (y * W + x) * 4, c = bgAt(x, y - Y0); out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2]; } },
  };
}

// Ajusta la fuente de Word al ancho real del texto: Arial (o Arial Narrow si es condensado) + espaciado
const measureCtx = document.createElement('canvas').getContext('2d');
const width = (t, fam, bold) => { measureCtx.font = `${bold ? 700 : 400} 100px "${fam}"`; return measureCtx.measureText(t).width / 100; };
// Fuente estrecha para textos condensados: Arial Narrow (viene con Office), solo si está instalada.
// Se comprueba contra una fuente inexistente porque el navegador sustituye en silencio las que faltan.
const hasNarrow = () => {
  const t = 'Narrow test ABC', none = width(t, 'pdfg-no-existe', false), arial = width(t, 'Arial', false), w = width(t, 'Arial Narrow', false);
  return Math.abs(w - none) > 0.01 && w / arial > 0.74 && w / arial < 0.9;
};
// Ajusta cada línea al ancho que tiene en la imagen sin montar letras:
// una sola fuente por línea, espaciado moderado y, si aun así no cabe, la letra un poco más pequeña
function fitLine(line, narrow) {
  const out = [];
  for (const r of line.runs) {
    const last = out.at(-1);
    if (last && last.bold === r.bold && near(last.color, r.color) && Math.abs(last.size - r.size) < 0.5) { last.str += r.str; last.x1 = Math.max(last.x1, r.x1); }
    else out.push({ ...r });
  }
  const sum = (f) => out.reduce((a, r) => a + width(r.str.trimEnd(), f, r.bold) * r.size, 0);
  const target = out.reduce((a, r) => a + r.x1 - r.x0, 0);
  const family = narrow && target < sum('Arial') * 0.9 ? 'Arial Narrow' : 'Arial';
  for (const r of out) {
    r.family = family;
    const t = r.str.trimEnd(), w = r.x1 - r.x0;
    if (t.length < 2 || w <= 0) continue;
    let natural = width(t, family, r.bold) * r.size;
    const minSp = -r.size * 0.04;
    if (t.length >= 6 && natural + minSp * t.length > w) {      // no cabe: letra más pequeña (hasta un 15 %)
      const k = Math.max(0.85, (w - minSp * t.length) / natural);
      r.size = Math.round(r.size * k * 2) / 2; natural = width(t, family, r.bold) * r.size;
    }
    r.spacing = Math.round(Math.max(-r.size * 0.04, Math.min(r.size * 0.3, (w - natural) / t.length)) * TW);
  }
  line.runs = out;
  return line;
}

// Sección de Word de una página reconocida con OCR (resultado de ocrPage)
export async function ocrLayoutSection(D, page, ocr) {
  const vp1 = page.getViewport({ scale: 1 }), k = ocr.scale;
  const W = ocr.canvas.width, H = ocr.canvas.height;
  const ctx = ocr.canvas.getContext('2d');
  const img = ctx.getImageData(0, 0, W, H), px = img.data, out = new Uint8ClampedArray(px);
  const words = [];
  for (const w of ocr.items) {
    const letters = (w.str.match(/[\p{L}\p{N}]/gu) || []).length;
    // descarta lo que el OCR confunde con letras: iconos, adornos, letra manuscrita poco legible
    if (!letters) continue;
    // confianza baja: se decide más abajo, según lo bien que se haya leído el resto de su línea
    const doubtful = (w.conf < 50 && !(letters >= 4 && /^[\p{L}¿?¡!.,:;()-]+$/u.test(w.str))) || (w.conf < 70 && letters < 6);
    const box = [w.x0, w.top, w.x1, w.bottom].map((v) => Math.round(v * k));
    const s = study(px, W, H, ...box);
    // icono (mancha casi maciza), letra manuscrita o trazo demasiado fino para su tamaño: se queda en la imagen
    // palabras de las pasadas reducidas (medidas menos fiables): solo valen si el tamaño que dan sus letras
    // coincide con el de la tinta en la imagen completa; si no, se quedan en la imagen
    if (s && w.extra) {
      const desc = /[gjpqyQ,;ç]/.test(w.str), tall = /[A-Z0-9bdfhklÁÉÍÓÚÑ¿¡]/.test(w.str), accent = /[ÁÉÍÓÚÑ]/.test(w.str);
      const em = (s.inkBottom - s.inkTop) / k / ((tall ? (accent ? 0.9 : 0.72) : 0.53) + (desc ? 0.21 : 0));
      if (Math.abs(em - w.em) > Math.max(em, w.em) * 0.25) continue;
    }
    // icono: mancha casi maciza, o letra rodeada de signos como "(A)"
    if (s && (s.density > 0.68 || (s.density > 0.6 && letters <= 2 && /[^\p{L}\p{N}]/u.test(w.str)))) continue;
    if (!s || w.irregular || (letters >= 4 && s.stroke / k < w.em * 0.05)) continue;
    words.push({ ...w, s, size: w.em, doubtful });
  }
  // palabra corta mucho más grande que sus vecinas de al lado: medida errónea, se queda en la imagen
  for (const w of words) {
    if (w.str.length > 3 || w.str.length < 2 || w.guess) continue;
    const nb = words.filter((o) => o !== w && o.str.length >= 4 && Math.abs(o.base - w.base) < o.em * 0.6 && Math.min(Math.abs(o.x0 - w.x1), Math.abs(w.x0 - o.x1)) < o.em * 2);
    if (nb.length && nb.every((o) => w.em > o.em * 1.35)) w.drop = true;
  }
  words.splice(0, words.length, ...words.filter((w) => !w.drop));
  // palabras sin letras de apoyo ("y", "que"): la línea base de las demás palabras de su línea
  for (const w of words) if (w.guess) {
    const ref = words.filter((o) => o.line === w.line && !o.guess && Math.abs(o.base - w.base) < o.em * 0.5).map((o) => o.base).sort((a, b) => a - b);
    if (ref.length) w.base = ref[Math.floor(ref.length / 2)];
  }
  // mismo tamaño para las palabras de una línea que miden casi lo mismo
  const byLine = new Map();
  for (const w of words) { const key = `${w.line}:${Math.round(w.base / 4)}`; (byLine.get(key) || byLine.set(key, []).get(key)).push(w); }
  for (const ws of byLine.values()) {
    const m = ws.map((w) => w.size).sort((a, b) => a - b)[Math.floor(ws.length / 2)];
    for (const w of ws) if (Math.abs(w.size - m) < m * 0.22) w.size = m;
    // una letra suelta que no encaja con su línea suele ser un icono (reloj = "O", lupa = "Q")
    // (una letra dentro de una línea de texto, como "a" o "y", toma el tamaño de la línea)
    for (const w of ws) if (w.str.length === 1) {
      const iconLike = /[OoQ0@©®eC]/.test(w.str) && (Math.abs(w.size - m) > m * 0.3 || w.s.density > 0.5);
      const real = ws.filter((o) => o.str.length >= 2).length;     // la línea tiene al menos dos palabras de verdad
      if (real < 2 || !/[\p{L}\p{N}]/u.test(w.str) || iconLike) w.drop = true; else w.size = m;
    }
    const mc = ws.map((w) => w.conf).sort((a, b) => a - b)[Math.floor(ws.length / 2)];
    for (const w of ws) if (w.doubtful && (ws.length < 3 || mc < 80)) w.drop = true;
    // negrita según el grosor del trazo (en líneas de varias palabras manda la mayoría)
    const sw = (w) => w.s.stroke / k / w.em, ms = ws.map(sw).sort((a, b) => a - b)[Math.floor(ws.length / 2)];
    for (const w of ws) w.bold = ws.length >= 3 ? ms > 0.12 : sw(w) > 0.115;
  }
  words.splice(0, words.length, ...words.filter((w) => !w.drop));
  const runs = [];
  for (const w of words) {
    w.s.erase(out);
    runs.push({ str: w.str, x0: w.x0, x1: w.x1, base: w.base, size: Math.round(w.size * 2) / 2, color: w.s.color, family: 'Arial', bold: w.bold, italic: false, word: true });
  }
  if (runs.length < 3) return null;
  ctx.putImageData(new ImageData(out, W, H), 0, 0);
  const narrow = hasNarrow();
  return pageSection(D, vp1.width, vp1.height, ocr.canvas, toLines(runs).map((l) => fitLine(l, narrow)));
}
