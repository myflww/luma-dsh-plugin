param([string]$Directory = $PSScriptRoot)
$ErrorActionPreference = 'Stop'
$repository = 'myflww/luma-dsh-plugin'
$tag = 'v0.4.3'
$name = 'Luma-DSH-0.4.3-Windows.zip'
$expectedHash = 'e949d369a89da2bf6ce01c2eabef4b8a3a95ced38db5ab625ea90c2bb0549c81'
$expectedSize = 1872306881L
$folder = [IO.Directory]::CreateDirectory($Directory).FullName
$zip = Join-Path $folder $name
if (Test-Path -LiteralPath $zip) {
  if ((Get-FileHash -Algorithm SHA256 -LiteralPath $zip).Hash -ieq $expectedHash) { Write-Output $zip; return }
  throw "A different ZIP exists at $zip. Choose another -Directory."
}
$missing = @(1..56 | Where-Object { -not (Test-Path -LiteralPath (Join-Path $folder ('{0}.{1:D3}' -f $name,$_)) -PathType Leaf) })
if ($missing.Count) {
  if (!(Get-Command gh -ErrorAction SilentlyContinue)) {
    throw "Place all .001 through .056 release files in $folder, or install GitHub CLI, run gh auth login with access to the private repo, and run this script again."
  }
  & gh release download $tag --repo $repository --pattern "$name.???" --dir $folder --skip-existing
  if ($LASTEXITCODE -ne 0) { throw 'GitHub could not download all parts. Check access and run this script again to resume.' }
}
$temp = Join-Path $folder ('.luma-joining-' + [Guid]::NewGuid().ToString('N'))
try {
  $out = [IO.File]::Open($temp,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try {
    foreach ($index in 1..56) {
      $part = Join-Path $folder ('{0}.{1:D3}' -f $name,$index)
      $stream = [IO.File]::OpenRead($part)
      try { $stream.CopyTo($out) } finally { $stream.Dispose() }
    }
  } finally { $out.Dispose() }
  if ((Get-Item -LiteralPath $temp).Length -ne $expectedSize -or (Get-FileHash -Algorithm SHA256 -LiteralPath $temp).Hash -ine $expectedHash) {
    throw 'ZIP integrity check failed. Compare local parts with parts.json and download the affected part again.'
  }
  [IO.File]::Move($temp,$zip)
  Write-Output $zip
} finally { if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp } }
