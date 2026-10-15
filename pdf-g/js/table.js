// PDF G · extracción de tablas (PDF → Excel)
// Cada página se convierte en bloques ordenados: tablas (filas × columnas) y texto suelto.

// ---------- 1. Lectura de la página con pdf.js ----------
export async function readPage(page, OPS) {
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent({ disableNormalization: false });
  const items = [];
  for (const it of tc.items) {
    if (!it.str || !it.str.trim()) continue;
    const [, b, c, d, e, f] = it.transform;
    if (Math.abs(b) > 0.01 || Math.abs(c) > 0.01) continue;          // texto girado: se ignora
    const h = Math.hypot(c, d) || it.height || 10;
    const [x, y] = vp.convertToViewportPoint(e, f);
    const w = it.width || it.str.length * h * 0.5;
    // un mismo fragmento puede contener varias columnas separadas por muchos espacios
    for (const p of splitBySpaces(it.str, x, w)) items.push({ str: p.str, x0: p.x0, x1: p.x1, y: y - h * 0.32, h, top: y - h * 0.8, bottom: y + h * 0.2 });
  }
  const lines = OPS ? await readRulings(page, vp, OPS) : { H: [], V: [] };
  return { width: vp.width, height: vp.height, items, lines };
}
function splitBySpaces(str, x, w) {
  if (!/\S\s{2,}\S/.test(str)) return [{ str: str.trim(), x0: x + leading(str) * (w / str.length), x1: x + w }];
  const out = [], per = w / str.length;
  const re = /\S+(?: \S+)*/g; let m;
  while ((m = re.exec(str))) out.push({ str: m[0], x0: x + m.index * per, x1: x + (m.index + m[0].length) * per });
  return out;
}
const leading = (s) => s.length - s.trimStart().length;

// Líneas y rectángulos dibujados (bordes de tablas)
async function readRulings(page, vp, OPS) {
  const ol = await page.getOperatorList();
  const segs = [];
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];
  const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  const pt = (x, y) => { const X = ctm[0] * x + ctm[2] * y + ctm[4], Y = ctm[1] * x + ctm[3] * y + ctm[5]; return vp.convertToViewportPoint(X, Y); };
  let pending = [];
  for (let i = 0; i < ol.fnArray.length; i++) {
    const fn = ol.fnArray[i], args = ol.argsArray[i];
    if (fn === OPS.save) stack.push(ctm.slice());
    else if (fn === OPS.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
    else if (fn === OPS.transform) ctm = mul(ctm, args);
    else if (fn === OPS.constructPath) {
      const [ops, coords] = args; let k = 0, cur = null, start = null;
      for (const op of ops) {
        if (op === OPS.rectangle) {
          const [x, y, w, h] = coords.slice(k, k + 4); k += 4;
          const p1 = pt(x, y), p2 = pt(x + w, y + h);
          pending.push({ rect: [Math.min(p1[0], p2[0]), Math.min(p1[1], p2[1]), Math.max(p1[0], p2[0]), Math.max(p1[1], p2[1])] });
        } else if (op === OPS.moveTo) { cur = pt(coords[k], coords[k + 1]); start = cur; k += 2; }
        else if (op === OPS.lineTo) { const p = pt(coords[k], coords[k + 1]); k += 2; if (cur) pending.push({ seg: [cur[0], cur[1], p[0], p[1]] }); cur = p; }
        else if (op === OPS.curveTo) k += 6; else if (op === OPS.curveTo2 || op === OPS.curveTo3) k += 4;
        else if (op === OPS.closePath && cur && start) { pending.push({ seg: [cur[0], cur[1], start[0], start[1]] }); cur = start; }
      }
    } else if (fn === OPS.stroke || fn === OPS.closeStroke || fn === OPS.fill || fn === OPS.eoFill || fn === OPS.fillStroke || fn === OPS.eoFillStroke || fn === OPS.closeFillStroke || fn === OPS.closeEOFillStroke) {
      for (const p of pending) {
        if (p.seg) segs.push(p.seg);
        else {
          const [x0, y0, x1, y1] = p.rect, w = x1 - x0, h = y1 - y0;
          if (h < 2.5 && w > 4) segs.push([x0, (y0 + y1) / 2, x1, (y0 + y1) / 2]);
          else if (w < 2.5 && h > 4) segs.push([(x0 + x1) / 2, y0, (x0 + x1) / 2, y1]);
          else if (w > 4 && h > 4 && w < vp.width * 0.98) segs.push([x0, y0, x1, y0], [x0, y1, x1, y1], [x0, y0, x0, y1], [x1, y0, x1, y1]);
        }
      }
      pending = [];
    } else if (fn === OPS.endPath) pending = [];
  }
  const H = [], V = [];
  for (const [x0, y0, x1, y1] of segs) {
    if (Math.abs(y0 - y1) < 1.5 && Math.abs(x1 - x0) > 6) H.push({ y: (y0 + y1) / 2, x0: Math.min(x0, x1), x1: Math.max(x0, x1) });
    else if (Math.abs(x0 - x1) < 1.5 && Math.abs(y1 - y0) > 6) V.push({ x: (x0 + x1) / 2, y0: Math.min(y0, y1), y1: Math.max(y0, y1) });
  }
  return { H, V };
}

