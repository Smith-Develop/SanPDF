@echo off
rem ==========================================================================
rem  Instalador de extensiones para Windows (Chrome, Edge o Brave)
rem  - Instalar o actualizar: detecta las carpetas con manifest.json que hay
rem    junto a este archivo (pdf-g, incidencias-g...) y te deja elegir.
rem  - Eliminar: lista las extensiones instaladas y las quita del todo.
rem  Todas se guardan en %LOCALAPPDATA%\Extensiones\<nombre de la extension>
rem  Para anadir otra extension basta con copiar su carpeta junto a este archivo.
rem  Chrome no permite que un programa active el modo de desarrollador ni cargue
rem  o quite extensiones por si solo: esos clics los tienes que hacer tu.
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
# Un error detiene la operacion en curso; el menu lo muestra y deja volver a empezar
function Fail($text) { throw [System.OperationCanceledException]::new($text) }
function Pick($title, $items, $label) {
  Say $title 'Cyan'
  for ($i = 0; $i -lt $items.Count; $i++) { Say ("      {0}. {1}" -f ($i + 1), (& $label $items[$i])) }
  do { $n = Read-Host '      Escribe el numero y pulsa Intro' } until ($n -match '^\d+$' -and [int]$n -ge 1 -and [int]$n -le $items.Count)
  Say ''
  return $items[[int]$n - 1]
}

$root = Join-Path $env:LOCALAPPDATA 'Extensiones'
$here = $env:PDFG_DIR.TrimEnd('\')

# --- Lectura del manifest.json: nombre (tambien __MSG_...__), version, icono y pagina principal ---
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
  $icon = $null
  if ($m.icons) { $icon = $m.icons.PSObject.Properties | Sort-Object { [int]$_.Name } -Descending | Select-Object -First 1 | ForEach-Object { [string]$_.Value } }
  $page = $null
  foreach ($c in @('app.html', 'index.html', $m.action.default_popup, $m.browser_action.default_popup, $m.options_page, $m.options_ui.page)) {
    if ($c -and (Test-Path (Join-Path $dir $c))) { $page = ([string]$c).TrimStart('/'); break }
  }
  $safe = ($name -replace '[\\/:*?"<>|]', '').Trim(); if (-not $safe) { $safe = Split-Path $dir -Leaf }
  return @{ Dir = $dir; Name = $name.Trim(); Safe = $safe; Version = [string]$m.version; Icon = $icon; Page = $page }
}

# --- ID de una extension cargada sin empaquetar: SHA-256 de su ruta (UTF-16, unidad en mayuscula) ---
function Get-ExtId($path) {
  $p = $path; if ($p -match '^[a-zA-Z]:') { $p = $p.Substring(0, 1).ToUpper() + $p.Substring(1) }
  $h = [Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::Unicode.GetBytes($p))
  return -join ($h[0..15] | ForEach-Object { [char](97 + ($_ -shr 4)); [char](97 + ($_ -band 15)) })
}

# --- Navegadores instalados ---------------------------------------------------
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

# Perfil del navegador donde esta cargada la extension (Default, Profile 1...), o $null.
# Con -PathOnly solo cuenta la ruta (al quitarla, el ID puede seguir en otras preferencias).
function Find-Profile($br, $path, $id, [switch]$PathOnly) {
  if (-not (Test-Path $br.Data)) { return $null }
  $escaped = ($path -replace '\\', '\\')
  foreach ($d in Get-ChildItem -Path $br.Data -Directory -ErrorAction SilentlyContinue) {
    foreach ($name in @('Secure Preferences', 'Preferences')) {
      $p = Join-Path $d.FullName $name
      if (-not (Test-Path $p)) { continue }
      try { $txt = [IO.File]::ReadAllText($p) } catch { continue }
      if ($txt.IndexOf($escaped, [StringComparison]::OrdinalIgnoreCase) -ge 0) { return $d.Name }
      if (-not $PathOnly -and $txt.Contains("""$id""")) { return $d.Name }
    }
  }
  return $null
}

