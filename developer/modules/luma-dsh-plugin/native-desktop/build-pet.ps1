param([Parameter(Mandatory)][string] $OutputDirectory)
$ErrorActionPreference = 'Stop'
$compiler = Join-Path $env:SystemRoot 'Microsoft.NET\Framework\v4.0.30319\csc.exe'
$source = Join-Path $PSScriptRoot 'DesktopPet.cs'
$exe = Join-Path $OutputDirectory 'DesktopPet.exe'
$wpf = Join-Path (Split-Path $compiler) 'WPF'
& $compiler /nologo /codepage:65001 /target:exe /optimize+ /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Web.Extensions.dll /r:System.Xaml.dll "/r:$wpf\PresentationCore.dll" "/r:$wpf\WindowsBase.dll" "/out:$exe" $source
if ($LASTEXITCODE -ne 0) { throw "Desktop companion compilation failed: $LASTEXITCODE" }

# Framework csc predates /deterministic. Canonicalize the PE date and CLR module GUID.
# Reflection reads metadata only; the shipped unsigned helper has no signing data or PDB.
$bytes = [IO.File]::ReadAllBytes($exe)
$guid = [Reflection.Assembly]::ReflectionOnlyLoad($bytes).ManifestModule.ModuleVersionId.ToByteArray()
$pe = [BitConverter]::ToInt32($bytes, 0x3C)
if ([BitConverter]::ToUInt32($bytes, $pe) -ne 0x4550) { throw 'Invalid desktop companion executable' }
[Array]::Clear($bytes, $pe + 8, 4)
$offset = -1
for ($i = 0; $i -le $bytes.Length - $guid.Length; $i++) {
    if ($bytes[$i] -ne $guid[0]) { continue }
    $matchesGuid = $true
    for ($j = 1; $j -lt $guid.Length; $j++) {
        if ($bytes[$i + $j] -ne $guid[$j]) { $matchesGuid = $false; break }
    }
    if ($matchesGuid) {
        if ($offset -ge 0) { throw 'Duplicate module identity' }
        $offset = $i
    }
}
if ($offset -lt 0) { throw 'Missing module identity' }
[Array]::Clear($bytes, $offset, $guid.Length)
$hash = [Security.Cryptography.SHA256]::Create()
try { [Array]::Copy($hash.ComputeHash($bytes), 0, $bytes, $offset, $guid.Length) }
finally { $hash.Dispose() }
[IO.File]::WriteAllBytes($exe, $bytes)
