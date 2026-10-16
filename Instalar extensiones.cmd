@echo off
rem ==========================================================================
rem  Instalador de extensiones para Windows (Chrome, Edge o Brave)
rem  Detecta las carpetas con manifest.json que hay junto a este archivo
rem  (pdf-g, incidencias-g...) y te deja elegir cual instalar:
rem  1. Copia la extension a %LOCALAPPDATA%\<nombre de la extension>\extension
rem  2. Abre la pagina de extensiones del navegador con la ruta en el portapapeles
rem  3. Espera a que la cargues (Modo de desarrollador > Cargar descomprimida)
rem  4. Crea el acceso directo en el escritorio y abre la extension
rem  Para anadir otra extension basta con copiar su carpeta junto a este archivo.
rem  Chrome no permite que un programa active el modo de desarrollador ni cargue
rem  extensiones por si solo: esos dos clics los tienes que hacer tu.
rem ==========================================================================
setlocal
set "PDFG_SELF=%~f0"
set "PDFG_DIR=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$t=[IO.File]::ReadAllText($env:PDFG_SELF); $m='#'+'PS'+'#'; iex $t.Substring($t.LastIndexOf($m)+$m.Length)"
exit /b
#PS#
$ErrorActionPreference = 'Stop'
$Host.UI.RawUI.WindowTitle = 'Instalar extensiones'
function Say($text, $color = 'Gray') { Write-Host $text -ForegroundColor $color }
function Fail($text) { Say ''; Say $text 'Red'; Read-Host 'Pulsa Intro para salir' | Out-Null; exit 1 }

Say ''
Say '  Instalador de extensiones' 'White'
Say '  =========================' 'DarkGray'
Say ''

# --- 1. Extensiones disponibles: carpetas con manifest.json junto a este archivo ---
# Del manifest.json se toman el nombre (tambien si esta traducido con __MSG_...__), la version y el icono.
function Read-Manifest($dir) {
  try { $m = [IO.File]::ReadAllText((Join-Path $dir 'manifest.json')) | ConvertFrom-Json } catch { return $null }
  $name = [string]$m.name
  if ($name -match '^__MSG_(.+)__$') {
    $key = $Matches[1]; $loc = if ($m.default_locale) { $m.default_locale } else { 'en' }
    try {
      $msgs = [IO.File]::ReadAllText((Join-Path $dir "_locales\$loc\messages.json")) | ConvertFrom-Json
      $hit = $msgs.PSObject.Properties | Where-Object { $_.Name -ieq $key } | Select-Object -First 1
      $name = if ($hit) { [string]$hit.Value.message } else { '' }
    } catch { $name = '' }
  }
  if (-not $name) { $name = Split-Path $dir -Leaf }
  # icono mas grande declarado en "icons"
  $icon = $null
  if ($m.icons) { $icon = $m.icons.PSObject.Properties | Sort-Object { [int]$_.Name } -Descending | Select-Object -First 1 | ForEach-Object { [string]$_.Value } }
  # pagina que abre el acceso directo: app.html, index.html, la ventana emergente o las opciones
  $page = $null
  foreach ($c in @('app.html', 'index.html', $m.action.default_popup, $m.browser_action.default_popup, $m.options_page, $m.options_ui.page)) {
    if ($c -and (Test-Path (Join-Path $dir $c))) { $page = ([string]$c).TrimStart('/'); break }
  }
  return @{ Dir = $dir; Name = $name.Trim(); Version = [string]$m.version; Icon = $icon; Page = $page }
}
$here = $env:PDFG_DIR.TrimEnd('\')
$exts = @()
foreach ($d in Get-ChildItem -Path $here -Directory | Sort-Object Name) {
  if (Test-Path (Join-Path $d.FullName 'manifest.json')) { $x = Read-Manifest $d.FullName; if ($x) { $exts += $x } }
}
if (-not $exts.Count -and (Test-Path (Join-Path $here 'manifest.json'))) { $exts += (Read-Manifest $here) }
if (-not $exts.Count) { Fail 'No hay ninguna extension junto a este archivo: copia aqui la carpeta de la extension (la que tiene manifest.json).' }
$ext = $exts[0]
if ($exts.Count -gt 1) {
  Say 'Que extension quieres instalar?' 'Cyan'
  for ($i = 0; $i -lt $exts.Count; $i++) { Say ("      {0}. {1}  v{2}   ({3})" -f ($i + 1), $exts[$i].Name, $exts[$i].Version, (Split-Path $exts[$i].Dir -Leaf)) }
  do { $n = Read-Host '      Escribe el numero y pulsa Intro' } until ($n -match '^\d+$' -and [int]$n -ge 1 -and [int]$n -le $exts.Count)
  $ext = $exts[[int]$n - 1]
  Say ''
}
$Host.UI.RawUI.WindowTitle = "Instalar $($ext.Name)"
$src = $ext.Dir
$safe = ($ext.Name -replace '[\\/:*?"<>|]', '').Trim(); if (-not $safe) { $safe = Split-Path $src -Leaf }
$dest = Join-Path $env:LOCALAPPDATA "$safe\extension"
Say "[1/4] Copiando $($ext.Name) v$($ext.Version) a:" 'Cyan'
Say "      $dest"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
robocopy "$src" "$dest" /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { Fail 'No se pudieron copiar los archivos de la extension.' }
# marca para la extension: se instalo con este script (no hace falta su aviso de acceso directo)
[IO.File]::WriteAllText((Join-Path $dest 'instalado.json'), '{"instalador":"cmd"}')

# --- 2. Navegador -------------------------------------------------------------
$pf86 = ${env:ProgramFiles(x86)}
$browsers = @(
  @{ Name = 'Google Chrome';  Page = 'chrome://extensions'; Data = "$env:LOCALAPPDATA\Google\Chrome\User Data";
     Exe = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "$pf86\Google\Chrome\Application\chrome.exe", "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe") },
  @{ Name = 'Microsoft Edge'; Page = 'edge://extensions';   Data = "$env:LOCALAPPDATA\Microsoft\Edge\User Data";
     Exe = @("$pf86\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") },
  @{ Name = 'Brave';          Page = 'brave://extensions';  Data = "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\User Data";
     Exe = @("$env:ProgramFiles\BraveSoftware\Brave-Browser\Application\brave.exe", "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\Application\brave.exe") }
)
$found = @()
foreach ($b in $browsers) { $e = $b.Exe | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1; if ($e) { $b.Path = $e; $found += $b } }
if (-not $found.Count) { Fail 'No encuentro Chrome, Edge ni Brave instalados.' }
$br = $found[0]
if ($found.Count -gt 1) {
  Say ''
  Say '[2/4] En que navegador quieres instalarla?' 'Cyan'
  for ($i = 0; $i -lt $found.Count; $i++) { Say ("      {0}. {1}" -f ($i + 1), $found[$i].Name) }
  $n = Read-Host '      Escribe el numero y pulsa Intro (Intro = 1)'
  if ($n -match '^\d+$' -and [int]$n -ge 1 -and [int]$n -le $found.Count) { $br = $found[[int]$n - 1] }
} else { Say "[2/4] Navegador: $($br.Name)" 'Cyan' }

# --- ID de la extension: lo calcula el navegador a partir de la ruta ---------
# (SHA-256 de la ruta en UTF-16 con la letra de unidad en mayuscula; 32 letras de la a a la p)
$norm = $dest; if ($norm -match '^[a-zA-Z]:') { $norm = $norm.Substring(0, 1).ToUpper() + $norm.Substring(1) }
$hash = [Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::Unicode.GetBytes($norm))
$id = -join ($hash[0..15] | ForEach-Object { [char](97 + ($_ -shr 4)); [char](97 + ($_ -band 15)) })
$escaped = ($dest -replace '\\', '\\')

# Busca la extension en los perfiles del navegador; devuelve la carpeta del perfil (Default, Profile 1...)
function Find-Profile {
  if (-not (Test-Path $br.Data)) { return $null }
  foreach ($d in Get-ChildItem -Path $br.Data -Directory -ErrorAction SilentlyContinue) {
    foreach ($name in @('Secure Preferences', 'Preferences')) {
      $p = Join-Path $d.FullName $name
      if (-not (Test-Path $p)) { continue }
      try { $txt = [IO.File]::ReadAllText($p) } catch { continue }
      if ($txt.IndexOf($escaped, [StringComparison]::OrdinalIgnoreCase) -ge 0 -or $txt.Contains("""$id""")) { return $d.Name }
    }
  }
  return $null
}

# Abre la pagina de extensiones. Chrome y Edge ignoran las direcciones chrome:// y edge:// que les
# pasa otro programa, asi que, si no se abre sola, se escribe en una pestana nueva como lo haria una persona
# (solo si la ventana activa es del navegador, para no escribir en otra aplicacion).
Add-Type -TypeDefinition @'
using System; using System.Text; using System.Runtime.InteropServices;
public static class PdfgWin {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  public static string Title(IntPtr h) { var s = new StringBuilder(512); GetWindowText(h, s, 512); return s.ToString(); }
}
'@
function Get-ForegroundBrowser {
  $h = [PdfgWin]::GetForegroundWindow(); $procId = [uint32]0
  [void][PdfgWin]::GetWindowThreadProcessId($h, [ref]$procId)
  $p = Get-Process -Id $procId -ErrorAction SilentlyContinue
  if ($p -and $p.ProcessName -ieq [IO.Path]::GetFileNameWithoutExtension($br.Path)) { return $h }
  return [IntPtr]::Zero
}
function Open-ExtensionsPage {
  $name = [IO.Path]::GetFileNameWithoutExtension($br.Path)
  Start-Process -FilePath $br.Path -ArgumentList '--new-window', $br.Page
  $ws = New-Object -ComObject WScript.Shell
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 500
    $h = Get-ForegroundBrowser
    if ($h -eq [IntPtr]::Zero) {
      # la ventana nueva puede no pasar al frente: se trae la mas reciente del navegador
      $w = Get-Process -Name $name -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero } | Sort-Object StartTime -Descending | Select-Object -First 1
      if ($w) { [void][PdfgWin]::SetForegroundWindow($w.MainWindowHandle) }
      continue
    }
    Start-Sleep -Milliseconds 800
    if ([PdfgWin]::Title($h) -match 'Extensi') { return $true }      # ya esta en la pagina de extensiones
    $ws.SendKeys('^t'); Start-Sleep -Milliseconds 400
    if ((Get-ForegroundBrowser) -eq [IntPtr]::Zero) { return $false }
    $ws.SendKeys($br.Page); Start-Sleep -Milliseconds 200; $ws.SendKeys('{ENTER}')
    return $true
  }
  return $false
}

