param([Parameter(Mandatory = $true)][string]$Archive)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
function Get-ExtendedPath([string]$Path) {
    if ($Path.StartsWith('\\')) { return '\\?\UNC\' + $Path.Substring(2) }
    return '\\?\' + $Path
}
$pluginPath = Join-Path $PSScriptRoot 'modules/luma-dsh-plugin'
$assets = Get-Content -LiteralPath (Join-Path $pluginPath 'lib/asset-manifest.json') -Raw -Encoding utf8 | ConvertFrom-Json
$version = (Get-Content -LiteralPath (Join-Path $pluginPath 'native-desktop/manifest.json') -Raw -Encoding utf8 | ConvertFrom-Json).version
$publicPath = [IO.Path]::GetFullPath((Join-Path $pluginPath 'public'))
$targetRoot = [IO.Directory]::CreateDirectory($publicPath).FullName + [IO.Path]::DirectorySeparatorChar
$archiveFile = [IO.Compression.ZipFile]::OpenRead((Get-Item -LiteralPath $Archive).FullName)
$hash = [Security.Cryptography.SHA256]::Create()
try {
    $entries = [Collections.Generic.Dictionary[string,IO.Compression.ZipArchiveEntry]]::new([StringComparer]::Ordinal)
    $prefix = "DesktopPlugin-$version/public/"
    foreach ($entry in $archiveFile.Entries) {
        if ($entry.FullName.StartsWith($prefix, [StringComparison]::Ordinal) -and $entry.Name) {
            $entries.Add($entry.FullName.Substring($prefix.Length), $entry)
        }
    }
    if ($entries.Count -ne $assets.Count) { throw "Expected $($assets.Count) public files below $prefix. Found $($entries.Count)." }
    foreach ($asset in $assets) {
        $key = [string]$asset.path
        $target = [IO.Path]::GetFullPath((Join-Path $publicPath $key))
        if (!$target.StartsWith($targetRoot, [StringComparison]::OrdinalIgnoreCase) -or !$entries.ContainsKey($key)) { throw "Missing or invalid asset: $key" }
        $entry = $entries[$key]
        if ($entry.Length -ne $asset.bytes) { throw "Unexpected size: $key" }
        [IO.Directory]::CreateDirectory((Get-ExtendedPath ([IO.Path]::GetDirectoryName($target)))) | Out-Null
        $target = Get-ExtendedPath $target
        $temp = Get-ExtendedPath ([IO.Path]::Combine($publicPath, '.restore-' + [Guid]::NewGuid().ToString('N')))
        try {
            [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $temp, $false)
            $stream = [IO.File]::OpenRead($temp)
            try { $actual = [BitConverter]::ToString($hash.ComputeHash($stream)).Replace('-','').ToLowerInvariant() }
            finally { $stream.Dispose() }
            if ($actual -cne $asset.sha256) { throw "Unexpected SHA-256: $key" }
            if ([IO.File]::Exists($target)) {
                $backup = $temp + '.previous'
                [IO.File]::Replace($temp, $target, $backup)
                [IO.File]::Delete($backup)
            }
            else { [IO.File]::Move($temp, $target) }
        } finally {
            if ([IO.File]::Exists($temp)) { [IO.File]::Delete($temp) }
        }
    }
    Write-Output "Verified and restored $($assets.Count) public assets."
} finally {
    $hash.Dispose()
    $archiveFile.Dispose()
}
