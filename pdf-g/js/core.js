// PDF G · núcleo: librerías, PDF, descargas e interfaz
import * as pdfjs from '../lib/pdfjs/pdf.min.mjs';
pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdfjs/pdf.worker.min.mjs');
export { pdfjs };

export const $ = (id) => document.getElementById(id);
export const el = (tag, props = {}, ...kids) => {
  const e = Object.assign(document.createElement(tag), props);
  for (const k of kids) if (k != null && k !== false) e.append(k);
  return e;
};
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const fmtSize = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
export const baseName = (n) => String(n || 'documento').replace(/\.[^.]+$/, '');
export const safe = (s) => String(s).replace(/[\\/:*?"<>|]+/g, '_').slice(0, 100);

// Librerías clásicas que se cargan solo cuando hacen falta
const loaded = new Map();
export function loadScript(path) {
  if (!loaded.has(path)) loaded.set(path, new Promise((res, rej) => { const s = document.createElement('script'); s.src = chrome.runtime.getURL(path); s.onload = res; s.onerror = () => rej(new Error(`No se pudo cargar ${path}`)); document.head.append(s); }));
  return loaded.get(path);
}
export const libs = {
  pdflib: async () => { await loadScript('lib/pdf-lib.min.js'); return window.PDFLib; },
  excel: async () => { await loadScript('lib/exceljs.min.js'); return window.ExcelJS; },
  docx: async () => { await loadScript('lib/docx.iife.js'); return window.docx; },
  mammoth: async () => { await loadScript('lib/mammoth.browser.min.js'); return window.mammoth; },
  tesseract: async () => { await loadScript('lib/tesseract/tesseract.min.js'); return window.Tesseract; },
  async qpdf() {
    await loadScript('lib/qpdf/qpdf.js');
    return window.Module({ locateFile: (p) => chrome.runtime.getURL(`lib/qpdf/${p}`), print: () => {}, printErr: () => {} });
  },
};
// Ejecuta qpdf sobre un PDF y devuelve el resultado
export async function qpdf(bytes, args) {
  const q = await libs.qpdf();
  q.FS.writeFile('/in.pdf', bytes);
  const errs = [];
  q.printErr = (m) => errs.push(m);
  let rc = 0;
  try { rc = q.callMain(['/in.pdf', ...args, '/out.pdf']); } catch (e) { rc = e?.status ?? 2; }
  let out = null;
  try { out = q.FS.readFile('/out.pdf'); } catch {}
  if (!out || (rc !== 0 && rc !== 3)) throw new Error(errs.join(' ') || 'qpdf no pudo procesar el archivo');
  return out;
}

// ---------- PDF ----------
export const readBytes = async (file) => new Uint8Array(await file.arrayBuffer());
export async function openPdf(bytes, password) {
  const task = pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, password, cMapUrl: chrome.runtime.getURL('lib/pdfjs/cmaps/'), cMapPacked: true, standardFontDataUrl: chrome.runtime.getURL('lib/pdfjs/standard_fonts/') });
  return task.promise;
}
export async function renderPage(page, { scale = 1, width, rotate = 0, bg = '#fff' } = {}) {
  const base = page.getViewport({ scale: 1, rotation: (page.rotate + rotate) % 360 });
  const s = width ? width / base.width : scale;
  const vp = page.getViewport({ scale: s, rotation: (page.rotate + rotate) % 360 });
  const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
  const ctx = c.getContext('2d'); ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  return c;
}
// Rangos tipo "1-3, 5, 8-10" (1-based) -> índices 0-based
export function parseRanges(str, total) {
  const out = [];
  for (const part of String(str || '').split(/[,;]/).map((s) => s.trim()).filter(Boolean)) {
    const m = part.match(/^(\d+)?\s*-\s*(\d+)?$/);
    if (m) { const a = Math.max(1, +(m[1] || 1)), b = Math.min(total, +(m[2] || total)); for (let i = a; i <= b; i++) out.push(i - 1); }
    else if (/^\d+$/.test(part)) { const n = +part; if (n >= 1 && n <= total) out.push(n - 1); }
  }
  return out;
}

// ---------- descargas ----------
export async function download(blob, name) {
  const url = URL.createObjectURL(blob);
  try { await chrome.downloads.download({ url, filename: `PDF G/${safe(name)}`, conflictAction: 'uniquify' }); }
  catch { const a = el('a', { href: url, download: name }); a.click(); }
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}
export const openBlob = (blob) => window.open(URL.createObjectURL(blob), '_blank');

// ---------- interfaz ----------
let toastTm;
export function toast(msg, ms = 3000) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTm); toastTm = setTimeout(() => { t.hidden = true; }, ms);
}
export function progress(text, value) {
  const box = $('busy');
  if (text == null) { box.hidden = true; return; }
  box.hidden = false;
  $('busyText').textContent = text;
  $('busyBar').style.width = value == null ? '100%' : `${Math.round(value * 100)}%`;
  $('busyBar').classList.toggle('indet', value == null);
}
export function field(label, input, hint) { return el(input.classList?.contains('seg') ? 'div' : 'label', { className: 'field' }, el('span', { textContent: label }), input, hint ? el('small', { textContent: hint }) : null); }
export function select(options, value) { return el('select', {}, ...options.map(([v, t]) => el('option', { value: v, textContent: t, selected: String(v) === String(value) }))); }
// Selector de opciones. Los botones no se recrean al pulsarlos y el clic no se reenvía a la etiqueta
// que lo contiene (si no, el navegador activaría siempre la primera opción).
export function seg(options, value, onChange) {
  const box = el('div', { className: 'seg', role: 'radiogroup' });
  const buttons = options.map(([val, txt]) => {
    const b = el('button', { type: 'button', textContent: txt });
    b.setAttribute('role', 'radio');
    b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); set(val); onChange?.(val); };
    return b;
  });
  const set = (v) => { box.value = v; buttons.forEach((b, i) => { const on = options[i][0] === v; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); }); };
  box.append(...buttons); set(value);
  return box;
}
export function toggle(label, checked) { const i = el('input', { type: 'checkbox', checked }); const l = el('label', { className: 'check' }, i, ` ${label}`); l.input = i; return l; }
