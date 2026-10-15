// PDF G · editar, firmar, formularios, marca de agua, numerar, metadatos y crear
import { el, libs, openPdf, readBytes, renderPage, parseRanges, progress, toast, field, select, seg, toggle } from './core.js';
import { fileDrop, outName } from './ui.js';
import { PAGE_SIZES } from './tools-convert.js';

const ACCEPT_PDF = '.pdf,application/pdf';
const hexRgb = async (hex) => { const { rgb } = await libs.pdflib(); const n = parseInt(hex.slice(1), 16); return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };
const FONTS = { Helvetica: 'Helvetica, Arial, sans-serif', 'Times-Roman': '"Times New Roman", Times, serif', Courier: '"Courier New", Courier, monospace' };
const stdFont = (S, f, bold) => ({ Helvetica: bold ? S.HelveticaBold : S.Helvetica, 'Times-Roman': bold ? S.TimesRomanBold : S.TimesRoman, Courier: bold ? S.CourierBold : S.Courier }[f]);
const dataUrlBytes = (u) => Uint8Array.from(atob(u.split(',')[1]), (c) => c.charCodeAt(0));

// =====================================================================
// Editor visual (editar, firmar, crear)
// =====================================================================
export function editor(ui, mode = 'edit') {
  const st = { file: null, doc: null, pages: [], tool: mode === 'sign' ? 'sign' : 'select', sel: null, scale: 1.3, color: '#111111', size: 14, font: 'Helvetica', bold: false };
  const bar = el('div', { className: 'ed-bar' });
  const pagesBox = el('div', { className: 'ed-pages' });
  const TOOLS = [['select', '↖ Seleccionar'], ['text', 'T Texto'], ['sign', '✍ Firma'], ['image', '🖼 Imagen'], ['draw', '✏ Dibujar'], ['highlight', '▮ Resaltar'], ['white', '▭ Tapar (blanco)'], ['black', '▬ Tachar (negro)'], ['check', '✓ Marca']];
  const drawBar = () => bar.replaceChildren(...TOOLS.map(([id, t]) => { const b = el('button', { textContent: t, className: st.tool === id ? 'on' : '', type: 'button' }); b.onclick = () => { st.tool = id; drawBar(); if (id === 'sign') openSign(); if (id === 'image') imgInput.click(); }; return b; }),
    el('span', { className: 'sep' }), (() => { const b = el('button', { textContent: '＋ Página en blanco', type: 'button' }); b.onclick = () => addBlank(); return b; })());
  const imgInput = el('input', { type: 'file', accept: 'image/*', hidden: true });
  drawBar();

  // ---------- panel lateral: estilo ----------
  const sz = el('input', { type: 'number', min: 4, max: 200, value: st.size });
  const col = el('input', { type: 'color', value: st.color });
  const fnt = select(Object.keys(FONTS).map((k) => [k, k.replace('-Roman', '')]), st.font);
  const bold = toggle('Negrita', false);
  const del = el('button', { className: 'btn sm', textContent: 'Borrar elemento seleccionado', type: 'button', style: 'width:100%' });
  ui.opts.append(el('h4', { textContent: 'Estilo' }), el('div', { className: 'row2' }, field('Tamaño', sz), field('Color', col)), field('Fuente', fnt), bold, del,
    el('p', { className: 'muted', style: 'font-size:12px;margin-top:12px', textContent: 'Haz clic en la página para colocar el elemento. Arrastra para moverlo y usa la esquina para cambiar su tamaño. Supr borra el seleccionado.' }));
  const applyStyle = () => {
    const o = st.sel; st.size = +sz.value; st.color = col.value; st.font = fnt.value; st.bold = bold.input.checked;
    if (o) { if (o.type === 'text' || o.type === 'check') Object.assign(o, { size: st.size, color: st.color, font: st.font, bold: st.bold }); if (o.type === 'draw') o.color = st.color; drawObj(o); }
  };
  for (const i of [sz, col, fnt]) i.oninput = applyStyle;
  bold.input.onchange = applyStyle;
  del.onclick = () => removeSel();
  addEventListener('keydown', (e) => { if ((e.key === 'Delete' || e.key === 'Backspace') && st.sel && !e.target.closest('input, textarea, [contenteditable="true"]')) removeSel(); });

  // ---------- páginas ----------
  async function loadDoc(file) {
    st.file = file; st.pages = []; pagesBox.replaceChildren();
    if (file) {
      progress('Cargando páginas…');
      st.doc = await openPdf(await readBytes(file));
      const avail = Math.min(900, ui.work.clientWidth - 40);
      for (let i = 1; i <= st.doc.numPages; i++) {
        const page = await st.doc.getPage(i), vp1 = page.getViewport({ scale: 1 });
        st.scale = avail / vp1.width;
        const c = await renderPage(page, { scale: st.scale * (window.devicePixelRatio || 1) });
        c.style.width = `${vp1.width * st.scale}px`; c.style.height = `${vp1.height * st.scale}px`;
        addPageEl({ w: vp1.width, h: vp1.height, canvas: c, vp: vp1, objs: [] });
      }
      progress(null);
    }
    ui.ready(st.pages.length > 0);
  }
  function addBlank(size) {
    const last = st.pages[st.pages.length - 1];
    const [w, h] = size || (last ? [last.w, last.h] : PAGE_SIZES.a4);
    if (!st.pages.length) st.scale = Math.min(900, ui.work.clientWidth - 40) / w;
    const c = el('canvas', { width: Math.round(w * st.scale), height: Math.round(h * st.scale) });
    const cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height);
    c.style.width = `${w * st.scale}px`; c.style.height = `${h * st.scale}px`;
    addPageEl({ w, h, canvas: c, vp: null, objs: [], blank: true });
    ui.ready(true);
  }
  function addPageEl(p) {
    const layer = el('div', { className: 'ed-layer' });
    const box = el('div', { className: 'ed-page' }, p.canvas, layer);
    p.el = box; p.layer = layer;
    st.pages.push(p);
    pagesBox.append(box);
    layer.addEventListener('pointerdown', (e) => {
      if (e.target !== layer) return;
      if (st.tool !== 'select') e.preventDefault();   // evita que el clic quite el foco al texto recién creado
      const r = layer.getBoundingClientRect(), x = (e.clientX - r.left) / st.scale, y = (e.clientY - r.top) / st.scale;
      selectObj(null);
      if (st.tool === 'text') add(p, { type: 'text', x, y: y - st.size * 0.6, text: 'Texto', size: st.size, color: st.color, font: st.font, bold: st.bold }, true);
      else if (st.tool === 'check') add(p, { type: 'check', x: x - st.size / 2, y: y - st.size / 2, w: st.size * 1.2, h: st.size * 1.2, color: st.color });
      else if (st.tool === 'sign' && st.sig) add(p, { type: 'image', x: x - 80, y: y - 30, w: 160, h: 160 / st.sig.ratio, src: st.sig.src });
      else if (st.tool === 'image' && st.img) { add(p, { type: 'image', x, y, w: st.img.w, h: st.img.h, src: st.img.src }); st.img = null; st.tool = 'select'; drawBar(); }
      else if (['highlight', 'white', 'black'].includes(st.tool)) dragRect(p, x, y);
      else if (st.tool === 'draw') freehand(p, x, y);
    });
  }
  function add(p, o, edit) {
    o.id = Math.random().toString(36).slice(2); p.objs.push(o); drawObj(o, p); selectObj(o);
    if (edit) { const t = o.el.querySelector('.tx'); t.focus(); document.getSelection().selectAllChildren(t); }
    return o;
  }
  const pageOf = (o) => st.pages.find((p) => p.objs.includes(o));
  function removeSel() { const o = st.sel; if (!o) return; const p = pageOf(o); p.objs = p.objs.filter((x) => x !== o); o.el.remove(); st.sel = null; }
  function selectObj(o) {
    if (st.sel?.el) st.sel.el.classList.remove('sel');
    st.sel = o;
    if (o?.el) { o.el.classList.add('sel'); if (o.size) sz.value = o.size; if (o.color) col.value = o.color; if (o.font) fnt.value = o.font; bold.input.checked = !!o.bold; }
  }
  // ---------- dibujo de cada elemento ----------
  function drawObj(o, p = pageOf(o)) {
    const k = st.scale;
    if (!o.el) {
      o.el = el('div', { className: 'ed-obj' });
      o.el.addEventListener('pointerdown', (e) => {
        if (e.target.classList.contains('tx') && document.activeElement === e.target) return;
        e.stopPropagation(); selectObj(o);
        const rz = e.target.classList.contains('rz');
        const x0 = e.clientX, y0 = e.clientY, ox = o.x, oy = o.y, ow = o.w, oh = o.h, os = o.size;
        let moved = false;
        const mv = (ev) => {
          const dx = (ev.clientX - x0) / k, dy = (ev.clientY - y0) / k;
          if (Math.abs(dx) + Math.abs(dy) > 1) moved = true;
          if (rz) {
            if (o.type === 'text') o.size = Math.max(4, os * (1 + dy / Math.max(10, os * 1.2)));
            else { o.w = Math.max(8, ow + dx); o.h = o.type === 'image' ? o.w * (oh / ow) : Math.max(8, oh + dy); }
          } else { o.x = ox + dx; o.y = oy + dy; }
          drawObj(o);
        };
        const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); if (!moved && o.type === 'text') o.el.querySelector('.tx').focus(); };
        addEventListener('pointermove', mv); addEventListener('pointerup', up);
      });
      p.layer.append(o.el);
    }
    const E = o.el;
    E.replaceChildren();
    if (o.type === 'text') {
      const t = el('div', { className: 'tx', contentEditable: 'true', spellcheck: false, textContent: o.text });
      Object.assign(t.style, { fontSize: `${o.size * k}px`, color: o.color, fontFamily: FONTS[o.font], fontWeight: o.bold ? '700' : '400' });
      t.oninput = () => { o.text = t.innerText; };
      E.append(t);
      Object.assign(E.style, { left: `${o.x * k}px`, top: `${o.y * k}px`, width: '', height: '' });
    } else {
      Object.assign(E.style, { left: `${o.x * k}px`, top: `${o.y * k}px`, width: `${o.w * k}px`, height: `${o.h * k}px` });
      if (o.type === 'image') E.append(el('img', { src: o.src, draggable: false }));
      else if (o.type === 'rect') Object.assign(E.style, { background: o.fill, opacity: o.opacity ?? 1, mixBlendMode: o.blend || 'normal' });
      else if (o.type === 'check') E.innerHTML = `<svg class="path" viewBox="0 0 10 10"><path d="M1 5.5 4 8.5 9 1.5" stroke="${o.color}" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      else if (o.type === 'draw') {
        const d = o.pts.map(([x, y], i) => `${i ? 'L' : 'M'}${(x - o.x).toFixed(1)} ${(y - o.y).toFixed(1)}`).join(' ');
        E.innerHTML = `<svg class="path" viewBox="0 0 ${o.w} ${o.h}" preserveAspectRatio="none"><path d="${d}" stroke="${o.color}" stroke-width="${o.lw}" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      }
    }
    E.append(el('span', { className: 'rz' }));
    if (st.sel === o) E.classList.add('sel');
  }
  function dragRect(p, x, y) {
    const preset = { highlight: { fill: '#ffe600', opacity: 0.4, blend: 'multiply' }, white: { fill: '#ffffff', opacity: 1 }, black: { fill: '#000000', opacity: 1 } }[st.tool];
    const o = add(p, { type: 'rect', x, y, w: 4, h: 4, ...preset });
    const r = p.layer.getBoundingClientRect();
    const mv = (ev) => { const x2 = (ev.clientX - r.left) / st.scale, y2 = (ev.clientY - r.top) / st.scale; o.x = Math.min(x, x2); o.y = Math.min(y, y2); o.w = Math.max(4, Math.abs(x2 - x)); o.h = Math.max(4, Math.abs(y2 - y)); drawObj(o); };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  }
  function freehand(p, x, y) {
    const pts = [[x, y]];
    const r = p.layer.getBoundingClientRect();
    const svg = el('div'); svg.style.cssText = 'position:absolute;inset:0;pointer-events:none';
    p.layer.append(svg);
    const lw = Math.max(1, st.size / 7);
    const paint = () => { svg.innerHTML = `<svg width="100%" height="100%"><path d="${pts.map(([a, b], i) => `${i ? 'L' : 'M'}${a * st.scale} ${b * st.scale}`).join(' ')}" stroke="${st.color}" stroke-width="${lw * st.scale}" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`; };
    const mv = (ev) => { pts.push([(ev.clientX - r.left) / st.scale, (ev.clientY - r.top) / st.scale]); paint(); };
    const up = () => {
      removeEventListener('pointermove', mv); removeEventListener('pointerup', up); svg.remove();
      if (pts.length < 2) return;
      const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
      const o = { type: 'draw', pts, color: st.color, lw, x: Math.min(...xs) - lw, y: Math.min(...ys) - lw };
      o.w = Math.max(...xs) - o.x + lw; o.h = Math.max(...ys) - o.y + lw;
      add(p, o);
    };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  }
  // ---------- imágenes y firmas ----------
  imgInput.onchange = async () => {
    const f = imgInput.files[0]; imgInput.value = ''; if (!f) return;
    const bmp = await createImageBitmap(f); const c = el('canvas', { width: bmp.width, height: bmp.height }); c.getContext('2d').drawImage(bmp, 0, 0);
    const w = Math.min(220, bmp.width * 0.75);
    st.img = { src: c.toDataURL('image/png'), w, h: (w * bmp.height) / bmp.width };
    toast('Haz clic en la página donde quieras colocar la imagen');
  };
  async function openSign() {
    const { signatures = [] } = await chrome.storage.local.get('signatures');
    const pad = el('canvas', { className: 'sig-pad', width: 600, height: 180 });
    const ctx = pad.getContext('2d'); ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0b2a8a';
    let drawing = false, any = false;
    const pos = (e) => { const r = pad.getBoundingClientRect(); return [(e.clientX - r.left) * (600 / r.width), (e.clientY - r.top) * (180 / r.height)]; };
    pad.onpointerdown = (e) => { drawing = true; any = true; ctx.beginPath(); ctx.moveTo(...pos(e)); pad.setPointerCapture(e.pointerId); };
    pad.onpointermove = (e) => { if (!drawing) return; ctx.lineTo(...pos(e)); ctx.stroke(); };
    pad.onpointerup = () => { drawing = false; };
    const typed = el('input', { type: 'text', placeholder: 'o escribe tu nombre' });
    const colorSel = seg([['#0b2a8a', 'Azul'], ['#111111', 'Negro']], '#0b2a8a', (v) => { ctx.strokeStyle = v; });
    typed.oninput = () => { ctx.clearRect(0, 0, 600, 180); any = !!typed.value; ctx.fillStyle = ctx.strokeStyle; ctx.font = 'italic 62px "Segoe Script", "Brush Script MT", "Lucida Handwriting", cursive'; ctx.textBaseline = 'middle'; ctx.fillText(typed.value, 20, 95); };
    const trim = () => {
      const d = ctx.getImageData(0, 0, 600, 180).data; let x0 = 600, y0 = 180, x1 = 0, y1 = 0;
      for (let y = 0; y < 180; y++) for (let x = 0; x < 600; x++) if (d[(y * 600 + x) * 4 + 3] > 10) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      if (x1 <= x0) return null;
      const c = el('canvas', { width: x1 - x0 + 8, height: y1 - y0 + 8 }); c.getContext('2d').drawImage(pad, x0 - 4, y0 - 4, c.width, c.height, 0, 0, c.width, c.height);
      return { src: c.toDataURL('image/png'), ratio: c.width / c.height };
    };
    const dlg = el('dialog', { className: 'busy-card', style: 'width:min(640px,94vw);text-align:left;color:inherit' });
    const use = (sig) => { st.sig = sig; st.tool = 'sign'; drawBar(); dlg.close(); toast('Haz clic en la página donde quieras firmar'); };
    const ok = el('button', { className: 'btn primary', textContent: 'Usar esta firma', type: 'button' });
    ok.onclick = async () => { if (!any) return; const s = trim(); if (!s) return; await chrome.storage.local.set({ signatures: [s, ...signatures].slice(0, 6) }); use(s); };
    const clear = el('button', { className: 'btn', textContent: 'Borrar', type: 'button' }); clear.onclick = () => { ctx.clearRect(0, 0, 600, 180); typed.value = ''; any = false; };
    const cancel = el('button', { className: 'btn', textContent: 'Cancelar', type: 'button' }); cancel.onclick = () => dlg.close();
    const saved = el('div', { className: 'sigs' }, ...signatures.map((s) => { const b = el('button', { type: 'button' }, el('img', { src: s.src })); b.onclick = () => use(s); return b; }));
    dlg.append(el('h3', { textContent: 'Tu firma', style: 'margin-top:0' }), el('p', { className: 'muted', style: 'margin:0 0 8px', textContent: 'Dibújala con el ratón o el dedo, o escribe tu nombre.' }), pad, el('div', { className: 'row2', style: 'margin-top:8px' }, typed, colorSel),
      signatures.length ? el('div', {}, el('p', { className: 'muted', style: 'margin:10px 0 0', textContent: 'Firmas guardadas:' }), saved) : null,
      el('div', { style: 'display:flex;gap:8px;justify-content:flex-end;margin-top:12px' }, clear, cancel, ok));
    document.body.append(dlg); dlg.showModal(); dlg.onclose = () => dlg.remove();
  }

  // ---------- guardar ----------
  ui.run(mode === 'create' ? 'Crear PDF' : 'Guardar PDF', async () => {
    const L = await libs.pdflib();
    const pdf = st.file ? await L.PDFDocument.load(await readBytes(st.file), { ignoreEncryption: true }) : await L.PDFDocument.create();
    const fonts = {};
    const font = async (f, b) => (fonts[f + b] ||= await pdf.embedFont(stdFont(L.StandardFonts, f, b)));
    for (const [i, p] of st.pages.entries()) {
      progress(`Guardando la página ${i + 1}…`, i / st.pages.length);
      const page = p.blank ? pdf.addPage([p.w, p.h]) : pdf.getPage(i);
      const rot = page.getRotation().angle;
      const toPdf = (x, y) => (p.vp ? p.vp.convertToPdfPoint(x, y) : [x, p.h - y]);
      for (const o of p.objs) {
        if (o.type === 'text') {
          const f = await font(o.font, o.bold); const chars = new Set(f.getCharacterSet());
          for (const [k, line] of String(o.text).split('\n').entries()) {
            const s = [...line].map((ch) => (chars.has(ch.codePointAt(0)) ? ch : '?')).join('');
            const [x, y] = toPdf(o.x + 1, o.y + o.size * (0.88 + k * 1.15));
            page.drawText(s, { x, y, size: o.size, font: f, color: await hexRgb(o.color), rotate: L.degrees(rot) });
          }
        } else if (o.type === 'image') {
          const img = await pdf.embedPng(dataUrlBytes(o.src));
          const [x, y] = toPdf(o.x, o.y + o.h);
          page.drawImage(img, { x, y, width: o.w, height: o.h, rotate: L.degrees(rot) });
        } else if (o.type === 'rect') {
          const [x, y] = toPdf(o.x, o.y + o.h);
          page.drawRectangle({ x, y, width: o.w, height: o.h, color: await hexRgb(o.fill), opacity: o.opacity ?? 1, rotate: L.degrees(rot), ...(o.blend ? { blendMode: L.BlendMode.Multiply } : {}) });
        } else if (o.type === 'draw' || o.type === 'check') {
          const pts = o.type === 'draw' ? o.pts : [[o.x + o.w * 0.1, o.y + o.h * 0.55], [o.x + o.w * 0.4, o.y + o.h * 0.85], [o.x + o.w * 0.9, o.y + o.h * 0.15]];
          const color = await hexRgb(o.color), thickness = o.type === 'draw' ? o.lw : Math.max(1.2, o.w * 0.12);
          for (let k = 1; k < pts.length; k++) {
            const [ax, ay] = toPdf(...pts[k - 1]), [bx, by] = toPdf(...pts[k]);
            page.drawLine({ start: { x: ax, y: ay }, end: { x: bx, y: by }, thickness, color, lineCap: L.LineCapStyle.Round });
          }
        }
      }
    }
    return [{ name: st.file ? outName(st.file, mode === 'sign' ? 'firmado' : 'editado') : 'nuevo.pdf', blob: new Blob([await pdf.save()], { type: 'application/pdf' }) }];
  });

  if (mode === 'create') {
    const size = select(Object.keys(PAGE_SIZES).map((k) => [k, { a4: 'A4', letter: 'Carta', legal: 'Oficio', a5: 'A5' }[k]]), 'a4');
    const n = el('input', { type: 'number', min: 1, max: 100, value: 1 });
    const start = el('button', { className: 'btn primary', textContent: 'Empezar', type: 'button' });
    const intro = el('div', { className: 'drop', style: 'cursor:default' }, el('b', { textContent: 'Nuevo documento' }), el('div', { className: 'row2', style: 'width:min(360px,100%)' }, field('Tamaño', size), field('Páginas', n)), start);
    start.onclick = () => {
      intro.remove(); ui.work.append(el('div', { className: 'ed' }, bar, pagesBox));
      for (let i = 0; i < Math.max(1, +n.value); i++) addBlank(PAGE_SIZES[size.value]);
      st.tool = 'text'; drawBar();
    };
    ui.work.append(intro);
  } else {
    const edWrap = el('div', { className: 'ed', hidden: true }, bar, pagesBox);
    const fd = fileDrop({ accept: ACCEPT_PDF, label: mode === 'sign' ? 'Suelta aquí el PDF que quieres firmar' : 'Suelta aquí el PDF que quieres editar', onChange: async (f) => { await loadDoc(f[0]); fd.root.hidden = !!f[0]; edWrap.hidden = !f[0]; if (mode === 'sign' && f[0]) openSign(); } });
    ui.work.append(fd.root, edWrap);
  }
  ui.work.append(imgInput);
}