// ---------- 2. Utilidades ----------
const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
function cluster(values, tol) {
  const s = [...values].sort((a, b) => a - b), out = [];
  for (const v of s) { const last = out[out.length - 1]; if (last && v - last.max <= tol) { last.max = v; last.sum += v; last.n++; } else out.push({ min: v, max: v, sum: v, n: 1 }); }
  return out.map((c) => c.sum / c.n);
}
// Agrupa fragmentos en líneas (misma altura) y une los que forman una frase
function toLines(items) {
  const hMed = median(items.map((i) => i.h)) || 10;
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x0 - b.x0);
  const lines = [];
  for (const it of sorted) {
    const l = lines.find((L) => Math.abs(L.y - it.y) < Math.min(it.h, L.h) * 0.45);
    if (l) { l.items.push(it); l.y = (l.y * (l.items.length - 1) + it.y) / l.items.length; }
    else lines.push({ y: it.y, h: it.h, items: [it] });
  }
  for (const l of lines) {
    l.items.sort((a, b) => a.x0 - b.x0);
    const chunks = [];
    for (const it of l.items) {
      const prev = chunks[chunks.length - 1];
      const gap = prev ? it.x0 - prev.x1 : Infinity;
      if (prev && gap < Math.max(1.2, it.h * 0.42)) { prev.str += (gap > it.h * 0.12 ? ' ' : '') + it.str; prev.x1 = Math.max(prev.x1, it.x1); }
      else chunks.push({ ...it });
    }
    l.chunks = chunks;
    l.top = Math.min(...l.items.map((i) => i.top)); l.bottom = Math.max(...l.items.map((i) => i.bottom));
  }
  lines.sort((a, b) => a.y - b.y);
  return { lines, hMed };
}
const asText = (l) => ({ type: 'text', text: l.chunks.map((c) => c.str).join('    '), y: l.top, bottom: l.bottom, h: l.h, x: l.chunks[0].x0, cells: l.chunks.map((c) => c.str) });

