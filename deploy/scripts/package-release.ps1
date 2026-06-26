$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$outputDir = Join-Path $root "release"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$archive = Join-Path $outputDir "vidgen-$stamp.zip"
$staging = Join-Path $env:TEMP "vidgen-release-$stamp"

New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
New-Item -ItemType Directory -Force -Path $staging | Out-Null

$excludePatterns = @(
  "\\node_modules\\",
  "\\landing\\node_modules\\",
  "\\landing\\.next\\",
  "\\dist\\",
  "\\release\\",
  "\\.git\\",
  "\\.chrome",
  "\\.playwright",
  "\\.manual-chrome",
  "\\.env$",
  "\\.env\.local$",
  "\.log$"
)

$files = Get-ChildItem -LiteralPath $root -Recurse -File | Where-Object {
  $relative = $_.FullName.Substring($root.Path.Length)
  foreach ($pattern in $excludePatterns) {
    if ($relative -match $pattern) {
      return $false
    }
  }
  return $true
}

foreach ($file in $files) {
  $relative = $file.FullName.Substring($root.Path.Length).TrimStart("\", "/")
  $destination = Join-Path $staging $relative
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
  Copy-Item -LiteralPath $file.FullName -Destination $destination -Force
}

Compress-Archive -LiteralPath (Join-Path $staging "*") -DestinationPath $archive -Force
Remove-Item -LiteralPath $staging -Recurse -Force
Write-Host "Created release archive: $archive"
