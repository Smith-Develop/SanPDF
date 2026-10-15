// Pruebas de extremo a extremo de PDF G: carga la extensión real en Chromium y usa cada herramienta
// como lo haría una persona (subir archivos, pulsar, escribir, arrastrar, firmar). Uso:
//   python3 tests/fixtures.py          # crea los documentos de prueba
//   node tests/run.mjs [herramienta,…] # resultados en tests/out; luego: python3 tests/check.py
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadPlaywright } from './playwright.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FX = path.join(HERE, 'fixtures') + path.sep, OUT = path.join(HERE, 'out');
const ONLY = process.argv[2] ? process.argv[2].split(',') : null;
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });

// Copia de la extensión con los permisos opcionales ya concedidos (en modo automático no se puede pulsar "Permitir")
const EXT = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfg-'));
fs.cpSync(path.join(HERE, '..', 'pdf-g'), EXT, { recursive: true });
const mf = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
mf.permissions.push(...(mf.optional_permissions || [])); mf.host_permissions = mf.optional_host_permissions || [];
delete mf.optional_permissions; delete mf.optional_host_permissions;
fs.writeFileSync(path.join(EXT, 'manifest.json'), JSON.stringify(mf));

// Servidor local para "Página web a PDF"
const server = http.createServer((req, res) => { const f = path.join(FX, 'web', 'index.html'); res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(f)); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const WEB = `http://127.0.0.1:${server.address().port}/`;

const { chromium } = await loadPlaywright();
const ctx = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true, viewport: { width: 1360, height: 900 }, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] });
let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
const ID = sw.url().split('/')[2];
await ctx.addInitScript(() => {
  const o = window.open.bind(window); window.__blobs = [];
  window.open = (u, ...a) => { if (String(u).startsWith('blob:')) { window.__blobs.push(u); return null; } return o(u, ...a); };
});
const report = [];

