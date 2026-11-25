param(
    [Parameter(Mandatory = $true, ParameterSetName='Full')][string]$Archive,
    [Parameter(Mandatory = $true, ParameterSetName='Update')][string]$Update,
    [Parameter(ParameterSetName='Update')][string]$Installer,
    [Parameter(Mandatory = $true)][string]$Package
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
function Read-FileSha256([string]$path) {
    $absolute = (Get-Item -LiteralPath $path).FullName
    $extended = if ($absolute.StartsWith('\\')) { '\\?\UNC\' + $absolute.Substring(2) } else { '\\?\' + $absolute }
    $stream = [IO.File]::OpenRead($extended)
    $hash = [Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($hash.ComputeHash($stream)).Replace('-','').ToLowerInvariant() }
    finally { $stream.Dispose(); $hash.Dispose() }
}
$root = (Get-Item -LiteralPath $Package).FullName
$version = (Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw -Encoding utf8 | ConvertFrom-Json).version
$prefix = "DesktopPlugin-$version/"
$files = @(Get-ChildItem -LiteralPath $root -Recurse -File)
$artifacts = [ordered]@{}
$assetCount = 0
if ($Update) {
    $delta = [IO.Compression.ZipFile]::OpenRead((Get-Item -LiteralPath $Update).FullName)
    $payloadHash = [Security.Cryptography.SHA256]::Create()
    try {
        $reader = [IO.StreamReader]::new($delta.GetEntry('update.json').Open(),[Text.Encoding]::UTF8)
        try { $manifest = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
        if ($manifest.schema -ne 1 -or $manifest.baseVersion -cne '0.4.3' -or $manifest.version -cne $version -or $manifest.files.Count -ne $files.Count) { throw 'Release metadata or number of files differs.' }
        $rows = [Collections.Generic.Dictionary[string,object]]::new([StringComparer]::Ordinal)
        $payloadCount = 0
        foreach ($row in $manifest.files) {
            $rows.Add($row.path,$row)
            if ($row.source -ceq 'base') { continue }
            if ($row.source -cne 'patch') { throw "Invalid file source: $($row.path)" }
            $entry = $delta.GetEntry('payload/' + $row.path)
            if (!$entry -or $entry.Length -ne $row.bytes) { throw "Payload missing or size differs: $($row.path)" }
            $stream = $entry.Open()
            try { $sha = [BitConverter]::ToString($payloadHash.ComputeHash($stream)).Replace('-','').ToLowerInvariant() }
            finally { $stream.Dispose() }
            if ($sha -cne $row.sha256) { throw "Payload SHA-256 differs: $($row.path)" }
            $payloadCount++
        }
        if ($delta.Entries.Count -ne 1 + $payloadCount) { throw 'Update ZIP has unexpected entries.' }
        foreach ($file in $files) {
            $key = $file.FullName.Substring($root.Length + 1).Replace('\','/')
            $row = $rows[$key]
            if (!$row -or $row.bytes -ne $file.Length) { throw "File differs: $key" }
            $sha = Read-FileSha256 $file.FullName
            if ($sha -cne $row.sha256) { throw "SHA-256 differs: $key" }
            if ($key.StartsWith('public/')) { $assetCount++ }
            if ($key -in 'native-desktop/client.mjs','native-desktop/server.mjs','cordis.patch.yml') { $artifacts[$key]=$sha }
        }
        $result = [ordered]@{version=$version;updateSha256=(Read-FileSha256 $Update);matchingFiles=$files.Count;matchingPublicAssets=$assetCount;verifiedPayloadFiles=$payloadCount;sha256=$artifacts}
        if ($Installer) {
            $bootstrap = [IO.Compression.ZipFile]::OpenRead((Get-Item -LiteralPath $Installer).FullName)
            try {
                $required = @('Install-Luma-DSH.cmd','Get-Luma-DSH.ps1','LICENSE.md','THIRD_PARTY_NOTICES.md','安装说明.txt')
                if ($bootstrap.Entries.Count -ne $required.Count) { throw 'Unexpected bootstrap contents.' }
                foreach ($name in $required) {
                    $entry = $bootstrap.GetEntry($name)
                    if (!$entry -or !$entry.Length) { throw "Bootstrap entry missing: $name" }
                    if ($name -in 'LICENSE.md','THIRD_PARTY_NOTICES.md') {
                        $stream = $entry.Open()
                        try { $sha = [BitConverter]::ToString($payloadHash.ComputeHash($stream)).Replace('-','').ToLowerInvariant() }
                        finally { $stream.Dispose() }
                        if ($sha -cne (Read-FileSha256 (Join-Path $root $name))) { throw "Bootstrap license differs: $name" }
                    }
                }
                $reader = [IO.StreamReader]::new($bootstrap.GetEntry('Get-Luma-DSH.ps1').Open(), [Text.Encoding]::UTF8)
                try { $script = $reader.ReadToEnd() } finally { $reader.Dispose() }
                if (!$script.Contains($result.updateSha256) -or !$script.Contains("Luma-DSH-$version-Update.zip") -or $script.Contains('@PATCH_SHA256@')) { throw 'Bootstrap does not pin this update.' }
                $result.installerSha256 = Read-FileSha256 $Installer
            } finally { $bootstrap.Dispose() }
        }
        $result | ConvertTo-Json
    } finally { $delta.Dispose(); $payloadHash.Dispose() }
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
        $actual = Read-FileSha256 $file.FullName
        if ($expected.ToLowerInvariant() -cne $actual) { throw "SHA-256 differs: $relative" }
        if ($relative.StartsWith('public/')) { $assetCount++ }
        if ($relative -in 'native-desktop/client.mjs','native-desktop/server.mjs','cordis.patch.yml') {
            $artifacts[$relative] = $actual.ToLowerInvariant()
        }
    }
    [ordered]@{
        version = $version
        referenceZipSha256 = (Read-FileSha256 $Archive)
        matchingFiles = $files.Count
        matchingPublicAssets = $assetCount
        sha256 = $artifacts
    } | ConvertTo-Json
} finally { $zip.Dispose(); $digest.Dispose() }
