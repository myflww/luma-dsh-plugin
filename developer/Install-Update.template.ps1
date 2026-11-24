[CmdletBinding()]
param(
    [string]$Directory = (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Luma-DSH'),
    [string]$Base,
    [string]$Patch,
    [switch]$PrepareOnly,
    [switch]$Rollback,
    [string]$DshCli
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$repo = 'myflww/luma-dsh-plugin'
$patchName = 'Luma-DSH-@VERSION@-Update.zip'
$patchDigest = '@PATCH_SHA256@'
$compatibleBaseVersions = @('0.5.4','0.5.3','0.5.2','0.5.1','0.5.0','0.4.3')
$oldZip = 'Luma-DSH-0.4.3-Windows.zip'
$oldDigest = 'e949d369a89da2bf6ce01c2eabef4b8a3a95ced38db5ab625ea90c2bb0549c81'
$root = [IO.Directory]::CreateDirectory([IO.Path]::GetFullPath($Directory)).FullName
$final = Join-Path $root 'DesktopPlugin-@VERSION@'
$cache = Join-Path $root 'Downloads'
function Extended([string]$absolute) {
    if ($absolute.StartsWith('\\')) { return '\\?\UNC\' + $absolute.Substring(2) }
    return '\\?\' + $absolute
}
function Hash-File([string]$file) {
    $stream = [IO.File]::OpenRead((Extended $file))
    $hash = [Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($hash.ComputeHash($stream)).Replace('-','').ToLowerInvariant() }
    finally { $hash.Dispose(); $stream.Dispose() }
}
function Get-ReleaseAsset([string]$tag, [string]$name, [string]$destination) {
    [IO.Directory]::CreateDirectory($destination) | Out-Null
    $target = Join-Path $destination $name
    $temporary = $target + '.' + [guid]::NewGuid().ToString('N') + '.partial'
    $backup = $temporary + '.previous'
    $url = 'https://github.com/' + $repo + '/releases/download/' + [Uri]::EscapeDataString($tag) + '/' + [Uri]::EscapeDataString($name)
    try {
        for ($attempt = 1; $attempt -le 3; $attempt++) {
            try {
                Write-Host "正在下载 $tag / $name"
                Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $temporary -ErrorAction Stop
                if ([IO.File]::Exists($target)) { [IO.File]::Replace($temporary, $target, $backup) }
                else { [IO.File]::Move($temporary, $target) }
                return
            } catch {
                if ($attempt -eq 3) { throw }
                Start-Sleep -Seconds (2 * $attempt)
            }
        }
    } finally {
        if ([IO.File]::Exists($temporary)) { [IO.File]::Delete($temporary) }
        if ([IO.File]::Exists($backup)) { [IO.File]::Delete($backup) }
    }
}
function Test-BaseFolder([string]$path, $files) {
    $descriptor = Join-Path $path 'package.json'
    if (![IO.File]::Exists($descriptor)) { return $false }
    try { $package = Get-Content -LiteralPath $descriptor -Raw -Encoding UTF8 | ConvertFrom-Json } catch { return $false }
    if ($package.name -cne '@luma/dsh-plugin' -or $package.version -cnotin $compatibleBaseVersions) { return $false }
    foreach ($row in $files) {
        if ($row.source -ne 'base') { continue }
        $item = [IO.FileInfo]::new((Extended ([IO.Path]::Combine($path, $row.path.Replace('/','\')))))
        if (!$item.Exists -or $item.Length -ne $row.bytes) { return $false }
    }
    return $true
}
function Get-BasePackage($files) {
    if ($Base) { return (Get-Item -LiteralPath $Base).FullName }
    foreach ($directory in @($root, $PSScriptRoot, $cache)) {
        foreach ($name in (@($compatibleBaseVersions | ForEach-Object { "DesktopPlugin-$_" }) + $oldZip)) {
            $candidate = Join-Path $directory $name
            if ([IO.Directory]::Exists($candidate) -and (Test-BaseFolder $candidate $files)) { return $candidate }
            if ($name -eq $oldZip -and [IO.File]::Exists($candidate)) { return $candidate }
        }
    }
    $oldCache = Join-Path $cache 'v0.4.3'
    [IO.Directory]::CreateDirectory($oldCache) | Out-Null
    $joined = Join-Path $oldCache $oldZip
    $lock = [IO.File]::Open((Join-Path $oldCache 'download.lock'), 'OpenOrCreate', 'Write', 'None')
    $partial = $null
    try {
        if ([IO.File]::Exists($joined) -and (Hash-File $joined) -ceq $oldDigest) { return $joined }
        $index = Join-Path $oldCache 'parts.json'
        if (!(Test-Path -LiteralPath $index) -or (Hash-File $index) -cne '14ceb1d555eb59546105f3b34601743f080ff1822a8cb11d53ba71c7d1e0cc35') { Get-ReleaseAsset 'v0.4.3' 'parts.json' $oldCache }
        if ((Hash-File $index) -cne '14ceb1d555eb59546105f3b34601743f080ff1822a8cb11d53ba71c7d1e0cc35') { throw "基础包分卷清单校验失败：$index" }
        $parts = (Get-Content -LiteralPath $index -Raw -Encoding UTF8 | ConvertFrom-Json).parts
        $partial = Join-Path $oldCache ('.joining-' + [guid]::NewGuid().ToString('N'))
        $output = [IO.File]::Open($partial,'CreateNew','Write','None')
        try {
            foreach ($part in $parts) {
                $path = Join-Path $oldCache $part.name
                $partInfo = [IO.FileInfo]::new($path)
                if (!$partInfo.Exists -or $partInfo.Length -ne $part.size -or (Hash-File $path) -cne $part.sha256) {
                    Write-Host "正在补齐分卷 $($part.name)"
                    Get-ReleaseAsset 'v0.4.3' $part.name $oldCache
                    if ((Hash-File $path) -cne $part.sha256) { throw "分卷校验失败，请重试：$($part.name)" }
                }
                $stream = [IO.File]::OpenRead($path)
                try { $stream.CopyTo($output) } finally { $stream.Dispose() }
            }
        } finally { $output.Dispose() }
        if ((Hash-File $partial) -cne $oldDigest) { throw '合并后的 0.4.3 ZIP 校验失败。' }
        if ([IO.File]::Exists($joined)) {
            $stale = $partial + '.old'
            [IO.File]::Replace($partial,$joined,$stale)
            [IO.File]::Delete($stale)
        }
        else { [IO.File]::Move($partial,$joined) }
        return $joined
    } finally {
        $lock.Dispose()
        if ($partial -and [IO.File]::Exists($partial)) { [IO.File]::Delete($partial) }
    }
}
function Check-File([string]$path, $row) {
    $item = [IO.FileInfo]::new((Extended $path))
    if (!$item.Exists -or $item.Length -ne $row.bytes -or (Hash-File $path) -cne $row.sha256) { throw "文件大小或 SHA-256 校验失败：$($row.path)。可通过 -Base 指定原版 ZIP 后重试。" }
}
function Register-Plugin([string]$packagePath) {
    if ($PrepareOnly) { return }
    $cli = $DshCli
    if (!$cli) {
        $shortcuts = @((Join-Path ([Environment]::GetFolderPath('Desktop')) 'DeepSeek Harness.lnk'),
            (Join-Path ([Environment]::GetFolderPath('CommonDesktopDirectory')) 'DeepSeek Harness.lnk'))
        foreach ($shortcut in $shortcuts) {
            if (Test-Path -LiteralPath $shortcut -PathType Leaf) {
                $exe = (New-Object -ComObject WScript.Shell).CreateShortcut($shortcut).TargetPath
                if ($exe -and [IO.Path]::GetFileName($exe) -ieq 'DeepSeek Harness.exe') {
                    $candidate = Join-Path ([IO.Path]::GetDirectoryName($exe)) 'resources\runtime\cli\bin\dsh.cmd'
                    if (Test-Path -LiteralPath $candidate -PathType Leaf) { $cli = $candidate; break }
                }
            }
        }
    }
    if (!$cli) { throw "请在 DSH 插件页添加 $packagePath，或使用 -DshCli 参数指定桌面安装目录中的 resources\runtime\cli\bin\dsh.cmd。" }
    $version = (& $cli --version | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or !$version) { throw "DSH CLI 无法启动。可从桌面插件页添加目录 $packagePath。" }
    Write-Host "正在使用当前 DeepSeek Harness CLI ($version) 安装 Luma。"
    & $cli plugin --profile desktop add $packagePath
    if ($LASTEXITCODE -ne 0) { throw "DSH 未完成安装。首次使用请先打开一次 DSH 桌面客户端，再重试安装器，也可从插件页添加目录 $packagePath。" }
    Write-Host '已添加到桌面 DSH。重新打开 DSH 后，从侧栏进入 Luma 办公室。'
}
if ($Rollback) {
    if ($PrepareOnly -or $Patch) { throw '回退模式只重新注册指定的旧版本目录。请移除 -PrepareOnly 和 -Patch。' }
    $previous = if ($Base) { (Get-Item -LiteralPath $Base).FullName } else { Join-Path $root 'DesktopPlugin-0.5.4' }
    $requiredFiles = @('cordis.patch.yml','native-desktop\server.mjs','native-desktop\client.mjs')
    $missing = @($requiredFiles | Where-Object { !(Test-Path -LiteralPath (Join-Path $previous $_) -PathType Leaf) })
    if (!(Test-BaseFolder $previous @()) -or $missing.Count -or !(Test-Path -LiteralPath (Join-Path $previous 'public') -PathType Container)) {
        throw '没有找到完整的旧版 Luma 插件。请使用 -Base 指定保留的旧版插件目录。'
    }
    Write-Host "正在恢复旧版插件目录：$previous"
    Register-Plugin $previous
    return
}
if (!$Patch) {
    $Patch = Join-Path $PSScriptRoot $patchName
    if (!(Test-Path -LiteralPath $Patch -PathType Leaf)) {
        $Patch = Join-Path $cache $patchName
        if (!(Test-Path -LiteralPath $Patch -PathType Leaf) -or (Hash-File $Patch) -cne $patchDigest) { Get-ReleaseAsset 'v@VERSION@' $patchName $cache }
    }
}
$Patch = (Get-Item -LiteralPath $Patch).FullName
if ((Hash-File $Patch) -cne $patchDigest) { throw "@VERSION@ 更新包 SHA-256 校验失败：$Patch" }
$delta = [IO.Compression.ZipFile]::OpenRead($Patch)
$archive = $null
$stage = $null
try {
    $reader = [IO.StreamReader]::new($delta.GetEntry('update.json').Open(), [Text.Encoding]::UTF8)
    try { $manifest = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
    if ($manifest.schema -ne 1 -or $manifest.version -cne '@VERSION@' -or $manifest.baseVersion -cne '0.4.3' -or !$manifest.files.Count) { throw '更新清单版本不匹配。' }
    $existing = [IO.Directory]::Exists($final)
    if (!$existing) {
        $source = Get-BasePackage $manifest.files
        $isFolder = [IO.Directory]::Exists($source)
        if ($isFolder) {
            $package = Get-Content -LiteralPath (Join-Path $source 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
            if ($package.name -cne '@luma/dsh-plugin' -or $package.version -cnotin $compatibleBaseVersions) { throw "请选择含 package.json 的完整 Luma 插件目录，支持版本 $($compatibleBaseVersions -join '、')。" }
        } else {
            if ((Hash-File $source) -cne $oldDigest) { throw "0.4.3 基础 ZIP 校验失败：$source" }
            $archive = [IO.Compression.ZipFile]::OpenRead($source)
        }
        $stage = Join-Path $root ('.luma-stage-' + [guid]::NewGuid().ToString('N'))
        [IO.Directory]::CreateDirectory($stage) | Out-Null
    } elseif (([IO.DirectoryInfo]::new($final).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "目标不能是链接目录：$final"
    }
    $paths = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($row in $manifest.files) {
        if (($paths.Count % 100) -eq 0) {
            Write-Progress -Activity '正在校验 Luma 插件' -Status "$($paths.Count) / $($manifest.files.Count)" -PercentComplete ([int](100*$paths.Count/$manifest.files.Count))
        }
        $key = [string]$row.path
        if (!$key -or $key -match '(^|/)\.{1,2}(/|$)|^/|//|[:\\]|/$' -or !$paths.Add($key) -or $row.sha256 -cnotmatch '^[0-9a-f]{64}$' -or $row.source -notin @('base','patch')) { throw "无效的更新清单路径：$key" }
        $relative = $key.Replace('/','\')
        if ($existing) { Check-File ([IO.Path]::Combine($final,$relative)) $row; continue }
        $target = [IO.Path]::Combine($stage,$relative)
        [IO.Directory]::CreateDirectory((Extended ([IO.Path]::GetDirectoryName($target)))) | Out-Null
        if ($row.source -eq 'base' -and $isFolder) {
            [IO.File]::Copy((Extended ([IO.Path]::Combine($source,$relative))), (Extended $target))
        } else {
            if ($row.source -eq 'patch') { $entry = $delta.GetEntry('payload/' + $key) } else { $entry = $archive.GetEntry('DesktopPlugin-0.4.3/' + $key) }
            if (!$entry -or $entry.Length -ne $row.bytes) { throw "资源缺少或长度不符：$key" }
            [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, (Extended $target), $false)
        }
        Check-File $target $row
    }
    Write-Progress -Activity '正在校验 Luma 插件' -Completed
    if ($existing) {
        $count = ([IO.Directory]::GetFiles((Extended $final),'*',[IO.SearchOption]::AllDirectories)).Length
        if ($count -ne $paths.Count) { throw "现有 $final 含清单外的文件。可通过 -Directory 选择新目录。" }
    } else {
        [IO.Directory]::Move($stage,$final)
        $stage = $null
    }
} finally {
    if ($archive) { $archive.Dispose() }
    $delta.Dispose()
    if ($stage) {
        $stage = [IO.Path]::GetFullPath($stage)
        if ([IO.Path]::GetDirectoryName($stage) -ieq $root -and [IO.Path]::GetFileName($stage) -match '^\.luma-stage-[0-9a-f]{32}$' -and [IO.Directory]::Exists($stage)) {
            [IO.Directory]::Delete((Extended $stage),$true)
        }
    }
}
Write-Host "已校验全部 $($paths.Count) 个文件：$final"
Register-Plugin $final
