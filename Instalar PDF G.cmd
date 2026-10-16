@echo off
rem ==========================================================================
rem  PDF G - instalador para Windows (Chrome, Edge o Brave)
rem  1. Copia la extension a %LOCALAPPDATA%\PDF G\extension
rem  2. Abre la pagina de extensiones del navegador con la ruta en el portapapeles
rem  3. Espera a que la cargues (Modo de desarrollador > Cargar descomprimida)
rem  4. Crea el acceso directo en el escritorio y abre PDF G
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
$Host.UI.RawUI.WindowTitle = 'Instalar PDF G'
function Say($text, $color = 'Gray') { Write-Host $text -ForegroundColor $color }
function Fail($text) { Say ''; Say $text 'Red'; Read-Host 'Pulsa Intro para salir' | Out-Null; exit 1 }

Say ''
Say '  PDF G  -  instalador' 'White'
Say '  ====================' 'DarkGray'
Say ''

# --- 1. Carpeta de la extension (pdf-g junto a este archivo) -----------------
$here = $env:PDFG_DIR.TrimEnd('\')
$src = $null
foreach ($c in @((Join-Path $here 'pdf-g'), $here)) { if (Test-Path (Join-Path $c 'manifest.json')) { $src = $c; break } }
if (-not $src) { Fail 'No encuentro la carpeta "pdf-g" junto a este archivo. Descomprime el ZIP completo y vuelve a ejecutarlo.' }

$dest = Join-Path $env:LOCALAPPDATA 'PDF G\extension'
Say '[1/4] Copiando la extension a:' 'Cyan'
Say "      $dest"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
robocopy "$src" "$dest" /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { Fail 'No se pudieron copiar los archivos de la extension.' }

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

# --- 3. Carga en el navegador ----------------------------------------------------
$profileDir = Find-Profile
if ($profileDir) {
  Say ''
  Say "[3/4] PDF G ya estaba cargada en $($br.Name): archivos actualizados." 'Green'
  Say '      Si estaba abierta, pulsa "Actualizar" en la pagina de extensiones o reinicia el navegador.'
} else {
  Set-Clipboard -Value $dest
  Start-Process -FilePath $br.Path -ArgumentList $br.Page
  Say ''
  Say "[3/4] Se ha abierto la pagina de extensiones de $($br.Name). Haz esto:" 'Cyan'
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

# --- 4. Acceso directo en el escritorio y abrir PDF G --------------------------
$url = "chrome-extension://$id/app.html"
$args1 = "--profile-directory=""$profileDir"" --app=$url"
$ico = Join-Path $env:LOCALAPPDATA 'PDF G\pdfg.ico'
$png = [IO.File]::ReadAllBytes((Join-Path $dest 'icons\128.png'))
$head = [byte[]](0, 0, 1, 0, 1, 0, 128, 128, 0, 0, 1, 0, 32, 0) + [BitConverter]::GetBytes([uint32]$png.Length) + [BitConverter]::GetBytes([uint32]22)
[IO.File]::WriteAllBytes($ico, [byte[]]($head + $png))
$lnk = Join-Path ([Environment]::GetFolderPath('Desktop')) 'PDF G.lnk'
$s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
$s.TargetPath = $br.Path
$s.Arguments = $args1
$s.IconLocation = $ico
$s.Description = 'PDF G: convierte, edita y firma PDF'
$s.Save()
Say ''
Say '[4/4] Acceso directo "PDF G" creado en el escritorio.' 'Green'
Start-Process -FilePath $br.Path -ArgumentList $args1
Say ''
Say '  Listo. Para actualizar PDF G en el futuro, vuelve a ejecutar este archivo.' 'White'
Say ''
Start-Sleep -Seconds 4
