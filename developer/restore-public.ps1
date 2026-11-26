param([Parameter(Mandatory = $true)][string]$Archive)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
function Get-ExtendedPath([string]$Path) {
    if ($Path.StartsWith('\\')) { return '\\?\UNC\' + $Path.Substring(2) }
    return '\\?\' + $Path
}
$pluginPath = Join-Path $PSScriptRoot 'modules/luma-dsh-plugin'
$assets = Get-Content -LiteralPath (Join-Path $pluginPath 'lib/asset-manifest.json') -Raw -Encoding utf8 | ConvertFrom-Json
$version = (Get-Content -LiteralPath (Join-Path $pluginPath 'native-desktop/manifest.json') -Raw -Encoding utf8 | ConvertFrom-Json).version
$assetSourceVersions = @($version, '0.6.3', '0.6.2', '0.6.1', '0.6.0', '0.5.4', '0.5.3', '0.5.2', '0.5.1', '0.5.0', '0.4.3')
$newArt = [IO.Path]::Combine($pluginPath, 'art', 'release-assets')
$listed = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
foreach ($row in $assets) { if (!$listed.Add([string]$row.path)) { throw "Duplicate asset: $($row.path)" } }
if ([IO.Directory]::Exists($newArt)) {
    foreach ($file in [IO.Directory]::EnumerateFiles($newArt, '*', [IO.SearchOption]::AllDirectories)) {
        $relative = $file.Substring($newArt.Length + 1).Replace('\','/')
        if (!$listed.Contains($relative)) { throw "Release art is missing from asset-manifest.json: $relative" }
    }
}
$publicPath = [IO.Path]::GetFullPath((Join-Path $pluginPath 'public'))
$targetRoot = [IO.Directory]::CreateDirectory($publicPath).FullName + [IO.Path]::DirectorySeparatorChar
$source = Get-Item -LiteralPath $Archive
$archiveFile = $null
if ($source.PSIsContainer) {
    $sourceManifest = Get-Content -LiteralPath (Join-Path $source.FullName 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($sourceManifest.name -cne '@luma/dsh-plugin' -or $sourceManifest.version -cnotin $assetSourceVersions) { throw "Expected a full Luma release directory: $($assetSourceVersions -join ', ')." }
} else { $archiveFile = [IO.Compression.ZipFile]::OpenRead($source.FullName) }
$hash = [Security.Cryptography.SHA256]::Create()
try {
    $entries = [Collections.Generic.Dictionary[string,IO.Compression.ZipArchiveEntry]]::new([StringComparer]::Ordinal)
    if ($archiveFile) {
        $prefix = $null
        foreach ($candidateVersion in $assetSourceVersions) {
            $packageEntry = $archiveFile.GetEntry("DesktopPlugin-$candidateVersion/package.json")
            if (!$packageEntry) { continue }
            $reader = [IO.StreamReader]::new($packageEntry.Open(), [Text.Encoding]::UTF8)
            try { $package = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
            if ($package.name -ceq '@luma/dsh-plugin' -and $package.version -ceq $candidateVersion) {
                $prefix = "DesktopPlugin-$candidateVersion/public/"
                break
            }
        }
        if (!$prefix) { throw "Expected a full Luma release ZIP: $($assetSourceVersions -join ', ')." }
        foreach ($entry in $archiveFile.Entries) {
            if ($entry.FullName.StartsWith($prefix, [StringComparison]::Ordinal) -and $entry.Name) {
                $entries.Add($entry.FullName.Substring($prefix.Length), $entry)
            }
        }
    }
    foreach ($asset in $assets) {
        $key = [string]$asset.path
        $target = [IO.Path]::GetFullPath((Join-Path $publicPath $key))
        if (!$target.StartsWith($targetRoot, [StringComparison]::OrdinalIgnoreCase)) { throw "Invalid asset: $key" }
        $replacement = Get-ExtendedPath ([IO.Path]::Combine($newArt, $key.Replace('/','\')))
        $hasReplacement = [IO.File]::Exists($replacement)
        if ($archiveFile -and !$hasReplacement) {
            $entry = $entries[$key]
            if (!$entry -or $entry.Length -ne $asset.bytes) { throw "Unexpected size: $key" }
        }
        [IO.Directory]::CreateDirectory((Get-ExtendedPath ([IO.Path]::GetDirectoryName($target)))) | Out-Null
        $target = Get-ExtendedPath $target
        $temp = Get-ExtendedPath ([IO.Path]::Combine($publicPath, '.restore-' + [Guid]::NewGuid().ToString('N')))
        try {
            if ($hasReplacement) { [IO.File]::Copy($replacement,$temp) }
            elseif ($archiveFile) { [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $temp, $false) }
            else {
                $origin = Get-ExtendedPath ([IO.Path]::Combine($source.FullName, 'public', $key.Replace('/','\')))
                if ([IO.FileInfo]::new($origin).Length -ne $asset.bytes) { throw "Unexpected size: $key" }
                [IO.File]::Copy($origin, $temp)
            }
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
    if ($archiveFile) { $archiveFile.Dispose() }
}
