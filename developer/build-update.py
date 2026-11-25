"""Build the desktop updater from the published v0.4.3 ZIP and a verified plugin directory."""
import argparse
import hashlib
import json
import os
import shutil
import tempfile
import zipfile
from pathlib import Path

BASE = "0.4.3"
VERSION = json.loads((Path(__file__).parent / "modules/luma-dsh-plugin/native-desktop/manifest.json").read_text(encoding="utf-8"))["version"]
BASE_SHA256 = "e949d369a89da2bf6ce01c2eabef4b8a3a95ced38db5ab625ea90c2bb0549c81"
PATCH = f"Luma-DSH-{VERSION}-Update.zip"


def digest(stream):
    sha = hashlib.sha256()
    for block in iter(lambda: stream.read(1024 * 1024), b""):
        sha.update(block)
    return sha.hexdigest()


def archive_entry(archive, name, data):
    info = zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0))
    info.create_system = 0
    info.compress_type = zipfile.ZIP_DEFLATED
    with archive.open(info, "w") as out:
        if isinstance(data, bytes):
            out.write(data)
        else:
            shutil.copyfileobj(data, out, 1024 * 1024)


def write_checksum(path):
    with path.open("rb") as stream:
        sha = digest(stream)
    path.with_name(path.name + ".sha256").write_bytes(f"{sha}  {path.name}\n".encode("ascii"))
    return sha


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("base", type=Path)
    parser.add_argument("target", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    with args.base.open("rb") as stream:
        if digest(stream) != BASE_SHA256:
            raise SystemExit("The v0.4.3 base ZIP does not match its published SHA-256.")
    metadata = json.loads((args.target / "package.json").read_text(encoding="utf-8"))
    if (metadata["name"], metadata["version"]) != ("@luma/dsh-plugin", VERSION):
        raise SystemExit(f"The target must be the v{VERSION} DSH desktop package.")
    if args.output.resolve().is_relative_to(args.target.resolve()):
        raise SystemExit("The output must be outside the package.")
    args.output.mkdir(parents=True, exist_ok=True)
    for name in ("LICENSE.md", "THIRD_PARTY_NOTICES.md"):
        if not (args.target / name).is_file():
            raise SystemExit(f"Missing distribution notice: {name}")
    with tempfile.TemporaryDirectory(dir=args.output) as temporary:
        stage = Path(temporary)
        build(args.base, args.target, stage)
        for file in stage.iterdir():
            os.replace(file, args.output / file.name)


def build(base_zip, target, output):
    patch_path = output / PATCH
    rows = []
    with zipfile.ZipFile(base_zip) as base, zipfile.ZipFile(patch_path, "w") as patch:
        for path in sorted(target.rglob("*")):
            if path.is_symlink() or (hasattr(path, "is_junction") and path.is_junction()):
                raise SystemExit(f"Unexpected linked package entry: {path}")
            if not path.is_file():
                continue
            key = path.relative_to(target).as_posix()
            with path.open("rb") as stream:
                sha = digest(stream)
            size = path.stat().st_size
            unchanged = False
            try:
                old = base.getinfo(f"DesktopPlugin-{BASE}/{key}")
            except KeyError:
                old = None
            if old and old.file_size == size:
                with base.open(old) as stream:
                    unchanged = digest(stream) == sha
            if not unchanged:
                with path.open("rb") as stream:
                    archive_entry(patch, "payload/" + key, stream)
            rows.append({"path": key, "bytes": size, "sha256": sha, "source": "base" if unchanged else "patch"})
        manifest = {"schema": 1, "baseVersion": BASE, "version": VERSION, "files": rows}
        archive_entry(patch, "update.json", json.dumps(manifest, ensure_ascii=False, separators=(",", ":")).encode())
    patch_hash = write_checksum(patch_path)
    template = Path(__file__).with_name("Install-Update.template.ps1").read_text(encoding="utf-8")
    if template.count("@PATCH_SHA256@") != 1 or "@VERSION@" not in template:
        raise SystemExit("Missing installer hash or version marker.")
    installer = output / "Get-Luma-DSH.ps1"
    installer.write_bytes(template.replace("@PATCH_SHA256@", patch_hash).replace("@VERSION@", VERSION).encode("utf-8-sig"))
    launcher = (b'@echo off\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Get-Luma-DSH.ps1" %*\r\n'
                b'set "LUMA_INSTALL_RESULT=%ERRORLEVEL%"\r\npause\r\nexit /b %LUMA_INSTALL_RESULT%\r\n')
    bootstrap = output / f"Luma-DSH-{VERSION}-Installer.zip"
    with zipfile.ZipFile(bootstrap, "w") as bundle:
        archive_entry(bundle, "Install-Luma-DSH.cmd", launcher)
        archive_entry(bundle, installer.name, installer.read_bytes())
        for name in ("LICENSE.md", "THIRD_PARTY_NOTICES.md"):
            archive_entry(bundle, name, (target / name).read_bytes())
        guide = (f"Luma DSH {VERSION} · Windows x64\r\n\r\n"
                 "解压本文件夹，打开过一次 DeepSeek Harness 后，双击 Install-Luma-DSH.cmd。\r\n"
                 "安装器会优先复用本机已安装的基础资源。首次安装可能需要从公开 GitHub 发行页下载约 1.87 GB 的基础包及本版更新。"
                 "网络中断后可重新运行。请保留 Downloads 目录以续传。\r\n"
                 f"离线升级时将 {PATCH} 放在脚本旁边，保留旧插件目录或 0.4.3 官方完整 ZIP。\r\n"
                 "回退到升级前的插件可运行 Install-Luma-DSH.cmd -Rollback。更换过自定义安装目录时，请同时传入原 -Directory。\r\n"
                 "安装及回退完成后重新打开 DSH，从侧栏进入 Luma 办公室。\r\n\r\n"
                 "官方仓库 https://github.com/myflww/luma-dsh-plugin\r\n")
        archive_entry(bundle, "安装说明.txt", guide.encode("utf-8-sig"))
    installer_sha = write_checksum(bootstrap)
    print(json.dumps({"files": len(rows), "changed": sum(row["source"] == "patch" for row in rows),
                      "patchBytes": patch_path.stat().st_size, "sha256": patch_hash,
                      "installerBytes": bootstrap.stat().st_size, "installerSha256": installer_sha}))


if __name__ == "__main__":
    main()