# --- Abrir la pagina de extensiones ------------------------------------------
# Chrome y Edge ignoran chrome:// y edge:// cuando se los pasa otro programa: si no se abre sola,
# se escribe en una pestana nueva (solo si la ventana activa es del navegador).
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
function Get-ForegroundBrowser($br) {
  $h = [PdfgWin]::GetForegroundWindow(); $procId = [uint32]0
  [void][PdfgWin]::GetWindowThreadProcessId($h, [ref]$procId)
  $p = Get-Process -Id $procId -ErrorAction SilentlyContinue
  if ($p -and $p.ProcessName -ieq [IO.Path]::GetFileNameWithoutExtension($br.Path)) { return $h }
  return [IntPtr]::Zero
}
function Open-ExtensionsPage($br) {
  $name = [IO.Path]::GetFileNameWithoutExtension($br.Path)
  Start-Process -FilePath $br.Path -ArgumentList '--new-window', $br.Page
  $ws = New-Object -ComObject WScript.Shell
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 500
    $h = Get-ForegroundBrowser $br
    if ($h -eq [IntPtr]::Zero) {
      $w = Get-Process -Name $name -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero } | Sort-Object StartTime -Descending | Select-Object -First 1
      if ($w) { [void][PdfgWin]::SetForegroundWindow($w.MainWindowHandle) }
      continue
    }
    Start-Sleep -Milliseconds 800
    if ([PdfgWin]::Title($h) -match 'Extensi') { return $true }
    $ws.SendKeys('^t'); Start-Sleep -Milliseconds 400
    if ((Get-ForegroundBrowser $br) -eq [IntPtr]::Zero) { return $false }
    $ws.SendKeys($br.Page); Start-Sleep -Milliseconds 200; $ws.SendKeys('{ENTER}')
    return $true
  }
  return $false
}

# Espera (hasta 10 minutos) a que la extension aparezca o desaparezca en el navegador.
# Pulsar cualquier tecla deja de esperar.
function Wait-For($br, $path, $id, [switch]$Gone) {
  Write-Host '      Esperando' -NoNewline
  for ($t = 0; $t -lt 600; $t += 2) {
    Start-Sleep -Seconds 2; Write-Host '.' -NoNewline
    $prof = if ($Gone) { Find-Profile $br $path $id -PathOnly } else { Find-Profile $br $path $id }
    if ($Gone -and -not $prof) { Write-Host ''; return $true }
    if (-not $Gone -and $prof) { Write-Host ''; return $prof }
    try { if ([Console]::KeyAvailable) { [void][Console]::ReadKey($true); Write-Host ''; return $null } } catch {}
  }
  Write-Host ''
  return $null
}

# Accesos directos del escritorio que abren esta extension
function Get-Shortcuts($id) {
  $ws = New-Object -ComObject WScript.Shell
  Get-ChildItem -Path ([Environment]::GetFolderPath('Desktop')) -Filter '*.lnk' -ErrorAction SilentlyContinue |
    Where-Object { try { $ws.CreateShortcut($_.FullName).Arguments -match "chrome-extension://$id/" } catch { $false } }
}

