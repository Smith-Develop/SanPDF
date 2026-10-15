// PDF G · OCR con Tesseract (todo en el navegador, español e inglés incluidos)
let workerP = null, workerLang = '';
export async function ocrWorker(lang = 'spa+eng', onProgress) {
  if (workerP && workerLang === lang) return workerP;
  if (workerP) (await workerP).terminate();
  workerLang = lang;
  workerP = Tesseract.createWorker(lang, 1, {
    workerPath: chrome.runtime.getURL('lib/tesseract/worker.min.js'),
    corePath: chrome.runtime.getURL('lib/tesseract/core/'),
    langPath: chrome.runtime.getURL('lib/tesseract/lang/'),
    workerBlobURL: false, gzip: true,
    logger: (m) => { if (m.status === 'recognizing text') onProgress?.(m.progress); },
  });
  return workerP;
}
// Línea base y tamaño de letra de una palabra a partir de sus letras:
// la base es el pie de las letras sin rabo; las mayúsculas y letras altas miden ~0,72 em y las bajas ~0,53 em
const median = (a) => { const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
function metrics(wd, bottom) {
  const sy = (wd.symbols || []).filter((c) => c.bbox && c.text);
  const flat = sy.filter((c) => !/[gjpqyQ,;()[\]{}|\/_ç]/.test(c.text));
  // palabra solo con letras con rabo ("y", "q"): la base queda a ~0,28 de su altura desde abajo
  const base = flat.length ? median(flat.map((c) => c.bbox.y1)) : bottom - (bottom - wd.bbox.y0) * 0.28;
  const tall = sy.filter((c) => /[A-Z0-9bdfhkl]/.test(c.text)), low = sy.filter((c) => /[acemnorsuvwxz]/.test(c.text));
  const emT = tall.length ? (base - median(tall.map((c) => c.bbox.y0))) / 0.72 : 0, emL = low.length ? (base - median(low.map((c) => c.bbox.y0))) / 0.53 : 0;
  const em = emT || emL || (bottom - wd.bbox.y0) / (flat.length ? 0.9 : 0.74);
  // letra manuscrita o muy decorada: las proporciones no cuadran con una letra de imprenta
  const irregular = sy.length >= 4 && !!(emT && emL && Math.abs(emT - emL) > Math.max(emT, emL) * 0.3);
  return { base, em: Math.max(4, em), irregular, guess: !flat.length };
}
// Palabras de un resultado de Tesseract, en coordenadas de la página (puntos)
function wordsOf(data, scale, lineBase) {
  const items = [];
  let li = lineBase;
  for (const b of data.blocks || []) for (const p of b.paragraphs) for (const l of p.lines) {
    li++;
    for (const wd of l.words) {
      if (!wd.text.trim() || wd.confidence < 20) continue;
      const { x0, y0, x1, y1 } = wd.bbox;
      const lh = (l.bbox.y1 - l.bbox.y0) / scale;
      const m = metrics(wd, y1);
      items.push({ str: wd.text, x0: x0 / scale, x1: x1 / scale, y: ((y0 + y1) / 2) / scale, h: lh, top: y0 / scale, bottom: y1 / scale, conf: wd.confidence, base: m.base / scale, em: m.em / scale, irregular: m.irregular, guess: m.guess, line: li });
    }
  }
  return items;
}
const overlap = (a, b) => {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? (w * h) / Math.min((a.x1 - a.x0) * (a.bottom - a.top), (b.x1 - b.x0) * (b.bottom - b.top)) : 0;
};

// Añade una palabra de otra pasada: si cae en la línea de una palabra ya leída, se coloca tras ella
// y toma su tamaño y su línea base (a menor escala esas medidas son menos precisas)
function place(items, it) {
  let best = null;
  for (const o of items) if (Math.abs(o.base - it.base) < o.em * 0.35 && o.x1 <= it.x0 + 2 && (!best || o.x1 > best.x1)) best = o;
  if (best && !best.extra && it.x0 - best.x1 < best.em * 3) { Object.assign(it, { line: best.line, em: best.em, base: best.base, near: true }); items.splice(items.indexOf(best) + 1, 0, it); }
  else items.push(it);
}
// Pinta la página y devuelve las palabras reconocidas en coordenadas de la página.
// Tres pasadas: con la imagen grande se lee bien la letra pequeña y con la imagen reducida, los títulos
// grandes (y el texto claro sobre fondo oscuro); si dos palabras coinciden, gana la de más confianza.
export async function ocrPage(page, { scale = 2.5, lang = 'spa+eng', onProgress } = {}) {
  const vp = page.getViewport({ scale });
  const c = new OffscreenCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  const w = await ocrWorker(lang, onProgress);
  const { data } = await w.recognize(await c.convertToBlob(), {}, { blocks: true, text: true });
  const items = wordsOf(data, scale, 0);
    for (const [k, lineBase] of [[0.4, 100000], [0.25, 200000]]) {
    const c2 = new OffscreenCanvas(Math.ceil(c.width * k), Math.ceil(c.height * k));
    const x2 = c2.getContext('2d'); x2.imageSmoothingQuality = 'high'; x2.drawImage(c, 0, 0, c2.width, c2.height);
    const { data: d2 } = await w.recognize(await c2.convertToBlob(), {}, { blocks: true });
    for (const it of wordsOf(d2, scale * k, lineBase)) {
      if (it.conf < 85) continue;
      // solo rellena huecos: donde la pasada principal no leyó nada
      if (it.str.length >= 2 && !items.some((o) => !o.extra && overlap(o, it) > 0.15)) place(items, Object.assign(it, { extra: true }));
    }
  }
  const base = page.getViewport({ scale: 1 });
  return { width: base.width, height: base.height, items, lines: { H: [], V: [] }, ocr: true, text: data.text, canvas: c, scale };
}
