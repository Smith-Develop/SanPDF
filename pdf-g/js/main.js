// PDF G · catálogo de herramientas y navegación
import { $, el, progress, toast } from './core.js';
import { showResults, isPdf } from './ui.js';
import { pdf2excel, pdf2word, pdf2img, pdf2txt, img2pdf, word2pdf, excel2pdf, web2pdf } from './tools-convert.js';
import { merge, split, organize, extract, compress, protect, unlock, repair, ocr, flatten } from './tools-pages.js';
import { editor, forms, watermark, pagenum, metadata, text2pdf } from './tools-edit.js';
import { shortcutDialog } from './shortcut.js';

const I = {
  excel: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13l4 5m0-5-4 5M14 13h2m-2 3h2"/>',
  word: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M7.5 13l1.2 5 1.8-4 1.8 4 1.2-5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  text: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  web: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  merge: '<path d="M8 3v5a4 4 0 0 0 4 4 4 4 0 0 1 4 4v5M16 3v5a4 4 0 0 1-4 4"/><path d="m5 18 3 3 3-3"/>',
  split: '<path d="M12 3v6M12 9l-6 6v6M12 9l6 6v6"/>',
  pages: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="9" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  extract: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4"/><path d="M14 3v6h6v3M15 17h7m-3-3 3 3-3 3"/>',
  rotate: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  sign: '<path d="M3 17c3-3 4-9 7-9 2 0 0 7 3 7 1.5 0 2-2 3-2s1 2 3 2"/><path d="M3 21h18"/>',
  form: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h4"/>',
  water: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  number: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  compress: '<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  unlock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>',
  ocr: '<path d="M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3"/><path d="M8 9h8M8 12h8M8 15h5"/>',
  flat: '<path d="M3 7l9-4 9 4-9 4z"/><path d="M3 12l9 4 9-4M3 17l9 4 9-4"/>',
  repair: '<path d="M14.7 6.3a4 4 0 0 0-5.6 5.6L3 18v3h3l6.1-6.1a4 4 0 0 0 5.6-5.6l-2.5 2.5-2.8-2.8z"/>',
  create: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M12 12v6M9 15h6"/>',
  pdf: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>',
};
const CATS = [
  { id: 'convert', name: 'Convertir', color: 'var(--c-convert)' },
  { id: 'organize', name: 'Organizar', color: 'var(--c-organize)' },
  { id: 'edit', name: 'Editar y firmar', color: 'var(--c-edit)' },
  { id: 'secure', name: 'Optimizar y seguridad', color: 'var(--c-secure)' },
  { id: 'create', name: 'Crear', color: 'var(--c-create)' },
];
export const TOOLS = [
  { id: 'pdf2excel', cat: 'convert', icon: 'excel', title: 'PDF a Excel', desc: 'Extrae las tablas a un Excel con números y fechas reales', mount: pdf2excel, star: true, keys: 'xlsx hoja calculo tabla csv extracto factura' },
  { id: 'pdf2word', cat: 'convert', icon: 'word', title: 'PDF a Word', desc: 'Convierte el PDF en un documento editable', mount: pdf2word, keys: 'docx documento' },
  { id: 'pdf2img', cat: 'convert', icon: 'image', title: 'PDF a imágenes', desc: 'Cada página como JPG, PNG o WEBP', mount: pdf2img, keys: 'jpg png foto' },
  { id: 'pdf2txt', cat: 'convert', icon: 'text', title: 'PDF a texto', desc: 'Extrae todo el texto (con OCR si hace falta)', mount: pdf2txt, keys: 'txt copiar' },
  { id: 'img2pdf', cat: 'convert', icon: 'image', title: 'Imágenes a PDF', desc: 'Une fotos y capturas en un PDF', mount: img2pdf, keys: 'jpg png foto escanear' },
  { id: 'word2pdf', cat: 'convert', icon: 'word', title: 'Word a PDF', desc: 'Convierte documentos .docx', mount: word2pdf, keys: 'docx documento' },
  { id: 'excel2pdf', cat: 'convert', icon: 'excel', title: 'Excel a PDF', desc: 'Hojas de cálculo .xlsx, .xls o CSV', mount: excel2pdf, keys: 'xlsx xls csv hoja' },
  { id: 'web2pdf', cat: 'convert', icon: 'web', title: 'Página web a PDF', desc: 'Guarda cualquier pestaña abierta como PDF', mount: web2pdf, keys: 'html url pagina' },
  { id: 'merge', cat: 'organize', icon: 'merge', title: 'Unir PDF', desc: 'Combina varios PDF (e imágenes) en uno', mount: merge, keys: 'juntar combinar' },
  { id: 'split', cat: 'organize', icon: 'split', title: 'Dividir PDF', desc: 'Por páginas, cada N páginas o por rangos', mount: split, keys: 'separar partir' },
  { id: 'organize', cat: 'organize', icon: 'pages', title: 'Organizar páginas', desc: 'Reordena, gira, duplica, borra e inserta', mount: (ui) => organize(ui), keys: 'ordenar mover reordenar' },
  { id: 'extract', cat: 'organize', icon: 'extract', title: 'Extraer páginas', desc: 'Saca las páginas que elijas a otro PDF', mount: extract, keys: 'sacar seleccionar' },
  { id: 'rotate', cat: 'organize', icon: 'rotate', title: 'Girar PDF', desc: 'Endereza páginas giradas', mount: (ui) => organize(ui, 'rotate'), keys: 'rotar girar' },
  { id: 'delete', cat: 'organize', icon: 'trash', title: 'Eliminar páginas', desc: 'Quita páginas que sobran', mount: (ui) => organize(ui, 'delete'), keys: 'borrar quitar' },
  { id: 'edit', cat: 'edit', icon: 'edit', title: 'Editar PDF', desc: 'Añade texto, imágenes, dibujos, resalta o tapa', mount: (ui) => editor(ui, 'edit'), keys: 'escribir anotar tachar resaltar' },
  { id: 'sign', cat: 'edit', icon: 'sign', title: 'Firmar PDF', desc: 'Dibuja o escribe tu firma y colócala', mount: (ui) => editor(ui, 'sign'), keys: 'firma rubrica' },
  { id: 'forms', cat: 'edit', icon: 'form', title: 'Rellenar formulario', desc: 'Completa los campos de un PDF', mount: forms, keys: 'campos rellenar' },
  { id: 'watermark', cat: 'edit', icon: 'water', title: 'Marca de agua', desc: 'Texto o imagen sobre las páginas', mount: watermark, keys: 'sello confidencial logo' },
  { id: 'pagenum', cat: 'edit', icon: 'number', title: 'Numerar páginas', desc: '"Página 1 de 10" donde quieras', mount: pagenum, keys: 'numero paginacion pie' },
  { id: 'metadata', cat: 'edit', icon: 'info', title: 'Datos del documento', desc: 'Título, autor, asunto y palabras clave', mount: metadata, keys: 'metadatos propiedades autor' },
  { id: 'compress', cat: 'secure', icon: 'compress', title: 'Comprimir PDF', desc: 'Reduce el tamaño para enviarlo por correo', mount: compress, keys: 'reducir peso optimizar tamaño' },
  { id: 'ocr', cat: 'secure', icon: 'ocr', title: 'OCR: escaneado a Word o PDF', desc: 'Reconoce el texto de PDF escaneados o imágenes: Word editable con el diseño original o PDF buscable', mount: ocr, keys: 'escaneado reconocer texto ocr buscable word imagen' },
  { id: 'protect', cat: 'secure', icon: 'lock', title: 'Proteger con contraseña', desc: 'Cifrado AES de 256 bits', mount: protect, keys: 'contraseña cifrar seguridad' },
  { id: 'unlock', cat: 'secure', icon: 'unlock', title: 'Quitar contraseña', desc: 'Si conoces la contraseña', mount: unlock, keys: 'desbloquear descifrar' },
  { id: 'flatten', cat: 'secure', icon: 'flat', title: 'Aplanar PDF', desc: 'Fija formularios y anotaciones', mount: flatten, keys: 'aplanar fijar' },
  { id: 'repair', cat: 'secure', icon: 'repair', title: 'Reparar PDF', desc: 'Arregla PDF dañados o que dan error', mount: repair, keys: 'arreglar dañado corrupto' },
  { id: 'create', cat: 'create', icon: 'create', title: 'Crear PDF', desc: 'Documento nuevo en blanco con el editor', mount: (ui) => editor(ui, 'create'), keys: 'nuevo blanco' },
  { id: 'text2pdf', cat: 'create', icon: 'text', title: 'Texto a PDF', desc: 'Pega un texto y conviértelo en PDF', mount: text2pdf, keys: 'txt escribir' },
];
const svg = (k) => `<svg viewBox="0 0 24 24">${I[k] || I.pdf}</svg>`;
const catColor = (id) => CATS.find((c) => c.id === id).color;
let pending = null, current = null;