# --- 3. Carga en el navegador ----------------------------------------------------
$profileDir = Find-Profile
if ($profileDir) {
  Say ''
  Say "[3/4] $($ext.Name) ya estaba cargada en $($br.Name): archivos actualizados." 'Green'
  Say '      Si estaba abierta, pulsa "Actualizar" en la pagina de extensiones o reinicia el navegador.'
} else {
  Set-Clipboard -Value $dest
  $opened = Open-ExtensionsPage
  Say ''
  if ($opened) { Say "[3/4] Se ha abierto $($br.Page) en $($br.Name). Haz esto:" 'Cyan' }
  else { Say "[3/4] Abre $($br.Name) y escribe $($br.Page) en la barra de direcciones. Despues:" 'Yellow' }
  Say ''
  Say '      1. Activa "Modo de desarrollador" (interruptor arriba a la derecha).' 'White'
  Say '      2. Pulsa "Cargar descomprimida" (o "Cargar sin empaquetar").' 'White'
  Say '      3. En la ventana de carpetas, pulsa Ctrl+V en la barra de direccion,' 'White'
  Say '         Intro, y despues "Seleccionar carpeta".' 'White'
  Say ''
  Say '      (La ruta ya esta copiada en el portapapeles.)' 'DarkGray'
  Say ''
  Write-Host '      Esperando a que la cargues' -NoNewline
  for ($t = 0; $t -lt 600 -and -not $profileDir; $t += 2) {
    Start-Sleep -Seconds 2; Write-Host '.' -NoNewline
    $profileDir = Find-Profile
  }
  Write-Host ''
  if (-not $profileDir) { Fail 'No la he detectado tras 10 minutos. Puedes cargarla igualmente con la ruta de arriba y volver a ejecutar este archivo para crear el acceso directo.' }
  Say "      Cargada en $($br.Name)." 'Green'
}

# --- 4. Acceso directo en el escritorio y abrir la extension ---------------------
if (-not $ext.Page) {
  Say ''
  Say "[4/4] $($ext.Name) no tiene pagina propia (app.html, index.html, ventana emergente u opciones): no se crea acceso directo." 'Yellow'
  Say '      Usala desde su icono en la barra del navegador.'
  Say ''; Start-Sleep -Seconds 4; exit 0
}
$url = "chrome-extension://$id/$($ext.Page)"
$args1 = "--profile-directory=""$profileDir"" --app=$url"
$s = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) "$safe.lnk"))
$s.TargetPath = $br.Path
$s.Arguments = $args1
$s.Description = $ext.Name
# icono: el PNG del manifest dentro de un .ico (Windows lo admite desde Vista)
if ($ext.Icon -and (Test-Path (Join-Path $dest $ext.Icon))) {
  $ico = Join-Path $env:LOCALAPPDATA "$safe\icono.ico"
  $png = [IO.File]::ReadAllBytes((Join-Path $dest $ext.Icon))
  $wh = [Math]::Min(256, [int]$png[19] + 256 * [int]$png[18])         # ancho del PNG (cabecera IHDR)
  $b = if ($wh -ge 256) { 0 } else { $wh }
  $head = [byte[]](0, 0, 1, 0, 1, 0, $b, $b, 0, 0, 1, 0, 32, 0) + [BitConverter]::GetBytes([uint32]$png.Length) + [BitConverter]::GetBytes([uint32]22)
  [IO.File]::WriteAllBytes($ico, [byte[]]($head + $png))
  $s.IconLocation = $ico
} else { $s.IconLocation = $br.Path }
$s.Save()
Say ''
Say "[4/4] Acceso directo ""$safe"" creado en el escritorio." 'Green'
Start-Process -FilePath $br.Path -ArgumentList $args1
Say ''
Say "  Listo. Para actualizar $($ext.Name), sustituye su carpeta y vuelve a ejecutar este archivo." 'White'
Say ''
Start-Sleep -Seconds 4
