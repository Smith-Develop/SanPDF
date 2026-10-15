// PDF G · acceso directo en el escritorio
// Chrome no deja a las extensiones escribir fuera de Descargas, así que se descarga un pequeño instalador
// (Windows: .cmd con PowerShell; Linux: .desktop) que crea el acceso directo que abre la extensión en su propia ventana.
import { el, toast } from './core.js';

const APP_URL = () => chrome.runtime.getURL('app.html');
const brand = () => {
  const b = (navigator.userAgentData?.brands || []).map((x) => x.brand).join(' ');
  return /Edge/i.test(b) ? 'edge' : /Brave/i.test(b) ? 'brave' : 'chrome';
};
const os = () => { const p = navigator.userAgentData?.platform || navigator.platform || ''; return /win/i.test(p) ? 'win' : /mac/i.test(p) ? 'mac' : 'linux'; };

// Icono .ico con la imagen PNG dentro (Windows Vista o posterior)
async function icoBase64() {
  const png = new Uint8Array(await (await fetch(chrome.runtime.getURL('icons/128.png'))).arrayBuffer());
  const ico = new Uint8Array(22 + png.length), v = new DataView(ico.buffer);
  v.setUint16(2, 1, true); v.setUint16(4, 1, true);                      // tipo icono, 1 imagen
  ico[6] = 128; ico[7] = 128; v.setUint16(10, 1, true); v.setUint16(12, 32, true);
  v.setUint32(14, png.length, true); v.setUint32(18, 22, true);
  ico.set(png, 22);
  let s = ''; for (const b of ico) s += String.fromCharCode(b);
  return btoa(s);
}

async function windowsScript() {
  const exe = { chrome: 'chrome.exe', edge: 'msedge.exe', brave: 'brave.exe' }[brand()];
  const paths = {
    chrome: ['$env:ProgramFiles\\Google\\Chrome\\Application\\chrome.exe', '${env:ProgramFiles(x86)}\\Google\\Chrome\\Application\\chrome.exe', '$env:LOCALAPPDATA\\Google\\Chrome\\Application\\chrome.exe'],
    edge: ['${env:ProgramFiles(x86)}\\Microsoft\\Edge\\Application\\msedge.exe', '$env:ProgramFiles\\Microsoft\\Edge\\Application\\msedge.exe'],
    brave: ['$env:ProgramFiles\\BraveSoftware\\Brave-Browser\\Application\\brave.exe', '$env:LOCALAPPDATA\\BraveSoftware\\Brave-Browser\\Application\\brave.exe'],
  }[brand()];
  // solo ASCII: la consola de Windows no siempre muestra bien las tildes
  const ps = [
    "$ErrorActionPreference = 'Stop'",
    `$url = '${APP_URL()}'`,
    `$cands = @(${paths.map((p) => `"${p}"`).join(', ')})`,
    `$reg = (Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exe}', 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exe}' -ErrorAction SilentlyContinue | Select-Object -First 1).'(default)'`,
    '$browser = @($cands + $reg) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1',
    "if (-not $browser) { Write-Host 'No se encontro el navegador. Crea el acceso directo a mano.'; Read-Host 'Pulsa Intro para salir'; exit 1 }",
    "$dir = Join-Path $env:LOCALAPPDATA 'PDF G'",
    'New-Item -ItemType Directory -Force -Path $dir | Out-Null',
    "$ico = Join-Path $dir 'pdfg.ico'",
    `[IO.File]::WriteAllBytes($ico, [Convert]::FromBase64String('${await icoBase64()}'))`,
    "$lnk = Join-Path ([Environment]::GetFolderPath('Desktop')) 'PDF G.lnk'",
    '$s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)',
    '$s.TargetPath = $browser',
    '$s.Arguments = "--app=$url"',
    '$s.IconLocation = $ico',
    "$s.Description = 'PDF G: convierte, edita y firma PDF'",
    '$s.Save()',
    "Write-Host 'Listo: ya tienes PDF G en el escritorio.'",
    'Start-Sleep -Seconds 3',
  ].join('\r\n');
  // el .cmd se lee a sí mismo y ejecuta con PowerShell lo que hay tras la marca #PS#
  const cmd = [
    '@echo off',
    'rem PDF G - crea un acceso directo en el escritorio',
    'set "PDFG_SELF=%~f0"',
    "powershell -NoProfile -ExecutionPolicy Bypass -Command \"$t=[IO.File]::ReadAllText($env:PDFG_SELF); $m='#'+'PS'+'#'; iex $t.Substring($t.LastIndexOf($m)+$m.Length)\"",
    'exit /b',
    '#PS#',
    ps,
    '',
  ].join('\r\n');
  return { name: 'Crear acceso directo PDF G.cmd', blob: new Blob([cmd], { type: 'application/octet-stream' }) };
}