// ---------- 3. Tablas con bordes (cuadrícula de líneas) ----------
function gridTables(page) {
  const { H, V } = page.lines;
  if (!H.length || V.length < 2) return [];
  const all = [...H.map((h) => ({ k: 'h', ...h, bx: [h.x0, h.y - 2, h.x1, h.y + 2] })), ...V.map((v) => ({ k: 'v', ...v, bx: [v.x - 2, v.y0, v.x + 2, v.y1] }))];
  const parent = all.map((_, i) => i), find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const touch = (a, b) => a.bx[0] <= b.bx[2] + 3 && b.bx[0] <= a.bx[2] + 3 && a.bx[1] <= b.bx[3] + 3 && b.bx[1] <= a.bx[3] + 3;
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) if (touch(all[i], all[j])) parent[find(i)] = find(j);
  const groups = new Map();
  all.forEach((s, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(s); });
  const tables = [];
  for (const g of groups.values()) {
    const hs = g.filter((s) => s.k === 'h'), vs = g.filter((s) => s.k === 'v');
    if (hs.length < 2 || vs.length < 2) continue;
    const xs = cluster(vs.map((v) => v.x), 3), ys = cluster(hs.map((h) => h.y), 3);
    if (xs.length < 2 || ys.length < 2) continue;
    const bbox = [xs[0], ys[0], xs[xs.length - 1], ys[ys.length - 1]];
    if (bbox[2] - bbox[0] < 30 || bbox[3] - bbox[1] < 12) continue;
    tables.push({ xs, ys, bbox });
  }
  return tables;
}
function fillGrid(t, items) {
  const { xs, ys } = t;
  const rows = ys.slice(1).map(() => xs.slice(1).map(() => []));
  const used = new Set();
  for (const it of items) {
    const cx = (it.x0 + it.x1) / 2, cy = it.y;
    if (cx < xs[0] - 1 || cx > xs[xs.length - 1] + 1 || cy < ys[0] - 1 || cy > ys[ys.length - 1] + 1) continue;
    const c = xs.findIndex((x, i) => i < xs.length - 1 && cx >= x - 1 && cx <= xs[i + 1] + 1);
    const r = ys.findIndex((y, i) => i < ys.length - 1 && cy >= y - 1 && cy <= ys[i + 1] + 1);
    if (c < 0 || r < 0) continue;
    rows[r][c].push(it); used.add(it);
  }
  const out = rows.map((row) => row.map((cell) => {
    if (!cell.length) return '';
    const { lines } = toLines(cell);
    return lines.map((l) => l.chunks.map((ch) => ch.str).join(' ')).join(' ').trim();
  })).filter((row) => row.some((v) => v !== ''));
  const keep = out[0] ? out[0].map((_, c) => out.some((r) => r[c] !== '')) : [];
  return { rows: out.map((r) => r.filter((_, c) => keep[c])), used };
}