// =====================================================================
// Rellenar formularios
// =====================================================================
export function forms(ui) {
  let file = null, pdf = null;
  const list = el('div');
  const flat = toggle('Aplanar al guardar (ya no se podrá modificar)', false);
  ui.opts.append(flat);
  ui.work.append(fileDrop({ accept: ACCEPT_PDF, onChange: async (f) => {
    file = f[0]; list.replaceChildren(); pdf = null;
    if (!file) return ui.ready(false);
    const L = await libs.pdflib();
    pdf = await L.PDFDocument.load(await readBytes(file), { ignoreEncryption: true });
    const fields = pdf.getForm().getFields();
    if (!fields.length) { list.append(el('p', { className: 'muted', textContent: 'Este PDF no tiene campos de formulario. Usa "Editar PDF" para escribir sobre él.' })); return ui.ready(false); }
    for (const fld of fields) {
      let input;
      try {
        if (fld instanceof L.PDFTextField) { input = el(fld.isMultiline() ? 'textarea' : 'input', { value: fld.getText() || '' }); input.oninput = () => fld.setText(input.value); }
        else if (fld instanceof L.PDFCheckBox) { input = el('input', { type: 'checkbox', checked: fld.isChecked() }); input.onchange = () => (input.checked ? fld.check() : fld.uncheck()); }
        else if (fld instanceof L.PDFDropdown || fld instanceof L.PDFOptionList) { input = select([['', '—'], ...fld.getOptions().map((o) => [o, o])], fld.getSelected()?.[0] || ''); input.onchange = () => input.value && fld.select(input.value); }
        else if (fld instanceof L.PDFRadioGroup) { input = select([['', '—'], ...fld.getOptions().map((o) => [o, o])], fld.getSelected() || ''); input.onchange = () => input.value && fld.select(input.value); }
        else continue;
      } catch { continue; }
      list.append(field(fld.getName(), input));
    }
    ui.ready(true);
  } }).root, el('div', { style: 'margin-top:14px;max-width:560px' }, list));
  ui.run('Guardar formulario', async () => {
    if (flat.input.checked) pdf.getForm().flatten(); else pdf.getForm().updateFieldAppearances();
    return [{ name: outName(file, 'relleno'), blob: new Blob([await pdf.save()], { type: 'application/pdf' }) }];
  });
}