# =============================================================================
#  INSTALAR O ACTUALIZAR
# =============================================================================
function Install-Extension {
  $exts = @()
  foreach ($d in Get-ChildItem -Path $here -Directory | Sort-Object Name) {
    if (Test-Path (Join-Path $d.FullName 'manifest.json')) { $x = Read-Manifest $d.FullName; if ($x) { $exts += $x } }
  }
  if (-not $exts.Count -and (Test-Path (Join-Path $here 'manifest.json'))) { $exts += (Read-Manifest $here) }
  if (-not $exts.Count) { Fail 'No hay ninguna extension junto a este archivo: copia aqui la carpeta de la extension (la que tiene manifest.json).' }
  $ext = if ($exts.Count -gt 1) { Pick 'Que extension quieres instalar?' $exts { param($x) "{0}  v{1}   ({2})" -f $x.Name, $x.Version, (Split-Path $x.Dir -Leaf) } } else { $exts[0] }
  $Host.UI.RawUI.WindowTitle = "Instalar $($ext.Name)"

  # 1. Copia a %LOCALAPPDATA%\Extensiones\<nombre> (el icono del acceso directo y la marca se conservan)
  $dest = Join-Path $root $ext.Safe
  Say "[1/4] Copiando $($ext.Name) v$($ext.Version) a:" 'Cyan'
  Say "      $dest"
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  robocopy "$($ext.Dir)" "$dest" /MIR /XF acceso.ico instalado.json /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { Fail 'No se pudieron copiar los archivos de la extension.' }
  # marca para la extension: se instalo con este script (no hace falta su aviso de acceso directo)
  [IO.File]::WriteAllText((Join-Path $dest 'instalado.json'), '{"instalador":"cmd"}')
  $id = Get-ExtId $dest

  # Version anterior en la ruta antigua (%LOCALAPPDATA%\<nombre>\extension)
  $old = Join-Path $env:LOCALAPPDATA "$($ext.Safe)\extension"
  if (Test-Path (Join-Path $old 'manifest.json')) {
    Say ''
    Say "      Hay una instalacion anterior en $old." 'Yellow'
    Say '      Cuando termines, quitala con la opcion 2 (Eliminar) de este mismo archivo.' 'Yellow'
  }

  # 2. Navegador
  Say ''
  $br = if ($found.Count -gt 1) { Pick '[2/4] En que navegador quieres instalarla?' $found { param($b) $b.Name } } else { $found[0] }
  if ($found.Count -eq 1) { Say "[2/4] Navegador: $($br.Name)" 'Cyan' }

  # 3. Carga en el navegador
  $profileDir = Find-Profile $br $dest $id
  if ($profileDir) {
    Say ''
    Say "[3/4] $($ext.Name) ya estaba cargada en $($br.Name): archivos actualizados." 'Green'
    Say '      Si estaba abierta, pulsa "Actualizar" en la pagina de extensiones o reinicia el navegador.'
  } else {
    Set-Clipboard -Value $dest
    $opened = Open-ExtensionsPage $br
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
    $profileDir = Wait-For $br $dest $id
    if (-not $profileDir) { Fail 'No la he detectado. Puedes cargarla igualmente con la ruta de arriba y volver a ejecutar este archivo para crear el acceso directo.' }
    Say "      Cargada en $($br.Name)." 'Green'
  }

  # 4. Acceso directo en el escritorio y abrir la extension
  if (-not $ext.Page) {
    Say ''
    Say "[4/4] $($ext.Name) no tiene pagina propia (app.html, index.html, ventana emergente u opciones): no se crea acceso directo." 'Yellow'
    Say '      Usala desde su icono en la barra del navegador.'
    return
  }
  $args1 = "--profile-directory=""$profileDir"" --app=chrome-extension://$id/$($ext.Page)"
  $lnk = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) "$($ext.Safe).lnk"))
  $lnk.TargetPath = $br.Path
  $lnk.Arguments = $args1
  $lnk.Description = $ext.Name
  if ($ext.Icon -and (Test-Path (Join-Path $dest $ext.Icon))) {
    # el PNG del manifest dentro de un .ico (Windows lo admite desde Vista)
    $ico = Join-Path $dest 'acceso.ico'
    $png = [IO.File]::ReadAllBytes((Join-Path $dest $ext.Icon))
    $wh = [Math]::Min(256, [int]$png[19] + 256 * [int]$png[18])
    $b = if ($wh -ge 256) { 0 } else { $wh }
    $head = [byte[]](0, 0, 1, 0, 1, 0, $b, $b, 0, 0, 1, 0, 32, 0) + [BitConverter]::GetBytes([uint32]$png.Length) + [BitConverter]::GetBytes([uint32]22)
    [IO.File]::WriteAllBytes($ico, [byte[]]($head + $png))
    $lnk.IconLocation = $ico
  } else { $lnk.IconLocation = $br.Path }
  $lnk.Save()
  Say ''
  Say "[4/4] Acceso directo ""$($ext.Safe)"" creado en el escritorio." 'Green'
  Start-Process -FilePath $br.Path -ArgumentList $args1
  Say ''
  Say "  Listo. Para actualizar $($ext.Name), sustituye su carpeta y vuelve a ejecutar este archivo." 'White'
}