// ---------- 4. Tablas sin bordes (columnas por huecos) ----------
function streamBlocks(lines, hMed, opts) {
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    // una tabla empieza con al menos 2 líneas seguidas de varias columnas
    if (lines[i].chunks.length >= 2) {
      const region = [lines[i]]; let j = i + 1, misses = 0;
      while (j < lines.length) {
        const L = lines[j], prev = region[region.length - 1];
        const gap = L.top - prev.bottom;
        if (gap > hMed * 2.6) break;
        if (L.chunks.length >= 2) { region.push(L); misses = 0; }
        else if (misses < 1 && gap < hMed * 1.2) { region.push(L); misses++; }
        else break;
        j++;
      }
      while (region.length && region[region.length - 1].chunks.length < 2) { region.pop(); j--; }
      if (region.filter((l) => l.chunks.length >= 2).length >= 2) {
        const t = buildStream(region, hMed, opts);
        for (const l of t.pre) blocks.push(asText(l));
        if (t.rows.length >= 2) blocks.push({ type: 'table', rows: t.rows, bbox: t.bbox, y: t.bbox[1] });
        for (const l of t.post) blocks.push(asText(l));
        i = j; continue;
      }
    }
    blocks.push(asText(lines[i]));
    i++;
  }
  return blocks;
}
// Columnas por cobertura: cuántas filas tienen texto en cada posición horizontal.
// Un hueco vacío en casi todas las filas separa columnas aunque algún título lo atraviese.
function computeSpans(lines) {
  const multi = lines.filter((l) => l.chunks.length >= 2);
  const minX = Math.floor(Math.min(...multi.flatMap((l) => l.chunks.map((c) => c.x0)))), maxX = Math.ceil(Math.max(...multi.flatMap((l) => l.chunks.map((c) => c.x1))));
  const cover = new Uint16Array(maxX - minX + 2);
  for (const l of multi) {
    const row = new Uint8Array(cover.length);
    for (const c of l.chunks) for (let x = Math.floor(c.x0) - minX; x <= Math.ceil(c.x1) - minX; x++) row[x] = 1;
    for (let x = 0; x < cover.length; x++) cover[x] += row[x];
  }
  const thr = multi.length >= 8 ? Math.floor(multi.length * 0.08) : 0;
  const spans = [];
  let s0 = -1;
  for (let x = 0; x <= cover.length; x++) {
    const on = x < cover.length && cover[x] > thr;
    if (on && s0 < 0) s0 = x;
    if (!on && s0 >= 0) { spans.push([s0 + minX, x - 1 + minX]); s0 = -1; }
  }
  // huecos muy estrechos (menos de medio carácter) no separan columnas
  const hMed = median(multi.map((l) => l.h)) || 8;
  const out = [];
  for (const sp of spans) { const last = out[out.length - 1]; if (last && sp[0] - last[1] < hMed * 0.45) last[1] = sp[1]; else out.push([...sp]); }
  return out.length ? out : [[minX, maxX]];
}
// ¿La línea atraviesa varias columnas (título, texto corrido)?
const spansCrossed = (line, spans) => line.chunks.some((c) => spans.filter(([a, b]) => Math.min(b, c.x1) - Math.max(a, c.x0) > 2).length >= 2);
function buildStream(region, hMed, opts) {
  let spans = computeSpans(region);
  // separar líneas del principio o del final que no encajan en las columnas
  const pre = [], post = [];
  while (region.length > 2 && (region[0].chunks.length < 2 || spansCrossed(region[0], spans))) pre.push(region.shift());
  while (region.length > 2 && (region[region.length - 1].chunks.length < 2 || spansCrossed(region[region.length - 1], spans))) post.unshift(region.pop());
  if (pre.length || post.length) spans = computeSpans(region);
  const col = (c) => {
    let best = 0, bo = -Infinity;
    spans.forEach(([a, b], k) => { const o = Math.min(b, c.x1) - Math.max(a, c.x0); const score = o > 0 ? o : -Math.min(Math.abs(c.x0 - a), Math.abs(c.x1 - b)); if (score > bo) { bo = score; best = k; } });
    return best;
  };
  let rows = region.map((l) => {
    const r = spans.map(() => '');
    for (const c of l.chunks) { const k = col(c); r[k] = r[k] ? `${r[k]} ${c.str}` : c.str; }
    return { cells: r, top: l.top, bottom: l.bottom };
  });
  // unir líneas partidas: fila sin primera columna, solo con texto, pegada a la anterior
  if (opts.mergeWrapped !== false && rows.length > 2) {
    const numericCol = spans.map((_, k) => rows.filter((r) => r.cells[k] && parseValue(r.cells[k], opts.locale).num).length > rows.length * 0.4);
    const merged = [];
    for (const r of rows) {
      const prev = merged[merged.length - 1];
      const filled = r.cells.map((v, k) => (v ? k : -1)).filter((k) => k >= 0);
      const onlyText = filled.length > 0 && filled.every((k) => !numericCol[k] && !parseValue(r.cells[k], opts.locale).num);
      if (prev && !r.cells[0] && prev.cells[0] && onlyText && r.top - prev.bottom < hMed * 0.9) {
        for (const k of filled) prev.cells[k] = prev.cells[k] ? `${prev.cells[k]} ${r.cells[k]}` : r.cells[k];
        prev.bottom = r.bottom;
      } else merged.push({ ...r, cells: [...r.cells] });
    }
    rows = merged;
  }
  return { rows: rows.map((r) => r.cells), bbox: [spans[0][0], region[0].top, spans[spans.length - 1][1], region[region.length - 1].bottom], pre, post };
}