// =====================================================================
// Marca de agua
// =====================================================================
export function watermark(ui) {
  let files = [], image = null;
  const text = el('input', { type: 'text', value: 'CONFIDENCIAL' });
  const size = el('input', { type: 'number', value: 60, min: 6, max: 300 });
  const color = el('input', { type: 'color', value: '#d0021b' });
  const img = el('input', { type: 'file', accept: 'image/png,image/jpeg' });
  img.onchange = () => { image = img.files[0]; };
  const tRow = el('div', {}, field('Texto', text), el('div', { className: 'row2' }, field('Tamaño', size), field('Color', color)));
  const iRow = el('div', { hidden: true }, field('Imagen (PNG con transparencia recomendado)', img));
  const kind = seg([['text', 'Texto'], ['image', 'Imagen']], 'text', (v) => { tRow.hidden = v !== 'text'; iRow.hidden = v !== 'image'; });
  const pos = select([['diag', 'Centro en diagonal'], ['center', 'Centro'], ['tile', 'Mosaico'], ['tl', 'Arriba a la izquierda'], ['tr', 'Arriba a la derecha'], ['bl', 'Abajo a la izquierda'], ['br', 'Abajo a la derecha']], 'diag');
  const op = el('input', { type: 'range', min: 5, max: 100, value: 25 });
  const pages = el('input', { type: 'text', placeholder: 'Todas (o p. ej. 1-3, 5)' });
  ui.opts.append(field('Tipo', kind), tRow, iRow, field('Posición', pos), field('Opacidad', op), field('Páginas', pages));
  ui.work.append(fileDrop({ accept: ACCEPT_PDF, multiple: true, onChange: (f) => { files = f; ui.ready(f.length > 0); } }).root);
  ui.run('Añadir marca de agua', async () => {
    const L = await libs.pdflib();
    const out = [];
    for (const f of files) {
      const pdf = await L.PDFDocument.load(await readBytes(f), { ignoreEncryption: true });
      const font = await pdf.embedFont(L.StandardFonts.HelveticaBold);
      let emb = null;
      if (kind.value === 'image') { if (!image) throw new Error('Elige una imagen'); const b = await readBytes(image); emb = /png$/i.test(image.type) ? await pdf.embedPng(b) : await pdf.embedJpg(b); }
      const idx = pages.value.trim() ? parseRanges(pages.value, pdf.getPageCount()) : pdf.getPageIndices();
      const opacity = op.value / 100, col = await hexRgb(color.value);
      for (const i of idx) {
        const pg = pdf.getPage(i); const { width: W, height: H } = pg.getSize();
        const s = +size.value, tw = emb ? Math.min(W * 0.5, emb.width) : font.widthOfTextAtSize(text.value, s), th = emb ? (tw * emb.height) / emb.width : s * 0.7;
        const draw = (x, y, rot = 0) => (emb ? pg.drawImage(emb, { x, y, width: tw, height: th, opacity, rotate: L.degrees(rot) }) : pg.drawText(text.value, { x, y, size: s, font, color: col, opacity, rotate: L.degrees(rot) }));
        const m = 30;
        if (pos.value === 'diag') { const a = Math.atan2(H, W); draw(W / 2 - (Math.cos(a) * tw) / 2 + (Math.sin(a) * th) / 2, H / 2 - (Math.sin(a) * tw) / 2 - (Math.cos(a) * th) / 2, (a * 180) / Math.PI); }
        else if (pos.value === 'center') draw((W - tw) / 2, (H - th) / 2);
        else if (pos.value === 'tile') { for (let y = 0; y < H + th; y += th * 4 + 40) for (let x = -tw / 2; x < W; x += tw + 60) draw(x, y, 30); }
        else draw(pos.value.endsWith('l') ? m : W - tw - m, pos.value.startsWith('t') ? H - th - m : m);
      }
      out.push({ name: outName(f, 'marca_agua'), blob: new Blob([await pdf.save()], { type: 'application/pdf' }) });
    }
    return out;
  });
}