# =============================================================================
#  ELIMINAR
# =============================================================================
function Get-Installed {
  $list = @()
  if (Test-Path $root) {
    foreach ($d in Get-ChildItem -Path $root -Directory) {
      if (Test-Path (Join-Path $d.FullName 'manifest.json')) { $x = Read-Manifest $d.FullName; if ($x) { $x.Remove = $d.FullName; $x.Legacy = $false; $list += $x } }
    }
  }
  # instalaciones antiguas: %LOCALAPPDATA%\<nombre>\extension con la marca del instalador
  foreach ($d in Get-ChildItem -Path $env:LOCALAPPDATA -Directory -ErrorAction SilentlyContinue) {
    $e = Join-Path $d.FullName 'extension'
    if ((Test-Path (Join-Path $e 'manifest.json')) -and ((Test-Path (Join-Path $e 'instalado.json')) -or (Test-Path (Join-Path $d.FullName 'pdfg.ico')))) {
      $x = Read-Manifest $e; if ($x) { $x.Remove = $d.FullName; $x.Legacy = $true; $list += $x }
    }
  }
  return $list
}
function Uninstall-Extension($installed) {
  $ext = Pick 'Que extension quieres eliminar?' $installed { param($x) "{0}  v{1}   ({2})" -f $x.Name, $x.Version, $(if ($x.Legacy) { "ruta antigua: $($x.Dir)" } else { $x.Dir }) }
  $Host.UI.RawUI.WindowTitle = "Eliminar $($ext.Name)"
  $id = Get-ExtId $ext.Dir

  # 1. Quitarla de los navegadores donde este cargada
  $loaded = @($found | Where-Object { Find-Profile $_ $ext.Dir $id -PathOnly })
  if (-not $loaded.Count) { Say "[1/2] $($ext.Name) no esta cargada en ningun navegador." 'Cyan' }
  foreach ($br in $loaded) {
    $opened = Open-ExtensionsPage $br
    Say ''
    if ($opened) { Say "[1/2] Se ha abierto $($br.Page) en $($br.Name)." 'Cyan' }
    else { Say "[1/2] Abre $($br.Name) y escribe $($br.Page) en la barra de direcciones." 'Yellow' }
    Say "      Busca ""$($ext.Name)"" y pulsa ""Quitar"" (y confirma)." 'White'
    Say '      (Si ya no quieres esperar, pulsa cualquier tecla y se borrara igualmente.)' 'DarkGray'
    Say ''
    if (Wait-For $br $ext.Dir $id -Gone) { Say "      Quitada de $($br.Name)." 'Green' }
    else { Say "      Sigue en $($br.Name): quitala a mano desde $($br.Page)." 'Yellow' }
  }

  # 2. Borrar los archivos y el acceso directo
  Say ''
  Say '[2/2] Borrando archivos y acceso directo...' 'Cyan'
  foreach ($l in @(Get-Shortcuts $id)) { Remove-Item -LiteralPath $l.FullName -Force; Say "      Acceso directo borrado: $($l.Name)" }
  try { Remove-Item -LiteralPath $ext.Remove -Recurse -Force; Say "      Carpeta borrada: $($ext.Remove)" }
  catch { Say "      No se pudo borrar $($ext.Remove) (cierra el navegador y vuelve a intentarlo)." 'Yellow' }
  if ((Test-Path $root) -and -not (Get-ChildItem -Path $root -Force)) { Remove-Item -LiteralPath $root -Force }
  Say ''
  Say "  $($ext.Name) eliminada." 'White'
}

# =============================================================================
#  MENU (se repite hasta que eliges cerrar)
# =============================================================================
$first = $true
while ($true) {
  $Host.UI.RawUI.WindowTitle = 'Instalar extensiones'
  if (-not $first) { Clear-Host }
  Say ''
  Say '  Instalador de extensiones' 'White'
  Say '  =========================' 'DarkGray'
  Say "  Carpeta de instalacion: $root" 'DarkGray'
  Say ''
  $installed = @(Get-Installed)
  if ($first -and -not $installed.Count) { $op = '1' }
  else {
    Say 'Que quieres hacer?' 'Cyan'
    Say '      1. Instalar o actualizar una extension'
    if ($installed.Count) { Say ("      2. Eliminar una extension instalada ({0})" -f (($installed | ForEach-Object { $_.Name }) -join ', ')) }
    Say '      0. Cerrar'
    $valid = if ($installed.Count) { @('0', '1', '2') } else { @('0', '1') }
    do { $op = Read-Host '      Escribe el numero y pulsa Intro' } until ($op -in $valid)
    Say ''
  }
  $first = $false
  if ($op -eq '0') { break }
  try { if ($op -eq '2') { Uninstall-Extension $installed } else { Install-Extension } }
  catch [System.OperationCanceledException] { Say ''; Say $_.Exception.Message 'Red' }
  catch { Say ''; Say "Error inesperado: $($_.Exception.Message)" 'Red' }
  Say ''
  Say 'Y ahora?' 'Cyan'
  Say '      1. Volver al menu principal'
  Say '      2. Cerrar'
  do { $next = Read-Host '      Escribe el numero y pulsa Intro' } until ($next -in @('1', '2'))
  if ($next -eq '2') { break }
}