// ---------- 5. Página completa ----------
export function analyzePage(page, opts = {}) {
  const grids = opts.mode === 'stream' ? [] : gridTables(page);
  const used = new Set();
  const blocks = [];
  for (const g of grids) {
    const { rows, used: u } = fillGrid(g, page.items);
    if (rows.length && rows[0].length > 1) { u.forEach((x) => used.add(x)); blocks.push({ type: 'table', rows, bbox: g.bbox, y: g.bbox[1], ruled: true }); }
  }
  const rest = page.items.filter((i) => !used.has(i));
  if (rest.length) {
    const { lines, hMed } = toLines(rest);
    blocks.push(...(opts.mode === 'lattice' ? lines.map(asText) : streamBlocks(lines, hMed, opts)));
  }
  blocks.sort((a, b) => a.y - b.y);
  for (const b of blocks) if (b.type === 'table') b.header = detectHeader(b.rows, opts.locale);
  return blocks;
}
function detectHeader(rows, locale) {
  if (rows.length < 2) return -1;
  const isText = (r) => r.filter((v) => v).every((v) => !parseValue(v, locale).num);
  return isText(rows[0]) && rows.slice(1, 4).some((r) => !isText(r)) ? 0 : -1;
}

// ---------- 6. Valores: números, moneda, porcentajes y fechas ----------
export function detectLocale(texts) {
  let es = 0, en = 0;
  for (const t of texts) {
    if (/\d{1,3}(\.\d{3})+,\d{1,3}\b|\b\d+,\d{2}\b/.test(t)) es++;
    if (/\d{1,3}(,\d{3})+\.\d{1,3}\b|\b\d+\.\d{2}\b/.test(t)) en++;
  }
  return en > es ? 'en' : 'es';
}
const CUR = /[€$£¥]|EUR|USD|GBP/gi;
export function parseValue(raw, locale = 'es') {
  const s0 = String(raw ?? '').trim();
  if (!s0) return { v: null };
  let m = s0.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    let [, d, mo, y] = m.map(Number); if (y < 100) y += 2000;
    if (locale === 'en' && d <= 12 && mo > 12) [d, mo] = [mo, d];
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return { v: new Date(Date.UTC(y, mo - 1, d)), date: true, num: false };
  }
  m = s0.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return { v: new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])), date: true };
  let s = s0, neg = false, pct = false, cur = null;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  const cm = s.match(CUR); if (cm) { cur = cm[0]; s = s.replace(CUR, ''); }
  s = s.replace(/\s/g, '');
  if (s.endsWith('%')) { pct = true; s = s.slice(0, -1); }
  if (s.endsWith('-')) { neg = !neg; s = s.slice(0, -1); }
  if (s.startsWith('+')) s = s.slice(1);
  if (s.startsWith('-')) { neg = !neg; s = s.slice(1); }
  if (!/^\d[\d.,]*$/.test(s)) return { v: s0 };
  if (/^0\d+$/.test(s) || s.replace(/[.,]/g, '').length > 15) return { v: s0 };   // códigos con ceros delante o muy largos
  let n;
  if (locale === 'es') {
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) || /^\d+(,\d+)?$/.test(s)) n = Number(s.replace(/\./g, '').replace(',', '.'));
    else if (/^\d+\.\d+$/.test(s)) n = Number(s);
  } else {
    if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s) || /^\d+(\.\d+)?$/.test(s)) n = Number(s.replace(/,/g, ''));
    else if (/^\d+,\d+$/.test(s)) n = Number(s.replace(',', '.'));
  }
  if (n == null || Number.isNaN(n)) return { v: s0 };
  if (neg) n = -n;
  if (pct) return { v: n / 100, num: true, pct: true };
  const dec = (s.split(locale === 'es' ? ',' : '.')[1] || '').length;
  return { v: n, num: true, cur, dec };
}