function linuxDesktop() {
  const bin = { chrome: 'google-chrome', edge: 'microsoft-edge', brave: 'brave-browser' }[brand()];
  const txt = ['[Desktop Entry]', 'Type=Application', 'Name=PDF G', 'Comment=Convierte, edita y firma PDF', `Exec=${bin} --app=${APP_URL()}`, 'Terminal=false', 'Categories=Office;', ''].join('\n');
  return { name: 'PDF G.desktop', blob: new Blob([txt], { type: 'application/octet-stream' }) };
}

async function downloadAndShow({ name, blob }) {
  const url = URL.createObjectURL(blob);
  try {
    const id = await chrome.downloads.download({ url, filename: `PDF G/${name}`, conflictAction: 'overwrite' });
    const done = (d) => { if (d.id === id && d.state?.current === 'complete') { chrome.downloads.onChanged.removeListener(done); chrome.downloads.show(id); } };
    chrome.downloads.onChanged.addListener(done);
  } catch {
    el('a', { href: url, download: name }).click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}

export function shortcutDialog({ welcome = false } = {}) {
  const system = os();
  const steps = {
    win: ['Pulsa "Crear acceso directo": se descarga un pequeño instalador y se abre su carpeta.', 'Si Chrome pregunta, elige "Conservar".', 'Haz doble clic en "Crear acceso directo PDF G". Si Windows muestra un aviso, pulsa "Más información" y "Ejecutar de todas formas".', 'Aparecerá "PDF G" en tu escritorio: al pulsarlo se abre la aplicación en su propia ventana.'],
    linux: ['Pulsa "Crear acceso directo": se descarga "PDF G.desktop".', 'Muévelo al escritorio, haz clic derecho y elige "Permitir ejecutar".'],
    mac: ['En Mac, Chrome no permite crear el acceso directo automáticamente.', 'Añade esta página a marcadores (Cmd+D) o deja la pestaña fijada (clic derecho > Fijar).'],
  }[system];
  const dlg = el('dialog', { className: 'busy-card', style: 'width:min(560px,94vw);text-align:left' });
  const make = el('button', { className: 'btn primary', type: 'button', textContent: 'Crear acceso directo', hidden: system === 'mac' });
  const close = el('button', { className: 'btn', type: 'button', textContent: welcome ? 'Ahora no' : 'Cerrar' });
  make.onclick = async () => {
    make.disabled = true;
    try { await downloadAndShow(system === 'win' ? await windowsScript() : linuxDesktop()); toast('Instalador descargado: ábrelo para crear el acceso directo', 6000); }
    catch (e) { toast(`No se pudo crear: ${e.message}`, 6000); }
    make.disabled = false;
  };
  close.onclick = () => dlg.close();
  dlg.append(
    el('div', { className: 'mstripe', style: 'margin:-40px -40px 32px' }),
    el('h3', { textContent: welcome ? 'PDF G está instalado' : 'Acceso directo en el escritorio', style: 'margin:0 0 8px;font-size:24px' }),
    el('p', { textContent: 'Abre PDF G con un clic desde tu escritorio, sin buscar el icono de la extensión.', style: 'margin:0 0 16px;color:var(--body-strong)' }),
    el('ol', { style: 'margin:0 0 24px;padding-left:20px;display:grid;gap:8px' }, ...steps.map((t) => el('li', { textContent: t }))),
    el('div', { style: 'display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap' }, close, make),
  );
  document.body.append(dlg); dlg.showModal(); dlg.onclose = () => dlg.remove();
}