// =====================================================================
// Números de página
// =====================================================================
export function pagenum(ui) {
  let files = [];
  const pos = select([['bc', 'Abajo centro'], ['br', 'Abajo derecha'], ['bl', 'Abajo izquierda'], ['tc', 'Arriba centro'], ['tr', 'Arriba derecha'], ['tl', 'Arriba izquierda']], 'bc');
  const fmt = el('input', { type: 'text', value: 'Página {n} de {total}' });
  const start = el('input', { type: 'number', value: 1 });
  const size = el('input', { type: 'number', value: 10, min: 5, max: 40 });
  const skip = toggle('No numerar la primera página (portada)', false);
  ui.opts.append(field('Posición', pos), field('Formato', fmt, 'Usa {n} para el número y {total} para el total'), el('div', { className: 'row2' }, field('Empezar en', start), field('Tamaño', size)), skip);
  ui.work.append(fileDrop({ accept: ACCEPT_PDF, multiple: true, onChange: (f) => { files = f; ui.ready(f.length > 0); } }).root);
  ui.run('Numerar páginas', async () => {
    const L = await libs.pdflib();
    const out = [];
    for (const f of files) {
      const pdf = await L.PDFDocument.load(await readBytes(f), { ignoreEncryption: true });
      const font = await pdf.embedFont(L.StandardFonts.Helvetica);
      const N = pdf.getPageCount(), first = skip.input.checked ? 1 : 0;
      for (let i = first; i < N; i++) {
        const pg = pdf.getPage(i), { width: W, height: H } = pg.getSize(), s = +size.value;
        const txt = fmt.value.replace('{n}', String(+start.value + i - first)).replace('{total}', String(N - first + +start.value - 1));
        const tw = font.widthOfTextAtSize(txt, s), m = 24;
        const x = pos.value.endsWith('l') ? m : pos.value.endsWith('r') ? W - tw - m : (W - tw) / 2;
        const y = pos.value.startsWith('t') ? H - m - s : m;
        pg.drawText(txt, { x, y, size: s, font, color: L.rgb(0.2, 0.2, 0.2) });
      }
      out.push({ name: outName(f, 'numerado'), blob: new Blob([await pdf.save()], { type: 'application/pdf' }) });
    }
    return out;
  });
}