async function open(id) {
  const p = await ctx.newPage(); p.errors = [];
  p.on('pageerror', (e) => p.errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') p.errors.push(m.text()); });
  await p.goto(`chrome-extension://${ID}/app.html#${id}`);
  await p.waitForSelector('#tool:not([hidden])');
  return p;
}
const files = (p, list, sel = '#work input[type=file]') => p.setInputFiles(sel, list.map((f) => FX + f));
async function run(p, timeout = 240000) {
  await p.waitForFunction(() => !document.getElementById('run').disabled, null, { timeout: 60000 });
  await p.evaluate(() => { document.getElementById('toast').textContent = ''; });
  await p.click('#run');
  await p.waitForFunction(() => /¡Listo!|Error/.test(document.getElementById('toast').textContent) || (document.getElementById('busy').hidden && !document.getElementById('run').disabled && document.getElementById('toast').textContent), null, { timeout });
  const t = await p.textContent('#toast');
  if (/Error/.test(t)) throw new Error(`toast: ${t}`);
  return saveResults(p);
}
async function saveResults(p) {
  const n = await p.locator('#results .res').count(), out = [];
  for (let i = 0; i < n; i++) {
    const name = await p.locator('#results .res b').nth(i).textContent();
    await p.evaluate(() => { window.__blobs = []; });
    await p.locator('#results .res').nth(i).locator('button', { hasText: 'Ver' }).click();
    const b64 = await p.evaluate(async () => { const r = await fetch(window.__blobs.at(-1)); const a = new Uint8Array(await r.arrayBuffer()); let s = ''; for (let i = 0; i < a.length; i += 32768) s += String.fromCharCode(...a.subarray(i, i + 32768)); return btoa(s); });
    const f = path.join(OUT, name); fs.writeFileSync(f, Buffer.from(b64, 'base64')); out.push(f);
  }
  return out;
}
async function printed(p, name) {   // herramientas que abren la vista de impresión
  const [pop] = await Promise.all([ctx.waitForEvent('page', { timeout: 120000 }), (async () => { await p.waitForFunction(() => !document.getElementById('run').disabled); await p.click('#run'); })()]);
  await pop.waitForFunction(() => document.getElementById('doc')?.innerHTML.length > 0, null, { timeout: 120000 });
  await pop.waitForTimeout(800);
  const f = path.join(OUT, name); await pop.pdf({ path: f, preferCSSPageSize: true, printBackground: true });
  await pop.close(); return [f];
}

const T = {
  async pdf2excel() { const p = await open('pdf2excel'); await files(p, ['tabla.pdf']); return [p, await run(p)]; },
  async pdf2word() { const p = await open('pdf2word'); await files(p, ['multi.pdf']); return [p, await run(p)]; },
  async pdf2img() { const p = await open('pdf2img'); await files(p, ['multi.pdf']); return [p, await run(p)]; },
  async pdf2txt() { const p = await open('pdf2txt'); await files(p, ['scanned.pdf']); return [p, await run(p)]; },
  async img2pdf() { const p = await open('img2pdf'); await files(p, ['photo-2.jpg', 'scan-1.png']); return [p, await run(p)]; },
  async word2pdf() { const p = await open('word2pdf'); await files(p, ['informe.docx']); return [p, await printed(p, 'informe_word2pdf.pdf')]; },
  async excel2pdf() { const p = await open('excel2pdf'); await files(p, ['solicitudes.xls']); return [p, await printed(p, 'solicitudes_excel2pdf.pdf')]; },
  async excel2pdf_csv() { const p = await open('excel2pdf'); await files(p, ['datos.csv']); return [p, await printed(p, 'datos_excel2pdf.pdf')]; },
  async web2pdf() {
    const w = await ctx.newPage(); await w.goto(WEB);
    const p = await open('web2pdf'); await p.click('text=Ver mis pestañas abiertas');
    await p.waitForSelector('#work input[type=radio]', { timeout: 15000 }); await p.locator('#work input[type=radio]').first().check();
    const r = await run(p); await w.close(); return [p, r];
  },
  async merge() { const p = await open('merge'); await files(p, ['multi.pdf', 'tabla.pdf', 'photo-2.jpg']); return [p, await run(p)]; },
  async split() { const p = await open('split'); await files(p, ['multi.pdf']); return [p, await run(p)]; },
  async organize() {
    const p = await open('organize'); await files(p, ['multi.pdf']); await p.waitForSelector('.pg .acts', { state: 'attached' });
    await p.locator('.pg').nth(0).hover(); await p.locator('.pg').nth(0).locator('button[title="Girar a la derecha"]').click({ force: true });
    await p.locator('.pg').nth(1).hover(); await p.locator('.pg').nth(1).locator('button[title="Borrar"]').click({ force: true });
    await p.locator('.pg').nth(2).hover(); await p.locator('.pg').nth(2).locator('button[title="Duplicar"]').click({ force: true });
    return [p, await run(p)];
  },
  async extract() { const p = await open('extract'); await files(p, ['multi.pdf']); await p.waitForSelector('.pg'); await p.fill('#opts input[type=text]', '2-3'); return [p, await run(p)]; },
  async rotate() { const p = await open('rotate'); await files(p, ['multi.pdf']); await p.waitForSelector('.pg'); await p.click('#opts button:has-text("↻ Girar")'); return [p, await run(p)]; },
  async delete() { const p = await open('delete'); await files(p, ['multi.pdf']); await p.waitForSelector('.pg'); await p.locator('.pg').nth(0).click(); await p.click('#opts button:has-text("Borrar selección")'); return [p, await run(p)]; },
  async edit() {
    const p = await open('edit'); await files(p, ['multi.pdf']); await p.waitForSelector('.ed-page');
    await p.click('.ed-bar button:has-text("Texto")');
    const L = p.locator('.ed-layer').first(); const bb = await L.boundingBox();
    await p.mouse.click(bb.x + 100, bb.y + 60); await p.keyboard.type('HOLA PRUEBA EDITOR');
    await p.click('.ed-bar button:has-text("Resaltar")');
    await p.mouse.move(bb.x + 80, bb.y + 200); await p.mouse.down(); await p.mouse.move(bb.x + 300, bb.y + 230, { steps: 5 }); await p.mouse.up();
    await p.click('.ed-bar button:has-text("Dibujar")');
    await p.mouse.move(bb.x + 100, bb.y + 400); await p.mouse.down(); await p.mouse.move(bb.x + 200, bb.y + 450, { steps: 8 }); await p.mouse.up();
    return [p, await run(p)];
  },
  async sign() {
    const p = await open('sign'); await files(p, ['multi.pdf']); await p.waitForSelector('dialog .sig-pad');
    await p.fill('dialog input[type=text]', 'Juan Pérez'); await p.click('dialog >> text=Usar esta firma');
    const bb = await p.locator('.ed-layer').first().boundingBox(); await p.mouse.click(bb.x + 300, bb.y + 500);
    return [p, await run(p)];
  },
  async forms() {
    const p = await open('forms'); await files(p, ['form.pdf']); await p.waitForSelector('#work .field input');
    await p.locator('#work .field input').first().fill('María López'); await p.locator('#work .field input[type=checkbox]').check();
    return [p, await run(p)];
  },
  async watermark() { const p = await open('watermark'); await files(p, ['multi.pdf']); return [p, await run(p)]; },
  async pagenum() { const p = await open('pagenum'); await files(p, ['multi.pdf']); return [p, await run(p)]; },
  async metadata() { const p = await open('metadata'); await files(p, ['multi.pdf']); await p.waitForFunction(() => !document.getElementById('run').disabled); await p.locator('#opts input').first().fill('Título de prueba'); return [p, await run(p)]; },
  async compress() { const p = await open('compress'); await files(p, ['boletin_escaneado.pdf']); return [p, await run(p)]; },
  async compress_max() { const p = await open('compress'); await files(p, ['multi.pdf']); await p.click('#opts button:has-text("Máxima")'); return [p, await run(p)]; },
  async ocr() { const p = await open('ocr'); await files(p, ['scanned.pdf']); await p.click('#opts button:has-text("PDF buscable")'); return [p, await run(p)]; },
  async ocr_demo() { const p = await open('ocr'); await files(p, ['boletin_escaneado.pdf']); return [p, await run(p)]; },
  async pdf2word_scan() { const p = await open('pdf2word'); await files(p, ['scanned.pdf']); return [p, await run(p)]; },
  async protect() { const p = await open('protect'); await files(p, ['multi.pdf']); await p.fill('#opts input[type=password] >> nth=0', 'clave123'); await p.fill('#opts input[type=password] >> nth=1', 'clave123'); return [p, await run(p)]; },
  async unlock() {
    const enc = fs.readdirSync(OUT).find((f) => /protegido/.test(f)); if (!enc) throw new Error('falta el PDF protegido');
    fs.copyFileSync(path.join(OUT, enc), FX + 'protegido.pdf');
    const p = await open('unlock'); await files(p, ['protegido.pdf']); await p.fill('#opts input[type=password]', 'clave123'); return [p, await run(p)];
  },
  async flatten() { const p = await open('flatten'); await files(p, ['form.pdf']); return [p, await run(p)]; },
  async repair() { const p = await open('repair'); await files(p, ['tabla.pdf']); return [p, await run(p)]; },
  async create() {
    const p = await open('create'); await p.click('text=Empezar'); await p.waitForSelector('.ed-layer');
    const bb = await p.locator('.ed-layer').first().boundingBox(); await p.mouse.click(bb.x + 80, bb.y + 80); await p.keyboard.type('Documento nuevo');
    return [p, await run(p)];
  },
  async text2pdf() { const p = await open('text2pdf'); await p.fill('#work textarea', 'Hola mundo con acentos: áéíóú ñ €\n\nSegundo párrafo. '.repeat(40)); return [p, await run(p)]; },
};
for (const [k, fn] of Object.entries(T)) {
  if (ONLY && !ONLY.includes(k)) continue;
  const t0 = Date.now(); let p;
  try { const [pg, out] = await fn(); p = pg; report.push({ tool: k, ok: true, out: out.map((f) => path.basename(f)), errors: p.errors, ms: Date.now() - t0 }); }
  catch (e) { report.push({ tool: k, ok: false, error: e.message.split('\n')[0], ms: Date.now() - t0 }); }
  console.log(JSON.stringify(report.at(-1)));
  for (const pg of ctx.pages()) if (pg.url().includes('app.html')) await pg.close().catch(() => {});
}
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
await ctx.close();
server.close();
fs.rmSync(EXT, { recursive: true, force: true });
const bad = report.filter((r) => !r.ok || r.errors?.length);
console.log(bad.length ? `${bad.length} con fallos` : `${report.length} herramientas OK`);
process.exit(bad.length ? 1 : 0);
