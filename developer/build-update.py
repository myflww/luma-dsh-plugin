"""Build the v0.5.0 Windows updater from the published v0.4.3 ZIP and a verified plugin directory."""
import argparse
import hashlib
import json
import shutil
import zipfile
from pathlib import Path

BASE = "0.4.3"
VERSION = "0.5.0"
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
        raise SystemExit("The target must be the v0.5.0 DSH desktop package.")
    if args.output.resolve().is_relative_to(args.target.resolve()):
        raise SystemExit("The output must be outside the package.")
    args.output.mkdir(parents=True, exist_ok=True)
    patch_path = args.output / PATCH
    rows = []
    with zipfile.ZipFile(args.base) as base, zipfile.ZipFile(patch_path, "w") as patch:
        for path in sorted(args.target.rglob("*")):
            if path.is_symlink() or (hasattr(path, "is_junction") and path.is_junction()):
                raise SystemExit(f"Unexpected linked package entry: {path}")
            if not path.is_file():
                continue
            key = path.relative_to(args.target).as_posix()
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
    with patch_path.open("rb") as stream:
        patch_hash = digest(stream)
    template = Path(__file__).with_name("Install-Update.template.ps1").read_text(encoding="utf-8")
    if template.count("@PATCH_SHA256@") != 1:
        raise SystemExit("Missing installer hash marker.")
    installer = args.output / "Get-Luma-DSH.ps1"
    installer.write_bytes(template.replace("@PATCH_SHA256@", patch_hash).encode("utf-8-sig"))
    (args.output / (PATCH + ".sha256")).write_bytes(f"{patch_hash}  {PATCH}\n".encode("ascii"))
    launcher = (b'@echo off\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Get-Luma-DSH.ps1"\r\n'
                b'set "LUMA_INSTALL_RESULT=%ERRORLEVEL%"\r\npause\r\nexit /b %LUMA_INSTALL_RESULT%\r\n')
    with zipfile.ZipFile(args.output / f"Luma-DSH-{VERSION}-Installer.zip", "w") as bundle:
        archive_entry(bundle, "Install-Luma-DSH.cmd", launcher)
        archive_entry(bundle, installer.name, installer.read_bytes())
        with patch_path.open("rb") as stream:
            archive_entry(bundle, PATCH, stream)
    print(json.dumps({"files": len(rows), "changed": sum(row["source"] == "patch" for row in rows),
                      "patchBytes": patch_path.stat().st_size, "sha256": patch_hash}))


if __name__ == "__main__":
    main()