// =====================================================================
// Metadatos
// =====================================================================
export function metadata(ui) {
  let file = null, pdf = null;
  const f = { title: el('input'), author: el('input'), subject: el('input'), keywords: el('input'), creator: el('input') };
  ui.opts.append(field('Título', f.title), field('Autor', f.author), field('Asunto', f.subject), field('Palabras clave', f.keywords, 'Separadas por comas'), field('Aplicación', f.creator));
  ui.work.append(fileDrop({ accept: ACCEPT_PDF, onChange: async (fl) => {
    file = fl[0]; if (!file) return ui.ready(false);
    const { PDFDocument } = await libs.pdflib();
    pdf = await PDFDocument.load(await readBytes(file), { ignoreEncryption: true, updateMetadata: false });
    f.title.value = pdf.getTitle() || ''; f.author.value = pdf.getAuthor() || ''; f.subject.value = pdf.getSubject() || ''; f.keywords.value = pdf.getKeywords() || ''; f.creator.value = pdf.getCreator() || '';
    ui.ready(true);
  } }).root);
  ui.run('Guardar datos', async () => {
    pdf.setTitle(f.title.value); pdf.setAuthor(f.author.value); pdf.setSubject(f.subject.value);
    pdf.setKeywords(f.keywords.value.split(',').map((s) => s.trim()).filter(Boolean)); pdf.setCreator(f.creator.value); pdf.setProducer('PDF G'); pdf.setModificationDate(new Date());
    return [{ name: outName(file), blob: new Blob([await pdf.save()], { type: 'application/pdf' }) }];
  });
}

