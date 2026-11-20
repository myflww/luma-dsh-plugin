[CmdletBinding()]
param(
    [string]$Directory = (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Luma-DSH'),
    [string]$Base,
    [string]$Patch,
    [switch]$PrepareOnly,
    [string]$DshCli
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$repo = 'myflww/luma-dsh-plugin'
$patchName = 'Luma-DSH-0.5.0-Update.zip'
$patchDigest = '@PATCH_SHA256@'
$oldZip = 'Luma-DSH-0.4.3-Windows.zip'
$oldDigest = 'e949d369a89da2bf6ce01c2eabef4b8a3a95ced38db5ab625ea90c2bb0549c81'
$root = [IO.Directory]::CreateDirectory([IO.Path]::GetFullPath($Directory)).FullName
$final = Join-Path $root 'DesktopPlugin-0.5.0'
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
function Get-PrivateAsset([string]$tag, [string]$name, [string]$destination) {
    [IO.Directory]::CreateDirectory($destination) | Out-Null
    if (!(Get-Command gh -ErrorAction SilentlyContinue)) { throw "请通过有权限的 GitHub 账号下载 $name 到 $destination，或安装 GitHub CLI 并登录后重试。" }
    Write-Host "正在从私有发布 $tag 下载 $name …"
    $mode = if ($name.Contains('?')) { '--skip-existing' } else { '--clobber' }
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        $previous = $ErrorActionPreference
        try {
            $ErrorActionPreference = 'Continue'
            & gh release download $tag --repo $repo --pattern $name --dir $destination $mode 2>$null
            if ($LASTEXITCODE -eq 0) { return }
        } finally { $ErrorActionPreference = $previous }
        if ($attempt -lt 3) { Start-Sleep -Seconds (2*$attempt) }
    }
    throw "未能下载 $tag 的 $name。请检查 GitHub 私有仓库访问权限与网络后重试。"
}
function Get-BasePackage {
    if ($Base) { return (Get-Item -LiteralPath $Base).FullName }
    foreach ($directory in @($root, $PSScriptRoot, $cache)) {
        foreach ($name in @('DesktopPlugin-0.4.3', $oldZip)) {
            $candidate = Join-Path $directory $name
            if (Test-Path -LiteralPath $candidate) { return (Get-Item -LiteralPath $candidate).FullName }
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
        if (!(Test-Path -LiteralPath $index) -or (Hash-File $index) -cne '14ceb1d555eb59546105f3b34601743f080ff1822a8cb11d53ba71c7d1e0cc35') { Get-PrivateAsset 'v0.4.3' 'parts.json' $oldCache }
        if ((Hash-File $index) -cne '14ceb1d555eb59546105f3b34601743f080ff1822a8cb11d53ba71c7d1e0cc35') { throw "基础包分卷清单校验失败：$index" }
        $parts = (Get-Content -LiteralPath $index -Raw -Encoding UTF8 | ConvertFrom-Json).parts
        if (@($parts | Where-Object { !(Test-Path -LiteralPath (Join-Path $oldCache $_.name) -PathType Leaf) }).Count) {
            Write-Host '首次安装需要下载约 1.87 GB 的基础包。中断后可重新运行，已完成的分卷将被复用。'
            Get-PrivateAsset 'v0.4.3' "$oldZip.???" $oldCache
        }
        $partial = Join-Path $oldCache ('.joining-' + [guid]::NewGuid().ToString('N'))
        $output = [IO.File]::Open($partial,'CreateNew','Write','None')
        try {
            foreach ($part in $parts) {
                $path = Join-Path $oldCache $part.name
                $partInfo = [IO.FileInfo]::new($path)
                if (!$partInfo.Exists -or $partInfo.Length -ne $part.size -or (Hash-File $path) -cne $part.sha256) {
                    Write-Host "正在补齐分卷 $($part.name)"
                    Get-PrivateAsset 'v0.4.3' $part.name $oldCache
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
function Register-Plugin {
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
    if (!$cli) { throw "插件已准备好。请在 DSH 插件页添加 $final，或使用 -DshCli 参数指定桌面安装目录中的 resources\runtime\cli\bin\dsh.cmd。" }
    $version = (& $cli --version | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or !$version) { throw "DSH CLI 无法启动。可从桌面插件页添加已验证的目录 $final。" }
    if ($version -ne '0.2.2-rc.1') { Write-Host "当前 DSH 版本为 $version；本插件已在 0.2.2-rc.1 验证，将通过当前 DSH 的插件命令安装。" }
    & $cli plugin --profile desktop add $final
    if ($LASTEXITCODE -ne 0) { throw "DSH 未完成安装，可从插件页添加已验证的目录 $final。" }
    Write-Host '已添加到桌面 DSH。重新打开 DSH 后，从侧栏进入 Luma 办公室。'
}
if (!$Patch) {
    $Patch = Join-Path $PSScriptRoot $patchName
    if (!(Test-Path -LiteralPath $Patch -PathType Leaf)) {
        $Patch = Join-Path $cache $patchName
        if (!(Test-Path -LiteralPath $Patch -PathType Leaf) -or (Hash-File $Patch) -cne $patchDigest) { Get-PrivateAsset 'v0.5.0' $patchName $cache }
    }
}
$Patch = (Get-Item -LiteralPath $Patch).FullName
if ((Hash-File $Patch) -cne $patchDigest) { throw "0.5.0 更新包 SHA-256 校验失败：$Patch" }
$delta = [IO.Compression.ZipFile]::OpenRead($Patch)
$archive = $null
$stage = $null
try {
    $reader = [IO.StreamReader]::new($delta.GetEntry('update.json').Open(), [Text.Encoding]::UTF8)
    try { $manifest = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
    if ($manifest.schema -ne 1 -or $manifest.version -cne '0.5.0' -or $manifest.baseVersion -cne '0.4.3' -or !$manifest.files.Count) { throw '更新清单版本不匹配。' }
    $existing = [IO.Directory]::Exists($final)
    if (!$existing) {
        $source = Get-BasePackage
        $isFolder = [IO.Directory]::Exists($source)
        if ($isFolder) {
            $package = Get-Content -LiteralPath (Join-Path $source 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
            if ($package.name -cne '@luma/dsh-plugin' -or $package.version -cne '0.4.3') { throw '请指定含 package.json 的 DesktopPlugin-0.4.3 目录。' }
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
Register-Plugin