// ---------------- inicio ----------------
function renderHome(filter = '') {
  const home = $('home');
  const q = filter.trim().toLowerCase();
  const match = (t) => !q || `${t.title} ${t.desc} ${t.keys || ''}`.toLowerCase().includes(q);
  const card = (t) => { const c = el('button', { className: 'card', type: 'button' }); c.innerHTML = `<span class="ic" style="background:${catColor(t.cat)}">${svg(t.icon)}</span><span><b>${t.title}</b><small>${t.desc}</small></span>${t.star ? '<span class="star">Destacado</span>' : ''}`; c.onclick = () => openTool(t.id); return c; };
  home.replaceChildren();
  if (!q) {
    const drop = el('label', { className: 'hero-drop' }, el('input', { type: 'file', accept: '.pdf,application/pdf', hidden: true }));
    drop.insertAdjacentHTML('beforeend', `${svg('pdf')}<b>Suelta un PDF aquí</b><small>y elige qué hacer con él</small>`);
    const pick = (f) => { if (f && isPdf(f)) { pending = f; toast(`"${f.name}" listo: elige una herramienta`, 4000); } };
    drop.querySelector('input').onchange = (e) => pick(e.target.files[0]);
    drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); }; drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); pick(e.dataTransfer.files[0]); };
    const go = el('button', { className: 'btn primary', type: 'button', textContent: 'Convertir PDF a Excel' }); go.onclick = () => openTool('pdf2excel');
    home.append(el('div', { className: 'hero' }, el('div', { className: 'hero-main' }, el('h2', { textContent: 'Todo para tus PDF, sin subir nada' }), el('p', { textContent: 'Convierte, edita, firma, comprime y protege tus documentos. Todo se procesa en tu ordenador: tus archivos nunca salen de él.' }), go), drop));
  }
  for (const c of CATS) {
    const list = TOOLS.filter((t) => t.cat === c.id && match(t));
    if (!list.length) continue;
    home.append(el('section', { className: 'cat' }, el('h3', {}, Object.assign(el('i'), { style: `background:${c.color}` }), c.name), el('div', { className: 'grid' }, ...list.map(card))));
  }
  if (!home.children.length) home.append(el('p', { className: 'muted', textContent: `No hay herramientas para "${filter}".` }));
}