// =====================================================================
// Texto → PDF
// =====================================================================
export function text2pdf(ui) {
  const ta = el('textarea', { rows: 22, placeholder: 'Escribe o pega aquí tu texto…', style: 'width:100%;min-height:60vh;font-family:inherit' });
  const font = select([['Helvetica', 'Helvetica'], ['Times-Roman', 'Times'], ['Courier', 'Courier']], 'Helvetica');
  const size = el('input', { type: 'number', value: 11, min: 6, max: 40 });
  const page = select([['a4', 'A4'], ['letter', 'Carta']], 'a4');
  const file = el('input', { type: 'file', accept: '.txt,text/plain' });
  file.onchange = async () => { if (file.files[0]) { ta.value = await file.files[0].text(); ui.ready(true); } };
  ui.opts.append(field('Fuente', font), el('div', { className: 'row2' }, field('Tamaño', size), field('Papel', page)), field('o carga un .txt', file));
  ta.oninput = () => ui.ready(ta.value.trim().length > 0);
  ui.work.append(ta);
  ui.run('Crear PDF', async () => {
    const L = await libs.pdflib();
    const pdf = await L.PDFDocument.create();
    const f = await pdf.embedFont(stdFont(L.StandardFonts, font.value, false));
    const chars = new Set(f.getCharacterSet());
    const s = +size.value, [W, H] = PAGE_SIZES[page.value], m = 56, lh = s * 1.35;
    let pg = pdf.addPage([W, H]), y = H - m - s;
    const line = (t) => { if (y < m) { pg = pdf.addPage([W, H]); y = H - m - s; } pg.drawText(t, { x: m, y, size: s, font: f }); y -= lh; };
    for (const para of ta.value.replace(/\t/g, '    ').split('\n')) {
      const clean = [...para].map((ch) => (chars.has(ch.codePointAt(0)) ? ch : '?')).join('');
      if (!clean.trim()) { y -= lh; continue; }
      let cur = '';
      for (const w of clean.split(' ')) { const t = cur ? `${cur} ${w}` : w; if (f.widthOfTextAtSize(t, s) > W - m * 2 && cur) { line(cur); cur = w; } else cur = t; }
      if (cur) line(cur);
    }
    return [{ name: 'texto.pdf', blob: new Blob([await pdf.save()], { type: 'application/pdf' }) }];
  });
}
