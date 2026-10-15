// PDF G · componentes de interfaz reutilizables
import { $, el, fmtSize, openPdf, readBytes, renderPage, download, openBlob, baseName } from './core.js';

const ICON_UP = '<svg viewBox="0 0 24 24"><path d="M12 16V4m0 0-4 4m4-4 4 4M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2"/></svg>';
export const isPdf = (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
export const isImage = (f) => f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(f.name);

// Archivos de entrada (uno o varios, ordenables)
export function fileDrop({ accept = '.pdf,application/pdf', multiple = false, label = 'Suelta aquí tus PDF', hint = 'o haz clic para elegirlos', onChange, thumbs = true } = {}) {
  const root = el('div');
  const input = el('input', { type: 'file', accept, multiple, hidden: true });
  const state = { files: [], root };
  const drop = el('div', { className: 'drop', innerHTML: `${ICON_UP}<b>${label}</b><small>${hint}</small>` });
  const list = el('div', { className: 'flist' });
  const more = el('button', { className: 'btn addmore', textContent: '+ Añadir más archivos', type: 'button' });
  const add = (files) => {
    const ok = [...files].filter((f) => accept.split(',').some((a) => (a.startsWith('.') ? f.name.toLowerCase().endsWith(a) : a.endsWith('/*') ? f.type.startsWith(a.slice(0, -1)) : f.type === a)));
    if (!ok.length) return;
    state.files = multiple ? [...state.files, ...ok] : [ok[0]];
    draw(); onChange?.(state.files);
  };
  input.onchange = () => { add(input.files); input.value = ''; };
  drop.onclick = () => input.click(); more.onclick = () => input.click();
  for (const t of [drop, root]) {
    t.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); drop.classList.add('over'); } });
    t.addEventListener('dragleave', () => drop.classList.remove('over'));
    t.addEventListener('drop', (e) => { if (!e.dataTransfer.files.length) return; e.preventDefault(); drop.classList.remove('over'); add(e.dataTransfer.files); });
  }
  let dragIdx = null;
  function draw() {
    drop.hidden = state.files.length > 0;
    more.hidden = !state.files.length || !multiple;
    list.replaceChildren(...state.files.map((f, i) => {
      const th = el('canvas', { width: 54, height: 54 });
      if (thumbs) thumbOf(f).then((c) => { if (c) { th.width = c.width; th.height = c.height; th.getContext('2d').drawImage(c, 0, 0); } });
      const x = el('button', { className: 'x', textContent: '✕', title: 'Quitar', type: 'button' });
      x.onclick = () => { state.files.splice(i, 1); draw(); onChange?.(state.files); };
      const row = el('div', { className: 'fitem', draggable: multiple }, el('span', { className: 'grip', textContent: multiple ? '⋮⋮' : '' }), th, el('div', {}, el('b', { textContent: f.name }), el('small', { textContent: fmtSize(f.size) })), x);
      row.ondragstart = () => { dragIdx = i; row.classList.add('drag'); };
      row.ondragend = () => row.classList.remove('drag');
      row.ondragover = (e) => { if (dragIdx != null) e.preventDefault(); };
      row.ondrop = (e) => { if (dragIdx == null) return; e.preventDefault(); e.stopPropagation(); const [m] = state.files.splice(dragIdx, 1); state.files.splice(i, 0, m); dragIdx = null; draw(); onChange?.(state.files); };
      return row;
    }));
  }
  root.append(drop, list, more, input);
  draw();
  return state;
}
const thumbCache = new WeakMap();
async function thumbOf(f) {
  if (thumbCache.has(f)) return thumbCache.get(f);
  const p = (async () => {
    try {
      if (isImage(f)) { const b = await createImageBitmap(f); const c = el('canvas', { width: 108, height: Math.round(108 * b.height / b.width) }); c.getContext('2d').drawImage(b, 0, 0, c.width, c.height); return c; }
      if (isPdf(f)) { const doc = await openPdf(await readBytes(f)); return renderPage(await doc.getPage(1), { width: 108 }); }
    } catch { return null; }
    return null;
  })();
  thumbCache.set(f, p);
  return p;
}