// ---------------- herramienta ----------------
function openTool(id, file) {
  const t = TOOLS.find((x) => x.id === id); if (!t) return;
  current = t;
  if (location.hash.slice(1) !== id) history.replaceState(null, '', `#${id}`);
  $('home').hidden = true; $('tool').hidden = false;
  $('toolTitle').textContent = t.title; $('toolDesc').textContent = t.desc;
  $('toolIcon').innerHTML = svg(t.icon); $('toolIcon').style.background = catColor(t.cat);
  $('work').replaceChildren(); $('opts').replaceChildren(); $('results').replaceChildren();
  const run = $('run'); run.disabled = true; run.onclick = null;
  const ui = {
    work: $('work'), opts: $('opts'),
    ready: (ok) => { run.disabled = !ok; },
    run: (label, fn) => {
      run.textContent = label;
      run.onclick = async () => {
        run.disabled = true; $('results').replaceChildren();
        try {
          const items = await fn();
          progress(null);
          if (items?.length) { showResults(items, { onUse: (f) => { pending = f; showHome(); toast(`Elige qué hacer ahora con "${f.name}"`, 4000); } }); toast('¡Listo!'); }
        } catch (e) { progress(null); toast(`Error: ${e.message || e}`, 7000); console.error(e); }
        run.disabled = false;
      };
    },
  };
  t.mount(ui);
  window.scrollTo(0, 0);
  const f = file || pending; pending = null;
  if (f) {
    const input = $('work').querySelector('input[type=file]');
    if (input) { const dt = new DataTransfer(); dt.items.add(f); input.files = dt.files; input.dispatchEvent(new Event('change')); }
  }
}
function showHome() { current = null; $('tool').hidden = true; $('home').hidden = false; if (location.hash) history.replaceState(null, '', location.pathname); renderHome($('search').value); }

$('back').onclick = showHome;
$('homeLink').onclick = (e) => { e.preventDefault(); $('search').value = ''; showHome(); };
$('search').oninput = () => { if (!$('tool').hidden) showHome(); renderHome($('search').value); };
addEventListener('hashchange', () => { const id = location.hash.slice(1); if (!id || !TOOLS.some((t) => t.id === id)) showHome(); else if (current?.id !== id) openTool(id); });
$('shortcutBtn').onclick = () => shortcutDialog();
const start = location.hash.slice(1);
if (start && TOOLS.some((t) => t.id === start)) openTool(start); else renderHome();
// recién instalada: ofrecer el acceso directo en el escritorio
if (start === 'bienvenida') { history.replaceState(null, '', location.pathname); shortcutDialog({ welcome: true }); }
