param(
    [Parameter(Mandatory = $true, ParameterSetName='Full')][string]$Archive,
    [Parameter(Mandatory = $true, ParameterSetName='Update')][string]$Update,
    [Parameter(Mandatory = $true)][string]$Package
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root = (Get-Item -LiteralPath $Package).FullName
$version = (Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw -Encoding utf8 | ConvertFrom-Json).version
$prefix = "DesktopPlugin-$version/"
$files = @(Get-ChildItem -LiteralPath $root -Recurse -File)
$artifacts = [ordered]@{}
$assetCount = 0
if ($Update) {
    $delta = [IO.Compression.ZipFile]::OpenRead((Get-Item -LiteralPath $Update).FullName)
    try {
        $reader = [IO.StreamReader]::new($delta.GetEntry('update.json').Open(),[Text.Encoding]::UTF8)
        try { $manifest = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
        if ($manifest.version -cne $version -or $manifest.files.Count -ne $files.Count) { throw 'Release version or total number of files differs.' }
        $rows = [Collections.Generic.Dictionary[string,object]]::new([StringComparer]::Ordinal)
        foreach ($row in $manifest.files) { $rows.Add($row.path,$row) }
        foreach ($file in $files) {
            $key = $file.FullName.Substring($root.Length + 1).Replace('\','/')
            $row = $rows[$key]
            if (!$row -or $row.bytes -ne $file.Length) { throw "File differs: $key" }
            $sha = (Get-FileHash -Algorithm SHA256 -LiteralPath $file.FullName).Hash.ToLowerInvariant()
            if ($sha -cne $row.sha256) { throw "SHA-256 differs: $key" }
            if ($key.StartsWith('public/')) { $assetCount++ }
            if ($key -in 'native-desktop/client.mjs','native-desktop/server.mjs','cordis.patch.yml') { $artifacts[$key]=$sha }
        }
        [ordered]@{version=$version;updateSha256=(Get-FileHash -Algorithm SHA256 -LiteralPath $Update).Hash.ToLowerInvariant();matchingFiles=$files.Count;matchingPublicAssets=$assetCount;sha256=$artifacts} | ConvertTo-Json
    } finally { $delta.Dispose() }
    return
}
$digest = [Security.Cryptography.SHA256]::Create()
$zip = [IO.Compression.ZipFile]::OpenRead((Get-Item -LiteralPath $Archive).FullName)
try {
    $entries = [Collections.Generic.Dictionary[string,IO.Compression.ZipArchiveEntry]]::new([StringComparer]::Ordinal)
    foreach ($entry in $zip.Entries) {
        if ($entry.Name -and $entry.FullName.StartsWith($prefix, [StringComparison]::Ordinal)) {
            $entries.Add($entry.FullName.Substring($prefix.Length),$entry)
        }
    }
    if ($entries.Count -ne $files.Count) { throw "ZIP and rebuilt directory have different file counts." }
    foreach ($file in $files) {
        $relative = $file.FullName.Substring($root.Length + 1).Replace('\','/')
        if (!$entries.ContainsKey($relative) -or $entries[$relative].Length -ne $file.Length) { throw "File differs: $relative" }
        $stream = $entries[$relative].Open()
        try { $expected = [BitConverter]::ToString($digest.ComputeHash($stream)).Replace('-','') }
        finally { $stream.Dispose() }
        $actual = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
        if ($expected -cne $actual) { throw "SHA-256 differs: $relative" }
        if ($relative.StartsWith('public/')) { $assetCount++ }
        if ($relative -in 'native-desktop/client.mjs','native-desktop/server.mjs','cordis.patch.yml') {
            $artifacts[$relative] = $actual.ToLowerInvariant()
        }
    }
    [ordered]@{
        version = $version
        referenceZipSha256 = (Get-FileHash -LiteralPath $Archive -Algorithm SHA256).Hash.ToLowerInvariant()
        matchingFiles = $files.Count
        matchingPublicAssets = $assetCount
        sha256 = $artifacts
    } | ConvertTo-Json
} finally { $zip.Dispose(); $digest.Dispose() }