// Cuadrícula de páginas: seleccionar, girar, borrar, reordenar
export async function pageGrid(container, doc, { selectable = true, editable = false, onChange } = {}) {
  const st = { order: [...Array(doc.numPages).keys()].map((i) => ({ src: i, rot: 0, del: false, sel: false, blank: false })), doc };
  const grid = el('div', { className: 'pages' });
  container.append(grid);
  const canvases = new Map();
  const thumb = async (src) => {
    if (!canvases.has(src)) canvases.set(src, renderPage(await doc.getPage(src + 1), { width: 150 }));
    return canvases.get(src);
  };
  let dragIdx = null;
  async function draw() {
    grid.replaceChildren(...st.order.map((p, i) => {
      const im = el('div', { className: 'im' });
      const card = el('div', { className: `pg${p.sel ? ' sel' : ''}${p.del ? ' del' : ''}`, draggable: editable });
      if (p.blank) { const c = el('canvas', { width: 105, height: 148 }); c.style.background = '#fff'; im.append(c); }
      else thumb(p.src).then((c) => { const cc = el('canvas', { width: c.width, height: c.height }); cc.getContext('2d').drawImage(c, 0, 0); cc.style.transform = `rotate(${p.rot}deg)`; im.replaceChildren(cc); });
      card.append(im, el('span', { className: 'n', textContent: `${i + 1}${p.blank ? ' · en blanco' : ''}` }));
      if (p.sel) card.append(el('span', { className: 'badge', textContent: '✓' }));
      if (editable) {
        const b = (t, title, fn) => { const x = el('button', { textContent: t, title, type: 'button' }); x.onclick = (e) => { e.stopPropagation(); fn(); draw(); onChange?.(st); }; return x; };
        card.append(el('div', { className: 'acts' },
          b('↺', 'Girar a la izquierda', () => { p.rot = (p.rot + 270) % 360; }), b('↻', 'Girar a la derecha', () => { p.rot = (p.rot + 90) % 360; }),
          b('⧉', 'Duplicar', () => { st.order.splice(i + 1, 0, { ...p, sel: false }); }), b(p.del ? '↩' : '🗑', p.del ? 'Recuperar' : 'Borrar', () => { p.del = !p.del; })));
        card.ondragstart = () => { dragIdx = i; card.classList.add('drag'); };
        card.ondragend = () => card.classList.remove('drag');
        card.ondragover = (e) => { if (dragIdx != null) { e.preventDefault(); card.classList.add('over'); } };
        card.ondragleave = () => card.classList.remove('over');
        card.ondrop = (e) => { e.preventDefault(); if (dragIdx == null) return; const [m] = st.order.splice(dragIdx, 1); st.order.splice(i, 0, m); dragIdx = null; draw(); onChange?.(st); };
      }
      if (selectable) card.onclick = (e) => {
        if (e.shiftKey && st.last != null) { const [a, b2] = [Math.min(st.last, i), Math.max(st.last, i)]; for (let k = a; k <= b2; k++) st.order[k].sel = true; }
        else p.sel = !p.sel;
        st.last = i; draw(); onChange?.(st);
      };
      return card;
    }));
  }
  st.draw = draw;
  st.selected = () => st.order.map((p, i) => (p.sel ? i : -1)).filter((i) => i >= 0);
  await draw();
  return st;
}

// Resultados con descarga
export function showResults(items, { onUse } = {}) {
  const box = $('results');
  box.replaceChildren();
  if (!items.length) return;
  for (const it of items) {
    const dl = el('button', { className: 'btn sm primary', textContent: 'Descargar', type: 'button' }); dl.onclick = () => download(it.blob, it.name);
    const view = el('button', { className: 'btn sm', textContent: 'Ver', type: 'button' }); view.onclick = () => openBlob(it.blob);
    box.append(el('div', { className: 'res' }, el('div', {}, el('b', { textContent: it.name }), el('small', { textContent: `${fmtSize(it.blob.size)}${it.note ? ` · ${it.note}` : ''}` })), view, dl));
  }
  if (items.length > 1) {
    const all = el('button', { className: 'btn res-all', textContent: `Descargar los ${items.length} archivos`, type: 'button' });
    all.onclick = async () => { for (const it of items) { await download(it.blob, it.name); await new Promise((r) => setTimeout(r, 250)); } };
    box.append(all);
  }
  if (onUse && items.length === 1 && /\.pdf$/i.test(items[0].name)) {
    const use = el('button', { className: 'btn res-all', textContent: 'Seguir trabajando con este PDF…', type: 'button' });
    use.onclick = () => onUse(new File([items[0].blob], items[0].name, { type: 'application/pdf' }));
    box.append(use);
  }
}
export const outName = (file, suffix, ext = 'pdf') => `${baseName(file?.name || 'documento')}${suffix ? `_${suffix}` : ''}.${ext}`;
